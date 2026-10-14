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
*SQL Editor* → *New query* → collez et lancez (*Run*) chaque fichier de **`supabase/migrations/`**, **dans l'ordre** : `0001_init.sql`, `0002_invitations.sql`, `0003_touch_updated_at_search_path.sql`, `0004_members.sql`, `0005_nanny.sql`, `0006_reminders.sql`, `0007_growth.sql`, `0008_health.sql`.

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

### 6. E-mails (facultatif)
Supabase n'envoie que deux e-mails : la **confirmation d'adresse** à la création du compte et le lien **« mot de passe oublié »**. Les modèles par défaut suffisent. L'envoi intégré est limité à quelques e-mails par heure : pour plus de fiabilité, branchez votre propre service dans *Authentication → SMTP Settings* (Gmail avec un mot de passe d'application, Resend, Brevo…).

### 7. Vérifier
1. Ouvrez l'app → *Créer un compte* (e-mail, mot de passe, confirmation) → cliquez sur le lien reçu par e-mail → *Se connecter*. Créez le bébé.
2. *Réglages → Partager avec l'autre parent* : saisissez l'e-mail de l'autre parent → *Inviter* → envoyez-lui le message proposé (SMS, WhatsApp…) avec le lien de l'app.
3. L'autre parent crée son compte avec **cette même adresse**, confirme l'e-mail, se connecte : il arrive **directement** sur le bébé, sans rien recopier.

Le **code d'invitation** à recopier reste disponible en alternative. Le créateur du suivi peut **retirer** un parent (*Réglages → Partager*) : il perd l'accès et le code d'invitation est renouvelé.

### Comment fonctionne l'invitation
Le parent invite une adresse → la base enregistre l'invitation (valable 14 jours, 5 en attente au plus) et l'app partage un lien → l'invité crée son compte avec **cette adresse**, la confirme et se connecte → l'app appelle `accept_invitations()` qui l'ajoute au bébé. Une adresse non vérifiée, une invitation expirée ou annulée n'ouvrent aucun accès.

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

## Rappels et notifications

