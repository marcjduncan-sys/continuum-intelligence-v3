import Stripe from 'stripe'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { clerkClient } from '@clerk/nextjs/server'
import { headers } from 'next/headers'

export async function POST(req: Request) {
  const sig = (await headers()).get('stripe-signature')

  if (!sig) {
    return Response.json({ error: 'Missing stripe-signature header' }, { status: 400 })
  }

  const rawBody = await req.text()
  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      rawBody,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    console.error('Stripe webhook signature verification failed:', err)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session
      const clerkUserId = session.metadata?.clerkUserId

      if (!clerkUserId) {
        console.error('checkout.session.completed: missing clerkUserId in metadata')
        break
      }

      // 1. Update Prisma
      await prisma.user.update({
        where: { id: clerkUserId },
        data: { role: 'pro' },
      })

      // 2. Update Clerk publicMetadata (JWT will reflect on next token refresh)
      const clerk = await clerkClient()
      await clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { role: 'pro' },
      })

      // 3. Audit
      await prisma.auditLog.create({
        data: {
          userId: clerkUserId,
          action: 'upgrade',
          metadata: { stripeSessionId: session.id },
        },
      })

      console.log(`User ${clerkUserId} upgraded to pro`)
      break
    }

    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription
      const customerId = sub.customer as string

      const customer = await stripe.customers.retrieve(customerId)
      if (customer.deleted) break

      const clerkUserId = (customer as Stripe.Customer).metadata?.clerkUserId
      if (!clerkUserId) break

      // Downgrade
      await prisma.user.update({
        where: { id: clerkUserId },
        data: { role: 'free' },
      })

      const clerk = await clerkClient()
      await clerk.users.updateUserMetadata(clerkUserId, {
        publicMetadata: { role: 'free' },
      })

      await prisma.auditLog.create({
        data: {
          userId: clerkUserId,
          action: 'downgrade',
          metadata: { stripeSubscriptionId: sub.id },
        },
      })

      console.log(`User ${clerkUserId} downgraded to free`)
      break
    }

    case 'invoice.payment_failed': {
      const invoice = event.data.object as Stripe.Invoice
      // Log payment failure for monitoring; grace period handled by Stripe
      console.warn('Payment failed for customer:', invoice.customer)
      await prisma.auditLog.create({
        data: {
          action: 'payment_failed',
          metadata: {
            customerId: typeof invoice.customer === 'string' ? invoice.customer : (invoice.customer as Stripe.Customer | null)?.id ?? null,
            invoiceId: invoice.id,
          },
        },
      })
      break
    }

    default:
      // Unhandled event type — safe to ignore
      break
  }

  return Response.json({ received: true })
}
