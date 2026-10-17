-- Lot C : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif. Dépend de la fonction
-- `interdire_modification()` de la migration « ajout_seul_et_contraintes ».

-- ------------------------------------------------------------------ comptable : réglages

ALTER TABLE "parametres_comptables"
  ADD CONSTRAINT "parametres_comptables_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "parametres_comptables_jours" CHECK ("jourEnvoi" BETWEEN 1 AND 28 AND "jourCloture" BETWEEN 1 AND 28);

-- ------------------------------------------------------------------ comptable : clôture d'un mois

-- Un mois clôturé ne se rouvre jamais : ni suppression, ni modification, sauf l'accusé de réception du
-- cabinet (`envoiRecuA`, de NULL à une date). Même règle pour les cinq fichiers figés.
ALTER TABLE "cloture_mois"
  ADD CONSTRAINT "cloture_mois_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "cloture_mois_forme" CHECK ("mois" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

CREATE FUNCTION cloture_mois_figee() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND OLD."envoiRecuA" IS NULL
     AND NEW."envoiRecuA" IS NOT NULL
     AND (to_jsonb(NEW) - 'envoiRecuA') = (to_jsonb(OLD) - 'envoiRecuA') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Mois clôturé : % interdit sur "%" (seul l''accusé de réception du cabinet s''écrit)', TG_OP, TG_TABLE_NAME
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER cloture_mois_figee
  BEFORE UPDATE OR DELETE ON "cloture_mois"
  FOR EACH ROW EXECUTE FUNCTION cloture_mois_figee();
CREATE TRIGGER cloture_mois_pas_de_vidage
  BEFORE TRUNCATE ON "cloture_mois"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

ALTER TABLE "export_fichier"
  ADD CONSTRAINT "export_fichier_format_connu" CHECK ("format" IN ('XLSX', 'CSV', 'PDF')),
  ADD CONSTRAINT "export_fichier_id_connu" CHECK ("exportId" IN
    ('journal_ventes', 'journal_caisse', 'annulations', 'ecritures_syscohada', 'factures_afrimove')),
  ADD CONSTRAINT "export_fichier_empreinte" CHECK ("empreinte" ~ '^[0-9a-f]{64}$');
CREATE TRIGGER export_fichier_fige
  BEFORE UPDATE OR DELETE ON "export_fichier"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER export_fichier_pas_de_vidage
  BEFORE TRUNCATE ON "export_fichier"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

