-- Lot C : comptable (AM-114), analyses et assistant du patron (AM-109). Additif : tables nouvelles
-- seulement, aucune table existante n'est modifiée. Les garde-fous (CHECK, clés étrangères,
-- déclencheurs, index sur billet et colis) sont dans la migration suivante (20261017000910).

-- CreateTable
CREATE TABLE "parametres_comptables" (
    "compagnieId" UUID NOT NULL,
    "nomAgence" TEXT NOT NULL DEFAULT '',
    "emailCabinetChiffre" TEXT,
    "envoiAutomatique" BOOLEAN NOT NULL DEFAULT false,
    "jourEnvoi" INTEGER NOT NULL DEFAULT 2,
    "jourCloture" INTEGER NOT NULL DEFAULT 5,

    CONSTRAINT "parametres_comptables_pkey" PRIMARY KEY ("compagnieId")
);

-- CreateTable
CREATE TABLE "cloture_mois" (
    "compagnieId" UUID NOT NULL,
    "mois" TEXT NOT NULL,
    "clotureA" TIMESTAMPTZ(3) NOT NULL,
    "parId" UUID NOT NULL,
    "parNom" TEXT NOT NULL,
    "journalId" UUID NOT NULL,
    "encaisse" JSONB NOT NULL,
    "rapprochement" JSONB NOT NULL,
    "lignes" JSONB NOT NULL,
    "exports" JSONB NOT NULL,
    "apercuJournal" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "destinataireChiffre" TEXT,
    "envoiDemande" BOOLEAN NOT NULL DEFAULT false,
    "envoiRecuA" TIMESTAMPTZ(3),

    CONSTRAINT "cloture_mois_pkey" PRIMARY KEY ("compagnieId","mois")
);

-- CreateTable
CREATE TABLE "export_fichier" (
    "compagnieId" UUID NOT NULL,
    "mois" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "contenu" BYTEA NOT NULL,
    "tableauGz" BYTEA NOT NULL,
    "empreinte" TEXT NOT NULL,
    "genereA" TIMESTAMPTZ(3) NOT NULL,
    "colonnes" INTEGER NOT NULL,
    "lignes" INTEGER,
    "pages" INTEGER,

    CONSTRAINT "export_fichier_pkey" PRIMARY KEY ("compagnieId","mois","exportId")
);

-- CreateTable
CREATE TABLE "apercu_fichier" (
    "compagnieId" UUID NOT NULL,
    "mois" TEXT NOT NULL,
    "exportId" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "nomFichier" TEXT NOT NULL,
    "typeMime" TEXT NOT NULL,
    "contenu" BYTEA NOT NULL,
    "empreinte" TEXT NOT NULL,
    "genereA" TIMESTAMPTZ(3) NOT NULL,
    "colonnes" INTEGER NOT NULL,
    "lignes" INTEGER,
    "pages" INTEGER,

    CONSTRAINT "apercu_fichier_pkey" PRIMARY KEY ("compagnieId","mois","exportId")
);

-- CreateTable
CREATE TABLE "decision_rapprochement" (
    "compagnieId" UUID NOT NULL,
    "mois" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cible" TEXT,
    "montant" INTEGER NOT NULL,
    "operateur" TEXT NOT NULL,
    "telephoneMasque" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "explication" TEXT NOT NULL,
    "decideA" TIMESTAMPTZ(3) NOT NULL,
    "parId" UUID NOT NULL,
    "parNom" TEXT NOT NULL,
    "journalId" UUID NOT NULL,
    "methode" TEXT NOT NULL,
    "execution" TEXT NOT NULL,
    "referenceExecution" TEXT,

    CONSTRAINT "decision_rapprochement_pkey" PRIMARY KEY ("compagnieId","mois","reference")
);

-- CreateTable
CREATE TABLE "envoi_cabinet" (
    "cle" TEXT NOT NULL,
    "compagnieId" UUID NOT NULL,
    "mois" TEXT NOT NULL,
    "nature" TEXT NOT NULL,
    "definitif" BOOLEAN NOT NULL,
    "destinataireChiffre" TEXT NOT NULL,
    "envoyeA" TIMESTAMPTZ(3) NOT NULL,
    "recuA" TIMESTAMPTZ(3),

    CONSTRAINT "envoi_cabinet_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "releve_operateur_ligne" (
    "compagnieId" UUID NOT NULL,
    "reference" TEXT NOT NULL,
    "recueA" TIMESTAMPTZ(3) NOT NULL,
    "telephoneChiffre" TEXT NOT NULL,
    "operateur" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "importeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "releve_operateur_ligne_pkey" PRIMARY KEY ("compagnieId","reference")
);

