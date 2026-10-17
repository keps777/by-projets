import { aammjjDouala } from "../temps";
import { GUICHET_2, uuid, type AppAgenceTest } from "./app-agence-test";

export interface EvenementBrut {
  id: string;
  type: string;
  at: string;
  appareilId: string;
  auteurId: string;
  cible: { type: string; id: string };
  numeroPlage: null;
  donnees: Record<string, unknown>;
}

const CIBLES: Record<string, (d: Record<string, unknown>) => { type: string; id: string }> = {
  "caisse.ouverte": (d) => ({ type: "session", id: String(d["sessionId"]) }),
  "caisse.comptee": (d) => ({ type: "session", id: String(d["sessionId"]) }),
  "caisse.cloturee": (d) => ({ type: "session", id: String(d["sessionId"]) }),
  "caisse.validee": (d) => ({ type: "session", id: String(d["sessionId"]) }),
  "caisse.refusee": (d) => ({ type: "session", id: String(d["sessionId"]) }),
  "annulation.demandee": (d) => ({ type: "demande", id: String(d["demandeId"]) }),
  "annulation.decidee": (d) => ({ type: "demande", id: String(d["demandeId"]) }),
  "equipe.pin_renouvele": (d) => ({ type: "personne", id: String(d["personneId"]) }),
  "equipe.affectation_changee": (d) => ({ type: "personne", id: String(d["personneId"]) }),
  "equipe.compte_desactive": (d) => ({ type: "personne", id: String(d["personneId"]) }),
  "equipe.personne_debloquee": (d) => ({ type: "personne", id: String(d["personneId"]) }),
};

/** Un événement de l'agence, tel qu'un appareil l'enverrait. */
export function evenement(
  type: string,
  auteurId: string,
  donnees: Record<string, unknown>,
  o: { at: string; id?: string; appareilId?: string },
): EvenementBrut {
  const cible = CIBLES[type];
  if (!cible) throw new Error(`Type d'événement inconnu dans les tests : ${type}`);
  return {
    id: o.id ?? uuid(),
    type,
    at: o.at,
    appareilId: o.appareilId ?? "GU2-DLA",
    auteurId,
    cible: cible(donnees),
    numeroPlage: null,
    donnees,
  };
}

/** `caisse.ouverte` pour le guichet 2 de Douala, le numéro de session étant déduit de l'heure. */
export function ouverture(
  t: Pick<AppAgenceTest, "iso">,
  agentId: string,
  o: {
    sessionId?: string;
    guichetId?: string;
    rang?: number;
    ordre?: number;
    fond?: number;
    at?: string;
    id?: string;
    numero?: string;
  } = {},
): EvenementBrut {
  const at = o.at ?? t.iso();
  const sessionId = o.sessionId ?? uuid();
  const rang = o.rang ?? 2;
  return evenement(
    "caisse.ouverte",
    agentId,
    {
      sessionId,
      numero: o.numero ?? `K-DLA-${aammjjDouala(at)}-${rang}-${o.ordre ?? 1}`,
      guichetId: o.guichetId ?? GUICHET_2,
      fondDeCaisse: o.fond ?? 25_000,
    },
    { at, ...(o.id ? { id: o.id } : {}) },
  );
}

/** `caisse.comptee` : `nombres` donne le nombre de billets par valeur. */
export function comptage(
  agentId: string,
  sessionId: string,
  nombres: Record<number, number>,
  pieces: number,
  o: { at: string; id?: string; total?: number },
): EvenementBrut {
  const coupures = Object.entries(nombres).map(([valeur, nombre]) => ({
    valeur: Number(valeur),
    nombre,
  }));
  const total = o.total ?? coupures.reduce((s, c) => s + c.valeur * c.nombre, 0) + pieces;
  return evenement(
    "caisse.comptee",
    agentId,
    { sessionId, coupures, pieces, total },
    { at: o.at, ...(o.id ? { id: o.id } : {}) },
  );
}

/** `caisse.cloturee` : l'écart est déduit des deux montants, sauf si on le force. */
export function cloture(
  agentId: string,
  sessionId: string,
  cashCompte: number,
  cashAttendu: number,
  o: { at: string; id?: string; ecart?: number; auto?: boolean },
): EvenementBrut {
  return evenement(
    "caisse.cloturee",
    agentId,
    {
      sessionId,
      cashCompte,
      cashAttendu,
      ecart: o.ecart ?? cashCompte - cashAttendu,
      auto: o.auto ?? false,
    },
    { at: o.at, ...(o.id ? { id: o.id } : {}) },
  );
}

/** POST d'un événement avec le jeton donné. */
export function envoyer(
  t: Pick<AppAgenceTest, "http">,
  chemin: string,
  jeton: string,
  corps: unknown,
) {
  return t
    .http()
    .post(chemin)
    .set("Authorization", `Bearer ${jeton}`)
    .send(corps as object);
}

export function lire(t: Pick<AppAgenceTest, "http">, chemin: string, jeton: string) {
  return t.http().get(chemin).set("Authorization", `Bearer ${jeton}`);
}
