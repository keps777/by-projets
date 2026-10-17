-- CreateTable
CREATE TABLE "convention_inter_agences" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "compagnieAId" UUID NOT NULL,
    "compagnieBId" UUID NOT NULL,
    "statut" TEXT NOT NULL,
    "renouvellement" TEXT NOT NULL,
    "parts" JSONB NOT NULL,
    "voyageurs" JSONB NOT NULL,
    "proposeeLe" TIMESTAMPTZ(3) NOT NULL,
    "activeLe" TIMESTAMPTZ(3),
    "denonciation" JSONB,

    CONSTRAINT "convention_inter_agences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "signature_convention" (
    "conventionId" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "signeLe" TIMESTAMPTZ(3) NOT NULL,
    "rang" INTEGER NOT NULL,

    CONSTRAINT "signature_convention_pkey" PRIMARY KEY ("conventionId","compagnieId")
);

-- CreateTable
CREATE TABLE "colis_inter_agences" (
    "colisId" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "numero" TEXT NOT NULL,
    "conventionId" UUID NOT NULL,
    "emettriceId" UUID NOT NULL,
    "prix" INTEGER NOT NULL,
    "troncons" JSONB NOT NULL,
    "compagnieIds" UUID[],
    "transferts" JSONB NOT NULL,
    "creeLe" TIMESTAMPTZ(3) NOT NULL,
    "creePar" UUID NOT NULL,

    CONSTRAINT "colis_inter_agences_pkey" PRIMARY KEY ("colisId")
);

-- CreateTable
CREATE TABLE "billet_correspondance" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "numero" TEXT NOT NULL,
    "conventionId" UUID NOT NULL,
    "emettriceId" UUID NOT NULL,
    "voyageurNomChiffre" TEXT NOT NULL,
    "voyageurTelephoneChiffre" TEXT NOT NULL,
    "prix" INTEGER NOT NULL,
    "troncons" JSONB NOT NULL,
    "compagnieIds" UUID[],
    "arriveePremierBus" JSONB,
    "replacement" JSONB,
    "creeLe" TIMESTAMPTZ(3) NOT NULL,
    "creePar" UUID NOT NULL,

    CONSTRAINT "billet_correspondance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reglement_inter_agences" (
    "cle" TEXT NOT NULL,
    "conventionId" UUID NOT NULL,
    "paiementLe" TIMESTAMPTZ(3) NOT NULL,
    "gelLe" TIMESTAMPTZ(3) NOT NULL,
    "lignes" JSONB NOT NULL,
    "debiteurId" UUID,
    "creancierId" UUID,
    "montant" INTEGER NOT NULL,
    "etat" TEXT NOT NULL,
    "reference" TEXT,
    "payeLe" TIMESTAMPTZ(3),
    "erreur" TEXT,

    CONSTRAINT "reglement_inter_agences_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "creance_reglee" (
    "cle" TEXT NOT NULL,
    "reglementCle" TEXT NOT NULL,

    CONSTRAINT "creance_reglee_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "contestation_reglement" (
    "reference" TEXT NOT NULL,
    "conventionIds" UUID[],
    "compagnieId" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "motif" TEXT NOT NULL,
    "cles" TEXT[],
    "deposeeLe" TIMESTAMPTZ(3) NOT NULL,
    "recevable" BOOLEAN NOT NULL,
    "statut" TEXT NOT NULL,
    "resolueLe" TIMESTAMPTZ(3),
    "resoluePar" UUID,

    CONSTRAINT "contestation_reglement_pkey" PRIMARY KEY ("reference")
);

-- CreateTable
CREATE TABLE "invitation_compagnie" (
    "reference" TEXT NOT NULL,
    "cle" TEXT NOT NULL,
    "compagnieId" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "nomCompagnie" TEXT NOT NULL,
    "telephoneChiffre" TEXT NOT NULL,
    "envoyeeLe" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitation_compagnie_pkey" PRIMARY KEY ("reference")
);

