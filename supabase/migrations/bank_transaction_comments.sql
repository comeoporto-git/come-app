-- Free-text comment thread on bank transactions (reconciliation page).
-- Keyed on transaction_id (the stable bank reference) so comments survive
-- re-syncs; cascades when the bank transaction itself is deleted.
-- Also created lazily by addBankTransactionComment() in src/lib/enablebanking.ts.

CREATE TABLE IF NOT EXISTS bank_transaction_comments (
  id              SERIAL PRIMARY KEY,
  transaction_id  TEXT NOT NULL REFERENCES bank_transactions(transaction_id) ON DELETE CASCADE,
  author_email    TEXT NOT NULL,
  author_name     TEXT,
  body            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bank_transaction_comments_txn_idx
  ON bank_transaction_comments (transaction_id, created_at);

ALTER TABLE bank_transaction_comments ENABLE ROW LEVEL SECURITY;
