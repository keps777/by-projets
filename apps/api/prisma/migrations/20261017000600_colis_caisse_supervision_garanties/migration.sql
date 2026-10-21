-- Colis, caisse et supervision : adaptateurs PostgreSQL (étape 2b de l'intégration).
-- Additif : n'ôte ni ne renomme rien. Trois choses :
--   1. la table des alertes du patron et la tolérance d'écart de caisse par compagnie ;
--   2. le choix entre les colonnes en double de `session_caisse` (reprise des données comprise) ;
--   3. les garde-fous SQL de ces modules : essais du code de retrait, cohérence des sessions.

-- ------------------------------------------------------------------ alertes du patron, tolérance

-- AlterTable
ALTER TABLE "compagnie" ADD COLUMN     "toleranceEcartCaisse" INTEGER;

-- CreateTable
CREATE TABLE "alerte_patron" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "compagnieId" UUID,
    "gareId" UUID,
    "message" TEXT NOT NULL,
    "details" JSONB NOT NULL DEFAULT '{}',
    "creeA" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "alerte_patron_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "alerte_patron_compagnieId_creeA_idx" ON "alerte_patron"("compagnieId", "creeA");

-- CreateIndex
CREATE INDEX "alerte_patron_gareId_creeA_idx" ON "alerte_patron"("gareId", "creeA");

-- AddForeignKey
ALTER TABLE "alerte_patron" ADD CONSTRAINT "alerte_patron_compagnieId_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerte_patron" ADD CONSTRAINT "alerte_patron_gareId_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "alerte_patron"
  ADD CONSTRAINT "alerte_patron_type_connu" CHECK (
    "type" IN ('cloture_automatique', 'pin_bloque', 'compte_desactive', 'ecart_hors_tolerance')
  );
ALTER TABLE "compagnie"
  ADD CONSTRAINT "compagnie_tolerance_ecart_positive" CHECK ("toleranceEcartCaisse" IS NULL OR "toleranceEcartCaisse" >= 0);

-- ------------------------------------------------------------------ session_caisse : colonnes en double
--
-- La migration « modules_metier » avait ajouté des colonnes JSON (cloture, validation, refus…) à côté
-- des colonnes d'origine (clotureeA, cashCompte, cashAttendu, ecart, clotureeAuto, valideeA,
-- valideeParId, historique). Décision :
--   - FONT FOI : `cloture` et `validation` (JSON), qui portent tout le détail (décompte, divergence de
--     l'appareil, identifiant de l'événement, commentaire du superviseur) ;
--   - COPIE INTERROGEABLE : clotureeA, cashCompte, cashAttendu, ecart, clotureeAuto, valideeA,
--     valideeParId. L'adaptateur les écrit dans la même instruction que le JSON et les CHECK
--     `session_cloture_copie` et `session_validation_copie` refusent qu'elles divergent ;
--   - ABANDONNÉE : `historique` (le journal signé de l'agence est l'historique). Elle reste, à `[]`.

