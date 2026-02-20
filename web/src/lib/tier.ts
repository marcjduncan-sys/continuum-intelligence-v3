import { auth } from '@clerk/nextjs/server'

export type Tier = 'free' | 'pro'

export async function getTier(): Promise<Tier> {
  const { sessionClaims } = await auth()
  const role = (sessionClaims?.publicMetadata as { role?: string } | null)?.role
  return role === 'pro' ? 'pro' : 'free'
}

export function isProTier(tier: Tier): boolean {
  return tier === 'pro'
}
