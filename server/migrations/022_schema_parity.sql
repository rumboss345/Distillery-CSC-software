-- Step 1A schema parity: align PostgreSQL with browser sql.js columns used by server handlers.

ALTER TABLE mat_transactions ADD COLUMN IF NOT EXISTS cost_unit TEXT;
