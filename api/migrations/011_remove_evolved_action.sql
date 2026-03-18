-- Remove 'evolved' from memory_consolidation_events action constraint.
-- The 'evolved' action was never implemented in batch_analysis.py.
-- Removing it eliminates a misleading schema stub.
--
-- PostgreSQL does not support ALTER TABLE ... DROP CONSTRAINT ... ADD CONSTRAINT
-- on a CHECK in a single statement on older versions. Use the drop/add pattern.

ALTER TABLE memory_consolidation_events
    DROP CONSTRAINT IF EXISTS memory_consolidation_events_action_check;

ALTER TABLE memory_consolidation_events
    ADD CONSTRAINT memory_consolidation_events_action_check
    CHECK (action IN ('merged', 'retired'));
