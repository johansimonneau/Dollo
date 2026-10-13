# Dollo

Le journal de bébé pour parents épuisés : **tétées (sein gauche / droit, avec chrono), biberons, couches (pipi / caca), siestes et nuits** notés en un ou deux tapotements, d'une main, et partagés en direct entre les deux parents.

Application web installable (PWA) : on l'ajoute à l'écran d'accueil du téléphone et elle s'ouvre en plein écran, comme une app.

## Ce que fait la v1

| Écran | Contenu |
| --- | --- |
| **Aujourd'hui** | Boutons *Sein gauche / Sein droit / Biberon / Couche / Dodo*. Le sein à proposer ensuite est mis en avant. Chrono en direct pendant une tétée ou une sieste. « Depuis la dernière fois » (dernière tétée, dernier biberon, dernière couche, réveillé depuis…) et totaux des 24 dernières heures. |
| **Journal** | Navigation jour par jour, résumé du jour, modification / suppression, ajout d'un événement oublié. |
| **Stats** | 7 derniers jours : sommeil, repas, couches, avec moyennes. |
| **Réglages** | Profil de bébé, **code d'invitation** pour l'autre parent, export CSV (pour le pédiatre), plusieurs bébés (jumeaux). |

Pensé pour la fatigue : « Annuler » sur chaque action, changement de sein en un tap (termine l'un et démarre l'autre), heure rétroactive (−10 min, −30 min, −1 h, ou date précise), thème sombre automatique pour les tétées de nuit.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires
npm run build      # build de production (PWA)
```

Sans configuration, l'app fonctionne en **mode local** : les données restent sur l'appareil (pas de compte, pas de partage).

## Brancher Supabase (synchronisation + partage entre parents)

1. **Créer le schéma** : appliquer `supabase/migrations/0001_init.sql` (SQL Editor de Supabase, ou `psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql`).
2. **Variables d'environnement** lues au *build* (clés publiques uniquement) :

   | Variable | Valeur |
   | --- | --- |
   | `SUPABASE_URL` (ou `VITE_SUPABASE_URL`) | URL du projet |
   | `SUPABASE_ANON_KEY` (ou `VITE_SUPABASE_ANON_KEY`) | clé *anon* / *publishable* |

   Pour le développement local, copier `.env.example` vers `.env.local`.
   **Ne jamais** mettre la clé `service_role` côté front : elle est ignorée par le build, volontairement.
3. **Authentification** : e-mail + mot de passe. Si « Confirm email » est activé dans Supabase (Authentication → Providers → Email), le parent doit cliquer sur le lien reçu avant de se connecter.
4. Le premier parent crée le bébé, puis donne le **code d'invitation** (Réglages) à l'autre parent, qui choisit « Rejoindre » à l'inscription.

### Sécurité

Toutes les tables ont la RLS activée : un utilisateur ne voit et ne modifie que les bébés dont il est membre. Seuls le nom et la date de naissance sont modifiables par le client ; le code d'invitation et le créateur sont verrouillés. Les tests `supabase/tests/01_rls.sql` (3 comptes : deux parents et un étranger, accès anonyme, cascade de suppression…) se rejouent sur un Postgres **jetable** :

```bash
PGURL="postgresql://postgres@localhost:5432" ./scripts/test-rls.sh
```

## Déploiement

Projet Vite standard : sur Vercel, framework *Vite*, commande `npm run build`, dossier `dist`. Renseigner `SUPABASE_URL` et `SUPABASE_ANON_KEY` dans les variables du projet.

## Limites connues / suite

- **Pas de file d'attente hors-ligne en mode cloud** : l'interface se charge sans réseau (PWA), mais une écriture faite sans connexion échoue avec un message au lieu d'être mise en file. À traiter en priorité avant un usage réel (wifi capricieux la nuit).
- Pas de réinitialisation de mot de passe dans l'app (à faire via le tableau de bord Supabase).
- Pas de notifications push (rappel de tétée, fenêtre de sieste) ni de courbes de croissance.
- Les données du mode local ne sont pas migrées automatiquement vers le compte cloud.
