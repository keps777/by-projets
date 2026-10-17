-- Modules métier : synchronisation, numérotation, billetterie, colis, caisse, supervision, modules
-- (voir apps/api/INTEGRATION.md). Additif : aucune colonne ni table existante n'est supprimée,
-- renommée ni réduite ; les colonnes ajoutées aux tables existantes ont une valeur par défaut ou
-- acceptent NULL, et celles qui sont obligatoires (session_caisse, colis.jour) sont remplies pour
-- les lignes déjà présentes avant de devenir NOT NULL.
-- Les garde-fous que Prisma ne sait pas exprimer (CHECK, index partiels, contrainte d'exclusion,
-- déclencheurs « ajout seul ») sont dans la migration suivante, « modules_metier_garanties ».

-- AlterTable
ALTER TABLE "ligne" ADD COLUMN     "dureeMinutes" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "bus" ADD COLUMN     "capaciteSoute" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "personne" ADD COLUMN     "guichetId" UUID,
ADD COLUMN     "pinProvisoireJusqua" TIMESTAMPTZ(3);

-- AlterTable
ALTER TABLE "depart" ADD COLUMN     "chauffeurId" UUID,
ADD COLUMN     "convoyeurId" UUID,
ADD COLUMN     "quai" INTEGER,
ADD COLUMN     "versionPlan" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "session_caisse" ADD COLUMN     "cloture" JSONB,
ADD COLUMN     "compagnieId" UUID,
ADD COLUMN     "comptage" JSONB,
ADD COLUMN     "evenementOuvertureId" UUID,
ADD COLUMN     "gareId" UUID,
ADD COLUMN     "guichetRang" INTEGER,
ADD COLUMN     "refus" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "reouverteA" TIMESTAMPTZ(3),
ADD COLUMN     "tolerance" INTEGER NOT NULL DEFAULT 1000,
ADD COLUMN     "validation" JSONB;

-- Les sessions déjà ouvertes prennent la gare, la compagnie et le rang de leur guichet.
UPDATE "session_caisse" AS s
SET "gareId" = g."gareId", "guichetRang" = g."rang", "compagnieId" = ga."compagnieId"
FROM "guichet" AS g
JOIN "gare" AS ga ON ga."id" = g."gareId"
WHERE g."id" = s."guichetId";

ALTER TABLE "session_caisse"
  ALTER COLUMN "gareId" SET NOT NULL,
  ALTER COLUMN "compagnieId" SET NOT NULL,
  ALTER COLUMN "guichetRang" SET NOT NULL;

-- AlterTable
ALTER TABLE "billet" ADD COLUMN     "aCompleterAuQuai" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "acheteurId" UUID,
ADD COLUMN     "appareilId" TEXT,
ADD COLUMN     "auteurId" UUID,
ADD COLUMN     "bagage" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "commandeId" UUID,
ADD COLUMN     "embarqueA" TIMESTAMPTZ(3),
ADD COLUMN     "evenementId" UUID,
ADD COLUMN     "paiement" JSONB,
ADD COLUMN     "qr" TEXT,
ADD COLUMN     "reporteDeId" UUID,
ADD COLUMN     "retardPrevenu" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "smsEnvoye" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "colis" ADD COLUMN     "adresseLivraison" TEXT,
ADD COLUMN     "arriveePrevue" TIMESTAMPTZ(3),
ADD COLUMN     "assuranceEnAttente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "codeBloque" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "codeEnvoyeA" TIMESTAMPTZ(3),
ADD COLUMN     "codeEssais" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "codeRetraitChiffre" TEXT,
ADD COLUMN     "codeSms" TEXT NOT NULL DEFAULT 'envoye',
ADD COLUMN     "compagnieId" UUID,
ADD COLUMN     "complementPoids" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deposeA" TIMESTAMPTZ(3),
ADD COLUMN     "deposePar" TEXT,
ADD COLUMN     "deposePhotoRef" TEXT,
ADD COLUMN     "deposePoidsKg" DOUBLE PRECISION,
ADD COLUMN     "destinataireSurnom" TEXT,
ADD COLUMN     "devis" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "evenementIds" UUID[] DEFAULT ARRAY[]::UUID[],
ADD COLUMN     "expediteurId" UUID,
ADD COLUMN     "heureDepart" TIMESTAMPTZ(3),
ADD COLUMN     "jour" CHAR(6),
ADD COLUMN     "paiementEtat" TEXT,
ADD COLUMN     "paiementMontant" INTEGER,
ADD COLUMN     "paiementMoyen" TEXT,
ADD COLUMN     "paiementNumero" TEXT,
ADD COLUMN     "paiementReference" TEXT,
ADD COLUMN     "policeAssurance" TEXT,
ADD COLUMN     "port" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "relaisId" UUID,
ADD COLUMN     "remiseA" TIMESTAMPTZ(3),
ADD COLUMN     "remisePar" TEXT,
ADD COLUMN     "remisePhotoRef" TEXT,
ADD COLUMN     "valeurAssuree" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

