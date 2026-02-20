import Link from 'next/link'

export default function LandingPage() {
  return (
    <main style={{ padding: '2rem', textAlign: 'center' }}>
      <h1>Continuum Intelligence</h1>
      <p>AI-powered equity research platform</p>
      <Link href="/sign-in">Sign In</Link>
      {' | '}
      <Link href="/sign-up">Sign Up</Link>
    </main>
  )
}
