-- Vitral / Progreso: esquema PostgreSQL para Supabase.
-- Ejecutar completo en Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade, is_coach boolean not null default false,
  email text, name text, image text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
alter table public.profiles add column if not exists is_coach boolean not null default false;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin insert into public.profiles (id,email,name,image) values (new.id,new.email,new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'avatar_url') on conflict (id) do update set email=excluded.email,name=excluded.name,image=excluded.image; return new; end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
insert into public.profiles (id,email,name,image)
select id,email,raw_user_meta_data->>'full_name',raw_user_meta_data->>'avatar_url' from auth.users
on conflict (id) do nothing;

create table if not exists public.weekly_checkins (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null, week_number int not null, notes text not null default '', energy int, motivation int, stress int, hunger int, recovery int, training_feeling int, soreness int,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,date)
);
create table if not exists public.body_metrics (
  id uuid primary key default gen_random_uuid(), checkin_id uuid not null unique references public.weekly_checkins(id) on delete cascade,
  weight_kg numeric not null, bmi numeric, body_fat_percentage numeric, fat_mass_kg numeric, muscle_mass_kg numeric, body_water_percentage numeric, visceral_fat numeric, lean_mass_kg numeric, skeletal_muscle_percentage numeric, bone_mass_kg numeric, protein_percentage numeric, bmr numeric, body_age numeric,
  waist_cm numeric, chest_cm numeric, left_arm_cm numeric, right_arm_cm numeric, left_thigh_cm numeric, right_thigh_cm numeric, source text not null default 'manual', measured_at timestamptz
);
create table if not exists public.photos (
  id uuid primary key default gen_random_uuid(), checkin_id uuid not null references public.weekly_checkins(id) on delete cascade, type text not null default 'progress', file_path text not null, created_at timestamptz not null default now()
);
create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, name text not null, unit text not null default 'kg', created_at timestamptz not null default now(), unique(user_id,name)
);
create table if not exists public.weekly_exercise_logs (
  id uuid primary key default gen_random_uuid(), exercise_id uuid not null references public.exercises(id) on delete cascade, week_start date not null, total_sets int not null, repetitions text, weight numeric, volume numeric, note text not null default '', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(exercise_id,week_start)
);
create table if not exists public.health_metrics (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, metric_type text not null, value numeric not null, unit text not null, recorded_at timestamptz not null, start_at timestamptz, end_at timestamptz, source text not null, external_id text not null, imported_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(user_id,source,external_id)
);
create table if not exists public.weekly_health_summaries (
  id uuid primary key default gen_random_uuid(), checkin_id uuid not null references public.weekly_checkins(id) on delete cascade, metric text not null, weekly_value numeric not null, unit text not null, days_with_data int not null, aggregation_method text not null, unique(checkin_id,metric)
);
create table if not exists public.sync_devices (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade, name text not null, source text not null, token_hash text not null unique, last_sync_at timestamptz, revoked_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists public.ai_reports (
  id uuid primary key default gen_random_uuid(), checkin_id uuid not null references public.weekly_checkins(id) on delete cascade, report text not null, model text not null, version text not null, created_at timestamptz not null default now(), unique(checkin_id,model,version)
);
create table if not exists public.coach_clients (
  id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id) on delete cascade, client_id uuid not null references public.profiles(id) on delete cascade, created_at timestamptz not null default now(), unique(coach_id,client_id), check(coach_id<>client_id)
);
create table if not exists public.coach_invitations (
  id uuid primary key default gen_random_uuid(), coach_id uuid not null references public.profiles(id) on delete cascade, invited_email text, token_hash text not null unique, expires_at timestamptz not null, accepted_at timestamptz, accepted_by uuid references public.profiles(id) on delete set null, created_at timestamptz not null default now()
);
create unique index if not exists coach_clients_one_client_per_coach on public.coach_clients(coach_id);
create unique index if not exists coach_clients_one_coach_per_client on public.coach_clients(client_id);

alter table public.profiles enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.body_metrics enable row level security;
alter table public.photos enable row level security;
alter table public.exercises enable row level security;
alter table public.weekly_exercise_logs enable row level security;
alter table public.health_metrics enable row level security;
alter table public.weekly_health_summaries enable row level security;
alter table public.sync_devices enable row level security;
alter table public.ai_reports enable row level security;
alter table public.coach_clients enable row level security;
alter table public.coach_invitations enable row level security;
create policy "own profile" on public.profiles for all using (id=auth.uid()) with check (id=auth.uid());
create policy "own checkins" on public.weekly_checkins for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own exercises" on public.exercises for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own health" on public.health_metrics for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own devices" on public.sync_devices for all using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "own body metrics" on public.body_metrics for all using (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid())) with check (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid()));
create policy "own photos" on public.photos for all using (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid())) with check (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid()));
create policy "own exercise logs" on public.weekly_exercise_logs for all using (exists(select 1 from public.exercises e where e.id=exercise_id and e.user_id=auth.uid())) with check (exists(select 1 from public.exercises e where e.id=exercise_id and e.user_id=auth.uid()));
create policy "own health summaries" on public.weekly_health_summaries for all using (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid())) with check (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid()));
create policy "own ai reports" on public.ai_reports for all using (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid())) with check (exists(select 1 from public.weekly_checkins c where c.id=checkin_id and c.user_id=auth.uid()));
create policy "coach or client relationship" on public.coach_clients for select using (coach_id=auth.uid() or client_id=auth.uid());
create policy "coach invitations" on public.coach_invitations for select using (coach_id=auth.uid());

insert into storage.buckets (id,name,public) values ('progress-photos','progress-photos',false) on conflict (id) do nothing;
create policy "own progress photos" on storage.objects for all using (bucket_id='progress-photos' and (storage.foldername(name))[1]=auth.uid()::text) with check (bucket_id='progress-photos' and (storage.foldername(name))[1]=auth.uid()::text);
