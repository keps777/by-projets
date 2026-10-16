-- AM-017 · Garde-fous écrits en SQL (Prisma ne sait pas les exprimer).
-- Additif : ne modifie aucune table de la migration « initial ».

-- ------------------------------------------------------------------ ajout seul

CREATE FUNCTION interdire_modification() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Table "%" en ajout seul : % interdit', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

-- Journal d'événements métier et journal d'audit : on ajoute, on ne modifie ni n'efface jamais.
CREATE TRIGGER evenement_ajout_seul
  BEFORE UPDATE OR DELETE ON "evenement"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER evenement_pas_de_vidage
  BEFORE TRUNCATE ON "evenement"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

CREATE TRIGGER journal_audit_ajout_seul
  BEFORE UPDATE OR DELETE ON "journal_audit"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER journal_audit_pas_de_vidage
  BEFORE TRUNCATE ON "journal_audit"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- Rien ne s'efface : un billet ou un colis annulé garde sa ligne et son numéro.
CREATE TRIGGER billet_jamais_efface
  BEFORE DELETE ON "billet"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER colis_jamais_efface
  BEFORE DELETE ON "colis"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();

CREATE FUNCTION interdire_changement_numero() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."numero" IS DISTINCT FROM OLD."numero" THEN
    RAISE EXCEPTION 'Le numéro d''un document ne change jamais (table "%")', TG_TABLE_NAME
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER billet_numero_fige
  BEFORE UPDATE ON "billet"
  FOR EACH ROW EXECUTE FUNCTION interdire_changement_numero();
CREATE TRIGGER colis_numero_fige
  BEFORE UPDATE ON "colis"
  FOR EACH ROW EXECUTE FUNCTION interdire_changement_numero();

-- ------------------------------------------------------------------ rôles stricts

-- Une personne a au moins un rôle.
ALTER TABLE "personne"
  ADD CONSTRAINT "personne_roles_non_vides" CHECK (cardinality("roles") > 0);

-- AfriMove ne vend jamais : le rôle « afrimove » ne se cumule avec aucun rôle qui vend ou achète
-- (voyageur, guichetier, convoyeur, vendeur).
ALTER TABLE "personne"
  ADD CONSTRAINT "personne_afrimove_ne_vend_jamais" CHECK (
    NOT ('afrimove' = ANY ("roles"))
    OR NOT ("roles" && ARRAY['voyageur', 'guichetier', 'convoyeur', 'vendeur']::"role"[])
  );

-- ------------------------------------------------------------------ cohérence des montants

ALTER TABLE "billet"
  ADD CONSTRAINT "billet_prix_positif" CHECK ("prix" >= 0),
  ADD CONSTRAINT "billet_siege_positif" CHECK ("siege" IS NULL OR "siege" > 0);
ALTER TABLE "colis"
  ADD CONSTRAINT "colis_montants_positifs" CHECK ("prixTotal" >= 0 AND "valeurDeclaree" >= 0);
ALTER TABLE "session_caisse"
  ADD CONSTRAINT "session_fond_positif" CHECK ("fondDeCaisse" >= 0);
ALTER TABLE "ligne"
  ADD CONSTRAINT "ligne_tarifs_positifs" CHECK ("tarifClassique" >= 0 AND "tarifVip" >= 0 AND "tarifBagage" >= 0);
