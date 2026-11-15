-- Les index par préfixe de chemin (text_pattern_ops) de la migration init sont écrits à la main :
-- Prisma ne les connaît pas et proposait de les supprimer. Ils restent, sinon chaque filtre
-- « startsWith » sur un chemin repasse en lecture complète de la table.

-- CreateTable
CREATE TABLE "ProjectVolunteer" (
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProjectVolunteer_pkey" PRIMARY KEY ("projectId","userId")
);

-- CreateIndex
CREATE INDEX "ProjectVolunteer_userId_idx" ON "ProjectVolunteer"("userId");

-- AddForeignKey
ALTER TABLE "ProjectVolunteer" ADD CONSTRAINT "ProjectVolunteer_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectVolunteer" ADD CONSTRAINT "ProjectVolunteer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
