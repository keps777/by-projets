import type { colis as c } from "@afrimove/contrats";
import {
  OP_DEPOSER_DEMANDE_LIVREUR,
  OP_ENREGISTRER_BROUILLON_RELAIS,
  OP_ENVOYER_FICHE_RELAIS,
  OP_FORMULAIRE_RELAIS,
  OP_PROGRAMME_LIVREUR,
  OP_PROGRAMME_RELAIS,
  OP_SUIVI_DEMANDE_LIVREUR,
  OP_SUIVI_DEMANDE_RELAIS,
} from "../operations";
import { ErreurHttp } from "../../infra/erreurs";
import { entierDe, heureDans, installer, isoDu, jourDe, lire, sansPuce } from "./outils";
import type { DonneesScenario, ScenarioEnConstruction } from "./outils";

interface Jalon {
  fait: boolean;
  etape: string;
  detail: string;
  _personneId?: string;
}

function jalonsDe(liste: Jalon[], jour: string): c.JalonDemande[] {
  return liste.map((j) => {
    const h = heureDans(j.detail);
    return {
      fait: j.fait,
      libelle: j.etape,
      detail: sansPuce(j.detail),
      a: h ? isoDu(jour, h) : null,
    };
  });
}

/** « Étape 2 / 3 » → { courante: 2, total: 3 } */
function etapeDe(texte: string): { courante: number; total: number } | null {
  const m = /Étape (\d+) \/ (\d+)/.exec(texte);
  return m ? { courante: Number(m[1]), total: Number(m[2]) } : null;
}

/** « R-BAF » + 215 → « R-BAF-0215 » : continue la numérotation du dossier de la planche de suivi. */
function dossierSuivant(prefixe: string, dernier: number): string {
  return `${prefixe}-${String(dernier).padStart(4, "0")}`;
}

function codeVille(ville: string): string {
  return ville
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .slice(0, 3)
    .toUpperCase();
}

/* ------------------------------------------------------------------ RelaisDevenir (22b) */

interface DonneesRelaisDevenir {
  titre: string;
  detail: string;
  badge: string;
  promesse: { accroche: string; deroule: string };
  chiffres: { libelle: string; valeur: number | string; detail: string }[];
  prerequis: { liste: string[] };
  etapes: { liste: { rang: number; titre: string; detail: string }[] };
  mention: string;
}

export function installerRelaisDevenir(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesRelaisDevenir>(d);
  const [parColis, exemple, actifs] = e.chiffres;
  installer(sc, OP_PROGRAMME_RELAIS, () => ({
    titre: e.titre,
    detail: e.detail,
    accroche: e.promesse.accroche,
    deroule: e.promesse.deroule,
    partParColis: entierDe(parColis?.valeur ?? 0),
    partSiRepris: Number(/(\d+) F si repris/.exec(parColis?.detail ?? "")?.[1] ?? 0),
    relaisActifs: entierDe(actifs?.valeur ?? 0),
    villes: Number(/(\d+) villes/.exec(actifs?.detail ?? "")?.[1] ?? 0),
    exemple: {
      nom: exemple?.libelle ?? "",
      colis: Number(/(\d+) colis/.exec(exemple?.detail ?? "")?.[1] ?? 0),
      gain: entierDe(exemple?.valeur ?? 0),
    },
    prerequis: e.prerequis.liste.map((p) => p.replace(/^✓\s*/, "")),
    etapes: e.etapes.liste,
    mention: e.mention,
  }));
}

/* ------------------------------------------------------------------ RelaisInscription (22c) */

interface Choix {
  libelle: string;
  choix: string[];
  valeur: string;
}

interface DonneesRelaisInscription {
  titre: string;
  detail: string;
  fiche: {
    nom: { valeur: string };
    type: Choix;
    ouvert: Choix;
    position: { libelle: string; valeur: string };
    taille: Choix;
    momo: { libelle: string; valeur: string };
  };
  pieces: { titre: string; detail: string }[];
  engagement: { titre: string; texte: string };
  mention: string;
  actions: { envoyer: { detail: string } };
}

export function installerRelaisInscription(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesRelaisInscription>(d);
  let dernierDossier = 215;

  installer(sc, OP_FORMULAIRE_RELAIS, () => ({
    titre: e.titre,
    detail: e.detail,
    fiche: {
      nom: e.fiche.nom.valeur,
      type: e.fiche.type,
      ouvert: e.fiche.ouvert,
      position: e.fiche.position,
      taille: e.fiche.taille,
      momo: { libelle: e.fiche.momo.libelle, valeurMasquee: e.fiche.momo.valeur },
    },
    pieces: e.pieces,
    engagement: e.engagement,
    mention: e.mention,
    etape: etapeDe(e.detail) ?? { courante: 1, total: 3 },
  }));

  installer(sc, OP_ENREGISTRER_BROUILLON_RELAIS, (_p, ctx) => ({
    enregistreLe: ctx.horloge.iso(),
  }));

  installer(sc, OP_ENVOYER_FICHE_RELAIS, (p, ctx) => {
    if (p.nom.trim() === "")
      throw new ErreurHttp(422, "Le nom de la boutique est requis", "nom_requis");
    return {
      dossier: dossierSuivant(`R-${codeVille(p.position.ville)}`, dernierDossier++),
      deposeeLe: ctx.horloge.iso(),
      suite: e.actions.envoyer.detail,
    };
  });
}