-- Reprise des sessions déjà clôturées ou validées sous l'ancien format : le JSON est reconstruit
-- depuis les colonnes d'origine (il n'y avait ni décompte ni identifiant d'événement : zéros et
-- identifiant tiré au hasard), et les copies sont complétées.
UPDATE "session_caisse" AS s
SET "clotureeA" = COALESCE(s."clotureeA", s."ouverteA"),
    "cashCompte" = COALESCE(s."cashCompte", 0),
    "cashAttendu" = COALESCE(s."cashAttendu", s."fondDeCaisse"),
    "ecart" = COALESCE(s."ecart", COALESCE(s."cashCompte", 0) - COALESCE(s."cashAttendu", s."fondDeCaisse")),
    "clotureeAuto" = COALESCE(s."clotureeAuto", false),
    "cloture" = jsonb_build_object(
      'at', to_char((COALESCE(s."clotureeA", s."ouverteA") AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+01:00',
      'auto', COALESCE(s."clotureeAuto", false),
      'cashCompte', COALESCE(s."cashCompte", 0),
      'cashAttendu', COALESCE(s."cashAttendu", s."fondDeCaisse"),
      'ecart', COALESCE(s."ecart", COALESCE(s."cashCompte", 0) - COALESCE(s."cashAttendu", s."fondDeCaisse")),
      'divergenceAppareil', 0,
      'comptageAbsent', false,
      'decompte', jsonb_build_object(
        'billetsCash', jsonb_build_object('nombre', 0, 'montant', 0),
        'colisCash', jsonb_build_object('nombre', 0, 'montant', 0),
        'annulationsValidees', jsonb_build_object('nombre', 0, 'montant', 0),
        'momo', jsonb_build_object('ventes', 0, 'montant', 0)
      ),
      'evenementId', gen_random_uuid()
    )
WHERE s."cloture" IS NULL AND s."etat" IN ('cloturee', 'validee');

UPDATE "session_caisse" AS s
SET "validation" = jsonb_build_object(
      'at', to_char((COALESCE(s."valideeA", s."clotureeA", s."ouverteA") AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM-DD"T"HH24:MI:SS.MS') || '+01:00',
      'superviseurId', s."valideeParId"::text,
      'superviseurNom', COALESCE(p."nom", ''),
      'ecart', COALESCE(s."ecart", 0),
      'commentaire', NULL,
      'evenementId', gen_random_uuid()
    ),
    "valideeA" = COALESCE(s."valideeA", s."clotureeA", s."ouverteA")
FROM "personne" AS p
WHERE p."id" = s."valideeParId" AND s."validation" IS NULL AND s."etat" = 'validee';

-- Une session ouverte (ou rouverte après un refus) n'a ni clôture ni validation : les copies non plus.
-- Une session clôturée a sa clôture et pas de validation ; une session validée a les deux.
-- NOT VALID : les lignes antérieures à cette migration ne sont pas revérifiées (elles viennent d'être
-- reprises ci-dessus), toute écriture à venir l'est.
ALTER TABLE "session_caisse"
  ADD CONSTRAINT "session_etat_cloture" CHECK (("etat" = 'ouverte') = ("cloture" IS NULL)) NOT VALID,
  ADD CONSTRAINT "session_etat_validation" CHECK (("etat" = 'validee') = ("validation" IS NOT NULL)) NOT VALID,
  ADD CONSTRAINT "session_cloture_copie" CHECK (
    CASE WHEN "cloture" IS NULL
      THEN "clotureeA" IS NULL AND "cashCompte" IS NULL AND "cashAttendu" IS NULL
           AND "ecart" IS NULL AND "clotureeAuto" IS NULL
      ELSE "clotureeA" IS NOT DISTINCT FROM ("cloture" ->> 'at')::timestamptz
           AND "cashCompte" IS NOT DISTINCT FROM ("cloture" ->> 'cashCompte')::int
           AND "cashAttendu" IS NOT DISTINCT FROM ("cloture" ->> 'cashAttendu')::int
           AND "ecart" IS NOT DISTINCT FROM ("cloture" ->> 'ecart')::int
           AND "clotureeAuto" IS NOT DISTINCT FROM ("cloture" ->> 'auto')::boolean
           AND "cashCompte" IS NOT NULL
    END
  ) NOT VALID,
  ADD CONSTRAINT "session_validation_copie" CHECK (
    CASE WHEN "validation" IS NULL
      THEN "valideeA" IS NULL AND "valideeParId" IS NULL
      ELSE "valideeA" IS NOT DISTINCT FROM ("validation" ->> 'at')::timestamptz
           AND "valideeParId" IS NOT DISTINCT FROM ("validation" ->> 'superviseurId')::uuid
           AND "valideeParId" IS NOT NULL
    END
  ) NOT VALID;

-- ------------------------------------------------------------------ colis : essais du code de retrait

-- Trois essais faux bloquent le colis (ESSAIS_CODE_MAX, colis/regles.ts) : la base refuse un colis qui
-- aurait trois essais sans être bloqué, ou plus de trois essais. NOT VALID : les lignes déjà présentes
-- ne sont pas revérifiées (aucune donnée existante n'est refusée), toute écriture à venir l'est.
ALTER TABLE "colis"
  ADD CONSTRAINT "colis_code_bloque_apres_trois_essais" CHECK ("codeEssais" < 3 OR "codeBloque") NOT VALID,
  ADD CONSTRAINT "colis_code_essais_max" CHECK ("codeEssais" <= 3) NOT VALID;