ALTER TABLE "apercu_fichier"
  ADD CONSTRAINT "apercu_fichier_format_connu" CHECK ("format" IN ('XLSX', 'CSV', 'PDF')),
  ADD CONSTRAINT "apercu_fichier_id_connu" CHECK ("exportId" IN
    ('journal_ventes', 'journal_caisse', 'annulations', 'ecritures_syscohada', 'factures_afrimove')),
  ADD CONSTRAINT "apercu_fichier_empreinte" CHECK ("empreinte" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "apercu_fichier_mois_forme" CHECK ("mois" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$');

-- ------------------------------------------------------------------ comptable : décisions du rapprochement

-- Le verrou consultatif (espace 7 017 114, clé = agence + mois) sérialise une décision et la clôture de son
-- mois : la clôture prend le verrou exclusif, la décision le verrou partagé. Une décision déjà en cours
-- finit avant que le mois se ferme ; une décision qui arrive après voit le mois clos et est refusée. C'est
-- vrai quel que soit le code qui écrit (adaptateur ou requête à la main).
CREATE FUNCTION verrou_mois_comptable(compagnie uuid, mois text, exclusif boolean) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF exclusif THEN
    PERFORM pg_advisory_xact_lock(7017114, hashtext(compagnie::text || '|' || mois));
  ELSE
    PERFORM pg_advisory_xact_lock_shared(7017114, hashtext(compagnie::text || '|' || mois));
  END IF;
END;
$$;

CREATE FUNCTION cloture_mois_verrou() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM verrou_mois_comptable(NEW."compagnieId", NEW."mois", true);
  RETURN NEW;
END;
$$;
CREATE TRIGGER cloture_mois_verrou
  BEFORE INSERT ON "cloture_mois"
  FOR EACH ROW EXECUTE FUNCTION cloture_mois_verrou();

ALTER TABLE "decision_rapprochement"
  ADD CONSTRAINT "decision_rapprochement_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "decision_rapprochement_mois_forme" CHECK ("mois" ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  ADD CONSTRAINT "decision_rapprochement_action_connue" CHECK ("action" IN ('rembourser', 'rattacher', 'demander')),
  ADD CONSTRAINT "decision_rapprochement_cause_connue" CHECK ("cause" IN
    ('doublon_paiement', 'paiement_apres_expiration', 'scan_depot_manquant', 'inconnue')),
  ADD CONSTRAINT "decision_rapprochement_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "decision_rapprochement_methode_connue" CHECK ("methode" IN ('pin', 'empreinte')),
  ADD CONSTRAINT "decision_rapprochement_execution_connue" CHECK ("execution" IN ('en_attente', 'faite')),
  ADD CONSTRAINT "decision_rapprochement_montant" CHECK ("montant" >= 0),
  -- « rattacher » ne va jamais sans cible ; « faite » ne va jamais sans la référence de l'opération.
  ADD CONSTRAINT "decision_rapprochement_cible" CHECK ("action" <> 'rattacher' OR "cible" IS NOT NULL),
  ADD CONSTRAINT "decision_rapprochement_execution_reference" CHECK ("execution" <> 'faite' OR "referenceExecution" IS NOT NULL);

CREATE FUNCTION decision_rapprochement_garde() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM verrou_mois_comptable(NEW."compagnieId", NEW."mois", false);
    IF EXISTS (SELECT 1 FROM "cloture_mois" WHERE "compagnieId" = NEW."compagnieId" AND "mois" = NEW."mois") THEN
      RAISE EXCEPTION 'MOIS_VERROUILLE : % est clôturé, aucune décision ne s''y écrit', NEW."mois"
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE' THEN
    -- Une décision n'est retirée que tant que son effet n'est pas parti (refus définitif de l'opérateur).
    IF OLD."execution" = 'en_attente' THEN RETURN OLD; END IF;
    RAISE EXCEPTION 'Une décision exécutée ne se retire pas (référence %)', OLD."reference"
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  -- UPDATE : seule l'exécution passe de en_attente à faite ; tout le reste est figé.
  IF OLD."execution" = 'en_attente' AND NEW."execution" = 'faite'
     AND (to_jsonb(NEW) - 'execution' - 'referenceExecution')
       = (to_jsonb(OLD) - 'execution' - 'referenceExecution') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Une décision est définitive (référence %)', OLD."reference"
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
CREATE TRIGGER decision_rapprochement_garde
  BEFORE INSERT OR UPDATE OR DELETE ON "decision_rapprochement"
  FOR EACH ROW EXECUTE FUNCTION decision_rapprochement_garde();
CREATE TRIGGER decision_rapprochement_pas_de_vidage
  BEFORE TRUNCATE ON "decision_rapprochement"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- ------------------------------------------------------------------ comptable : envois, relevés, factures, actions

ALTER TABLE "envoi_cabinet"
  ADD CONSTRAINT "envoi_cabinet_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "envoi_cabinet_nature_connue" CHECK ("nature" IN ('cloture', 'automatique'));

ALTER TABLE "releve_operateur_ligne"
  ADD CONSTRAINT "releve_operateur_ligne_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "releve_operateur_ligne_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "releve_operateur_ligne_montant" CHECK ("montant" > 0);
-- Une ligne de relevé est une preuve : on l'ajoute (import idempotent), on ne la change pas.
CREATE TRIGGER releve_operateur_ligne_ajout_seul
  BEFORE UPDATE OR DELETE ON "releve_operateur_ligne"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER releve_operateur_ligne_pas_de_vidage
  BEFORE TRUNCATE ON "releve_operateur_ligne"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

ALTER TABLE "facture_payee"
  ADD CONSTRAINT "facture_payee_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "facture_payee_jours" CHECK
    ("dimanche" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' AND "payeeLe" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

ALTER TABLE "action_rapprochement_faite"
  ADD CONSTRAINT "action_rapprochement_faite_type_connu" CHECK ("type" IN ('rattacher', 'rembourser', 'reclamer'));
CREATE TRIGGER action_rapprochement_faite_ajout_seul
  BEFORE UPDATE OR DELETE ON "action_rapprochement_faite"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER action_rapprochement_faite_pas_de_vidage
  BEFORE TRUNCATE ON "action_rapprochement_faite"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- ------------------------------------------------------------------ lectures du comptable sur billet et colis

CREATE INDEX "billet_compagnieId_creeA_idx" ON "billet"("compagnieId", "creeA");
CREATE INDEX "billet_paiement_reference_idx" ON "billet"((("paiement" ->> 'reference')))
  WHERE "paiement" IS NOT NULL;
CREATE INDEX "colis_compagnieId_creeA_idx" ON "colis"("compagnieId", "creeA");
CREATE INDEX "colis_paiementReference_idx" ON "colis"("paiementReference")
  WHERE "paiementReference" IS NOT NULL;

-- ------------------------------------------------------------------ analyses : faits d'exploitation

ALTER TABLE "bus_fiche"
  ADD CONSTRAINT "bus_fiche_bus_fkey" FOREIGN KEY ("busId") REFERENCES "bus"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "bus_fiche_chauffeur_fkey" FOREIGN KEY ("chauffeurHabituelId") REFERENCES "personne"("id") ON DELETE SET NULL,
  ADD CONSTRAINT "bus_fiche_annee" CHECK ("annee" >= 0);

ALTER TABLE "depart_observation"
  ADD CONSTRAINT "depart_observation_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "depart_observation_retard" CHECK ("retardMinutes" IS NULL OR "retardMinutes" >= 0);

ALTER TABLE "depart_incident"
  ADD CONSTRAINT "depart_incident_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "depart_incident_nature_connue" CHECK ("nature" IN ('panne', 'autre')),
  ADD CONSTRAINT "depart_incident_duree" CHECK ("dureeMinutes" IS NULL OR "dureeMinutes" >= 0);

ALTER TABLE "depart_depense"
  ADD CONSTRAINT "depart_depense_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "depart_depense_nature_connue" CHECK ("nature" IN ('carburant', 'panne', 'autre')),
  ADD CONSTRAINT "depart_depense_montant" CHECK ("montant" >= 0);

-- ------------------------------------------------------------------ assistant du patron

ALTER TABLE "assistant_echange"
  ADD CONSTRAINT "assistant_echange_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "assistant_echange_utilisateur_fkey" FOREIGN KEY ("utilisateurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "assistant_echange_intention_connue" CHECK ("intention" IN
    ('pourquoi_ligne', 'cout_bus', 'prevision_jour', 'et_si_prix', 'ou_part_argent', 'ambigue', 'inconnue')),
  ADD CONSTRAINT "assistant_echange_redaction_connue" CHECK ("redaction" IN ('regles', 'modele'));
-- Ajout seul : la mémoire de l'assistant ne se réécrit pas.
CREATE TRIGGER assistant_echange_ajout_seul
  BEFORE UPDATE OR DELETE ON "assistant_echange"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER assistant_echange_pas_de_vidage
  BEFORE TRUNCATE ON "assistant_echange"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

ALTER TABLE "assistant_proposition"
  ADD CONSTRAINT "assistant_proposition_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "assistant_proposition_validite" CHECK ("expireLe" > "proposeeLe"),
  -- Appliquée = par qui ET quand, jamais l'un sans l'autre ; le journal et l'effet ne viennent qu'après.
  ADD CONSTRAINT "assistant_proposition_application" CHECK (
    ("appliqueePar" IS NULL) = ("appliqueeA" IS NULL)
    AND ("journalId" IS NULL OR "appliqueePar" IS NOT NULL)
    AND ("effetA" IS NULL OR "appliqueePar" IS NOT NULL)
  );
