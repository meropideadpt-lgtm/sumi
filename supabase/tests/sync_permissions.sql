-- This file only runs inside scripts/test-sync-db.sh's disposable database.
select test_support.ok('all private tables enforce RLS',(
  select count(*)=4 and bool_and(relrowsecurity and relforcerowsecurity) from pg_class
  where oid in ('public.sumi_sync_clock'::regclass,'public.sumi_subscription_ids'::regclass,
    'public.sumi_sync_records'::regclass,'public.sumi_sync_operations'::regclass)));
select test_support.ok('no legacy no-fence RPC overload remains',to_regprocedure('public.sumi_sync_pull(bigint,integer)') is null and to_regprocedure('public.sumi_sync_push(uuid,jsonb)') is null);
select test_support.ok('bucket is private and bounds raster uploads',exists(select 1 from storage.buckets
  where id='sumi-private-logos' and public=false and file_size_limit=12582912
    and allowed_mime_types=array['image/png','image/jpeg','image/webp']));
create function test_support.sub_payload(record_id text,amount numeric default 12.34) returns jsonb language sql as $$
 select jsonb_build_object('id',record_id,'name','Legacy service 原名','amount',amount,'currency','USD',
 'months',1,'nextDate','2026-11-30','status','active','autoRenew',true,'category','Custom 自定义',
 'extension',jsonb_build_object('unchanged',true,'decimal',3.123))
$$;
create function test_support.payment_payload(record_id text,parent_id text,success boolean default true,cycle text default '2026-11-30')
returns jsonb language sql as $$
 select jsonb_build_object('id',record_id,'subscriptionId',parent_id,'name','Legacy service 原名',
 'amount',3.123,'currency','USD','date','2026-10-25','status',case when success then 'succeeded' else 'failed' end,
 'note','Keep 原始备注') || case when cycle is null then '{}'::jsonb else jsonb_build_object('cycleDate',cycle) end
$$;
create function test_support.change(k text,record_id text,base integer,p jsonb,dead boolean default false)
returns jsonb language sql as $$select jsonb_build_object('kind',k,'id',record_id,'baseRevision',base,'payload',p,'deleted',dead)$$;
grant execute on all functions in schema test_support to authenticated,anon;

