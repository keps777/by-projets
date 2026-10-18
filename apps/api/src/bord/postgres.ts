import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { versIsoDouala } from "../billetterie/temps";
import type {
  ConstatSiege,
  ControleStocke,
  DepenseBord,
  GenrePassage,
  IncidentBord,
  NatureIncident,
  PassageRoute,
  PositionBord,
  RegularisationControle,
  RetardDepart,
  SiegeConstate,
  SignalementConvoyeur,
  VenteRoute,
} from "./modeles";
import {
  ControlesBord,
  DepensesBord,
  IncidentsBord,
  PassagesRoute,
  RetardsDepart,
  VentesEnRoute,
  type ResultatOuverture,
} from "./ports";
import { categorieDeDepense, natureDeDepense, natureDeIncident } from "./regles";

/**
 * Adaptateurs PostgreSQL des ports du bord. Tables : `vente_en_route`, `passage_route` (ajout seul),
 * `controle_inopine`, `controle_siege`, `controle_signalement`, `controle_regularisation`, et les tables
 * `depart_depense`, `depart_incident`, `depart_observation` du lot C (avec les colonnes que le lot Dc leur
 * ajoute). Les écritures rejouables sont des `INSERT … ON CONFLICT DO NOTHING` : un événement renvoyé n'écrit
 * rien de plus.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v: string): boolean => UUID.test(v);

const iso = (d: Date): string => versIsoDouala(d);

const positionDe = (l: {
  latitude: number | null;
  longitude: number | null;
  precisionM: number | null;
}): PositionBord | null =>
  l.latitude === null || l.longitude === null
    ? null
    : { latitude: l.latitude, longitude: l.longitude, precisionM: l.precisionM ?? 0 };

const positionEcrite = (p: PositionBord | null) => ({
  latitude: p?.latitude ?? null,
  longitude: p?.longitude ?? null,
  precisionM: p?.precisionM ?? null,
});

/* ------------------------------------------------------------------ ventes en route */

@Injectable()
export class VentesEnRoutePrisma extends VentesEnRoute {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(v: VenteRoute): Promise<boolean> {
    const r = await this.prisma.venteEnRoute.createMany({
      data: [
        {
          billetId: v.billetId,
          departId: v.departId,
          convoyeurId: v.convoyeurId,
          arretMontee: v.arretMontee,
          arretDescente: v.arretDescente,
          ...positionEcrite(v.position),
          venduA: new Date(v.venduA),
        },
      ],
      skipDuplicates: true,
    });
    return r.count === 1;
  }

  async duDepart(departId: string): Promise<VenteRoute[]> {
    if (!estUuid(departId)) return [];
    const lignes = await this.prisma.venteEnRoute.findMany({
      where: { departId },
      orderBy: [{ venduA: "asc" }, { billetId: "asc" }],
    });
    return lignes.map((l) => ({
      billetId: l.billetId,
      departId: l.departId,
      convoyeurId: l.convoyeurId,
      arretMontee: l.arretMontee,
      arretDescente: l.arretDescente,
      position: positionDe(l),
      venduA: iso(l.venduA),
    }));
  }
}

/* ------------------------------------------------------------------ passages */

@Injectable()
export class PassagesRoutePrisma extends PassagesRoute {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(p: PassageRoute): Promise<boolean> {
    const r = await this.prisma.passageRoute.createMany({
      data: [
        {
          id: p.id,
          genre: p.genre,
          departId: p.departId,
          auteurId: p.auteurId,
          arret: p.arret,
          billetId: p.billetId,
          resultat: p.resultat,
          ...positionEcrite(p.position),
          at: new Date(p.at),
        },
      ],
      skipDuplicates: true,
    });
    return r.count === 1;
  }

  async duDepart(departId: string, genre?: GenrePassage): Promise<PassageRoute[]> {
    if (!estUuid(departId)) return [];
    const lignes = await this.prisma.passageRoute.findMany({
      where: { departId, ...(genre !== undefined ? { genre } : {}) },
      orderBy: [{ at: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      genre: l.genre as GenrePassage,
      departId: l.departId,
      auteurId: l.auteurId,
      arret: l.arret,
      billetId: l.billetId,
      resultat: l.resultat as PassageRoute["resultat"],
      position: positionDe(l),
      at: iso(l.at),
    }));
  }
}

/* ------------------------------------------------------------------ dépenses, incidents, retards */

@Injectable()
export class DepensesBordPrisma extends DepensesBord {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(d: DepenseBord): Promise<boolean> {
    const r = await this.prisma.departDepense.createMany({
      data: [
        {
          id: d.id,
          departId: d.departId,
          nature: natureDeDepense(d.categorie),
          montant: d.montant,
          libelle: d.libelle,
          saisieA: new Date(d.saisieA),
          categorie: d.categorie,
          justificatifRef: d.justificatifRef,
          auteurId: d.auteurId,
        },
      ],
      skipDuplicates: true,
    });
    return r.count === 1;
  }

