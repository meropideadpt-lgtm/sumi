-- Disposable PostgreSQL test-only approximation of Supabase roles/Auth/Storage.
-- NEVER execute this file in a Supabase project.
create role anon nologin;
create role authenticated nologin;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
grant usage on schema auth to anon,authenticated;
grant execute on function auth.uid() to anon,authenticated;
create schema storage;
create table storage.buckets(id text primary key,name text not null,public boolean not null default false,
  file_size_limit bigint,allowed_mime_types text[]);
create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text not null references storage.buckets(id),
  name text not null,owner_id text,metadata jsonb,unique(bucket_id,name));
alter table storage.objects enable row level security;
grant usage on schema storage to anon,authenticated;
grant select,insert,update,delete on storage.objects to anon,authenticated;
insert into auth.users(id) values('11111111-1111-4111-8111-111111111111'),('22222222-2222-4222-8222-222222222222');
create schema test_support;
create table test_support.results(label text primary key);
create function test_support.ok(label text,condition boolean) returns void language plpgsql as $$
begin
  if condition is not true then raise exception 'FAIL: %',label; end if;
  insert into test_support.results values(label);
  raise notice 'PASS: %',label;
end $$;
create function test_support.denied(label text,statement text,expected_state text default '42501') returns void language plpgsql as $$
begin
  begin
    execute statement;
  exception when others then
    if sqlstate<>expected_state then raise exception 'Wrong error for %: % (%)',label,sqlerrm,sqlstate; end if;
    perform test_support.ok(label,true); return;
  end;
  raise exception 'FAIL: % was allowed',label;
end $$;
grant usage on schema test_support to anon,authenticated;
grant execute on all functions in schema test_support to anon,authenticated;
grant insert,select on test_support.results to anon,authenticated;
