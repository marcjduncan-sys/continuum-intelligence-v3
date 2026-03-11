-- Phase 9: Proactive Insights -- notifications table
--
-- Stores insight notifications generated when fresh research data materially
-- confirms or contradicts a stored user memory. A 7-day re-notification guard
-- (last_notified_at) prevents spamming the same memory.

CREATE TABLE IF NOT EXISTS notifications (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID REFERENCES users(id) ON DELETE CASCADE,
    guest_id         TEXT,
    memory_id        UUID REFERENCES memories(id) ON DELETE CASCADE,
    ticker           TEXT NOT NULL,
    signal           TEXT NOT NULL CHECK (signal IN ('confirms', 'contradicts')),
    summary          TEXT NOT NULL,
    dismissed        BOOLEAN NOT NULL DEFAULT FALSE,
    seen             BOOLEAN NOT NULL DEFAULT FALSE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_notified_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user
    ON notifications(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_guest
    ON notifications(guest_id) WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_memory
    ON notifications(memory_id);
