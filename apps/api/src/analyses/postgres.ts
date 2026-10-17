import { Injectable } from "@nestjs/common";
import { PrismaService } from "../socle/db/prisma.service";
import type {
  AgentRef,
  AgregatReseau,
  BusRef,
  Classe,
  DepartFait,
  EcartCaisseFait,
  GareRef,
  LigneRef,
  OffrePublique,
  VenteCadenceFait,
} from "./modele";
import {
  FaitsCaisse,
  FaitsDeparts,
  OffresPubliques,
  ReferentielAnalyses,
  ReseauAnonyme,
} from "./ports";

/**
 * Adaptateurs PostgreSQL (Prisma) des cinq ports de lecture des analyses (AM-109). Le module n'écrit rien :
 * chaque requête filtre sur la compagnie du patron, sauf les deux qui regardent hors de la compagnie
 * (`OffresPubliques`, `ReseauAnonyme`), qui ne rendent que des offres publiées et des moyennes anonymes.
 *
 * Tables lues : `ligne`, `gare`, `bus`, `bus_fiche`, `personne`, `depart`, `depart_observation`,
 * `depart_incident`, `depart_depense`, `billet`, `colis`, `session_caisse`, `compagnie`.
 *
 * - **Jamais une requête par départ** : `FaitsDeparts.entre` est une seule requête (jointures latérales
 *   agrégées) quelle que soit la taille de la fenêtre.
 * - **Les jours sont ceux de Douala** (UTC+1, sans heure d'été) : `(heure AT TIME ZONE 'UTC') + 1 heure`.
 * - **L'anonymat est dans la requête** : l'agrégat du réseau n'existe que si au moins `seuil` autres
 *   compagnies le composent (`HAVING count(DISTINCT compagnieId) >= seuil`) ; il ne porte ni nom ni identifiant.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const JOUR_MS = 24 * 3_600_000;

/** Début (inclus) du jour `AAAA-MM-JJ` de Douala. */
const debutDuJour = (jour: string): Date => new Date(`${jour}T00:00:00.000+01:00`);
/** Début du jour qui suit `au` (borne exclue de la fenêtre `[du, au]`). */
const apresLeJour = (jour: string): Date => new Date(debutDuJour(jour).getTime() + JOUR_MS);

@Injectable()
export class ReferentielAnalysesPrisma extends ReferentielAnalyses {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lignes(compagnieId: string): Promise<LigneRef[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.$queryRaw<
      { id: string; code: string; origine: string; destination: string }[]
    >`
      SELECT l."id"::text AS id, l."code", go."ville" AS origine, gd."ville" AS destination
      FROM "ligne" l
      JOIN "gare" go ON go."id" = l."origineGareId"
      JOIN "gare" gd ON gd."id" = l."destinationGareId"
      WHERE l."compagnieId" = ${compagnieId}::uuid
      ORDER BY l."code"`;
    return lignes.map((l) => ({
      id: l.id,
      nom: `${l.origine} → ${l.destination}`,
      code: l.code,
      origine: l.origine,
      destination: l.destination,
    }));
  }

  async bus(compagnieId: string): Promise<BusRef[]> {
    if (!UUID.test(compagnieId)) return [];
    // Le chauffeur habituel est celui de la fiche ; à défaut, celui du dernier départ du bus.
    const lignes = await this.prisma.$queryRaw<
      {
        id: string;
        immatriculation: string;
        capacite: number;
        modele: string | null;
        annee: number | null;
        entretien: string | null;
        chauffeurId: string | null;
        chauffeurNom: string | null;
      }[]
    >`
      SELECT b."id"::text AS id, b."immatriculation", b."capacite", f."modele", f."annee", f."entretien",
             p."id"::text AS "chauffeurId", p."nom" AS "chauffeurNom"
      FROM "bus" b
      LEFT JOIN "bus_fiche" f ON f."busId" = b."id"
      LEFT JOIN LATERAL (
        SELECT d."chauffeurId" FROM "depart" d
        WHERE d."busId" = b."id" AND d."chauffeurId" IS NOT NULL
        ORDER BY d."heureDepart" DESC LIMIT 1
      ) dernier ON true
      LEFT JOIN "personne" p ON p."id" = COALESCE(f."chauffeurHabituelId", dernier."chauffeurId")
      WHERE b."compagnieId" = ${compagnieId}::uuid
      ORDER BY b."immatriculation"`;
    return lignes.map((b) => ({
      id: b.id,
      immatriculation: b.immatriculation,
      modele: b.modele ?? "",
      capacite: b.capacite,
      annee: b.annee ?? 0,
      chauffeurId: b.chauffeurId,
      chauffeurNom: b.chauffeurNom ?? "",
      entretien: b.entretien,
    }));
  }

