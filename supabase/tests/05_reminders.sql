\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

begin;

select test_as(:'alice');
insert into babies (name) values ('Léa') returning id as id \gset baby_

-- 1. Réglages : les siens, pour un bébé dont on est membre
insert into reminder_settings (baby_id, feed_every_min, diaper_dry_hours, quiet_night, time_zone) values (:'baby_id', 180, 6, true, 'Europe/Paris');
select expect_count('Alice enregistre ses réglages', format($q$select count(*) from reminder_settings where baby_id = %L and user_id = %L and feed_every_min = 180$q$, :'baby_id', :'alice'), 1);
select expect_error('intervalle absurde refusé', format($q$insert into reminder_settings (baby_id, feed_every_min) values (%L, 5) on conflict (user_id, baby_id) do update set feed_every_min = 5$q$, :'baby_id'), 'check');
update reminder_settings set feed_every_min = 150 where baby_id = :'baby_id';
select expect_count('Alice modifie ses réglages', format($q$select count(*) from reminder_settings where baby_id = %L and feed_every_min = 150$q$, :'baby_id'), 1);

select test_as(:'bob');
select expect_count('Bob (étranger) ne voit pas les réglages d''Alice', 'select count(*) from reminder_settings', 0);
select expect_error('Bob ne crée pas de réglages pour un bébé qui n''est pas le sien', format($q$insert into reminder_settings (baby_id, feed_every_min) values (%L, 180)$q$, :'baby_id'), 'row-level security');
select expect_error('Bob ne crée pas de réglages au nom d''Alice', format($q$insert into reminder_settings (user_id, baby_id, feed_every_min) values (%L, %L, 180)$q$, :'alice', :'baby_id'), 'row-level security');
update reminder_settings set feed_every_min = 30 where baby_id = :'baby_id';
reset role;
select expect_count('…ni ne les modifie', format($q$select count(*) from reminder_settings where baby_id = %L and feed_every_min = 150$q$, :'baby_id'), 1);

-- La nounou (membre) peut avoir ses propres rappels
select test_as(:'alice');
select invite_parent(:'baby_id', 'carol@example.com', 'nanny') \gset inv_
select test_as(:'carol');
select count(*) from accept_invitations() \gset acc_
insert into reminder_settings (baby_id, feed_every_min) values (:'baby_id', 180);
select expect_count('la nounou a ses propres réglages', 'select count(*) from reminder_settings', 1);

-- 2. Abonnements push : les siens uniquement
select test_as(:'alice');
insert into push_subscriptions (endpoint, p256dh, auth) values ('https://push.example.com/abc', 'k', 'a');
select expect_error('adresse de push non https refusée', $q$insert into push_subscriptions (endpoint, p256dh, auth) values ('http://evil.example.com', 'k', 'a')$q$, 'check');
select test_as(:'bob');
select expect_count('Bob ne voit pas les appareils d''Alice', 'select count(*) from push_subscriptions', 0);
delete from push_subscriptions;
reset role;
select expect_count('…ni ne les supprime', 'select count(*) from push_subscriptions', 1);

-- 3. Journal d'envoi : invisible et non modifiable depuis l'API
select test_as(:'alice');
select expect_error('reminder_sent illisible', 'select count(*) from reminder_sent', 'permission denied');
select expect_error('reminder_sent non modifiable', format($q$insert into reminder_sent (user_id, baby_id, kind, ref_id) values (%L, %L, 'feed', gen_random_uuid())$q$, :'alice', :'baby_id'), 'permission denied');

-- 4. Anonyme : rien
select test_as(null);
select expect_error('anon ne lit pas les réglages', 'select count(*) from reminder_settings', 'permission denied');
select expect_error('anon ne lit pas les abonnements', 'select count(*) from push_subscriptions', 'permission denied');

-- 5. Retrait de la nounou : ses rappels pour ce bébé disparaissent (plus aucune notification)
select test_as(:'alice');
select remove_member(:'baby_id', :'carol');
reset role;
select expect_count('nounou retirée : ses rappels sont supprimés', format($q$select count(*) from reminder_settings where baby_id = %L and user_id = %L$q$, :'baby_id', :'carol'), 0);
select expect_count('ceux d''Alice restent', format($q$select count(*) from reminder_settings where baby_id = %L$q$, :'baby_id'), 1);
delete from babies where id = :'baby_id';
select expect_count('…après suppression du bébé', format($q$select count(*) from reminder_settings where baby_id = %L$q$, :'baby_id'), 0);

do $$ begin raise notice '=== TOUS LES TESTS RAPPELS SONT PASSÉS ==='; end $$;
rollback;
