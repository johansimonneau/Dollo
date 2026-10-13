-- Fonctions utilitaires partagées par les suites de tests (à charger une fois, avant 01_*.sql / 02_*.sql).

create function test_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', coalesce(uid::text, ''), true);
  if uid is null then execute 'set local role anon'; else execute 'set local role authenticated'; end if;
end $$;

-- Exécute `sql`, exige une erreur dont le message contient `expect`.
create function expect_error(label text, sql text, expect text) returns void language plpgsql as $$
begin
  begin
    execute sql;
  exception when others then
    if sqlerrm ilike '%' || expect || '%' then
      raise notice 'PASS  % -> %', label, sqlerrm; return;
    end if;
    raise exception 'FAIL  %: erreur inattendue "%" (attendu "%")', label, sqlerrm, expect;
  end;
  raise exception 'FAIL  %: aucune erreur (attendu "%")', label, expect;
end $$;

-- Exige que `sql` (un SELECT count(*)) renvoie n.
create function expect_count(label text, sql text, n bigint) returns void language plpgsql as $$
declare got bigint;
begin
  execute sql into got;
  if got is distinct from n then raise exception 'FAIL  %: % ligne(s), attendu %', label, got, n; end if;
  raise notice 'PASS  % (=%)', label, got;
end $$;
