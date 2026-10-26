-- sumi sync v1. Review and apply manually in Supabase SQL Editor.
-- No production credentials are needed by the browser. Safe to reapply.
begin;
select pg_catalog.pg_advisory_xact_lock(74621893208511);

create schema if not exists sumi_private;
revoke all on schema sumi_private from public, anon, authenticated;
-- Remove only legacy no-fence function definitions, never any business data.
-- A cached A workspace must not write B if the SDK changes tokens mid-request.
drop function if exists public.sumi_sync_pull(bigint,integer);
drop function if exists public.sumi_sync_push(uuid,jsonb);

create table if not exists public.sumi_sync_clock (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  sequence bigint not null default 0 check (sequence >= 0),
  schema_version integer not null default 1 check (schema_version = 1)
);
create table if not exists public.sumi_subscription_ids (
  owner_id uuid not null references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  primary key (owner_id,id)
);
create table if not exists public.sumi_sync_records (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('subscriptions','payments','costHistory','preferences','extensions')),
  id text not null check (length(id) between 1 and 200),
  payload jsonb,
  revision integer not null check (revision > 0),
  seq bigint not null check (seq > 0),
  schema_version integer not null default 1 check (schema_version = 1),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  subscription_id text generated always as (
    case when kind = 'subscriptions' then id
      when kind in ('payments','costHistory') then payload->>'subscriptionId' end
  ) stored,
  paid_cycle text generated always as (
    case when kind = 'payments' and deleted_at is null
      and (payload->>'status') is distinct from 'failed' then payload->>'cycleDate' end
  ) stored,
  primary key (owner_id,kind,id),
  foreign key (owner_id,subscription_id) references public.sumi_subscription_ids(owner_id,id),
  constraint sumi_sync_live_payload check (
    (deleted_at is null and payload is not null and jsonb_typeof(payload) = 'object') or
    (deleted_at is not null and payload is null)
  ),
  constraint sumi_sync_paid_cycle_unique unique (owner_id,subscription_id,paid_cycle)
    deferrable initially deferred
);
create index if not exists sumi_sync_records_cursor on public.sumi_sync_records(owner_id,seq);
create index if not exists sumi_sync_records_parent on public.sumi_sync_records(owner_id,subscription_id)
  where kind in ('payments','costHistory') and deleted_at is null;

-- Receipts are never pruned by the application: an offline retry remains safe.
-- Each accepted revision's full JSON is retained here, including prior payment FX.
create table if not exists public.sumi_sync_operations (
  owner_id uuid not null references auth.users(id) on delete cascade,
  operation_id uuid not null,
  changes jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (owner_id,operation_id)
);

alter table public.sumi_sync_clock enable row level security;
alter table public.sumi_sync_clock force row level security;
alter table public.sumi_subscription_ids enable row level security;
alter table public.sumi_subscription_ids force row level security;
alter table public.sumi_sync_records enable row level security;
alter table public.sumi_sync_records force row level security;
alter table public.sumi_sync_operations enable row level security;
alter table public.sumi_sync_operations force row level security;

-- No browser role may bypass CAS/idempotency with direct table writes.
revoke all on public.sumi_sync_clock, public.sumi_subscription_ids,
  public.sumi_sync_records, public.sumi_sync_operations from public, anon, authenticated;
grant select on public.sumi_sync_records to authenticated;

drop policy if exists sumi_clock_owner on public.sumi_sync_clock;
create policy sumi_clock_owner on public.sumi_sync_clock for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists sumi_subscription_ids_owner on public.sumi_subscription_ids;
create policy sumi_subscription_ids_owner on public.sumi_subscription_ids for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists sumi_records_owner on public.sumi_sync_records;
create policy sumi_records_owner on public.sumi_sync_records for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
drop policy if exists sumi_operations_owner on public.sumi_sync_operations;
create policy sumi_operations_owner on public.sumi_sync_operations for all to authenticated
  using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

create or replace function sumi_private.immutable_owner() returns trigger
language plpgsql set search_path = pg_catalog as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'sync-owner-immutable' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function sumi_private.immutable_owner() from public, anon, authenticated;
drop trigger if exists sumi_owner_immutable on public.sumi_sync_records;
create trigger sumi_owner_immutable before update on public.sumi_sync_records
  for each row execute function sumi_private.immutable_owner();
drop trigger if exists sumi_owner_immutable on public.sumi_sync_clock;
create trigger sumi_owner_immutable before update on public.sumi_sync_clock
  for each row execute function sumi_private.immutable_owner();
drop trigger if exists sumi_owner_immutable on public.sumi_subscription_ids;
create trigger sumi_owner_immutable before update on public.sumi_subscription_ids
  for each row execute function sumi_private.immutable_owner();