  async duDepart(departId: string): Promise<DepenseBord[]> {
    if (!estUuid(departId)) return [];
    const lignes = await this.prisma.departDepense.findMany({
      where: { departId },
      orderBy: [{ saisieA: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      departId: l.departId,
      categorie: categorieDeDepense(l.categorie, l.nature),
      libelle: l.libelle ?? "Dépense",
      montant: l.montant,
      justificatifRef: l.justificatifRef,
      auteurId: l.auteurId,
      saisieA: iso(l.saisieA),
    }));
  }
}

@Injectable()
export class IncidentsBordPrisma extends IncidentsBord {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(i: IncidentBord): Promise<boolean> {
    const r = await this.prisma.departIncident.createMany({
      data: [
        {
          id: i.id,
          departId: i.departId,
          nature: natureDeIncident(i.nature),
          description: i.description,
          signaleA: new Date(i.signaleA),
          categorie: i.nature,
          auteurId: i.auteurId,
          ...positionEcrite(i.position),
          note: i.note,
        },
      ],
      skipDuplicates: true,
    });
    return r.count === 1;
  }

  async duDepart(departId: string): Promise<IncidentBord[]> {
    if (!estUuid(departId)) return [];
    const lignes = await this.prisma.departIncident.findMany({
      where: { departId },
      orderBy: [{ signaleA: "asc" }, { id: "asc" }],
    });
    return lignes.map((l) => ({
      id: l.id,
      departId: l.departId,
      nature: (l.categorie ?? (l.nature === "panne" ? "panne" : "autre")) as NatureIncident,
      description: l.description,
      note: l.note,
      position: positionDe(l),
      auteurId: l.auteurId,
      signaleA: iso(l.signaleA),
    }));
  }
}

@Injectable()
export class RetardsDepartPrisma extends RetardsDepart {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async noter(departId: string, minutes: number, at: string): Promise<void> {
    const misAJourA = new Date(at);
    await this.prisma.departObservation.upsert({
      where: { departId },
      create: { departId, retardMinutes: minutes, misAJourA },
      update: { retardMinutes: minutes, misAJourA },
    });
  }

  async lire(departId: string): Promise<RetardDepart | null> {
    if (!estUuid(departId)) return null;
    const l = await this.prisma.departObservation.findUnique({ where: { departId } });
    return l ? { departId: l.departId, minutes: l.retardMinutes } : null;
  }
}

/* ------------------------------------------------------------------ contrôle inopiné */

type LigneControle = NonNullable<
  Awaited<ReturnType<PrismaService["controleInopine"]["findUnique"]>>
>;

const controleDe = (l: LigneControle): ControleStocke => ({
  id: l.id,
  departId: l.departId,
  controleurId: l.controleurId,
  lieu: l.lieu,
  ouvertA: iso(l.ouvertA),
  clotureA: l.clotureA ? iso(l.clotureA) : null,
  liste: l.liste,
  tetes: l.tetes,
  ecart: l.ecart,
  envoyeAuPatron: l.envoyeAuPatron,
});

@Injectable()
export class ControlesBordPrisma extends ControlesBord {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(id: string): Promise<ControleStocke | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.controleInopine.findUnique({ where: { id } });
    return l ? controleDe(l) : null;
  }

  async ouvertDe(controleurId: string): Promise<ControleStocke | null> {
    if (!estUuid(controleurId)) return null;
    const l = await this.prisma.controleInopine.findFirst({
      where: { controleurId, clotureA: null },
    });
    return l ? controleDe(l) : null;
  }

