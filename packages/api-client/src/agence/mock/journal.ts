import type { Billet, SessionCaisse } from "@afrimove/domain";
import { MONDE } from "@afrimove/fixtures";
import type { Entites } from "@afrimove/fixtures";
import type { agence as c } from "@afrimove/contrats";
import { OP_JOURNAL } from "../operations";
import type { Poseur } from "./utilitaires";

/**
 * Journal signé de démonstration, reconstruit à partir des documents d'une planche (et du monde
 * commun) : chaque transition de l'historique d'un billet ou d'une session est une entrée, chaînée
 * à la précédente. Les empreintes du mock ne sont pas cryptographiques (le serveur signe vraiment).
 */

function fnv(texte: string, graine: number): number {
  let h = graine >>> 0;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 16 caractères hexadécimaux déterministes. */
export function empreinte(texte: string): string {
  return [0x811c9dc5, 0x9747b28c].map((g) => fnv(texte, g).toString(16).padStart(8, "0")).join("");
}

/** Un UUID version 4 déterministe, pour que le journal de démonstration soit stable. */
export function uuidDepuis(texte: string): string {
  const hex = [0x811c9dc5, 0x9747b28c, 0xc2b2ae35, 0x27d4eb2f]
    .map((g) => fnv(texte, g).toString(16).padStart(8, "0"))
    .join("");
  const variante = "89ab"[parseInt(hex.charAt(16), 16) % 4];
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variante}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function auteurDe(id: string | undefined): c.PersonneRef {
  if (!id || id === "systeme") return { id: "systeme", nom: "Système" };
  const p = MONDE.personnes.find((x) => x.id === id);
  return { id, nom: p?.nom ?? id };
}

function appareilDe(guichetId: string | undefined): string | null {
  const rang = guichetId ? /-(\d+)$/.exec(guichetId)?.[1] : undefined;
  return rang ? `appareil-gu${rang}-dla` : null;
}

interface Brouillon {
  type: string;
  at: string;
  auteur: c.PersonneRef;
  appareilId: string | null;
  cible: c.CibleEvenement;
  numeroPlage: number | null;
  resume: string;
  validePar: boolean;
  cle: string;
}

function entreesBillet(b: Billet, sessions: ReadonlyMap<string, SessionCaisse>): Brouillon[] {
  const session =
    (b.sessionId ? sessions.get(b.sessionId) : undefined) ??
    [...sessions.values()].find((s) => b.guichetId !== undefined && s.guichetId === b.guichetId);
  const vente: Brouillon = {
    type: "billet.vendu",
    at: b.creeA,
    auteur: auteurDe(session?.agentId),
    appareilId: appareilDe(b.guichetId),
    cible: { type: "billet", id: b.id },
    numeroPlage: b.sequence,
    resume: `Vente du billet ${String(b.sequence).padStart(4, "0")} · ${b.prix} F`,
    validePar: false,
    cle: `${b.id}:creation`,
  };
  const suite = b.historique.map((h, i): Brouillon => {
    const par = auteurDe(h.par);
    const superviseur = MONDE.personnes.find((p) => p.id === h.par)?.roles.includes("superviseur");
    return {
      type: `billet.${h.vers}`,
      at: h.at,
      auteur: par,
      appareilId: null,
      cible: { type: "billet", id: b.id },
      numeroPlage: null,
      resume: `Billet ${String(b.sequence).padStart(4, "0")} : ${h.de} → ${h.vers}`,
      validePar: superviseur === true,
      cle: `${b.id}:${i}`,
    };
  });
  return [vente, ...suite];
}

function entreesSession(s: SessionCaisse): Brouillon[] {
  const ouverture: Brouillon = {
    type: "caisse.ouverte",
    at: s.ouverteA,
    auteur: auteurDe(s.agentId),
    appareilId: appareilDe(s.guichetId),
    cible: { type: "session", id: s.id },
    numeroPlage: null,
    resume: `Ouverture de la caisse ${s.numero} avec ${s.fondDeCaisse} F`,
    validePar: false,
    cle: `${s.id}:ouverture`,
  };
  const suite = s.historique.map((h, i): Brouillon => {
    const superviseur = MONDE.personnes.find((p) => p.id === h.par)?.roles.includes("superviseur");
    return {
      type: `caisse.${h.vers}`,
      at: h.at,
      auteur: auteurDe(h.par),
      appareilId: null,
      cible: { type: "session", id: s.id },
      numeroPlage: null,
      resume: `Caisse ${s.numero} : ${h.de} → ${h.vers}`,
      validePar: superviseur === true,
      cle: `${s.id}:${i}`,
    };
  });
  return [ouverture, ...suite];
}

/** Toutes les entrées chaînées, de la plus ancienne à la plus récente. */
export function construireJournal(...sources: (Entites | undefined)[]): c.EntreeJournal[] {
  const billets = new Map<string, Billet>();
  const sessions = new Map<string, SessionCaisse>();
  for (const s of [MONDE as Entites, ...sources]) {
    for (const b of s?.billets ?? []) billets.set(b.id, b);
    for (const x of s?.sessions ?? []) sessions.set(x.id, x);
  }
  const brouillons = [
    ...[...billets.values()].flatMap((b) => entreesBillet(b, sessions)),
    ...[...sessions.values()].flatMap(entreesSession),
  ].sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.cle.localeCompare(b.cle));

  let precedente: string | null = null;
  return brouillons.map((b) => {
    const evenementId = uuidDepuis(b.cle);
    const courante = empreinte(
      [precedente ?? "", evenementId, b.type, b.at, b.auteur.id, b.resume].join("|"),
    );
    const entree: c.EntreeJournal = {
      evenementId,
      type: b.type,
      at: b.at,
      auteur: b.auteur,
      appareilId: b.appareilId,
      cible: b.cible,
      numeroPlage: b.numeroPlage,
      resume: b.resume,
      validePar: b.validePar
        ? {
            superviseurId: b.auteur.id,
            methode: "pin",
            signature: empreinte(`signature|${evenementId}|${b.auteur.id}`),
          }
        : null,
      empreinte: courante,
      precedente,
    };
    precedente = courante;
    return entree;
  });
}

/** Vérifie la chaîne d'empreintes d'une page de journal. */
export function chaineIntacte(entrees: readonly c.EntreeJournal[]): boolean {
  return entrees.every((e, i) => {
    if (i === 0) return true;
    return e.precedente === entrees[i - 1]?.empreinte;
  });
}

/** `useJournal` : le journal du jour, d'une personne ou d'une session, paginé par curseur. */
export function installerJournal(poseur: Poseur, ...sources: (Entites | undefined)[]): void {
  const tout = construireJournal(...sources);
  poseur.lecture(OP_JOURNAL, (params) => {
    const filtrees = tout.filter(
      (e) =>
        (params.personneId === undefined ||
          e.auteur.id === params.personneId ||
          (e.cible.type === "personne" && e.cible.id === params.personneId)) &&
        (params.sessionId === undefined ||
          (e.cible.type === "session" && e.cible.id === params.sessionId)) &&
        (params.jour === undefined || e.at.startsWith(params.jour)),
    );
    const debut = params.apres ? Number(params.apres) : 0;
    const limite = params.limite ?? 50;
    const page = filtrees.slice(debut, debut + limite);
    const suivant = debut + limite < filtrees.length ? String(debut + limite) : null;
    return { entrees: page, suivant, chaineValide: chaineIntacte(tout) };
  });
}
