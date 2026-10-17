-- CreateTable
CREATE TABLE "trajet_covoiturage" (
    "id" UUID NOT NULL,
    "conducteurId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "departVille" TEXT NOT NULL,
    "departVilleNorm" TEXT NOT NULL,
    "departPoint" TEXT NOT NULL,
    "arriveeVille" TEXT NOT NULL,
    "arriveeVilleNorm" TEXT NOT NULL,
    "arriveePoint" TEXT NOT NULL,
    "departA" TIMESTAMPTZ(3) NOT NULL,
    "dureeMinutes" INTEGER NOT NULL,
    "places" INTEGER NOT NULL,
    "prixParPlace" INTEGER NOT NULL,
    "options" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vehicule" TEXT NOT NULL,
    "immatriculation" TEXT NOT NULL,
    "grandBagage" BOOLEAN NOT NULL DEFAULT false,
    "regulier" BOOLEAN NOT NULL DEFAULT false,
    "suivantCreeA" TIMESTAMPTZ(3),
    "statut" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "annuleA" TIMESTAMPTZ(3),

    CONSTRAINT "trajet_covoiturage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vue_trajet_covoiturage" (
    "trajetId" UUID NOT NULL,
    "voyageurId" UUID NOT NULL,

    CONSTRAINT "vue_trajet_covoiturage_pkey" PRIMARY KEY ("trajetId","voyageurId")
);

-- CreateTable
CREATE TABLE "reservation_covoiturage" (
    "id" UUID NOT NULL,
    "trajetId" UUID NOT NULL,
    "conducteurId" UUID NOT NULL,
    "passagerId" UUID NOT NULL,
    "places" INTEGER NOT NULL,
    "prixParPlace" INTEGER NOT NULL,
    "fraisParPlace" INTEGER NOT NULL,
    "libelle" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "expireA" TIMESTAMPTZ(3) NOT NULL,
    "payeeA" TIMESTAMPTZ(3),
    "moyenPaiement" TEXT,
    "departA" TIMESTAMPTZ(3) NOT NULL,
    "liberationAutoA" TIMESTAMPTZ(3) NOT NULL,
    "libereeA" TIMESTAMPTZ(3),
    "motifLiberation" TEXT,
    "annuleeA" TIMESTAMPTZ(3),
    "annulePar" TEXT,
    "remboursementPrix" INTEGER,
    "remboursementFrais" INTEGER,
    "retenue" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "reservation_covoiturage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dossier_conducteur" (
    "conducteurId" UUID NOT NULL,
    "vehiculeMarque" TEXT,
    "vehiculeModele" TEXT,
    "vehiculeCouleur" TEXT,
    "vehiculeImmatriculation" TEXT,
    "vehiculePlaces" INTEGER,
    "vehiculeGrandBagage" BOOLEAN,
    "numeroVersementChiffre" TEXT,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "modifieA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "dossier_conducteur_pkey" PRIMARY KEY ("conducteurId")
);

-- CreateTable
CREATE TABLE "piece_conducteur" (
    "conducteurId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "fichierId" TEXT NOT NULL,
    "numeroChiffre" TEXT,
    "expireLe" DATE,
    "deposeeA" TIMESTAMPTZ(3) NOT NULL,
    "verifieePar" UUID,
    "verifieeA" TIMESTAMPTZ(3),
    "motifRefus" TEXT,

    CONSTRAINT "piece_conducteur_pkey" PRIMARY KEY ("conducteurId","type")
);

-- CreateTable
CREATE TABLE "versement_covoiturage" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "conducteurId" UUID NOT NULL,
    "montant" INTEGER NOT NULL,
    "motif" TEXT NOT NULL,
    "statut" TEXT NOT NULL,
    "reference" TEXT,
    "tentatives" INTEGER NOT NULL DEFAULT 0,
    "prochainEssaiA" TIMESTAMPTZ(3),
    "derniereErreur" TEXT,
    "creeA" TIMESTAMPTZ(3) NOT NULL,
    "faitA" TIMESTAMPTZ(3),

    CONSTRAINT "versement_covoiturage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "demande_covoiturage" (
    "id" UUID NOT NULL,
    "passagerId" UUID NOT NULL,
    "departVille" TEXT NOT NULL,
    "arriveeVille" TEXT NOT NULL,
    "jour" DATE NOT NULL,
    "moment" TEXT,
    "places" INTEGER NOT NULL,
    "statut" TEXT NOT NULL,
    "creeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "demande_covoiturage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proposition_covoiturage" (
    "demandeId" UUID NOT NULL,
    "conducteurId" UUID NOT NULL,
    "trajetId" UUID NOT NULL,
    "envoyeeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "proposition_covoiturage_pkey" PRIMARY KEY ("demandeId","conducteurId","trajetId")
);

-- CreateTable
CREATE TABLE "note_covoiturage" (
    "id" UUID NOT NULL,
    "reservationId" UUID NOT NULL,
    "noteId" UUID NOT NULL,
    "roleNote" TEXT NOT NULL,
    "auteurId" UUID NOT NULL,
    "valeur" INTEGER NOT NULL,
    "commentaire" TEXT,
    "creeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "note_covoiturage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trajet_regulier_passager" (
    "voyageurId" UUID NOT NULL,
    "ville" TEXT NOT NULL,
    "departPoint" TEXT NOT NULL,
    "arriveePoint" TEXT NOT NULL,
    "departA" TEXT NOT NULL,
    "actif" BOOLEAN NOT NULL,
    "modifieA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "trajet_regulier_passager_pkey" PRIMARY KEY ("voyageurId")
);

-- CreateTable
CREATE TABLE "conseil_covoiturage" (
    "villeANorm" TEXT NOT NULL,
    "villeBNorm" TEXT NOT NULL,
    "villeA" TEXT NOT NULL,
    "villeB" TEXT NOT NULL,
    "prixMin" INTEGER NOT NULL,
    "prixMax" INTEGER NOT NULL,
    "dureeMinutes" INTEGER NOT NULL,

    CONSTRAINT "conseil_covoiturage_pkey" PRIMARY KEY ("villeANorm","villeBNorm")
);

-- CreateIndex
CREATE INDEX "trajet_covoiturage_conducteurId_departA_idx" ON "trajet_covoiturage"("conducteurId", "departA");

-- CreateIndex
CREATE INDEX "reservation_covoiturage_trajetId_statut_idx" ON "reservation_covoiturage"("trajetId", "statut");

-- CreateIndex
CREATE INDEX "reservation_covoiturage_passagerId_departA_idx" ON "reservation_covoiturage"("passagerId", "departA");

-- CreateIndex
CREATE INDEX "reservation_covoiturage_conducteurId_creeA_idx" ON "reservation_covoiturage"("conducteurId", "creeA");

-- CreateIndex
CREATE INDEX "reservation_covoiturage_statut_expireA_idx" ON "reservation_covoiturage"("statut", "expireA");

-- CreateIndex
CREATE INDEX "reservation_covoiturage_statut_liberationAutoA_idx" ON "reservation_covoiturage"("statut", "liberationAutoA");

-- CreateIndex
CREATE INDEX "dossier_conducteur_modifieA_idx" ON "dossier_conducteur"("modifieA");

-- CreateIndex
CREATE INDEX "piece_conducteur_statut_deposeeA_idx" ON "piece_conducteur"("statut", "deposeeA");

-- CreateIndex
CREATE UNIQUE INDEX "versement_covoiturage_reservationId_key" ON "versement_covoiturage"("reservationId");

-- CreateIndex
CREATE INDEX "versement_covoiturage_statut_prochainEssaiA_idx" ON "versement_covoiturage"("statut", "prochainEssaiA");

-- CreateIndex
CREATE INDEX "versement_covoiturage_conducteurId_faitA_idx" ON "versement_covoiturage"("conducteurId", "faitA");

-- CreateIndex
CREATE INDEX "demande_covoiturage_statut_jour_idx" ON "demande_covoiturage"("statut", "jour");

-- CreateIndex
CREATE INDEX "demande_covoiturage_passagerId_creeA_idx" ON "demande_covoiturage"("passagerId", "creeA");

-- CreateIndex
CREATE INDEX "proposition_covoiturage_conducteurId_envoyeeA_idx" ON "proposition_covoiturage"("conducteurId", "envoyeeA");

-- CreateIndex
CREATE INDEX "note_covoiturage_noteId_roleNote_idx" ON "note_covoiturage"("noteId", "roleNote");

-- CreateIndex
CREATE UNIQUE INDEX "note_covoiturage_reservationId_roleNote_key" ON "note_covoiturage"("reservationId", "roleNote");

-- AddForeignKey
ALTER TABLE "vue_trajet_covoiturage" ADD CONSTRAINT "vue_trajet_covoiturage_trajetId_fkey" FOREIGN KEY ("trajetId") REFERENCES "trajet_covoiturage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reservation_covoiturage" ADD CONSTRAINT "reservation_covoiturage_trajetId_fkey" FOREIGN KEY ("trajetId") REFERENCES "trajet_covoiturage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_conducteur" ADD CONSTRAINT "piece_conducteur_conducteurId_fkey" FOREIGN KEY ("conducteurId") REFERENCES "dossier_conducteur"("conducteurId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proposition_covoiturage" ADD CONSTRAINT "proposition_covoiturage_demandeId_fkey" FOREIGN KEY ("demandeId") REFERENCES "demande_covoiturage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- LOT B · covoiturage : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.
-- Aucune clé étrangère n'efface en cascade : un trajet et son argent restent lisibles pour l'audit.

-- Trajets
ALTER TABLE "trajet_covoiturage"
  ADD CONSTRAINT "trajet_covoiturage_conducteur_fkey" FOREIGN KEY ("conducteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "trajet_covoiturage_type_connu" CHECK ("type" IN ('entre_villes', 'ville')),
  ADD CONSTRAINT "trajet_covoiturage_statut_connu" CHECK ("statut" IN ('publie', 'annule', 'termine')),
  ADD CONSTRAINT "trajet_covoiturage_quantites" CHECK (
    "places" >= 1 AND "prixParPlace" >= 0 AND "dureeMinutes" >= 1
  );

-- La recherche : seuls les trajets publiés comptent, du plus proche au plus lointain.
CREATE INDEX "trajet_covoiturage_recherche"
  ON "trajet_covoiturage" ("type", "departVilleNorm", "arriveeVilleNorm", "departA")
  WHERE "statut" = 'publie';
-- Les balayages : trajets à terminer et trajets réguliers à renouveler.
CREATE INDEX "trajet_covoiturage_a_terminer" ON "trajet_covoiturage" ("departA") WHERE "statut" = 'publie';
CREATE INDEX "trajet_covoiturage_a_renouveler" ON "trajet_covoiturage" ("departA")
  WHERE "regulier" AND "suivantCreeA" IS NULL;

ALTER TABLE "vue_trajet_covoiturage"
  ADD CONSTRAINT "vue_trajet_covoiturage_voyageur_fkey" FOREIGN KEY ("voyageurId") REFERENCES "personne"("id");

-- Réservations
ALTER TABLE "reservation_covoiturage"
  ADD CONSTRAINT "reservation_covoiturage_conducteur_fkey" FOREIGN KEY ("conducteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "reservation_covoiturage_passager_fkey" FOREIGN KEY ("passagerId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "reservation_covoiturage_statut_connu" CHECK (
    "statut" IN ('en_attente_paiement', 'expiree', 'payee', 'terminee', 'annulee')
  ),
  ADD CONSTRAINT "reservation_covoiturage_annule_par_connu" CHECK (
    "annulePar" IS NULL OR "annulePar" IN ('passager', 'conducteur', 'systeme')
  ),
  ADD CONSTRAINT "reservation_covoiturage_motif_connu" CHECK (
    "motifLiberation" IS NULL
    OR "motifLiberation" IN ('confirmation_passager', 'delai_depasse', 'annulation_tardive')
  ),
  ADD CONSTRAINT "reservation_covoiturage_quantites" CHECK (
    "places" >= 1 AND "prixParPlace" >= 0 AND "fraisParPlace" >= 0 AND "retenue" >= 0
  ),
  ADD CONSTRAINT "reservation_covoiturage_remboursement_complet" CHECK (
    ("remboursementPrix" IS NULL) = ("remboursementFrais" IS NULL)
    AND ("remboursementPrix" IS NULL OR ("remboursementPrix" >= 0 AND "remboursementFrais" >= 0))
  );

-- Un passager n'a qu'une réservation en cours (retenue ou payée) par trajet : c'est ce qui rend
-- `reserver` sûr quand deux appels se croisent.
CREATE UNIQUE INDEX "reservation_covoiturage_une_en_cours"
  ON "reservation_covoiturage" ("trajetId", "passagerId")
  WHERE "statut" IN ('en_attente_paiement', 'payee');

-- Dossiers des conducteurs
ALTER TABLE "dossier_conducteur"
  ADD CONSTRAINT "dossier_conducteur_conducteur_fkey" FOREIGN KEY ("conducteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "dossier_conducteur_vehicule_complet" CHECK (
    ("vehiculeMarque" IS NULL) = ("vehiculeModele" IS NULL)
    AND ("vehiculeMarque" IS NULL) = ("vehiculeCouleur" IS NULL)
    AND ("vehiculeMarque" IS NULL) = ("vehiculeImmatriculation" IS NULL)
    AND ("vehiculeMarque" IS NULL) = ("vehiculePlaces" IS NULL)
    AND ("vehiculeMarque" IS NULL) = ("vehiculeGrandBagage" IS NULL)
    AND ("vehiculePlaces" IS NULL OR "vehiculePlaces" >= 1)
  );

ALTER TABLE "piece_conducteur"
  ADD CONSTRAINT "piece_conducteur_verifiee_par_fkey" FOREIGN KEY ("verifieePar") REFERENCES "personne"("id"),
  ADD CONSTRAINT "piece_conducteur_type_connu" CHECK ("type" IN ('identite', 'permis', 'carte_grise', 'voiture')),
  ADD CONSTRAINT "piece_conducteur_statut_connu" CHECK ("statut" IN ('a_verifier', 'validee', 'refusee'));

-- Versements : un seul par réservation (index unique de la table), jamais de montant négatif.
ALTER TABLE "versement_covoiturage"
  ADD CONSTRAINT "versement_covoiturage_reservation_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservation_covoiturage"("id"),
  ADD CONSTRAINT "versement_covoiturage_conducteur_fkey" FOREIGN KEY ("conducteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "versement_covoiturage_motif_connu" CHECK (
    "motif" IN ('confirmation_passager', 'delai_depasse', 'annulation_tardive')
  ),
  ADD CONSTRAINT "versement_covoiturage_statut_connu" CHECK ("statut" IN ('a_faire', 'fait', 'echoue')),
  ADD CONSTRAINT "versement_covoiturage_quantites" CHECK ("montant" >= 0 AND "tentatives" >= 0);

-- Demandes de passagers
ALTER TABLE "demande_covoiturage"
  ADD CONSTRAINT "demande_covoiturage_passager_fkey" FOREIGN KEY ("passagerId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "demande_covoiturage_statut_connu" CHECK ("statut" IN ('ouverte', 'annulee', 'satisfaite', 'expiree')),
  ADD CONSTRAINT "demande_covoiturage_moment_connu" CHECK (
    "moment" IS NULL OR "moment" IN ('matin', 'apres_midi', 'soir')
  ),
  ADD CONSTRAINT "demande_covoiturage_places" CHECK ("places" >= 1);

ALTER TABLE "proposition_covoiturage"
  ADD CONSTRAINT "proposition_covoiturage_conducteur_fkey" FOREIGN KEY ("conducteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "proposition_covoiturage_trajet_fkey" FOREIGN KEY ("trajetId") REFERENCES "trajet_covoiturage"("id");

-- Notes : une par rôle et par réservation (index unique de la table), de 1 à 5.
ALTER TABLE "note_covoiturage"
  ADD CONSTRAINT "note_covoiturage_reservation_fkey" FOREIGN KEY ("reservationId") REFERENCES "reservation_covoiturage"("id"),
  ADD CONSTRAINT "note_covoiturage_note_fkey" FOREIGN KEY ("noteId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "note_covoiturage_auteur_fkey" FOREIGN KEY ("auteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "note_covoiturage_role_connu" CHECK ("roleNote" IN ('conducteur', 'passager')),
  ADD CONSTRAINT "note_covoiturage_valeur" CHECK ("valeur" BETWEEN 1 AND 5);

-- Trajet régulier d'un passager en ville
ALTER TABLE "trajet_regulier_passager"
  ADD CONSTRAINT "trajet_regulier_passager_voyageur_fkey" FOREIGN KEY ("voyageurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "trajet_regulier_passager_heure" CHECK ("departA" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');

-- Conseils de prix : un par couple de villes (rangées dans l'ordre alphabétique, sens indifférent).
ALTER TABLE "conseil_covoiturage"
  ADD CONSTRAINT "conseil_covoiturage_ordre" CHECK ("villeANorm" < "villeBNorm"),
  ADD CONSTRAINT "conseil_covoiturage_fourchette" CHECK (
    "prixMin" >= 0 AND "prixMin" <= "prixMax" AND "dureeMinutes" >= 1
  );

-- Douala ↔ Kribi : prix conseillé de 3 500 à 4 500 F, 2 h 30 (planche « Covoit »). Les autres trajets
-- n'ont pas de conseil : le module applique son plafond général.
INSERT INTO "conseil_covoiturage" ("villeANorm", "villeBNorm", "villeA", "villeB", "prixMin", "prixMax", "dureeMinutes")
  VALUES ('douala', 'kribi', 'Douala', 'Kribi', 3500, 4500, 150)
  ON CONFLICT DO NOTHING;