UPDATE "colis" AS c
SET "jour" = to_char(c."creeA" AT TIME ZONE 'Africa/Douala', 'YYMMDD'),
    "compagnieId" = g."compagnieId"
FROM "gare" AS g
WHERE g."id" = c."gareOrigineId";

ALTER TABLE "colis" ALTER COLUMN "jour" SET NOT NULL;

-- CreateTable
CREATE TABLE "appareil_sync" (
    "id" TEXT NOT NULL,
    "clePublique" JSONB,
    "genre" TEXT NOT NULL,
    "rang" INTEGER,
    "nbConvoyeurs" INTEGER,
    "plageDebut" INTEGER,
    "plageFin" INTEGER,
    "gareId" UUID,
    "compagnieId" UUID,
    "derniereSyncA" TIMESTAMPTZ(3),
    "dernierOrdre" INTEGER NOT NULL DEFAULT 0,
    "octroi" JSONB,
    "retire" BOOLEAN NOT NULL DEFAULT false,
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appareil_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_evenement" (
    "seq" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "appareilId" TEXT,
    "auteurId" TEXT,
    "cibleType" TEXT NOT NULL,
    "cibleId" TEXT NOT NULL,
    "numeroPlage" INTEGER,
    "donnees" JSONB NOT NULL DEFAULT '{}',
    "recuA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ordreAppareil" INTEGER,
    "origine" TEXT NOT NULL,

    CONSTRAINT "journal_evenement_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "siege_operation" (
    "departId" TEXT NOT NULL,
    "siege" INTEGER NOT NULL,
    "evenementId" UUID NOT NULL,
    "billetId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "appareilId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,

    CONSTRAINT "siege_operation_pkey" PRIMARY KEY ("departId","siege","evenementId")
);

-- CreateTable
CREATE TABLE "siege_billet" (
    "billetId" TEXT NOT NULL,
    "departId" TEXT NOT NULL,
    "siege" INTEGER NOT NULL,

    CONSTRAINT "siege_billet_pkey" PRIMARY KEY ("billetId")
);

-- CreateTable
CREATE TABLE "siege_conflit" (
    "evenementId" UUID NOT NULL,
    "billetId" TEXT NOT NULL,
    "departId" TEXT NOT NULL,
    "siege" INTEGER NOT NULL,
    "gagnantBilletId" TEXT NOT NULL,
    "appareilId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,
    "detecteA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "siege_conflit_pkey" PRIMARY KEY ("evenementId")
);

