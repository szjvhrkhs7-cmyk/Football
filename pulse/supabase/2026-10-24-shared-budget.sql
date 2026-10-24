-- Applied to Supabase project cbhcfvbdeuntrjbhbdpq on 2026-10-24.
-- Authenticated members join by high-entropy invite; all budget rows remain
-- owner-scoped and protected by PostgreSQL row-level security.
create table if not exists public.pulse_shared_members (
 owner_id uuid not null references auth.users(id) on delete cascade,
 member_id uuid primary key references auth.users(id) on delete cascade,
 joined_at timestamptz not null default now(),
 constraint pulse_no_self_share check (owner_id <> member_id)
);
create table if not exists public.pulse_share_invites (
 owner_id uuid primary key references auth.users(id) on delete cascade,
 invite_hash text not null unique,
 expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
alter table public.pulse_shared_members enable row level security;
alter table public.pulse_share_invites enable row level security;
revoke all on table public.pulse_shared_members,public.pulse_share_invites from public,anon,authenticated;
grant select on table public.pulse_shared_members to authenticated;
drop policy if exists pulse_members_read on public.pulse_shared_members;
create policy pulse_members_read on public.pulse_shared_members for select to authenticated
using (member_id=(select auth.uid()) or owner_id=(select auth.uid()));
drop policy if exists pulse_shared_select on public.pulse_finance_state;
create policy pulse_shared_select on public.pulse_finance_state for select to authenticated
using (exists (select 1 from public.pulse_shared_members m where m.owner_id=user_id and m.member_id=(select auth.uid())));
drop policy if exists pulse_shared_update on public.pulse_finance_state;
create policy pulse_shared_update on public.pulse_finance_state for update to authenticated
using (exists (select 1 from public.pulse_shared_members m where m.owner_id=user_id and m.member_id=(select auth.uid())))
with check (exists (select 1 from public.pulse_shared_members m where m.owner_id=user_id and m.member_id=(select auth.uid())));
create or replace function public.pulse_create_share_code()
returns text language plpgsql security definer set search_path=''
as $$
declare actor uuid := (select auth.uid()); code text := encode(extensions.gen_random_bytes(16),'hex');
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if exists(select 1 from public.pulse_shared_members where member_id=actor) then
   raise exception 'Leave the shared budget before creating your own invitation';
 end if;
 if not exists(select 1 from public.pulse_finance_state where user_id=actor) then
   raise exception 'Sync your budget before creating an invitation';
 end if;
 insert into public.pulse_share_invites(owner_id,invite_hash,expires_at)
 values(actor,encode(extensions.digest(code,'sha256'),'hex'),now()+interval '7 days')
 on conflict(owner_id) do update set invite_hash=excluded.invite_hash,expires_at=excluded.expires_at,created_at=now();
 return code;
end $$;
create or replace function public.pulse_join_share_code(code text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare actor uuid := (select auth.uid()); owner uuid;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 if code is null or code !~ '^[a-f0-9]{32}$' then raise exception 'Invalid invitation code'; end if;
 select owner_id into owner from public.pulse_share_invites
 where invite_hash=encode(extensions.digest(code,'sha256'),'hex') and expires_at>now();
 if owner is null or owner=actor then raise exception 'Invitation expired or invalid'; end if;
 if exists(select 1 from public.pulse_shared_members where owner_id=actor) then
   raise exception 'You already own a shared budget';
 end if;
 insert into public.pulse_shared_members(owner_id,member_id)
 values(owner,actor) on conflict(member_id) do update set owner_id=excluded.owner_id,joined_at=now();
 return owner;
end $$;
create or replace function public.pulse_leave_shared_budget()
returns boolean language plpgsql security definer set search_path=''
as $$
declare actor uuid := (select auth.uid()); removed integer;
begin
 if actor is null then raise exception 'Authentication required'; end if;
 delete from public.pulse_shared_members where member_id=actor;
 get diagnostics removed=row_count;
 return removed>0;
end $$;
revoke all on function public.pulse_create_share_code(),public.pulse_join_share_code(text),public.pulse_leave_shared_budget() from public,anon;
grant execute on function public.pulse_create_share_code(),public.pulse_join_share_code(text),public.pulse_leave_shared_budget() to authenticated;
revoke all privileges on public.pulse_finance_state from anon;
revoke truncate,references,trigger on public.pulse_finance_state from authenticated;
