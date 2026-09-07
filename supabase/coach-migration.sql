-- Ejecutar una sola vez en Supabase SQL Editor.
alter table public.profiles add column if not exists is_coach boolean not null default false;

create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  client_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(coach_id,client_id),
  check(coach_id<>client_id)
);
create unique index if not exists coach_clients_one_client_per_coach on public.coach_clients(coach_id);
create unique index if not exists coach_clients_one_coach_per_client on public.coach_clients(client_id);

create table if not exists public.coach_invitations (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null references public.profiles(id) on delete cascade,
  invited_email text,
  token_hash text not null unique,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.coach_clients enable row level security;
alter table public.coach_invitations enable row level security;

create policy "coach or client relationship" on public.coach_clients for select using (coach_id=auth.uid() or client_id=auth.uid());
create policy "coach invitations" on public.coach_invitations for select using (coach_id=auth.uid());
alter table public.coach_invitations alter column invited_email drop not null;