  async ouvrir(c: ControleStocke): Promise<ResultatOuverture> {
    try {
      const l = await this.prisma.controleInopine.create({
        data: {
          id: c.id,
          departId: c.departId,
          controleurId: c.controleurId,
          lieu: c.lieu,
          ouvertA: new Date(c.ouvertA),
        },
      });
      return { controle: controleDe(l), cree: true };
    } catch (e) {
      // L'index unique partiel (un seul contrôle ouvert par contrôleur) a tranché : on rend celui qui existe.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        const existant = (await this.ouvertDe(c.controleurId)) ?? (await this.trouver(c.id));
        if (existant) return { controle: existant, cree: false };
      }
      throw e;
    }
  }

  async constats(controleId: string): Promise<SiegeConstate[]> {
    if (!estUuid(controleId)) return [];
    const lignes = await this.prisma.controleSiege.findMany({
      where: { controleId },
      orderBy: { siege: "asc" },
    });
    return lignes.map((l) => ({
      controleId: l.controleId,
      siege: l.siege,
      constat: l.constat as ConstatSiege,
      at: iso(l.at),
    }));
  }

  async constater(controleId: string, siege: number, constat: ConstatSiege, at: string) {
    await this.prisma.controleSiege.upsert({
      where: { controleId_siege: { controleId, siege } },
      create: { controleId, siege, constat, at: new Date(at) },
      update: { constat, at: new Date(at) },
    });
  }

  async regulariser(r: RegularisationControle): Promise<boolean> {
    const res = await this.prisma.controleRegularisation.createMany({
      data: [
        {
          billetId: r.billetId,
          controleId: r.controleId,
          siege: r.siege,
          prix: r.prix,
          at: new Date(r.at),
        },
      ],
      skipDuplicates: true,
    });
    return res.count === 1;
  }

  async regularisations(controleId: string): Promise<RegularisationControle[]> {
    if (!estUuid(controleId)) return [];
    const lignes = await this.prisma.controleRegularisation.findMany({
      where: { controleId },
      orderBy: [{ at: "asc" }, { billetId: "asc" }],
    });
    return lignes.map((l) => ({
      billetId: l.billetId,
      controleId: l.controleId,
      siege: l.siege,
      prix: l.prix,
      at: iso(l.at),
    }));
  }

  async signaler(s: SignalementConvoyeur): Promise<boolean> {
    const res = await this.prisma.controleSignalement.createMany({
      data: [
        {
          evenementId: s.evenementId,
          controleId: s.controleId,
          departId: s.departId,
          convoyeurId: s.convoyeurId,
          siege: s.siege,
          montantDeclare: s.montantDeclare,
          note: s.note,
          at: new Date(s.at),
          patronPrevenu: s.patronPrevenu,
        },
      ],
      skipDuplicates: true,
    });
    return res.count === 1;
  }

  async signalements(controleId: string): Promise<SignalementConvoyeur[]> {
    if (!estUuid(controleId)) return [];
    const lignes = await this.prisma.controleSignalement.findMany({
      where: { controleId },
      orderBy: [{ at: "asc" }, { evenementId: "asc" }],
    });
    return lignes.map((l) => ({
      evenementId: l.evenementId,
      controleId: l.controleId,
      departId: l.departId,
      convoyeurId: l.convoyeurId,
      siege: l.siege,
      montantDeclare: l.montantDeclare,
      note: l.note,
      at: iso(l.at),
      patronPrevenu: l.patronPrevenu,
    }));
  }

  async marquerPatronPrevenu(evenementId: string): Promise<void> {
    await this.prisma.controleSignalement.updateMany({
      where: { evenementId },
      data: { patronPrevenu: true },
    });
  }

  async clore(
    id: string,
    a: { clotureA: string; liste: number; tetes: number; ecart: number },
  ): Promise<ControleStocke | null> {
    // Comparer et remplacer : un contrôle déjà clos ne se clôt pas deux fois.
    const r = await this.prisma.controleInopine.updateMany({
      where: { id, clotureA: null },
      data: { clotureA: new Date(a.clotureA), liste: a.liste, tetes: a.tetes, ecart: a.ecart },
    });
    if (r.count === 0) return null;
    return this.trouver(id);
  }

  async marquerEnvoye(id: string): Promise<void> {
    await this.prisma.controleInopine.updateMany({
      where: { id, clotureA: { not: null } },
      data: { envoyeAuPatron: true },
    });
  }

  async duDepart(departId: string): Promise<ControleStocke[]> {
    if (!estUuid(departId)) return [];
    const lignes = await this.prisma.controleInopine.findMany({
      where: { departId },
      orderBy: [{ ouvertA: "asc" }, { id: "asc" }],
    });
    return lignes.map(controleDe);
  }
}
