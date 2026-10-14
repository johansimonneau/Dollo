\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

begin;

-- Alice crée un bébé, Bob le rejoint avec le code
select test_as(:'alice');
insert into babies (name) values ('Léa') returning id as id, invite_code as code \gset baby_
select test_as(:'bob');
select id from join_baby(:'baby_code') \gset joined_

-- 1. Liste des membres : visible des membres, avec les e-mails, propriétaire en premier
select expect_count('Bob voit les 2 membres', format($q$select count(*) from list_members(%L)$q$, :'baby_id'), 2);
select expect_count('le propriétaire est listé en premier', format($q$select count(*) from (select * from list_members(%L) limit 1) f where role = 'owner' and email = 'alice@example.com'$q$, :'baby_id'), 1);
select test_as(:'carol');
select expect_error('Carol (étrangère) ne voit pas les membres', format($q$select * from list_members(%L)$q$, :'baby_id'), 'forbidden');

-- 2. Seul le propriétaire retire un parent
select expect_error('Carol ne peut retirer personne', format($q$select remove_member(%L, %L)$q$, :'baby_id', :'bob'), 'forbidden');
select test_as(:'bob');
select expect_error('Bob (parent) ne peut pas retirer Alice', format($q$select remove_member(%L, %L)$q$, :'baby_id', :'alice'), 'forbidden');
select test_as(:'alice');
select expect_error('Alice ne peut pas se retirer elle-même (propriétaire)', format($q$select remove_member(%L, %L)$q$, :'baby_id', :'alice'), 'not_a_member');
select expect_error('retirer un non-membre : erreur claire', format($q$select remove_member(%L, %L)$q$, :'baby_id', :'carol'), 'not_a_member');

-- 3. Alice retire Bob : il perd l'accès, et l'ancien code ne marche plus
select remove_member(:'baby_id', :'bob');
select expect_count('Bob n''est plus membre', format($q$select count(*) from list_members(%L)$q$, :'baby_id'), 1);
select expect_count('le code d''invitation a changé', format($q$select count(*) from babies where id = %L and invite_code <> %L$q$, :'baby_id', :'baby_code'), 1);
select test_as(:'bob');
select expect_count('Bob ne voit plus le bébé', format($q$select count(*) from babies where id = %L$q$, :'baby_id'), 0);
select expect_count('Bob ne voit plus les événements', format($q$select count(*) from events where baby_id = %L$q$, :'baby_id'), 0);
select expect_error('Bob ne peut pas revenir avec l''ancien code', format($q$select join_baby(%L)$q$, :'baby_code'), 'invalid_code');

-- 4. Anonyme : aucun accès
select test_as(null);
select expect_error('anon ne liste pas les membres', format($q$select * from list_members(%L)$q$, :'baby_id'), 'permission denied');
select expect_error('anon ne retire personne', format($q$select remove_member(%L, %L)$q$, :'baby_id', :'alice'), 'permission denied');

do $$ begin raise notice '=== TOUS LES TESTS MEMBRES SONT PASSÉS ==='; end $$;
rollback;
