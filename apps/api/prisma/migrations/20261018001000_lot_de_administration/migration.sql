-- CreateTable
CREATE TABLE "horaire_ligne" (
    "id" UUID NOT NULL,
    "ligneId" UUID NOT NULL,
    "heure" TEXT NOT NULL,
    "classe" "classe_billet" NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "jours" TEXT[],
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "horaire_ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglage_ligne" (
    "ligneId" UUID NOT NULL,
    "capacite" INTEGER NOT NULL,
    "disposition" TEXT NOT NULL,
    "rangees" INTEGER NOT NULL,
    "venteEnLigne" BOOLEAN NOT NULL DEFAULT true,
    "fusionAuto" BOOLEAN NOT NULL DEFAULT false,
    "brouillon" JSONB,
    "effetDu" TEXT,
    "misAJourA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reglage_ligne_pkey" PRIMARY KEY ("ligneId")
);

-- CreateTable
CREATE TABLE "enrolement_appareil" (
    "appareilId" TEXT NOT NULL,
    "compagnieId" UUID NOT NULL,
    "gareId" UUID,
    "libelle" TEXT,
    "codeHache" TEXT,
    "codeExpireA" TIMESTAMPTZ(3),
    "secretHache" TEXT,
    "enroleA" TIMESTAMPTZ(3),
    "creePar" UUID,
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "enrolement_appareil_pkey" PRIMARY KEY ("appareilId")
);

-- CreateTable
CREATE TABLE "commande_appareil" (
    "id" UUID NOT NULL,
    "appareilId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "emiseA" TIMESTAMPTZ(3) NOT NULL,
    "emisePar" UUID,
    "motif" TEXT,
    "acquitteeA" TIMESTAMPTZ(3),
    "rapport" JSONB,

    CONSTRAINT "commande_appareil_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "horaire_ligne_ligneId_idx" ON "horaire_ligne"("ligneId");

-- CreateIndex
CREATE INDEX "enrolement_appareil_compagnieId_gareId_idx" ON "enrolement_appareil"("compagnieId", "gareId");

-- CreateIndex
CREATE INDEX "commande_appareil_appareilId_emiseA_idx" ON "commande_appareil"("appareilId", "emiseA");

