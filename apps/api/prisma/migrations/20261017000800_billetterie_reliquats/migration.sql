-- CreateTable
CREATE TABLE "promotion" (
    "code" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "promotion_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "proche_voyageur" (
    "id" UUID NOT NULL,
    "voyageurId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "telephoneChiffre" TEXT,
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proche_voyageur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "avis_billetterie" (
    "id" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "cible" TEXT,
    "avis" JSONB NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "avis_billetterie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proche_voyageur_voyageurId_idx" ON "proche_voyageur"("voyageurId");

-- CreateIndex
CREATE INDEX "avis_billetterie_cible_id_idx" ON "avis_billetterie"("cible", "id");

-- CreateIndex
CREATE INDEX "avis_billetterie_type_id_idx" ON "avis_billetterie"("type", "id");


-- LOT B · billetterie : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Promotions : un seul type connu, code en majuscules sans espace (la recherche normalise de même).
ALTER TABLE "promotion"
  ADD CONSTRAINT "promotion_type_connu" CHECK ("type" IN ('frais_offerts')),
  ADD CONSTRAINT "promotion_code_normalise" CHECK ("code" = upper(btrim("code")) AND "code" <> '');

-- Les canaux USSD et WhatsApp vendent « sans frais » : sans ces deux codes, ils ne peuvent rien vendre.
INSERT INTO "promotion" ("code", "type") VALUES ('USSD', 'frais_offerts'), ('WHATSAPP', 'frais_offerts')
  ON CONFLICT ("code") DO NOTHING;

-- Proches : rattachés à un compte voyageur.
ALTER TABLE "proche_voyageur"
  ADD CONSTRAINT "proche_voyageur_voyageur_fkey" FOREIGN KEY ("voyageurId") REFERENCES "personne"("id");

-- Avis de la billetterie : on les ajoute, on ne les réécrit pas (même mécanisme que le reste).
CREATE TRIGGER avis_billetterie_ajout_seul
  BEFORE UPDATE OR DELETE ON "avis_billetterie"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER avis_billetterie_pas_de_vidage
  BEFORE TRUNCATE ON "avis_billetterie"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();
