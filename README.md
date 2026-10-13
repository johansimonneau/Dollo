# Dollo

Le journal de bébé pour parents épuisés : **tétées (sein gauche / droit, avec chrono), biberons (quantité bue), couches (pipi / caca), siestes et nuits** notés en un ou deux tapotements, d'une main, et partagés en direct entre les deux parents.

Application web installable (PWA) : on l'ajoute à l'écran d'accueil du téléphone et elle s'ouvre en plein écran, comme une app.

## Ce que fait l'app

| Écran | Contenu |
| --- | --- |
| **Aujourd'hui** | Boutons *Sein gauche / Sein droit / Biberon / Couche / Dodo*. Le sein à proposer ensuite est mis en avant. Chrono en direct pendant une tétée ou une sieste. « Depuis la dernière fois » et totaux des 24 dernières heures. |
| **Journal** | Navigation jour par jour, **filtres par type** (biberons, couches… sur tous les jours), modification / suppression, ajout d'un événement oublié. |
| **Stats** | 7 derniers jours : sommeil, repas, couches, avec moyennes. |
| **Réglages** | Profil de bébé, **invitation de l'autre parent par e-mail** (ou par code), export CSV pour le pédiatre, plusieurs bébés (jumeaux). |

Pensé pour la fatigue : « Annuler » sur chaque action, changement de sein en un tap, heure rétroactive, thème sombre automatique pour les tétées de nuit.

## Démarrer

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # tests unitaires
npm run build      # build de production (PWA)
```

Sans configuration, l'app fonctionne en **mode local** : les données restent sur l'appareil (pas de compte, pas de partage).

---

## Connecter Supabase (≈ 15 minutes)

Supabase fournit la base de données, les comptes et la synchronisation en direct entre les deux parents.

### 1. Créer un projet **dédié à Dollo**
Sur [supabase.com](https://supabase.com) → *New project*. Choisissez une **région européenne** (Paris ou Francfort) : ce sont des données de santé d'un enfant. Notez le mot de passe de la base.

> Utilisez un projet vierge, pas une base qui sert déjà à autre chose : la migration crée les tables `babies`, `baby_members`, `events` et `baby_invitations` dans le schéma `public`.

### 2. Créer les tables
*SQL Editor* → *New query* → collez **`supabase/migrations/0001_init.sql`**, *Run*. Puis une nouvelle requête avec **`supabase/migrations/0002_invitations.sql`**, *Run*. L'ordre compte.

### 3. Récupérer les deux clés publiques
*Project Settings → API Keys* (ou *API*) :

| À copier | Variable |
| --- | --- |
| *Project URL* (`https://xxxx.supabase.co`) | `SUPABASE_URL` |
| clé **publique** : *publishable* (`sb_publishable_…`) ou *anon* | `SUPABASE_ANON_KEY` |

⚠️ Jamais la clé **secrète** (*secret* / *service_role*) : elle donne tous les droits sur la base. Le build s'arrête avec un message d'erreur si elle est collée par erreur.

### 4. Les donner à Vercel
Projet Vercel → *Settings → Environment Variables* : ajoutez `SUPABASE_URL` et `SUPABASE_ANON_KEY` pour **Production et Preview**, puis *Deployments → … → Redeploy* (les variables sont lues à la construction de l'app).
Pour le développement local : copiez `.env.example` vers `.env.local`.

### 5. Régler l'authentification
*Authentication → URL Configuration* : **Site URL** = l'adresse de production de l'app ; ajoutez-la aussi dans *Redirect URLs*.
*Authentication → Providers → Email* : laissez l'e-mail activé et **gardez « Confirm email » activé** (c'est ce qui garantit qu'une invitation n'est acceptée que par le vrai propriétaire de l'adresse).

### 6. Régler les e-mails (indispensable pour les invitations)
**a) Un vrai service d'envoi.** L'envoi intégré à Supabase est « pour démonstration » : quelques e-mails par heure, sans garantie. Pour les invitations, branchez le vôtre dans *Authentication → SMTP Settings* (Resend, Brevo, Postmark… un compte gratuit suffit pour une famille).

**b) Afficher le code dans les e-mails.** *Authentication → Email Templates* : dans les modèles **« Confirm signup »** et **« Magic Link »**, remplacez le contenu par ceci (le code permet de se connecter *dans* l'app installée, là où un lien s'ouvrirait dans le navigateur) :

