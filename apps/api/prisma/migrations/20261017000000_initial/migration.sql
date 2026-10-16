-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "role" AS ENUM ('voyageur', 'guichetier', 'convoyeur', 'chauffeur', 'vendeur', 'controleur', 'superviseur', 'patron', 'comptable', 'relais', 'livreur', 'afrimove');

-- CreateEnum
CREATE TYPE "classe_billet" AS ENUM ('classique', 'vip');

-- CreateEnum
CREATE TYPE "canal_vente" AS ENUM ('guichet', 'convoyeur', 'en_ligne', 'vendeur');

-- CreateEnum
CREATE TYPE "mode_colis" AS ENUM ('gare', 'relais', 'moto');

-- CreateEnum
CREATE TYPE "canal_colis" AS ENUM ('agence', 'app');

-- CreateEnum
CREATE TYPE "type_appareil" AS ENUM ('telephone_guichet', 'telephone_secours', 'poste_controle', 'autre');

-- CreateEnum
CREATE TYPE "etat_billet" AS ENUM ('reserve', 'paye', 'embarque', 'voyage', 'annule', 'non_presente', 'reporte');

-- CreateEnum
CREATE TYPE "etat_colis" AS ENUM ('enregistre', 'charge', 'en_route', 'decharge', 'disponible', 'remis', 'en_relais', 'en_livraison', 'livre', 'non_retire', 'retourne', 'perdu', 'litige');

-- CreateEnum
CREATE TYPE "etat_depart" AS ENUM ('programme', 'en_vente', 'embarquement', 'parti', 'arrive', 'annule', 'retarde', 'fusionne');

-- CreateEnum
CREATE TYPE "etat_session" AS ENUM ('ouverte', 'cloturee', 'validee');

-- CreateEnum
CREATE TYPE "cible_evenement" AS ENUM ('billet', 'colis', 'depart', 'session');

-- CreateEnum
CREATE TYPE "resultat_audit" AS ENUM ('succes', 'refus', 'echec');

-- CreateEnum
CREATE TYPE "objet_defi" AS ENUM ('connexion_voyageur', 'connexion_direction');

