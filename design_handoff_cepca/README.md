# Handoff : CEPCA Digital — plateforme des Églises protestantes du Cameroun

## Vue d'ensemble
Plateforme commune du Conseil des Églises Protestantes du Cameroun (CEPCA) : un portail web public, une application mobile pour les fidèles (avec des espaces responsables intégrés) et un back-office web pour les administrateurs. Chaque confession membre garde son autonomie ; les données sont cloisonnées par structure (CEPCA → confession → synode → consistoire → paroisse → chapelle).

Le cahier des charges fonctionnel complet est fourni : `cahier-des-charges-CEPCA.txt`. Il fait foi pour les règles métier ; les maquettes font foi pour l'interface. Périmètre à livrer en premier : la **version MVP** (§70 et Annexe 3 du cahier).

## À propos des fichiers de design
Les fichiers de `designs/` sont des **références de design en HTML** : des prototypes cliquables qui montrent l'apparence et le comportement attendus. Ce n'est **pas du code de production à copier**. La tâche est de **recréer ces écrans** dans l'environnement cible avec ses propres conventions. Si aucun projet n'existe encore, stack recommandée :
- **App mobile fidèles + responsables** : React Native (Expo) + TypeScript.
- **Portail public + back-office** : Next.js (App Router) + TypeScript.
- **API** : Node.js (NestJS) ou Laravel, PostgreSQL, authentification par numéro de téléphone + code SMS (OTP).
- **Intégrations** : MTN Mobile Money API, Orange Money Web Payment, notifications push (FCM/APNs), passerelle SMS, stockage objet pour les médias (prédications audio/vidéo, PDF).

Pour ouvrir une maquette : ouvrir le fichier `.dc.html` dans un navigateur (garder `support.js` et `image-slot.js` dans le même dossier ; connexion Internet requise pour les polices, les icônes et les photos).

## Fidélité
**Haute fidélité (hifi).** Couleurs, typographie, espacements, textes et interactions sont définitifs. Reproduire fidèlement. Les données (noms, montants, dates) sont des exemples à remplacer par l'API. Les photos sont des illustrations Unsplash, à remplacer par les photos du CEPCA. Le logo n'existe pas encore (une croix dans un carré vert sert de marque provisoire).

## Fichiers
| Fichier | Parcours | Plateforme |
|---|---|---|
| `designs/1-portail-public.dc.html` | Visiteur | Web (responsive) |
| `designs/2-app-fidele-mvp.dc.html` | Fidèle — parcours MVP complet | Mobile |
| `designs/3-app-fidele-complements.dc.html` | Fidèle — vie de la communauté | Mobile |
| `designs/4-app-espaces-responsables.dc.html` | Pasteur, financier, projet, communication | Mobile |
| `designs/5-back-office.dc.html` | 9 rôles d'administration | Web (desktop) |
| `cahier-des-charges-CEPCA.txt` | Cahier des charges fonctionnel | — |

