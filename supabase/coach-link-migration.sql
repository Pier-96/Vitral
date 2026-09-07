-- Ejecutar una sola vez en Supabase SQL Editor si ya ejecutaste coach-migration.sql.
alter table public.coach_invitations alter column invited_email drop not null;
