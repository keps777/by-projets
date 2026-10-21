import {
  GenerateurNumeros,
  aammjjDouala,
  numeroBillet,
  numeroColis,
  plageGuichet,
  versIsoDouala,
} from "@afrimove/domain";
import type { EtatGenerateur, Plage } from "@afrimove/domain";
import { agence as c } from "@afrimove/contrats";
import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { useClientApi } from "../infra/index";
import type { Horloge } from "../infra/index";
import type { DefinitionEvenementQuelconque } from "./operations";

/**
 * L'appareil de l'agent (téléphone du guichet, du convoyeur, du chauffeur…). C'est lui, et lui
 * seul, qui crée les événements : l'identifiant (UUID) et le numéro de plage sont fixés au moment
 * du geste, hors ligne comme en ligne, avant tout aller-retour avec le serveur.
 */

export interface OptionsAppareilAgence {
  appareilId: string;
  /** La personne connectée sur l'appareil. */
  auteurId: string;
  /** Code agence de 3 lettres : « ALP ». */
  agence: string;
  /** Code gare de 3 lettres : « DLA ». */
  gare: string;
  /** Plage de numéros de l'appareil (voir `plageGuichet`, `plageConvoyeur` du domaine). */
  plage: Plage;
  horloge: Horloge;
  /** État du générateur de numéros, relu de la base locale après un redémarrage. */
  etat?: EtatGenerateur;
  /** Source d'UUID, injectable pour des tests déterministes. Défaut : `crypto.randomUUID`. */
  genererUuid?: () => string;
}

/** Les deux compteurs de la plage d'un appareil : billets et colis. */
export type GenreNumero = "billet" | "colis";

export interface AppareilAgence {
  readonly appareilId: string;
  readonly auteurId: string;
  readonly agence: string;
  readonly gare: string;
  readonly plage: Plage;
  /** Un identifiant pour un document créé hors ligne (billet, colis, dépense, incident…). */
  nouvelId(): string;
  /**
   * Crée l'événement d'une écriture : UUID neuf, heure de Douala, appareil et auteur, cible, et —
   * si le type crée un document numéroté — le prochain numéro de la plage de l'appareil.
   * Appeler cette fonction **consomme** un numéro : l'événement doit ensuite être envoyé (ou mis
   * en file hors ligne), jamais jeté, sinon la plage aurait un trou.
   */
  creerEvenement<E extends DefinitionEvenementQuelconque>(
    definition: E,
    donnees: c.DonneesDe<E>,
  ): c.EvenementDe<E>;
  /** Numéro de document (AGENCE-GARE-AAMMJJ-NNNN, C-GARE-AAMMJJ-NNNN) d'un événement numéroté. */
  numeroDe(evenement: { type: string; at: string; numeroPlage: number | null }): string | null;
  /**
   * Le numéro que prendra le prochain document de ce genre : le plus avancé du compteur local et de
   * `annonce`, le « prochain numéro » que le serveur affiche (`prochainNumero` du contexte de vente ou du
   * formulaire de colis). Ne consomme rien. `null` si la plage est épuisée.
   */
  prochainNumero(genre: GenreNumero, annonce?: number): { sequence: number; numero: string } | null;
  /**
   * Avance le compteur local jusqu'au « prochain numéro » annoncé par le serveur, quand celui-ci est plus
   * loin : un téléphone neuf (ou au stockage vidé) sur un guichet qui a déjà vendu repart ainsi de la suite
   * de la plage, pas de son début (recette AM-181, anomalie A9). Ne recule jamais (les numéros pris hors
   * ligne, pas encore envoyés, restent à l'appareil : AM-160) et ignore un numéro hors de la plage de
   * l'appareil. À appeler juste avant `creerEvenement`.
   */
  aligner(genre: GenreNumero, annonce: number): void;
  /** État du générateur, à garder dans la base locale pour survivre à un redémarrage. */
  exporterEtat(): EtatGenerateur;
  /** Numéros de billet qui restent aujourd'hui dans la plage. */
  billetsRestants(): number;
}

