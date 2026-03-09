-- Rolling summarisation columns for conversations
ALTER TABLE conversations
    ADD COLUMN IF NOT EXISTS summary TEXT,
    ADD COLUMN IF NOT EXISTS summary_cursor_message_id UUID REFERENCES messages(id);
