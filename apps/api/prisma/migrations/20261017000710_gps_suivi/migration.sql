-- CreateTable
CREATE TABLE "position_gps" (
    "sujet" TEXT NOT NULL,
    "auteurId" UUID NOT NULL,
    "instant" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "precisionM" DOUBLE PRECISION,
    "vitesseKmh" DOUBLE PRECISION,
    "recuA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "position_gps_pkey" PRIMARY KEY ("sujet","auteurId","instant")
);

-- CreateTable
CREATE TABLE "suivi_depart" (
    "departId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "derniereInstant" TIMESTAMPTZ(3),
    "derniereLatitude" DOUBLE PRECISION,
    "derniereLongitude" DOUBLE PRECISION,
    "derniereVitesseKmh" DOUBLE PRECISION,
    "progressionKm" DOUBLE PRECISION NOT NULL,
    "passages" JSONB NOT NULL,
    "immobileDepuis" TIMESTAMPTZ(3),
    "immobileLatitude" DOUBLE PRECISION,
    "immobileLongitude" DOUBLE PRECISION,
    "alerteId" UUID,

    CONSTRAINT "suivi_depart_pkey" PRIMARY KEY ("departId")
);

-- CreateTable
CREATE TABLE "alerte_arret" (
    "id" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "immatriculation" TEXT NOT NULL,
    "apres" TEXT NOT NULL,
    "arretDepuis" TIMESTAMPTZ(3) NOT NULL,
    "ouverteA" TIMESTAMPTZ(3) NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "soupcon" TEXT NOT NULL,
    "aBord" INTEGER,
    "resolueA" TIMESTAMPTZ(3),

    CONSTRAINT "alerte_arret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prevenir_proche" (
    "billetId" UUID NOT NULL,
    "procheId" TEXT NOT NULL,
    "voyageurId" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "minutesAvantArrivee" INTEGER NOT NULL,
    "actif" BOOLEAN NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "envoyeA" TIMESTAMPTZ(3),

    CONSTRAINT "prevenir_proche_pkey" PRIMARY KEY ("billetId","procheId")
);

-- CreateIndex
CREATE INDEX "position_gps_sujet_instant_idx" ON "position_gps"("sujet", "instant" DESC);


-- GPS (AM-170) · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Une position a des coordonnées possibles et une précision positive.
ALTER TABLE "position_gps"
  ADD CONSTRAINT "position_gps_coordonnees" CHECK (
    "latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180
  ),
  ADD CONSTRAINT "position_gps_mesures" CHECK (
    ("precisionM" IS NULL OR "precisionM" >= 0) AND ("vitesseKmh" IS NULL OR "vitesseKmh" >= 0)
  );

-- L'état d'un départ commence à la version 1 ; sa progression ne peut pas être négative.
ALTER TABLE "suivi_depart"
  ADD CONSTRAINT "suivi_depart_version" CHECK ("version" >= 1),
  ADD CONSTRAINT "suivi_depart_progression" CHECK ("progressionKm" >= 0);

-- Une seule alerte d'arrêt ouverte par départ : c'est l'index, pas le code, qui le garantit
-- (deux positions simultanées qui franchissent les dix minutes ouvrent une alerte, pas deux).
CREATE UNIQUE INDEX "alerte_arret_une_ouverte_par_depart"
  ON "alerte_arret" ("departId") WHERE "resolueA" IS NULL;
-- La salle de contrôle lit les alertes ouvertes d'une compagnie.
CREATE INDEX "alerte_arret_ouvertes_compagnie"
  ON "alerte_arret" ("compagnieId") WHERE "resolueA" IS NULL;
ALTER TABLE "alerte_arret"
  ADD CONSTRAINT "alerte_arret_soupcon_connu" CHECK ("soupcon" IN ('panne', 'retard', 'autre')),
  ADD CONSTRAINT "alerte_arret_bord" CHECK ("aBord" IS NULL OR "aBord" >= 0),
  ADD CONSTRAINT "alerte_arret_ordre" CHECK ("resolueA" IS NULL OR "resolueA" >= "ouverteA");

-- « Prévenir un proche » : de 1 à 120 minutes ; les SMS en attente d'un départ se lisent par index.
ALTER TABLE "prevenir_proche"
  ADD CONSTRAINT "prevenir_proche_minutes" CHECK ("minutesAvantArrivee" BETWEEN 1 AND 120);
CREATE INDEX "prevenir_proche_en_attente"
  ON "prevenir_proche" ("departId") WHERE "actif" AND "envoyeA" IS NULL;