Dans chaque fichier, le balisage est dans `<x-dc>…</x-dc>` (styles en ligne) et la logique (données d'exemple, états, actions) dans `<script data-dc-script>` (classe `Component`, méthode `renderVals()`). Les tableaux en tête du script (`NEWS`, `EV`, `SE`, `PR`, `ROLES`, `TREE`, `USERS`, `MX`…) décrivent la forme des données à servir par l'API.

---

## Design tokens

### Couleurs
| Rôle | Hex |
|---|---|
| Vert principal (boutons, actif, progression) | `#1f5a36` |
| Vert survol | `#164429` |
| Vert foncé (barre latérale, cartes chiffres) | `#133524` |
| Vert très foncé (cadre mobile, toasts, pied de page) | `#102a1c` |
| Vert foncé secondaire (survol barre latérale) | `#1d4a33` |
| Vert pâle (fonds d'icônes, sélection, badges) | `#e3eee5` |
| Vert pâle 2 (barres de graphique inactives) | `#c9dccd` |
| Fond crème | `#f4efe6` |
| Surface carte | `#fbf8f2` |
| Papier (aperçu de rapport) | `#fffdf8` |
| Filets | `#d9d2c2`, `#e6dfd0`, `#ece6d9`, `#dde3d8`, `#d6dfd3` |
| Texte | `#1c2a21` |
| Texte secondaire | `#55665a`, `#33443a` |
| Texte sur vert | `#f4efe6` ; secondaire `#a9c4b2`, `#d6e6db` |
| Ocre (accent, badges, montants) | `#e0a043` ; texte ocre `#9a6414` ; ocre clair `#f2c77a` |
| Avertissement | fond `#f6ead2`, texte `#8a5a10` |
| Erreur / refus | fond `#f3dcdc`, texte `#8a2330` |
| Info | fond `#e1e8f0`, texte `#2b4a6b` |
| MTN MoMo | `#ffcb05` · Orange Money `#ff7900` |
| Mode sombre du portail | fond `#0e1f15`, surface `#15291c`, texte `#f1ece2` |

### Typographie
- **Titres** : Instrument Serif 400 (Google Fonts), italique pour les mots mis en valeur. Tailles : 92 (hero portail, `clamp(44px, 6.4vw, 92px)`), 64, 54, 44, 34, 30, 26, 24, 22 px ; interligne 1–1.15.
- **Texte** : Manrope 400/500/600/700. Tailles : 19, 16, 15, 14, 13, 12, 11, 10 px ; interligne du corps 1.5–1.65.
- **Surtitres** : Manrope 700, 11–13 px, majuscules, interlettrage 0.08–0.16em.
- Chiffres de tableaux : `font-variant-numeric: tabular-nums`.

### Icônes
Phosphor Icons 2.1.1 (`ph`, `ph-bold`, `ph-fill`). 16–28 px.

### Rayons
Pilules `999px` · cartes 20–22 px · champs et lignes 12–16 px · petits blocs 8–10 px · photos 16–26 px · cadre téléphone 42–46 px.

### Espacements
Écarts : 4, 6, 8, 10, 12, 14, 16, 18, 20, 24, 28, 36 px. Marges de page : back-office 36 px, mobile 18–20 px, portail 32 px (max 1320 px).

### Ombres
Cartes : filet intérieur `inset 0 0 0 1px #e6dfd0` (pas d'ombre portée). Téléphone : `0 0 0 10px #102a1c, 0 30px 60px rgba(16,42,28,.3)`. Toast : `0 12px 30px rgba(16,42,28,.35)`.

### Composants récurrents
- **Bouton principal** : hauteur 44–56, pilule, fond `#1f5a36`, texte `#f4efe6` 700.
- **Bouton secondaire** : pilule, `inset 0 0 0 1px #1c2a21`, transparent.
- **Puce de filtre** : hauteur 36, pilule ; active = fond vert, texte crème ; inactive = surface + filet `#d9d2c2`.
- **Interrupteur** : 48×28 (mobile 50×30), actif `#1f5a36`, inactif `#c9d3c8`, pastille 22 px, transition `left .2s`.
- **Pastille de statut** : 4×10 px, 11–12 px 700. Actif/Réussi/Publié = vert ; En attente/À valider = avertissement ; Échec/Refusé/Annulé = erreur ; Brouillon = `#ece6d9`/`#55665a`.
- **Barre de progression** : 6–8 px, fond `#e3e8df`, remplissage vert (ocre sur fond vert foncé).
- **Toast** : en bas au centre, `#102a1c`, icône ocre, disparaît après 2,4 s.
- **Barre d'onglets mobile** : 5 onglets (Accueil, Actualités, Contribuer, Agenda, Moi), hauteur 80, actif vert + icône pleine.

---

## Écrans et comportements

### 1. Portail public (web)
Barre collante (logo, Églises membres, Actualités, Contact, bascule clair/sombre, Se connecter). **Hero** plein écran à 4 photos en fondu toutes les 6 s (transition opacité 1,6 s), sélecteurs en traits, titre « Des Églises diverses, une même maison. », lien « Les Églises membres ↓ ». **Mission** : 2 photos + 3 piliers (S'informer, Se retrouver, Agir ensemble). **Églises membres** : recherche + liste ; cliquer une confession filtre les actualités. **Actualités** : article à la une + 3 secondaires, filtre Tout/Actualités/Communiqués. **Contact** : formulaire validé (nom ≥ 2, e-mail valide, message ≥ 5), écran de confirmation. Pied de page vert très foncé.

### 2. App fidèle — MVP
- **Inscription** : bienvenue → nom + pays (+237/+33/+1) + téléphone (≥ 8 chiffres) → code SMS 4 chiffres → confession, paroisse, résidence (Cameroun/diaspora) → bienvenue (rattachement en attente de validation par le pasteur).
- **Accueil** : salutation, cloche avec nombre de non-lus, carte « Prochain culte » (heures Douala et Paris), 4 accès rapides, 2 annonces, projet à soutenir.
- **Actualités** : filtres Paroisse/Confession/CEPCA, détail avec partage.
- **Agenda** : liste d'octobre, détail avec inscription/désinscription et ajout au calendrier.
- **Notifications** : appui = marquer lu + ouvrir l'écran lié ; « Tout marquer lu ».
- **Prédications** : filtre Audio/Vidéo ; lecteur avec lecture/pause, ±15 s, vitesse 1×/1,5×/2×, téléchargement hors ligne.
- **Documents** : téléchargement par document.
- **Contribuer** : type (Offrande, Dîme, Projet, Œuvre sociale ; Projet ouvre le choix du projet), montant (saisie + 5 000/10 000/25 000/50 000), équivalent € (1 € = 655,957 FCFA), mensuel (prélevé le 1er), frais opérateur 1,5 % → **Paiement** (récapitulatif, MTN MoMo ou Orange Money, numéro) → attente « Confirmez sur votre téléphone » → **Reçu** (référence, date, type, destination, montant, frais, moyen, statut, PDF) → **Historique** (total, liste, chaque ligne rouvre son reçu).
- **Projets** : liste avec progression, détail avec suivi et « Soutenir ce projet » (préremplit la contribution).
- **Moi** : profil, Mon Église (hiérarchie), raccourcis, langue, fuseau, déconnexion.

### 3. App fidèle — compléments
Ma chapelle (hiérarchie, responsable, horaire), Groupes (rejoindre → en attente), Je participe (compétences + disponibilités par jour), Lire et méditer (méditations, études, messages pastoraux), Espace jeunes + actions sociales (don en bas d'écran, bénévolat), Mon engagement (mes projets / mes activités), Recherche (filtres par type).

### 4. Espaces responsables (mobile)
Bouton « Espace responsable » sur l'accueil → choix du rôle si plusieurs. Chaque espace : en-tête vert foncé (rôle, structure, chiffre principal, 2 indicateurs), 3 actions rapides, liste à traiter avec action en un geste (Valider / Régler / Terminer / Soumettre).

### 5. Back-office (web)
Barre latérale verte (carte « Mon rôle », menu selon le rôle, utilisateur). En-tête : fil d'Ariane du périmètre, recherche, notifications. Le bandeau « Démo » (choix du rôle) **n'existe pas en production** : chaque compte voit son seul rôle.
- **Tableau de bord** : 4 indicateurs, graphique 6 mois, file « À valider » (Valider/Refuser), tableau du niveau inférieur, mes droits, journal récent.
- **Structures** : arbre dépliable limité au périmètre, fiche, ajout du niveau suivant (statut « Configuration »).
- **Utilisateurs** : recherche, filtres, fiche, validation d'inscription, suspension, attribution rôle + structure.
- **Rôles et droits** : matrice modules × Consulter / Créer-modifier / Valider par rôle, état « non enregistré ».
- **Publications** : filtres par statut, éditeur (titre, type, audience, texte, notification). La communication **soumet** au pasteur ; pasteur et niveaux supérieurs **publient** ou **renvoient à l'auteur**.
- **Événements** : fiche (date, heure Douala → Paris +1 h, lieu, direct, inscriptions + capacité), publier/annuler.
- **Prédications, Documents (visibilité Public/Fidèles/Responsables), Notifications (push/SMS, 160 car., coût SMS 15 FCFA, programmation), Projets (collecte ouverte, étapes, mises à jour), Contributions (rapprochement, relance, saisie manuelle, clôture refusée s'il reste des paiements en attente), Rapports (type, période, périmètre, format, aperçu), Journal d'audit (lecture seule, filtres, export CSV), Paramètres.**

## Règles métier clés (voir le cahier)
- Cloisonnement : un rôle ne voit que sa structure et ses sous-structures ; le CEPCA ne voit que des données agrégées des confessions.
- Toute action sensible est journalisée (connexion, validation, paiement, droits, export, publication).
- Les publications de la communication passent par une validation.
- Montants en FCFA, conversion € affichée pour la diaspora ; heures affichées Douala et Paris.
- Paiement confirmé uniquement après le retour de l'opérateur (statut « En attente » sinon).

## Assets
Photos : Unsplash (crédits dans chaque `image-slot`), à remplacer. Icônes : Phosphor. Polices : Google Fonts (Instrument Serif, Manrope). Pas de logo définitif.
