-- Apply after schema.sql, coach-permissions-migration.sql and routine-migration.sql.
-- Safe to repeat. It preserves profiles and all progress; it only changes relations.
begin;

alter table public.profiles add column if not exists is_client boolean not null default false;
-- Existing and formerly linked clients keep their client identity after unlinking.
update public.profiles p set is_client=true
where exists (select 1 from public.coach_clients cc where cc.client_id=p.id)
   or exists (select 1 from public.coach_invitations ci where ci.accepted_by=p.id);

drop index if exists public.coach_clients_one_client_per_coach;

create or replace function public.activate_coach(actor_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id=actor_id for update;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  if exists(select 1 from public.profiles where id=actor_id and is_client)
     or exists(select 1 from public.coach_clients where client_id=actor_id) then
    raise exception 'Una cuenta asesorada no puede convertirse en coach.';
  end if;
  update public.profiles set is_coach=true where id=actor_id;
end; $$;

create or replace function public.accept_coach_invitation(actor_id uuid, invitation_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare invitation public.coach_invitations%rowtype; actor public.profiles%rowtype;
begin
  select * into invitation from public.coach_invitations where token_hash=invitation_hash for update;
  if not found then raise exception 'La invitación no es válida.'; end if;
  if invitation.coach_id=actor_id then raise exception 'No puedes aceptar tu propia invitación.'; end if;
  perform 1 from public.profiles where id in (actor_id,invitation.coach_id) order by id for update;
  select * into actor from public.profiles where id=actor_id;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  if actor.is_coach or exists(select 1 from public.coach_clients where coach_id=actor_id) then raise exception 'Una cuenta coach no puede aceptar una invitación como asesorado.'; end if;
  if not exists(select 1 from public.profiles where id=invitation.coach_id and is_coach)
     or exists(select 1 from public.coach_clients where client_id=invitation.coach_id) then raise exception 'El coach de esta invitación no tiene un rol válido.'; end if;
  if invitation.accepted_at is not null then
    if invitation.accepted_by=actor_id and exists(select 1 from public.coach_clients where coach_id=invitation.coach_id and client_id=actor_id) then return; end if;
    raise exception 'La invitación ya ha sido utilizada.';
  end if;
  if invitation.expires_at<=now() then raise exception 'La invitación ha caducado.'; end if;
  if invitation.invited_email is not null and lower(invitation.invited_email)<>lower(coalesce(actor.email,'')) then raise exception 'La invitación pertenece a otra cuenta.'; end if;
  if exists(select 1 from public.coach_clients where client_id=actor_id) then raise exception 'El asesorado ya tiene un coach vinculado.'; end if;
  insert into public.coach_clients(coach_id,client_id) values(invitation.coach_id,actor_id);
  update public.profiles set is_client=true where id=actor_id;
  update public.coach_invitations set accepted_at=now(),accepted_by=actor_id where id=invitation.id;
end; $$;

create or replace function public.unlink_coach_client(actor_id uuid, target_client_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Same deterministic profile locks as acceptance; only this pair is removed.
  perform 1 from public.profiles where id in (actor_id,target_client_id) order by id for update;
  delete from public.coach_clients where coach_id=actor_id and client_id=target_client_id;
  if not found then raise exception 'La vinculación ya no existe o no te pertenece.'; end if;
end; $$;

revoke all on function public.accept_coach_invitation(uuid,text) from public, anon, authenticated;
revoke all on function public.unlink_coach_client(uuid,uuid) from public, anon, authenticated;
grant execute on function public.accept_coach_invitation(uuid,text) to service_role;
grant execute on function public.unlink_coach_client(uuid,uuid) to service_role;

-- Routines are API-only too; direct browser writes would bypass coach authorization.
revoke insert, update, delete, truncate, references, trigger on table public.training_routines, public.routine_days, public.planned_exercises, public.planned_exercise_completions from anon, authenticated;
commit;
