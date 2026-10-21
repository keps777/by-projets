-- CreateTable
CREATE TABLE "whatsapp_message" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "gabarit" TEXT,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "compagnieId" UUID,
    "demandeurId" UUID,
    "destinataireChiffre" TEXT NOT NULL,
    "destinataireIndex" TEXT NOT NULL,
    "destinataireMasque" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "idFournisseur" TEXT,
    "derniereErreur" TEXT,
    "secours" TEXT NOT NULL DEFAULT 'aucun',
    "secoursSmsId" TEXT,
    "secoursChiffre" TEXT,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "planifieA" TIMESTAMPTZ(3),
    "expireA" TIMESTAMPTZ(3),
    "envoyeA" TIMESTAMPTZ(3),
    "remisA" TIMESTAMPTZ(3),
    "luA" TIMESTAMPTZ(3),
    "delaiEnvoiMs" INTEGER,

    CONSTRAINT "whatsapp_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_essai" (
    "id" BIGSERIAL NOT NULL,
    "messageId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "fournisseur" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "dureeMs" INTEGER NOT NULL,
    "resultat" TEXT NOT NULL,
    "code" TEXT,

    CONSTRAINT "whatsapp_essai_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_entrant" (
    "id" UUID NOT NULL,
    "idFournisseur" TEXT NOT NULL,
    "expediteurIndex" TEXT NOT NULL,
    "expediteurMasque" TEXT NOT NULL,
    "typeMessage" TEXT NOT NULL,
    "recuA" TIMESTAMPTZ(3) NOT NULL,
    "repondueA" TIMESTAMPTZ(3),
    "delaiReponseMs" INTEGER,

    CONSTRAINT "whatsapp_entrant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_cle_key" ON "whatsapp_message"("cle");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_message_idFournisseur_key" ON "whatsapp_message"("idFournisseur");

-- CreateIndex
CREATE INDEX "whatsapp_message_compagnieId_creeA_idx" ON "whatsapp_message"("compagnieId", "creeA" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_message_referenceType_referenceId_idx" ON "whatsapp_message"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "whatsapp_message_demandeurId_creeA_idx" ON "whatsapp_message"("demandeurId", "creeA");

-- CreateIndex
CREATE INDEX "whatsapp_message_destinataireIndex_creeA_idx" ON "whatsapp_message"("destinataireIndex", "creeA");

-- CreateIndex
CREATE INDEX "whatsapp_essai_messageId_id_idx" ON "whatsapp_essai"("messageId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_entrant_idFournisseur_key" ON "whatsapp_entrant"("idFournisseur");

-- CreateIndex
CREATE INDEX "whatsapp_entrant_expediteurIndex_recuA_idx" ON "whatsapp_entrant"("expediteurIndex", "recuA" DESC);

-- AddForeignKey
ALTER TABLE "whatsapp_essai" ADD CONSTRAINT "whatsapp_essai_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "whatsapp_message"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- WhatsApp (AM-167) · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Les valeurs fermées du vocabulaire de la passerelle (apps/api/src/whatsapp/types.ts).
ALTER TABLE "whatsapp_message"
  ADD CONSTRAINT "whatsapp_message_type_connu" CHECK (
    "type" IN ('rapport_soir', 'billet', 'colis', 'alerte_proche', 'alerte_retard', 'reponse')
  ),
  ADD CONSTRAINT "whatsapp_message_statut_connu" CHECK (
    "statut" IN ('en_file', 'en_reprise', 'envoye', 'remis', 'lu', 'non_remis', 'echec', 'expire', 'annule')
  ),
  ADD CONSTRAINT "whatsapp_message_secours_connu" CHECK ("secours" IN ('aucun', 'en_cours', 'sms', 'echec_sms')),
  ADD CONSTRAINT "whatsapp_message_compteurs" CHECK (
    "tentatives" >= 0 AND ("delaiEnvoiMs" IS NULL OR "delaiEnvoiMs" >= 0)
  ),
  ADD CONSTRAINT "whatsapp_message_reference_complete" CHECK (("referenceType" IS NULL) = ("referenceId" IS NULL));

-- Le nettoyage du texte de repli (48 h après la création, ou à la remise) cherche ceux qui restent.
CREATE INDEX "whatsapp_message_secours" ON "whatsapp_message" ("creeA") WHERE "secoursChiffre" IS NOT NULL;

ALTER TABLE "whatsapp_essai"
  ADD CONSTRAINT "whatsapp_essai_resultat_connu" CHECK ("resultat" IN ('accepte', 'temporaire', 'definitif')),
  ADD CONSTRAINT "whatsapp_essai_numero" CHECK ("numero" >= 1 AND "dureeMs" >= 0);

-- Les essais sont une trace : on les ajoute, on ne les réécrit pas (même mécanisme que le reste).
CREATE TRIGGER whatsapp_essai_ajout_seul
  BEFORE UPDATE OR DELETE ON "whatsapp_essai"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER whatsapp_essai_pas_de_vidage
  BEFORE TRUNCATE ON "whatsapp_essai"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Une réponse porte son instant et son délai, ou aucun des deux.
ALTER TABLE "whatsapp_entrant"
  ADD CONSTRAINT "whatsapp_entrant_reponse_complete" CHECK (
    ("repondueA" IS NULL) = ("delaiReponseMs" IS NULL)
  ),
  ADD CONSTRAINT "whatsapp_entrant_delai" CHECK ("delaiReponseMs" IS NULL OR "delaiReponseMs" >= 0);

-- Le calcul de « répond en N min » ne lit que les messages qui ont reçu une réponse.
CREATE INDEX "whatsapp_entrant_repondus" ON "whatsapp_entrant" ("recuA") WHERE "delaiReponseMs" IS NOT NULL;
-- La réponse du compte retrouve le plus ancien message en attente de ce numéro.
CREATE INDEX "whatsapp_entrant_en_attente" ON "whatsapp_entrant" ("expediteurIndex", "recuA") WHERE "repondueA" IS NULL;
