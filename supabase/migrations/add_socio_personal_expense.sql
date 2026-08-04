-- Flag Expenses paid with the company card for a sócio's personal use, and
-- track whether that sócio has redistributed the other sócios' ownership
-- share back to them. Distinct from transferencia_feita, which tracks
-- guide/chef/driver expense reimbursement and is unrelated to partners.

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS socio_pessoal              TEXT,
  ADD COLUMN IF NOT EXISTS socio_transferencia_feita  BOOLEAN DEFAULT FALSE;
