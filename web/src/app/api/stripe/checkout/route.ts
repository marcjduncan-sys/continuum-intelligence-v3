import { auth, currentUser } from '@clerk/nextjs/server'
import { stripe } from '@/lib/stripe'
import { prisma } from '@/lib/prisma'
import { z } from 'zod'

const CheckoutSchema = z.object({
  priceId: z.string().min(1),
})

export async function POST(req: Request) {
  const { userId } = await auth()
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return Response.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const parsed = CheckoutSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'Invalid priceId' }, { status: 400 })
  }

  const { priceId } = parsed.data

  // Get or create Stripe customer linked to this Clerk user
  let user = await prisma.user.findUnique({ where: { id: userId } })
  let customerId = user?.stripeCustomerId ?? null

  if (!customerId) {
    const clerkUser = await currentUser()
    const email = clerkUser?.emailAddresses[0]?.emailAddress

    const customer = await stripe.customers.create({
      email,
      metadata: { clerkUserId: userId },
    })
    customerId = customer.id

    // Upsert user with stripeCustomerId
    await prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: email ?? '',
        stripeCustomerId: customerId,
      },
      update: { stripeCustomerId: customerId },
    })
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/account?upgraded=1`,
    cancel_url: `${appUrl}/pricing`,
    metadata: { clerkUserId: userId },
    allow_promotion_codes: true,
  })

  return Response.json({ url: session.url })
}
