-- Modules métier · garde-fous écrits en SQL (Prisma ne sait pas les exprimer).
-- Additif : ne modifie aucune table de la migration « modules_metier » ni des migrations précédentes.
-- Chaque garantie métier tient ici EN BASE, pas seulement dans le code : si deux requêtes se croisent
-- ou si un bug passe entre les mailles, la base refuse.

CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ------------------------------------------------------------------ ajout seul
-- Même mécanisme que le journal d'événements du socle (fonction `interdire_modification`, migration
-- « ajout_seul_et_contraintes ») : ni UPDATE, ni DELETE, ni TRUNCATE.

-- Journal des événements reçus des appareils.
CREATE TRIGGER journal_evenement_ajout_seul
  BEFORE UPDATE OR DELETE ON "journal_evenement"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER journal_evenement_pas_de_vidage
  BEFORE TRUNCATE ON "journal_evenement"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Gestes sur les sièges (rejoués par heure du geste : on n'en réécrit aucun).
CREATE TRIGGER siege_operation_ajout_seul
  BEFORE UPDATE OR DELETE ON "siege_operation"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER siege_operation_pas_de_vidage
  BEFORE TRUNCATE ON "siege_operation"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Registre des numéros : un numéro pris le reste, même si le billet est annulé.
CREATE TRIGGER numero_vu_ajout_seul
  BEFORE UPDATE OR DELETE ON "numero_vu"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER numero_vu_pas_de_vidage
  BEFORE TRUNCATE ON "numero_vu"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Scans au quai.
CREATE TRIGGER scan_quai_ajout_seul
  BEFORE UPDATE OR DELETE ON "scan_quai"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER scan_quai_pas_de_vidage
  BEFORE TRUNCATE ON "scan_quai"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Réponses mémorisées de la billetterie.
CREATE TRIGGER evenement_traite_ajout_seul
  BEFORE UPDATE OR DELETE ON "evenement_traite"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER evenement_traite_pas_de_vidage
  BEFORE TRUNCATE ON "evenement_traite"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Annulations remboursées en cash (retranchées du cash attendu).
CREATE TRIGGER annulation_caisse_ajout_seul
  BEFORE UPDATE OR DELETE ON "annulation_caisse"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER annulation_caisse_pas_de_vidage
  BEFORE TRUNCATE ON "annulation_caisse"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Journal signé de l'agence.
CREATE TRIGGER journal_agence_ajout_seul
  BEFORE UPDATE OR DELETE ON "journal_agence"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER journal_agence_pas_de_vidage
  BEFORE TRUNCATE ON "journal_agence"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();
-- La chaîne d'empreintes ne se ramifie pas : une seule entrée suit une entrée donnée (NULL = la
-- première de la chaîne, donc NULL non distincts). Complète le verrou pris à l'écriture.
DROP INDEX "journal_agence_chaine_precedente_key";
CREATE UNIQUE INDEX "journal_agence_chaine_precedente_key"
  ON "journal_agence" ("chaine", "precedente") NULLS NOT DISTINCT;

-- ------------------------------------------------------------------ numérotation

-- « Un numéro n'est jamais attribué deux fois » : le numéro est dans le registre une fois par
-- (portée, jour, genre, numéro) — c'est la clé primaire de `numero_vu`.
ALTER TABLE "numero_vu"
  ADD CONSTRAINT "numero_vu_genre_connu" CHECK ("genre" IN ('billet', 'colis')),
  ADD CONSTRAINT "numero_vu_numero_imprimable" CHECK ("numero" BETWEEN 1 AND 9999),
  ADD CONSTRAINT "numero_vu_jour_aammjj" CHECK ("jour" ~ '^[0-9]{6}$');
-- Un numéro du serveur est idempotent par référence (billet ou colis) : le réessai rend le même.
CREATE UNIQUE INDEX "numero_vu_reference_serveur"
  ON "numero_vu" ("portee", "jour", "genre", "evenementId")
  WHERE "appareilId" = 'serveur-en-ligne';

