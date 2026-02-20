import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function AppHomePage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  return (
    <main style={{ padding: '2rem' }}>
      <h1>Research Dashboard</h1>
      <p>Stock coverage coming soon.</p>
    </main>
  )
}