drop trigger if exists sumi_owner_immutable on public.sumi_sync_operations;
create trigger sumi_owner_immutable before update on public.sumi_sync_operations
  for each row execute function sumi_private.immutable_owner();

create or replace function sumi_private.valid_date(value text) returns boolean
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or value < '0001-01-01' then return false; end if;
  return to_char(value::date,'YYYY-MM-DD') = value;
exception when invalid_datetime_format or datetime_field_overflow then return false;
end $$;
revoke all on function sumi_private.valid_date(text) from public, anon, authenticated;

create or replace function sumi_private.valid_payload(k text, record_id text, value jsonb) returns boolean
language plpgsql immutable set search_path = pg_catalog as $$
begin
  if jsonb_typeof(value) is distinct from 'object' then return false; end if;
  if k in ('preferences','extensions') then
    if not value ? 'value' then return false; end if;
    if k = 'extensions' then return record_id not in ('subscriptions','payments','costHistory'); end if;
    case record_id
      when 'language' then return value->>'value' in ('zh-CN','zh-TW','ja-JP','en');
      when 'theme' then return value->>'value' in ('light','dark','system');
      when 'currency' then return value->>'value' ~ '^[A-Z]{3}$';
      when 'reminder' then return value->'value' in ('0'::jsonb,'1'::jsonb,'3'::jsonb,'7'::jsonb,'14'::jsonb);
      when 'motion' then return value->>'value' in ('system','reduce');
      else return true;
    end case;
  end if;
  if jsonb_typeof(value->'id') is distinct from 'string' or value->>'id' <> record_id
    or jsonb_typeof(value->'name') is distinct from 'string' or length(value->>'name') not between 1 and 70
    or jsonb_typeof(value->'amount') is distinct from 'number'
    or (value->>'amount')::numeric < 0 or (value->>'amount')::numeric > 90071992547409.91
    or jsonb_typeof(value->'currency') is distinct from 'string' or value->>'currency' !~ '^[A-Z]{3}$'
    then return false; end if;
  if k in ('subscriptions','costHistory') and value->'months' not in ('1'::jsonb,'3'::jsonb,'6'::jsonb,'12'::jsonb) then return false; end if;
  if k = 'subscriptions' then
    return value ? 'months' and sumi_private.valid_date(value->>'nextDate')
      and (not value ? 'status' or value->>'status' in ('active','cancelled'))
      and (not value ? 'autoRenew' or jsonb_typeof(value->'autoRenew') = 'boolean')
      and (not value ? 'category' or (jsonb_typeof(value->'category') = 'string' and length(value->>'category') between 1 and 30));
  end if;
  if jsonb_typeof(value->'subscriptionId') is distinct from 'string' or length(value->>'subscriptionId') not between 1 and 200 then return false; end if;
  if k = 'payments' then
    if not sumi_private.valid_date(value->>'date')
      or (value ? 'cycleDate' and not sumi_private.valid_date(value->>'cycleDate'))
      or (value ? 'status' and (jsonb_typeof(value->'status') is distinct from 'string' or value->>'status' not in ('succeeded','failed')))
      or (value ? 'advancesSchedule' and jsonb_typeof(value->'advancesSchedule') is distinct from 'boolean')
      or (value ? 'scheduleArchived' and jsonb_typeof(value->'scheduleArchived') is distinct from 'boolean')
      or (value->'advancesSchedule' = 'true'::jsonb and not value ? 'cycleDate')
      or (value->'scheduleArchived' = 'true'::jsonb and (not value ? 'cycleDate' or value->'advancesSchedule' is distinct from 'false'::jsonb))
      then return false; end if;
    -- No rate calculation here: confirmed JSON is stored exactly as submitted.
    if value ? 'fxSnapshot' and (
      jsonb_typeof(value->'fxSnapshot') is distinct from 'object'
      or value->'fxSnapshot'->'version' is distinct from '1'::jsonb
      or value->'fxSnapshot'->'sourceAmount' is distinct from value->'amount'
      or value->'fxSnapshot'->'sourceCurrency' is distinct from value->'currency'
      or coalesce(value->'fxSnapshot'->>'status','') not in ('available','unavailable')) then return false; end if;
    return true;
  end if;
  return k = 'costHistory' and value ? 'months'
    and sumi_private.valid_date(value->>'effectiveDate')
    and jsonb_typeof(value->'observedAt') = 'string'
    and jsonb_typeof(value->'category') = 'string'
    and length(value->>'category') between 1 and 30
    and value->>'status' in ('active','cancelled','deleted')
    and value->>'kind' in ('baseline','created','changed','deleted')
    and ((value->>'status' = 'deleted') = (value->>'kind' = 'deleted'));