  async agents(compagnieId: string): Promise<AgentRef[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.$queryRaw<{ id: string; nom: string }[]>`
      SELECT "id"::text AS id, "nom" FROM "personne"
      WHERE "compagnieId" = ${compagnieId}::uuid
        AND "roles" && ARRAY['guichetier', 'convoyeur', 'vendeur']::"role"[]
      ORDER BY "nom", "id"`;
    return lignes;
  }

  async gares(compagnieId: string): Promise<GareRef[]> {
    if (!UUID.test(compagnieId)) return [];
    return this.prisma.$queryRaw<GareRef[]>`
      SELECT "id"::text AS id, "nom", "ville" FROM "gare"
      WHERE "compagnieId" = ${compagnieId}::uuid
      ORDER BY "code"`;
  }
}

interface LigneDepartFait {
  departId: string;
  ligneId: string;
  jour: string;
  heure: string;
  classe: string;
  prix: number;
  busId: string | null;
  chauffeurId: string | null;
  capacite: number;
  annule: boolean;
  note: string | null;
  retardMinutes: number | null;
  billets: number;
  recetteBillets: number;
  billetsEnLigne: number;
  billetsEnRoute: number;
  colis: number;
  recetteColis: number;
  incidentNature: string | null;
  incidentDescription: string | null;
  incidentDuree: number | null;
  carburant: number;
  coutPanne: number;
  autresDepenses: number;
}

@Injectable()
export class FaitsDepartsPrisma extends FaitsDeparts {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async entre(compagnieId: string, du: string, au: string): Promise<DepartFait[]> {
    if (!UUID.test(compagnieId)) return [];
    const debut = debutDuJour(du);
    const fin = apresLeJour(au);
    const lignes = await this.prisma.$queryRaw<LigneDepartFait[]>`
      SELECT d."id"::text AS "departId", d."ligneId"::text AS "ligneId",
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM-DD') AS jour,
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'HH24:MI') AS heure,
             d."classe"::text AS classe,
             CASE d."classe" WHEN 'vip' THEN l."tarifVip" ELSE l."tarifClassique" END AS prix,
             d."busId"::text AS "busId", d."chauffeurId"::text AS "chauffeurId",
             COALESCE(bu."capacite", 0) AS capacite,
             (d."etat" IN ('annule', 'fusionne')) AS annule,
             o."note", o."retardMinutes",
             COALESCE(bi.billets, 0) AS billets, COALESCE(bi.recette, 0) AS "recetteBillets",
             COALESCE(bi.en_ligne, 0) AS "billetsEnLigne", COALESCE(bi.en_route, 0) AS "billetsEnRoute",
             COALESCE(co.nombre, 0) AS colis, COALESCE(co.recette, 0) AS "recetteColis",
             inc."nature" AS "incidentNature", inc."description" AS "incidentDescription",
             inc."dureeMinutes" AS "incidentDuree",
             COALESCE(dep.carburant, 0) AS carburant, COALESCE(dep.panne, 0) AS "coutPanne",
             COALESCE(dep.autres, 0) AS "autresDepenses"
      FROM "depart" d
      JOIN "ligne" l ON l."id" = d."ligneId" AND l."compagnieId" = ${compagnieId}::uuid
      LEFT JOIN "bus" bu ON bu."id" = d."busId"
      LEFT JOIN "depart_observation" o ON o."departId" = d."id"
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS billets,
               COALESCE(sum(b."prix" + b."bagage"), 0)::int AS recette,
               (count(*) FILTER (WHERE b."canal" = 'en_ligne'))::int AS en_ligne,
               (count(*) FILTER (WHERE b."canal" = 'convoyeur'))::int AS en_route
        FROM "billet" b
        WHERE b."departId" = d."id" AND b."etat" NOT IN ('annule', 'reporte')
      ) bi ON true
      LEFT JOIN LATERAL (
        SELECT count(*)::int AS nombre, COALESCE(sum(c."prixTotal"), 0)::int AS recette
        FROM "colis" c
        WHERE c."departId" = d."id" AND c."etat" NOT IN ('retourne', 'perdu')
      ) co ON true
      LEFT JOIN LATERAL (
        SELECT i."nature", i."description", i."dureeMinutes" FROM "depart_incident" i
        WHERE i."departId" = d."id"
        ORDER BY (i."nature" = 'panne') DESC, i."signaleA" DESC LIMIT 1
      ) inc ON true
      LEFT JOIN LATERAL (
        SELECT (sum(x."montant") FILTER (WHERE x."nature" = 'carburant'))::int AS carburant,
               (sum(x."montant") FILTER (WHERE x."nature" = 'panne'))::int AS panne,
               (sum(x."montant") FILTER (WHERE x."nature" = 'autre'))::int AS autres
        FROM "depart_depense" x WHERE x."departId" = d."id"
      ) dep ON true
      WHERE d."heureDepart" >= ${debut} AND d."heureDepart" < ${fin}
      ORDER BY d."heureDepart", d."id"`;
    return lignes.map((l) => ({
      departId: l.departId,
      ligneId: l.ligneId,
      jour: l.jour,
      heure: l.heure,
      classe: l.classe as Classe,
      prix: l.prix,
      busId: l.busId,
      chauffeurId: l.chauffeurId,
      capacite: l.capacite,
      billets: l.billets,
      recetteBillets: l.recetteBillets,
      billetsEnLigne: l.billetsEnLigne,
      billetsEnRoute: l.billetsEnRoute,
      // La billetterie ne garde pas l'arrêt où le convoyeur a vendu : la liste reste vide.
      arretsEnRoute: [],
      // Tout billet vendu en route est un billet enregistré : il n'y a pas de vente « à saisir ».
      enRouteTousEnregistres: true,
      colis: l.colis,
      recetteColis: l.recetteColis,
      annule: l.annule,
      note: l.note,
      retardMinutes: l.retardMinutes,
      incident:
        l.incidentNature === null
          ? null
          : {
              nature: l.incidentNature === "panne" ? "panne" : "autre",
              description: l.incidentDescription ?? "",
              dureeMinutes: l.incidentDuree,
            },
      carburant: l.carburant,
      coutPanne: l.coutPanne,
      autresDepenses: l.autresDepenses,
    }));
  }
}

