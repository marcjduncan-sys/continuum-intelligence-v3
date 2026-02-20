import { auth, currentUser } from '@clerk/nextjs/server'
import type { UserRole } from '@/types/user'

/**
 * Get the current user's role from Clerk session claims.
 * Reads from JWT publicMetadata — no database round-trip.
 */
export async function getCurrentUserRole(): Promise<UserRole> {
  const { sessionClaims } = await auth()
  const role = (sessionClaims?.publicMetadata as { role?: string } | null)?.role
  return role === 'pro' ? 'pro' : 'free'
}

/**
 * Get the current authenticated user ID or null.
 */
export async function getCurrentUserId(): Promise<string | null> {
  const { userId } = await auth()
  return userId
}

/**
 * Require authentication — throws redirect to /sign-in if not authenticated.
 * Use in Server Components and API routes.
 */
export async function requireAuth(): Promise<string> {
  const { userId } = await auth()
  if (!userId) {
    throw new Error('UNAUTHENTICATED')
  }
  return userId
}

/**
 * Require professional tier — throws if user is free tier.
 */
export async function requirePro(): Promise<void> {
  const role = await getCurrentUserRole()
  if (role !== 'pro') {
    throw new Error('PRO_REQUIRED')
  }
}

/**
 * Get full Clerk user object. Returns null if not authenticated.
 */
export async function getAuthUser() {
  return currentUser()
}
