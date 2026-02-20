export type UserRole = 'free' | 'pro'

export interface UserProfile {
  id: string
  email: string
  role: UserRole
  stripeCustomerId?: string
  createdAt: Date
}

export interface ClerkPublicMetadata {
  role?: UserRole
}
