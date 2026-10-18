-- Lot Dc : garde-fous du bord écrits en SQL (Prisma ne sait pas les exprimer). Additif. Dépend de la fonction
-- `interdire_modification()` de la migration « ajout_seul_et_contraintes ».

-- ------------------------------------------------------------------ dépenses et incidents du chauffeur (lot C)

ALTER TABLE "depart_depense"
  ADD CONSTRAINT "depart_depense_categorie_connue" CHECK ("categorie" IS NULL OR "categorie" IN ('carburant', 'peage', 'autre'));

ALTER TABLE "depart_incident"
  ADD CONSTRAINT "depart_incident_categorie_connue" CHECK (
    "categorie" IS NULL OR "categorie" IN ('panne', 'accident', 'route_coupee', 'autre')
  ),
  ADD CONSTRAINT "depart_incident_position" CHECK (
    ("latitude" IS NULL) = ("longitude" IS NULL)
    AND ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
  );

-- ------------------------------------------------------------------ ventes en route

ALTER TABLE "vente_en_route"
  ADD CONSTRAINT "vente_en_route_billet_fkey" FOREIGN KEY ("billetId") REFERENCES "billet"("id"),
  ADD CONSTRAINT "vente_en_route_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id"),
  ADD CONSTRAINT "vente_en_route_convoyeur_fkey" FOREIGN KEY ("convoyeurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "vente_en_route_position" CHECK (
    ("latitude" IS NULL) = ("longitude" IS NULL)
    AND ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
  );

-- ------------------------------------------------------------------ passages (scans et arrivées à un arrêt)

ALTER TABLE "passage_route"
  ADD CONSTRAINT "passage_route_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id"),
  ADD CONSTRAINT "passage_route_auteur_fkey" FOREIGN KEY ("auteurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "passage_route_billet_fkey" FOREIGN KEY ("billetId") REFERENCES "billet"("id"),
  ADD CONSTRAINT "passage_route_genre_connu" CHECK ("genre" IN ('scan', 'arrivee')),
  ADD CONSTRAINT "passage_route_forme" CHECK (
    ("genre" = 'scan' AND "billetId" IS NOT NULL AND "resultat" IN ('monte', 'deja_a_bord'))
    OR ("genre" = 'arrivee' AND "billetId" IS NULL AND "resultat" IS NULL)
  ),
  ADD CONSTRAINT "passage_route_position" CHECK (
    ("latitude" IS NULL) = ("longitude" IS NULL)
    AND ("latitude" IS NULL OR ("latitude" BETWEEN -90 AND 90 AND "longitude" BETWEEN -180 AND 180))
  );

-- Ce qui s'est passé à un arrêt ne se réécrit pas.
CREATE TRIGGER passage_route_ajout_seul
  BEFORE UPDATE OR DELETE ON "passage_route"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER passage_route_pas_de_vidage
  BEFORE TRUNCATE ON "passage_route"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

-- ------------------------------------------------------------------ contrôle inopiné

ALTER TABLE "controle_inopine"
  ADD CONSTRAINT "controle_inopine_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id"),
  ADD CONSTRAINT "controle_inopine_controleur_fkey" FOREIGN KEY ("controleurId") REFERENCES "personne"("id"),
  -- Ouvert : aucun compte figé. Clos : les trois comptes sont là et l'écart est `têtes − liste`.
  ADD CONSTRAINT "controle_inopine_comptes" CHECK (
    ("clotureA" IS NULL AND "liste" IS NULL AND "tetes" IS NULL AND "ecart" IS NULL)
    OR ("clotureA" IS NOT NULL AND "liste" >= 0 AND "tetes" >= 0 AND "ecart" = "tetes" - "liste")
  ),
  ADD CONSTRAINT "controle_inopine_envoi" CHECK (NOT "envoyeAuPatron" OR "clotureA" IS NOT NULL);

-- Un contrôleur n'a qu'un contrôle ouvert à la fois : deux ouvertures simultanées n'en créent pas deux.
CREATE UNIQUE INDEX "controle_inopine_un_ouvert_par_controleur"
  ON "controle_inopine"("controleurId") WHERE "clotureA" IS NULL;

-- Un contrôle clos ne se rouvre pas et ne change plus (seul l'envoi au patron peut passer à vrai juste après la
-- clôture, dans le même acte).
CREATE FUNCTION controle_inopine_garde() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Un contrôle inopiné ne se supprime pas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."clotureA" IS NOT NULL
     AND (to_jsonb(NEW) - 'envoyeAuPatron') IS DISTINCT FROM (to_jsonb(OLD) - 'envoyeAuPatron') THEN
    RAISE EXCEPTION 'Contrôle inopiné clos : modification interdite' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF OLD."clotureA" IS NOT NULL AND OLD."envoyeAuPatron" AND NOT NEW."envoyeAuPatron" THEN
    RAISE EXCEPTION 'Un constat envoyé au patron ne se reprend pas' USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER controle_inopine_garde
  BEFORE UPDATE OR DELETE ON "controle_inopine"
  FOR EACH ROW EXECUTE FUNCTION controle_inopine_garde();
CREATE TRIGGER controle_inopine_pas_de_vidage
  BEFORE TRUNCATE ON "controle_inopine"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();

ALTER TABLE "controle_siege"
  ADD CONSTRAINT "controle_siege_controle_fkey" FOREIGN KEY ("controleId") REFERENCES "controle_inopine"("id"),
  ADD CONSTRAINT "controle_siege_constat_connu" CHECK ("constat" IN ('scanne', 'sans_billet', 'libre')),
  ADD CONSTRAINT "controle_siege_numero" CHECK ("siege" >= 1);

ALTER TABLE "controle_signalement"
  ADD CONSTRAINT "controle_signalement_controle_fkey" FOREIGN KEY ("controleId") REFERENCES "controle_inopine"("id"),
  ADD CONSTRAINT "controle_signalement_convoyeur_fkey" FOREIGN KEY ("convoyeurId") REFERENCES "personne"("id"),
  ADD CONSTRAINT "controle_signalement_montant" CHECK ("montantDeclare" >= 0 AND "siege" >= 1);

ALTER TABLE "controle_regularisation"
  ADD CONSTRAINT "controle_regularisation_billet_fkey" FOREIGN KEY ("billetId") REFERENCES "billet"("id"),
  ADD CONSTRAINT "controle_regularisation_controle_fkey" FOREIGN KEY ("controleId") REFERENCES "controle_inopine"("id"),
  ADD CONSTRAINT "controle_regularisation_montant" CHECK ("prix" >= 0 AND "siege" >= 1);
