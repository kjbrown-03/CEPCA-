# Hébergement d'essai (gratuit)

But : mettre CEPCA en ligne en HTTPS pour la montrer et l'essayer sur téléphone, avant de payer un
hébergeur. **Les paiements y restent simulés** (`DEPLOIEMENT=essai`) ; un bandeau « Version d'essai »
s'affiche en haut à droite de toutes les pages.

| Morceau | Service | Pourquoi |
|---|---|---|
| Web (`apps/web`) | **Vercel** | Next.js natif, HTTPS automatique |
| API (`apps/api`) | **Render** (gratuit) | Vercel ne peut pas la faire tourner : tâches planifiées chaque minute, serveur permanent |
| Base Postgres + fichiers | **Supabase** (gratuit) | Postgres avec `unaccent`, stockage compatible S3, sans carte bancaire |
| Courriels | **Brevo** (gratuit, 300/jour) | Render gratuit bloque les ports SMTP : envoi par API HTTPS (`MAIL_MODE=brevo`) |

Le navigateur ne parle qu'à Vercel : `/api/*` est relayé vers Render (`API_URL`), donc les cookies
restent en même origine, comme en développement.

Faire les étapes **dans cet ordre** : chaque service a besoin de l'adresse du précédent.

---

## 1. Supabase — base et fichiers

1. Créer un projet sur supabase.com, région **Central EU (Frankfurt)**. Noter le mot de passe de la base.
2. **Base** : bouton *Connect* → *Session pooler* (compatible IPv4, ce qu'exige Render). Copier l'URL :
   `postgresql://postgres.<ref>:<mot-de-passe>@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
   → c'est `DATABASE_URL`.
3. **Fichiers** : *Storage* → *New bucket* `cepca-media`, **privé** (l'API contrôle les droits sur chaque fichier).
4. *Project Settings* → *Storage* → *S3 Connection* : noter l'**endpoint** et la **région**, puis
   *New access key* → `S3_ACCESS_KEY` et `S3_SECRET_KEY`.

## 2. Remplir la base (depuis ce poste)

Le jeu de démonstration refuse de se charger si `NODE_ENV=production` : on le lance donc d'ici.

```bash
cd apps/api
export DATABASE_URL='…url du session pooler…'
export S3_ENDPOINT='https://<ref>.supabase.co/storage/v1/s3' S3_REGION='eu-central-1'
export S3_BUCKET=cepca-media S3_ACCESS_KEY='…' S3_SECRET_KEY='…'
npx prisma migrate deploy
npm run seed
```

Les variables exportées passent avant celles de `apps/api/.env`, qui n'est pas modifié.

## 3. Brevo — courriels

1. Créer un compte sur brevo.com.
2. *Senders, domains* → ajouter l'adresse d'expédition (une adresse Gmail convient) et la valider.
3. *SMTP & API* → *API keys* → créer une clé → `BREVO_API_KEY`.
4. Vérifier depuis ce poste :
   ```bash
   cd apps/api
   MAIL_MODE=brevo BREVO_API_KEY='…' MAIL_FROM='CEPCA <adresse-validee@gmail.com>' npm run mail:test -- ton-adresse@exemple.com
   ```

Sans domaine à soi, les courriels envoyés « depuis Gmail » par Brevo peuvent arriver en indésirables :
le dire aux personnes qui essaient.

## 4. Clés des notifications push

```bash
npx web-push generate-vapid-keys
```

→ `VAPID_PUBLIC_KEY` et `VAPID_PRIVATE_KEY`.

## 5. Pousser le dépôt sur GitHub

`render.yaml` et `apps/web/vercel.json` doivent être sur `main` dans `github.com/kjbrown-03/CEPCA-`.

## 6. Render — l'API

1. render.com → *New* → *Blueprint* → choisir le dépôt. Render lit `render.yaml`.
2. Renseigner les variables demandées :

   | Variable | Valeur |
   |---|---|
   | `DATABASE_URL` | étape 1 |
   | `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | étape 1 |
   | `BREVO_API_KEY`, `MAIL_FROM` | étape 3 |
   | `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | étape 4 |
   | `VAPID_SUBJECT` | `mailto:adresse-de-contact` |
   | `CORS_ORIGIN`, `PUBLIC_URL` | provisoirement `https://cepca.vercel.app`, corrigé à l'étape 8 |

   `JWT_ACCESS_SECRET` et `OTP_PEPPER` sont générés par Render.
3. Attendre le premier déploiement, puis noter l'adresse : `https://cepca-api.onrender.com` (ou
   approchant). Vérifier que `…/api/public/confessions` répond.

Si le service s'arrête aussitôt, son journal dit quelle variable manque : l'API refuse de démarrer
plutôt que de tourner mal configurée.

## 7. Vercel — le web

1. vercel.com → *Add New* → *Project* → importer le dépôt.
2. **Root Directory : `apps/web`**. Laisser « Include files outside the root directory » activé
   (le web a besoin de `packages/tokens` et `packages/shared`). Les commandes d'installation et de
   build viennent de `apps/web/vercel.json`.
3. Variables d'environnement :
   - `API_URL` = l'adresse Render de l'étape 6, **sans** `/api` à la fin
   - `DEPLOIEMENT` = `essai`
4. Déployer et noter l'adresse définitive, par exemple `https://cepca-xxxx.vercel.app`.

## 8. Relier les deux

Dans Render, mettre `CORS_ORIGIN` et `PUBLIC_URL` à l'adresse Vercel exacte, **sans** `/` final,
puis redéployer. `PUBLIC_URL` sert aux liens des fichiers et des images : une mauvaise valeur casse les
images, pas la connexion.

## 9. Garder l'API éveillée

Render gratuit endort le service après 15 minutes sans requête : le premier visiteur attend alors
près d'une minute, et **les tâches planifiées ne tournent pas pendant le sommeil** (campagnes
programmées, rapprochement des paiements, récurrence de 6 h). Supabase met aussi en pause un projet
resté une semaine sans activité.

Parade gratuite : sur cron-job.org, appeler `https://<api>.onrender.com/api/public/confessions`
toutes les 10 minutes. Les 750 heures mensuelles de Render suffisent pour un service allumé en continu.

---

## Limites connues de cet hébergement

- **Paiements simulés** : aucun argent ne circule. Passer en réel demande des clés Fapshi `live` et
  le retrait de `DEPLOIEMENT=essai` : l'API refusera alors de démarrer tant que tout n'est pas en place.
- **IP des visiteurs** : `TRUST_PROXY=true` prend la première adresse de `X-Forwarded-For`. Si le relais
  Vercel ne la transmet pas, tous les visiteurs partagent la limite de 120 requêtes par minute. À
  surveiller si des « 429 » apparaissent. Contrepartie : un client peut falsifier cet en-tête pour
  contourner la limite, ce qui est acceptable pour un essai, pas pour la mise en ligne réelle.
- **Gros fichiers** : le relais Vercel limite probablement la taille et la durée des requêtes. Un
  enregistrement audio ou vidéo volumineux peut échouer en dépôt depuis le back-office.
- **Données de démonstration** datées de septembre et octobre 2026 : l'agenda et l'espace jeunes
  apparaissent vides.
- Supabase gratuit : 500 Mo de base, 1 Go de fichiers.
