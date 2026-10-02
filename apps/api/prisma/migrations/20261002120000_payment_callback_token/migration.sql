-- Jeton de l'URL de rappel des opérateurs (haché).
ALTER TABLE "PaymentTransaction" ADD COLUMN "callbackTokenHash" TEXT;
