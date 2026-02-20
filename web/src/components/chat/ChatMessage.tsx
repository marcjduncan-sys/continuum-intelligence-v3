interface ChatMessageProps {
  role: 'user' | 'assistant'
  content: string
}

export function ChatMessage({ role, content }: ChatMessageProps) {
  return (
    <>
      <div className={`message message-${role}`}>
        <div className="message-role">{role === 'user' ? 'You' : 'Analyst'}</div>
        <div className="message-content">{content}</div>
      </div>
      <style>{`
        .message { padding: var(--space-md); border-radius: 8px; }
        .message-user { background: var(--bg-elevated); margin-left: var(--space-2xl); }
        .message-assistant { background: var(--bg-surface); border: 1px solid var(--border); margin-right: var(--space-2xl); }
        .message-role { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-muted); margin-bottom: var(--space-xs); }
        .message-assistant .message-role { color: var(--accent-teal); }
        .message-content { font-size: 14px; line-height: 1.65; color: var(--text-primary); white-space: pre-wrap; }
      `}</style>
    </>
  )
}
