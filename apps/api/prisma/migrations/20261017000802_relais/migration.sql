-- CreateTable
CREATE TABLE "relais" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "code" TEXT NOT NULL,
    "personneId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "typeBoutique" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "quartier" TEXT NOT NULL,
    "repere" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "ouvert" TEXT NOT NULL,
    "tailleMax" TEXT NOT NULL,
    "capacite" INTEGER NOT NULL,
    "particularite" TEXT,
    "momoTelephoneChiffre" TEXT NOT NULL,
    "momoOperateur" TEXT NOT NULL,
    "facadeRef" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL,
    "note" DOUBLE PRECISION NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "premierColisA" TIMESTAMPTZ(3),

    CONSTRAINT "relais_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demande_relais" (
    "dossier" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "personneId" UUID NOT NULL,
    "fiche" JSONB NOT NULL,
    "etat" TEXT NOT NULL,
    "deposeeA" TIMESTAMPTZ(3) NOT NULL,
    "visite" JSONB,
    "decision" JSONB,
    "relaisId" UUID,

    CONSTRAINT "demande_relais_pkey" PRIMARY KEY ("dossier")
);

-- CreateTable
CREATE TABLE "brouillon_relais" (
    "personneId" UUID NOT NULL,
    "fiche" JSONB NOT NULL,
    "enregistreA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "brouillon_relais_pkey" PRIMARY KEY ("personneId")
);

-- CreateTable
CREATE TABLE "compteur_dossier" (
    "prefixe" TEXT NOT NULL,
    "valeur" INTEGER NOT NULL,

    CONSTRAINT "compteur_dossier_pkey" PRIMARY KEY ("prefixe")
);

-- CreateTable
CREATE TABLE "reception_relais" (
    "colisId" UUID NOT NULL,
    "relaisId" UUID NOT NULL,
    "recuA" TIMESTAMPTZ(3) NOT NULL,
    "rappelEnvoyeA" TIMESTAMPTZ(3),
    "remiseOuverteA" TIMESTAMPTZ(3),

    CONSTRAINT "reception_relais_pkey" PRIMARY KEY ("colisId")
);

-- CreateTable
CREATE TABLE "credit_partenaire" (
    "cle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partenaireId" UUID NOT NULL,
    "montant" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credit_partenaire_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "debit_partenaire" (
    "cle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "partenaireId" UUID NOT NULL,
    "montant" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "etat" TEXT NOT NULL,
    "operateur" TEXT NOT NULL,
    "telephoneChiffre" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "reference" TEXT,

    CONSTRAINT "debit_partenaire_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "coordonnees_gare" (
    "gareId" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "coordonnees_gare_pkey" PRIMARY KEY ("gareId")
);

-- CreateTable
CREATE TABLE "adresse_geolocalisee" (
    "cle" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "adresse_geolocalisee_pkey" PRIMARY KEY ("cle")
);

-- CreateIndex
CREATE UNIQUE INDEX "relais_code_key" ON "relais"("code");

-- CreateIndex
CREATE UNIQUE INDEX "relais_personneId_key" ON "relais"("personneId");

-- CreateIndex
CREATE INDEX "relais_ville_actif_idx" ON "relais"("ville", "actif");

-- CreateIndex
CREATE INDEX "demande_relais_personneId_deposeeA_idx" ON "demande_relais"("personneId", "deposeeA" DESC);

-- CreateIndex
CREATE INDEX "reception_relais_relaisId_idx" ON "reception_relais"("relaisId");

-- CreateIndex
CREATE INDEX "credit_partenaire_type_partenaireId_at_idx" ON "credit_partenaire"("type", "partenaireId", "at");

-- CreateIndex
CREATE INDEX "credit_partenaire_type_at_idx" ON "credit_partenaire"("type", "at");

-- CreateIndex
CREATE INDEX "debit_partenaire_type_partenaireId_idx" ON "debit_partenaire"("type", "partenaireId");

-- CreateIndex
CREATE INDEX "debit_partenaire_etat_idx" ON "debit_partenaire"("etat");


-- LOT B · points relais : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Relais : un compte ne devient relais qu'une fois (index unique de la table), une position complète ou absente.
ALTER TABLE "relais"
  ADD CONSTRAINT "relais_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "relais_operateur_connu" CHECK ("momoOperateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "relais_quantites" CHECK ("version" >= 1 AND "capacite" >= 1 AND "note" BETWEEN 0 AND 5),
  ADD CONSTRAINT "relais_position_complete" CHECK (
    ("latitude" IS NULL) = ("longitude" IS NULL)
    AND ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
  );

-- Demandes : une seule demande ouverte par personne ; la clé primaire donne « dossier_pris ».
ALTER TABLE "demande_relais"
  ADD CONSTRAINT "demande_relais_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "demande_relais_relais_fkey" FOREIGN KEY ("relaisId") REFERENCES "relais"("id"),
  ADD CONSTRAINT "demande_relais_etat_connu" CHECK ("etat" IN ('recue', 'visite_planifiee', 'activee', 'refusee')),
  ADD CONSTRAINT "demande_relais_version" CHECK ("version" >= 1);
CREATE UNIQUE INDEX "demande_relais_une_ouverte"
  ON "demande_relais" ("personneId") WHERE "etat" IN ('recue', 'visite_planifiee');

ALTER TABLE "brouillon_relais"
  ADD CONSTRAINT "brouillon_relais_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id");

