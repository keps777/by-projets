import { randomUUID } from "node:crypto";
import {
  agence,
  creerClientHttp,
  creerHorlogeManuelle,
  type ClientHttp,
} from "@afrimove/api-client";
import { aammjjDouala, plageGuichet, type EtatGenerateur } from "@afrimove/domain";
import { ecrire, lire, pile, type Session } from "./api";

/** Ce que le seed de recette a posé (identifiants lus dans la base, une fois par fichier de tests). */
export interface Referentiel {
  compagnieId: string;
  gareDlaId: string;
  gareYdeId: string;
  ligneId: string;
  busIds: string[];
  chauffeurId: string;
  convoyeurId: string;
  guichets: Record<number, string>;
}

let referentielMemo: Referentiel | undefined;

export function referentiel(): Referentiel {
  if (referentielMemo) return referentielMemo;
  const un = (sql: string): string => {
    const [ligne] = lire<{ id: string }>(sql);
    if (!ligne) throw new Error(`Seed de recette incomplet : ${sql}`);
    return ligne.id;
  };
  const compagnieId = un(`select id from compagnie where code = 'DEM'`);
  const guichets: Record<number, string> = {};
  for (const g of lire<{ id: string; rang: number }>(
    `select g.id, g.rang from guichet g join gare r on r.id = g."gareId" where r.code = 'DLA' and r."compagnieId" = '${compagnieId}'`,
  )) {
    guichets[g.rang] = g.id;
  }
  referentielMemo = {
    compagnieId,
    gareDlaId: un(`select id from gare where code = 'DLA' and "compagnieId" = '${compagnieId}'`),
    gareYdeId: un(`select id from gare where code = 'YDE' and "compagnieId" = '${compagnieId}'`),
    ligneId: un(`select id from ligne where code = 'DLA-YDE'`),
    busIds: lire<{ id: string }>(`select id from bus order by immatriculation`).map((b) => b.id),
    chauffeurId: un(`select id from personne where nom = 'Chauffeur recette'`),
    convoyeurId: un(`select id from personne where nom = 'Convoyeur recette'`),
    guichets,
  };
  return referentielMemo;
}

export interface DepartCree {
  id: string;
  numero: string;
  heureDepart: Date;
}

/** Un départ DLA → YDE, équipage complet par défaut (bus, chauffeur, convoyeur, quai). */
export function creerDepart(
  o: {
    heureDepart: Date;
    bus?: number;
    etat?: "programme" | "en_vente" | "embarquement" | "parti" | "arrive" | "annule" | "retarde";
    equipage?: boolean;
    quai?: number | null;
  },
  /** Autre base que celle de la pile (le serveur restauré, critère 5) : même référentiel, mêmes identifiants. */
  base?: string,
): DepartCree {
  const ref = referentiel();
  const id = randomUUID();
  const numero = `REC-${id.slice(0, 8)}`;
  const equipage = o.equipage ?? true;
  const bus = ref.busIds[o.bus ?? 0];
  ecrire(
    `insert into depart (id, numero, "ligneId", "busId", classe, "heureDepart", etat, "chauffeurId", "convoyeurId", quai)
     values ('${id}', '${numero}', '${ref.ligneId}', ${equipage && bus ? `'${bus}'` : "null"}, 'classique',
             '${o.heureDepart.toISOString()}', '${o.etat ?? "en_vente"}',
             ${equipage ? `'${ref.chauffeurId}'` : "null"}, ${equipage ? `'${ref.convoyeurId}'` : "null"},
             ${o.quai === undefined ? (equipage ? 1 : "null") : (o.quai ?? "null")})`,
    base,
  );
  return { id, numero, heureDepart: o.heureDepart };
}

