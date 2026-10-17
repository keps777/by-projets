-- CreateTable
CREATE TABLE "ussd_session" (
    "cle" TEXT NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "charge" TEXT NOT NULL,

    CONSTRAINT "ussd_session_pkey" PRIMARY KEY ("cle")
);

-- CreateTable
CREATE TABLE "ussd_journal" (
    "id" UUID NOT NULL,
    "at" TIMESTAMPTZ(3) NOT NULL,
    "operateur" TEXT NOT NULL,
    "msisdnMasque" TEXT,
    "sessionRef" TEXT,
    "evenement" TEXT NOT NULL,
    "etape" TEXT,
    "code" TEXT,
    "dureeMs" INTEGER,

    CONSTRAINT "ussd_journal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ussd_achat" (
    "commandeId" UUID NOT NULL,
    "voyageurId" UUID NOT NULL,
    "operateur" TEXT NOT NULL,
    "etat" TEXT NOT NULL,
    "destinataireChiffre" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "ussd_achat_pkey" PRIMARY KEY ("commandeId")
);

-- CreateIndex
CREATE INDEX "ussd_session_expireA_idx" ON "ussd_session"("expireA");

-- CreateIndex
CREATE INDEX "ussd_journal_at_idx" ON "ussd_journal"("at" DESC);

-- CreateIndex
CREATE INDEX "ussd_journal_sessionRef_idx" ON "ussd_journal"("sessionRef");


-- USSD (AM-169) · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Une session ne vit pas au-delà de ce que le dialogue a décidé : la charge n'est jamais vide.
ALTER TABLE "ussd_session"
  ADD CONSTRAINT "ussd_session_charge_presente" CHECK (length("charge") > 0);

-- Le vocabulaire du module (apps/api/src/ussd/modeles.ts) en listes fermées. Un nouvel événement du
-- journal demande une migration : mieux vaut un refus visible qu'une trace qui change de sens.
ALTER TABLE "ussd_journal"
  ADD CONSTRAINT "ussd_journal_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "ussd_journal_evenement_connu" CHECK (
    "evenement" IN (
      'ouverte', 'reponse', 'fermee_par_voyageur', 'session_expiree', 'numero_incoherent',
      'refus_jeton', 'requete_illisible', 'erreur', 'achat_reserve', 'achat_abandonne',
      'paiement_demande', 'paiement_refuse', 'mode_degrade', 'sms_billet', 'sms_billet_echec'
    )
  ),
  ADD CONSTRAINT "ussd_journal_etape_connue" CHECK (
    "etape" IS NULL OR "etape" IN ('menu', 'numero_proche', 'numero_colis', 'departs', 'confirmation')
  ),
  ADD CONSTRAINT "ussd_journal_duree" CHECK ("dureeMs" IS NULL OR "dureeMs" >= 0);

-- Une trace ne se réécrit pas (même mécanisme que le reste). La suppression reste possible : la purge
-- par ancienneté (90 jours) en a besoin.
CREATE TRIGGER ussd_journal_pas_de_reecriture
  BEFORE UPDATE ON "ussd_journal"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

ALTER TABLE "ussd_achat"
  ADD CONSTRAINT "ussd_achat_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "ussd_achat_etat_connu" CHECK (
    "etat" IN ('reservee', 'paiement_demande', 'terminee', 'abandonnee')
  );

-- Le suivi des achats ne regarde que ceux qui ne sont pas finis : places à rendre, SMS à envoyer.
CREATE INDEX "ussd_achat_a_suivre"
  ON "ussd_achat" ("creeA") WHERE "etat" IN ('reservee', 'paiement_demande');
