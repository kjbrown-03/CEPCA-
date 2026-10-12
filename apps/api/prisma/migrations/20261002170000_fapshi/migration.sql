-- Fapshi devient le prestataire des paiements Mobile Money ; le jeton de rappel par transaction n'est plus utilisé
-- (Fapshi a une adresse de webhook unique par service, authentifiée par un secret).
ALTER TYPE "PaymentChannel" ADD VALUE IF NOT EXISTS 'FAPSHI';
ALTER TABLE "PaymentTransaction" DROP COLUMN "callbackTokenHash";