set role anon;
select test_support.denied('anonymous cannot pull','select public.sumi_sync_pull(auth.uid())');
select test_support.denied('anonymous cannot push',$$select public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000001','[]')$$);
select test_support.denied('anonymous cannot read records','select * from public.sumi_sync_records');
select test_support.denied('anonymous cannot read receipts','select * from public.sumi_sync_operations');
select test_support.denied('anonymous cannot read subscription anchors','select * from public.sumi_subscription_ids');
select test_support.denied('anonymous cannot read clocks','select * from public.sumi_sync_clock');
select test_support.denied('anonymous cannot upload private logo',$$insert into storage.objects(bucket_id,name) values('sumi-private-logos','11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png')$$);
reset role;

set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select test_support.ok('new owner pull is empty',public.sumi_sync_pull(auth.uid())->'records'='[]'::jsonb);
select test_support.denied('A token cannot pull with B workspace fence',$$select public.sumi_sync_pull('22222222-2222-4222-8222-222222222222')$$);
select test_support.denied('A token cannot push with B workspace fence',$$select public.sumi_sync_push('22222222-2222-4222-8222-222222222222','00000000-0000-4000-8000-000000000097','[]')$$);
select test_support.denied('NULL expected owner cannot pull',$$select public.sumi_sync_pull(null)$$);
select test_support.denied('NULL expected owner cannot push',$$select public.sumi_sync_push(null,'00000000-0000-4000-8000-000000000097','[]')$$);

do $$declare result jsonb; changes jsonb; repeat_result jsonb; fx jsonb; begin
 fx:='{"version":1,"status":"available","provider":"identity","sourceCurrency":"USD","sourceAmount":3.123,"displayCurrency":"USD","base":"USD","rate":1,"convertedAmount":3.123,"date":null,"fetchedAt":null,"confirmedAt":"2026-10-25T10:00:00.000Z","rates":{"USD":1},"reason":null}'::jsonb;
 changes:=jsonb_build_array(
   test_support.change('subscriptions','legacy/subscription:one',0,test_support.sub_payload('legacy/subscription:one')),
   test_support.change('payments','legacy-payment',0,test_support.payment_payload('legacy-payment','legacy/subscription:one')||jsonb_build_object('fxSnapshot',fx)),
   test_support.change('costHistory','legacy-cost',0,'{"id":"legacy-cost","subscriptionId":"legacy/subscription:one","name":"Legacy service 原名","amount":12.34,"currency":"USD","months":1,"category":"Custom 自定义","status":"active","kind":"baseline","effectiveDate":"2026-10-25","observedAt":"2026-10-25T10:00:00.000Z"}'),
   test_support.change('preferences','language',0,'{"value":"ja-JP"}'),
   test_support.change('preferences','theme',0,'{"value":"dark"}'),
   test_support.change('extensions','customCategories',0,'{"value":["Custom 自定义","第二分类"]}'),
   test_support.change('extensions','unknownBusinessField',0,'{"value":{"nested":true,"number":1.23456789}}')
 );
 result:=public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000001',changes);
 perform test_support.ok('owner can create atomic mixed records',result->'ok'='true'::jsonb and jsonb_array_length(result->'records')=7);
 perform test_support.ok('old ID and all subscription fields preserved',exists(select 1 from public.sumi_sync_records
   where id='legacy/subscription:one' and payload=test_support.sub_payload('legacy/subscription:one')));
 perform test_support.ok('frozen FX and original decimal retained exactly',exists(select 1 from public.sumi_sync_records
   where id='legacy-payment' and payload->'fxSnapshot'=fx and payload->'amount'='3.123'::jsonb));
 repeat_result:=public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000001',changes);
 perform test_support.ok('retry returns same receipt without duplicates',repeat_result=result and (select count(*) from public.sumi_sync_records)=7);
 perform test_support.denied('same operation cannot be reused for different data',format('select public.sumi_sync_push(auth.uid(),%L,%L::jsonb)',
   '00000000-0000-4000-8000-000000000001',changes||jsonb_build_array(test_support.change('preferences','currency',0,'{"value":"CNY"}'))),'22023');
end $$;
select test_support.ok('owner can read only own rows',(select count(*)=7 and bool_and(owner_id=auth.uid()) from public.sumi_sync_records));
select test_support.denied('direct own insert cannot bypass CAS',$$insert into public.sumi_sync_records(owner_id,kind,id,payload,revision,seq) values(auth.uid(),'preferences','currency','{"value":"USD"}',1,100)$$);
select test_support.denied('direct foreign insert denied',$$insert into public.sumi_sync_records(owner_id,kind,id,payload,revision,seq) values('22222222-2222-4222-8222-222222222222','preferences','currency','{"value":"USD"}',1,100)$$);
select test_support.denied('direct payload update denied',$$update public.sumi_sync_records set payload='{"value":"en"}' where kind='preferences'$$);
select test_support.denied('direct ownership update denied',$$update public.sumi_sync_records set owner_id='22222222-2222-4222-8222-222222222222'$$);
select test_support.denied('direct delete denied','delete from public.sumi_sync_records');
select test_support.denied('clock cannot be manipulated','update public.sumi_sync_clock set sequence=0');
select test_support.denied('receipts cannot be deleted','delete from public.sumi_sync_operations');
select test_support.denied('anchor cannot be forged',$$insert into public.sumi_subscription_ids values('22222222-2222-4222-8222-222222222222','forged')$$);
select test_support.denied('private validation helper is not exposed',$$select sumi_private.valid_date('2026-10-25')$$);
select test_support.denied('owner_id envelope injection rejected',$$select public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000002','[{"kind":"preferences","id":"currency","baseRevision":0,"payload":{"value":"USD"},"deleted":false,"owner_id":"22222222-2222-4222-8222-222222222222"}]')$$,'22023');
select test_support.denied('invalid payload prevents partial batch',$$select public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000003',jsonb_build_array(test_support.change('preferences','currency',0,'{"value":"CNY"}'),test_support.change('subscriptions','bad',0,'{"id":"bad"}')))$$,'22023');
select test_support.ok('invalid batch wrote no first item',not exists(select 1 from public.sumi_sync_records where id='currency'));
select test_support.denied('duplicate keys in batch rejected',$$select public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000004',jsonb_build_array(test_support.change('preferences','currency',0,'{"value":"CNY"}'),test_support.change('preferences','currency',0,'{"value":"USD"}')))$$,'22023');
select test_support.denied('null payment status is not silently successful',$$select public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000098',jsonb_build_array(test_support.change('payments','bad-null-status',0,test_support.payment_payload('bad-null-status','legacy/subscription:one')||'{"status":null}'::jsonb)))$$,'22023');
select test_support.denied('negative cursor rejected','select public.sumi_sync_pull(auth.uid(),-1)','22023');
select test_support.denied('ahead cursor rejected','select public.sumi_sync_pull(auth.uid(),9999999)','22023');
select test_support.denied('unbounded page rejected','select public.sumi_sync_pull(auth.uid(),0,1001)','22023');
select test_support.ok('cursor values use lossless strings',jsonb_typeof(public.sumi_sync_pull(auth.uid())->'cursor')='string');

do $$declare result jsonb; first_page jsonb; next_page jsonb; begin
 result:=public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000005',jsonb_build_array(
   test_support.change('subscriptions','legacy/subscription:one',0,test_support.sub_payload('legacy/subscription:one',99)),
   test_support.change('preferences','currency',0,'{"value":"CNY"}')));
 perform test_support.ok('one stale revision rejects entire batch',result->'ok'='false'::jsonb and jsonb_array_length(result->'conflicts')=1
   and not exists(select 1 from public.sumi_sync_records where id='currency')
   and (select payload->'amount'='12.34'::jsonb from public.sumi_sync_records where id='legacy/subscription:one'));
 perform test_support.ok('conflict reports full server revision',result->'conflicts'->0->'remote'->'revision'='1'::jsonb);
 first_page:=public.sumi_sync_pull(auth.uid(),0,2); next_page:=public.sumi_sync_pull(auth.uid(),(first_page->>'cursor')::bigint,2);
 perform test_support.ok('incremental pages advance without repeated rows',first_page->'more'='true'::jsonb and jsonb_array_length(first_page->'records')=2
  and (next_page->>'cursor')::bigint>(first_page->>'cursor')::bigint
  and not exists(select 1 from jsonb_array_elements(first_page->'records') a,jsonb_array_elements(next_page->'records') b where a->'seq'=b->'seq'));
 result:=public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000006',jsonb_build_array(
  test_support.change('payments','duplicate-payment',0,test_support.payment_payload('duplicate-payment','legacy/subscription:one'))));
 perform test_support.ok('different payment ID cannot double-confirm same cycle',result->'ok'='false'::jsonb and result->'conflicts'->0->>'reason'='paid-cycle'
   and not exists(select 1 from public.sumi_sync_records where id='duplicate-payment'));
 result:=public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000007',jsonb_build_array(
  test_support.change('payments','failed-payment',0,test_support.payment_payload('failed-payment','legacy/subscription:one',false))));
 perform test_support.ok('failed attempt is not mistaken for successful payment',result->'ok'='true'::jsonb);
 result:=public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000008',jsonb_build_array(
  test_support.change('payments','archived-duplicate',0,test_support.payment_payload('archived-duplicate','legacy/subscription:one')||'{"scheduleArchived":true,"advancesSchedule":false}'::jsonb)));
 perform test_support.ok('archived successful cycle still prevents duplicate success',result->'ok'='false'::jsonb);
 result:=public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000009',jsonb_build_array(
  test_support.change('subscriptions','legacy/subscription:one',1,null,true)));
 perform test_support.ok('parent deletion cannot silently discard unobserved payment',result->'ok'='false'::jsonb
   and result->'conflicts'->0->>'reason'='dependent-records');
