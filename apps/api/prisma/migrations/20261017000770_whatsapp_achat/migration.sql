-- CreateTable
CREATE TABLE "whatsapp_achat_conversation" (
    "cle" TEXT NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "charge" TEXT NOT NULL,

    CONSTRAINT "whatsapp_achat_conversation_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "whatsapp_achat_journal" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "numeroMasque" TEXT,
    "conversationRef" TEXT,
    "evenement" TEXT NOT NULL,
    "etape" TEXT,
    "langue" TEXT,
    "source" TEXT,
    "code" TEXT,
    "dureeMs" INTEGER,

    CONSTRAINT "whatsapp_achat_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_achat" (
    "commandeId" UUID NOT NULL,
    "voyageurId" UUID NOT NULL,
    "etat" TEXT NOT NULL,
    "langue" TEXT NOT NULL,
    "destinataireChiffre" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "whatsapp_achat_pkey" PRIMARY KEY ("commandeId")
);

-- CreateIndex
CREATE INDEX "whatsapp_achat_conversation_expireA_idx" ON "whatsapp_achat_conversation"("expireA");

-- CreateIndex
CREATE INDEX "whatsapp_achat_journal_at_idx" ON "whatsapp_achat_journal"("at" DESC);

-- CreateIndex
CREATE INDEX "whatsapp_achat_journal_conversationRef_idx" ON "whatsapp_achat_journal"("conversationRef");

-- CreateIndex
CREATE INDEX "whatsapp_achat_etat_creeA_idx" ON "whatsapp_achat"("etat", "creeA");


-- Achat par WhatsApp (AM-168) · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Une conversation ne vit pas sans état : la charge n'est jamais vide.
ALTER TABLE "whatsapp_achat_conversation"
  ADD CONSTRAINT "whatsapp_achat_conversation_charge_presente" CHECK (length("charge") > 0);

-- Le vocabulaire du module (apps/api/src/whatsapp-achat/modeles.ts) en listes fermées. Un nouvel
-- événement du journal demande une migration : mieux vaut un refus visible qu'une trace qui change de sens.
ALTER TABLE "whatsapp_achat_journal"
  ADD CONSTRAINT "whatsapp_achat_journal_evenement_connu" CHECK (
    "evenement" IN (
      'message', 'demande_comprise', 'departs_proposes', 'aucun_depart', 'ville_inconnue',
      'achat_reserve', 'siege_change', 'paiement_demande', 'paiement_refuse', 'paiement_echoue',
      'place_reprise', 'mode_degrade', 'achat_annule', 'achat_abandonne', 'billet_envoye',
      'billet_envoi_echec', 'vocal_transcrit', 'vocal_echec', 'hors_sujet', 'reponse_non_comprise',
      'reponse_non_envoyee', 'erreur'
    )
  ),
  ADD CONSTRAINT "whatsapp_achat_journal_etape_connue" CHECK (
    "etape" IS NULL OR "etape" IN ('departs', 'confirmation', 'choix_siege', 'numero_momo', 'paiement')
  ),
  ADD CONSTRAINT "whatsapp_achat_journal_langue_connue" CHECK (
    "langue" IS NULL OR "langue" IN ('fr', 'en', 'pcm')
  ),
  ADD CONSTRAINT "whatsapp_achat_journal_source_connue" CHECK (
    "source" IS NULL OR "source" IN ('texte', 'vocal')
  ),
  ADD CONSTRAINT "whatsapp_achat_journal_duree" CHECK ("dureeMs" IS NULL OR "dureeMs" >= 0);

-- Les enquêtes lisent un événement précis dans le temps (« billet_envoi_echec » de la semaine).
CREATE INDEX "whatsapp_achat_journal_evenement" ON "whatsapp_achat_journal" ("evenement", "at" DESC);

-- Une trace ne se réécrit pas (même mécanisme que le reste). La suppression reste possible : la purge
-- par ancienneté en a besoin.
CREATE TRIGGER whatsapp_achat_journal_pas_de_reecriture
  BEFORE UPDATE ON "whatsapp_achat_journal"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

ALTER TABLE "whatsapp_achat"
  ADD CONSTRAINT "whatsapp_achat_etat_connu" CHECK (
    "etat" IN ('reservee', 'paiement_demande', 'terminee', 'abandonnee', 'echouee')
  ),
  ADD CONSTRAINT "whatsapp_achat_langue_connue" CHECK ("langue" IN ('fr', 'en', 'pcm'));