ALTER TABLE "plage_attribuee"
  ADD CONSTRAINT "plage_attribuee_genre_connu" CHECK ("genre" IN ('guichet', 'convoyeur')),
  ADD CONSTRAINT "plage_attribuee_debut" CHECK ("plageDebut" BETWEEN 1 AND 9999),
  -- Aucun appareil n'a de numéro au-delà de 4000 : la suite est réservée au serveur (ventes en ligne).
  ADD CONSTRAINT "plage_attribuee_fin" CHECK ("plageFin" BETWEEN "plageDebut" AND 4000),
  ADD CONSTRAINT "plage_attribuee_rang" CHECK ("rang" IS NULL OR "rang" >= 1),
  ADD CONSTRAINT "plage_attribuee_liberation" CHECK ("libereeA" IS NULL OR "libereeA" >= "attribueeA");
-- Une seule attribution en cours par appareil (un appareil remplacé garde sa ligne, libérée).
CREATE UNIQUE INDEX "plage_attribuee_appareil_en_cours"
  ON "plage_attribuee" ("appareilId") WHERE "libereeA" IS NULL;
-- Les plages en cours d'une même portée (la gare) ne se recouvrent jamais.
ALTER TABLE "plage_attribuee"
  ADD CONSTRAINT "plage_attribuee_sans_chevauchement"
  EXCLUDE USING gist ("portee" WITH =, int4range("plageDebut", "plageFin", '[]') WITH &&)
  WHERE ("libereeA" IS NULL);

-- ------------------------------------------------------------------ synchronisation

ALTER TABLE "appareil_sync"
  ADD CONSTRAINT "appareil_sync_genre_connu" CHECK ("genre" IN ('guichet', 'convoyeur', 'autre')),
  ADD CONSTRAINT "appareil_sync_rang" CHECK ("rang" IS NULL OR "rang" >= 1),
  ADD CONSTRAINT "appareil_sync_plage" CHECK (
    ("plageDebut" IS NULL) = ("plageFin" IS NULL)
    AND ("plageDebut" IS NULL OR ("plageDebut" >= 1 AND "plageFin" >= "plageDebut" AND "plageFin" <= 9999))
  );

ALTER TABLE "journal_evenement"
  ADD CONSTRAINT "journal_evenement_origine_connue" CHECK ("origine" IN ('appareil', 'serveur')),
  ADD CONSTRAINT "journal_evenement_numero" CHECK ("numeroPlage" IS NULL OR "numeroPlage" BETWEEN 1 AND 9999);

ALTER TABLE "siege_operation"
  ADD CONSTRAINT "siege_operation_kind_connu" CHECK ("kind" IN ('prend', 'libere')),
  ADD CONSTRAINT "siege_operation_siege" CHECK ("siege" > 0);
ALTER TABLE "alerte_sync"
  ADD CONSTRAINT "alerte_sync_gravite_connue" CHECK ("gravite" IN ('alerte', 'info'));

-- ------------------------------------------------------------------ billetterie

ALTER TABLE "ligne" ADD CONSTRAINT "ligne_duree_positive" CHECK ("dureeMinutes" >= 0);
ALTER TABLE "bus" ADD CONSTRAINT "bus_soute_positive" CHECK ("capaciteSoute" >= 0);
ALTER TABLE "depart"
  ADD CONSTRAINT "depart_quai_positif" CHECK ("quai" IS NULL OR "quai" > 0),
  ADD CONSTRAINT "depart_version_plan" CHECK ("versionPlan" >= 0);