end $$;

-- A second owner starts empty and can reuse textual record IDs only in own scope.
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select test_support.denied('B token cannot pull with A workspace fence',$$select public.sumi_sync_pull('11111111-1111-4111-8111-111111111111')$$);
select test_support.denied('B token cannot push with A workspace fence',$$select public.sumi_sync_push('11111111-1111-4111-8111-111111111111','00000000-0000-4000-8000-000000000097','[]')$$);
select test_support.ok('new device different account sees empty cloud',public.sumi_sync_pull(auth.uid())->'records'='[]'::jsonb);
select test_support.ok('user B cannot select user A records',(select count(*)=0 from public.sumi_sync_records));
select test_support.ok('user B cannot infer user A revision',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000001',jsonb_build_array(
 test_support.change('subscriptions','legacy/subscription:one',1,test_support.sub_payload('legacy/subscription:one'))))->'conflicts'->0->'remote'='null'::jsonb);
select test_support.ok('user B can create same textual ID in separate owner scope',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000001',jsonb_build_array(
 test_support.change('subscriptions','legacy/subscription:one',0,test_support.sub_payload('legacy/subscription:one',50))))->'ok'='true'::jsonb);
select test_support.ok('B sees only B payload',(select count(*)=1 and bool_and(payload->'amount'='50'::jsonb) from public.sumi_sync_records));
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
select test_support.ok('B operation ID does not collide with A receipt',(select payload->'amount'='12.34'::jsonb from public.sumi_sync_records where id='legacy/subscription:one'));

