-- Une session ouverte par le seul code e-mail du fidèle n'ouvre plus les fonctions des responsables :
-- il faut la double authentification (mot de passe + code à 6 chiffres), retenue sur la famille de jetons.
ALTER TABLE "RefreshToken" ADD COLUMN "mfa" BOOLEAN NOT NULL DEFAULT false;
