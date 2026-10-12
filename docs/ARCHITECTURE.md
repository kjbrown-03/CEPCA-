# CEPCA Digital — Architecture du MVP

Document de conception. Il traduit le cahier des charges (`design_handoff_cepca/cahier-des-charges-CEPCA.txt`, qui fait foi pour les règles) et les maquettes (`design_handoff_cepca/designs/`, qui font foi pour l'interface) en une architecture que l'on peut coder.

## 1. Vue d'ensemble

```
                    ┌───────────────────────────────────────┐
  Visiteurs ──────► │  apps/web  (Next.js)                  │
  Fidèles ────────► │  /        portail public              │
  (PWA installée)   │  /app     application des fidèles     │
  Responsables ───► │  /admin   back-office                 │
                    └───────────────────┬───────────────────┘
                                        │ HTTPS + cookie httpOnly
                                        ▼ (même origine via /api)
                    ┌─────────────────────────────────────────────────────────────────┐
                    │  apps/api  (NestJS + Prisma)                                    │
                    │  auth · structures · droits · publications · agenda · contenus │
                    │  contributions · paiements · projets · rapports · audit        │
                    │                                                                 │
                    │  ┌─ PaymentProvider ─┐  ┌─ MailService ─┐ ┌─ PushSender ─┐       │
                    │  │ MTN MoMo · Orange │  │ console/SMTP  │ │ Web Push     │       │
                    │  │ Money · Bac à sable│ └──────────────┘  └──────────────┘       │
                    │  └───────────────────┘   ┌─ Storage (S3) ─┐                     │
                    └──────────┬───────────────┴────────────────┴─────────────────────┘
                               │
                 PostgreSQL 16 ┴ Stockage objet S3 (MinIO en dev)
                 (aucun port public en production)
```

Monorepo npm workspaces :

```
CEPCA/
├── apps/
│   ├── api/       NestJS, Prisma, PostgreSQL           port 4000
│   ├── web/       Next.js App Router (portail, /app, /admin) port 3000
│   └── mobile/    Expo : première version de l'app des fidèles, remplacée par la PWA /app (gelée)
├── packages/
│   ├── tokens/    design tokens du README (TS + CSS)  → web et mobile
│   └── shared/    schémas zod, types, formatage FCFA/€/heures, codes d'erreur
├── deploy/        compose (Postgres, MinIO, API), nginx, .env.example
└── docs/          ce document, modèle de données, matrice des droits
```

## 2. Choix techniques

| Sujet | Choix | Raison |
|---|---|---|
| API | NestJS (TypeScript) | Recommandé par le README ; modules, gardes et intercepteurs collent au découpage du cahier. |
| ORM | Prisma 6 | Migrations versionnées, client typé. Contraintes non exprimables (journal non modifiable, index de préfixe) ajoutées en SQL dans les migrations. |
| Validation | zod, schémas partagés (`packages/shared`) | Un seul schéma pour le formulaire mobile, le formulaire web et l'API. Objets stricts : un champ inconnu (`role`, `status`…) est rejeté. |
| Web | Next.js App Router | Portail en rendu serveur (référencement, premier affichage rapide) ; back-office en composants client derrière authentification. |
| Application des fidèles | PWA dans le site Next (`/app`) : manifeste, service worker, Web Push (VAPID) | Installée depuis le navigateur (« Ajouter à l'écran d'accueil »), sans store ni compte développeur payant ; mises à jour immédiates ; une seule base de code et un seul déploiement. Le dossier `apps/mobile` (Expo) reste comme référence, il n'est plus développé. |
| Icônes | Phosphor (`@phosphor-icons/react`, `phosphor-react-native`) | Celles des maquettes. |
| Polices | Instrument Serif + Manrope (`next/font/google`, `@expo-google-fonts/*`) | Celles du README, embarquées (pas de dépendance réseau à l'exécution sur mobile). |
| Données distantes | TanStack Query (web et mobile) | Cache, reprise, états chargement/erreur uniformes. |
| Paiements | Fapshi (agrégateur MTN MoMo + Orange Money) | Un seul contrat et une seule API pour les deux opérateurs du Cameroun. |
| Stockage fichiers | S3 compatible (MinIO en dev) | Médias servis **par l'API après contrôle des droits**, avec prise en charge des requêtes `Range` pour l'audio et la vidéo. |

## 3. Multi-confession et cloisonnement (§5, §68)

**Une base, isolation logique.** Chaque ligne métier porte `confessionId` (le locataire) et `structureId` (le nœud propriétaire). Aucune requête métier n'est écrite sans passer par le service de périmètre.

**Hiérarchie paramétrable (§7, §11).** Deux tables distinctes :

- `LevelType` : les niveaux d'une confession (nom, rang, niveau parent). L'EEC définit Synode → Consistoire → Paroisse → Chapelle ; une autre confession peut définir Région → District → Église locale. Rien n'est codé en dur.
- `Structure` : les nœuds réels (« Paroisse de Deïdo »), en arbre, avec un **chemin matérialisé** (`path` = `/cepca/eec/lit/dc/dei/`). Le sous-arbre d'un nœud est `path LIKE '/cepca/eec/lit/%'`, servi par un index `text_pattern_ops`.

Le CEPCA est la racine (`/cepca/`). Chaque confession est un nœud de niveau « Confession » sous la racine.

**Droits = Utilisateur → Rôle → Structure → Permissions (§38).**

- `Role` + `RolePermission` : la matrice modules × {Consulter, Créer/modifier, Valider} du back-office (écran « Rôles et droits »). Une permission peut aussi valoir **Agrégé** : le CEPCA voit des totaux, jamais les lignes nominatives d'une confession.
- `RoleAssignment` : un utilisateur reçoit un rôle **sur une structure**, pour un mandat daté (§61). Le périmètre effectif est le sous-arbre de cette structure.
- À chaque requête : le compte est relu en base (un compte suspendu perd l'accès immédiatement), ses affectations actives sont chargées, la garde vérifie le module et l'action, puis le service vérifie que la ressource visée est dans le sous-arbre. Hors périmètre → **404** (l'existence d'une ressource d'une autre paroisse est déjà une information).

**Défense en profondeur (phase 2).** Politiques RLS PostgreSQL par `confessionId`, pour qu'une requête oubliée ne puisse pas fuiter d'une confession à l'autre. Le MVP s'appuie sur le service de périmètre et des tests de refus systématiques.

## 4. Diffusion ciblée (§14)

Une publication, un événement, un contenu ou une notification vise un **nœud cible** (CEPCA, confession, synode, …, chapelle) et, en option, un **groupe**. Un fidèle rattaché à la chapelle de Bonamoussadi (`/cepca/eec/lit/dc/dei/bon/`) voit tout ce qui cible un **ancêtre ou lui-même** : CEPCA, EEC, Littoral, Douala-Centre, Deïdo, Bonamoussadi. C'est le même chemin matérialisé que pour les droits, lu dans l'autre sens.

Les filtres de l'app (Paroisse / Confession / CEPCA) se traduisent en niveau du nœud cible.

## 5. Authentification (§12, §42)

| Public | Facteurs | Détail |
|---|---|---|
| Fidèle (application `/app`) | e-mail + code à 4 chiffres reçu par e-mail | Seul le fidèle s'inscrit : nom, e-mail et téléphone obligatoires (le téléphone sert au paiement Mobile Money). Code haché, valable 10 min, 5 essais, puis nouveau code. Limiteur dédié par adresse et par IP. |
| Responsable (back-office, espaces responsables) | e-mail + mot de passe + mandat choisi (rôle, puis structure en cascade) + code à 6 chiffres reçu par e-mail | « Authentification forte pour les profils sensibles » (§42). Le serveur vérifie que la personne détient ce rôle sur cette structure ; ce mandat devient le mandat actif. |

- **Aucun SMS** (coût par message) : codes, nominations et notifications partent par e-mail (nodemailer ; `MAIL_MODE=console` en dev, `smtp` en production) ou par notification push.
- Connexion du back-office : le rôle choisi fixe le niveau de la cascade Confession → Synode → Consistoire → Paroisse → Chapelle (niveaux propres à chaque confession) ; les niveaux plus locaux que celui du rôle sont grisés. Les listes viennent de `GET /auth/admin/options` et `GET /auth/admin/structures?parentId=` (publics, sans donnée personnelle).
- Un responsable peut détenir deux rôles : fidèle (rattachement à une paroisse) et un ou plusieurs mandats. L'application `/app` lui proposera de passer de l'un à l'autre (parcours 4).
- L'adresse e-mail identifie le compte : elle n'est pas modifiable depuis le profil (une faute de frappe le rendrait inaccessible).

- Jeton d'accès JWT 15 min ; jeton de rafraîchissement 30 jours, **haché en base**, à rotation, révoqué à la déconnexion et à la suspension.
- Web (portail, `/app`, `/admin`) : cookies `httpOnly`, `Secure`, `SameSite=Lax`, aucun jeton lisible par la page (`cookie: true` à la vérification du code) ; Next.js relaie `/api/*` vers l'API, d'où une seule origine et pas de CORS ouvert.
- Le rattachement à une paroisse est **en attente** jusqu'à validation par le pasteur (maquette « bienvenue »). En attente, le fidèle lit les contenus publics de la paroisse, mais n'apparaît pas dans les effectifs.

## 5 bis. Application des fidèles (PWA)

- **Adresse** : `/app` sur le site (`cepca.org/app`). Le portail y mène (bouton « Application »). `app/manifest.ts` déclare `start_url /app`, `scope /app/`, affichage `standalone`, icônes 192/512 et « maskable ».
- **Installation** : Android (Chrome) propose l'installation, relayée par un bandeau dans l'accueil ; iPhone : Safari, Partager, « Sur l'écran d'accueil » (expliqué dans l'app). HTTPS obligatoire en production.
- **Service worker** (`public/sw.js`, portée `/app/`) : fichiers `/_next/static` en cache, pages en réseau d'abord avec la dernière version vue ou la page « hors ligne » ; aucune donnée `/api` en cache (personnelle). Prédications téléchargées gardées dans Cache Storage (`cepca-sermons`) et lues hors connexion.
- **Notifications push** : interrupteur dans « Notifications ». Sur iPhone, seulement pour l'app ajoutée à l'écran d'accueil (iOS 16.4 et plus). Désabonnement à la déconnexion.
- **Fichiers** : documents, pièces jointes et reçus PDF téléchargés via le relais `/api` (cookie de session) ; « Ajouter à mon calendrier » produit un fichier `.ics`.

## 6. Paiements (§20–24, §53–55)

**Couche d'abstraction.**

```ts
interface PaymentProvider {
  readonly channel: 'MTN_MOMO' | 'ORANGE_MONEY' | 'SANDBOX'
  initiate(req: { amount: number; phone: string; reference: string }): Promise<{ providerRef: string }>
  fetchStatus(providerRef: string): Promise<ProviderStatus>
  parseWebhook(headers, body): Promise<ProviderEvent>     // vérifie la signature
  refund?(providerRef: string, amount: number): Promise<{ refundRef: string }>
}
```

Adaptateurs : `FapshiProvider` (Fapshi `direct-pay` : la demande arrive sur le téléphone du fidèle, MTN MoMo ou Orange Money ; statut par `payment-status/:transId` ; webhook unique par service, authentifié par l'en-tête `x-wh-secret`, envoyé une seule fois sans réessai — la réconciliation périodique est donc indispensable), `SandboxProvider` (simulateur local hors ligne : l'issue dépend du montant saisi — terminé par 13, refus ; par 14, expiration ; sinon succès après `SANDBOX_CONFIRM_DELAY_MS`). Le doublon se teste par la clé d'idempotence. Fapshi n'accepte que les mobiles camerounais (+237 6…) : la diaspora devra payer par carte (prestataire à choisir). Le net enregistré est le montant réellement versé par Fapshi (`revenue`, après sa commission).

**Machine d'états d'une contribution.**

```
          initiate            webhook / polling OK
 CRÉÉE ───────────► EN_ATTENTE ─────────────────────► RÉUSSIE ──► (remboursement validé) ──► REMBOURSÉE
                        │  │
                        │  └── refus opérateur ──► ÉCHOUÉE
                        └───── abandon / délai ──► ANNULÉE
```

- **Rien n'est compté tant que l'opérateur n'a pas confirmé** : totaux, mobilisation des projets, reçus et rapports ne lisent que `SUCCEEDED`.
- Idempotence : clé fournie par l'app à la création (un double appui ne crée pas deux paiements) ; webhooks dédoublonnés par identifiant d'événement ; transition d'état conditionnelle (`UPDATE … WHERE status = 'PENDING'`).
- Le webhook n'est jamais cru sur parole : l'API rappelle l'opérateur (`fetchStatus`) avant de passer en RÉUSSIE. Un *job* de réconciliation interroge les paiements restés en attente.
- Montants en **entiers FCFA** (le XAF n'a pas de centimes). Brut, frais, net et prestataire enregistrés (§54). Frais opérateur 1,5 % affichés avant paiement, paramétrables par prestataire.
- Numéro de reçu attribué **à la confirmation**, séquentiel par confession et par année : `EEC-2026-000123`. PDF généré à la demande, jamais stocké en URL publique.
- Saisie manuelle (espèces) par le responsable financier : statut « Saisie manuelle », tracée au journal.
- Clôture mensuelle refusée tant qu'il reste des paiements en attente (règle du back-office).
- La plateforme n'est pas un logiciel comptable (§41) : elle produit les données de rapprochement (export CSV/Excel).

**« Chaque mois » (récurrence).** Mobile Money n'autorise pas le prélèvement sans confirmation du payeur. La récurrence crée chaque 1er du mois une demande de paiement que le fidèle confirme sur son téléphone, précédée d'une notification. Cela reste annulable à tout moment.

## 7. Heures et devises

- Dates stockées en UTC. Affichage en `Africa/Douala` et `Europe/Paris` calculé par `Intl` : l'écart est de **+1 h en heure d'été européenne et de 0 h en hiver**. La maquette écrit « +1 h » en dur ; le calcul réel évite une erreur d'une heure de fin octobre à fin mars.
- Équivalent en euros : parité fixe 1 € = 655,957 FCFA (exacte, garantie par l'accord de change).

## 8. Journal d'audit (§43)

Table `AuditLog` en **ajout seul** : un déclencheur PostgreSQL refuse `UPDATE` et `DELETE`. Chaque entrée porte l'auteur, l'action, l'objet, la structure, l'IP, le résultat et l'horodatage. Elle est écrite dans la même transaction que l'action quand c'est possible. Sont journalisés : connexion (réussie ou non), validation, paiement, remboursement, droits, export, publication et suppression. Aucun secret, code OTP ou numéro complet de carte dans les métadonnées.

## 9. Sécurité (§42, §44)

- `helmet`, CORS restreint à l'origine du web, `trust proxy` piloté par l'environnement.
- Limiteurs distincts : API générale (120/min), authentification et OTP (20 / 10 min, plus un plafond par numéro), webhooks (généreux), formulaire de contact public (15 / 10 min).
- Refus de démarrer en production si un secret est absent ou trop court.
- Dépôts : liste MIME **par champ**, plafond de taille, nom de fichier normalisé ; analyse antivirus prévue avant la mise en production (ClamAV).
- **Donnée sensible** : l'appartenance religieuse est une donnée sensible au sens de la loi camerounaise de 2024 sur la protection des données personnelles. Il faut un consentement explicite à l'inscription, un minimum de champs (le pays de résidence reste facultatif, §29), un export et une suppression sur demande.

## 10. Notifications (§19)

`Notification` (boîte de réception de l'app : lu/non lu, lien vers l'écran) + `NotificationCampaign` (envoi par un responsable : audience, canaux Push/E-mail, programmation). Push par Web Push (VAPID) vers les navigateurs abonnés (`PushToken`, plateforme `web` ; abonnements limités aux services push de Google, Mozilla, Apple et Microsoft ; un abonnement expiré, 404/410, est supprimé), e-mail via `MailService` (console en dev). Plus aucun SMS : la colonne `smsCostFcfa` ne garde que l'historique.

## 11. Déploiement

Selon le skill DevOps du projet :

- **nginx sur l'hôte** : certificat Let's Encrypt (`webroot`) ; `/` vers Next.js et `/api/` vers l'API, avec `X-Forwarded-For $remote_addr` (écrase la valeur du client, n'ajoute pas).
- **Docker Compose** : `postgres`, `minio`, `api`, `web`, `migrate`. Aucun port public hors `127.0.0.1`.
- **Ordre** : build → `prisma migrate deploy` → redémarrage de l'API.
- **Sauvegardes** : `pg_dump` quotidien et miroir du stockage objet **vers une autre machine**, avec un test de restauration mensuel.

## 12. Parcours et ordre de livraison

| # | Parcours | Livrable |
|---|---|---|
| 0 | Socle | monorepo, tokens, API (auth, structures, droits, audit), base de démo calquée sur les maquettes |
| 2 | App fidèle — MVP | inscription OTP, accueil, actualités, agenda, notifications, prédications, documents, contribution → paiement → reçu → historique, projets, Moi |
| 5 | Back-office | tableau de bord par rôle, structures, utilisateurs, rôles et droits, publications (validation), événements, prédications, documents, notifications, projets, contributions, rapports, audit, paramètres |
| 1 | Portail public | accueil hero, mission, Églises membres, actualités, contact |
| 3 | App fidèle — compléments | ma chapelle, groupes, je participe, lire et méditer, jeunes et actions sociales, mon engagement, recherche |
| 4 | Espaces responsables (dans `/app`) | pasteur, financier, projet, communication |

## 13. Hors MVP (rappel §71–72)

Messagerie entre utilisateurs, sondages, bénévolat avancé, intégration comptable, patrimoine, formation en ligne, billetterie : non développés. Le modèle de données réserve leur place sans les implémenter.
