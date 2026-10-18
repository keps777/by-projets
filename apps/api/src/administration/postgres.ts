import { Injectable } from "@nestjs/common";
import { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import { versIsoDouala } from "../billetterie/temps";
import type {
  BusAdmin,
  ChangementEquipage,
  ClasseDepart,
  CommandeAppareil,
  CompagnieAdmin,
  DepartListe,
  EnrolementAppareil,
  EtatDepart,
  FiltreDeparts,
  GareAdmin,
  HoraireLigne,
  Jour,
  LigneAdmin,
  NouveauBus,
  NouveauDepart,
  PlanLigne,
  OptionsLigne,
  RapportEffacement,
  ReglageLigne,
  SectionsLigne,
} from "./modeles";
import {
  AnnuaireAdmin,
  HoraireEnDouble,
  HoraireInconnu,
  Lignes,
  OrdresAppareils,
  ParcBus,
  Programme,
  RegistreAppareils,
  type DeclarationAppareil,
  type NouvelleLigne,
  type PublicationLigne,
  type ResultatAcquittement,
  type ResultatCreationDepart,
  type ResultatEnrolement,
  type ResultatEquipage,
  type StockageAdministration,
} from "./ports";
import {
  ETATS_LIBERANT,
  ETATS_MODIFIABLES,
  chercherConflit,
  dureeEffective,
  type OccupationDepart,
} from "./regles";

/**
 * Adaptateurs PostgreSQL (Prisma) de l'administration. Tables : `compagnie`, `gare`, `ligne`, `arret`,
 * `horaire_ligne`, `reglage_ligne`, `bus`, `bus_fiche`, `depart`, `billet` (lecture), `appareil_sync` (côté
 * synchronisation), `enrolement_appareil`, `commande_appareil`.
 *
 * Les garanties tiennent dans la base : un seul horaire actif par ligne et par heure, un numéro de départ unique,
 * un code d'enrôlement qui n'ouvre qu'un appareil, un seul ordre en attente par appareil, un accusé qui ne
 * s'écrit qu'une fois (voir la migration `lot_de_garanties`). Les écritures qui touchent plusieurs lignes
 * (publier une ligne, équiper un départ) prennent un verrou consultatif de l'espace `VERROU_ADMINISTRATION`.
 */

/** Espace de noms des verrous consultatifs de l'administration (AM-093). */
export const VERROU_ADMINISTRATION = 7_017_093;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const estUuid = (v: string | null | undefined): v is string =>
  typeof v === "string" && UUID.test(v);

type Tx = Prisma.TransactionClient;

const iso = (d: Date): string => versIsoDouala(d);
const json = (v: unknown): Prisma.InputJsonValue => v as Prisma.InputJsonValue;

/** Vrai si l'erreur (ou sa cause) porte ce code SQLSTATE ou Prisma. */
function porteCode(e: unknown, code: string): boolean {
  const vus = new Set<unknown>();
  const parcourir = (v: unknown, profondeur: number): boolean => {
    if (v === null || typeof v !== "object" || profondeur > 6 || vus.has(v)) return false;
    vus.add(v);
    const o = v as Record<string, unknown>;
    if (o["code"] === code || o["originalCode"] === code) return true;
    return Object.values(o).some((x) => parcourir(x, profondeur + 1));
  };
  return parcourir(e, 0) || (e instanceof Error && e.message.includes(code));
}
const unicite = (e: unknown): boolean => porteCode(e, "23505") || porteCode(e, "P2002");

/* ------------------------------------------------------------------ annuaire */

@Injectable()
export class AnnuaireAdminPrisma extends AnnuaireAdmin implements StockageAdministration {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async compagnie(id: string): Promise<CompagnieAdmin | null> {
    if (!estUuid(id)) return null;
    return this.prisma.compagnie.findUnique({
      where: { id },
      select: { id: true, code: true, nom: true },
    });
  }

  async gare(id: string): Promise<GareAdmin | null> {
    if (!estUuid(id)) return null;
    return this.prisma.gare.findUnique({ where: { id } });
  }

  async gares(compagnieId: string): Promise<GareAdmin[]> {
    if (!estUuid(compagnieId)) return [];
    return this.prisma.gare.findMany({
      where: { compagnieId },
      orderBy: [{ ville: "asc" }, { nom: "asc" }],
    });
  }
}

/* ------------------------------------------------------------------ lignes */

const INCLUSION_LIGNE = { arrets: { orderBy: { ordre: "asc" } } } satisfies Prisma.LigneInclude;
type LignePrisma = Prisma.LigneGetPayload<{ include: typeof INCLUSION_LIGNE }>;

const versLigne = (l: LignePrisma): LigneAdmin => ({
  id: l.id,
  compagnieId: l.compagnieId,
  code: l.code,
  origineGareId: l.origineGareId,
  destinationGareId: l.destinationGareId,
  tarifs: { classique: l.tarifClassique, vip: l.tarifVip, bagage: l.tarifBagage },
  dureeMinutes: l.dureeMinutes,
  arrets: l.arrets.map((a) => ({
    nom: a.nom,
    kmDepuisOrigine: a.kmDepuisOrigine,
    montee: a.montee,
  })),
});

const cleNom = (nom: string): string => nom.trim().toLocaleLowerCase("fr");

@Injectable()
export class LignesPrisma extends Lignes implements StockageAdministration {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async trouver(id: string): Promise<LigneAdmin | null> {
    if (!estUuid(id)) return null;
    const l = await this.prisma.ligne.findUnique({ where: { id }, include: INCLUSION_LIGNE });
    return l ? versLigne(l) : null;
  }

  async lister(compagnieId: string): Promise<LigneAdmin[]> {
    if (!estUuid(compagnieId)) return [];
    const lignes = await this.prisma.ligne.findMany({
      where: { compagnieId },
      include: INCLUSION_LIGNE,
      orderBy: { code: "asc" },
    });
    return lignes.map(versLigne);
  }

  async creer(ligne: NouvelleLigne): Promise<LigneAdmin | null> {
    let id: string;
    try {
      id = await this.prisma.$transaction(async (tx) => {
        const cree = await tx.ligne.create({
          data: {
            compagnieId: ligne.compagnieId,
            code: ligne.code,
            origineGareId: ligne.origineGareId,
            destinationGareId: ligne.destinationGareId,
            tarifClassique: ligne.tarifs.classique,
            tarifVip: ligne.tarifs.vip,
            tarifBagage: ligne.tarifs.bagage,
            dureeMinutes: ligne.dureeMinutes,
            arrets: {
              create: ligne.arrets.map((a, ordre) => ({
                ordre,
                nom: a.nom,
                kmDepuisOrigine: a.kmDepuisOrigine,
                montee: a.montee,
              })),
            },
          },
          select: { id: true },
        });
        await tx.reglageLigne.create({
          data: {
            ligneId: cree.id,
            capacite: ligne.plan.capacite,
            disposition: ligne.plan.disposition,
            rangees: ligne.plan.rangees,
            venteEnLigne: ligne.options.venteEnLigne,
            fusionAuto: ligne.options.fusionAuto,
          },
        });
        return cree.id;
      });
    } catch (e) {
      if (unicite(e)) return null;
      throw e;
    }
    return this.trouver(id);
  }

  async horaires(ligneId: string): Promise<HoraireLigne[]> {
    if (!estUuid(ligneId)) return [];
    const horaires = await this.prisma.horaireLigne.findMany({
      where: { ligneId },
      orderBy: [{ heure: "asc" }, { creeA: "asc" }],
    });
    return horaires.map((h) => ({
      id: h.id,
      ligneId: h.ligneId,
      heure: h.heure,
      classe: h.classe,
      actif: h.actif,
      note: h.note,
      jours: h.jours as Jour[],
    }));
  }

  async reglage(ligneId: string): Promise<ReglageLigne | null> {
    if (!estUuid(ligneId)) return null;
    const r = await this.prisma.reglageLigne.findUnique({ where: { ligneId } });
    if (!r) return null;
    return {
      ligneId: r.ligneId,
      plan: { capacite: r.capacite, disposition: r.disposition, rangees: r.rangees },
      options: { venteEnLigne: r.venteEnLigne, fusionAuto: r.fusionAuto },
      brouillon: (r.brouillon as SectionsLigne | null) ?? null,
      effetDu: r.effetDu,
    };
  }

  async publier(ligneId: string, p: PublicationLigne): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(${VERROU_ADMINISTRATION}::int, hashtext(${`ligne:${ligneId}`}))`;
        await this.ecrireHoraires(tx, ligneId, p);
        await tx.ligne.update({
          where: { id: ligneId },
          data: {
            tarifClassique: p.tarifs.classique,
            tarifVip: p.tarifs.vip,
            tarifBagage: p.tarifs.bagage,
          },
        });
        await this.ecrireArrets(tx, ligneId, p);
        await tx.reglageLigne.upsert({
          where: { ligneId },
          create: {
            ligneId,
            capacite: p.plan.capacite,
            disposition: p.plan.disposition,
            rangees: p.plan.rangees,
            venteEnLigne: p.options.venteEnLigne,
            fusionAuto: p.options.fusionAuto,
          },
          update: {
            capacite: p.plan.capacite,
            disposition: p.plan.disposition,
            rangees: p.plan.rangees,
            venteEnLigne: p.options.venteEnLigne,
            fusionAuto: p.options.fusionAuto,
            brouillon: Prisma.DbNull,
            effetDu: null,
            misAJourA: new Date(),
          },
        });
      });
    } catch (e) {
      if (e instanceof HoraireInconnu) throw e;
      if (unicite(e)) {
        const doublon = p.horaires.find(
          (h, i) => h.actif && p.horaires.findIndex((x) => x.actif && x.heure === h.heure) !== i,
        );
        throw new HoraireEnDouble(doublon?.heure ?? "?");
      }
      throw e;
    }
  }

  private async ecrireHoraires(tx: Tx, ligneId: string, p: PublicationLigne): Promise<void> {
    const existants = await tx.horaireLigne.findMany({ where: { ligneId }, select: { id: true } });
    const connus = new Set(existants.map((h) => h.id));
    for (const h of p.horaires)
      if (h.id !== null && !connus.has(h.id)) throw new HoraireInconnu(h.id);
    const gardes = new Set(p.horaires.filter((h) => h.id !== null).map((h) => h.id!));
    await tx.horaireLigne.deleteMany({
      where: { ligneId, id: { in: [...connus].filter((id) => !gardes.has(id)) } },
    });
    // Deux horaires qui échangent leurs heures passeraient par un doublon : on les désactive d'abord.
    await tx.horaireLigne.updateMany({
      where: { ligneId, id: { in: [...gardes] } },
      data: { actif: false },
    });
    for (const h of p.horaires) {
      const donnees = {
        heure: h.heure,
        classe: h.classe,
        actif: h.actif,
        note: h.note,
        jours: h.jours,
      };
      if (h.id === null) await tx.horaireLigne.create({ data: { ligneId, ...donnees } });
      else await tx.horaireLigne.update({ where: { id: h.id }, data: donnees });
    }
  }

  /** Réécrit les arrêts en gardant l'identifiant de ceux qui subsistent (reconnus par leur nom). */
  private async ecrireArrets(tx: Tx, ligneId: string, p: PublicationLigne): Promise<void> {
    const existants = await tx.arret.findMany({ where: { ligneId }, orderBy: { ordre: "asc" } });
    await tx.$executeRaw`UPDATE arret SET ordre = ordre + 10000 WHERE "ligneId" = ${ligneId}::uuid`;
    const libres = new Map<string, (typeof existants)[number]>();
    for (const a of existants.slice(1, -1)) libres.set(cleNom(a.nom), a);
    const reutilises = new Set<string>();
    const dernier = p.arrets.length - 1;
    for (const [ordre, a] of p.arrets.entries()) {
      let ancien: (typeof existants)[number] | undefined;
      if (ordre === 0) ancien = existants[0];
      else if (ordre === dernier && existants.length >= 2) ancien = existants[existants.length - 1];
      else ancien = libres.get(cleNom(a.nom));
      if (ancien && !reutilises.has(ancien.id)) {
        reutilises.add(ancien.id);
        await tx.arret.update({
          where: { id: ancien.id },
          data: { ordre, nom: a.nom, kmDepuisOrigine: a.kmDepuisOrigine, montee: a.montee },
        });
      } else {
        await tx.arret.create({
          data: {
            ligneId,
            ordre,
            nom: a.nom,
            kmDepuisOrigine: a.kmDepuisOrigine,
            montee: a.montee,
          },
        });
      }
    }
    const inutiles = existants.filter((a) => !reutilises.has(a.id)).map((a) => a.id);
    if (inutiles.length > 0) await tx.arret.deleteMany({ where: { id: { in: inutiles } } });
  }

  async programmer(
    ligneId: string,
    sections: SectionsLigne,
    effetDu: string,
    plan: PlanLigne,
    options: OptionsLigne,
  ): Promise<void> {
    await this.prisma.reglageLigne.upsert({
      where: { ligneId },
      create: {
        ligneId,
        capacite: plan.capacite,
        disposition: plan.disposition,
        rangees: plan.rangees,
        venteEnLigne: options.venteEnLigne,
        fusionAuto: options.fusionAuto,
        brouillon: json(sections),
        effetDu,
      },
      update: { brouillon: json(sections), effetDu, misAJourA: new Date() },
    });
  }
}

/* ------------------------------------------------------------------ bus */

@Injectable()
export class ParcBusPrisma extends ParcBus implements StockageAdministration {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private vue(
    b: Prisma.BusGetPayload<object>,
    fiche: { modele: string; annee: number } | undefined,
  ): BusAdmin {
    return {
      id: b.id,
      compagnieId: b.compagnieId,
      immatriculation: b.immatriculation,
      capacite: b.capacite,
      capaciteSoute: b.capaciteSoute,
      classe: b.classe,
      modele: fiche?.modele ?? "",
      annee: fiche?.annee ?? 0,
    };
  }

  async trouver(id: string): Promise<BusAdmin | null> {
    if (!estUuid(id)) return null;
    const b = await this.prisma.bus.findUnique({ where: { id } });
    if (!b) return null;
    const fiche = await this.prisma.busFiche.findUnique({ where: { busId: id } });
    return this.vue(b, fiche ?? undefined);
  }

  async lister(compagnieId: string): Promise<BusAdmin[]> {
    if (!estUuid(compagnieId)) return [];
    const bus = await this.prisma.bus.findMany({
      where: { compagnieId },
      orderBy: { immatriculation: "asc" },
    });
    const fiches = await this.prisma.busFiche.findMany({
      where: { busId: { in: bus.map((b) => b.id) } },
    });
    const parBus = new Map(fiches.map((f) => [f.busId, f]));
    return bus.map((b) => this.vue(b, parBus.get(b.id)));
  }

  async creer(bus: NouveauBus): Promise<BusAdmin | null> {
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const cree = await tx.bus.create({
          data: {
            compagnieId: bus.compagnieId,
            immatriculation: bus.immatriculation,
            capacite: bus.capacite,
            capaciteSoute: bus.capaciteSoute,
            classe: bus.classe,
          },
        });
        await tx.busFiche.create({
          data: { busId: cree.id, modele: bus.modele, annee: bus.annee },
        });
        return cree.id;
      });
      return await this.trouver(id);
    } catch (e) {
      if (unicite(e)) return null;
      throw e;
    }
  }

  async modifier(
    id: string,
    changement: Partial<Omit<NouveauBus, "compagnieId">>,
  ): Promise<BusAdmin | "immatriculation_prise" | null> {
    if (!estUuid(id)) return null;
    try {
      const trouve = await this.prisma.$transaction(async (tx) => {
        const { modele, annee, ...champsBus } = changement;
        const existe = await tx.bus.findUnique({ where: { id }, select: { id: true } });
        if (!existe) return false;
        if (Object.keys(champsBus).length > 0)
          await tx.bus.update({ where: { id }, data: champsBus });
        if (modele !== undefined || annee !== undefined) {
          await tx.busFiche.upsert({
            where: { busId: id },
            create: { busId: id, modele: modele ?? "", annee: annee ?? 0 },
            update: {
              ...(modele !== undefined ? { modele } : {}),
              ...(annee !== undefined ? { annee } : {}),
              misAJourA: new Date(),
            },
          });
        }
        return true;
      });
      return trouve ? await this.trouver(id) : null;
    } catch (e) {
      if (unicite(e)) return "immatriculation_prise";
      throw e;
    }
  }

  async capaciteMax(compagnieId: string, classe: ClasseDepart): Promise<number | null> {
    if (!estUuid(compagnieId)) return null;
    const r = await this.prisma.bus.aggregate({
      where: { compagnieId, classe },
      _max: { capacite: true },
    });
    return r._max.capacite;
  }
}

/* ------------------------------------------------------------------ départs */

const INCLUSION_DEPART = {
  ligne: { select: { code: true, origineGareId: true, compagnieId: true, dureeMinutes: true } },
} satisfies Prisma.DepartInclude;
type DepartPrisma = Prisma.DepartGetPayload<{ include: typeof INCLUSION_DEPART }>;

const versOccupation = (d: DepartPrisma): OccupationDepart => ({
  numero: d.numero,
  debutMs: d.heureDepart.getTime(),
  dureeMinutes: dureeEffective(d.ligne.dureeMinutes),
  busId: d.busId,
  chauffeurId: d.chauffeurId,
  convoyeurId: d.convoyeurId,
});

/** Fenêtre de recherche des départs qui pourraient chevaucher un autre (la plus longue durée admise : 48 h). */
const FENETRE_CONFLIT_MS = 48 * 3_600_000;

@Injectable()
export class ProgrammePrisma extends Programme implements StockageAdministration {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  private async billets(ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const lignes = await this.prisma.billet.groupBy({
      by: ["departId"],
      where: { departId: { in: ids }, etat: { not: "annule" } },
      _count: { _all: true },
    });
    return new Map(lignes.map((l) => [l.departId, l._count._all]));
  }

  private vue(d: DepartPrisma, billets: number): DepartListe & { compagnieId: string } {
    return {
      id: d.id,
      numero: d.numero,
      ligneId: d.ligneId,
      busId: d.busId,
      classe: d.classe,
      heureDepart: iso(d.heureDepart),
      etat: d.etat as EtatDepart,
      quai: d.quai,
      chauffeurId: d.chauffeurId,
      convoyeurId: d.convoyeurId,
      ligneCode: d.ligne.code,
      origineGareId: d.ligne.origineGareId,
      billetsVendus: billets,
      compagnieId: d.ligne.compagnieId,
    };
  }

  async trouver(id: string): Promise<(DepartListe & { compagnieId: string }) | null> {
    if (!estUuid(id)) return null;
    const d = await this.prisma.depart.findUnique({ where: { id }, include: INCLUSION_DEPART });
    if (!d) return null;
    return this.vue(d, (await this.billets([id])).get(id) ?? 0);
  }

  async lister(filtre: FiltreDeparts): Promise<DepartListe[]> {
    if (!estUuid(filtre.compagnieId)) return [];
    if (filtre.ligneId !== undefined && !estUuid(filtre.ligneId)) return [];
    const departs = await this.prisma.depart.findMany({
      where: {
        ligne: {
          compagnieId: filtre.compagnieId,
          ...(filtre.origineGareId ? { origineGareId: filtre.origineGareId } : {}),
        },
        ...(filtre.ligneId ? { ligneId: filtre.ligneId } : {}),
        ...(filtre.du || filtre.au
          ? {
              heureDepart: {
                ...(filtre.du ? { gte: new Date(filtre.du) } : {}),
                ...(filtre.au ? { lt: new Date(filtre.au) } : {}),
              },
            }
          : {}),
      },
      include: INCLUSION_DEPART,
      orderBy: [{ heureDepart: "asc" }, { numero: "asc" }],
    });
    const billets = await this.billets(departs.map((d) => d.id));
    return departs.map((d) => this.vue(d, billets.get(d.id) ?? 0));
  }

  /** Les départs de la compagnie qui retiennent l'une de ces ressources près de cet instant. */
  private async rivaux(
    tx: Tx,
    compagnieId: string,
    debut: Date,
    ressources: { busId: string | null; chauffeurId: string | null; convoyeurId: string | null },
    saufId: string | null,
  ): Promise<OccupationDepart[]> {
    const ou: Prisma.DepartWhereInput[] = [];
    if (ressources.busId) ou.push({ busId: ressources.busId });
    if (ressources.chauffeurId) ou.push({ chauffeurId: ressources.chauffeurId });
    if (ressources.convoyeurId) ou.push({ convoyeurId: ressources.convoyeurId });
    if (ou.length === 0) return [];
    const departs = await tx.depart.findMany({
      where: {
        OR: ou,
        ...(saufId ? { id: { not: saufId } } : {}),
        etat: { notIn: [...ETATS_LIBERANT] },
        ligne: { compagnieId },
        heureDepart: {
          gt: new Date(debut.getTime() - FENETRE_CONFLIT_MS),
          lt: new Date(debut.getTime() + FENETRE_CONFLIT_MS),
        },
      },
      include: INCLUSION_DEPART,
    });
    return departs.map(versOccupation);
  }

  async creer(depart: NouveauDepart, compagnieId: string): Promise<ResultatCreationDepart> {
    if (!estUuid(depart.ligneId)) return { ok: false, raison: "numero_pris" };
    const debut = new Date(depart.heureDepart);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(${VERROU_ADMINISTRATION}::int, hashtext(${`depart:${compagnieId}`}))`;
        const pris = await tx.depart.findUnique({
          where: { numero: depart.numero },
          select: { id: true },
        });
        if (pris) return { ok: false, raison: "numero_pris" } as const;
        const ligne = await tx.ligne.findUnique({
          where: { id: depart.ligneId },
          select: { dureeMinutes: true },
        });
        const rivaux = await this.rivaux(tx, compagnieId, debut, depart, null);
        const conflit = chercherConflit(
          {
            numero: depart.numero,
            debutMs: debut.getTime(),
            dureeMinutes: dureeEffective(ligne?.dureeMinutes ?? 0),
            busId: depart.busId,
            chauffeurId: depart.chauffeurId,
            convoyeurId: depart.convoyeurId,
          },
          rivaux,
        );
        if (conflit) return { ok: false, raison: "occupe", ...conflit } as const;
        await tx.depart.create({
          data: {
            id: depart.id,
            numero: depart.numero,
            ligneId: depart.ligneId,
            busId: depart.busId,
            classe: depart.classe,
            heureDepart: debut,
            etat: depart.etat,
            historique: json(depart.historique),
            quai: depart.quai,
            chauffeurId: depart.chauffeurId,
            convoyeurId: depart.convoyeurId,
          },
        });
        return { ok: true } as const;
      });
    } catch (e) {
      if (unicite(e)) return { ok: false, raison: "numero_pris" };
      throw e;
    }
  }

  async equiper(id: string, changement: ChangementEquipage): Promise<ResultatEquipage> {
    if (!estUuid(id)) return { ok: false, raison: "inconnu" };
    return this.prisma.$transaction(async (tx): Promise<ResultatEquipage> => {
      const avant = await tx.depart.findUnique({ where: { id }, include: INCLUSION_DEPART });
      if (!avant) return { ok: false, raison: "inconnu" };
      const compagnieId = avant.ligne.compagnieId;
      await tx.$executeRaw`
        SELECT pg_advisory_xact_lock(${VERROU_ADMINISTRATION}::int, hashtext(${`depart:${compagnieId}`}))`;
      // Relu sous le verrou : l'état et l'équipage ont pu changer pendant l'attente.
      const d = await tx.depart.findUnique({ where: { id }, include: INCLUSION_DEPART });
      if (!d) return { ok: false, raison: "inconnu" };
      if (!(ETATS_MODIFIABLES as readonly string[]).includes(d.etat)) {
        return { ok: false, raison: "etat", etat: d.etat };
      }
      const billets = await tx.billet.count({ where: { departId: id, etat: { not: "annule" } } });
      if (changement.busId !== undefined && changement.busId !== d.busId && billets > 0) {
        return { ok: false, raison: "billets_vendus", billets };
      }
      const apres = {
        busId: changement.busId === undefined ? d.busId : changement.busId,
        chauffeurId: changement.chauffeurId === undefined ? d.chauffeurId : changement.chauffeurId,
        convoyeurId: changement.convoyeurId === undefined ? d.convoyeurId : changement.convoyeurId,
        quai: changement.quai === undefined ? d.quai : changement.quai,
      };
      const rivaux = await this.rivaux(tx, compagnieId, d.heureDepart, apres, id);
      const conflit = chercherConflit({ ...versOccupation(d), ...apres }, rivaux);
      if (conflit) return { ok: false, raison: "occupe", ...conflit };
      const modifie = await tx.depart.update({
        where: { id },
        data: apres,
        include: INCLUSION_DEPART,
      });
      return { ok: true, depart: this.vue(modifie, billets) };
    });
  }

  async departsAVenirDuBus(busId: string): Promise<number> {
    if (!estUuid(busId)) return 0;
    return this.prisma.depart.count({
      where: { busId, etat: { in: [...ETATS_MODIFIABLES] } },
    });
  }
}

