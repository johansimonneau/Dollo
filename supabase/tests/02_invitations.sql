\set ON_ERROR_STOP on
\set alice '00000000-0000-0000-0000-00000000000a'
\set bob   '00000000-0000-0000-0000-00000000000b'
\set carol '00000000-0000-0000-0000-00000000000c'
\set dave  '00000000-0000-0000-0000-00000000000d'

begin;

-- Alice crée un bébé
select test_as(:'alice');
insert into babies (name) values ('Léa') returning id as id \gset baby_

-- 1. Alice invite Bob : l'adresse est normalisée (casse, espaces)
select invite_parent(:'baby_id', '  Bob@Example.COM ') \gset inv_
select expect_count('invitation enregistrée en minuscules, sans espaces', format($q$select count(*) from baby_invitations where baby_id = %L and email = 'bob@example.com' and accepted_at is null$q$, :'baby_id'), 1);
select expect_count('expiration à ~14 jours', format($q$select count(*) from baby_invitations where baby_id = %L and expires_at between now() + interval '13 days' and now() + interval '15 days'$q$, :'baby_id'), 1);

-- 2. Réinviter la même adresse renouvelle l'invitation (pas de doublon)
select invite_parent(:'baby_id', 'bob@example.com') \gset inv2_
select expect_count('réinviter ne crée pas de doublon', format($q$select count(*) from baby_invitations where baby_id = %L and email = 'bob@example.com'$q$, :'baby_id'), 1);

-- 3. Validation
select expect_error('e-mail invalide refusé', format($q$select invite_parent(%L, 'pas-un-email')$q$, :'baby_id'), 'invalid_email');
select expect_error('e-mail vide refusé', format($q$select invite_parent(%L, '')$q$, :'baby_id'), 'invalid_email');
select expect_error('e-mail sans domaine refusé', format($q$select invite_parent(%L, 'a@b')$q$, :'baby_id'), 'invalid_email');
select expect_error('on ne peut pas inviter un parent déjà membre', format($q$select invite_parent(%L, 'alice@example.com')$q$, :'baby_id'), 'already_member');

-- 4. Accès : un étranger n'invite pas, ne voit rien, n'annule rien
select test_as(:'carol');
select expect_error('Carol (étrangère) ne peut pas inviter', format($q$select invite_parent(%L, 'x@example.com')$q$, :'baby_id'), 'forbidden');
select expect_count('Carol ne voit aucune invitation', 'select count(*) from baby_invitations', 0);
delete from baby_invitations;
select expect_error('INSERT direct interdit (même pour un étranger)', format($q$insert into baby_invitations (baby_id, email, invited_by) values (%L, 'z@example.com', %L)$q$, :'baby_id', :'carol'), 'permission denied');
select test_as(:'alice');
select expect_error('INSERT direct interdit (même pour un parent)', format($q$insert into baby_invitations (baby_id, email, invited_by) values (%L, 'z@example.com', %L)$q$, :'baby_id', :'alice'), 'permission denied');
select expect_error('UPDATE direct interdit (impossible de prolonger / s''auto-accepter)', $$update baby_invitations set accepted_at = now()$$, 'permission denied');
select expect_count('l''invitation de Bob a survécu à la tentative de Carol', 'select count(*) from baby_invitations', 1);

-- 5. Anti-abus : 5 invitations en attente au plus
select invite_parent(:'baby_id', 'a1@example.com') \gset x1_
select invite_parent(:'baby_id', 'a2@example.com') \gset x2_
select invite_parent(:'baby_id', 'a3@example.com') \gset x3_
select invite_parent(:'baby_id', 'a4@example.com') \gset x4_
select expect_error('6e invitation en attente refusée', format($q$select invite_parent(%L, 'a5@example.com')$q$, :'baby_id'), 'too_many_invitations');
select invite_parent(:'baby_id', 'a1@example.com') \gset x5_  -- renouveler une existante reste possible
-- on libère de la place pour la suite
delete from baby_invitations where email like 'a_@example.com';