-- CreateTable
CREATE TABLE "facture_payee" (
    "compagnieId" UUID NOT NULL,
    "dimanche" TEXT NOT NULL,
    "payeeLe" TEXT NOT NULL,
    "enregistreeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facture_payee_pkey" PRIMARY KEY ("compagnieId","dimanche")
);

-- CreateTable
CREATE TABLE "action_rapprochement_faite" (
    "cle" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "resultat" TEXT NOT NULL,
    "faiteA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "action_rapprochement_faite_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "bus_fiche" (
    "busId" UUID NOT NULL,
    "modele" TEXT NOT NULL DEFAULT '',
    "annee" INTEGER NOT NULL DEFAULT 0,
    "chauffeurHabituelId" UUID,
    "entretien" TEXT,
    "misAJourA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bus_fiche_pkey" PRIMARY KEY ("busId")
);

-- CreateTable
CREATE TABLE "depart_observation" (
    "departId" UUID NOT NULL,
    "note" TEXT,
    "retardMinutes" INTEGER,
    "misAJourA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depart_observation_pkey" PRIMARY KEY ("departId")
);

-- CreateTable
CREATE TABLE "depart_incident" (
    "id" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "nature" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "dureeMinutes" INTEGER,
    "signaleA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "depart_incident_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depart_depense" (
    "id" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "nature" TEXT NOT NULL,
    "montant" INTEGER NOT NULL,
    "libelle" TEXT,
    "saisieA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depart_depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_echange" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "compagnieId" UUID NOT NULL,
    "utilisateurId" UUID NOT NULL,
    "intention" TEXT NOT NULL,
    "redaction" TEXT NOT NULL,
    "reponse" JSONB NOT NULL,
    "contexte" JSONB NOT NULL,
    "creeLe" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "assistant_echange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_proposition" (
    "compagnieId" UUID NOT NULL,
    "actionId" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "proposeeLe" TIMESTAMPTZ(3) NOT NULL,
    "expireLe" TIMESTAMPTZ(3) NOT NULL,
    "appliqueePar" UUID,
    "appliqueeA" TIMESTAMPTZ(3),
    "journalId" UUID,
    "effetA" TIMESTAMPTZ(3),

    CONSTRAINT "assistant_proposition_pkey" PRIMARY KEY ("compagnieId","actionId")
);

-- CreateIndex
CREATE INDEX "cloture_mois_envoiDemande_envoiRecuA_idx" ON "cloture_mois"("envoiDemande", "envoiRecuA");

-- CreateIndex
CREATE INDEX "decision_rapprochement_execution_decideA_idx" ON "decision_rapprochement"("execution", "decideA");

-- CreateIndex
CREATE INDEX "envoi_cabinet_compagnieId_envoyeA_idx" ON "envoi_cabinet"("compagnieId", "envoyeA" DESC);

-- CreateIndex
CREATE INDEX "releve_operateur_ligne_compagnieId_recueA_idx" ON "releve_operateur_ligne"("compagnieId", "recueA");

-- CreateIndex
CREATE INDEX "depart_incident_departId_signaleA_idx" ON "depart_incident"("departId", "signaleA");

-- CreateIndex
CREATE INDEX "depart_depense_departId_idx" ON "depart_depense"("departId");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_echange_seq_key" ON "assistant_echange"("seq");

-- CreateIndex
CREATE INDEX "assistant_echange_compagnieId_utilisateurId_seq_idx" ON "assistant_echange"("compagnieId", "utilisateurId", "seq" DESC);

-- CreateIndex
CREATE INDEX "assistant_proposition_compagnieId_expireLe_idx" ON "assistant_proposition"("compagnieId", "expireLe");

-- AddForeignKey
ALTER TABLE "export_fichier" ADD CONSTRAINT "export_fichier_compagnieId_mois_fkey" FOREIGN KEY ("compagnieId", "mois") REFERENCES "cloture_mois"("compagnieId", "mois") ON DELETE RESTRICT ON UPDATE CASCADE;

