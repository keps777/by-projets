import type { voyageur as c } from "@afrimove/contrats";
import { implementer } from "../../infra/scenarios";
import type { ImplementationMock } from "../../infra/scenarios";
import {
  OP_AJOUTER_PROCHE,
  OP_DEMANDER_CODE,
  OP_FIDELITE,
  OP_HISTORIQUE,
  OP_PARRAINAGE,
  OP_PROCHES,
  OP_PROFIL,
  OP_VERIFIER_CODE,
} from "../operations";
import {
  AICHA,
  dateFr,
  donneesDe,
  entier,
  initiales,
  isoA,
  plusMinutes,
  slug,
  telephone,
} from "./outils";
import type { DonneesDe, EcranSource } from "./outils";

/** Profil d'Aïcha Ngo, la voyageuse des maquettes (sert aux planches qui ne détaillent pas le profil). */
export function profilAicha(inscritDepuis = "2027-01-01T08:00:00.000+01:00"): c.Profil {
  return {
    id: AICHA.id,
    prenom: AICHA.prenom,
    nom: AICHA.nom,
    initiales: AICHA.initiales,
    telephone: AICHA.telephone,
    pieceVerifiee: true,
    pieceQuatreDerniers: AICHA.pieceQuatreDerniers,
    inscritDepuis,
    langue: "fr",
  };
}

/** Planche Connexion : numéro + code SMS. */
export function mockConnexion(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Connexion");
  const numero = telephone(`${d.telephone.indicatif}${d.telephone.numero}`);
  const renvoi = /(\d+):(\d{2})/.exec(d.etape2.renvoi);
  const renvoiSecondes = renvoi ? Number(renvoi[1]) * 60 + Number(renvoi[2]) : 0;
  return [
    implementer(
      OP_DEMANDER_CODE,
      (p): c.ReponseDemandeCode => ({
        telephone: p.telephone ?? numero,
        canal: p.canal ?? "sms",
        longueurCode: d.code.length,
        renvoiDansSecondes: renvoiSecondes,
        expireA: plusMinutes(source.maintenant, 5),
      }),
    ),
    implementer(OP_VERIFIER_CODE, (p): c.SessionVoyageur => {
      if (!/^\d{4}$/.test(p.code)) throw new RangeError("Code à 4 chiffres attendu");
      return {
        jeton: "jeton-demo-aicha",
        expireA: plusMinutes(source.maintenant, 60 * 24 * 30),
        nouveauCompte: false,
        profil: { ...profilAicha(), telephone: p.telephone },
      };
    }),
  ];
}

/** Planche Moi : profil, fidélité, parrainage, proches, historique. */
export function mockMoi(source: EcranSource): ImplementationMock[] {
  const d = donneesDe(source, "Moi");
  const profil = profilDeMoi(source);
  const montantParrainage =
    /(\d[\d\s]*) F pour toi, (\d[\d\s]*) F pour eux/.exec(d.parrainage.detail) ?? [];
  const parrainage: c.Parrainage = {
    code: d.parrainage.libelle.split("·")[1]?.trim() ?? "AMI",
    amis: d.parrainage.amis,
    bonusParrain: entier(montantParrainage[1] ?? "0"),
    bonusFilleul: entier(montantParrainage[2] ?? "0"),
  };
  const proches = prochesDeMoi(d.proches.liste);
  const historique = historiqueDeMoi(d.historique.elements, source.maintenant);
  const nouveaux: c.Proche[] = [];
  return [
    implementer(OP_PROFIL, () => profil),
    implementer(
      OP_FIDELITE,
      (): c.Fidelite => ({ points: d.fidelite.points, valeurFcfa: entier(d.fidelite.equivalence) }),
    ),
    implementer(OP_PARRAINAGE, () => parrainage),
    implementer(OP_PROCHES, () => [...proches, ...nouveaux]),
    implementer(OP_AJOUTER_PROCHE, (p): c.Proche => {
      const proche: c.Proche = {
        id: `proche-${slug(p.nom)}`,
        nom: p.nom,
        initiales: initiales(p.nom),
        ...(p.ville ? { ville: p.ville } : {}),
        telephone: p.telephone,
        prevenuALArrivee: p.prevenuALArrivee ?? true,
        payeMesVoyages: false,
      };
      nouveaux.push(proche);
      return proche;
    }),
    implementer(OP_HISTORIQUE, () => historique),
  ];
}

function profilDeMoi(source: EcranSource): c.Profil {
  const d = donneesDe(source, "Moi");
  const [prenom = AICHA.prenom, ...reste] = d.profil.nom.split(" ");
  const tel = /\+\d[\d ]+\d/.exec(d.profil.detail)?.[0];
  const depuis = dateFr(
    `1 ${/·\s*depuis\s+(.+)$/.exec(d.profil.detail)?.[1] ?? ""}`,
    source.horloge,
  );
  return {
    ...profilAicha(depuis ? isoA(depuis.jour, "08:00") : undefined),
    prenom,
    nom: reste.join(" "),
    initiales: d.profil.initiales,
    telephone: tel ? telephone(tel) : AICHA.telephone,
    pieceVerifiee: d.profil.detail.includes("CNI vérifiée"),
  };
}

function prochesDeMoi(
  liste: ReadonlyArray<{ initiales: string; nom: string; detail: string }>,
): c.Proche[] {
  return liste.map((p) => {
    const [nom = p.nom, ville] = p.nom.split(" · ");
    return {
      id: slug(nom),
      nom,
      initiales: p.initiales,
      ...(ville ? { ville } : {}),
      prevenuALArrivee: /prévenu/.test(p.detail),
      payeMesVoyages: /paie mes voyages/.test(p.detail),
    };
  });
}

type ElementMoi = DonneesDe<"Moi">["historique"]["elements"][number];

function historiqueDeMoi(
  elements: readonly ElementMoi[],
  maintenant: string,
): c.ElementHistorique[] {
  return elements.map((e): c.ElementHistorique => {
    const colis = e.titre.startsWith("Colis");
    const billetId = (e as { _billetId?: string })._billetId;
    const id =
      billetId ?? (colis ? slug(e.detail.split(" · ")[0] ?? e.titre) : `voyage-${slug(e.titre)}`);
    const date = dateFr(e.titre, maintenant);
    const montants = [...e.detail.matchAll(/(\d[\d\s]*)\sF/g)];
    const dernier = montants[montants.length - 1];
    const statuts: Record<string, c.StatutHistorique> = {
      "à venir": "a_venir",
      "à retirer": "a_retirer",
      voyagé: "voyage",
      annulé: "annule",
      livré: "livre",
    };
    return {
      type: colis ? "colis" : "voyage",
      id,
      titre: colis ? e.titre : (e.titre.split(" · ")[0] ?? e.titre),
      ...(!colis && date?.hhmm ? { departA: isoA(date.jour, date.hhmm) } : {}),
      detail: e.detail,
      montant: dernier ? entier(dernier[1] ?? "0") : 0,
      statut: statuts[e.statut] ?? "a_venir",
      recuDisponible: /reçu disponible/.test(e.detail),
    };
  });
}
