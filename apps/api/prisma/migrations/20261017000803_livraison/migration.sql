-- CreateTable
CREATE TABLE "livreur" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "badge" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "personneId" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "ville" TEXT NOT NULL,
    "deplacement" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "heures" TEXT NOT NULL,
    "chargeMax" TEXT NOT NULL,
    "momoTelephoneChiffre" TEXT NOT NULL,
    "momoOperateur" TEXT NOT NULL,
    "permisRef" TEXT,
    "assuranceRef" TEXT,
    "permisValideJusqua" DATE,
    "assuranceExpireLe" DATE,
    "moto" TEXT,
    "disponible" BOOLEAN NOT NULL,
    "actif" BOOLEAN NOT NULL,
    "note" DOUBLE PRECISION NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "livreur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demande_livreur" (
    "dossier" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "personneId" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "ville" TEXT NOT NULL,
    "deplacement" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "heures" TEXT NOT NULL,
    "chargeMax" TEXT NOT NULL,
    "momoTelephoneChiffre" TEXT NOT NULL,
    "momoOperateur" TEXT NOT NULL,
    "permisRef" TEXT,
    "assuranceRef" TEXT,
    "deposeeA" TIMESTAMPTZ(3) NOT NULL,
    "verifIdentiteA" TIMESTAMPTZ(3),
    "verifPiecesA" TIMESTAMPTZ(3),
    "permisValideJusqua" DATE,
    "assuranceExpireLe" DATE,
    "verifFormationA" TIMESTAMPTZ(3),
    "etat" TEXT NOT NULL,
    "decision" JSONB,
    "livreurId" UUID,

    CONSTRAINT "demande_livreur_pkey" PRIMARY KEY ("dossier")
);

-- CreateTable
CREATE TABLE "mission_livraison" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "colisId" UUID NOT NULL,
    "colisNumero" TEXT NOT NULL,
    "etat" TEXT NOT NULL,
    "livreurId" UUID,
    "proposeeA" TIMESTAMPTZ(3),
    "expireA" TIMESTAMPTZ(3),
    "essais" JSONB NOT NULL,
    "tour" INTEGER NOT NULL,
    "prochaineA" TIMESTAMPTZ(3),
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "accepteeA" TIMESTAMPTZ(3),
    "livreeA" TIMESTAMPTZ(3),
    "trajet" JSONB NOT NULL,
    "distanceM" INTEGER NOT NULL,
    "dureeMinutes" INTEGER NOT NULL,
    "prixLivraison" INTEGER NOT NULL,
    "gain" INTEGER NOT NULL,
    "absence" JSONB,
    "repliA" TIMESTAMPTZ(3),

    CONSTRAINT "mission_livraison_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "partage_suivi" (
    "jetonHache" TEXT NOT NULL,
    "colisId" UUID NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "partage_suivi_pkey" PRIMARY KEY ("jetonHache")
);

