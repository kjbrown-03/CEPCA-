---
name: cepca-build-progress
description: "Avancement de CEPCA Digital (monorepo NestJS/Next/Expo) — ce qui est livré et la prochaine étape, pour reprendre après un « continue »"
metadata:
  node_type: memory
  type: project
  originSessionId: 343851cd-c492-4b99-b132-950a27ebef1f
  modified: 2026-10-13T19:30:00.000Z
---

Ordre de livraison suivi : docs/ARCHITECTURE.md §12 (0 Socle → 2 App fidèle MVP → 5 Back-office → 1 Portail → 3 → 4).

État au 2026-10-02 :
- apps/api : socle + parcours fidèle MVP côté API écrits et vérifiés de bout en bout sur la base de dev seedée (auth OTP, me/directory, feed, fichiers, contributions + paiements bac à sable/MTN/Orange, reçu PDF, récurrence, webhooks, contact). Seed de démo dans prisma/seed.ts (Élise Moukoko +237677123442, mot de passe responsables Cepca-Demo-2026!).
- Tests dans apps/api/test (jest, base cepca_test, globalSetup = migrate deploy).
- apps/mobile (Expo SDK 57, expo-router, src/app) : parcours fidèle MVP complet (onboarding OTP, accueil, actualités, agenda, notifications, prédications, documents, don → paiement → reçu → historique, projets, Moi). tsc + expo-doctor OK au 2026-10-02 ; jamais testé sur appareil.
- Back-office API (/api/admin/*) terminé et vérifié au 2026-10-05 : contrôleurs dans apps/api/src/admin (structures, users/rattachements/nominations, rôles, publications, événements, prédications/documents, campagnes, projets, finance/remboursements/clôtures, dashboard par rôle, rapports + exports CSV/XLSX/PDF, journal d'audit, paramètres + types de contribution) ; mot de passe responsable via /auth/admin/password/request|reset. test/admin.spec.ts ; 52 tests verts. Jamais committé (tout est dans l'index / non suivi).
- apps/web (Next.js 16.4, App Router) livré au 2026-10-08, jamais committé :
  - back-office /admin (14 écrans de la maquette 5 + /admin/connexion et /admin/mot-de-passe), composants client + TanStack Query, /api relayé vers l'API par next.config (cookies httpOnly). Mandats multiples : sélecteur dans la carte « Mon rôle » (localStorage). Vérifié dans Edge headless (playwright-core installé dans le scratchpad, pas dans le projet).
  - portail public / , /actualites, /actualites/[id] (maquette 1), rendu serveur ; thème sombre par cookie cepca_theme.
  - API ajoutée pour le web : GET /admin/campaigns/audiences, GET /admin/contribution-types, GET /admin/reports/recent, GET /public/confessions, GET /public/news(/:id) ; publication d'une prédication SUBMITTED. 60 tests verts.
  - Base de dev : quelques enregistrements « [Essai …] » créés pendant les vérifications (saisie manuelle 1 000 FCFA reçu EEC-2026-000007, etc.).
- 2026-10-09 : plus aucun SMS (demande utilisateur, coût). Connexion fidèle = e-mail + code 4 chiffres (nom, e-mail, téléphone obligatoires à l'inscription) ; back-office = e-mail + mot de passe + rôle + structure en cascade (niveaux sous le rôle grisés) + code 6 chiffres par e-mail ; nominations et campagnes par e-mail (MailService, MAIL_MODE=console|smtp). Comptes de démo : prenom.nom@example.org (base de dev complétée sans reset). 65 tests verts, connexion vérifiée dans Edge. Tout committé le 2026-10-12 (770d132) sur la branche connexion-email, pas encore fusionné dans main ni poussé.
- Choix utilisateur : un responsable a deux rôles (fidèle + responsabilité) ; le passage de l'un à l'autre se fera dans l'app mobile (parcours 4).
- Pas encore commencé : parcours 3 (app fidèle — compléments, maquette 3) puis 4 (espaces responsables mobiles, maquette 4).
- Manque au portail : pages Mentions légales / Confidentialité (contenu à fournir).
- Dev : Docker Desktop doit tourner (deploy/compose.dev.yml : Postgres 5434, MinIO 9100).

**Why:** une session a démarré sur « continue » sans aucun contexte ; il a fallu tout relire pour retrouver l'étape.
**How to apply:** sur « continue », partir de la première ligne « Pas encore commencé » et mettre ce fichier à jour en fin de session.

Fapshi intégré et vérifié contre le bac à sable réel (2026-10-02) : PAYMENT_PROVIDER=fapshi dans apps/api/.env (identifiants sandbox), simulator en test. Frais affichés 1,5 % < commission Fapshi 3 % : décision de l'utilisateur en attente.
Contrainte utilisateur : technologies gratuites pour l'instant.
Choix de l'utilisateur (2026-10-02) : paiements via Fapshi (agrégateur MTN + Orange, remplace les adaptateurs MTN/Orange directs) ; e-mails via nodemailer ; OTP : réglé, codes par e-mail (nodemailer), plus de Firebase/Authenticator. Dépôt poussé sur github.com/kjbrown-03/CEPCA- (branche main).
Fapshi : webhook unique par service (en-tête x-wh-secret), un seul envoi sans réessai → garder le job de réconciliation.

Piège : Prisma refuse `migrate reset` lancé par un agent (consentement explicite de l'utilisateur requis) — ne pas contourner.

Piège : modifier un fichier depuis PowerShell 5.1 (Get-Content/Set-Content) abîme les accents (schema.prisma l'a été le 2026-10-09) ; passer par Edit/Write ou Python en UTF-8. npm install du monorepo manque de mémoire : NODE_OPTIONS=--max-old-space-size=8192.

Mise en ligne : API et site pas déployés (HTTPS obligatoire pour la PWA), pages légales manquantes, pas de suppression de compte dans l'app (droit des données personnelles).

2026-10-12 : DÉCISION UTILISATEUR — l'app des fidèles devient une PWA dans apps/web (/app), pas d'app native ni de stores. apps/mobile (Expo) est gelé, ne plus le développer (ne pas le supprimer sans demander). PWA livrée et vérifiée dans Edge en mode téléphone : 23 routes /app (bienvenue, compte, code, eglise, pret, accueil, actualites, agenda, contribuer/payer/historique/recu, moi, notifications, documents, projets, predications, hors-ligne), manifest.ts, public/sw.js (portée /app/), icônes public/icons, Web Push VAPID (API PushController /push/key, /me/push-subscription ; migration 20261012090000_web_push ; clés dev dans apps/api/.env). Session web par cookie (otp/verify avec cookie: true). Portail : bouton « Application ». 71 tests API verts. Committé le 2026-10-12 sur main (903b6a4), pas poussé. L'utilisateur travaille sur main (il a fusionné connexion-email et poussé lui-même). Parcours 3 et 4 se feront dans /app.

2026-10-13 : parcours 4 (espaces responsables) livré dans la PWA, non committé. Bouton « Espace responsable » sur l'accueil, choix du rôle, /app/espace/[id] (en-tête KPI du tableau de bord /admin/dashboard, 3 actions rapides, liste à traiter en un geste), formulaires annonce/activite/notification/saisie/etape. Double authentification exigée (choix utilisateur) : RefreshToken.mfa (migration 20261013090000_session_mfa), StaffGuard renvoie 403 MFA_REQUIRED sans mfa, élévation dans l'app par /auth/staff/request (mot de passe) puis /auth/staff/verify (code 6 chiffres). 75 tests verts, vérifié dans Edge (Luc, Élise). Attention : des fichiers d'import d'organisation (admin/imports.controller.ts, import-template.ts, structures/import-panel.tsx, docs/modele-collecte-cepca.xlsx) ont été écrits hors de cette conversation le 12/10 entre 16 h et 17 h 30 : ne pas les committer ni les modifier sans en parler à l'utilisateur.
