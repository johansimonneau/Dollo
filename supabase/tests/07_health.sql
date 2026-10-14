\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

begin;

select test_as(:'alice');
insert into babies (name, birth_date) values ('Léa', '2026-08-01') returning id as id \gset baby_

-- 1. Température et médicament dans le journal
insert into events (baby_id, kind, started_at, temp_c) values (:'baby_id', 'temp', now(), 38.4);
insert into events (baby_id, kind, started_at, med_name, med_dose) values (:'baby_id', 'med', now(), 'Paracétamol', '2,4 ml');
select expect_count('température et médicament enregistrés', format($q$select count(*) from events where baby_id = %L and kind in ('temp', 'med')$q$, :'baby_id'), 2);
select expect_error('température absurde refusée', format($q$insert into events (baby_id, kind, started_at, temp_c) values (%L, 'temp', now(), 48)$q$, :'baby_id'), 'check');
select expect_error('température sans valeur refusée', format($q$insert into events (baby_id, kind, started_at) values (%L, 'temp', now())$q$, :'baby_id'), 'events_kind_fields');
select expect_error('médicament sans nom refusé', format($q$insert into events (baby_id, kind, started_at, med_dose) values (%L, 'med', now(), '1 dose')$q$, :'baby_id'), 'events_kind_fields');
select expect_error('pas de température sur un biberon', format($q$insert into events (baby_id, kind, started_at, amount_ml, temp_c) values (%L, 'bottle', now(), 90, 37)$q$, :'baby_id'), 'events_kind_fields');
update events set temp_c = 38.1 where kind = 'temp';
select expect_count('température corrigée', 'select count(*) from events where kind = ''temp'' and temp_c = 38.1', 1);

-- La nounou peut noter un médicament donné (les parents le voient : pas de double prise)
select invite_parent(:'baby_id', 'carol@example.com', 'nanny') \gset inv_
select test_as(:'carol');
select count(*) from accept_invitations() \gset acc_
insert into events (baby_id, kind, started_at, med_name, med_dose) values (:'baby_id', 'med', now(), 'Paracétamol', '2,4 ml');
select test_as(:'alice');
select expect_count('Alice voit le médicament donné par la nounou', format($q$select count(*) from events where kind = 'med' and created_by = %L$q$, :'carol'), 1);

-- 2. Traitement quotidien
insert into reminder_settings (baby_id, daily_med_name, daily_med_hour) values (:'baby_id', 'Vitamine D', 9);
select expect_error('heure sans nom refusée', format($q$update reminder_settings set daily_med_name = null where baby_id = %L$q$, :'baby_id'), 'reminder_settings_daily_med');

-- 3. Vaccins : parents seulement
insert into vaccinations (baby_id, code, given_on) values (:'baby_id', 'hexa-1', '2026-10-01');
select expect_error('une dose ne se note qu''une fois', format($q$insert into vaccinations (baby_id, code, given_on) values (%L, 'hexa-1', '2026-10-02')$q$, :'baby_id'), 'duplicate');
select expect_error('code invalide refusé', format($q$insert into vaccinations (baby_id, code, given_on) values (%L, 'DROP TABLE', '2026-10-02')$q$, :'baby_id'), 'check');
update vaccinations set given_on = '2026-10-02' where code = 'hexa-1';
select expect_error('on ne déplace pas un vaccin vers un autre bébé', format($q$update vaccinations set baby_id = gen_random_uuid() where code = 'hexa-1'$q$), 'permission denied');
select test_as(:'carol');
select expect_count('la nounou ne voit pas les vaccins', 'select count(*) from vaccinations', 0);
select expect_error('…ni n''en ajoute', format($q$insert into vaccinations (baby_id, code, given_on) values (%L, 'pcv-1', '2026-10-01')$q$, :'baby_id'), 'row-level security');
select test_as(:'bob');
select expect_count('un étranger ne voit rien', 'select count(*) from vaccinations', 0);
select test_as(null);
select expect_error('anon : rien', 'select count(*) from vaccinations', 'permission denied');

do $$ begin raise notice '=== TOUS LES TESTS SANTÉ SONT PASSÉS ==='; end $$;
rollback;
