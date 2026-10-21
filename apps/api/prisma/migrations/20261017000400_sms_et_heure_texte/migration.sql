-- SMS (AM-166) : journal des messages et des essais d'envoi ; journal de synchronisation : heure
-- d'origine de l'événement, telle que l'appareil l'a signée. Additif : une table pour chaque nouveauté,
-- une colonne nullable sur `journal_evenement`. Les garde-fous (CHECK, index partiels, ajout seul)
-- sont dans la migration suivante.

-- AlterTable
ALTER TABLE "journal_evenement" ADD COLUMN     "atTexte" TEXT;

-- CreateTable
CREATE TABLE "sms_message" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "compagnieId" UUID,
    "demandeurId" UUID,
    "destinataireChiffre" TEXT NOT NULL,
    "destinataireIndex" TEXT NOT NULL,
    "destinataireMasque" TEXT NOT NULL,
    "expediteur" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "encodage" TEXT NOT NULL,
    "caracteres" INTEGER NOT NULL,
    "segments" INTEGER NOT NULL,
    "coutFcfa" INTEGER NOT NULL DEFAULT 0,
    "coutEstimeFcfa" INTEGER NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "fournisseur" TEXT,
    "idFournisseur" TEXT,
    "derniereErreur" TEXT,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "planifieA" TIMESTAMPTZ(3),
    "expireA" TIMESTAMPTZ(3),
    "envoyeA" TIMESTAMPTZ(3),
    "livreA" TIMESTAMPTZ(3),
    "delaiEnvoiMs" INTEGER,

    CONSTRAINT "sms_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sms_essai" (
    "id" BIGSERIAL NOT NULL,
    "messageId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "dureeMs" INTEGER NOT NULL,
    "resultat" TEXT NOT NULL,
    "code" TEXT,

    CONSTRAINT "sms_essai_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sms_message_cle_key" ON "sms_message"("cle");

-- CreateIndex
CREATE INDEX "sms_message_compagnieId_creeA_idx" ON "sms_message"("compagnieId", "creeA" DESC);

-- CreateIndex
CREATE INDEX "sms_message_referenceType_referenceId_idx" ON "sms_message"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "sms_message_demandeurId_creeA_idx" ON "sms_message"("demandeurId", "creeA");

-- CreateIndex
CREATE INDEX "sms_message_destinataireIndex_creeA_idx" ON "sms_message"("destinataireIndex", "creeA");

-- CreateIndex
CREATE INDEX "sms_message_statut_creeA_idx" ON "sms_message"("statut", "creeA");

-- CreateIndex
CREATE INDEX "sms_essai_messageId_id_idx" ON "sms_essai"("messageId", "id");

-- AddForeignKey
ALTER TABLE "sms_essai" ADD CONSTRAINT "sms_essai_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "sms_message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