/** Déclare un appareil côté serveur (l'administration des appareils n'existe pas encore : AM-093, AM-120). */
export function declarerAppareil(appareilId: string, rang: number): void {
  const ref = referentiel();
  ecrire(
    `insert into appareil_sync (id, genre, rang, "gareId", "compagnieId", retire, "dernierOrdre")
     values ('${appareilId}', 'guichet', ${rang}, '${ref.gareDlaId}', '${ref.compagnieId}', false, 0)
     on conflict (id) do nothing`,
  );
}

/** Le client HTTP de l'application web (le vrai `packages/api-client`), branché sur l'API de la recette. */
export function clientHttp(session: Session): ClientHttp {
  return creerClientHttp({
    urlBase: pile().urlApi,
    obtenirJeton: () => session.jeton,
    relance: { max: 0 },
  });
}

/**
 * Le compteur d'un appareil qui s'allume : comme l'application, il reprend après le dernier numéro que le serveur
 * a vu ce jour-là pour ce guichet (plusieurs scénarios vendent le même jour, au même guichet, sur la même base).
 */
export function etatDepuisLaBase(rang: number, at: number): EtatGenerateur {
  const heure = 3_600_000;
  const minuit = Math.floor((at + heure) / (24 * heure)) * 24 * heure - heure;
  const guichetId = referentiel().guichets[rang];
  const [ligne] = lire<{ dernier: number | null }>(
    `select max(sequence) as dernier from billet where "guichetId" = '${guichetId}'
       and "creeA" >= '${new Date(minuit).toISOString()}' and "creeA" < '${new Date(minuit + 24 * heure).toISOString()}'`,
  );
  return {
    billets: ligne?.dernier ? { [aammjjDouala(at)]: ligne.dernier + 1 } : {},
    colis: {},
    sessions: {},
  };
}

/** L'appareil d'un guichet, tel que l'application le construit : plage du rang, numéros sans trou. */
export function appareilDeGuichet(
  session: Session,
  rang: number,
  horloge = creerHorlogeManuelle(Date.now()),
) {
  return agence.creerAppareilAgence({
    appareilId: `recette-guichet-${rang}-${session.id.slice(-6)}`,
    auteurId: session.id,
    agence: "DEM",
    gare: "DLA",
    plage: plageGuichet(rang),
    horloge,
    etat: etatDepuisLaBase(rang, horloge.maintenant()),
  });
}

/**
 * Un colis déposé au guichet, posé directement en base. Depuis la correction de l'anomalie A5, `POST /agence/colis`
 * marche sur la pile PostgreSQL (scénario dédié du critère 1) ; les journées de recette posent toujours leurs colis
 * en SQL, tels que le module colis les écrit, pour maîtriser les dates et les numéros de la journée simulée.
 */
export function poserColis(o: {
  numeroSequence: number;
  agentId: string;
  creeA: number;
  mode: "cash" | "momo" | "orange_money";
  montant: number;
  departId: string;
}): string {
  const ref = referentiel();
  const id = randomUUID();
  const jour = aammjjDouala(o.creeA);
  const numero = `C-DLA-${jour}-${String(o.numeroSequence).padStart(4, "0")}`;
  ecrire(
    `insert into colis (id, numero, sequence, "gareOrigineId", "gareDestinationId", "departId", "compagnieId",
       "expediteurChiffre", "expediteurTelephoneIndex", "destinataireChiffre", "destinataireTelephoneIndex",
       contenu, "poidsKg", "valeurDeclaree", mode, canal, "codeRetraitHache", "codeRetraitSel", "prixTotal",
       "creeA", etat, jour, "paiementMoyen", "paiementEtat", "paiementMontant", "deposePar")
     values ('${id}', '${numero}', ${o.numeroSequence}, '${ref.gareDlaId}', '${ref.gareYdeId}', '${o.departId}',
       '${ref.compagnieId}', 'x', 'x', 'x', 'x', 'Colis de recette', 2, 0, 'gare', 'agence', 'x', 'x', ${o.montant},
       '${new Date(o.creeA).toISOString()}', 'enregistre', '${jour}', '${o.mode}', 'paye', ${o.montant}, '${o.agentId}')`,
  );
  return id;
}
