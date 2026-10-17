-- SMS · nouveau type `code_connexion` (code du voyageur au format WebOTP, étape 3 de l'intégration).
-- Additif : la liste fermée des types accepte une valeur de plus, rien n'est ôté ni renommé.
ALTER TABLE "sms_message" DROP CONSTRAINT "sms_message_type_connu";
ALTER TABLE "sms_message"
  ADD CONSTRAINT "sms_message_type_connu" CHECK (
    "type" IN (
      'billet', 'code_retrait', 'alerte_proche', 'retard', 'pin_provisoire', 'code_connexion', 'systeme'
    )
  );
