-- Lot Dc : bord (convoyeur, chauffeur, contrôle inopiné). Additif : colonnes ajoutées à `depart_incident` et
-- `depart_depense` (lot C), six tables nouvelles. Les garde-fous sont dans `202610180010c10_bord_garanties`.

-- AlterTable
ALTER TABLE "depart_incident" ADD COLUMN     "auteurId" UUID,
ADD COLUMN     "categorie" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "precisionM" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "depart_depense" ADD COLUMN     "auteurId" UUID,
ADD COLUMN     "categorie" TEXT,
ADD COLUMN     "justificatifRef" TEXT;

-- CreateTable
CREATE TABLE "vente_en_route" (
    "billetId" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "convoyeurId" UUID NOT NULL,
    "arretMontee" TEXT NOT NULL,
    "arretDescente" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "precisionM" DOUBLE PRECISION,
    "venduA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vente_en_route_pkey" PRIMARY KEY ("billetId")
);

-- CreateTable
CREATE TABLE "passage_route" (
    "id" UUID NOT NULL,
    "genre" TEXT NOT NULL,
    "departId" UUID NOT NULL,
    "auteurId" UUID NOT NULL,
    "arret" TEXT NOT NULL,
    "billetId" UUID,
    "resultat" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "precisionM" DOUBLE PRECISION,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "passage_route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_inopine" (
    "id" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "controleurId" UUID NOT NULL,
    "lieu" TEXT NOT NULL,
    "ouvertA" TIMESTAMPTZ(3) NOT NULL,
    "clotureA" TIMESTAMPTZ(3),
    "liste" INTEGER,
    "tetes" INTEGER,
    "ecart" INTEGER,
    "envoyeAuPatron" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "controle_inopine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "controle_siege" (
    "controleId" UUID NOT NULL,
    "siege" INTEGER NOT NULL,
    "constat" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "controle_siege_pkey" PRIMARY KEY ("controleId","siege")
);

-- CreateTable
CREATE TABLE "controle_signalement" (
    "evenementId" UUID NOT NULL,
    "controleId" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "convoyeurId" UUID NOT NULL,
    "siege" INTEGER NOT NULL,
    "montantDeclare" INTEGER NOT NULL,
    "note" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "patronPrevenu" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "controle_signalement_pkey" PRIMARY KEY ("evenementId")
);

-- CreateTable
CREATE TABLE "controle_regularisation" (
    "billetId" UUID NOT NULL,
    "controleId" UUID NOT NULL,
    "siege" INTEGER NOT NULL,
    "prix" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "controle_regularisation_pkey" PRIMARY KEY ("billetId")
);

-- CreateIndex
CREATE INDEX "vente_en_route_departId_venduA_idx" ON "vente_en_route"("departId", "venduA");

-- CreateIndex
CREATE INDEX "passage_route_departId_genre_at_idx" ON "passage_route"("departId", "genre", "at");

-- CreateIndex
CREATE INDEX "controle_inopine_departId_idx" ON "controle_inopine"("departId");

-- CreateIndex
CREATE INDEX "controle_inopine_controleurId_ouvertA_idx" ON "controle_inopine"("controleurId", "ouvertA");

-- CreateIndex
CREATE INDEX "controle_signalement_controleId_idx" ON "controle_signalement"("controleId");

-- CreateIndex
CREATE INDEX "controle_signalement_convoyeurId_at_idx" ON "controle_signalement"("convoyeurId", "at");

-- CreateIndex
CREATE INDEX "controle_regularisation_controleId_idx" ON "controle_regularisation"("controleId");