ALTER TABLE "compteur_dossier"
  ADD CONSTRAINT "compteur_dossier_valeur" CHECK ("valeur" >= 0);

-- Réceptions : un colis n'a qu'une réception (clé primaire), chez un relais qui existe.
ALTER TABLE "reception_relais"
  ADD CONSTRAINT "reception_relais_colis_fkey" FOREIGN KEY ("colisId") REFERENCES "colis"("id"),
  ADD CONSTRAINT "reception_relais_relais_fkey" FOREIGN KEY ("relaisId") REFERENCES "relais"("id");

-- Portefeuille : un gain est compté une fois (clé primaire = clé d'idempotence), jamais modifié ni effacé.
ALTER TABLE "credit_partenaire"
  ADD CONSTRAINT "credit_partenaire_type_connu" CHECK ("type" IN ('relais', 'livreur')),
  ADD CONSTRAINT "credit_partenaire_motif_connu" CHECK ("motif" IN ('remise', 'reprise', 'livraison')),
  ADD CONSTRAINT "credit_partenaire_montant" CHECK ("montant" > 0);
CREATE TRIGGER credit_partenaire_ajout_seul
  BEFORE UPDATE OR DELETE ON "credit_partenaire"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER credit_partenaire_pas_de_vidage
  BEFORE TRUNCATE ON "credit_partenaire"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

ALTER TABLE "debit_partenaire"
  ADD CONSTRAINT "debit_partenaire_type_connu" CHECK ("type" IN ('relais', 'livreur')),
  ADD CONSTRAINT "debit_partenaire_motif_connu" CHECK ("motif" IN ('versement', 'retrait')),
  ADD CONSTRAINT "debit_partenaire_etat_connu" CHECK ("etat" IN ('en_attente', 'verse')),
  ADD CONSTRAINT "debit_partenaire_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "debit_partenaire_montant" CHECK ("montant" > 0),
  -- Une référence d'opérateur n'existe que pour un débit versé.
  ADD CONSTRAINT "debit_partenaire_reference_si_verse" CHECK (("etat" = 'verse') = ("reference" IS NOT NULL));

-- Un débit versé est de l'argent parti : seul un débit « en attente » peut disparaître (échec de l'opérateur).
CREATE FUNCTION interdire_suppression_debit_verse() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."etat" = 'verse' THEN
    RAISE EXCEPTION 'Un débit versé ne se supprime pas (%).', OLD."cle" USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER debit_partenaire_verse_conserve
  BEFORE DELETE ON "debit_partenaire"
  FOR EACH ROW EXECUTE FUNCTION interdire_suppression_debit_verse();
-- Un débit versé ne change plus.
CREATE FUNCTION interdire_modification_debit_verse() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."etat" = 'verse' THEN
    RAISE EXCEPTION 'Un débit versé ne se modifie pas (%).', OLD."cle" USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER debit_partenaire_verse_fige
  BEFORE UPDATE ON "debit_partenaire"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification_debit_verse();

-- Coordonnées
ALTER TABLE "coordonnees_gare"
  ADD CONSTRAINT "coordonnees_gare_gare_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id"),
  ADD CONSTRAINT "coordonnees_gare_bornes" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
ALTER TABLE "adresse_geolocalisee"
  ADD CONSTRAINT "adresse_geolocalisee_cle_minuscule" CHECK ("cle" = lower("cle")),
  ADD CONSTRAINT "adresse_geolocalisee_bornes" CHECK ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180);
