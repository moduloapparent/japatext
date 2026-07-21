-- Minimal invite gate (safe to run even if the full Japatext schema is not applied yet).
-- Paste into Supabase → SQL Editor, then add your email(s).

create table if not exists public.invites (
  email text primary key,
  note text,
  created_at timestamptz not null default now(),
  redeemed_at timestamptz
);

alter table public.invites enable row level security;

drop policy if exists invites_select_own on public.invites;
create policy invites_select_own on public.invites
  for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Add allowed emails (edit before running):
insert into public.invites (email, note)
values
  ('YOU@example.com', 'owner')
on conflict (email) do nothing;
