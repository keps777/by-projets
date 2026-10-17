import {
  GenerateurNumeros,
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
  const generateur = new GenerateurNumeros({
    agence: options.agence,
    gare: options.gare,
    plage: options.plage,
    ...(options.etat ? { etat: options.etat } : {}),
  });

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
      throw new Error(
        "useAppareilAgence : monter un <FournisseurAppareilAgence> sous <FournisseurApi>",
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
