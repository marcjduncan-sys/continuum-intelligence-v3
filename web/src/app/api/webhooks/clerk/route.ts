import { Webhook } from 'svix'
import { headers } from 'next/headers'
import { prisma } from '@/lib/prisma'

type ClerkUserCreatedEvent = {
  type: 'user.created' | 'user.updated'
  data: {
    id: string
    email_addresses: Array<{
      email_address: string
      id: string
    }>
    primary_email_address_id: string
    public_metadata: {
      role?: string
    }
  }
}

type ClerkUserDeletedEvent = {
  type: 'user.deleted'
  data: {
    id: string
    deleted: boolean
  }
}

type ClerkWebhookEvent = ClerkUserCreatedEvent | ClerkUserDeletedEvent

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET

  if (!WEBHOOK_SECRET) {
    console.error('CLERK_WEBHOOK_SECRET is not set')
    return Response.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  // Verify the webhook signature
  const headerPayload = await headers()
  const svixId = headerPayload.get('svix-id')
  const svixTimestamp = headerPayload.get('svix-timestamp')
  const svixSignature = headerPayload.get('svix-signature')

  if (!svixId || !svixTimestamp || !svixSignature) {
    return Response.json({ error: 'Missing svix headers' }, { status: 400 })
  }

  const payload = await req.text()

  const wh = new Webhook(WEBHOOK_SECRET)
  let event: ClerkWebhookEvent

  try {
    event = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as ClerkWebhookEvent
  } catch (err) {
    console.error('Clerk webhook verification failed:', err)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  // Handle events
  switch (event.type) {
    case 'user.created': {
      const { id, email_addresses, primary_email_address_id, public_metadata } = event.data
      const primaryEmail = email_addresses.find(e => e.id === primary_email_address_id)

      if (!primaryEmail) {
        console.error('No primary email for user', id)
        break
      }

      await prisma.user.upsert({
        where: { id },
        create: {
          id,
          email: primaryEmail.email_address,
          role: (public_metadata?.role as string) || 'free',
        },
        update: {
          email: primaryEmail.email_address,
        },
      })

      // Audit log
      await prisma.auditLog.create({
        data: {
          userId: id,
          action: 'user.created',
        },
      })

      console.log('Provisioned user:', id)
      break
    }

    case 'user.updated': {
      const { id, email_addresses, primary_email_address_id, public_metadata } = event.data
      const primaryEmail = email_addresses.find(e => e.id === primary_email_address_id)

      if (!primaryEmail) break

      await prisma.user.upsert({
        where: { id },
        create: {
          id,
          email: primaryEmail.email_address,
          role: (public_metadata?.role as string) || 'free',
        },
        update: {
          email: primaryEmail.email_address,
          role: (public_metadata?.role as string) || 'free',
        },
      })
      break
    }

    case 'user.deleted': {
      const { id } = event.data
      // Soft delete: audit logs use SetNull on user deletion
      await prisma.user.delete({ where: { id } }).catch(() => {
        // User may not exist in DB if webhook fires before user.created processed
      })
      break
    }

    default:
      // Unknown event type — ignore
      break
  }

  return Response.json({ received: true })
}