-- CreateTable
CREATE TABLE "alerte_sync" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "gravite" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "appareilId" TEXT,
    "auteurId" TEXT,
    "evenementId" UUID,
    "gareId" UUID,
    "compagnieId" UUID,
    "details" JSONB NOT NULL DEFAULT '{}',
    "resolueA" TIMESTAMPTZ(3),

    CONSTRAINT "alerte_sync_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plage_attribuee" (
    "id" BIGSERIAL NOT NULL,
    "appareilId" TEXT NOT NULL,
    "genre" TEXT NOT NULL,
    "rang" INTEGER,
    "nbConvoyeurs" INTEGER,
    "plageDebut" INTEGER NOT NULL,
    "plageFin" INTEGER NOT NULL,
    "compagnieId" UUID,
    "gareId" UUID,
    "portee" TEXT NOT NULL,
    "titulaireId" TEXT,
    "titulaireNom" TEXT,
    "attribueeA" TIMESTAMPTZ(3) NOT NULL,
    "attribueePar" UUID,
    "libereeA" TIMESTAMPTZ(3),

    CONSTRAINT "plage_attribuee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "numero_vu" (
    "portee" TEXT NOT NULL,
    "jour" CHAR(6) NOT NULL,
    "genre" TEXT NOT NULL,
    "numero" INTEGER NOT NULL,
    "appareilId" TEXT NOT NULL,
    "evenementId" TEXT NOT NULL,
    "gareId" UUID,
    "compagnieId" UUID,
    "recuA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "numero_vu_pkey" PRIMARY KEY ("portee","jour","genre","numero")
);

-- CreateTable
CREATE TABLE "siege_depart" (
    "departId" UUID NOT NULL,
    "siege" INTEGER NOT NULL,
    "billetId" UUID,
    "bloquePar" TEXT,
    "commandeId" UUID,
    "bloqueJusqua" TIMESTAMPTZ(3),

    CONSTRAINT "siege_depart_pkey" PRIMARY KEY ("departId","siege")
);

-- CreateTable
CREATE TABLE "commande" (
    "id" UUID NOT NULL,
    "voyageurId" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "lignes" JSONB NOT NULL DEFAULT '[]',
    "total" INTEGER NOT NULL,
    "conversion" JSONB,
    "statut" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "sieges" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "passagersChiffre" TEXT NOT NULL,
    "billetIds" UUID[] DEFAULT ARRAY[]::UUID[],
    "codePromo" TEXT,
    "moyenPaiement" TEXT,

    CONSTRAINT "commande_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scan_quai" (
    "evenementId" UUID NOT NULL,
    "departId" TEXT NOT NULL,
    "billetId" TEXT,
    "numero" TEXT,
    "resultat" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "siege" INTEGER,
    "classe" "classe_billet",
    "bagagesSoute" INTEGER NOT NULL DEFAULT 0,
    "premierScanA" TIMESTAMPTZ(3),
    "appareilId" TEXT NOT NULL,
    "auteurId" TEXT NOT NULL,

    CONSTRAINT "scan_quai_pkey" PRIMARY KEY ("evenementId")
);

-- CreateTable
CREATE TABLE "evenement_traite" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "recuA" TIMESTAMPTZ(3) NOT NULL,
    "reponseChiffree" TEXT NOT NULL,

    CONSTRAINT "evenement_traite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "compagnie_preferee" (
    "voyageurId" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,

    CONSTRAINT "compagnie_preferee_pkey" PRIMARY KEY ("voyageurId","compagnieId")
);

-- CreateTable
CREATE TABLE "filtres_voyageur" (
    "voyageurId" UUID NOT NULL,
    "depart" TEXT NOT NULL,
    "arrivee" TEXT NOT NULL,
    "filtres" JSONB NOT NULL,

    CONSTRAINT "filtres_voyageur_pkey" PRIMARY KEY ("voyageurId","depart","arrivee")
);

-- CreateTable
CREATE TABLE "photo_colis" (
    "ref" TEXT NOT NULL,
    "colisId" UUID,
    "genre" TEXT NOT NULL,
    "priseA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "supprimeeA" TIMESTAMPTZ(3),

    CONSTRAINT "photo_colis_pkey" PRIMARY KEY ("ref")
);

-- CreateTable
CREATE TABLE "reclamation_colis" (
    "reference" TEXT NOT NULL,
    "colisId" UUID NOT NULL,
    "colisNumero" TEXT NOT NULL,
    "compagnieId" UUID,
    "auteurId" UUID NOT NULL,
    "motif" TEXT NOT NULL,
    "message" TEXT,
    "ouverteA" TIMESTAMPTZ(3) NOT NULL,
    "reponseAvant" TIMESTAMPTZ(3) NOT NULL,
    "statut" TEXT NOT NULL,
    "decision" JSONB,

    CONSTRAINT "reclamation_colis_pkey" PRIMARY KEY ("reference")
);

