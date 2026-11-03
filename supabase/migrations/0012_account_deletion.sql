-- Suppression de compte depuis l'app (RGPD, et exigée par l'App Store).
--
-- Le compte est supprimé par la fonction serveur `delete-account` (API d'administration Supabase), après résiliation
-- du paiement Stripe. Ce qui disparaît avec lui (cascades déjà en place) : ses accès aux bébés, ses invitations, ses
-- rappels et appareils, ses droits Dollo+ et ses mesures de campagne.
--
-- Ce que cette migration garantit en plus :
--   1. un bébé partagé n'est JAMAIS supprimé avec le compte de l'un des parents : le suivi passe à l'autre parent
--      (le plus ancien), avec tout son journal ;
--   2. la suppression ne peut pas échouer sur une mesure, un vaccin ou un sachet de lait noté par ce compte : la ligne
--      reste (elle appartient au bébé), seul l'auteur est effacé (comme pour les événements depuis 0001).
-- Un bébé que la personne était seule à suivre (sans autre parent ; une nounou ne compte pas) est supprimé avec elle.

------------------------------------------------------------------------------
-- 2. Auteur effacé, donnée gardée
------------------------------------------------------------------------------
alter table public.measurements alter column created_by drop not null;
alter table public.measurements drop constraint measurements_created_by_fkey;
alter table public.measurements add constraint measurements_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table public.vaccinations alter column created_by drop not null;
alter table public.vaccinations drop constraint vaccinations_created_by_fkey;
alter table public.vaccinations add constraint vaccinations_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

alter table public.milk_bags alter column created_by drop not null;
alter table public.milk_bags drop constraint milk_bags_created_by_fkey;
alter table public.milk_bags add constraint milk_bags_created_by_fkey
  foreign key (created_by) references auth.users (id) on delete set null;

------------------------------------------------------------------------------
-- 1. Transmission des bébés partagés (appelée par la fonction serveur juste avant la suppression du compte)
------------------------------------------------------------------------------
create or replace function public.prepare_account_deletion(p_user_id uuid)
returns table (baby_id uuid, kept boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  b record;
  heir uuid;
begin
  for b in select id from public.babies where created_by = p_user_id order by created_at for update loop
    select m.user_id into heir
    from public.baby_members m
    where m.baby_id = b.id and m.user_id <> p_user_id and m.role in ('owner', 'parent')
    order by m.joined_at, m.user_id
    limit 1;

    if heir is not null then
      update public.baby_members set role = 'owner' where baby_members.baby_id = b.id and user_id = heir;
      update public.babies set created_by = heir where id = b.id;
    end if;
    baby_id := b.id;
    kept := heir is not null;
    return next;
  end loop;
end;
$$;

revoke all on function public.prepare_account_deletion(uuid) from public, anon, authenticated;
grant execute on function public.prepare_account_deletion(uuid) to service_role;
