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

-- Plaid connected bank accounts
create table if not exists plaid_items (
  id               uuid primary key default gen_random_uuid(),
  access_token     text not null,
  item_id          text not null unique,
  institution_name text not null default 'Crédito Agrícola',
  cursor           text,
  created_at       timestamptz not null default now()
);
