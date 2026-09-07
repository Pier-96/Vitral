-- Apply after schema.sql (or the existing coach migrations), before deploying the API.
-- Does not reassign existing profiles, relationships or progress records.
begin;

-- Browser accounts read through RLS. All mutations go through the authenticated API.
revoke insert, update, delete, truncate, references, trigger on table
  public.profiles, public.coach_clients, public.coach_invitations,
  public.weekly_checkins, public.body_metrics, public.photos,
  public.exercises, public.weekly_exercise_logs, public.health_metrics,
  public.weekly_health_summaries, public.sync_devices, public.ai_reports
from anon, authenticated;

drop policy if exists "own progress photos" on storage.objects;
create policy "own progress photos" on storage.objects for select
  using (bucket_id='progress-photos' and (storage.foldername(name))[1]=auth.uid()::text);

create or replace function public.activate_coach(actor_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform 1 from public.profiles where id=actor_id for update;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  if exists(select 1 from public.coach_clients where client_id=actor_id) then
    raise exception 'Una cuenta asesorada no puede convertirse en coach.';
  end if;
  update public.profiles set is_coach=true where id=actor_id;
end;
$$;

create or replace function public.accept_coach_invitation(actor_id uuid, invitation_hash text)
returns void language plpgsql security definer set search_path = public as $$
declare
  invitation public.coach_invitations%rowtype;
  actor public.profiles%rowtype;
begin
  select * into invitation from public.coach_invitations where token_hash=invitation_hash for update;
  if not found then raise exception 'La invitación no es válida.'; end if;
  if invitation.coach_id=actor_id then raise exception 'No puedes aceptar tu propia invitación.'; end if;
  -- Same lock order across invitations; also serializes against coach activation.
  perform 1 from public.profiles where id in (actor_id,invitation.coach_id) order by id for update;
  select * into actor from public.profiles where id=actor_id;
  if not found then raise exception 'Perfil no encontrado.'; end if;
  if actor.is_coach or exists(select 1 from public.coach_clients where coach_id=actor_id) then
    raise exception 'Una cuenta coach no puede aceptar una invitación como asesorado.';
  end if;
  if not exists(select 1 from public.profiles where id=invitation.coach_id and is_coach)
    or exists(select 1 from public.coach_clients where client_id=invitation.coach_id) then
    raise exception 'El coach de esta invitación no tiene un rol válido.';
  end if;
  if invitation.accepted_at is not null then
    if invitation.accepted_by=actor_id and exists(
      select 1 from public.coach_clients where coach_id=invitation.coach_id and client_id=actor_id
    ) then return; end if;
    raise exception 'La invitación ya ha sido utilizada.';
  end if;
  if invitation.expires_at<=now() then raise exception 'La invitación ha caducado.'; end if;
  if invitation.invited_email is not null and lower(invitation.invited_email)<>lower(coalesce(actor.email,'')) then
    raise exception 'La invitación pertenece a otra cuenta.';
  end if;
  if exists(select 1 from public.coach_clients where client_id=actor_id or coach_id=invitation.coach_id) then
    raise exception 'El coach o el asesorado ya tiene una vinculación.';
  end if;
  insert into public.coach_clients(coach_id,client_id) values(invitation.coach_id,actor_id);
  update public.coach_invitations set accepted_at=now(),accepted_by=actor_id where id=invitation.id;
end;
$$;

-- actor_id is supplied only by the server after verifying the Google session.
revoke all on function public.activate_coach(uuid) from public, anon, authenticated;
revoke all on function public.accept_coach_invitation(uuid,text) from public, anon, authenticated;
grant execute on function public.activate_coach(uuid) to service_role;
grant execute on function public.accept_coach_invitation(uuid,text) to service_role;
commit;