-- Un siège ne se vend pas deux fois : la clé primaire (departId, siege) de `siege_depart` en est la
-- garantie (une ligne par siège occupé ou retenu).
ALTER TABLE "siege_depart"
  ADD CONSTRAINT "siege_depart_siege_positif" CHECK ("siege" > 0),
  -- occupé OU retenu, jamais les deux ; une ligne existe seulement si le siège est l'un des deux.
  ADD CONSTRAINT "siege_depart_occupe_ou_retenu" CHECK (("billetId" IS NULL) <> ("bloquePar" IS NULL)),
  ADD CONSTRAINT "siege_depart_retenue_complete" CHECK (("bloquePar" IS NULL) = ("bloqueJusqua" IS NULL)),
  ADD CONSTRAINT "siege_depart_commande_retenue" CHECK ("commandeId" IS NULL OR "bloquePar" IS NOT NULL);

-- Filet côté billet : jamais deux billets vivants sur le même siège d'un même départ, ni deux
-- billets non annulés avec le même code à 4 chiffres dans un départ.
CREATE UNIQUE INDEX "billet_siege_vivant_unique"
  ON "billet" ("departId", "siege")
  WHERE "siege" IS NOT NULL AND "etat" IN ('reserve', 'paye', 'embarque', 'voyage');
CREATE UNIQUE INDEX "billet_code_unique_par_depart"
  ON "billet" ("departId", "codeBillet") WHERE "etat" <> 'annule';
ALTER TABLE "billet" ADD CONSTRAINT "billet_bagage_positif" CHECK ("bagage" >= 0);

ALTER TABLE "commande"
  ADD CONSTRAINT "commande_type_connu" CHECK ("type" IN ('billet', 'groupe', 'proche', 'covoiturage')),
  ADD CONSTRAINT "commande_statut_connu" CHECK ("statut" IN ('en_attente_paiement', 'payee', 'expiree', 'annulee')),
  ADD CONSTRAINT "commande_total_positif" CHECK ("total" >= 0),
  ADD CONSTRAINT "commande_expiration" CHECK ("expireA" >= "creeA");

ALTER TABLE "scan_quai"
  ADD CONSTRAINT "scan_quai_resultat_connu" CHECK (
    "resultat" IN ('monte', 'deja_scanne', 'introuvable', 'autre_depart', 'annule', 'sans_nom')
  ),
  ADD CONSTRAINT "scan_quai_bagages" CHECK ("bagagesSoute" >= 0);

-- ------------------------------------------------------------------ colis

ALTER TABLE "colis"
  ADD CONSTRAINT "colis_version_positive" CHECK ("version" >= 1),
  ADD CONSTRAINT "colis_montants_complementaires" CHECK (
    "valeurAssuree" >= 0 AND "port" >= 0 AND "complementPoids" >= 0 AND "codeEssais" >= 0
  ),
  ADD CONSTRAINT "colis_paiement_etat_connu" CHECK ("paiementEtat" IS NULL OR "paiementEtat" IN ('paye', 'en_attente')),
  ADD CONSTRAINT "colis_code_sms_connu" CHECK ("codeSms" IN ('envoye', 'au_retour_du_reseau'));
-- Tâches de fond : colis dont l'assurance est à rejouer, colis dont le code n'est pas parti.
CREATE INDEX "colis_assurance_en_attente" ON "colis" ("id") WHERE "assuranceEnAttente";
CREATE INDEX "colis_code_au_retour_du_reseau" ON "colis" ("id") WHERE "codeSms" = 'au_retour_du_reseau';

ALTER TABLE "photo_colis"
  ADD CONSTRAINT "photo_colis_genre_connu" CHECK ("genre" IN ('envoi', 'depot', 'remise')),
  ADD CONSTRAINT "photo_colis_expiration" CHECK ("expireA" >= "priseA");
-- Suppression à 90 jours : on ne parcourt que les photos encore présentes.
CREATE INDEX "photo_colis_a_supprimer" ON "photo_colis" ("expireA") WHERE "supprimeeA" IS NULL;

ALTER TABLE "reclamation_colis"
  ADD CONSTRAINT "reclamation_colis_statut_connu" CHECK ("statut" IN ('ouverte', 'acceptee', 'refusee')),
  -- Une réclamation ouverte n'a pas de décision ; une réclamation tranchée en a une.
  ADD CONSTRAINT "reclamation_colis_decision" CHECK (("statut" = 'ouverte') = ("decision" IS NULL));