@Injectable()
export class FaitsCaissePrisma extends FaitsCaisse {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ecarts(compagnieId: string, du: string, au: string): Promise<EcartCaisseFait[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.$queryRaw<
      {
        sessionId: string;
        agentId: string;
        gareId: string;
        rang: number;
        jour: string;
        ecart: number;
        tolerance: number;
        validee: boolean;
      }[]
    >`
      SELECT s."id"::text AS "sessionId", s."agentId"::text AS "agentId", s."gareId"::text AS "gareId",
             s."guichetRang" AS rang,
             to_char((s."ouverteA" AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM-DD') AS jour,
             s."ecart", s."tolerance", (s."etat" = 'validee') AS validee
      FROM "session_caisse" s
      WHERE s."compagnieId" = ${compagnieId}::uuid
        AND s."etat" IN ('cloturee', 'validee')
        AND s."ecart" IS NOT NULL
        AND s."ouverteA" >= ${debutDuJour(du)} AND s."ouverteA" < ${apresLeJour(au)}
      ORDER BY s."ouverteA", s."id"`;
    return lignes.map((l) => ({
      sessionId: l.sessionId,
      agentId: l.agentId,
      gareId: l.gareId,
      guichet: `Guichet ${l.rang}`,
      jour: l.jour,
      ecart: l.ecart,
      tolerance: l.tolerance,
      validee: l.validee,
    }));
  }

  async ventesCadence(compagnieId: string, du: string, au: string): Promise<VenteCadenceFait[]> {
    if (!UUID.test(compagnieId)) return [];
    // Un billet de cadence est vendu sans le nom du passager, à compléter au quai : `aCompleterAuQuai`.
    // « Sans nom » : aucun numéro de téléphone n'a été saisi.
    return this.prisma.$queryRaw<VenteCadenceFait[]>`
      SELECT b."auteurId"::text AS "agentId", b."gareId"::text AS "gareId", d."id"::text AS "departId",
             d."ligneId"::text AS "ligneId",
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'HH24:MI') AS heure,
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM-DD') AS jour,
             count(*)::int AS billets,
             (count(*) FILTER (WHERE b."passagerTelephoneIndex" IS NULL))::int AS "sansNom"
      FROM "billet" b
      JOIN "depart" d ON d."id" = b."departId"
      WHERE b."compagnieId" = ${compagnieId}::uuid
        AND b."canal" = 'guichet'
        AND b."aCompleterAuQuai"
        AND b."auteurId" IS NOT NULL
        AND b."etat" NOT IN ('annule', 'reporte')
        AND d."heureDepart" >= ${debutDuJour(du)} AND d."heureDepart" < ${apresLeJour(au)}
      GROUP BY b."auteurId", b."gareId", d."id", d."ligneId", d."heureDepart"
      ORDER BY d."heureDepart", d."id", b."auteurId"`;
  }
}

