\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

begin;

select test_as(:'alice');
insert into babies (name) values ('Léa') returning id as id \gset baby_

-- 1. Tirage
insert into events (baby_id, kind, started_at, ended_at, side, amount_ml) values (:'baby_id', 'pump', now() - interval '20 min', now(), 'both', 140);
select expect_count('tirage des deux seins enregistré', 'select count(*) from events where kind = ''pump'' and side = ''both'' and amount_ml = 140', 1);
select expect_error('« les deux » interdit pour une tétée', format($q$insert into events (baby_id, kind, started_at, side) values (%L, 'breast', now(), 'both')$q$, :'baby_id'), 'events_kind_fields');
select expect_error('pas de température sur un tirage', format($q$insert into events (baby_id, kind, started_at, temp_c) values (%L, 'pump', now(), 37)$q$, :'baby_id'), 'events_kind_fields');

-- 2. Stock
insert into milk_bags (baby_id, pumped_at, volume_ml, storage) values (:'baby_id', now(), 140, 'freezer') returning id as id \gset bag_
update milk_bags set storage = 'thawed', stored_at = now() where id = :'bag_id';
select expect_count('sachet décongelé', format($q$select count(*) from milk_bags where id = %L and storage = 'thawed'$q$, :'bag_id'), 1);
select expect_error('volume absurde refusé', format($q$insert into milk_bags (baby_id, pumped_at, volume_ml, storage) values (%L, now(), 0, 'fridge')$q$, :'baby_id'), 'check');
select expect_error('stockage inconnu refusé', format($q$insert into milk_bags (baby_id, pumped_at, volume_ml, storage) values (%L, now(), 100, 'cave')$q$, :'baby_id'), 'check');
select expect_error('un sachet ne peut pas être à la fois utilisé et jeté', format($q$update milk_bags set used_at = now(), discarded_at = now() where id = %L$q$, :'bag_id'), 'check');
select expect_error('on ne change pas le bébé d''un sachet', format($q$update milk_bags set baby_id = gen_random_uuid() where id = %L$q$, :'bag_id'), 'permission denied');

-- La nounou utilise le stock, mais ne supprime rien
select invite_parent(:'baby_id', 'carol@example.com', 'nanny') \gset inv_
select test_as(:'carol');
select count(*) from accept_invitations() \gset acc_
select expect_count('la nounou voit le stock', 'select count(*) from milk_bags', 1);
update milk_bags set used_at = now() where id = :'bag_id';
select expect_count('…et donne un sachet', format($q$select count(*) from milk_bags where id = %L and used_at is not null$q$, :'bag_id'), 1);
delete from milk_bags where id = :'bag_id';
reset role;
select expect_count('…mais ne supprime pas', format($q$select count(*) from milk_bags where id = %L$q$, :'bag_id'), 1);

select test_as(:'bob');
select expect_count('étranger : rien', 'select count(*) from milk_bags', 0);
select test_as(null);
select expect_error('anon : rien', 'select count(*) from milk_bags', 'permission denied');

do $$ begin raise notice '=== TOUS LES TESTS LAIT SONT PASSÉS ==='; end $$;
rollback;
