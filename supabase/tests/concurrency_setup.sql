set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000020',jsonb_build_array(
 test_support.change('subscriptions','race-sub',0,test_support.sub_payload('race-sub',10))));
reset role;
create table test_support.race_before as select sequence from public.sumi_sync_clock where owner_id='11111111-1111-4111-8111-111111111111';
grant select on test_support.race_before to authenticated;