-- CreateTable
CREATE TABLE "invitation_livreur" (
    "id" BIGSERIAL NOT NULL,
    "livreurId" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "invitation_livreur_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "livreur_badge_key" ON "livreur"("badge");

-- CreateIndex
CREATE UNIQUE INDEX "livreur_personneId_key" ON "livreur"("personneId");

-- CreateIndex
CREATE INDEX "livreur_actif_disponible_ville_idx" ON "livreur"("actif", "disponible", "ville");

-- CreateIndex
CREATE INDEX "demande_livreur_personneId_deposeeA_idx" ON "demande_livreur"("personneId", "deposeeA" DESC);

-- CreateIndex
CREATE INDEX "mission_livraison_etat_expireA_idx" ON "mission_livraison"("etat", "expireA");

-- CreateIndex
CREATE INDEX "mission_livraison_livreurId_etat_idx" ON "mission_livraison"("livreurId", "etat");

-- CreateIndex
CREATE INDEX "mission_livraison_colisId_creeA_idx" ON "mission_livraison"("colisId", "creeA" DESC);

-- CreateIndex
CREATE INDEX "partage_suivi_colisId_idx" ON "partage_suivi"("colisId");

-- CreateIndex
CREATE INDEX "invitation_livreur_livreurId_at_idx" ON "invitation_livreur"("livreurId", "at");

-- AddForeignKey
ALTER TABLE "mission_livraison" ADD CONSTRAINT "mission_livraison_livreurId_fkey" FOREIGN KEY ("livreurId") REFERENCES "livreur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitation_livreur" ADD CONSTRAINT "invitation_livreur_livreurId_fkey" FOREIGN KEY ("livreurId") REFERENCES "livreur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- LOT B · livraison moto : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Livreurs : un badge et un compte uniques (index de la table), valeurs fermées, quantités bornées.
ALTER TABLE "livreur"
  ADD CONSTRAINT "livreur_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "livreur_deplacement_connu" CHECK ("deplacement" IN ('moto', 'velo', 'pied', 'tricycle')),
  ADD CONSTRAINT "livreur_operateur_connu" CHECK ("momoOperateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "livreur_quantites" CHECK ("version" >= 1 AND "numero" >= 1 AND "note" BETWEEN 0 AND 5);

-- Demandes : une seule demande ouverte par personne ; la clé primaire donne « dossier_pris ».
ALTER TABLE "demande_livreur"
  ADD CONSTRAINT "demande_livreur_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "demande_livreur_livreur_fkey" FOREIGN KEY ("livreurId") REFERENCES "livreur"("id"),
  ADD CONSTRAINT "demande_livreur_etat_connu" CHECK ("etat" IN ('recue', 'activee', 'refusee')),
  ADD CONSTRAINT "demande_livreur_deplacement_connu" CHECK ("deplacement" IN ('moto', 'velo', 'pied', 'tricycle')),
  ADD CONSTRAINT "demande_livreur_operateur_connu" CHECK ("momoOperateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "demande_livreur_version" CHECK ("version" >= 1 AND "numero" >= 1);
CREATE UNIQUE INDEX "demande_livreur_une_ouverte"
  ON "demande_livreur" ("personneId") WHERE "etat" = 'recue';

-- Missions : un colis n'a qu'une mission ouverte à la fois ; un livreur est nommé dès qu'elle lui est proposée.
ALTER TABLE "mission_livraison"
  ADD CONSTRAINT "mission_livraison_colis_fkey" FOREIGN KEY ("colisId") REFERENCES "colis"("id"),
  ADD CONSTRAINT "mission_livraison_etat_connu" CHECK (
    "etat" IN ('en_attente', 'proposee', 'acceptee', 'livree', 'repli', 'sans_livreur', 'annulee')
  ),
  ADD CONSTRAINT "mission_livraison_livreur_nomme" CHECK (
    "etat" NOT IN ('proposee', 'acceptee', 'livree', 'repli') OR "livreurId" IS NOT NULL
  ),
  ADD CONSTRAINT "mission_livraison_quantites" CHECK (
    "version" >= 1 AND "tour" >= 0 AND "distanceM" >= 0 AND "dureeMinutes" >= 0
    AND "prixLivraison" >= 0 AND "gain" >= 0 AND "gain" <= "prixLivraison"
  );
CREATE UNIQUE INDEX "mission_livraison_une_ouverte"
  ON "mission_livraison" ("colisId") WHERE "etat" IN ('en_attente', 'proposee', 'acceptee', 'sans_livreur');

-- Liens de suivi : le jeton n'est jamais gardé (clé = son hachage), le colis existe, la validité est positive.
ALTER TABLE "partage_suivi"
  ADD CONSTRAINT "partage_suivi_colis_fkey" FOREIGN KEY ("colisId") REFERENCES "colis"("id"),
  ADD CONSTRAINT "partage_suivi_validite" CHECK ("expireA" > "creeA");

-- Invitations : un journal en ajout seul (le plafond quotidien se compte dessus).
CREATE TRIGGER invitation_livreur_ajout_seul
  BEFORE UPDATE OR DELETE ON "invitation_livreur"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER invitation_livreur_pas_de_vidage
  BEFORE TRUNCATE ON "invitation_livreur"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();
