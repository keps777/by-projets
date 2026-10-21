-- Lot De : garde-fous de l'administration, écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- ------------------------------------------------------------------ horaires de ligne

ALTER TABLE "horaire_ligne"
  ADD CONSTRAINT "horaire_ligne_ligne_fkey" FOREIGN KEY ("ligneId") REFERENCES "ligne"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "horaire_ligne_heure_forme" CHECK ("heure" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "horaire_ligne_jours_connus" CHECK ("jours" <@ ARRAY['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']::text[]);

-- Un seul horaire actif par ligne et par heure : le numéro d'un départ (AGENCE-LIGNE-AAMMJJ-HHMM) n'a pas de
-- classe, deux départs de la même ligne à la même minute ne peuvent donc pas coexister.
CREATE UNIQUE INDEX "horaire_ligne_actif_unique" ON "horaire_ligne"("ligneId", "heure") WHERE "actif";

-- ------------------------------------------------------------------ plan et options d'une ligne

ALTER TABLE "reglage_ligne"
  ADD CONSTRAINT "reglage_ligne_ligne_fkey" FOREIGN KEY ("ligneId") REFERENCES "ligne"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "reglage_ligne_plan" CHECK ("capacite" > 0 AND "rangees" > 0 AND "disposition" ~ '^[0-9](\+[0-9])+$'),
  ADD CONSTRAINT "reglage_ligne_brouillon" CHECK (("brouillon" IS NULL) = ("effetDu" IS NULL)),
  ADD CONSTRAINT "reglage_ligne_effet_forme" CHECK ("effetDu" IS NULL OR "effetDu" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$');

-- ------------------------------------------------------------------ enrôlement des appareils

ALTER TABLE "enrolement_appareil"
  ADD CONSTRAINT "enrolement_appareil_appareil_fkey" FOREIGN KEY ("appareilId") REFERENCES "appareil_sync"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "enrolement_appareil_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "enrolement_appareil_gare_fkey" FOREIGN KEY ("gareId") REFERENCES "gare"("id"),
  ADD CONSTRAINT "enrolement_appareil_code_et_echeance" CHECK (("codeHache" IS NULL) = ("codeExpireA" IS NULL));

-- Un code d'enrôlement n'ouvre qu'un appareil.
CREATE UNIQUE INDEX "enrolement_appareil_code_unique" ON "enrolement_appareil"("codeHache") WHERE "codeHache" IS NOT NULL;

-- ------------------------------------------------------------------ ordres envoyés aux appareils

ALTER TABLE "commande_appareil"
  ADD CONSTRAINT "commande_appareil_appareil_fkey" FOREIGN KEY ("appareilId") REFERENCES "appareil_sync"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "commande_appareil_type" CHECK ("type" IN ('effacer')),
  ADD CONSTRAINT "commande_appareil_rapport" CHECK (("acquitteeA" IS NULL) = ("rapport" IS NULL));

-- Un seul ordre en attente par appareil et par type : deux « effacer » simultanés n'en font qu'un.
CREATE UNIQUE INDEX "commande_appareil_en_attente" ON "commande_appareil"("appareilId", "type") WHERE "acquitteeA" IS NULL;

-- L'accusé d'un ordre ne s'écrit qu'une fois, et un ordre ne change plus rien d'autre que son accusé.
CREATE FUNCTION commande_appareil_accuse_unique() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'commande_appareil : suppression interdite' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."acquitteeA" IS NOT NULL THEN
    RAISE EXCEPTION 'commande_appareil : ordre déjà acquitté' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'acquitteeA' - 'rapport') <> (to_jsonb(OLD) - 'acquitteeA' - 'rapport') THEN
    RAISE EXCEPTION 'commande_appareil : seul l''accusé s''écrit' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "commande_appareil_accuse_unique"
  BEFORE UPDATE OR DELETE ON "commande_appareil"
  FOR EACH ROW EXECUTE FUNCTION commande_appareil_accuse_unique();