-- An explicit batch deletes the observed parent and both children, retaining all tombstones.
select test_support.ok('owner can atomically delete parent and observed payments',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000010',jsonb_build_array(
 test_support.change('subscriptions','legacy/subscription:one',1,null,true),
 test_support.change('payments','legacy-payment',1,null,true),
 test_support.change('payments','failed-payment',1,null,true)))->'ok'='true'::jsonb);
select test_support.ok('deletion keeps tombstone revision',(select payload is null and deleted_at is not null and revision=2 from public.sumi_sync_records where id='legacy/subscription:one'));
select test_support.ok('stale device cannot resurrect deleted subscription',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000011',jsonb_build_array(
 test_support.change('subscriptions','legacy/subscription:one',1,test_support.sub_payload('legacy/subscription:one'))))->'ok'='false'::jsonb);
select test_support.ok('new payment cannot silently target tombstoned parent',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000012',jsonb_build_array(
 test_support.change('payments','offline-new-payment',0,test_support.payment_payload('offline-new-payment','legacy/subscription:one',false))))->'conflicts'->0->>'reason'='parent-deleted');
select test_support.ok('old cost history still references deleted subscription',exists(select 1 from public.sumi_sync_records where id='legacy-cost' and deleted_at is null));
select test_support.ok('legacy orphan payment preserved using owner-scoped anchor',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000013',jsonb_build_array(
 test_support.change('payments','orphan-payment',0,test_support.payment_payload('orphan-payment','deleted-before-sync',true,null))))->'ok'='true'::jsonb);
select test_support.ok('explicit current-revision restore is possible',public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000014',jsonb_build_array(
 test_support.change('subscriptions','legacy/subscription:one',2,test_support.sub_payload('legacy/subscription:one',20))))->'ok'='true'::jsonb);
set request.jwt.claim.sub='';
select test_support.denied('authenticated role without identity cannot pull','select public.sumi_sync_pull(auth.uid())','28000');
select test_support.denied('authenticated role without identity cannot push',$$select public.sumi_sync_push(auth.uid(),'00000000-0000-4000-8000-000000000001','[]')$$,'28000');
reset role;
select test_support.ok('payment snapshots retained in accepted operation history',exists(select 1 from public.sumi_sync_operations
 where owner_id='11111111-1111-4111-8111-111111111111' and operation_id='00000000-0000-4000-8000-000000000001'
 and changes->1->'payload'->'fxSnapshot'->'sourceAmount'='3.123'::jsonb));
