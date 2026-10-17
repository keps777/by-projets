-- CreateTable
CREATE TABLE "vendeur" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "numero" TEXT NOT NULL,
    "nomChiffre" TEXT NOT NULL,
    "telephoneChiffre" TEXT NOT NULL,
    "quartier" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "momoTelephoneChiffre" TEXT NOT NULL,
    "momoOperateur" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vendeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agrement_vendeur" (
    "vendeurId" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "compagnieNom" TEXT NOT NULL,
    "etat" TEXT NOT NULL,
    "commissionClassique" INTEGER NOT NULL,
    "commissionVip" INTEGER NOT NULL,
    "accordeLe" TIMESTAMPTZ(3) NOT NULL,
    "accordePar" UUID NOT NULL,
    "retireLe" TIMESTAMPTZ(3),

    CONSTRAINT "agrement_vendeur_pkey" PRIMARY KEY ("vendeurId","compagnieId")
);

-- CreateTable
CREATE TABLE "vente_vendeur" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "vendeurId" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "billetId" UUID NOT NULL,
    "billetNumero" TEXT,
    "siege" INTEGER,
    "voisinNomChiffre" TEXT NOT NULL,
    "voisinTelephoneChiffre" TEXT NOT NULL,
    "voisinIndex" TEXT NOT NULL,
    "empreinte" TEXT NOT NULL,
    "origineCode" TEXT NOT NULL,
    "origineVille" TEXT NOT NULL,
    "destinationCode" TEXT NOT NULL,
    "destinationVille" TEXT NOT NULL,
    "classe" TEXT NOT NULL,
    "departA" TIMESTAMPTZ(3) NOT NULL,
    "prix" INTEGER NOT NULL,
    "commission" INTEGER NOT NULL,
    "moyen" TEXT NOT NULL,
    "etat" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "reference" TEXT,
    "regleeA" TIMESTAMPTZ(3),
    "cause" TEXT,
    "termineeA" TIMESTAMPTZ(3),
    "majA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "vente_vendeur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_commission_vendeur" (
    "cle" TEXT NOT NULL,
    "vendeurId" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "venteId" UUID NOT NULL,
    "montant" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "credit_commission_vendeur_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "debit_commission_vendeur" (
    "cle" TEXT NOT NULL,
    "vendeurId" UUID NOT NULL,
    "montant" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "etat" TEXT NOT NULL,
    "operateur" TEXT NOT NULL,
    "telephoneChiffre" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "reference" TEXT,

    CONSTRAINT "debit_commission_vendeur_pkey" PRIMARY KEY ("cle")
);

-- CreateIndex
CREATE UNIQUE INDEX "vendeur_numero_key" ON "vendeur"("numero");

-- CreateIndex
CREATE INDEX "agrement_vendeur_compagnieId_idx" ON "agrement_vendeur"("compagnieId");

-- CreateIndex
CREATE UNIQUE INDEX "vente_vendeur_billetId_key" ON "vente_vendeur"("billetId");

-- CreateIndex
CREATE INDEX "vente_vendeur_vendeurId_creeA_idx" ON "vente_vendeur"("vendeurId", "creeA");

-- CreateIndex
CREATE INDEX "vente_vendeur_etat_creeA_idx" ON "vente_vendeur"("etat", "creeA");

-- CreateIndex
CREATE INDEX "credit_commission_vendeur_vendeurId_at_idx" ON "credit_commission_vendeur"("vendeurId", "at");

-- CreateIndex
CREATE INDEX "debit_commission_vendeur_vendeurId_idx" ON "debit_commission_vendeur"("vendeurId");

-- CreateIndex
CREATE INDEX "debit_commission_vendeur_etat_idx" ON "debit_commission_vendeur"("etat");