*Réglages → Rappels* (pour chaque personne et chaque bébé) :
- **Prochain repas** : 2 h à 4 h après le *début* de la dernière tétée ou du dernier biberon ;
- **Pas de couche mouillée** depuis 4, 6 ou 8 h (seules les couches pipi ou pipi + caca comptent) ;
- **Pas de notification la nuit** (22 h – 7 h, heure du téléphone) ;
- **Activer les notifications sur ce téléphone**. Sur iPhone, il faut que Dollo soit ajoutée à l'écran d'accueil (exigence d'Apple).

Dans l'app, un bandeau « C'est bientôt l'heure de manger » s'affiche toujours. Les notifications (app fermée) sont envoyées par la fonction serveur `supabase/functions/send-reminders`, une seule fois par repas ou par couche. Pas de notification pour un suivi en pause depuis plus de 12 h, et pas de notification à un appareil déconnecté, désinstallé, ou à une personne retirée du suivi.

**Mise en service (une fois)** :
1. Appliquer `0006_reminders.sql`.
2. Générer une paire de clés VAPID (par ex. `npx web-push generate-vapid-keys`).
3. Déployer la fonction `send-reminders` et lui donner les secrets `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (`mailto:votre@adresse`).
4. Vercel : variable `VAPID_PUBLIC_KEY` (la clé **publique** seulement), puis redéployer.
5. Planifier l'envoi toutes les 5 minutes : dans le SQL Editor, exécuter le bloc commenté à la fin de `0006_reminders.sql`, avec l'adresse du projet et la clé publique (anon / publishable).

Sans les étapes 2 à 5, les rappels restent affichés dans l'app (bandeaux), sans notification.

## Croissance et rapport pour le pédiatre

*Stats → Croissance* : poids, taille et périmètre crânien, saisis à chaque pesée (PMI, pédiatre, pèse-bébé). Ils sont placés sur les **courbes de référence de l'OMS** (0–24 mois, filles et garçons), avec bandes 3e–97e et 15e–85e et la médiane, et le percentile de chaque mesure. Les données OMS (paramètres LMS officiels) sont dans `src/lib/whoData.ts`. Les calculs sont vérifiés contre les percentiles publiés (`growth.test.ts`). Le sexe du bébé se règle dans *Réglages* ou au premier affichage des courbes.

*Réglages → Données → Rapport pour le pédiatre* : une page A4 avec les 7 derniers jours (tétées, biberons en ml bus, couches pipi / caca, sommeil, et les moyennes), les mesures avec percentiles, les trois courbes et les notes des parents. « Imprimer / PDF » ouvre la fenêtre d'impression du téléphone, d'où l'on choisit « Enregistrer en PDF ».

Mesures et sexe sont réservés aux parents : la nounou n'y a pas accès (RLS, migration `0007_growth.sql`). Cette migration verrouille aussi l'auteur et le bébé d'un événement, qui ne sont plus modifiables depuis l'API.

## Santé : température, médicaments, vaccins

- **Température** et **médicament** se notent depuis *Aujourd'hui*, comme les autres événements : partagés en direct, notés hors ligne, et la nounou peut les saisir. Au-delà de 38 °C, un bandeau rappelle quoi faire : avant 3 mois, consulter rapidement (médecin ou 15) ; ensuite, surveiller et appeler en cas de doute.
- Avant une nouvelle prise, la feuille Médicament affiche **la dernière prise du même médicament**, avec la personne qui l'a donnée et la dose. Le but est d'éviter qu'il soit donné deux fois par deux personnes. Dollo n'indique aucune posologie.
- **Traitement quotidien** (vitamine D…) : *Réglages → Rappels*. Bandeau et notification à l'heure choisie tant que la prise du jour n'est pas notée, avec une seule notification par jour.
- **Vaccins** (*Stats → Santé*) : le calendrier français du nourrisson 2025–2026 (`src/lib/vaccines.ts`), dose par dose, avec date prévue et statut (fait, à faire, plus tard). Les méningocoques B et ACWY sont obligatoires depuis 2025, le rotavirus est recommandé. Un bandeau signale le rendez-vous à venir. Le calendrier sert de repère : le médecin décide du schéma.
- Le rapport pour le pédiatre reprend températures, médicaments et vaccins.

Vaccins : parents uniquement (RLS, migration `0008_health.sql`).

## Hors ligne

Sans réseau (chambre sans signal, métro), Dollo s'ouvre avec les dernières données vues, et **on continue à noter** : chaque saisie s'affiche tout de suite et est gardée sur le téléphone. Un bandeau « Hors connexion · 2 saisies en attente » l'indique. Au retour du réseau, les saisies partent toutes seules, dans l'ordre et **sans doublon** : l'identifiant est choisi par le téléphone, et un envoi dont la réponse s'est perdue n'est pas recréé. Une saisie corrigée ou supprimée hors ligne n'envoie que le résultat final. Si le serveur refuse une saisie (accès retiré entre-temps, événement supprimé par l'autre parent), elle est abandonnée et un message le signale. La file est propre à chaque compte (`src/data/offlineStore.ts`).

## Mises à jour sans frustration

- **Aucune interruption** : une nouvelle version se télécharge en arrière-plan et ne s'applique qu'au lancement (avant toute interaction) ou quand l'app passe en arrière-plan — jamais pendant une saisie (`src/lib/updates.ts`). Une app restée ouverte vérifie les nouveautés toutes les heures et à chaque retour au premier plan.
- **Aucune déconnexion** : la session et les données restent sur l'appareil d'une version à l'autre.
- **Base et app compatibles dans les deux sens** : les migrations ajoutent sans casser, et l'app détecte une base pas encore migrée (repli automatique) — on peut publier l'app avant ou après la migration.
- **Vérifications automatiques** (`.github/workflows/ci.yml`) sur chaque PR : types, tests unitaires, build, et toutes les migrations + suites de sécurité sur une base jetable. Une PR rouge ne doit pas être fusionnée.

## Limites connues

- Hors ligne, seules les saisies d'événements sont mises en file ; inviter, régler les rappels ou modifier le profil demandent du réseau.
- Les données du mode local ne sont pas migrées automatiquement vers le compte cloud.

---

## V2 : partager avec la nounou

La nounou renseigne la journée et les parents la voient en direct, **sans que la nounou accède aux données des parents**. La limite est posée **dans la base** (RLS, fonctions, trigger — migration `0005_nanny.sql`) : une nounou qui interroge l'API directement n'obtient rien de plus que dans l'app.

| La nounou voit / peut | La nounou ne voit pas / ne peut pas |
| --- | --- |
| le prénom du bébé | la date de naissance, le code d'invitation, les autres bébés |
| les événements des **dernières 48 h** | l'historique plus ancien, les stats, l'export |
| ajouter des événements, corriger ou supprimer **les siens** | modifier ou supprimer ceux des parents |
| **terminer** un dodo / une tétée lancé par un parent | — |
| — | les membres, leurs e-mails, les invitations ; inviter quelqu'un |

**Côté parents** : *Réglages → Partager le suivi → Nounou* pour l'inviter (même parcours que pour un parent : lien partagé, compte avec mot de passe). Ce qu'elle note est marqué « par la nounou » dans le journal. Le créateur du suivi la **retire** en un geste ; plusieurs nounous possibles.

**Choix faits** (modifiables) : écriture autorisée ; fenêtre de 48 h ; accès jusqu'au retrait (pas de date de fin) ; les notes des événements visibles dans la fenêtre sont lisibles par la nounou.

--- | --- |
| le prénom du bébé | les autres bébés, la date de naissance, les stats longues, l'export |
| les événements des dernières 24–48 h (fenêtre glissante) | l'historique ancien |
| ajouter des événements, corriger **les siens** | modifier ceux des parents, supprimer |
| — | les parents : e-mails, liste des membres, code d'invitation, invitations |
| — | les notes marquées « privées » par un parent (à décider) |

**À construire** : migration (rôle + policies par rôle + exposition minimale du bébé), invitation avec rôle (même mécanisme que l'invitation parent), « mode nounou » (Aujourd'hui + journal du jour uniquement), mention « ajouté par la nounou » côté parents (`created_by` est déjà enregistré), révocation en un tap et date de fin d'accès.

**À trancher avant de construire** : la nounou peut-elle écrire, ou seulement lire ? Quelle fenêtre d'historique ? Plusieurs nounous / garde partagée ? Accès permanent ou limité dans le temps ? Notes privées ?

---

## Page de présentation

À l'adresse racine, un **nouveau visiteur** voit une page de présentation (problèmes de parents, captures réelles, installation sans store). Tout usage existant ouvre l'app directement : app installée sur l'écran d'accueil, `?app`, retour d'un lien de connexion Supabase, données ou session déjà présentes sur l'appareil (`src/landing/route.ts`).

- `/?app` : ouvrir l'app (bouton « Essayer dans le navigateur »).
- `/?landing` : forcer la page de présentation, même si on a déjà l'app.
- **Installation sans store** : bouton natif « Installer » sur Android et ordinateur (événement `beforeinstallprompt`), pas-à-pas sur iPhone (Safari → Partager → Sur l'écran d'accueil).
- Les captures sont dans `public/landing/` : des captures réelles de l'app avec un bébé de démonstration, à régénérer quand l'interface change.