-- ------------------------------------------------------------------ caisse et supervision

-- Une seule caisse ouverte par agent et par guichet : c'est ce qui rend l'ouverture atomique.
CREATE UNIQUE INDEX "session_caisse_une_ouverte_par_agent"
  ON "session_caisse" ("agentId") WHERE "etat" = 'ouverte';
CREATE UNIQUE INDEX "session_caisse_une_ouverte_par_guichet"
  ON "session_caisse" ("guichetId") WHERE "etat" = 'ouverte';
ALTER TABLE "session_caisse"
  ADD CONSTRAINT "session_tolerance_positive" CHECK ("tolerance" >= 0),
  ADD CONSTRAINT "session_cash_positif" CHECK ("cashCompte" IS NULL OR "cashCompte" >= 0);

ALTER TABLE "annulation_caisse" ADD CONSTRAINT "annulation_caisse_montant" CHECK ("montant" >= 0);

ALTER TABLE "evenement_agence_traite"
  ADD CONSTRAINT "evenement_agence_traite_etat_connu" CHECK ("etat" IN ('en_cours', 'termine'));

ALTER TABLE "demande_annulation"
  ADD CONSTRAINT "demande_annulation_statut_connu" CHECK ("statut" IN ('en_attente', 'decidee')),
  ADD CONSTRAINT "demande_annulation_decision_connue" CHECK (
    "decision" IS NULL OR "decision" IN ('rembourser', 'reporter', 'avoir', 'refuser')
  ),
  ADD CONSTRAINT "demande_annulation_montant" CHECK ("montant" IS NULL OR "montant" >= 0),
  -- Une demande décidée porte sa décision, son auteur et son heure ; une demande en attente aucune.
  ADD CONSTRAINT "demande_annulation_coherence" CHECK (
    ("statut" = 'decidee') = ("decision" IS NOT NULL AND "decideeA" IS NOT NULL AND "decideeParId" IS NOT NULL)
  );
-- Une seule demande en attente par billet.
CREATE UNIQUE INDEX "demande_annulation_une_en_attente_par_billet"
  ON "demande_annulation" ("billetId") WHERE "statut" = 'en_attente';

-- ------------------------------------------------------------------ modules

-- Les 12 modules du catalogue (apps/api/src/modules/catalogue.ts). NOT VALID : les lignes déjà
-- présentes ne sont pas revérifiées (aucune donnée existante n'est refusée), les nouvelles le sont.
ALTER TABLE "module_compagnie"
  ADD CONSTRAINT "module_compagnie_code_connu" CHECK ("code" IN (
    'guichet_caisse', 'colis', 'quai_bus', 'supervision', 'voyageur', 'ussd', 'relais',
    'livraison_moto', 'inter_agences', 'covoit_vendeurs', 'financement', 'fidelite'
  )) NOT VALID;
ALTER TABLE "module_exception"
  ADD CONSTRAINT "module_exception_code_connu" CHECK ("code" IN (
    'guichet_caisse', 'colis', 'quai_bus', 'supervision', 'voyageur', 'ussd', 'relais',
    'livraison_moto', 'inter_agences', 'covoit_vendeurs', 'financement', 'fidelite'
  )),
  ADD CONSTRAINT "module_exception_portee_connue" CHECK ("porteeType" IN ('gare', 'ville')),
  -- Une exception de gare nomme une gare ; une exception de ville nomme une ville.
  ADD CONSTRAINT "module_exception_portee_coherente" CHECK (
    ("porteeType" = 'gare' AND "gareId" IS NOT NULL AND "villeCle" IS NULL AND "villeNom" IS NULL)
    OR ("porteeType" = 'ville' AND "gareId" IS NULL AND "villeCle" IS NOT NULL AND "villeNom" IS NOT NULL)
  );