end $$;
revoke all on function sumi_private.valid_payload(text,text,jsonb) from public, anon, authenticated;

create or replace function sumi_private.record_json(value public.sumi_sync_records) returns jsonb
language sql immutable set search_path = pg_catalog as $$
  select jsonb_build_object('kind',value.kind,'id',value.id,'payload',value.payload,
    'revision',value.revision,'deleted',value.deleted_at is not null,'seq',value.seq::text)
$$;
revoke all on function sumi_private.record_json(public.sumi_sync_records) from public, anon, authenticated;

create or replace function public.sumi_sync_pull(p_expected_owner uuid,p_after bigint default 0,p_limit integer default 500)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  actor uuid := auth.uid(); ceiling bigint; page_rows jsonb; last_seq bigint; has_more boolean;
begin
  if actor is null then raise exception 'sync-auth-required' using errcode='28000'; end if;
  if p_expected_owner is null or p_expected_owner<>actor then
    raise exception 'sync-workspace-mismatch' using errcode='42501'; end if;
  if p_after is null or p_after < 0 or p_limit is null or p_limit not between 1 and 1000 then
    raise exception 'sync-invalid-cursor' using errcode='22023';
  end if;
  insert into public.sumi_sync_clock(owner_id) values(actor) on conflict do nothing;
  select sequence into ceiling from public.sumi_sync_clock where owner_id=actor for share;
  if p_after > ceiling then raise exception 'sync-cursor-ahead' using errcode='22023'; end if;
  select coalesce(jsonb_agg(sumi_private.record_json(page_row) order by page_row.seq),'[]'::jsonb),max(page_row.seq)
    into page_rows,last_seq from (
      select * from public.sumi_sync_records where owner_id=actor and seq>p_after and seq<=ceiling
      order by seq limit p_limit
    ) page_row;
  has_more := exists(select 1 from public.sumi_sync_records where owner_id=actor and seq>coalesce(last_seq,p_after) and seq<=ceiling);
  return jsonb_build_object('version',1,'records',page_rows,'more',has_more,
    'cursor',(case when has_more then last_seq else ceiling end)::text);
end $$;
revoke all on function public.sumi_sync_pull(uuid,bigint,integer) from public, anon;
grant execute on function public.sumi_sync_pull(uuid,bigint,integer) to authenticated;

create or replace function public.sumi_sync_push(p_expected_owner uuid,p_operation_id uuid,p_changes jsonb)
returns jsonb language plpgsql security definer set search_path = pg_catalog as $$
declare
  actor uuid := auth.uid(); current_sequence bigint; change jsonb; existing public.sumi_sync_records;
  parent public.sumi_sync_records; receipt public.sumi_sync_operations; result_rows jsonb := '[]';
  conflicts jsonb := '[]'; next_row public.sumi_sync_records; base integer; dead boolean;
  record_kind text; record_id text; record_payload jsonb; missing boolean; duplicate_cycle record;
