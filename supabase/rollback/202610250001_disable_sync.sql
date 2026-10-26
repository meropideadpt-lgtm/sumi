-- Non-destructive rollback / emergency disable for the sumi sync v1 migration.
-- Review and run manually. Existing rows, receipts, tombstones and image objects
-- remain intact. Reapplying the forward migration restores the same API.
begin;
select pg_catalog.pg_advisory_xact_lock(74621893208511);
revoke all on function public.sumi_sync_pull(uuid,bigint,integer) from public,anon,authenticated;
revoke all on function public.sumi_sync_push(uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on public.sumi_sync_clock,public.sumi_subscription_ids,
  public.sumi_sync_records,public.sumi_sync_operations from public,anon,authenticated;
-- Never drop RLS or owner guards: other policies may exist in the project.
drop policy if exists sumi_logo_sync_disabled on storage.objects;
create policy sumi_logo_sync_disabled on storage.objects as restrictive for all to public
  using (bucket_id<>'sumi-private-logos') with check (bucket_id<>'sumi-private-logos');
notify pgrst,'reload schema';
commit;
