import { evaluerEcart, totalCoupures } from "@afrimove/domain";
import type { agence as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/index";
import { ECRITURES, OP_CAISSE_SESSION } from "../operations";
import type { InstallateurPlanche } from "./types";
import { capturer, groupe, iso, lire, montant, personne } from "./utilitaires";

/** Total d'une liste de coupures, avec le contrôle du domaine (coupures connues, nombres entiers). */
export function totalComptage(
  coupures: readonly { valeur: number; nombre: number }[],
  pieces: number,
): number {
  try {
    return totalCoupures(Object.fromEntries(coupures.map((x) => [x.valeur, x.nombre])), pieces);
  } catch (e) {
    throw new ErreurHttp(422, e instanceof Error ? e.message : "Comptage invalide", "COMPTAGE");
  }
}

/** Met à jour le comptage et l'écart d'une session (compté − attendu, statut selon la tolérance). */
export function recompter(
  session: c.CaisseSession,
  coupures: readonly { valeur: number; nombre: number }[],
  pieces: number,
): void {
  const total = totalComptage(coupures, pieces);
  const evaluation = evaluerEcart(session.cashAttendu, total, session.ecart.tolerance);
  session.comptage = { coupures: coupures.map((x) => ({ ...x })), pieces, total };
  session.ecart = { ...session.ecart, montant: evaluation.ecart, statut: evaluation.statut };
}

/** Planche « Caisse » : `useCaisseSession` et les écritures d'ouverture, de comptage, de clôture. */
export const installerCaisse: InstallateurPlanche<"Caisse"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const entete = capturer(
    /^(K-[A-Z0-9]+-\d{6}-(\d+)-\d+) · (.+) · ouverte (\d{2}:\d{2}) avec (.+)$/,
    d.session,
    "la session de caisse",
  );
  const periode = capturer(/^(\d{2}:\d{2}) → (\d{2}:\d{2})$/, d.appCompte.periode, "la période");
  const [billetsCash, colisCash, , annulations, momo] = d.appCompte.lignes;
  const session0 = lire(ecran.entites.sessions?.[0], "la session de l'entité");

  let session: c.CaisseSession = {
    sessionId: session0.id,
    numero: groupe(entete, 1),
    agent: personne(groupe(entete, 3)),
    guichetRang: Number(groupe(entete, 2)),
    etat: session0.etat,
    ouverteA: iso(groupe(entete, 4)),
    fondDeCaisse: montant(groupe(entete, 5)),
    periode: { debut: iso(groupe(periode, 1)), fin: iso(groupe(periode, 2)) },
    decompte: {
      billetsCash: {
        nombre: lire(billetsCash?.nombre, "billets cash"),
        montant: lire(billetsCash?.montant, "billets cash"),
      },
      colisCash: {
        nombre: lire(colisCash?.nombre, "colis cash"),
        montant: lire(colisCash?.montant, "colis cash"),
      },
      annulationsValidees: {
        nombre: lire(annulations?.nombre, "annulations"),
        // La planche écrit le montant en négatif (il est retranché) ; le contrat le garde positif.
        montant: Math.abs(lire(annulations?.montant, "annulations")),
      },
      momo: {
        ventes: lire(momo?.nombre, "MoMo"),
        montant: lire(momo?.montant, "MoMo"),
      },
    },
    cashAttendu: d.appCompte.cashAttendu.montant,
    comptage: {
      coupures: d.jeCompte.coupures.map((x) => ({ valeur: x.valeur, nombre: x.nombre })),
      pieces: d.jeCompte.pieces.montant,
      total: d.jeCompte.compte.montant,
    },
    ecart: {
      montant: d.ecart.montant,
      statut: ecran.visuel.statutEcart as c.CaisseSession["ecart"]["statut"],
      tolerance: d.ecart.tolerance.montant,
      hier: d.ecart.hier.montant,
      semaine: d.ecart.semaine.montant,
    },
  };

  poseur.lecture(OP_CAISSE_SESSION, () => session);

  poseur.ecriture(ECRITURES.caisseOuverte, (evenement) => {
    const { sessionId, numero, fondDeCaisse } = evenement.donnees;
    const guichetRang = Number(/-(\d+)-\d+$/.exec(numero)?.[1] ?? session.guichetRang);
    session = {
      ...session,
      sessionId,
      numero,
      guichetRang,
      etat: "ouverte",
      ouverteA: evenement.at,
      fondDeCaisse,
      periode: { debut: evenement.at, fin: evenement.at },
      decompte: {
        billetsCash: { nombre: 0, montant: 0 },
        colisCash: { nombre: 0, montant: 0 },
        annulationsValidees: { nombre: 0, montant: 0 },
        momo: { ventes: 0, montant: 0 },
      },
      cashAttendu: fondDeCaisse,
      comptage: { coupures: [], pieces: 0, total: 0 },
    };
    recompter(session, [], 0);
    return { session };
  });

  poseur.ecriture(ECRITURES.caisseComptee, (evenement) => {
    const { coupures, pieces, total } = evenement.donnees;
    if (totalComptage(coupures, pieces) !== total) {
      throw new ErreurHttp(422, "Le total ne correspond pas aux coupures", "COMPTAGE");
    }
    recompter(session, coupures, pieces);
    return { session };
  });

  poseur.ecriture(ECRITURES.caisseCloturee, (evenement) => {
    const { cashCompte, cashAttendu } = evenement.donnees;
    const evaluation = evaluerEcart(cashAttendu, cashCompte, session.ecart.tolerance);
    session = {
      ...session,
      etat: "cloturee",
      periode: { ...session.periode, fin: evenement.at },
      ecart: { ...session.ecart, montant: evaluation.ecart, statut: evaluation.statut },
    };
    return { session };
  });
};