function uuidParDefaut(): string {
  const crypto = globalThis.crypto;
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID();
  const octets = new Uint8Array(16);
  crypto.getRandomValues(octets);
  octets[6] = (octets[6]! & 0x0f) | 0x40;
  octets[8] = (octets[8]! & 0x3f) | 0x80;
  const hex = [...octets].map((o) => o.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Les écritures qui numérotent un colis ; toutes les autres numérotent un billet. */
const TYPES_COLIS: ReadonlySet<string> = new Set(["colis.enregistre"]);

export function creerAppareilAgence(options: OptionsAppareilAgence): AppareilAgence {
  const uuid = options.genererUuid ?? uuidParDefaut;
  const creerGenerateur = (etat?: EtatGenerateur) =>
    new GenerateurNumeros({
      agence: options.agence,
      gare: options.gare,
      plage: options.plage,
      ...(etat ? { etat } : {}),
    });
  let generateur = creerGenerateur(options.etat);

  /** Prochain numéro du compteur local pour le jour de `at` (début de plage tant que rien n'est pris ce jour-là). */
  const compteurLocal = (genre: GenreNumero, at: number): number => {
    const etat = generateur.exporter();
    const compteurs = genre === "colis" ? etat.colis : etat.billets;
    return compteurs[aammjjDouala(at)] ?? options.plage.debut;
  };
  const dansLaPlage = (sequence: number): boolean =>
    Number.isInteger(sequence) && sequence >= options.plage.debut && sequence <= options.plage.fin;

  return {
    appareilId: options.appareilId,
    auteurId: options.auteurId,
    agence: options.agence,
    gare: options.gare,
    plage: options.plage,
    nouvelId: uuid,

    creerEvenement(definition, donnees) {
      const at = options.horloge.maintenant();
      let numeroPlage: number | null = null;
      if (definition.numerote) {
        numeroPlage = TYPES_COLIS.has(definition.type)
          ? generateur.prochainColis(at).sequence
          : generateur.prochainBillet(at).sequence;
      }
      return {
        id: uuid(),
        type: definition.type,
        at: versIsoDouala(at),
        appareilId: options.appareilId,
        auteurId: options.auteurId,
        cible: definition.cible(donnees),
        numeroPlage,
        donnees,
      } as unknown as c.EvenementDe<typeof definition>;
    },

    numeroDe(evenement) {
      if (evenement.numeroPlage === null) return null;
      const base = { gare: options.gare, at: evenement.at, sequence: evenement.numeroPlage };
      return TYPES_COLIS.has(evenement.type)
        ? numeroColis(base)
        : numeroBillet({ ...base, agence: options.agence });
    },

    prochainNumero(genre, annonce) {
      const at = options.horloge.maintenant();
      const local = compteurLocal(genre, at);
      const sequence =
        annonce !== undefined && dansLaPlage(annonce) ? Math.max(local, annonce) : local;
      if (sequence > options.plage.fin) return null;
      const base = { gare: options.gare, at, sequence };
      return {
        sequence,
        numero:
          genre === "colis" ? numeroColis(base) : numeroBillet({ ...base, agence: options.agence }),
      };
    },

    aligner(genre, annonce) {
      const at = options.horloge.maintenant();
      if (!dansLaPlage(annonce) || annonce <= compteurLocal(genre, at)) return;
      const etat = generateur.exporter();
      const compteurs = genre === "colis" ? etat.colis : etat.billets;
      compteurs[aammjjDouala(at)] = annonce;
      generateur = creerGenerateur(etat);
    },

    exporterEtat: () => generateur.exporter(),
    billetsRestants: () => generateur.billetsRestants(options.horloge.maintenant()),
  };
}

/* ------------------------------------------------------------------ contexte React */

const ContexteAppareil = createContext<AppareilAgence | null>(null);

export interface PropsFournisseurAppareilAgence {
  appareil: AppareilAgence;
  children?: ReactNode;
}

/** À placer sous `<FournisseurApi>` : l'appareil de l'agent connecté. */
export function FournisseurAppareilAgence({ appareil, children }: PropsFournisseurAppareilAgence) {
  return <ContexteAppareil.Provider value={appareil}>{children}</ContexteAppareil.Provider>;
}

const appareilsDemo = new WeakMap<object, AppareilAgence>();

/**
 * Appareil de démonstration utilisé **uniquement avec l'adaptateur mock** quand aucun
 * `<FournisseurAppareilAgence>` n'est monté : guichet 2 d'Akwa (Joseph M.), plage 1001–1999.
 */
export function creerAppareilDemo(horloge: Horloge): AppareilAgence {
  return creerAppareilAgence({
    appareilId: "appareil-gu2-dla",
    auteurId: "pers-joseph",
    agence: "ALP",
    gare: "DLA",
    plage: plageGuichet(2),
    horloge,
  });
}

/**
 * L'appareil courant. Sans fournisseur : un appareil de démonstration avec le mock, une erreur avec
 * l'adaptateur HTTP (jamais d'événement créé avec un appareil inventé en production).
 */
export function useAppareilAgence(): AppareilAgence {
  const fourni = useContext(ContexteAppareil);
  const client = useClientApi();
  return useMemo(() => {
    if (fourni) return fourni;
    if (client.mode !== "mock") {
      // Adaptateur HTTP : l'appareil installé sur ce téléphone (jamais un appareil inventé). Un seul exemplaire par
      // client : deux hooks d'un même écran partagent ainsi le même compteur de numéros.
      const installe = appareilInstalle(client);
      if (installe) return installe;
      throw new Error(
        "useAppareilAgence : monter un <FournisseurAppareilAgence> sous <FournisseurApi>, ou installer l'appareil (localStorage « afrimove.appareil »)",
      );
    }
    let demo = appareilsDemo.get(client);
    if (!demo) {
      demo = creerAppareilDemo(client.horloge);
      appareilsDemo.set(client, demo);
    }
    return demo;
  }, [fourni, client]);
}

/* ------------------------------------------------------------------ appareil installé (adaptateur HTTP) */

/**
 * L'appareil de l'agent avec l'adaptateur HTTP (recette AM-181).
 *
 * Constat de la recette : `useAppareilAgence` ne savait fabriquer un appareil qu'avec le mock ; avec l'adaptateur
 * HTTP il levait « monter un <FournisseurAppareilAgence> » et aucun écran d'écriture (vente, quai, caisse) ne
 * s'affichait. Aucun écran n'installe encore l'appareil (AM-160 branchera le moteur de synchronisation et la plage
 * attribuée par le serveur) : en attendant, l'identité de l'appareil est lue dans le stockage local, où
 * l'installation de l'appareil (ou, en recette, le banc) la dépose avec la plage attribuée.
 *
 * Le compteur de numéros est réécrit dans le stockage à CHAQUE événement créé : un rechargement de la page, une
 * coupure ou un redémarrage du téléphone ne fait ni reprendre un numéro déjà imprimé ni en sauter un.
 */
export const CLE_APPAREIL = "afrimove.appareil";

export interface ProvisionnementAppareil {
  appareilId: string;
  /** La personne connectée sur l'appareil (le compte du jeton : le serveur refuse un autre auteur). */
  auteurId: string;
  /** Code agence de 3 lettres. */
  agence: string;
  /** Code gare de 3 lettres. */
  gare: string;
  plage: Plage;
  /** État du compteur de numéros, tenu à jour par l'appareil. */
  etat?: EtatGenerateur;
}

type Stockage = Pick<Storage, "getItem" | "setItem">;

function stockageLocal(): Stockage | undefined {
  try {
    return (globalThis as { localStorage?: Stockage }).localStorage;
  } catch {
    return undefined;
  }
}

function estProvisionnement(v: unknown): v is ProvisionnementAppareil {
  if (typeof v !== "object" || v === null) return false;
  const p = v as Record<string, unknown>;
  const plage = p["plage"] as Record<string, unknown> | undefined;
  return (
    typeof p["appareilId"] === "string" &&
    typeof p["auteurId"] === "string" &&
    typeof p["agence"] === "string" &&
    typeof p["gare"] === "string" &&
    typeof plage?.["debut"] === "number" &&
    typeof plage["fin"] === "number"
  );
}

/** Ce que l'installation de l'appareil a déposé, ou `null` (rien, illisible ou incomplet). */
export function lireProvisionnement(stockage = stockageLocal()): ProvisionnementAppareil | null {
  try {
    const brut = stockage?.getItem(CLE_APPAREIL);
    if (!brut) return null;
    const valeur: unknown = JSON.parse(brut);
    return estProvisionnement(valeur) ? valeur : null;
  } catch {
    return null;
  }
}

/**
 * L'appareil décrit par le stockage local, ou `null` si l'appareil n'a pas été installé. Chaque événement créé
 * réécrit l'état du compteur dans le stockage (voir plus haut).
 */
export function appareilDepuisStockage(
  horloge: Horloge,
  stockage: Stockage | undefined = stockageLocal(),
): AppareilAgence | null {
  const prov = lireProvisionnement(stockage);
  if (!prov) return null;
  const interne = creerAppareilAgence({
    appareilId: prov.appareilId,
    auteurId: prov.auteurId,
    agence: prov.agence,
    gare: prov.gare,
    plage: prov.plage,
    horloge,
    ...(prov.etat ? { etat: prov.etat } : {}),
  });
  const garder = () => {
    try {
      stockage?.setItem(
        CLE_APPAREIL,
        JSON.stringify({
          ...prov,
          etat: interne.exporterEtat(),
        } satisfies ProvisionnementAppareil),
      );
    } catch {
      // Stockage plein ou bloqué : la vente continue, le compteur repartira de la dernière valeur écrite.
    }
  };
  return {
    ...interne,
    creerEvenement(definition, donnees) {
      const evenement = interne.creerEvenement(definition, donnees);
      garder();
      return evenement;
    },
    aligner(genre, annonce) {
      const avant = JSON.stringify(interne.exporterEtat());
      interne.aligner(genre, annonce);
      // Seul un compteur qui a vraiment avancé est réécrit.
      if (JSON.stringify(interne.exporterEtat()) !== avant) garder();
    },
  };
}

const appareilsInstalles = new WeakMap<object, { identite: string; appareil: AppareilAgence }>();

/** L'appareil installé, partagé par tous les hooks du client ; refait si l'installation a changé d'appareil ou de personne. */
function appareilInstalle(client: { horloge: Horloge }): AppareilAgence | null {
  const prov = lireProvisionnement();
  if (!prov) return null;
  const identite = `${prov.appareilId}|${prov.auteurId}|${prov.agence}|${prov.gare}`;
  const connu = appareilsInstalles.get(client);
  if (connu && connu.identite === identite) return connu.appareil;
  const appareil = appareilDepuisStockage(client.horloge);
  if (!appareil) return null;
  appareilsInstalles.set(client, { identite, appareil });
  return appareil;
}
