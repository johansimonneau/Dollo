// Point d'entrée de la fonction (Supabase Edge Functions). La logique est dans handler.ts.
import { handle } from './handler.ts';

Deno.serve(() => handle());