-- CreateTable
CREATE TABLE "annulation_caisse" (
    "demandeId" UUID NOT NULL,
    "sessionId" UUID NOT NULL,
    "montant" INTEGER NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "annulation_caisse_pkey" PRIMARY KEY ("demandeId")
);

-- CreateTable
CREATE TABLE "journal_agence" (
    "seq" BIGSERIAL NOT NULL,
    "chaine" TEXT NOT NULL,
    "evenementId" UUID NOT NULL,
    "gareId" UUID,
    "compagnieId" UUID,
    "type" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "auteurId" TEXT NOT NULL,
    "auteurNom" TEXT NOT NULL,
    "appareilId" TEXT,
    "cibleType" TEXT NOT NULL,
    "cibleId" TEXT NOT NULL,
    "numeroPlage" INTEGER,
    "resume" TEXT NOT NULL,
    "validePar" JSONB,
    "empreinte" TEXT NOT NULL,
    "precedente" TEXT,

    CONSTRAINT "journal_agence_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "evenement_agence_traite" (
    "evenementId" UUID NOT NULL,
    "etat" TEXT NOT NULL,
    "resultat" JSONB,
    "recuA" TIMESTAMPTZ(3),

    CONSTRAINT "evenement_agence_traite_pkey" PRIMARY KEY ("evenementId")
);

-- CreateTable
CREATE TABLE "demande_annulation" (
    "demandeId" UUID NOT NULL,
    "billetId" UUID NOT NULL,
    "gareId" UUID NOT NULL,
    "compagnieId" UUID,
    "demandeurId" UUID NOT NULL,
    "guichetRang" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "demandeA" TIMESTAMPTZ(3) NOT NULL,
    "statut" TEXT NOT NULL,
    "decision" TEXT,
    "montant" INTEGER,
    "decideeA" TIMESTAMPTZ(3),
    "decideeParId" UUID,
    "evenementDemandeId" UUID NOT NULL,
    "evenementDecisionId" UUID,

    CONSTRAINT "demande_annulation_pkey" PRIMARY KEY ("demandeId")
);

