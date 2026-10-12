-- Notifications push de l'application web (PWA) : abonnement du navigateur (Web Push, clés VAPID).
ALTER TABLE "PushToken" ADD COLUMN "p256dh" TEXT;
ALTER TABLE "PushToken" ADD COLUMN "auth" TEXT;
CREATE INDEX "PushToken_userId_idx" ON "PushToken"("userId");
