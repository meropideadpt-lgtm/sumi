set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select test_support.ok('pull waits for committed clock and does not skip delayed write',exists(
 select 1 from jsonb_array_elements(public.sumi_sync_pull(auth.uid(),(select sequence from test_support.race_before))->'records') r
 where r->>'id'='race-sub' and r->'revision'='2'::jsonb and r->'payload'->'amount'='20'::jsonb));
select test_support.ok('concurrent stale financial edit reports conflict',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000022',jsonb_build_array(
 test_support.change('subscriptions','race-sub',1,test_support.sub_payload('race-sub',30))))->'ok'='false'::jsonb);
