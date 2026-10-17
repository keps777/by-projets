-- CreateTable
CREATE TABLE "paiement" (
    "id" UUID NOT NULL,
    "cle" TEXT,
    "origine" TEXT NOT NULL,
    "commandeId" UUID,
    "voyageurId" UUID,
    "compagnieId" UUID NOT NULL,
    "moyen" TEXT NOT NULL,
    "operateur" TEXT,
    "montant" INTEGER NOT NULL,
    "deviseCode" TEXT,
    "deviseMontantMineur" INTEGER,
    "repartition" JSONB NOT NULL,
    "statut" TEXT NOT NULL,
    "confirmation" TEXT NOT NULL,
    "telephoneChiffre" TEXT,
    "telephoneMasque" TEXT,
    "fournisseur" TEXT,
    "idFournisseur" TEXT,
    "referenceOperateur" TEXT,
    "urlAuthentification" TEXT,
    "cause" TEXT,
    "billetIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "termineA" TIMESTAMPTZ(3),

    CONSTRAINT "paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement_remboursement" (
    "id" UUID NOT NULL,
    "paiementId" UUID NOT NULL,
    "cle" TEXT NOT NULL,
    "cause" TEXT NOT NULL,
    "billetId" UUID,
    "lignes" JSONB NOT NULL,
    "montant" INTEGER NOT NULL,
    "statut" TEXT NOT NULL,
    "idFournisseur" TEXT,
    "referenceOperateur" TEXT,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "prochainEssaiA" TIMESTAMPTZ(3),
    "derniereErreur" TEXT,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "termineA" TIMESTAMPTZ(3),

    CONSTRAINT "paiement_remboursement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiement_notification" (
    "fournisseur" TEXT NOT NULL,
    "evenementId" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "paiement_notification_pkey" PRIMARY KEY ("fournisseur","evenementId")
);

-- CreateTable
CREATE TABLE "paiement_lien" (
    "id" UUID NOT NULL,
    "commandeId" UUID NOT NULL,
    "empreinte" TEXT NOT NULL,
    "creePar" UUID NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "envoyeA" TEXT,
    "revoqueA" TIMESTAMPTZ(3),

    CONSTRAINT "paiement_lien_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compte_reversement" (
    "compagnieId" UUID NOT NULL,
    "compteId" TEXT NOT NULL,

    CONSTRAINT "compte_reversement_pkey" PRIMARY KEY ("compagnieId")
);

-- CreateTable
CREATE TABLE "reglage_paiements" (
    "id" SMALLINT NOT NULL,
    "degrade" BOOLEAN NOT NULL,
    "motif" TEXT,
    "parId" UUID,
    "at" TIMESTAMPTZ(3),

    CONSTRAINT "reglage_paiements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paiement_cle_key" ON "paiement"("cle");

-- CreateIndex
CREATE INDEX "paiement_compagnieId_creeA_idx" ON "paiement"("compagnieId", "creeA" DESC);

-- CreateIndex
CREATE INDEX "paiement_commandeId_idx" ON "paiement"("commandeId");

-- CreateIndex
CREATE UNIQUE INDEX "paiement_remboursement_cle_key" ON "paiement_remboursement"("cle");

-- CreateIndex
CREATE INDEX "paiement_remboursement_paiementId_idx" ON "paiement_remboursement"("paiementId");

-- CreateIndex
CREATE UNIQUE INDEX "paiement_lien_empreinte_key" ON "paiement_lien"("empreinte");

-- AddForeignKey
ALTER TABLE "paiement_remboursement" ADD CONSTRAINT "paiement_remboursement_paiementId_fkey" FOREIGN KEY ("paiementId") REFERENCES "paiement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Paiements (AM-165) · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Le vocabulaire du module (apps/api/src/paiements/modeles.ts) en listes fermées.
ALTER TABLE "paiement"
  ADD CONSTRAINT "paiement_origine_connue" CHECK ("origine" IN ('voyageur', 'proche', 'guichet', 'agence')),
  ADD CONSTRAINT "paiement_moyen_connu" CHECK (
    "moyen" IN ('mtn_momo', 'orange_money', 'carte', 'especes_agence', 'momo_marchand')
  ),
  ADD CONSTRAINT "paiement_operateur_connu" CHECK ("operateur" IS NULL OR "operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "paiement_statut_connu" CHECK ("statut" IN ('en_attente', 'reussi', 'echoue', 'expire')),
  ADD CONSTRAINT "paiement_confirmation_connue" CHECK (
    "confirmation" IN ('sans_objet', 'a_faire', 'faite', 'sieges_perdus', 'commande_annulee', 'doublon')
  ),
  ADD CONSTRAINT "paiement_montant_positif" CHECK ("montant" > 0),
  ADD CONSTRAINT "paiement_devise_complete" CHECK (("deviseCode" IS NULL) = ("deviseMontantMineur" IS NULL)),
  ADD CONSTRAINT "paiement_echeance" CHECK ("expireA" >= "creeA");

-- Un seul paiement en attente par commande : deux doubles clics, deux appareils ou deux instances
-- ne produisent jamais deux demandes de confirmation sur le téléphone du client.
CREATE UNIQUE INDEX "paiement_un_en_cours"
  ON "paiement" ("commandeId") WHERE "statut" = 'en_attente' AND "commandeId" IS NOT NULL;

-- Un seul jeu de billets par commande : un paiement reçu deux fois (webhook rejoué sous un autre
-- identifiant, deux paiements réussis) ne confirme la commande qu'une fois ; l'autre est remboursé.
CREATE UNIQUE INDEX "paiement_une_confirmee"
  ON "paiement" ("commandeId") WHERE "confirmation" = 'faite';

-- Un identifiant de transaction chez l'agrégateur n'appartient qu'à un paiement.
CREATE UNIQUE INDEX "paiement_fournisseur_identifiant"
  ON "paiement" ("fournisseur", "idFournisseur") WHERE "idFournisseur" IS NOT NULL;

-- Le balayage cherche les paiements en attente et ceux dont les billets restent à émettre.
CREATE INDEX "paiement_balayage" ON "paiement" ("creeA") WHERE "statut" = 'en_attente';
CREATE INDEX "paiement_a_confirmer"
  ON "paiement" ("creeA") WHERE "statut" = 'reussi' AND "confirmation" = 'a_faire';

ALTER TABLE "paiement_remboursement"
  ADD CONSTRAINT "paiement_remboursement_cause_connue" CHECK (
    "cause" IN (
      'billet_annule', 'depart_annule', 'sieges_perdus', 'commande_annulee', 'doublon_paiement',
      'demande_afrimove'
    )
  ),
  ADD CONSTRAINT "paiement_remboursement_statut_connu" CHECK ("statut" IN ('demande', 'reussi', 'echoue')),
  ADD CONSTRAINT "paiement_remboursement_montant_positif" CHECK ("montant" > 0),
  ADD CONSTRAINT "paiement_remboursement_tentatives" CHECK ("tentatives" >= 0);

-- Les remboursements à reprendre se lisent par leur prochain essai.
CREATE INDEX "paiement_remboursement_reprise"
  ON "paiement_remboursement" ("prochainEssaiA") WHERE "statut" = 'demande';

-- Un seul lien de paiement vivant par commande : un nouveau lien révoque le précédent.
CREATE UNIQUE INDEX "paiement_lien_un_actif"
  ON "paiement_lien" ("commandeId") WHERE "revoqueA" IS NULL;
ALTER TABLE "paiement_lien"
  ADD CONSTRAINT "paiement_lien_echeance" CHECK ("expireA" >= "creeA"),
  ADD CONSTRAINT "paiement_lien_empreinte_sha256" CHECK ("empreinte" ~ '^[0-9a-f]{64}$');

-- Une seule ligne de réglage du mode dégradé.
ALTER TABLE "reglage_paiements" ADD CONSTRAINT "reglage_paiements_une_ligne" CHECK ("id" = 1);
