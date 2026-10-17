-- SMS · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Les valeurs fermées du vocabulaire de la passerelle (apps/api/src/sms/types.ts).
ALTER TABLE "sms_message"
  ADD CONSTRAINT "sms_message_type_connu" CHECK (
    "type" IN ('billet', 'code_retrait', 'alerte_proche', 'retard', 'pin_provisoire', 'systeme')
  ),
  ADD CONSTRAINT "sms_message_statut_connu" CHECK (
    "statut" IN ('en_file', 'en_reprise', 'envoye', 'livre', 'non_livre', 'echec', 'expire', 'annule')
  ),
  ADD CONSTRAINT "sms_message_encodage_connu" CHECK ("encodage" IN ('gsm7', 'ucs2')),
  ADD CONSTRAINT "sms_message_segments" CHECK ("segments" BETWEEN 1 AND 3),
  ADD CONSTRAINT "sms_message_montants" CHECK (
    "coutFcfa" >= 0 AND "coutEstimeFcfa" >= 0 AND "tentatives" >= 0 AND "caracteres" >= 0
  ),
  ADD CONSTRAINT "sms_message_reference_complete" CHECK (("referenceType" IS NULL) = ("referenceId" IS NULL));

-- Un identifiant donné par un fournisseur n'appartient qu'à un message : un accusé retrouve toujours
-- le même message.
CREATE UNIQUE INDEX "sms_message_fournisseur_identifiant"
  ON "sms_message" ("fournisseur", "idFournisseur") WHERE "idFournisseur" IS NOT NULL;

ALTER TABLE "sms_essai"
  ADD CONSTRAINT "sms_essai_resultat_connu" CHECK ("resultat" IN ('accepte', 'temporaire', 'definitif')),
  ADD CONSTRAINT "sms_essai_numero" CHECK ("numero" >= 1 AND "dureeMs" >= 0);

-- Les essais sont une trace : on les ajoute, on ne les réécrit pas (même mécanisme que le reste).
CREATE TRIGGER sms_essai_ajout_seul
  BEFORE UPDATE OR DELETE ON "sms_essai"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER sms_essai_pas_de_vidage
  BEFORE TRUNCATE ON "sms_essai"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();
