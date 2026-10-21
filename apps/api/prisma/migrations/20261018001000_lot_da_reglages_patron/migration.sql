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
