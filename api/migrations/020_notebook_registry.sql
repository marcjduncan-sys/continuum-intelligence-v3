-- Migration 020: Notebook registry (replaces notebooklm-notebooks.json).
-- Stores NotebookLM notebook IDs per ticker with provisioning status.
-- Seeded from the existing JSON file entries with status 'manual'.

CREATE TABLE IF NOT EXISTS notebook_registry (
    id            SERIAL PRIMARY KEY,
    ticker        VARCHAR(20) NOT NULL UNIQUE,
    notebook_id   VARCHAR(200),
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    company_name  VARCHAR(200),
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_nr_ticker ON notebook_registry (ticker);
CREATE INDEX IF NOT EXISTS idx_nr_status ON notebook_registry (status);

-- Seed from existing JSON entries (idempotent)
INSERT INTO notebook_registry (ticker, notebook_id, status, created_at, updated_at) VALUES
    ('AMC', 'a6daaef6-4053-45f5-966b-5a8f6a7791b8', 'manual', NOW(), NOW()),
    ('ASB', 'ae11a73a-47cd-432b-8e02-6212d344b501', 'manual', NOW(), NOW()),
    ('ASX', '62589a28-c3a6-4b65-b737-266a6d4394e3', 'manual', NOW(), NOW()),
    ('CBA', '9d272dac-f647-4383-9285-8ed108cb7b14', 'manual', NOW(), NOW()),
    ('CSL', 'b86b10e6-2aeb-4db1-aa88-29fb418efd24', 'manual', NOW(), NOW()),
    ('DRO', '5840a374-b80e-46c7-a978-18d9e0c9589d', 'manual', NOW(), NOW()),
    ('DXS', '7cd23884-c4f8-4fac-9fe7-38040d51eaed', 'manual', NOW(), NOW()),
    ('FMG', '401ca203-cb00-4df0-a9d6-f77ecb8201d6', 'manual', NOW(), NOW()),
    ('GMG', '5257896b-2d0f-430c-8362-a4b0492551cf', 'manual', NOW(), NOW()),
    ('GYG', '04d1166e-b6a3-4621-a672-6462afcf5534', 'manual', NOW(), NOW()),
    ('HRZ', 'd6367ee7-3069-4c95-b092-0346eea04e1f', 'manual', NOW(), NOW()),
    ('MQG', '8e919650-e744-4d70-8179-56c063c7808d', 'manual', NOW(), NOW()),
    ('NAB', '2acfdbde-6c93-4fc3-bf97-06ad3a190b47', 'manual', NOW(), NOW()),
    ('OBM', '72e4ccf0-e062-4e01-ba0f-0ce935358ff1', 'manual', NOW(), NOW()),
    ('PME', 'a9c53a16-0ebf-4293-8efa-e7223deec761', 'manual', NOW(), NOW()),
    ('SIG', 'c3681817-3e32-4d44-9d93-2cb959313487', 'manual', NOW(), NOW()),
    ('WDS', 'c2dcda66-e7e0-4d3a-9ba1-5e529b001632', 'manual', NOW(), NOW()),
    ('WIA', '3551536b-a14e-4eab-9b6f-68be4d697e37', 'manual', NOW(), NOW()),
    ('WOR', 'bce14ba4-ac6e-4ae8-b1ef-171a94bcae3b', 'manual', NOW(), NOW()),
    ('WOW', '3e782839-e73c-4e2b-81c9-55d25e352135', 'manual', NOW(), NOW()),
    ('WTC', '357a1146-29d1-4b64-8e9a-6febe5ec0678', 'manual', NOW(), NOW()),
    ('XRO', 'b9ecf91f-ba4a-4b03-a1ed-6a6184caeb9a', 'manual', NOW(), NOW())
ON CONFLICT (ticker) DO NOTHING;