```html
<h2>Votre code Dollo</h2>
<p>Saisissez ce code dans l'application pour vous connecter :</p>
<p style="font-size:28px;letter-spacing:6px"><strong>{{ .Token }}</strong></p>
<p>Si un proche vous a invité(e) à suivre bébé, vous retrouverez son suivi automatiquement après connexion.</p>
<p>Ouvrir Dollo : <a href="{{ .SiteURL }}">{{ .SiteURL }}</a></p>
<p style="color:#666;font-size:12px">Vous pouvez aussi <a href="{{ .ConfirmationURL }}">vous connecter via ce lien</a>.</p>
```

### 7. Vérifier
1. Ouvrez l'app, créez un compte (ou « Recevoir un code par e-mail »), créez le bébé.
2. *Réglages → Partager avec l'autre parent* : saisissez l'e-mail de l'autre parent → *Inviter*.
3. L'autre parent ouvre l'app, choisit « Recevoir un code par e-mail » (ou « J'ai déjà reçu un code »), saisit le code : il arrive **directement** sur le bébé, sans rien recopier.

Si l'e-mail ne part pas, l'invitation reste valable : la personne peut se connecter avec cette adresse et rejoindra le bébé automatiquement. Le **code d'invitation** à recopier reste disponible en alternative.

### Comment fonctionne l'invitation
Le parent invite une adresse → la base enregistre l'invitation (valable 14 jours, 5 en attente au plus) et Supabase envoie un code → l'invité se connecte avec **cette adresse vérifiée** → l'app appelle `accept_invitations()` qui l'ajoute au bébé. Une adresse non vérifiée, une invitation expirée ou annulée n'ouvrent aucun accès.

---

## Sécurité

Toutes les tables ont la RLS activée : un utilisateur ne voit et ne modifie que les bébés dont il est membre. Seuls le nom et la date de naissance sont modifiables par le client ; le code d'invitation et le créateur sont verrouillés. Les invitations ne se créent et ne s'acceptent que par des fonctions dédiées.

Les suites `supabase/tests/` (accès d'un étranger, e-mail non vérifié, invitation expirée / annulée, abus, accès anonyme, cascades…) se rejouent sur un Postgres **jetable** :

```bash
PGURL="postgresql://postgres@localhost:5432" ./scripts/test-rls.sh
```

Ne les lancez jamais sur votre base Supabase : le script crée de faux rôles et un faux schéma `auth`.

## Déploiement

Projet Vite standard : sur Vercel, framework *Vite*, commande `npm run build`, dossier `dist`.

## Limites connues

- **Pas de file d'attente hors-ligne en mode cloud** : l'interface se charge sans réseau, mais une écriture faite sans connexion échoue avec un message au lieu d'être mise en file. À traiter en priorité avant un usage réel (wifi capricieux la nuit).
- Pas de notifications push (rappel de tétée, fenêtre de sieste) ni de courbes de croissance.
- Les données du mode local ne sont pas migrées automatiquement vers le compte cloud.
- Pas de gestion des membres (retirer un parent déjà ajouté) : à ajouter avec le partage nounou.

---

## Feuille de route — V2 : partager avec la nounou

**But** : la nounou renseigne la journée (biberons, couches, siestes) et les parents la voient, **sans que la nounou accède aux données des parents**.

**Principe** : un rôle `nanny` dans `baby_members`. La limite est posée **dans la base** (RLS), pas seulement dans l'interface : une nounou qui interroge l'API directement n'obtient rien de plus.

| La nounou voit / peut | La nounou ne voit pas / ne peut pas |
| --- | --- |
| le prénom du bébé | les autres bébés, la date de naissance, les stats longues, l'export |
| les événements des dernières 24–48 h (fenêtre glissante) | l'historique ancien |
| ajouter des événements, corriger **les siens** | modifier ceux des parents, supprimer |
| — | les parents : e-mails, liste des membres, code d'invitation, invitations |
| — | les notes marquées « privées » par un parent (à décider) |

**À construire** : migration (rôle + policies par rôle + exposition minimale du bébé), invitation avec rôle (même mécanisme que l'invitation parent), « mode nounou » (Aujourd'hui + journal du jour uniquement), mention « ajouté par la nounou » côté parents (`created_by` est déjà enregistré), révocation en un tap et date de fin d'accès.

**À trancher avant de construire** : la nounou peut-elle écrire, ou seulement lire ? Quelle fenêtre d'historique ? Plusieurs nounous / garde partagée ? Accès permanent ou limité dans le temps ? Notes privées ?
