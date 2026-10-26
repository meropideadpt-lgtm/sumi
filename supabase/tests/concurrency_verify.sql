set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select test_support.ok('concurrent loser never overwrites winning value',exists(select 1 from public.sumi_sync_records where id='race-sub' and revision=2 and payload->'amount'='20'::jsonb));
select test_support.ok('late retry reuses successful operation receipt',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000021',jsonb_build_array(
 test_support.change('subscriptions','race-sub',1,test_support.sub_payload('race-sub',20))))->'records'->0->'revision'='2'::jsonb);
reset role;
select test_support.ok('only accepted concurrent operation advances cursor',(select sequence from public.sumi_sync_clock where owner_id='11111111-1111-4111-8111-111111111111')=(select sequence+1 from test_support.race_before));
