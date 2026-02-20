import { currentUser } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function AccountPage() {
  const user = await currentUser()
  if (!user) redirect('/sign-in')

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Account</h1>
      <p>Email: {user.emailAddresses[0]?.emailAddress}</p>
    </main>
  )
}
