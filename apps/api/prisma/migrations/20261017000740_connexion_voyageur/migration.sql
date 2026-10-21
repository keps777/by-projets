-- CreateTable
CREATE TABLE "code_connexion_voyageur" (
    "id" UUID NOT NULL,
    "telephoneIndex" TEXT NOT NULL,
    "codeHache" TEXT NOT NULL,
    "canal" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "consommeA" TIMESTAMPTZ(3),

    CONSTRAINT "code_connexion_voyageur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "limite_connexion_voyageur" (
    "telephoneIndex" TEXT NOT NULL,
    "echecs" INTEGER NOT NULL DEFAULT 0,
    "blocages" INTEGER NOT NULL DEFAULT 0,
    "bloqueJusqua" TIMESTAMPTZ(3),
    "dernierEchecA" TIMESTAMPTZ(3),

    CONSTRAINT "limite_connexion_voyageur_pkey" PRIMARY KEY ("telephoneIndex")
);

-- CreateTable
CREATE TABLE "fiche_voyageur" (
    "personneId" UUID NOT NULL,
    "inscritA" TIMESTAMPTZ(3) NOT NULL,
    "langue" TEXT NOT NULL DEFAULT 'fr',
    "pieceVerifiee" BOOLEAN NOT NULL DEFAULT false,
    "pieceQuatreDerniers" TEXT,

    CONSTRAINT "fiche_voyageur_pkey" PRIMARY KEY ("personneId")
);

-- CreateIndex
CREATE INDEX "code_connexion_voyageur_telephoneIndex_creeA_idx" ON "code_connexion_voyageur"("telephoneIndex", "creeA" DESC);


-- Connexion du voyageur (AM-023) · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

ALTER TABLE "code_connexion_voyageur"
  ADD CONSTRAINT "code_connexion_voyageur_empreinte" CHECK ("codeHache" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "code_connexion_voyageur_canal_connu" CHECK ("canal" IN ('sms', 'whatsapp')),
  ADD CONSTRAINT "code_connexion_voyageur_echeance" CHECK ("expireA" > "creeA");

-- Un code émis ne se réécrit pas : seul « consommé » bouge, une fois, de vide à rempli. Même un
-- accès direct à la base ne peut ni rendre un code à nouveau valable ni changer son empreinte.
CREATE FUNCTION code_connexion_voyageur_usage_unique() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."id" IS DISTINCT FROM OLD."id"
     OR NEW."telephoneIndex" IS DISTINCT FROM OLD."telephoneIndex"
     OR NEW."codeHache" IS DISTINCT FROM OLD."codeHache"
     OR NEW."canal" IS DISTINCT FROM OLD."canal"
     OR NEW."creeA" IS DISTINCT FROM OLD."creeA"
     OR NEW."expireA" IS DISTINCT FROM OLD."expireA"
     OR OLD."consommeA" IS NOT NULL THEN
    RAISE EXCEPTION 'un code de connexion ne se modifie pas : seul son usage (une fois) s''enregistre';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER code_connexion_voyageur_usage_unique
  BEFORE UPDATE ON "code_connexion_voyageur"
  FOR EACH ROW EXECUTE FUNCTION code_connexion_voyageur_usage_unique();

ALTER TABLE "limite_connexion_voyageur"
  ADD CONSTRAINT "limite_connexion_voyageur_compteurs" CHECK ("echecs" >= 0 AND "blocages" >= 0);

ALTER TABLE "fiche_voyageur"
  ADD CONSTRAINT "fiche_voyageur_langue_connue" CHECK ("langue" IN ('fr', 'en')),
  ADD CONSTRAINT "fiche_voyageur_piece" CHECK (
    "pieceQuatreDerniers" IS NULL OR "pieceQuatreDerniers" ~ '^[0-9]{4}$'
  );
