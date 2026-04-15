-- Run this in the Neon SQL Editor after creating your project
-- (Dashboard → SQL Editor → New Query)

create table if not exists ai_corrections (
  id              uuid primary key default gen_random_uuid(),
  image_url       text not null,
  ai_extracted    jsonb not null,
  human_corrected jsonb not null,
  created_at      timestamptz not null default now()
);

create index if not exists ai_corrections_created_at_idx
  on ai_corrections (created_at desc);

-- Supplier name learning table
-- Maps receipt text to verified Fornecedor names
create table if not exists supplier_mappings (
  id              uuid primary key default gen_random_uuid(),
  receipt_text    text not null,
  correct_name    text not null,
  confirmed_count integer not null default 1,
  created_at      timestamptz not null default now(),
  unique (receipt_text, correct_name)
);

create index if not exists supplier_mappings_count_idx
  on supplier_mappings (confirmed_count desc);

-- Enable Banking connected sessions
create table if not exists enablebanking_sessions (
  id               serial primary key,
  session_id       text not null unique,
  institution_name text not null,
  account_ids      text not null default '[]',
  valid_until      text,
  last_fetched_at  timestamptz,
  created_at       timestamptz not null default now()
);

-- Raw bank transactions fetched from Enable Banking
-- Populated during sync; read by the transactions page to avoid rate limits
create table if not exists bank_transactions (
  id               serial primary key,
  transaction_id   text not null unique,
  account_uid      text not null,
  institution_name text not null,
  amount           numeric(12,2) not null,
  currency         text not null default 'EUR',
  credit_debit     text not null,           -- 'CRDT' | 'DBIT'
  transaction_date date not null,
  booking_date     date,
  merchant_name    text,
  remittance_info  text,
  raw              jsonb,
  created_at       timestamptz not null default now()
);

create index if not exists bank_transactions_date_idx
  on bank_transactions (transaction_date desc);
