-- CreateTable
CREATE TABLE "rapport_soir" (
    "compagnieId" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "genereA" TIMESTAMPTZ(3) NOT NULL,
    "rapport" JSONB NOT NULL,

    CONSTRAINT "rapport_soir_pkey" PRIMARY KEY ("compagnieId","jour")
);


-- Rapport du soir (AM-171) · garde-fous écrits en SQL (Prisma ne sait pas les exprimer). Additif.

-- Un rapport arrêté ne change plus : on l'ajoute, on ne le réécrit pas (même mécanisme que le reste).
CREATE TRIGGER rapport_soir_ajout_seul
  BEFORE UPDATE OR DELETE ON "rapport_soir"
  FOR EACH ROW EXECUTE FUNCTION interdire_modification();
CREATE TRIGGER rapport_soir_pas_de_vidage
  BEFORE TRUNCATE ON "rapport_soir"
  FOR EACH STATEMENT EXECUTE FUNCTION interdire_modification();