/* ------------------------------------------------------------------ appareils */

const versEnrolement = (e: Prisma.EnrolementAppareilGetPayload<object>): EnrolementAppareil => ({
  appareilId: e.appareilId,
  compagnieId: e.compagnieId,
  gareId: e.gareId,
  libelle: e.libelle,
  codeExpireA: e.codeExpireA ? iso(e.codeExpireA) : null,
  enroleA: e.enroleA ? iso(e.enroleA) : null,
  actif: e.secretHache !== null,
  creeA: iso(e.creeA),
});

@Injectable()
export class RegistreAppareilsPrisma extends RegistreAppareils implements StockageAdministration {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  exclusif<T>(compagnieId: string, travail: () => Promise<T>): Promise<T> {
    // La transaction ne sert qu'à tenir le verrou le temps du travail (les lectures et écritures du travail
    // passent par le client ordinaire, que d'autres déclarations n'atteignent qu'après avoir pris ce verrou).
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(${VERROU_ADMINISTRATION}::int, hashtext(${`appareil:${compagnieId}`}))`;
        return travail();
      },
      { timeout: 30_000, maxWait: 30_000 },
    );
  }

  async declarer(d: DeclarationAppareil): Promise<void> {
    await this.prisma.enrolementAppareil.create({
      data: {
        appareilId: d.appareilId,
        compagnieId: d.compagnieId,
        gareId: d.gareId,
        libelle: d.libelle,
        codeHache: d.codeHache,
        codeExpireA: new Date(d.codeExpireA),
        creePar: d.creePar,
        creeA: new Date(d.creeA),
      },
    });
  }

  async trouver(appareilId: string): Promise<EnrolementAppareil | null> {
    const e = await this.prisma.enrolementAppareil.findUnique({ where: { appareilId } });
    return e ? versEnrolement(e) : null;
  }

  async lister(filtre: { compagnieId: string; gareId?: string }): Promise<EnrolementAppareil[]> {
    if (!estUuid(filtre.compagnieId)) return [];
    if (filtre.gareId !== undefined && !estUuid(filtre.gareId)) return [];
    const lignes = await this.prisma.enrolementAppareil.findMany({
      where: {
        compagnieId: filtre.compagnieId,
        ...(filtre.gareId ? { gareId: filtre.gareId } : {}),
      },
      orderBy: [{ creeA: "asc" }, { appareilId: "asc" }],
    });
    return lignes.map(versEnrolement);
  }

  async nouveauCode(appareilId: string, codeHache: string, expireA: string): Promise<boolean> {
    const r = await this.prisma.enrolementAppareil.updateMany({
      where: { appareilId },
      data: { codeHache, codeExpireA: new Date(expireA) },
    });
    return r.count > 0;
  }

  async enroler(codeHache: string, secretHache: string, at: string): Promise<ResultatEnrolement> {
    const instant = new Date(at);
    // Un seul UPDATE : de deux téléphones qui présentent le même code, la base n'en laisse passer qu'un.
    const lignes = await this.prisma.$queryRaw<{ appareilId: string }[]>`
      UPDATE enrolement_appareil
         SET "codeHache" = NULL, "codeExpireA" = NULL, "secretHache" = ${secretHache}, "enroleA" = ${instant}
       WHERE "codeHache" = ${codeHache} AND "codeExpireA" > ${instant}
   RETURNING "appareilId"`;
    const pris = lignes[0];
    if (!pris) {
      const existe = await this.prisma.enrolementAppareil.findFirst({
        where: { codeHache },
        select: { appareilId: true },
      });
      return { ok: false, raison: existe ? "expire" : "inconnu" };
    }
    const e = await this.prisma.enrolementAppareil.findUniqueOrThrow({
      where: { appareilId: pris.appareilId },
    });
    return { ok: true, enrolement: versEnrolement(e) };
  }

  async secretValide(appareilId: string, secretHache: string): Promise<boolean> {
    const e = await this.prisma.enrolementAppareil.findFirst({
      where: { appareilId, secretHache },
      select: { appareilId: true },
    });
    return e !== null;
  }

  async retirer(appareilId: string): Promise<void> {
    await this.prisma.enrolementAppareil.updateMany({
      where: { appareilId },
      data: { codeHache: null, codeExpireA: null, secretHache: null },
    });
  }
}

const versOrdre = (c: Prisma.CommandeAppareilGetPayload<object>): CommandeAppareil => ({
  id: c.id,
  appareilId: c.appareilId,
  type: "effacer",
  emiseA: iso(c.emiseA),
  emisePar: c.emisePar,
  motif: c.motif,
  acquitteeA: c.acquitteeA ? iso(c.acquitteeA) : null,
});

@Injectable()
export class OrdresAppareilsPrisma extends OrdresAppareils implements StockageAdministration {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async emettre(ordre: CommandeAppareil): Promise<CommandeAppareil | "deja_en_attente"> {
    try {
      const c = await this.prisma.commandeAppareil.create({
        data: {
          id: ordre.id,
          appareilId: ordre.appareilId,
          type: ordre.type,
          emiseA: new Date(ordre.emiseA),
          emisePar: ordre.emisePar,
          motif: ordre.motif,
        },
      });
      return versOrdre(c);
    } catch (e) {
      if (unicite(e)) return "deja_en_attente";
      throw e;
    }
  }

  async enAttente(appareilId: string): Promise<CommandeAppareil | null> {
    const c = await this.prisma.commandeAppareil.findFirst({
      where: { appareilId, acquitteeA: null },
      orderBy: { emiseA: "asc" },
    });
    return c ? versOrdre(c) : null;
  }

  async trouver(id: string): Promise<CommandeAppareil | null> {
    if (!estUuid(id)) return null;
    const c = await this.prisma.commandeAppareil.findUnique({ where: { id } });
    return c ? versOrdre(c) : null;
  }

  async dernier(appareilId: string): Promise<CommandeAppareil | null> {
    const c = await this.prisma.commandeAppareil.findFirst({
      where: { appareilId },
      orderBy: { emiseA: "desc" },
    });
    return c ? versOrdre(c) : null;
  }

  async acquitter(
    id: string,
    at: string,
    rapport: RapportEffacement,
  ): Promise<ResultatAcquittement> {
    if (!estUuid(id)) return "inconnue";
    // L'accusé ne s'écrit qu'une fois : l'UPDATE ne touche que l'ordre encore en attente.
    const r = await this.prisma.commandeAppareil.updateMany({
      where: { id, acquitteeA: null },
      data: { acquitteeA: new Date(at), rapport: json(rapport) },
    });
    if (r.count > 0) return "ok";
    const existe = await this.prisma.commandeAppareil.findUnique({
      where: { id },
      select: { id: true },
    });
    return existe ? "deja_acquittee" : "inconnue";
  }
}

export type { NouveauDepart };
