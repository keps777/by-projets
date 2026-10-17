import { Injectable } from "@nestjs/common";
import { Horloge } from "../socle/horloge";
import type { AlerteSync } from "../sync/ports";
import { versIsoDouala } from "../sync/temps";
import {
  AlertesNumerotation,
  PlagesAttribuees,
  RegistreNumeros,
  type AttributionPlage,
  type EntreeRegistre,
} from "./ports";
import {
  APPAREIL_SERVEUR,
  GENRES_NUMERO,
  PLAGE_EN_LIGNE,
  analyserNumeros,
  porteeDe,
  uuidDeterministe,
  type GenreNumero,
  type Plage,
} from "./regles";

export interface PerimetreControle {
  gareId?: string | null;
  compagnieId?: string | null;
}

const quatre = (n: number): string => String(n).padStart(4, "0");

/** « 0004–0006, 0010 » : les numéros manquants, regroupés quand ils se suivent. */
export function formaterNumeros(numeros: readonly number[]): string {
  const morceaux: string[] = [];
  let i = 0;
  while (i < numeros.length) {
    let j = i;
    while (j + 1 < numeros.length && numeros[j + 1] === numeros[j]! + 1) j++;
    morceaux.push(j > i ? `${quatre(numeros[i]!)}–${quatre(numeros[j]!)}` : quatre(numeros[i]!));
    i = j + 1;
  }
  return morceaux.join(", ");
}

/**
 * Contrôle de fin de journée : pour chaque plage attribuée, les numéros reçus couvrent-ils la plage
 * sans trou ? Un trou produit une alerte **nominative** (qui porte l'appareil, quels numéros
 * manquent) que le rapport du soir (`/(patron)/rapport`) et le superviseur lisent.
 *
 * Le contrôle est rejouable : l'identifiant de l'alerte est déterministe (jour, appareil, genre),
 * donc relancer le contrôle met l'alerte à jour au lieu d'en écrire une autre, et un trou comblé
 * par une synchronisation tardive referme l'alerte.
 */
@Injectable()
export class ControleJourneeService {
  constructor(
    private readonly plages: PlagesAttribuees,
    private readonly registre: RegistreNumeros,
    private readonly alertes: AlertesNumerotation,
    private readonly horloge: Horloge,
  ) {}

  /** Contrôle le jour donné pour le périmètre, et rend les alertes ouvertes de ce périmètre. */
  async controler(jour: string, perimetre: PerimetreControle = {}): Promise<AlerteSync[]> {
    const maintenant = versIsoDouala(this.horloge.maintenant());
    const entrees = await this.registre.duJour(jour);
    const existantes = new Map(
      (await this.alertes.lister({ jour, ...cible(perimetre) })).map((a) => [a.id, a]),
    );
    const vues = new Set<string>();

    const traiter = async (id: string, trous: number[], fabrique: () => AlerteSync) => {
      vues.add(id);
      const avant = existantes.get(id);
      if (trous.length === 0) {
        if (avant && avant.resolueA === null) await this.alertes.resoudre(id, maintenant);
        return;
      }
      const alerte = fabrique();
      // Une alerte déjà ouverte garde sa date de création ; une alerte refermée qui revient repart à neuf.
      await this.alertes.enregistrer(
        avant && avant.resolueA === null ? { ...alerte, creeeA: avant.creeeA } : alerte,
      );
    };

    const attributions = await this.plages.lister(cible(perimetre));
    for (const a of attributions) {
      const portee = porteeDe(a);
      for (const genre of GENRES_NUMERO) {
        const analyse = analyserNumeros(
          entrees.filter((e) => e.portee === portee && e.genre === genre).map((e) => e.numero),
          a.plage,
        );
        const id = idAlerte(jour, a.appareilId, genre);
        await traiter(id, analyse.trous, () =>
          alerteAppareil(id, jour, genre, a, analyse.trous, analyse.dernier, maintenant),
        );
      }
    }

    // Les numéros du serveur (4001–9999) : pris dans l'ordre, ils ne doivent jamais avoir de trou.
    const enLigne = entrees.filter(
      (e) => e.appareilId === APPAREIL_SERVEUR && dansPerimetre(e, perimetre),
    );
    const groupes = new Map<string, EntreeRegistre[]>();
    for (const e of enLigne) {
      const cle = `${e.portee}|${e.genre}`;
      groupes.set(cle, [...(groupes.get(cle) ?? []), e]);
    }
    for (const lignes of groupes.values()) {
      const premiere = lignes[0]!;
      const analyse = analyserNumeros(
        lignes.map((e) => e.numero),
        PLAGE_EN_LIGNE,
      );
      const id = idAlerte(jour, `${APPAREIL_SERVEUR}:${premiere.portee}`, premiere.genre);
      await traiter(id, analyse.trous, () =>
        alerteEnLigne(id, jour, premiere, analyse.trous, analyse.dernier, maintenant),
      );
    }

    // Une alerte ouverte dont la plage n'existe plus (appareil libéré) n'a plus rien à contrôler.
    for (const [id, alerte] of existantes) {
      if (!vues.has(id) && alerte.resolueA === null) await this.alertes.resoudre(id, maintenant);
    }
    return this.lister(jour, perimetre);
  }