-- 6. Bob accepte : il rejoint le bébé, et seulement après
select test_as(:'bob');
select expect_count('Bob ne voit rien avant d''accepter', 'select count(*) from babies', 0);
select expect_count('accept_invitations renvoie le bébé rejoint', 'select count(*) from accept_invitations()', 1);
select expect_count('Bob est maintenant parent', format($q$select count(*) from baby_members where baby_id = %L and user_id = %L and role = 'parent'$q$, :'baby_id', :'bob'), 1);
select expect_count('Bob voit le bébé', 'select count(*) from babies', 1);
select expect_count('une 2e acceptation ne renvoie rien (déjà acceptée)', 'select count(*) from accept_invitations()', 0);
select expect_count('et ne duplique pas l''appartenance', format($q$select count(*) from baby_members where baby_id = %L and user_id = %L$q$, :'baby_id', :'bob'), 1);
select test_as(:'alice');
select expect_count('Alice voit l''invitation de Bob comme acceptée', 'select count(*) from baby_invitations where email = ''bob@example.com'' and accepted_at is not null', 1);
select expect_error('on ne réinvite pas un parent qui a rejoint', format($q$select invite_parent(%L, 'bob@example.com')$q$, :'baby_id'), 'already_member');
delete from baby_invitations where email = 'bob@example.com';
select expect_count('une invitation acceptée ne peut pas être supprimée (historique)', 'select count(*) from baby_invitations where email = ''bob@example.com''', 1);

-- 7. E-mail NON vérifié : l'invitation n'est pas acceptée (sinon n'importe qui pourrait s'inscrire avec l'adresse)
select invite_parent(:'baby_id', 'dave@example.com') \gset dv_
select test_as(:'dave');
select expect_count('Dave (e-mail non vérifié) : rien n''est accepté', 'select count(*) from accept_invitations()', 0);
select expect_count('Dave n''est pas devenu parent', format($q$select count(*) from baby_members where baby_id = %L and user_id = %L$q$, :'baby_id', :'dave'), 0);
select expect_count('Dave ne voit toujours rien', 'select count(*) from babies', 0);

-- 8. Invitation EXPIRÉE : refusée
reset role;
update baby_invitations set expires_at = now() - interval '1 day' where email = 'dave@example.com';
update auth.users set email_confirmed_at = now() where id = :'dave';   -- Dave vérifie son e-mail…
select test_as(:'dave');
select expect_count('…mais l''invitation a expiré : rien n''est accepté', 'select count(*) from accept_invitations()', 0);
-- Alice renouvelle : l'invitation redevient valable
select test_as(:'alice');
select invite_parent(:'baby_id', 'dave@example.com') \gset dv2_
select test_as(:'dave');
select expect_count('invitation renouvelée puis acceptée', 'select count(*) from accept_invitations()', 1);

-- 9. Annulation par un parent : l'invité ne peut plus rejoindre
select test_as(:'alice');
reset role;
insert into auth.users (id, email, email_confirmed_at) values ('00000000-0000-0000-0000-00000000000e', 'eve@example.com', now());
select test_as(:'alice');
select invite_parent(:'baby_id', 'eve@example.com') \gset ev_
select expect_count('Alice voit l''invitation d''Eve en attente', 'select count(*) from baby_invitations where email = ''eve@example.com'' and accepted_at is null', 1);
delete from baby_invitations where email = 'eve@example.com' and accepted_at is null;
select test_as('00000000-0000-0000-0000-00000000000e');
select expect_count('invitation annulée : Eve ne rejoint rien', 'select count(*) from accept_invitations()', 0);

-- 10. Un parent ne peut pas inviter pour un bébé qui n'est pas le sien (même membre d'un autre)
select test_as(:'carol');
insert into babies (name) values ('Tom') returning id as id \gset tom_
select expect_error('Carol ne peut pas inviter sur le bébé d''Alice', format($q$select invite_parent(%L, 'q@example.com')$q$, :'baby_id'), 'forbidden');
select invite_parent(:'tom_id', 'q@example.com') \gset q_
select test_as(:'bob');
select expect_error('Bob ne peut pas inviter sur le bébé de Carol', format($q$select invite_parent(%L, 'r@example.com')$q$, :'tom_id'), 'forbidden');
select expect_count('Bob ne voit pas les invitations de Carol', 'select count(*) from baby_invitations where baby_id = ''' || :'tom_id' || '''', 0);

-- 11. Anonyme : aucun accès
select test_as(null);
select expect_error('anon ne lit pas les invitations', 'select count(*) from baby_invitations', 'permission denied');
select expect_error('anon ne peut pas inviter', format($q$select invite_parent(%L, 'x@example.com')$q$, :'baby_id'), 'permission denied');
select expect_error('anon ne peut pas accepter', 'select * from accept_invitations()', 'permission denied');

-- 12. Suppression du bébé : les invitations disparaissent avec lui
select test_as(:'alice');
delete from babies where id = :'baby_id';
reset role;
select expect_count('cascade : plus d''invitations pour ce bébé', format($q$select count(*) from baby_invitations where baby_id = %L$q$, :'baby_id'), 0);

do $$ begin raise notice '=== TOUS LES TESTS INVITATIONS SONT PASSÉS ==='; end $$;
rollback;
