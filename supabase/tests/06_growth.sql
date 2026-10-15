\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'

begin;

select test_as(:'alice');
insert into babies (name, birth_date) values ('Léa', '2026-09-01') returning id as id, invite_code as code \gset baby_
update babies set sex = 'f' where id = :'baby_id';
select expect_count('le parent renseigne le sexe', format($q$select count(*) from list_my_babies() where id = %L and sex = 'f'$q$, :'baby_id'), 1);
select expect_error('sexe inconnu refusé', format($q$update babies set sex = 'x' where id = %L$q$, :'baby_id'), 'check');

-- Mesures
insert into measurements (baby_id, measured_on, weight_g, length_mm, head_mm) values (:'baby_id', '2026-10-01', 4200, 540, 370) returning id as id \gset m_
select expect_count('mesure enregistrée par Alice', format($q$select count(*) from measurements where baby_id = %L and created_by = %L$q$, :'baby_id', :'alice'), 1);
select expect_error('mesure vide refusée', format($q$insert into measurements (baby_id, measured_on) values (%L, '2026-10-02')$q$, :'baby_id'), 'check');
select expect_error('poids absurde refusé (4,2 t)', format($q$insert into measurements (baby_id, measured_on, weight_g) values (%L, '2026-10-02', 4200000)$q$, :'baby_id'), 'check');

-- Co-parent : accès complet
select test_as(:'bob');
select expect_count('Bob (étranger) ne voit rien', 'select count(*) from measurements', 0);
select expect_error('Bob ne mesure pas le bébé d''Alice', format($q$insert into measurements (baby_id, measured_on, weight_g) values (%L, '2026-10-02', 4300)$q$, :'baby_id'), 'row-level security');
select id from join_baby(:'baby_code') \gset j_
select expect_count('Bob, devenu parent, voit la mesure', 'select count(*) from measurements', 1);
update measurements set weight_g = 4250 where id = :'m_id';
select expect_count('…et la corrige', format($q$select count(*) from measurements where id = %L and weight_g = 4250$q$, :'m_id'), 1);
select expect_error('…mais pas son auteur', format($q$update measurements set created_by = %L where id = %L$q$, :'bob', :'m_id'), 'permission denied');

-- Nounou : aucun accès aux données de santé
select test_as(:'alice');
select invite_parent(:'baby_id', 'carol@example.com', 'nanny') \gset inv_
select test_as(:'carol');
select count(*) from accept_invitations() \gset acc_
select expect_count('la nounou ne voit pas les mesures', 'select count(*) from measurements', 0);
select expect_error('…ni n''en ajoute', format($q$insert into measurements (baby_id, measured_on, weight_g) values (%L, '2026-10-02', 4300)$q$, :'baby_id'), 'row-level security');
select expect_count('…ni ne voit le sexe', format($q$select count(*) from list_my_babies() where id = %L and sex is null$q$, :'baby_id'), 1);

select test_as(null);
select expect_error('anon : rien', 'select count(*) from measurements', 'permission denied');

do $$ begin raise notice '=== TOUS LES TESTS CROISSANCE SONT PASSÉS ==='; end $$;
rollback;
