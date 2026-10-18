-- CreateTable
CREATE TABLE "ligne_reglage" (
    "ligneId" UUID NOT NULL,
    "disposition" TEXT NOT NULL,
    "rangees" INTEGER NOT NULL,
    "capacite" INTEGER NOT NULL,
    "venteEnLigne" BOOLEAN NOT NULL DEFAULT true,
    "fusionAuto" BOOLEAN NOT NULL DEFAULT false,
    "brouillon" JSONB,
    "effetDu" DATE,
    "modifieA" TIMESTAMPTZ(3) NOT NULL,
    "modifiePar" UUID,

    CONSTRAINT "ligne_reglage_pkey" PRIMARY KEY ("ligneId")
);

-- CreateTable
CREATE TABLE "ligne_horaire" (
    "id" UUID NOT NULL,
    "ligneId" UUID NOT NULL,
    "heure" TEXT NOT NULL,
    "classe" "classe_billet" NOT NULL,
    "prix" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "jours" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ligne_horaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "personne_reglage" (
    "personneId" UUID NOT NULL,
    "operateur" TEXT NOT NULL,
    "salaire" INTEGER NOT NULL DEFAULT 0,
    "jourDePaie" INTEGER NOT NULL DEFAULT 30,
    "droits" JSONB NOT NULL,
    "modifieA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "personne_reglage_pkey" PRIMARY KEY ("personneId")
);

-- CreateTable
CREATE TABLE "regles_compagnie" (
    "compagnieId" UUID NOT NULL,
    "gratuiteJusqua" TEXT NOT NULL,
    "retenue" TEXT NOT NULL,
    "retenueClassiquePct" INTEGER NOT NULL,
    "retenueVipPct" INTEGER NOT NULL,
    "auDela" TEXT NOT NULL,
    "numeroObligatoire" BOOLEAN NOT NULL,
    "fraisServiceMontant" INTEGER NOT NULL,
    "fraisServicePrisEnCharge" BOOLEAN NOT NULL,
    "modifieA" TIMESTAMPTZ(3) NOT NULL,
    "modifiePar" UUID,

    CONSTRAINT "regles_compagnie_pkey" PRIMARY KEY ("compagnieId")
);

-- CreateTable
CREATE TABLE "compte_momo_agence" (
    "compagnieId" UUID NOT NULL,
    "operateur" TEXT NOT NULL,
    "telephoneChiffre" TEXT NOT NULL,
    "ancienChiffre" TEXT,
    "ancienJusqua" TIMESTAMPTZ(3),
    "modifieA" TIMESTAMPTZ(3) NOT NULL,
    "modifiePar" UUID NOT NULL,

    CONSTRAINT "compte_momo_agence_pkey" PRIMARY KEY ("compagnieId","operateur")
);

-- CreateTable
CREATE TABLE "confirmation_compte_momo" (
    "compagnieId" UUID NOT NULL,
    "operateur" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "essais" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "confirmation_compte_momo_pkey" PRIMARY KEY ("compagnieId","operateur")
);

-- CreateIndex
CREATE INDEX "ligne_horaire_ligneId_heure_idx" ON "ligne_horaire"("ligneId", "heure");