begin
  if actor is null then raise exception 'sync-auth-required' using errcode='28000'; end if;
  if p_expected_owner is null or p_expected_owner<>actor then
    raise exception 'sync-workspace-mismatch' using errcode='42501'; end if;
  if p_operation_id is null or jsonb_typeof(p_changes) is distinct from 'array'
    or jsonb_array_length(p_changes) not between 1 and 1000 or octet_length(p_changes::text)>8388608 then
    raise exception 'sync-invalid-batch' using errcode='22023'; end if;
  -- The owner row lock serializes commits, not just sequence allocation. No
  -- earlier uncommitted change can be skipped by an incremental cursor.
  insert into public.sumi_sync_clock(owner_id) values(actor) on conflict do nothing;
  select sequence into current_sequence from public.sumi_sync_clock where owner_id=actor for update;
  select * into receipt from public.sumi_sync_operations where owner_id=actor and operation_id=p_operation_id;
  if found then
    if receipt.changes is distinct from p_changes then raise exception 'sync-operation-reused' using errcode='22023'; end if;
    return receipt.response;
  end if;
  if exists(select 1 from jsonb_array_elements(p_changes) c group by c->>'kind',c->>'id' having count(*)>1) then
    raise exception 'sync-duplicate-change' using errcode='22023'; end if;
  for change in select * from jsonb_array_elements(p_changes) loop
    if jsonb_typeof(change) is distinct from 'object' or
      (change - array['kind','id','payload','deleted','baseRevision']::text[]) <> '{}'::jsonb or
      jsonb_typeof(change->'kind') is distinct from 'string' or
      coalesce(change->>'kind','') not in ('subscriptions','payments','costHistory','preferences','extensions') or
      jsonb_typeof(change->'id') is distinct from 'string' or length(change->>'id') not between 1 and 200 or
      jsonb_typeof(change->'baseRevision') is distinct from 'number' or
      (change->>'baseRevision') !~ '^[0-9]+$' or (change->>'baseRevision')::numeric > 2147483646 or
      jsonb_typeof(change->'deleted') is distinct from 'boolean' or not change ? 'payload'
      then raise exception 'sync-invalid-change' using errcode='22023'; end if;
    record_kind:=change->>'kind'; record_id:=change->>'id'; base:=(change->>'baseRevision')::integer; dead:=(change->>'deleted')::boolean;
    record_payload:=case when dead then null else change->'payload' end;
    if (dead and change->'payload' <> 'null'::jsonb) or
      (not dead and sumi_private.valid_payload(record_kind,record_id,record_payload) is not true) then
      raise exception 'sync-invalid-payload' using errcode='22023'; end if;
    select * into existing from public.sumi_sync_records where owner_id=actor and kind=record_kind and id=record_id;
    missing:=not found;
    if coalesce(existing.revision,0)<>base then
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind',record_kind,'id',record_id,'baseRevision',base,
        'reason','revision','remote',case when missing then null else sumi_private.record_json(existing) end));
    end if;
  end loop;
  if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts); end if;

  -- Compare final payment state before any write, allowing a batch to move a
  -- cycle or delete/recreate it without order-dependent unique violations.
  for duplicate_cycle in
    with final_payments as (
      select r.id,r.payload from public.sumi_sync_records r where r.owner_id=actor and r.kind='payments' and r.deleted_at is null
      and not exists(select 1 from jsonb_array_elements(p_changes) c where c->>'kind'='payments' and c->>'id'=r.id)
      union all select c->>'id',c->'payload' from jsonb_array_elements(p_changes) c where c->>'kind'='payments' and c->'deleted'='false'::jsonb
    ) select payload->>'subscriptionId' as subscription_id,payload->>'cycleDate' as cycle_date
      from final_payments where (payload->>'status') is distinct from 'failed' and payload ? 'cycleDate'
      group by payload->>'subscriptionId',payload->>'cycleDate' having count(*)>1
  loop
    for change in select c from jsonb_array_elements(p_changes) c where c->>'kind'='payments' and c->'deleted'='false'::jsonb
      and c->'payload'->>'subscriptionId'=duplicate_cycle.subscription_id and c->'payload'->>'cycleDate'=duplicate_cycle.cycle_date
      and (c->'payload'->>'status') is distinct from 'failed'
    loop
      select * into existing from public.sumi_sync_records where owner_id=actor and kind='payments' and deleted_at is null
        and subscription_id=duplicate_cycle.subscription_id and paid_cycle=duplicate_cycle.cycle_date and id<>change->>'id' limit 1;
      missing:=not found;
      conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind','payments','id',change->>'id','baseRevision',change->'baseRevision',
        'reason','paid-cycle','remote',case when missing then null else sumi_private.record_json(existing) end));
    end loop;
  end loop;
  for change in select * from jsonb_array_elements(p_changes) loop
    if change->>'kind'='payments' and change->'deleted'='false'::jsonb then
      select * into parent from public.sumi_sync_records where owner_id=actor and kind='subscriptions' and id=change->'payload'->>'subscriptionId';
      if found and parent.deleted_at is not null and not exists(select 1 from jsonb_array_elements(p_changes) c
        where c->>'kind'='subscriptions' and c->>'id'=parent.id and c->'deleted'='false'::jsonb) then
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind','payments','id',change->>'id','baseRevision',change->'baseRevision',
          'reason','parent-deleted','remote',sumi_private.record_json(parent)));
      end if;
    elsif change->>'kind'='subscriptions' and change->'deleted'='true'::jsonb then
      for existing in select r.* from public.sumi_sync_records r where r.owner_id=actor and r.kind='payments'
        and r.subscription_id=change->>'id' and r.deleted_at is null and not exists(
          select 1 from jsonb_array_elements(p_changes) c where c->>'kind'='payments' and c->>'id'=r.id and c->'deleted'='true'::jsonb)
      loop
        conflicts:=conflicts||jsonb_build_array(jsonb_build_object('kind','subscriptions','id',change->>'id','baseRevision',change->'baseRevision',
          'reason','dependent-records','remote',sumi_private.record_json(existing)));
      end loop;
      -- Also reject adding a payment and deleting its parent in the same batch.
      if exists(select 1 from jsonb_array_elements(p_changes) c where c->>'kind'='payments' and c->'deleted'='false'::jsonb
        and c->'payload'->>'subscriptionId'=change->>'id') then
        raise exception 'sync-invalid-parent-deletion' using errcode='22023';
      end if;
    end if;
  end loop;
  if jsonb_array_length(conflicts)>0 then return jsonb_build_object('ok',false,'conflicts',conflicts); end if;

  set constraints public.sumi_sync_paid_cycle_unique deferred;
  for change in select * from jsonb_array_elements(p_changes) loop
    record_kind:=change->>'kind'; record_id:=change->>'id'; base:=(change->>'baseRevision')::integer; dead:=(change->>'deleted')::boolean;
    record_payload:=case when dead then null else change->'payload' end;
    if record_kind='subscriptions' then
      insert into public.sumi_subscription_ids(owner_id,id) values(actor,record_id) on conflict do nothing;
    elsif not dead and record_kind in ('payments','costHistory') then
      insert into public.sumi_subscription_ids(owner_id,id) values(actor,record_payload->>'subscriptionId') on conflict do nothing;
    end if;
    current_sequence:=current_sequence+1;
    insert into public.sumi_sync_records(owner_id,kind,id,payload,revision,seq,updated_at,deleted_at)
      values(actor,record_kind,record_id,record_payload,base+1,current_sequence,clock_timestamp(),case when dead then clock_timestamp() end)
      on conflict(owner_id,kind,id) do update set payload=excluded.payload,revision=excluded.revision,seq=excluded.seq,
        updated_at=excluded.updated_at,deleted_at=excluded.deleted_at
      returning * into next_row;
    result_rows:=result_rows||jsonb_build_array(sumi_private.record_json(next_row));
  end loop;
  set constraints public.sumi_sync_paid_cycle_unique immediate;
  update public.sumi_sync_clock set sequence=current_sequence where owner_id=actor;
  insert into public.sumi_sync_operations(owner_id,operation_id,changes,response)
    values(actor,p_operation_id,p_changes,jsonb_build_object('ok',true,'records',result_rows));
  return jsonb_build_object('ok',true,'records',result_rows);