-- CreateTable
CREATE TABLE "compte_momo_compagnie" (
    "compagnieId" UUID NOT NULL,
    "telephoneChiffre" TEXT NOT NULL,
    "operateur" TEXT NOT NULL,

    CONSTRAINT "compte_momo_compagnie_pkey" PRIMARY KEY ("compagnieId")
);

-- CreateIndex
CREATE INDEX "convention_inter_agences_compagnieAId_idx" ON "convention_inter_agences"("compagnieAId");

-- CreateIndex
CREATE INDEX "convention_inter_agences_compagnieBId_idx" ON "convention_inter_agences"("compagnieBId");

-- CreateIndex
CREATE INDEX "colis_inter_agences_conventionId_idx" ON "colis_inter_agences"("conventionId");

-- CreateIndex
CREATE UNIQUE INDEX "billet_correspondance_numero_key" ON "billet_correspondance"("numero");

-- CreateIndex
CREATE INDEX "billet_correspondance_conventionId_idx" ON "billet_correspondance"("conventionId");

-- CreateIndex
CREATE INDEX "reglement_inter_agences_conventionId_paiementLe_idx" ON "reglement_inter_agences"("conventionId", "paiementLe");

-- CreateIndex
CREATE INDEX "creance_reglee_reglementCle_idx" ON "creance_reglee"("reglementCle");

-- CreateIndex
CREATE INDEX "contestation_reglement_statut_idx" ON "contestation_reglement"("statut");

-- CreateIndex
CREATE INDEX "contestation_reglement_compagnieId_idx" ON "contestation_reglement"("compagnieId");

-- CreateIndex
CREATE UNIQUE INDEX "invitation_compagnie_cle_key" ON "invitation_compagnie"("cle");

-- AddForeignKey
ALTER TABLE "signature_convention" ADD CONSTRAINT "signature_convention_conventionId_fkey" FOREIGN KEY ("conventionId") REFERENCES "convention_inter_agences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colis_inter_agences" ADD CONSTRAINT "colis_inter_agences_conventionId_fkey" FOREIGN KEY ("conventionId") REFERENCES "convention_inter_agences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet_correspondance" ADD CONSTRAINT "billet_correspondance_conventionId_fkey" FOREIGN KEY ("conventionId") REFERENCES "convention_inter_agences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reglement_inter_agences" ADD CONSTRAINT "reglement_inter_agences_conventionId_fkey" FOREIGN KEY ("conventionId") REFERENCES "convention_inter_agences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creance_reglee" ADD CONSTRAINT "creance_reglee_reglementCle_fkey" FOREIGN KEY ("reglementCle") REFERENCES "reglement_inter_agences"("cle") ON DELETE RESTRICT ON UPDATE CASCADE;


-- LOT B · inter-agences : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Les listes ne sont jamais nulles (Prisma les crée sans NOT NULL).
ALTER TABLE "colis_inter_agences" ALTER COLUMN "compagnieIds" SET NOT NULL;
ALTER TABLE "billet_correspondance" ALTER COLUMN "compagnieIds" SET NOT NULL;
ALTER TABLE "contestation_reglement"
  ALTER COLUMN "conventionIds" SET NOT NULL,
  ALTER COLUMN "cles" SET NOT NULL;

