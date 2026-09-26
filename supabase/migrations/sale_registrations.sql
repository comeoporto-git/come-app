-- Participant registrations for event services (services.type = 'Evento').
-- One row per attendee of a specific sale, mirroring the "Participantes"
-- spreadsheet used for events: ticket type (paid ticket vs. invitation),
-- payment status/method/date, whether the invoice was sent, and dietary
-- restrictions (which the chef needs to see).

CREATE TABLE IF NOT EXISTS sale_registrations (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id              UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  sort_order           INTEGER NOT NULL DEFAULT 0,
  name                 TEXT NOT NULL,
  ticket_type          TEXT NOT NULL DEFAULT 'Bilhete' CHECK (ticket_type IN ('Bilhete', 'Convite')),
  payment_status       TEXT NOT NULL DEFAULT 'Não Feito' CHECK (payment_status IN ('Feito', 'Não Feito')),
  payment_method       TEXT,
  payment_date         DATE,
  invoice_status       TEXT NOT NULL DEFAULT 'Não Feito' CHECK (invoice_status IN ('Feito', 'Não Feito', 'Não precisa')),
  dietary_restrictions TEXT,
  email                TEXT,
  phone                TEXT,
  notes                TEXT,
  created_at           TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS sale_registrations_sale_idx ON sale_registrations(sale_id, sort_order);

ALTER TABLE sale_registrations ENABLE ROW LEVEL SECURITY;