end $$;
revoke all on function public.sumi_sync_push(uuid,uuid,jsonb) from public, anon;
grant execute on function public.sumi_sync_push(uuid,uuid,jsonb) to authenticated;

-- Private content-addressed raster images. Metadata checks are NOT image decoding;
-- the client verifies magic bytes, decoded content and SHA-256 on upload/download.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
  values('sumi-private-logos','sumi-private-logos',false,12582912,array['image/png','image/jpeg','image/webp'])
  on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists sumi_logo_sync_disabled on storage.objects;

-- This restrictive guard also limits accidental broad permissive policies from
-- elsewhere in the project, but cannot audit unknown project functions/roles.
drop policy if exists sumi_logo_owner_guard on storage.objects;
create policy sumi_logo_owner_guard on storage.objects as restrictive for all to public
  using (bucket_id<>'sumi-private-logos' or ((select auth.uid()) is not null
    and split_part(name,'/',1)=(select auth.uid())::text
    and owner_id=(select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp)$'))
  with check (bucket_id<>'sumi-private-logos' or ((select auth.uid()) is not null
    and split_part(name,'/',1)=(select auth.uid())::text
    and owner_id=(select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp)$'));
drop policy if exists sumi_logo_read on storage.objects;
create policy sumi_logo_read on storage.objects for select to authenticated
  using (bucket_id='sumi-private-logos' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists sumi_logo_insert on storage.objects;
create policy sumi_logo_insert on storage.objects for insert to authenticated
  with check (bucket_id='sumi-private-logos' and split_part(name,'/',1)=(select auth.uid())::text
    and owner_id=(select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f]{64}\.(png|jpg|webp)$');
drop policy if exists sumi_logo_delete on storage.objects;
create policy sumi_logo_delete on storage.objects for delete to authenticated
  using (bucket_id='sumi-private-logos' and split_part(name,'/',1)=(select auth.uid())::text);
drop policy if exists sumi_logo_no_update on storage.objects;
create policy sumi_logo_no_update on storage.objects as restrictive for update to public
  using (bucket_id<>'sumi-private-logos') with check (bucket_id<>'sumi-private-logos');

comment on table public.sumi_sync_records is 'sumi v1 per-record state and retained tombstones; write only via owner-scoped CAS RPC';
comment on table public.sumi_sync_operations is 'sumi v1 idempotent operation receipts and accepted revision payloads; never prune without a device/retention protocol';
notify pgrst,'reload schema';
commit;
