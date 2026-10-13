-- Fixe le search_path de la fonction de trigger (alerte Supabase « Function Search Path Mutable »).
-- Elle n'utilise que now(), qui vit dans pg_catalog : un search_path vide suffit.
alter function public.touch_updated_at() set search_path = '';
