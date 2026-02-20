import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getTier } from '@/lib/tier'
import { ChatPanel } from '@/components/chat'

export default async function ChatPage() {
  const { userId } = await auth()
  if (!userId) redirect('/sign-in')

  const tier = await getTier()
  if (tier !== 'pro') redirect('/pricing')

  return <ChatPanel />
}