/* ------------------------------------------------------------------ RelaisVerification (22d) */

interface DonneesVerification {
  titre: string;
  detail: string;
  suivi: { etapes: Jalon[] };
  code: { libelle: string; valeur: string; etat: string };
  demo: { libelle: string; titre: string; detail: string };
  jeudi: { titre: string; texte: string };
  mention: string;
}

export function installerRelaisVerification(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesVerification>(d);
  const jour = jourDe(d.horloge);
  const agentJalon = e.suivi.etapes.find((j) => j._personneId !== undefined);
  const [nom = "", creneau = ""] = sansPuce(agentJalon?.detail ?? "")
    .split("·")
    .map((s) => s.trim());

  installer(sc, OP_SUIVI_DEMANDE_RELAIS, () => ({
    type: "relais" as const,
    dossier: /dossier ([A-Z]-[A-Z]{3}-\d{4})/.exec(e.detail)?.[1] ?? e.code.valeur,
    statut: "en_cours" as const,
    titre: e.titre,
    detail: e.detail,
    etape: etapeDe(e.detail),
    jalons: jalonsDe(e.suivi.etapes, jour),
    reservation: { libelle: e.code.libelle, valeur: e.code.valeur, activation: e.code.etat },
    demo: e.demo,
    recit: e.jeudi,
    mention: e.mention,
    complement: null,
    agent: agentJalon ? { nom, creneau } : null,
  }));
}

/* ------------------------------------------------------------------ LivreurDevenir (23b) */

interface Particularite {
  libelle: string;
  choix: string[];
  valeur?: string;
}

interface DonneesLivreurDevenir {
  titre: string;
  detail: string;
  badge: string;
  chiffres: { libelle: string; valeur: number | string; detail: string }[];
  particularites: {
    titre: string;
    deplacement: Particularite;
    zone: Required<Particularite>;
    heures: Required<Particularite>;
    charge: Required<Particularite>;
    momo: { libelle: string; valeur: string };
  };
  pieces: { titre: string; detail: string }[];
  regles: { titre: string; texte: string };
  mention: string;
  actions: { inscrire: { detail: string } };
}

export function installerLivreurDevenir(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesLivreurDevenir>(d);
  const [course, exemple, actifs] = e.chiffres;
  let dernierDossier = 87;

  installer(sc, OP_PROGRAMME_LIVREUR, () => ({
    titre: e.titre,
    detail: e.detail,
    partParCourse: entierDe(course?.valeur ?? 0),
    livreursActifs: entierDe(actifs?.valeur ?? 0),
    villes: Number(/(\d+) villes/.exec(actifs?.detail ?? "")?.[1] ?? 0),
    exemple: {
      nom: exemple?.libelle ?? "",
      courses: Number(/(\d+) courses/.exec(exemple?.detail ?? "")?.[1] ?? 0),
      gain: entierDe(exemple?.valeur ?? 0),
    },
    particularites: {
      titre: e.particularites.titre,
      deplacement: {
        libelle: e.particularites.deplacement.libelle,
        choix: e.particularites.deplacement.choix,
      },
      zone: e.particularites.zone,
      heures: e.particularites.heures,
      charge: e.particularites.charge,
      momo: { libelle: e.particularites.momo.libelle, valeurMasquee: e.particularites.momo.valeur },
    },
    pieces: e.pieces,
    regles: e.regles,
    mention: e.mention,
  }));

  installer(sc, OP_DEPOSER_DEMANDE_LIVREUR, (p, ctx) => ({
    dossier: dossierSuivant(`L-${codeVille(p.zone)}`, dernierDossier++),
    deposeeLe: ctx.horloge.iso(),
    suite: e.actions.inscrire.detail,
  }));
}

/* ------------------------------------------------------------------ LivreurVerification (23c) */

interface DonneesLivreurVerification {
  titre: string;
  detail: string;
  badge: string;
  suivi: { etapes: Jalon[] };
  badgeReserve: { libelle: string; valeur: string; etat: string };
  demo: { libelle: string; titre: string; detail: string };
  soiree: { titre: string; texte: string };
  particularites: { titre: string; texte: string };
}

export function installerLivreurVerification(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesLivreurVerification>(d);
  const jour = jourDe(d.horloge);

  installer(sc, OP_SUIVI_DEMANDE_LIVREUR, () => ({
    type: "livreur" as const,
    dossier: /dossier ([A-Z]-[A-Z]{3}-\d{4})/.exec(e.detail)?.[1] ?? e.badgeReserve.valeur,
    statut: "en_cours" as const,
    titre: e.titre,
    detail: e.detail,
    etape: null,
    jalons: jalonsDe(e.suivi.etapes, jour),
    reservation: {
      libelle: e.badgeReserve.libelle,
      valeur: e.badgeReserve.valeur,
      activation: e.badgeReserve.etat,
    },
    demo: e.demo,
    recit: e.soiree,
    mention: null,
    complement: e.particularites,
    agent: null,
  }));
}
