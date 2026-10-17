-- CreateTable
CREATE TABLE "dossier_financement" (
    "id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "agenceId" UUID NOT NULL,
    "demandePar" UUID NOT NULL,
    "montant" INTEGER NOT NULL,
    "statut" TEXT NOT NULL,
    "partenaire" TEXT,
    "referencePartenaire" TEXT,
    "conditions" JSONB NOT NULL,
    "envoyeA" TIMESTAMPTZ(3) NOT NULL,
    "reponseAvant" TIMESTAMPTZ(3) NOT NULL,
    "accuseA" TIMESTAMPTZ(3),
    "decisionA" TIMESTAMPTZ(3),
    "verseA" TIMESTAMPTZ(3),
    "retireA" TIMESTAMPTZ(3),
    "motifRefus" TEXT,
    "pieces" JSONB NOT NULL,
    "mandatPourcentage" INTEGER NOT NULL,
    "mandatSigneA" TIMESTAMPTZ(3) NOT NULL,
    "mandatSignePar" UUID NOT NULL,
    "mandatCompteMarchandId" TEXT NOT NULL,
    "mandatOperateur" TEXT NOT NULL,
    "mandatActif" BOOLEAN NOT NULL,
    "resteDu" INTEGER,
    "rembourseA" TIMESTAMPTZ(3),

    CONSTRAINT "dossier_financement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compteur_avance" (
    "annee" INTEGER NOT NULL,
    "valeur" INTEGER NOT NULL,

    CONSTRAINT "compteur_avance_pkey" PRIMARY KEY ("annee")
);

-- CreateTable
CREATE TABLE "prelevement_avance" (
    "cle" TEXT NOT NULL,
    "dossierId" TEXT NOT NULL,
    "agenceId" UUID NOT NULL,
    "venteId" TEXT NOT NULL,
    "montantVente" INTEGER NOT NULL,
    "montant" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "etat" TEXT NOT NULL,
    "reference" TEXT,

    CONSTRAINT "prelevement_avance_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "lot_paie" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "agenceId" UUID NOT NULL,
    "mois" TEXT NOT NULL,
    "lancePar" UUID NOT NULL,
    "lanceA" TIMESTAMPTZ(3) NOT NULL,
    "total" INTEGER NOT NULL,

    CONSTRAINT "lot_paie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne_paie" (
    "lotId" UUID NOT NULL,
    "personneId" UUID NOT NULL,
    "rang" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "operateur" TEXT,
    "telephoneChiffre" TEXT,
    "etat" TEXT NOT NULL,
    "tentative" INTEGER NOT NULL,
    "reference" TEXT,
    "motif" TEXT,

    CONSTRAINT "ligne_paie_pkey" PRIMARY KEY ("lotId","personneId")
);

-- CreateTable
CREATE TABLE "reglage_financement" (
    "agenceId" UUID NOT NULL,
    "billetEnDeuxFois" BOOLEAN NOT NULL DEFAULT false,
    "jourDePaie" TEXT NOT NULL DEFAULT 'vendredi',

    CONSTRAINT "reglage_financement_pkey" PRIMARY KEY ("agenceId")
);

-- CreateTable
CREATE TABLE "convention_financement" (
    "agenceId" UUID NOT NULL,
    "partenaire" TEXT NOT NULL,
    "signeeA" TIMESTAMPTZ(3),

    CONSTRAINT "convention_financement_pkey" PRIMARY KEY ("agenceId")
);

-- CreateTable
CREATE TABLE "offre_credit_materiel" (
    "agenceId" UUID NOT NULL,
    "description" TEXT NOT NULL,
    "montantTotal" INTEGER NOT NULL,
    "mensualites" INTEGER NOT NULL,
    "montantMensualite" INTEGER NOT NULL,

    CONSTRAINT "offre_credit_materiel_pkey" PRIMARY KEY ("agenceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "dossier_financement_referencePartenaire_key" ON "dossier_financement"("referencePartenaire");

-- CreateIndex
CREATE INDEX "dossier_financement_statut_idx" ON "dossier_financement"("statut");

-- CreateIndex
CREATE INDEX "dossier_financement_agenceId_envoyeA_idx" ON "dossier_financement"("agenceId", "envoyeA" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "prelevement_avance_venteId_key" ON "prelevement_avance"("venteId");

-- CreateIndex
CREATE INDEX "prelevement_avance_dossierId_idx" ON "prelevement_avance"("dossierId");

-- CreateIndex
CREATE INDEX "prelevement_avance_etat_idx" ON "prelevement_avance"("etat");

-- CreateIndex
CREATE UNIQUE INDEX "lot_paie_agenceId_mois_key" ON "lot_paie"("agenceId", "mois");

-- CreateIndex
CREATE INDEX "ligne_paie_etat_idx" ON "ligne_paie"("etat");

-- AddForeignKey
ALTER TABLE "prelevement_avance" ADD CONSTRAINT "prelevement_avance_dossierId_fkey" FOREIGN KEY ("dossierId") REFERENCES "dossier_financement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne_paie" ADD CONSTRAINT "ligne_paie_lotId_fkey" FOREIGN KEY ("lotId") REFERENCES "lot_paie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- LOT B · financement, crédit et paie : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.
-- AfriMove ne détient jamais les fonds : aucune colonne ne porte un solde.

-- Dossiers d'avance : l'agence, le patron et le signataire du mandat existent, valeurs fermées, montants positifs.
ALTER TABLE "dossier_financement"
  ADD CONSTRAINT "dossier_financement_compagnie_fkey" FOREIGN KEY ("agenceId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "dossier_financement_demande_par_fkey" FOREIGN KEY ("demandePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "dossier_financement_mandat_signe_par_fkey" FOREIGN KEY ("mandatSignePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "dossier_financement_statut_connu" CHECK (
    "statut" IN ('envoye', 'en_analyse', 'verse', 'refuse', 'retire')
  ),
  ADD CONSTRAINT "dossier_financement_operateur_connu" CHECK ("mandatOperateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "dossier_financement_quantites" CHECK (
    "version" >= 1 AND "montant" > 0 AND "mandatPourcentage" BETWEEN 1 AND 100
    AND ("resteDu" IS NULL OR "resteDu" >= 0)
  ),
  ADD CONSTRAINT "dossier_financement_numero" CHECK ("id" ~ '^AV-[0-9]{4}-[0-9]{4,}$');
-- Une seule avance ouverte par agence : envoyée, en analyse, ou versée avec un mandat encore actif.
CREATE UNIQUE INDEX "dossier_financement_une_ouverte"
  ON "dossier_financement" ("agenceId")
  WHERE "statut" IN ('envoye', 'en_analyse') OR ("statut" = 'verse' AND "mandatActif");
-- Le rattrapage des envois sans accusé ne parcourt que ceux-là.
CREATE INDEX "dossier_financement_sans_accuse"
  ON "dossier_financement" ("id") WHERE "statut" = 'envoye' AND "accuseA" IS NULL;
-- Un dossier est une pièce : il ne se supprime pas (il se retire, il se refuse, il se solde).
CREATE TRIGGER dossier_financement_conserve
  BEFORE DELETE ON "dossier_financement"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER dossier_financement_pas_de_vidage
  BEFORE TRUNCATE ON "dossier_financement"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Numéros d'avance : un compteur par année, jamais en arrière.
ALTER TABLE "compteur_avance"
  ADD CONSTRAINT "compteur_avance_valeur" CHECK ("annee" BETWEEN 1 AND 9999 AND "valeur" >= 1);

-- Prélèvements : une vente ne se prélève qu'une fois (venteId unique), l'agence existe, montants positifs.
ALTER TABLE "prelevement_avance"
  ADD CONSTRAINT "prelevement_avance_compagnie_fkey" FOREIGN KEY ("agenceId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "prelevement_avance_etat_connu" CHECK ("etat" IN ('en_attente', 'execute')),
  ADD CONSTRAINT "prelevement_avance_montants" CHECK ("montant" > 0 AND "montantVente" > 0),
  ADD CONSTRAINT "prelevement_avance_reference_si_execute" CHECK (("etat" = 'execute') = ("reference" IS NOT NULL));
-- Un prélèvement exécuté est de l'argent parti vers le partenaire : seule une réservation en attente peut
-- disparaître (refus définitif) ou changer (confirmation).
CREATE FUNCTION interdire_suppression_prelevement_execute() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."etat" = 'execute' THEN
    RAISE EXCEPTION 'Un prélèvement exécuté ne se supprime pas (%).', OLD."cle" USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN OLD;
END;
$$;
CREATE TRIGGER prelevement_avance_execute_conserve
  BEFORE DELETE ON "prelevement_avance"
  FOR EACH ROW EXECUTE FUNCTION interdire_suppression_prelevement_execute();
CREATE FUNCTION interdire_modification_prelevement_execute() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  IF OLD."etat" = 'execute' THEN
    RAISE EXCEPTION 'Un prélèvement exécuté ne se modifie pas (%).', OLD."cle" USING ERRCODE = 'integrity_constraint_violation';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER prelevement_avance_execute_fige
  BEFORE UPDATE ON "prelevement_avance"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification_prelevement_execute();

-- Lots de paie : un par agence et par mois (index unique de la table), mois bien formé.
ALTER TABLE "lot_paie"
  ADD CONSTRAINT "lot_paie_compagnie_fkey" FOREIGN KEY ("agenceId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "lot_paie_lance_par_fkey" FOREIGN KEY ("lancePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "lot_paie_mois_valide" CHECK ("mois" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "lot_paie_quantites" CHECK ("version" >= 1 AND "total" >= 0);
CREATE TRIGGER lot_paie_conserve
  BEFORE DELETE ON "lot_paie"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER lot_paie_pas_de_vidage
  BEFORE TRUNCATE ON "lot_paie"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Lignes de paie : le salarié existe, un numéro MoMo ne va pas sans opérateur, un salaire versé a sa référence.
ALTER TABLE "ligne_paie"
  ADD CONSTRAINT "ligne_paie_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "ligne_paie_etat_connu" CHECK ("etat" IN ('en_attente', 'verse', 'refuse')),
  ADD CONSTRAINT "ligne_paie_operateur_connu" CHECK ("operateur" IS NULL OR "operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "ligne_paie_quantites" CHECK ("montant" > 0 AND "tentative" >= 0 AND "rang" >= 0),
  ADD CONSTRAINT "ligne_paie_compte_complet" CHECK (("operateur" IS NULL) = ("telephoneChiffre" IS NULL)),
  ADD CONSTRAINT "ligne_paie_reference_si_verse" CHECK ("etat" <> 'verse' OR "reference" IS NOT NULL);
CREATE TRIGGER ligne_paie_conserve
  BEFORE DELETE ON "ligne_paie"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER ligne_paie_pas_de_vidage
  BEFORE TRUNCATE ON "ligne_paie"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Réglages, convention et offre : une ligne par agence qui existe.
ALTER TABLE "reglage_financement"
  ADD CONSTRAINT "reglage_financement_compagnie_fkey" FOREIGN KEY ("agenceId") REFERENCES "compagnie"("id");
ALTER TABLE "convention_financement"
  ADD CONSTRAINT "convention_financement_compagnie_fkey" FOREIGN KEY ("agenceId") REFERENCES "compagnie"("id");
ALTER TABLE "offre_credit_materiel"
  ADD CONSTRAINT "offre_credit_materiel_compagnie_fkey" FOREIGN KEY ("agenceId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "offre_credit_materiel_quantites" CHECK (
    "montantTotal" > 0 AND "mensualites" >= 1 AND "montantMensualite" > 0
  );
