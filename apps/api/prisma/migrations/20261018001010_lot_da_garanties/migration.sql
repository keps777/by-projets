-- Lot Da : garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif : tables du lot seulement,
-- aucune table existante n'est modifiée. Les valeurs permises reprennent celles des contrats du patron
-- (`packages/contrats/src/patron/reglages.ts`).

-- ------------------------------------------------------------------ lignes : plan de sièges et brouillon

ALTER TABLE "ligne_reglage"
  ADD CONSTRAINT "ligne_reglage_ligne_fkey" FOREIGN KEY ("ligneId") REFERENCES "ligne"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ligne_reglage_disposition_forme" CHECK ("disposition" ~ '^[0-9](\+[0-9])+$'),
  ADD CONSTRAINT "ligne_reglage_plan_positif" CHECK ("capacite" > 0 AND "rangees" > 0),
  -- Un brouillon n'existe qu'avec son jour d'effet, et inversement.
  ADD CONSTRAINT "ligne_reglage_brouillon_et_effet" CHECK (("brouillon" IS NULL) = ("effetDu" IS NULL));

-- ------------------------------------------------------------------ lignes : départs récurrents

ALTER TABLE "ligne_horaire"
  ADD CONSTRAINT "ligne_horaire_ligne_fkey" FOREIGN KEY ("ligneId") REFERENCES "ligne"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "ligne_horaire_heure_forme" CHECK ("heure" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  ADD CONSTRAINT "ligne_horaire_prix_positif" CHECK ("prix" >= 0),
  ADD CONSTRAINT "ligne_horaire_jours_connus" CHECK ("jours" <@ ARRAY['lun', 'mar', 'mer', 'jeu', 'ven', 'sam', 'dim']::TEXT[]);

-- ------------------------------------------------------------------ équipe

ALTER TABLE "personne_reglage"
  ADD CONSTRAINT "personne_reglage_personne_fkey" FOREIGN KEY ("personneId") REFERENCES "personne"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "personne_reglage_operateur_connu" CHECK ("operateur" IN ('MTN', 'Orange')),
  ADD CONSTRAINT "personne_reglage_jour_de_paie" CHECK ("jourDePaie" BETWEEN 1 AND 31),
  ADD CONSTRAINT "personne_reglage_salaire_positif" CHECK ("salaire" >= 0),
  ADD CONSTRAINT "personne_reglage_droits_objet" CHECK (jsonb_typeof("droits") = 'object');

-- ------------------------------------------------------------------ règles de l'agence

ALTER TABLE "regles_compagnie"
  ADD CONSTRAINT "regles_compagnie_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "regles_compagnie_gratuite_connue" CHECK ("gratuiteJusqua" IN ('1h_avant', '2h_avant', 'veille_20h', 'jamais')),
  ADD CONSTRAINT "regles_compagnie_retenue_connue" CHECK ("retenue" IN ('selon_classe', 'dix_pct', 'cinquante_pct', 'aucun_remboursement')),
  ADD CONSTRAINT "regles_compagnie_au_dela_connu" CHECK ("auDela" IN ('pin_superviseur_et_patron', 'pin_superviseur', 'bloque_guichet')),
  ADD CONSTRAINT "regles_compagnie_pourcentages" CHECK ("retenueClassiquePct" BETWEEN 0 AND 100 AND "retenueVipPct" BETWEEN 0 AND 100),
  ADD CONSTRAINT "regles_compagnie_frais_positif" CHECK ("fraisServiceMontant" >= 0);

-- ------------------------------------------------------------------ comptes mobile money de l'agence

ALTER TABLE "compte_momo_agence"
  ADD CONSTRAINT "compte_momo_agence_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "compte_momo_agence_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  -- L'ancien numéro et son échéance vont ensemble.
  ADD CONSTRAINT "compte_momo_agence_ancien_et_echeance" CHECK (("ancienChiffre" IS NULL) = ("ancienJusqua" IS NULL));

ALTER TABLE "confirmation_compte_momo"
  ADD CONSTRAINT "confirmation_compte_momo_compagnie_fkey" FOREIGN KEY ("compagnieId") REFERENCES "compagnie"("id"),
  ADD CONSTRAINT "confirmation_compte_momo_operateur_connu" CHECK ("operateur" IN ('mtn', 'orange')),
  ADD CONSTRAINT "confirmation_compte_momo_essais" CHECK ("essais" BETWEEN 0 AND 3),
  ADD CONSTRAINT "confirmation_compte_momo_echeance" CHECK ("expireA" > "creeA"),
  ADD CONSTRAINT "confirmation_compte_momo_empreinte" CHECK ("empreinte" ~ '^[0-9a-f]{64}$');