-- AddForeignKey
ALTER TABLE "agrement_vendeur" ADD CONSTRAINT "agrement_vendeur_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "vendeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vente_vendeur" ADD CONSTRAINT "vente_vendeur_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "vendeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_commission_vendeur" ADD CONSTRAINT "credit_commission_vendeur_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "vendeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_commission_vendeur" ADD CONSTRAINT "credit_commission_vendeur_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "vente_vendeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debit_commission_vendeur" ADD CONSTRAINT "debit_commission_vendeur_vendeurId_fkey" FOREIGN KEY ("vendeurId") REFERENCES "vendeur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- LOT B · vendeurs ambulants : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Vendeurs : le compte existe (l'identifiant est celui de la personne), numéro unique (index de la table).
ALTER TABLE "vendeur"
  ADD CONSTRAINT "vendeur_personne_fkey" FOREIGN KEY ("id") REFERENCES "personne"("id"),
  ADD CONSTRAINT "vendeur_operateur_connu" CHECK ("momoOperateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "vendeur_version" CHECK ("version" >= 1);

-- Agréments : une ligne par (vendeur, agence), commissions bornées de 0 à 2 000 F.
ALTER TABLE "agrement_vendeur"
  ADD CONSTRAINT "agrement_vendeur_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "agrement_vendeur_accorde_par_fkey" FOREIGN KEY ("accordePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "agrement_vendeur_etat_connu" CHECK ("etat" IN ('actif', 'retire')),
  ADD CONSTRAINT "agrement_vendeur_commissions" CHECK (
    "commissionClassique" BETWEEN 0 AND 2000 AND "commissionVip" BETWEEN 0 AND 2000
  ),
  ADD CONSTRAINT "agrement_vendeur_retrait_coherent" CHECK (("etat" = 'retire') = ("retireLe" IS NOT NULL));

-- Ventes : valeurs fermées, montants positifs, agence et départ qui existent.
ALTER TABLE "vente_vendeur"
  ADD CONSTRAINT "vente_vendeur_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "vente_vendeur_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id"),
  ADD CONSTRAINT "vente_vendeur_etat_connu" CHECK (
    "etat" IN ('en_attente', 'reglee', 'terminee', 'refusee', 'expiree', 'a_rembourser')
  ),
  ADD CONSTRAINT "vente_vendeur_classe_connue" CHECK ("classe" IN ('classique', 'vip')),
  ADD CONSTRAINT "vente_vendeur_moyen_connu" CHECK ("moyen" IN ('mtn_momo', 'orange_money')),
  ADD CONSTRAINT "vente_vendeur_quantites" CHECK (
    "version" >= 1 AND "prix" >= 0 AND "commission" >= 0 AND ("siege" IS NULL OR "siege" >= 1)
  );
-- Le vendeur règle l'agence dans la minute : une seule vente qui attend son règlement par vendeur.
CREATE UNIQUE INDEX "vente_vendeur_une_en_attente"
  ON "vente_vendeur" ("vendeurId") WHERE "etat" = 'en_attente';
-- Un même voisin n'a pas deux billets (vendus ou en route) sur un départ chez un vendeur.
CREATE UNIQUE INDEX "vente_vendeur_voisin_depart"
  ON "vente_vendeur" ("vendeurId", "departId", "empreinte") WHERE "etat" IN ('en_attente', 'reglee', 'terminee');

-- Commissions gagnées : un crédit par vente (clé primaire), en ajout seul, positif.
ALTER TABLE "credit_commission_vendeur"
  ADD CONSTRAINT "credit_commission_vendeur_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "credit_commission_vendeur_montant" CHECK ("montant" > 0);
CREATE TRIGGER credit_commission_vendeur_ajout_seul
  BEFORE UPDATE OR DELETE ON "credit_commission_vendeur"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER credit_commission_vendeur_pas_de_vidage
  BEFORE TRUNCATE ON "credit_commission_vendeur"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Versements : seul un débit « en attente » peut disparaître ou changer (mêmes déclencheurs que le portefeuille).
ALTER TABLE "debit_commission_vendeur"
  ADD CONSTRAINT "debit_commission_vendeur_etat_connu" CHECK ("etat" IN ('en_attente', 'verse')),
  ADD CONSTRAINT "debit_commission_vendeur_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "debit_commission_vendeur_montant" CHECK ("montant" > 0),
  ADD CONSTRAINT "debit_commission_vendeur_reference_si_verse" CHECK (("etat" = 'verse') = ("reference" IS NOT NULL));
CREATE TRIGGER debit_commission_vendeur_verse_conserve
  BEFORE DELETE ON "debit_commission_vendeur"
  FOR EACH ROW EXECUTE FUNCTION interdire_suppression_debit_verse();
CREATE TRIGGER debit_commission_vendeur_verse_fige
  BEFORE UPDATE ON "debit_commission_vendeur"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification_debit_verse();