-- CreateTable
CREATE TABLE "module_exception" (
    "id" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "porteeType" TEXT NOT NULL,
    "gareId" UUID,
    "villeCle" TEXT,
    "villeNom" TEXT,
    "actif" BOOLEAN NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "creePar" UUID,

    CONSTRAINT "module_exception_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "appareil_sync_gareId_idx" ON "appareil_sync"("gareId");

-- CreateIndex
CREATE INDEX "appareil_sync_compagnieId_idx" ON "appareil_sync"("compagnieId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_evenement_id_key" ON "journal_evenement"("id");

-- CreateIndex
CREATE INDEX "journal_evenement_appareilId_ordreAppareil_idx" ON "journal_evenement"("appareilId", "ordreAppareil");

-- CreateIndex
CREATE INDEX "journal_evenement_type_seq_idx" ON "journal_evenement"("type", "seq");

-- CreateIndex
CREATE INDEX "journal_evenement_cibleType_cibleId_idx" ON "journal_evenement"("cibleType", "cibleId");

-- CreateIndex
CREATE INDEX "siege_operation_billetId_idx" ON "siege_operation"("billetId");

-- CreateIndex
CREATE INDEX "siege_billet_departId_siege_idx" ON "siege_billet"("departId", "siege");

-- CreateIndex
CREATE INDEX "siege_conflit_departId_siege_idx" ON "siege_conflit"("departId", "siege");

-- CreateIndex
CREATE INDEX "siege_conflit_appareilId_detecteA_idx" ON "siege_conflit"("appareilId", "detecteA");

-- CreateIndex
CREATE INDEX "alerte_sync_gareId_resolueA_idx" ON "alerte_sync"("gareId", "resolueA");

-- CreateIndex
CREATE INDEX "alerte_sync_compagnieId_resolueA_idx" ON "alerte_sync"("compagnieId", "resolueA");

-- CreateIndex
CREATE INDEX "alerte_sync_appareilId_idx" ON "alerte_sync"("appareilId");

-- CreateIndex
CREATE INDEX "alerte_sync_type_creeA_idx" ON "alerte_sync"("type", "creeA");

-- CreateIndex
CREATE INDEX "plage_attribuee_gareId_idx" ON "plage_attribuee"("gareId");

-- CreateIndex
CREATE INDEX "plage_attribuee_compagnieId_idx" ON "plage_attribuee"("compagnieId");

-- CreateIndex
CREATE INDEX "numero_vu_jour_idx" ON "numero_vu"("jour");

-- CreateIndex
CREATE INDEX "siege_depart_billetId_idx" ON "siege_depart"("billetId");

-- CreateIndex
CREATE INDEX "siege_depart_bloqueJusqua_idx" ON "siege_depart"("bloqueJusqua");

-- CreateIndex
CREATE INDEX "commande_departId_statut_idx" ON "commande"("departId", "statut");

-- CreateIndex
CREATE INDEX "commande_statut_expireA_idx" ON "commande"("statut", "expireA");

-- CreateIndex
CREATE INDEX "commande_voyageurId_creeA_idx" ON "commande"("voyageurId", "creeA");

-- CreateIndex
CREATE INDEX "scan_quai_departId_at_idx" ON "scan_quai"("departId", "at");

-- CreateIndex
CREATE INDEX "scan_quai_billetId_idx" ON "scan_quai"("billetId");

-- CreateIndex
CREATE INDEX "photo_colis_colisId_idx" ON "photo_colis"("colisId");

-- CreateIndex
CREATE INDEX "reclamation_colis_colisId_idx" ON "reclamation_colis"("colisId");

-- CreateIndex
CREATE INDEX "reclamation_colis_compagnieId_statut_idx" ON "reclamation_colis"("compagnieId", "statut");

-- CreateIndex
CREATE INDEX "annulation_caisse_sessionId_idx" ON "annulation_caisse"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_agence_evenementId_key" ON "journal_agence"("evenementId");

-- CreateIndex
CREATE UNIQUE INDEX "journal_agence_chaine_precedente_key" ON "journal_agence"("chaine", "precedente");

-- CreateIndex
CREATE INDEX "journal_agence_chaine_seq_idx" ON "journal_agence"("chaine", "seq");

-- CreateIndex
CREATE INDEX "journal_agence_gareId_at_idx" ON "journal_agence"("gareId", "at");

-- CreateIndex
CREATE INDEX "journal_agence_compagnieId_at_idx" ON "journal_agence"("compagnieId", "at");

-- CreateIndex
CREATE INDEX "journal_agence_cibleType_cibleId_idx" ON "journal_agence"("cibleType", "cibleId");

-- CreateIndex
CREATE INDEX "demande_annulation_gareId_statut_idx" ON "demande_annulation"("gareId", "statut");

-- CreateIndex
CREATE INDEX "demande_annulation_billetId_idx" ON "demande_annulation"("billetId");

-- CreateIndex
CREATE UNIQUE INDEX "module_exception_compagnieId_code_gareId_key" ON "module_exception"("compagnieId", "code", "gareId");

-- CreateIndex
CREATE UNIQUE INDEX "module_exception_compagnieId_code_villeCle_key" ON "module_exception"("compagnieId", "code", "villeCle");

-- CreateIndex
CREATE INDEX "personne_gareId_idx" ON "personne"("gareId");

-- CreateIndex
CREATE INDEX "depart_etat_heureDepart_idx" ON "depart"("etat", "heureDepart");

-- CreateIndex
CREATE UNIQUE INDEX "session_caisse_evenementOuvertureId_key" ON "session_caisse"("evenementOuvertureId");

-- CreateIndex
CREATE INDEX "session_caisse_gareId_ouverteA_idx" ON "session_caisse"("gareId", "ouverteA");

-- CreateIndex
CREATE INDEX "session_caisse_agentId_ouverteA_idx" ON "session_caisse"("agentId", "ouverteA");

-- CreateIndex
CREATE UNIQUE INDEX "billet_evenementId_key" ON "billet"("evenementId");

-- CreateIndex
CREATE INDEX "billet_acheteurId_idx" ON "billet"("acheteurId");

-- CreateIndex
CREATE INDEX "billet_guichetId_creeA_idx" ON "billet"("guichetId", "creeA");

-- CreateIndex
CREATE INDEX "billet_commandeId_idx" ON "billet"("commandeId");

-- CreateIndex
CREATE INDEX "colis_departId_etat_idx" ON "colis"("departId", "etat");

-- CreateIndex
CREATE INDEX "colis_etat_disponibleDepuis_idx" ON "colis"("etat", "disponibleDepuis");

-- CreateIndex
CREATE INDEX "colis_expediteurId_idx" ON "colis"("expediteurId");

-- CreateIndex
CREATE INDEX "colis_gareOrigineId_jour_idx" ON "colis"("gareOrigineId", "jour");

-- AddForeignKey
ALTER TABLE "personne" ADD CONSTRAINT "personne_guichetId_fkey" FOREIGN KEY ("guichetId") REFERENCES "guichet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depart" ADD CONSTRAINT "depart_chauffeurId_fkey" FOREIGN KEY ("chauffeurId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depart" ADD CONSTRAINT "depart_convoyeurId_fkey" FOREIGN KEY ("convoyeurId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_acheteurId_fkey" FOREIGN KEY ("acheteurId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_commandeId_fkey" FOREIGN KEY ("commandeId") REFERENCES "commande"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_reporteDeId_fkey" FOREIGN KEY ("reporteDeId") REFERENCES "billet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colis" ADD CONSTRAINT "colis_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colis" ADD CONSTRAINT "colis_expediteurId_fkey" FOREIGN KEY ("expediteurId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appareil_sync" ADD CONSTRAINT "appareil_sync_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appareil_sync" ADD CONSTRAINT "appareil_sync_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plage_attribuee" ADD CONSTRAINT "plage_attribuee_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plage_attribuee" ADD CONSTRAINT "plage_attribuee_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "siege_depart" ADD CONSTRAINT "siege_depart_departId_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_voyageurId_fkey" FOREIGN KEY ("voyageurId") REFERENCES "personne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "commande" ADD CONSTRAINT "commande_departId_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "compagnie_preferee" ADD CONSTRAINT "compagnie_preferee_voyageurId_fkey" FOREIGN KEY ("voyageurId") REFERENCES "personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "filtres_voyageur" ADD CONSTRAINT "filtres_voyageur_voyageurId_fkey" FOREIGN KEY ("voyageurId") REFERENCES "personne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "photo_colis" ADD CONSTRAINT "photo_colis_colisId_fkey" FOREIGN KEY ("colisId") REFERENCES "colis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamation_colis" ADD CONSTRAINT "reclamation_colis_colisId_fkey" FOREIGN KEY ("colisId") REFERENCES "colis"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamation_colis" ADD CONSTRAINT "reclamation_colis_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reclamation_colis" ADD CONSTRAINT "reclamation_colis_auteurId_fkey" FOREIGN KEY ("auteurId") REFERENCES "personne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "annulation_caisse" ADD CONSTRAINT "annulation_caisse_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session_caisse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_annulation" ADD CONSTRAINT "demande_annulation_billetId_fkey" FOREIGN KEY ("billetId") REFERENCES "billet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_annulation" ADD CONSTRAINT "demande_annulation_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_annulation" ADD CONSTRAINT "demande_annulation_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_annulation" ADD CONSTRAINT "demande_annulation_demandeurId_fkey" FOREIGN KEY ("demandeurId") REFERENCES "personne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "demande_annulation" ADD CONSTRAINT "demande_annulation_decideeParId_fkey" FOREIGN KEY ("decideeParId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_exception" ADD CONSTRAINT "module_exception_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_exception" ADD CONSTRAINT "module_exception_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_exception" ADD CONSTRAINT "module_exception_creePar_fkey" FOREIGN KEY ("creePar") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

