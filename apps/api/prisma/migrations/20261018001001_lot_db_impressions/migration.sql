-- Lot Db (recette AM-181, anomalie A2) : impressions demandées par les appareils de l'agence. Additif.
-- Dépend de la fonction `interdire_modification()` de la migration « ajout_seul_et_contraintes ».

-- CreateTable
CREATE TABLE "impression_agence" (
    "evenementId" UUID NOT NULL,
    "document" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "copies" INTEGER NOT NULL,
    "reimpression" BOOLEAN NOT NULL,
    "auteurId" UUID NOT NULL,
    "appareilId" TEXT NOT NULL,
    "compagnieId" UUID,
    "imprimeeA" TIMESTAMPTZ(3) NOT NULL,
    "recuA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "impression_agence_pkey" PRIMARY KEY ("evenementId")
);

-- CreateIndex
CREATE INDEX "impression_agence_document_documentId_idx" ON "impression_agence"("document", "documentId");

-- CreateIndex
CREATE INDEX "impression_agence_auteurId_imprimeeA_idx" ON "impression_agence"("auteurId", "imprimeeA");

-- ------------------------------------------------------------------ garde-fous écrits en SQL

ALTER TABLE "impression_agence"
  ADD CONSTRAINT "impression_agence_auteur_fkey" FOREIGN KEY ("auteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "impression_agence_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "impression_agence_document_connu" CHECK ("document" IN ('billet', 'etiquette_colis', 'ticket_caisse')),
  ADD CONSTRAINT "impression_agence_copies" CHECK ("copies" BETWEEN 1 AND 5);

-- En ajout seul : une impression ne se modifie ni ne se supprime, la table ne se vide pas.
CREATE TRIGGER impression_agence_ajout_seul
  BEFORE UPDATE OR DELETE ON "impression_agence"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER impression_agence_pas_de_vidage
  BEFORE TRUNCATE ON "impression_agence"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();
