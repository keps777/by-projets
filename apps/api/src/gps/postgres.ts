import { Injectable } from "@nestjs/common";
import type { Prisma } from "../socle/db/generated/client";
import { PrismaService } from "../socle/db/prisma.service";
import type { AlerteArret, EtatSuivi, Position, PrevenirProche, SoupconArret } from "./modeles";
import { AlertesArret, EtatsSuivi, Positions, PrevenirProches } from "./ports";
import { versIsoDouala } from "./temps";

/**
 * Adaptateurs PostgreSQL (Prisma) du suivi GPS (AM-170) : `Positions`, `EtatsSuivi`, `AlertesArret`
 * et `PrevenirProches`. Tables `position_gps`, `suivi_depart`, `alerte_arret` et `prevenir_proche`
 * (migration « gps_suivi »). Les ports qui lisent les autres modules (réseau, billets, proches,
 * missions, offres) et les avis restent à brancher, voir le README.
 *
 * Les garanties tiennent dans la base, pas dans le code :
 * - **un lot renvoyé ne change rien** : la clé d'une position est (sujet, auteur, instant),
 *   l'écriture est un `INSERT … ON CONFLICT DO NOTHING` et le nombre de lignes écrites dit si la
 *   position était nouvelle ;
 * - **deux appareils, un seul état** : `ecrire` est un `UPDATE … WHERE version = $n - 1` (ou un
 *   `INSERT … ON CONFLICT DO NOTHING` pour la version 1) ; zéro ligne touchée = quelqu'un d'autre a
 *   écrit, l'appelant relit et recommence ;
 * - **une seule alerte ouverte par départ** : index unique partiel sur `alerte_arret` ;
 * - **un SMS au proche ne part pas deux fois** : `marquerEnvoye` est un
 *   `UPDATE … WHERE envoyeA IS NULL`.
 *
 * Les instants sortent en heure de Douala (`+01:00`), comme le reste du module.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const iso = (d: Date): string => versIsoDouala(d);
const isoOuNull = (d: Date | null): string | null => (d === null ? null : versIsoDouala(d));

/* ------------------------------------------------------------------ positions */

type LignePosition = Prisma.PositionGpsGetPayload<object>;

function versPosition(l: LignePosition): Position {
  return {
    sujet: l.sujet,
    auteurId: l.auteurId,
    instant: iso(l.instant),
    latitude: l.latitude,
    longitude: l.longitude,
    precisionM: l.precisionM,
    vitesseKmh: l.vitesseKmh,
    recuA: iso(l.recuA),
  };
}