  /** Les alertes de numérotation ouvertes pour un jour. */
  lister(jour: string, perimetre: PerimetreControle = {}): Promise<AlerteSync[]> {
    return this.alertes.lister({ jour, ouvertesSeulement: true, ...cible(perimetre) });
  }
}

/** Seules les clés données filtrent : `undefined` veut dire « sans filtre ». */
function cible(p: PerimetreControle): PerimetreControle {
  return {
    ...(p.gareId !== undefined ? { gareId: p.gareId } : {}),
    ...(p.compagnieId !== undefined ? { compagnieId: p.compagnieId } : {}),
  };
}

function dansPerimetre(e: EntreeRegistre, p: PerimetreControle): boolean {
  return (
    (p.gareId === undefined || e.gareId === p.gareId) &&
    (p.compagnieId === undefined || e.compagnieId === p.compagnieId)
  );
}

const idAlerte = (jour: string, source: string, genre: GenreNumero): string =>
  uuidDeterministe(`trou_dans_la_plage:${jour}:${source}:${genre}`);

const NOM_GENRE: Record<GenreNumero, string> = { billet: "billets", colis: "colis" };

function alerteAppareil(
  id: string,
  jour: string,
  genre: GenreNumero,
  a: AttributionPlage,
  trous: number[],
  dernierRecu: number | null,
  creeeA: string,
): AlerteSync {
  const qui = a.titulaire?.nom ?? `l'appareil ${a.appareilId}`;
  return {
    id,
    type: "trou_dans_la_plage",
    gravite: "alerte",
    creeeA,
    appareilId: a.appareilId,
    auteurId: a.titulaire?.id ?? null,
    evenementId: null,
    gareId: a.gareId,
    compagnieId: a.compagnieId,
    details: {
      jour,
      genre,
      titulaire: a.titulaire,
      plage: { ...a.plage },
      numerosManquants: trous,
      nbManquants: trous.length,
      dernierRecu,
      message:
        `Il manque ${trous.length > 1 ? "les numéros" : "le numéro"} ${formaterNumeros(trous)} ` +
        `(${NOM_GENRE[genre]}) dans la plage ${quatre(a.plage.debut)}–${quatre(a.plage.fin)} de ${qui}`,
    },
    resolueA: null,
  };
}

function alerteEnLigne(
  id: string,
  jour: string,
  e: EntreeRegistre,
  trous: number[],
  dernierRecu: number | null,
  creeeA: string,
): AlerteSync {
  return {
    id,
    type: "trou_dans_la_plage",
    gravite: "alerte",
    creeeA,
    appareilId: null,
    auteurId: null,
    evenementId: null,
    gareId: e.gareId,
    compagnieId: e.compagnieId,
    details: {
      jour,
      genre: e.genre,
      titulaire: null,
      source: "en_ligne",
      plage: { ...PLAGE_EN_LIGNE } satisfies Plage,
      numerosManquants: trous,
      nbManquants: trous.length,
      dernierRecu,
      message:
        `Il manque ${trous.length > 1 ? "les numéros" : "le numéro"} ${formaterNumeros(trous)} ` +
        `(${NOM_GENRE[e.genre]} en ligne) dans la plage du serveur ` +
        `${quatre(PLAGE_EN_LIGNE.debut)}–${quatre(PLAGE_EN_LIGNE.fin)}`,
    },
    resolueA: null,
  };
}