-- CreateTable
CREATE TABLE "compagnie" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "compagnie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gare" (
    "id" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "ville" TEXT NOT NULL,

    CONSTRAINT "gare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guichet" (
    "id" UUID NOT NULL,
    "gareId" UUID NOT NULL,
    "rang" INTEGER NOT NULL,

    CONSTRAINT "guichet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ligne" (
    "id" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "origineGareId" UUID NOT NULL,
    "destinationGareId" UUID NOT NULL,
    "tarifClassique" INTEGER NOT NULL,
    "tarifVip" INTEGER NOT NULL,
    "tarifBagage" INTEGER NOT NULL,

    CONSTRAINT "ligne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "arret" (
    "id" UUID NOT NULL,
    "ligneId" UUID NOT NULL,
    "ordre" INTEGER NOT NULL,
    "nom" TEXT NOT NULL,
    "kmDepuisOrigine" INTEGER NOT NULL,
    "montee" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "arret_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bus" (
    "id" UUID NOT NULL,
    "compagnieId" UUID NOT NULL,
    "immatriculation" TEXT NOT NULL,
    "capacite" INTEGER NOT NULL,
    "classe" "classe_billet" NOT NULL,

    CONSTRAINT "bus_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "module_compagnie" (
    "compagnieId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "module_compagnie_pkey" PRIMARY KEY ("compagnieId","code")
);

-- CreateTable
CREATE TABLE "personne" (
    "id" UUID NOT NULL,
    "nom" TEXT NOT NULL DEFAULT '',
    "telephoneChiffre" TEXT NOT NULL,
    "telephoneIndex" TEXT NOT NULL,
    "roles" "role"[],
    "compagnieId" UUID,
    "gareId" UUID,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "pinHache" TEXT,
    "motDePasseHache" TEXT,
    "echecsConnexion" INTEGER NOT NULL DEFAULT 0,
    "bloqueJusqua" TIMESTAMPTZ(3),
    "derniereConnexionA" TIMESTAMPTZ(3),
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personne_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appareil" (
    "id" UUID NOT NULL,
    "type" "type_appareil" NOT NULL,
    "gareId" UUID,
    "guichetId" UUID,
    "derniereSyncA" TIMESTAMPTZ(3) NOT NULL,
    "debloqueJusqua" TIMESTAMPTZ(3),

    CONSTRAINT "appareil_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depart" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "ligneId" UUID NOT NULL,
    "busId" UUID,
    "classe" "classe_billet" NOT NULL,
    "heureDepart" TIMESTAMPTZ(3) NOT NULL,
    "etat" "etat_depart" NOT NULL,
    "historique" JSONB NOT NULL DEFAULT '[]',
    "fusionneDansId" UUID,

    CONSTRAINT "depart_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session_caisse" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "guichetId" UUID NOT NULL,
    "agentId" UUID NOT NULL,
    "fondDeCaisse" INTEGER NOT NULL,
    "ouverteA" TIMESTAMPTZ(3) NOT NULL,
    "clotureeA" TIMESTAMPTZ(3),
    "clotureeAuto" BOOLEAN,
    "cashCompte" INTEGER,
    "cashAttendu" INTEGER,
    "ecart" INTEGER,
    "valideeA" TIMESTAMPTZ(3),
    "valideeParId" UUID,
    "etat" "etat_session" NOT NULL,
    "historique" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "session_caisse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billet" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "compagnieId" UUID NOT NULL,
    "gareId" UUID NOT NULL,
    "departId" UUID NOT NULL,
    "siege" INTEGER,
    "classe" "classe_billet" NOT NULL,
    "prix" INTEGER NOT NULL,
    "canal" "canal_vente" NOT NULL,
    "guichetId" UUID,
    "sessionId" UUID,
    "passagerChiffre" TEXT,
    "passagerTelephoneIndex" TEXT,
    "codeBillet" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "etat" "etat_billet" NOT NULL,
    "historique" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "billet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colis" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "gareOrigineId" UUID NOT NULL,
    "gareDestinationId" UUID NOT NULL,
    "departId" UUID,
    "expediteurChiffre" TEXT NOT NULL,
    "expediteurTelephoneIndex" TEXT NOT NULL,
    "destinataireChiffre" TEXT NOT NULL,
    "destinataireTelephoneIndex" TEXT NOT NULL,
    "contenu" TEXT NOT NULL,
    "poidsKg" DOUBLE PRECISION NOT NULL,
    "valeurDeclaree" INTEGER NOT NULL,
    "assure" BOOLEAN NOT NULL DEFAULT false,
    "mode" "mode_colis" NOT NULL,
    "canal" "canal_colis" NOT NULL,
    "codeRetraitHache" TEXT NOT NULL,
    "codeRetraitSel" TEXT NOT NULL,
    "prixTotal" INTEGER NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "disponibleDepuis" TIMESTAMPTZ(3),
    "etat" "etat_colis" NOT NULL,
    "historique" JSONB NOT NULL DEFAULT '[]',

    CONSTRAINT "colis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evenement" (
    "id" UUID NOT NULL,
    "seq" BIGSERIAL NOT NULL,
    "type" TEXT NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "appareilId" UUID,
    "auteurId" UUID,
    "cibleType" "cible_evenement" NOT NULL,
    "cibleId" UUID NOT NULL,
    "numeroPlage" INTEGER,
    "donnees" JSONB NOT NULL DEFAULT '{}',
    "recuA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_audit" (
    "seq" BIGSERIAL NOT NULL,
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "acteurId" UUID,
    "acteurRole" "role",
    "compagnieId" UUID,
    "action" TEXT NOT NULL,
    "resultat" "resultat_audit" NOT NULL,
    "cibleType" TEXT,
    "cibleId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "hashPrecedent" TEXT NOT NULL,
    "hash" TEXT NOT NULL,

    CONSTRAINT "journal_audit_pkey" PRIMARY KEY ("seq")
);

-- CreateTable
CREATE TABLE "defi_otp" (
    "id" UUID NOT NULL,
    "objet" "objet_defi" NOT NULL,
    "telephoneIndex" TEXT NOT NULL,
    "telephoneChiffre" TEXT,
    "personneId" UUID,
    "role" "role",
    "codeHache" TEXT NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "essais" INTEGER NOT NULL DEFAULT 0,
    "consommeA" TIMESTAMPTZ(3),
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "defi_otp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "compagnie_code_key" ON "compagnie"("code");

-- CreateIndex
CREATE UNIQUE INDEX "gare_compagnieId_code_key" ON "gare"("compagnieId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "guichet_gareId_rang_key" ON "guichet"("gareId", "rang");

-- CreateIndex
CREATE UNIQUE INDEX "ligne_compagnieId_code_key" ON "ligne"("compagnieId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "arret_ligneId_ordre_key" ON "arret"("ligneId", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "bus_compagnieId_immatriculation_key" ON "bus"("compagnieId", "immatriculation");

-- CreateIndex
CREATE UNIQUE INDEX "personne_telephoneIndex_key" ON "personne"("telephoneIndex");

-- CreateIndex
CREATE INDEX "personne_compagnieId_idx" ON "personne"("compagnieId");

-- CreateIndex
CREATE UNIQUE INDEX "depart_numero_key" ON "depart"("numero");

-- CreateIndex
CREATE INDEX "depart_ligneId_heureDepart_idx" ON "depart"("ligneId", "heureDepart");

-- CreateIndex
CREATE UNIQUE INDEX "session_caisse_numero_key" ON "session_caisse"("numero");

-- CreateIndex
CREATE INDEX "session_caisse_guichetId_ouverteA_idx" ON "session_caisse"("guichetId", "ouverteA");

-- CreateIndex
CREATE UNIQUE INDEX "billet_numero_key" ON "billet"("numero");

-- CreateIndex
CREATE INDEX "billet_departId_siege_idx" ON "billet"("departId", "siege");

-- CreateIndex
CREATE INDEX "billet_passagerTelephoneIndex_idx" ON "billet"("passagerTelephoneIndex");

-- CreateIndex
CREATE UNIQUE INDEX "colis_numero_key" ON "colis"("numero");

-- CreateIndex
CREATE INDEX "colis_expediteurTelephoneIndex_idx" ON "colis"("expediteurTelephoneIndex");

-- CreateIndex
CREATE INDEX "colis_destinataireTelephoneIndex_idx" ON "colis"("destinataireTelephoneIndex");

-- CreateIndex
CREATE UNIQUE INDEX "evenement_seq_key" ON "evenement"("seq");

-- CreateIndex
CREATE INDEX "evenement_cibleType_cibleId_at_idx" ON "evenement"("cibleType", "cibleId", "at");

-- CreateIndex
CREATE INDEX "evenement_auteurId_at_idx" ON "evenement"("auteurId", "at");

-- CreateIndex
CREATE UNIQUE INDEX "journal_audit_id_key" ON "journal_audit"("id");

-- CreateIndex
CREATE INDEX "journal_audit_acteurId_at_idx" ON "journal_audit"("acteurId", "at");

-- CreateIndex
CREATE INDEX "journal_audit_compagnieId_at_idx" ON "journal_audit"("compagnieId", "at");

-- CreateIndex
CREATE INDEX "journal_audit_action_at_idx" ON "journal_audit"("action", "at");

-- CreateIndex
CREATE INDEX "defi_otp_telephoneIndex_creeA_idx" ON "defi_otp"("telephoneIndex", "creeA");

-- AddForeignKey
ALTER TABLE "gare" ADD CONSTRAINT "gare_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guichet" ADD CONSTRAINT "guichet_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne" ADD CONSTRAINT "ligne_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne" ADD CONSTRAINT "ligne_origineGareId_fkey" FOREIGN KEY ("origineGareId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ligne" ADD CONSTRAINT "ligne_destinationGareId_fkey" FOREIGN KEY ("destinationGareId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arret" ADD CONSTRAINT "arret_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "ligne"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bus" ADD CONSTRAINT "bus_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "module_compagnie" ADD CONSTRAINT "module_compagnie_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personne" ADD CONSTRAINT "personne_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "personne" ADD CONSTRAINT "personne_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appareil" ADD CONSTRAINT "appareil_guichetId_fkey" FOREIGN KEY ("guichetId") REFERENCES "guichet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depart" ADD CONSTRAINT "depart_ligneId_fkey" FOREIGN KEY ("ligneId") REFERENCES "ligne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depart" ADD CONSTRAINT "depart_busId_fkey" FOREIGN KEY ("busId") REFERENCES "bus"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "depart" ADD CONSTRAINT "depart_fusionneDansId_fkey" FOREIGN KEY ("fusionneDansId") REFERENCES "depart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_guichetId_fkey" FOREIGN KEY ("guichetId") REFERENCES "guichet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "personne"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session_caisse" ADD CONSTRAINT "session_caisse_valideeParId_fkey" FOREIGN KEY ("valideeParId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_departId_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_guichetId_fkey" FOREIGN KEY ("guichetId") REFERENCES "guichet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "billet" ADD CONSTRAINT "billet_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "session_caisse"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colis" ADD CONSTRAINT "colis_gareOrigineId_fkey" FOREIGN KEY ("gareOrigineId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colis" ADD CONSTRAINT "colis_gareDestinationId_fkey" FOREIGN KEY ("gareDestinationId") REFERENCES "gare"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colis" ADD CONSTRAINT "colis_departId_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "defi_otp" ADD CONSTRAINT "defi_otp_personneId_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id") ON DELETE SET NULL ON UPDATE CASCADE;

