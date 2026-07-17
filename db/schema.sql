-- Reconciliation bot — exception log schema (PLAN.md section 6).
-- Runs against the same Postgres instance as n8n, separate concern.
-- The UNIQUE constraint on exceptions is the idempotency key: re-running the
-- same night upserts against it instead of creating duplicates.

CREATE TABLE IF NOT EXISTS runs (
  id               SERIAL PRIMARY KEY,
  started_at       TIMESTAMPTZ NOT NULL,
  window_start     TIMESTAMPTZ NOT NULL,
  window_end       TIMESTAMPTZ NOT NULL,
  payments_fetched INT,
  deals_fetched    INT,
  matched          INT,
  exceptions       INT,
  status           TEXT,        -- 'ok' | 'partial' | 'failed'
  error            TEXT,
  CONSTRAINT runs_status_chk
    CHECK (status IS NULL OR status IN ('ok', 'partial', 'failed'))
);

CREATE TABLE IF NOT EXISTS exceptions (
  id             SERIAL PRIMARY KEY,
  run_id         INT REFERENCES runs(id),
  exception_type TEXT NOT NULL,
  charge_id      TEXT,
  deal_id        TEXT,
  email          TEXT,
  amount         NUMERIC(12,2),
  confidence     INT,
  detail         JSONB,
  first_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved       BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT exceptions_type_chk CHECK (exception_type IN (
    'PAYMENT_NO_DEAL',
    'DEAL_NO_PAYMENT',
    'AMOUNT_MISMATCH',
    'DUPLICATE_CHARGE',
    'ORPHAN_REFUND'
  )),
  -- THE IDEMPOTENCY KEY. Everything upserts against this.
  UNIQUE (exception_type, charge_id, deal_id)
);

CREATE INDEX IF NOT EXISTS exceptions_run_id_idx   ON exceptions (run_id);
CREATE INDEX IF NOT EXISTS exceptions_resolved_idx ON exceptions (resolved);
CREATE INDEX IF NOT EXISTS exceptions_email_idx    ON exceptions (email);

-- Recommendation #2: log the clean matches too, so a run is fully auditable.
CREATE TABLE IF NOT EXISTS matches (
  id         SERIAL PRIMARY KEY,
  run_id     INT REFERENCES runs(id),
  charge_id  TEXT,
  deal_id    TEXT,
  confidence INT,
  reasons    JSONB
);

CREATE INDEX IF NOT EXISTS matches_run_id_idx ON matches (run_id);
