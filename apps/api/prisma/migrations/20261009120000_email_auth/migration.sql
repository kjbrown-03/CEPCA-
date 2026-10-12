-- Connexion par e-mail : les codes à usage unique ne partent plus par SMS.
-- Les anciens codes (adressés à des numéros) sont tous expirés ou caducs : on les supprime.
DELETE FROM "OtpChallenge";

ALTER TABLE "OtpChallenge" RENAME COLUMN "phone" TO "email";
ALTER INDEX "OtpChallenge_phone_createdAt_idx" RENAME TO "OtpChallenge_email_createdAt_idx";