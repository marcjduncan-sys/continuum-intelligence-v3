import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTier } from '@/lib/tier'
import { Topbar } from '@/components/layout/Topbar'
import { Sidebar } from '@/components/layout/Sidebar'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const tier = await getTier()

  return (
    <>
      <Topbar />
      <div className="app-body">
        <Sidebar tier={tier} />
        <main className="app-main">{children}</main>
      </div>
      <style>{`
        .app-body {
          display: flex;
          min-height: calc(100vh - 56px);
        }
        .app-main {
          flex: 1;
          overflow: auto;
          padding: var(--space-xl);
          background: var(--bg-page);
        }
      `}</style>
    </>
  )
}