-- Conventions : deux compagnies qui existent et qui sont différentes, valeurs fermées.
ALTER TABLE "convention_inter_agences"
  ADD CONSTRAINT "convention_inter_agences_a_fkey" FOREIGN KEY ("compagnieAId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "convention_inter_agences_b_fkey" FOREIGN KEY ("compagnieBId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "convention_inter_agences_deux_compagnies" CHECK ("compagnieAId" <> "compagnieBId"),
  ADD CONSTRAINT "convention_inter_agences_statut_connu" CHECK (
    "statut" IN ('proposee', 'active', 'suspendue', 'resiliee')
  ),
  ADD CONSTRAINT "convention_inter_agences_renouvellement_connu" CHECK (
    "renouvellement" IN ('trimestriel', 'annuel')
  ),
  ADD CONSTRAINT "convention_inter_agences_version" CHECK ("version" >= 1),
  ADD CONSTRAINT "convention_inter_agences_proposee_inactive" CHECK (
    "statut" <> 'proposee' OR "activeLe" IS NULL
  );
-- Une seule convention ouverte par paire de compagnies, quel que soit l'ordre dans lequel on la nomme.
CREATE UNIQUE INDEX "convention_inter_agences_une_ouverte"
  ON "convention_inter_agences" (LEAST("compagnieAId", "compagnieBId"), GREATEST("compagnieAId", "compagnieBId"))
  WHERE "statut" IN ('proposee', 'active', 'suspendue');
-- Une convention est un engagement entre deux compagnies : elle ne se supprime pas (elle se résilie).
CREATE TRIGGER convention_inter_agences_conserve
  BEFORE DELETE ON "convention_inter_agences"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER convention_inter_agences_pas_de_vidage
  BEFORE TRUNCATE ON "convention_inter_agences"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Signatures : une par compagnie (clé primaire), de personnes et de compagnies qui existent, en ajout seul.
ALTER TABLE "signature_convention"
  ADD CONSTRAINT "signature_convention_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "signature_convention_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "signature_convention_rang" CHECK ("rang" >= 0);
CREATE TRIGGER signature_convention_ajout_seul
  BEFORE UPDATE OR DELETE ON "signature_convention"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER signature_convention_pas_de_vidage
  BEFORE TRUNCATE ON "signature_convention"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Colis en correspondance : un plan par colis (clé primaire), pour un colis, une compagnie et un auteur qui existent.
ALTER TABLE "colis_inter_agences"
  ADD CONSTRAINT "colis_inter_agences_colis_fkey" FOREIGN KEY ("colisId") REFERENCES "colis"("id"),
  ADD CONSTRAINT "colis_inter_agences_emettrice_fkey" FOREIGN KEY ("emettriceId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "colis_inter_agences_cree_par_fkey" FOREIGN KEY ("creePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "colis_inter_agences_quantites" CHECK ("version" >= 1 AND "prix" >= 0);
CREATE INDEX "colis_inter_agences_compagnies" ON "colis_inter_agences" USING GIN ("compagnieIds");

-- Billets en correspondance : un plan par billet (clé primaire) et par numéro (index unique).
ALTER TABLE "billet_correspondance"
  ADD CONSTRAINT "billet_correspondance_billet_fkey" FOREIGN KEY ("id") REFERENCES "billet"("id"),
  ADD CONSTRAINT "billet_correspondance_emettrice_fkey" FOREIGN KEY ("emettriceId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "billet_correspondance_cree_par_fkey" FOREIGN KEY ("creePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "billet_correspondance_quantites" CHECK ("version" >= 1 AND "prix" >= 0);
CREATE INDEX "billet_correspondance_compagnies" ON "billet_correspondance" USING GIN ("compagnieIds");

-- Règlements : le débiteur et le créancier existent et diffèrent ; ils sont nuls ensemble, et exactement quand le
-- solde est nul ; un règlement payé a sa référence et sa date.
ALTER TABLE "reglement_inter_agences"
  ADD CONSTRAINT "reglement_inter_agences_debiteur_fkey" FOREIGN KEY ("debiteurId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "reglement_inter_agences_creancier_fkey" FOREIGN KEY ("creancierId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "reglement_inter_agences_etat_connu" CHECK ("etat" IN ('a_payer', 'paye', 'sans_solde')),
  ADD CONSTRAINT "reglement_inter_agences_montant" CHECK ("montant" >= 0),
  ADD CONSTRAINT "reglement_inter_agences_parties" CHECK (
    ("debiteurId" IS NULL) = ("creancierId" IS NULL)
    AND (("etat" = 'sans_solde') = ("debiteurId" IS NULL))
    AND ("debiteurId" IS NULL OR "debiteurId" <> "creancierId")
    AND (("debiteurId" IS NULL) = ("montant" = 0))
  ),
  ADD CONSTRAINT "reglement_inter_agences_paye_complet" CHECK (
    "etat" <> 'paye' OR ("reference" IS NOT NULL AND "payeLe" IS NOT NULL)
  );
-- Un règlement payé, ou sans solde, est clos : il ne change plus. Aucun règlement ne se supprime.
CREATE FUNCTION interdire_modification_reglement_clos() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."etat" <> 'a_payer' THEN
    RAISE EXCEPTION 'Un règlement clos ne se modifie pas (%).', OLD."cle" USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER reglement_inter_agences_clos_fige
  BEFORE UPDATE ON "reglement_inter_agences"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification_reglement_clos();
CREATE TRIGGER reglement_inter_agences_conserve
  BEFORE DELETE ON "reglement_inter_agences"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER reglement_inter_agences_pas_de_vidage
  BEFORE TRUNCATE ON "reglement_inter_agences"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Opérations réglées : une opération ne se règle qu'une fois (clé primaire), en ajout seul.
CREATE TRIGGER creance_reglee_ajout_seul
  BEFORE UPDATE OR DELETE ON "creance_reglee"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER creance_reglee_pas_de_vidage
  BEFORE TRUNCATE ON "creance_reglee"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Contestations : valeurs fermées ; recevable exactement quand elle n'est pas irrecevable ; résolue exactement
-- quand elle est accordée ou rejetée. Seule une contestation ouverte change (la décision) ; aucune ne se supprime.
ALTER TABLE "contestation_reglement"
  ADD CONSTRAINT "contestation_reglement_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "contestation_reglement_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "contestation_reglement_resolue_par_fkey" FOREIGN KEY ("resoluePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "contestation_reglement_statut_connu" CHECK (
    "statut" IN ('ouverte', 'accordee', 'rejetee', 'irrecevable')
  ),
  ADD CONSTRAINT "contestation_reglement_recevable_coherent" CHECK ("recevable" = ("statut" <> 'irrecevable')),
  ADD CONSTRAINT "contestation_reglement_resolution_coherente" CHECK (
    ("statut" IN ('accordee', 'rejetee')) = ("resolueLe" IS NOT NULL AND "resoluePar" IS NOT NULL)
    AND (("resolueLe" IS NULL) = ("resoluePar" IS NULL))
  );
CREATE INDEX "contestation_reglement_conventions" ON "contestation_reglement" USING GIN ("conventionIds");
CREATE FUNCTION interdire_modification_contestation_close() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."statut" <> 'ouverte' THEN
    RAISE EXCEPTION 'Une contestation close ne se modifie pas (%).', OLD."reference" USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER contestation_reglement_close_fige
  BEFORE UPDATE ON "contestation_reglement"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification_contestation_close();
CREATE TRIGGER contestation_reglement_conserve
  BEFORE DELETE ON "contestation_reglement"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER contestation_reglement_pas_de_vidage
  BEFORE TRUNCATE ON "contestation_reglement"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Invitations : la compagnie et la personne existent, en ajout seul.
ALTER TABLE "invitation_compagnie"
  ADD CONSTRAINT "invitation_compagnie_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "invitation_compagnie_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id");
CREATE TRIGGER invitation_compagnie_ajout_seul
  BEFORE UPDATE OR DELETE ON "invitation_compagnie"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER invitation_compagnie_pas_de_vidage
  BEFORE TRUNCATE ON "invitation_compagnie"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Compte mobile money d'une compagnie : une ligne par compagnie, opérateur connu.
ALTER TABLE "compte_momo_compagnie"
  ADD CONSTRAINT "compte_momo_compagnie_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "compte_momo_compagnie_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange'));
