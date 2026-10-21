-- Lot Dd : parts de sièges hors ligne (anomalie A7 de la recette). Additif : une table nouvelle, rien d'existant
-- n'est modifié.

-- CreateTable
CREATE TABLE "part_hors_ligne" (
    "departId" UUID NOT NULL,
    "rang" INTEGER NOT NULL,
    "sieges" INTEGER[],
    "creeA" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "part_hors_ligne_pkey" PRIMARY KEY ("departId","rang")
);

-- Garde-fous : la part appartient à un départ (elle disparaît avec lui), à un rang de guichet (1 ou plus), et ses
-- sièges sont des numéros positifs.
ALTER TABLE "part_hors_ligne"
  ADD CONSTRAINT "part_hors_ligne_depart_fkey" FOREIGN KEY ("departId") REFERENCES "depart"("id") ON DELETE CASCADE,
  ADD CONSTRAINT "part_hors_ligne_rang" CHECK ("rang" >= 1),
  ADD CONSTRAINT "part_hors_ligne_sieges" CHECK (0 < ALL ("sieges"));
