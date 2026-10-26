set application_name='sumi-concurrency-a';
begin;
set local role authenticated;
set local request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select test_support.ok('first concurrent write accepted',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000021',jsonb_build_array(
 test_support.change('subscriptions','race-sub',1,test_support.sub_payload('race-sub',20))))->'ok'='true'::jsonb);
select pg_sleep(2);
commit;
