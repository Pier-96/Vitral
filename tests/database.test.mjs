import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { PGlite } from '@electric-sql/pglite';

const coach='00000000-0000-4000-8000-000000000001';
const client='00000000-0000-4000-8000-000000000002';
const other='00000000-0000-4000-8000-000000000003';

test('database invitation lifecycle and direct browser permissions',async(t)=>{
 const db=new PGlite();
 try {
  // Minimal Supabase-owned schemas. Application tables/policies are the real schema.
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
   create schema auth; create schema storage;
   create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
   create function auth.uid() returns uuid language sql as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
   create table storage.buckets(id text primary key,name text,public boolean);
   create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);
   alter table storage.objects enable row level security;
   create function storage.foldername(text) returns text[] language sql as $$select string_to_array($1,'/')$$;
   grant usage on schema public,auth,storage to anon,authenticated,service_role;`);
  const schema=(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;','');
  await db.exec(schema);
  // Supabase defaults which the migration must restrict.
  await db.exec('grant all on all tables in schema public,storage to anon,authenticated,service_role;');
  const migration=await readFile(new URL('../supabase/coach-permissions-migration.sql',import.meta.url),'utf8');
  await db.exec(migration);
  await db.exec(migration); // Deployment retries are safe.
  const routines=await readFile(new URL('../supabase/routine-migration.sql',import.meta.url),'utf8');
  await db.exec(routines);
  const multi=await readFile(new URL('../supabase/multi-client-migration.sql',import.meta.url),'utf8');
  await db.exec(multi);
  await db.exec(multi); // The follow-up migration is idempotent too.
  for(const [id,email] of [[coach,'coach@example.test'],[client,'client@example.test'],[other,'other@example.test']])await db.query('insert into auth.users(id,email) values($1,$2)',[id,email]);
  await t.test('unreferred account activates; linked account accepts once, retries safely',async()=>{
   await db.query('select activate_coach($1)',[coach]);
   await db.query("insert into coach_invitations(coach_id,token_hash,expires_at) values($1,'valid',now()+interval '7 days')",[coach]);
   await db.query("select accept_coach_invitation($1,'valid')",[client]);
   await db.query("select accept_coach_invitation($1,'valid')",[client]);
   assert.equal((await db.query('select count(*)::int n from coach_clients')).rows[0].n,1);
   assert.equal((await db.query('select is_coach from profiles where id=$1',[client])).rows[0].is_coach,false);
  });
  await t.test('client activation, self-invitation, reused token and reciprocal roles are rejected',async()=>{
   await assert.rejects(db.query('select activate_coach($1)',[client]));
   await assert.rejects(db.query("select accept_coach_invitation($1,'valid')",[coach]));
   await assert.rejects(db.query("select accept_coach_invitation($1,'valid')",[other]));
   await db.query('select activate_coach($1)',[other]);
   await db.query("insert into coach_invitations(coach_id,token_hash,expires_at) values($1,'reverse',now()+interval '7 days')",[other]);
   await assert.rejects(db.query("select accept_coach_invitation($1,'reverse')",[coach]));
   assert.equal((await db.query("select accepted_at from coach_invitations where token_hash='reverse'")).rows[0].accepted_at,null);
  });
  await t.test('expiry and invalid tokens do not create partial relationships',async()=>{
   const fresh='00000000-0000-4000-8000-000000000004';
   await db.query('insert into auth.users(id) values($1)',[fresh]);
   await db.query("insert into coach_invitations(coach_id,token_hash,expires_at) values($1,'expired',now()-interval '1 day')",[other]);
   await assert.rejects(db.query("select accept_coach_invitation($1,'expired')",[fresh]));
   await assert.rejects(db.query("select accept_coach_invitation($1,'missing')",[fresh]));
   assert.equal((await db.query('select count(*)::int n from coach_clients where client_id=$1',[fresh])).rows[0].n,0);
  });
  await t.test('one coach can accept several clients, but a client cannot have two coaches',async()=>{
   const second='00000000-0000-4000-8000-000000000005';
   const rival='00000000-0000-4000-8000-000000000006';
   await db.query('insert into auth.users(id,email) values($1,$2),($3,$4)',[second,'second@example.test',rival,'rival@example.test']);
   await db.query("insert into coach_invitations(coach_id,token_hash,expires_at) values($1,'second-client',now()+interval '7 days')",[coach]);
   await db.query("select accept_coach_invitation($1,'second-client')",[second]);
   assert.equal((await db.query('select count(*)::int n from coach_clients where coach_id=$1',[coach])).rows[0].n,2);
   await db.query('select activate_coach($1)',[rival]);
   await db.query("insert into coach_invitations(coach_id,token_hash,expires_at) values($1,'rival-client',now()+interval '7 days')",[rival]);
   await assert.rejects(db.query("select accept_coach_invitation($1,'rival-client')",[second]));
  });
  await t.test('unlink removes only the relation and keeps the client identity',async()=>{
   await db.query('select unlink_coach_client($1,$2)',[coach,client]);
   assert.equal((await db.query('select count(*)::int n from coach_clients where client_id=$1',[client])).rows[0].n,0);
   assert.equal((await db.query('select is_client from profiles where id=$1',[client])).rows[0].is_client,true);
   await assert.rejects(db.query('select unlink_coach_client($1,$2)',[other,client]));
  });
  await t.test('client can read own progress but cannot write tables, storage, roles or privileged RPCs',async()=>{
   await db.query("insert into weekly_checkins(user_id,date,week_number) values($1,'2026-09-07',37),($2,'2026-09-07',37)",[client,other]);
   await db.query("select set_config('request.jwt.claim.sub',$1,false)",[client]);
   await db.exec('set role authenticated');
   assert.equal((await db.query('select count(*)::int n from weekly_checkins')).rows[0].n,1);
   for(const sql of [
    "insert into weekly_checkins(user_id,date,week_number) values(auth.uid(),'2026-09-08',37)",
    'update weekly_checkins set notes=\'changed\'',
    'delete from weekly_checkins',
    'update profiles set is_coach=true where id=auth.uid()',
    'select activate_coach(auth.uid())',
    "select accept_coach_invitation(auth.uid(),'valid')",
    "insert into storage.objects(bucket_id,name) values('progress-photos',auth.uid()::text||'/image.jpg')"
   ])await assert.rejects(db.exec(sql),sql);
   await db.exec('reset role');
  });
 } finally {await db.close();}
});