select test_support.denied('owner immutability also enforced on privileged table update',$$update public.sumi_sync_records set owner_id='22222222-2222-4222-8222-222222222222' where owner_id='11111111-1111-4111-8111-111111111111' and kind='preferences'$$);
select test_support.denied('FK cannot reference another owner anchor',$$insert into public.sumi_sync_records(owner_id,kind,id,payload,revision,seq) values('22222222-2222-4222-8222-222222222222','payments','foreign-anchor','{"subscriptionId":"deleted-before-sync"}',1,999)$$,'23503');

-- Test Storage RLS even in the presence of an unrelated overly-broad policy.
create policy test_broad_storage_policy on storage.objects for all to authenticated using(true) with check(true);
set role authenticated;
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
insert into storage.objects(bucket_id,name,owner_id) values('sumi-private-logos','11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png','11111111-1111-4111-8111-111111111111');
select test_support.ok('owner can upload and select own logo',(select count(*)=1 from storage.objects));
select test_support.denied('hash path cannot be overwritten',$$insert into storage.objects(bucket_id,name,owner_id) values('sumi-private-logos','11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png','11111111-1111-4111-8111-111111111111')$$,'23505');
select test_support.denied('object metadata cannot claim another owner',$$insert into storage.objects(bucket_id,name,owner_id) values('sumi-private-logos','11111111-1111-4111-8111-111111111111/cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc.png','22222222-2222-4222-8222-222222222222')$$);
select test_support.denied('cross-owner object upload denied',$$insert into storage.objects(bucket_id,name) values('sumi-private-logos','22222222-2222-4222-8222-222222222222/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png')$$);
select test_support.denied('SVG object path denied',$$insert into storage.objects(bucket_id,name) values('sumi-private-logos','11111111-1111-4111-8111-111111111111/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.svg')$$);
select test_support.denied('non-hash object path denied',$$insert into storage.objects(bucket_id,name) values('sumi-private-logos','11111111-1111-4111-8111-111111111111/custom.png')$$);
select test_support.denied('object path traversal denied',$$insert into storage.objects(bucket_id,name) values('sumi-private-logos','11111111-1111-4111-8111-111111111111/../22222222-2222-4222-8222-222222222222/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png')$$);
with changed as (update storage.objects set owner_id='22222222-2222-4222-8222-222222222222' returning *) select test_support.ok('object owner metadata cannot change',(select count(*)=0 from changed));
with changed as (update storage.objects set name='22222222-2222-4222-8222-222222222222/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.png' returning *) select test_support.ok('object cannot move across owners',(select count(*)=0 from changed));
set request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
select test_support.ok('B cannot select A object for private download authorization',(select count(*)=0 from storage.objects));
with removed as (delete from storage.objects where bucket_id='sumi-private-logos' returning *) select test_support.ok('B cannot delete A object',(select count(*)=0 from removed));
insert into storage.objects(bucket_id,name,owner_id) values('sumi-private-logos','22222222-2222-4222-8222-222222222222/bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb.webp','22222222-2222-4222-8222-222222222222');
select test_support.ok('B can keep its own image',(select count(*)=1 from storage.objects));
set request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
with removed as (delete from storage.objects where bucket_id='sumi-private-logos' returning *) select test_support.ok('owner can delete own image only',(select count(*)=1 from removed));
reset role;
set role anon;
set request.jwt.claim.sub='';
select test_support.ok('anonymous cannot list private images',(select count(*)=0 from storage.objects));
with removed as (delete from storage.objects where bucket_id='sumi-private-logos' returning *) select test_support.ok('anonymous cannot delete private images',(select count(*)=0 from removed));
reset role;
drop policy test_broad_storage_policy on storage.objects;
