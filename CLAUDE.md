# CEPCA Digital

Plateforme numérique de la CEPCA : portail public, application des fidèles
(PWA) et back-office des responsables. Monorepo npm workspaces.

La langue de travail est le **français** : code, commentaires, messages de
commit, échanges.

**`docs/ARCHITECTURE.md` fait foi pour la conception** — vue d'ensemble,
découpage des parcours, ordre de livraison. Ce fichier-ci ne le répète pas : il
donne ce qu'il faut pour travailler, et ce qu'on a déjà payé pour apprendre.

Deux autres documents font autorité :
`design_handoff_cepca/cahier-des-charges-CEPCA.txt` pour les règles,
`design_handoff_cepca/designs/` pour l'interface.

Les notes accumulees au fil des sessions sont dans **`docs/memoire-projet/`**.
Elles ne sont pas chargees automatiquement, et l'essentiel de leur contenu est
deja resume ici.

---

## Les trois applications

| | | |
|---|---|---|
| `apps/api` | NestJS 11 + Prisma 6 + PostgreSQL | port 4000 |
| `apps/web` | Next.js 16 App Router — portail, `/app`, `/admin` | port 3000 |
| `apps/mobile` | Expo 57 + React Native — **gelée** | — |

`packages/tokens` porte les jetons de design (TS + CSS), `packages/shared` le
code commun.

**`apps/mobile` est gelée** : la première version de l'app des fidèles a été
remplacée par la PWA servie sous `/app`. Ne pas y investir sans décision
explicite.

Le web parle à l'API **en même origine**, via un relais `/api` configuré dans
`next.config` — les cookies sont `httpOnly` et ne transitent jamais par du
JavaScript.

---

## Commandes

```bash
npm run setup       # build tokens + shared, puis génération Prisma — à faire en premier
npm run dev:db      # Postgres 5434 + MinIO 9100 (Docker Desktop doit tourner)
npm run dev:api     # API sur 4000
npm run dev:web     # web sur 3000
npm run db:migrate
npm run seed
npm test            # jest, tous les espaces de travail
npm run typecheck
npm run mail:test   # vérifier l'envoi des courriels
```

**Docker Desktop doit tourner** avant `dev:db`, et il s'arrête souvent sur
cette machine. Les tests de l'API utilisent une base `cepca_test` distincte,
créée par `deploy/init-test-db.sql` ; leur `globalSetup` applique les
migrations.

---

## Règles de produit à ne pas réinventer

**Plus aucun SMS.** Décision de l'utilisateur, prise le 9 octobre 2026 pour une
raison de coût. Tout passe par le courriel :

- **Fidèle** : e-mail + code à 4 chiffres. Nom, e-mail et téléphone sont
  obligatoires à l'inscription.
- **Responsable** : e-mail + mot de passe + rôle + structure en cascade (les
  niveaux sous le rôle sont grisés), puis code à 6 chiffres par courriel.
- Nominations et campagnes partent aussi par courriel.

`MailService` lit `MAIL_MODE` : `console` en développement, `smtp` ailleurs.

**Un responsable a deux rôles** — fidèle et responsabilité. Le passage de l'un
à l'autre est prévu dans l'application mobile, au parcours 4.

**Mandats multiples** : un responsable peut en cumuler. Le sélecteur est dans
la carte « Mon rôle » du back-office, et le choix est retenu en `localStorage`.

---

## Comptes de démonstration

La base de développement est peuplée par `apps/api/prisma/seed.ts`.

- Fidèle : **Élise Moukoko**, `+237677123442`
- Responsables : `prenom.nom@example.org`
- Mot de passe responsables : `Cepca-Demo-2026!`

Quelques enregistrements marqués **`[Essai …]`** traînent dans la base de
développement, créés pendant des vérifications — par exemple une saisie
manuelle de 1 000 FCFA, reçu `EEC-2026-000007`. Ce ne sont pas des données
réelles.

---

## Où en est le projet

**Livré et vérifié :**

- Socle et parcours fidèle MVP côté API : authentification par code,
  annuaire, fil d'actualité, fichiers, contributions et paiements (bac à sable,
  MTN MoMo, Orange Money), reçu PDF, récurrence, webhooks, contact.
- Back-office complet sous `/api/admin/*` : structures, utilisateurs et
  rattachements, nominations, rôles, publications, événements, prédications et
  documents, campagnes, projets, finance avec remboursements et clôtures,
  tableaux de bord par rôle, rapports et exports CSV/XLSX/PDF, journal d'audit,
  paramètres.
- `apps/web` : les 14 écrans du back-office, plus le portail public
  (`/`, `/actualites`, `/actualites/[id]`) en rendu serveur, thème sombre par
  cookie `cepca_theme`.
- Application des fidèles en PWA sous `/app`, avec notifications Web Push.
- Double authentification et parcours des rôles de responsables.

**Pas encore commencé :**

- **Parcours 3** — compléments de l'app fidèle (maquette 3). C'est la
  prochaine étape.
- **Parcours 4** — espaces responsables mobiles (maquette 4).

**Manques connus :**

- Pages **Mentions légales** et **Confidentialité** du portail : le contenu
  est à fournir par l'utilisateur, pas à inventer.
- `apps/mobile` n'a **jamais été essayée sur un appareil réel** — seulement
  `tsc` et `expo-doctor`.

---

## Règles de travail

**Suivre l'ordre de livraison** de `docs/ARCHITECTURE.md` §12 :
0 Socle → 2 App fidèle MVP → 5 Back-office → 1 Portail → 3 → 4.

**Sur un simple « continue »**, partir de la première ligne « Pas encore
commencé » ci-dessus. Une session a déjà démarré sans contexte et perdu du
temps à tout relire pour retrouver l'étape.

**Mettre ce fichier à jour en fin de session** quand une étape est franchie.
Il est dans le dépôt : il voyage avec `git clone`, contrairement à la mémoire,
qui dépend du chemin de la machine.

**Les commentaires expliquent POURQUOI**, pas ce que fait la ligne suivante.
Un défaut corrigé mérite une phrase sur ce qu'il cassait.

**Rien n'est déployé en production à ce jour.** Le dépôt distant est
`github.com/kjbrown-03/CEPCA-`, et `deploy/` ne contient que la composition de
développement.