@Injectable()
export class PositionsPrisma extends Positions {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ajouter(p: Position): Promise<boolean> {
    // ON CONFLICT DO NOTHING : le nombre de lignes écrites dit si la position était nouvelle.
    const { count } = await this.prisma.positionGps.createMany({
      data: [
        {
          sujet: p.sujet,
          auteurId: p.auteurId,
          instant: new Date(p.instant),
          latitude: p.latitude,
          longitude: p.longitude,
          precisionM: p.precisionM,
          vitesseKmh: p.vitesseKmh,
          recuA: new Date(p.recuA),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1;
  }

  async derniere(sujet: string): Promise<Position | null> {
    const l = await this.prisma.positionGps.findFirst({
      where: { sujet },
      orderBy: [{ instant: "desc" }, { recuA: "desc" }],
    });
    return l ? versPosition(l) : null;
  }

  async recentes(sujet: string, nombre: number): Promise<Position[]> {
    if (nombre <= 0) return [];
    const lignes = await this.prisma.positionGps.findMany({
      where: { sujet },
      orderBy: [{ instant: "desc" }, { recuA: "desc" }],
      take: nombre,
    });
    return lignes.reverse().map(versPosition);
  }
}

/* ------------------------------------------------------------------ état du suivi */

type LigneEtat = Prisma.SuiviDepartGetPayload<object>;

function versEtat(l: LigneEtat): EtatSuivi {
  return {
    departId: l.departId,
    version: l.version,
    derniere:
      l.derniereInstant !== null &&
      l.derniereLatitude !== null &&
      l.derniereLongitude !== null &&
      l.derniereVitesseKmh !== null
        ? {
            instant: iso(l.derniereInstant),
            latitude: l.derniereLatitude,
            longitude: l.derniereLongitude,
            vitesseKmh: l.derniereVitesseKmh,
          }
        : null,
    progressionKm: l.progressionKm,
    passages: l.passages as Record<string, string>,
    immobile:
      l.immobileDepuis !== null && l.immobileLatitude !== null && l.immobileLongitude !== null
        ? {
            depuis: iso(l.immobileDepuis),
            latitude: l.immobileLatitude,
            longitude: l.immobileLongitude,
          }
        : null,
    alerteId: l.alerteId,
  };
}

/** Les colonnes d'un état (sans la clé ni la version). */
function colonnesEtat(e: EtatSuivi) {
  return {
    derniereInstant: e.derniere ? new Date(e.derniere.instant) : null,
    derniereLatitude: e.derniere?.latitude ?? null,
    derniereLongitude: e.derniere?.longitude ?? null,
    derniereVitesseKmh: e.derniere?.vitesseKmh ?? null,
    progressionKm: e.progressionKm,
    passages: e.passages as Prisma.InputJsonValue,
    immobileDepuis: e.immobile ? new Date(e.immobile.depuis) : null,
    immobileLatitude: e.immobile?.latitude ?? null,
    immobileLongitude: e.immobile?.longitude ?? null,
    alerteId: e.alerteId,
  };
}

@Injectable()
export class EtatsSuiviPrisma extends EtatsSuivi {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async lire(departId: string): Promise<EtatSuivi | null> {
    if (!UUID.test(departId)) return null;
    const l = await this.prisma.suiviDepart.findUnique({ where: { departId } });
    return l ? versEtat(l) : null;
  }

  async ecrire(etat: EtatSuivi): Promise<boolean> {
    if (etat.version === 1) {
      // Première écriture : si une autre instance a créé la ligne entre-temps, rien n'est écrit.
      const { count } = await this.prisma.suiviDepart.createMany({
        data: [{ departId: etat.departId, version: 1, ...colonnesEtat(etat) }],
        skipDuplicates: true,
      });
      return count === 1;
    }
    // Comparer et remplacer : UPDATE … WHERE departId = $1 AND version = $2 - 1.
    const { count } = await this.prisma.suiviDepart.updateMany({
      where: { departId: etat.departId, version: etat.version - 1 },
      data: { version: etat.version, ...colonnesEtat(etat) },
    });
    return count === 1;
  }
}

/* ------------------------------------------------------------------ alertes d'arrêt */

type LigneAlerte = Prisma.AlerteArretGetPayload<object>;

function versAlerte(l: LigneAlerte): AlerteArret {
  return {
    id: l.id,
    departId: l.departId,
    compagnieId: l.compagnieId,
    immatriculation: l.immatriculation,
    apres: l.apres,
    arretDepuis: iso(l.arretDepuis),
    ouverteA: iso(l.ouverteA),
    latitude: l.latitude,
    longitude: l.longitude,
    soupcon: l.soupcon as SoupconArret,
    aBord: l.aBord,
    resolueA: isoOuNull(l.resolueA),
  };
}

@Injectable()
export class AlertesArretPrisma extends AlertesArret {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async ouvrir(a: AlerteArret): Promise<AlerteArret | null> {
    // ON CONFLICT DO NOTHING couvre l'index unique partiel « une alerte ouverte par départ » : de deux
    // positions simultanées qui franchissent les dix minutes, une seule ouvre l'alerte.
    const { count } = await this.prisma.alerteArret.createMany({
      data: [
        {
          id: a.id,
          departId: a.departId,
          compagnieId: a.compagnieId,
          immatriculation: a.immatriculation,
          apres: a.apres,
          arretDepuis: new Date(a.arretDepuis),
          ouverteA: new Date(a.ouverteA),
          latitude: a.latitude,
          longitude: a.longitude,
          soupcon: a.soupcon,
          aBord: a.aBord,
          resolueA: a.resolueA === null ? null : new Date(a.resolueA),
        },
      ],
      skipDuplicates: true,
    });
    return count === 1 ? { ...a } : null;
  }

  async resoudre(id: string, a: string): Promise<AlerteArret | null> {
    if (!UUID.test(id)) return null;
    // UPDATE … WHERE id = $1 AND resolueA IS NULL : une seule des fermetures simultanées réussit.
    const { count } = await this.prisma.alerteArret.updateMany({
      where: { id, resolueA: null },
      data: { resolueA: new Date(a) },
    });
    if (count !== 1) return null;
    return this.trouver(id);
  }

  async trouver(id: string): Promise<AlerteArret | null> {
    if (!UUID.test(id)) return null;
    const l = await this.prisma.alerteArret.findUnique({ where: { id } });
    return l ? versAlerte(l) : null;
  }

  async ouvertes(compagnieId: string): Promise<AlerteArret[]> {
    if (!UUID.test(compagnieId)) return [];
    const lignes = await this.prisma.alerteArret.findMany({
      where: { compagnieId, resolueA: null },
      orderBy: [{ ouverteA: "asc" }, { id: "asc" }],
    });
    return lignes.map(versAlerte);
  }
}

/* ------------------------------------------------------------------ prévenir un proche */

type LignePrevenir = Prisma.PrevenirProcheGetPayload<object>;

function versPrevenir(l: LignePrevenir): PrevenirProche {
  return {
    billetId: l.billetId,
    procheId: l.procheId,
    voyageurId: l.voyageurId,
    departId: l.departId,
    minutesAvantArrivee: l.minutesAvantArrivee,
    actif: l.actif,
    creeA: iso(l.creeA),
    envoyeA: isoOuNull(l.envoyeA),
  };
}

@Injectable()
export class PrevenirProchesPrisma extends PrevenirProches {
  readonly durable = true;

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async enregistrer(
    p: Omit<PrevenirProche, "envoyeA" | "creeA"> & { creeA: string },
  ): Promise<PrevenirProche> {
    // INSERT … ON CONFLICT (billetId, procheId) DO UPDATE : la date de création et l'envoi déjà fait
    // de la ligne existante sont conservés.
    const l = await this.prisma.prevenirProche.upsert({
      where: { billetId_procheId: { billetId: p.billetId, procheId: p.procheId } },
      create: {
        billetId: p.billetId,
        procheId: p.procheId,
        voyageurId: p.voyageurId,
        departId: p.departId,
        minutesAvantArrivee: p.minutesAvantArrivee,
        actif: p.actif,
        creeA: new Date(p.creeA),
      },
      update: {
        voyageurId: p.voyageurId,
        departId: p.departId,
        minutesAvantArrivee: p.minutesAvantArrivee,
        actif: p.actif,
      },
    });
    return versPrevenir(l);
  }

  async deBillet(billetId: string): Promise<PrevenirProche[]> {
    if (!UUID.test(billetId)) return [];
    const lignes = await this.prisma.prevenirProche.findMany({
      where: { billetId },
      orderBy: [{ creeA: "asc" }, { procheId: "asc" }],
    });
    return lignes.map(versPrevenir);
  }

  async enAttente(departId: string): Promise<PrevenirProche[]> {
    if (!UUID.test(departId)) return [];
    const lignes = await this.prisma.prevenirProche.findMany({
      where: { departId, actif: true, envoyeA: null },
      orderBy: [{ creeA: "asc" }, { billetId: "asc" }, { procheId: "asc" }],
    });
    return lignes.map(versPrevenir);
  }

  async marquerEnvoye(billetId: string, procheId: string, a: string): Promise<boolean> {
    if (!UUID.test(billetId)) return false;
    // UPDATE … WHERE envoyeA IS NULL : un seul des appels simultanés note l'envoi.
    const { count } = await this.prisma.prevenirProche.updateMany({
      where: { billetId, procheId, envoyeA: null },
      data: { envoyeA: new Date(a) },
    });
    return count === 1;
  }

  async desactiver(billetId: string, procheId: string): Promise<PrevenirProche | null> {
    if (!UUID.test(billetId)) return null;
    const { count } = await this.prisma.prevenirProche.updateMany({
      where: { billetId, procheId },
      data: { actif: false },
    });
    if (count === 0) return null;
    const l = await this.prisma.prevenirProche.findUnique({
      where: { billetId_procheId: { billetId, procheId } },
    });
    return l ? versPrevenir(l) : null;
  }
}
