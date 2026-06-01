 create extension if not exists pgcrypto;

create table if not exists user_profiles (
  firebase_uid text primary key,
  name text not null,
  username text not null,
  email text not null,
  phone text,
  document text,
  account_type text not null default 'PF',
  photo_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_settings (
  firebase_uid text primary key references user_profiles(firebase_uid) on delete cascade,
  hourly_value numeric(12, 2) not null default 40,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists pieces (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null references user_profiles(firebase_uid) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  firebase_uid text not null references user_profiles(firebase_uid) on delete cascade,
  client_type text not null,
  name text not null,
  nickname text,
  trade_name text,
  document text not null,
  phone text,
  email text,
  address text,
  state_registration text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists accounts (
  id bigint primary key,
  firebase_uid text not null references user_profiles(firebase_uid) on delete cascade,
  brand text not null,
  vehicle text not null,
  piece_type text not null,
  client_name text,
  created_at timestamptz not null default now(),
  mode_blue boolean not null default false,
  initial_value text default '',
  freight text default '',
  employee_cost text default '',
  material text default '',
  service_hours text default '',
  inss text default '',
  sold_for text default '',
  labor text default '',
  total numeric(12, 2) not null default 0,
  updated_at timestamptz not null default now()
);

create index if not exists accounts_firebase_uid_created_at_idx
  on accounts (firebase_uid, created_at desc);

create index if not exists clients_firebase_uid_name_idx
  on clients (firebase_uid, name);

-- Security note:
-- This schema is designed for the current hybrid setup where Firebase Auth
-- remains responsible for login. For production, put a small backend/edge
-- function between the app and Supabase, or issue Supabase-compatible JWTs
-- from Firebase before enabling strict RLS.