@Injectable()
export class OffresPubliquesPrisma extends OffresPubliques {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async entre(
    compagnieId: string,
    ligneCodes: readonly string[],
    du: string,
    au: string,
  ): Promise<OffrePublique[]> {
    if (!UUID.test(compagnieId) || ligneCodes.length === 0) return [];
    const codes = [...ligneCodes];
    // Ce que la recherche du voyageur affiche d'un départ : compagnie, ligne, jour, heure, prix. Rien d'autre.
    return this.prisma.$queryRaw<OffrePublique[]>`
      SELECT cp."nom" AS compagnie, l."code" AS "ligneCode",
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM-DD') AS jour,
             to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'HH24:MI') AS heure,
             CASE d."classe" WHEN 'vip' THEN l."tarifVip" ELSE l."tarifClassique" END AS prix
      FROM "depart" d
      JOIN "ligne" l ON l."id" = d."ligneId"
      JOIN "compagnie" cp ON cp."id" = l."compagnieId"
      WHERE l."compagnieId" <> ${compagnieId}::uuid
        AND cp."actif"
        AND l."code" = ANY(${codes}::text[])
        AND d."etat" NOT IN ('annule', 'fusionne')
        AND d."heureDepart" >= ${debutDuJour(du)} AND d."heureDepart" < ${apresLeJour(au)}
      ORDER BY d."heureDepart", cp."nom"`;
  }
}

@Injectable()
export class ReseauAnonymePrisma extends ReseauAnonyme {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async moyennes(
    compagnieId: string,
    ligneCodes: readonly string[],
    du: string,
    au: string,
    seuilCompagnies: number,
  ): Promise<AgregatReseau[]> {
    if (!UUID.test(compagnieId) || ligneCodes.length === 0) return [];
    const codes = [...ligneCodes];
    // Jamais en dessous de trois compagnies, quoi qu'on demande.
    const seuil = Math.max(3, Math.trunc(seuilCompagnies));
    const lignes = await this.prisma.$queryRaw<
      { ligneCode: string; creneau: string; compagnies: number; moyenne: number; jours: number }[]
    >`
      WITH par_jour AS (
        SELECT l."code" AS ligne_code, l."compagnieId" AS cid,
               to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'HH24') || ':00' AS creneau,
               to_char((d."heureDepart" AT TIME ZONE 'UTC') + interval '1 hour', 'YYYY-MM-DD') AS jour,
               sum(bi.billets)::float8 / NULLIF(sum(bu."capacite"), 0) * 100 AS pct
        FROM "depart" d
        JOIN "ligne" l ON l."id" = d."ligneId"
        JOIN "bus" bu ON bu."id" = d."busId"
        JOIN LATERAL (
          SELECT count(*) AS billets FROM "billet" b
          WHERE b."departId" = d."id" AND b."etat" NOT IN ('annule', 'reporte')
        ) bi ON true
        WHERE l."compagnieId" <> ${compagnieId}::uuid
          AND l."code" = ANY(${codes}::text[])
          AND d."etat" NOT IN ('annule', 'fusionne')
          AND bu."capacite" > 0
          AND d."heureDepart" >= ${debutDuJour(du)} AND d."heureDepart" < ${apresLeJour(au)}
        GROUP BY 1, 2, 3, 4
      )
      SELECT ligne_code AS "ligneCode", creneau,
             count(DISTINCT cid)::int AS compagnies,
             round(avg(pct)::numeric, 1)::float8 AS moyenne,
             count(DISTINCT jour)::int AS jours
      FROM par_jour
      GROUP BY ligne_code, creneau
      HAVING count(DISTINCT cid) >= ${seuil}
      ORDER BY ligne_code, creneau`;
    return lignes.map((l) => ({
      ligneCode: l.ligneCode,
      creneau: l.creneau,
      compagnies: l.compagnies,
      remplissageMoyenPct: l.moyenne,
      jours: l.jours,
    }));
  }
}
