import { ecran } from "../ecran";
import { JOSEPH_M } from "../monde";
import { CAISSE_JOSEPH as K, SESSION_JOSEPH_OUVERTE } from "../partage/caisse";

/** 27 · Fermer ma caisse : ce que l'app a compté, ce que Joseph compte, l'écart. */
export const Caisse = ecran({
  planche: "Caisse",
  maintenant: "13:58",
  donnees: {
    titre: "Fermer ma caisse",
    session: `${K.numero} · Joseph M. · ouverte 05:02 avec 20 000`,
    badge: "TOUCHE 2",
    appCompte: {
      titre: "Ce que l'app a compté",
      periode: "05:02 → 13:58",
      lignes: [
        { libelle: "Billets cash", nombre: K.billetsCash.nombre, montant: K.billetsCash.montant },
        { libelle: "Colis cash", nombre: K.colisCash.nombre, montant: K.colisCash.montant },
        { libelle: "Fond de caisse", montant: K.fond },
        {
          libelle: "Annulations validées (PIN sup.)",
          nombre: K.annulations.nombre,
          montant: -K.annulations.montant,
        },
        {
          libelle: "MoMo",
          detail: "ventes (pas en caisse)",
          nombre: K.momo.ventes,
          montant: K.momo.montant,
        },
      ],
      cashAttendu: { libelle: "Cash attendu", montant: K.attendu },
    },
    jeCompte: {
      titre: "Ce que je compte · touche les billets",
      aide: "ou tape le total",
      coupures: [
        { valeur: 10_000, nombre: K.coupures[10_000] },
        { valeur: 5_000, nombre: K.coupures[5_000] },
        { valeur: 2_000, nombre: K.coupures[2_000] },
        { valeur: 1_000, nombre: K.coupures[1_000] },
        { valeur: 500, nombre: K.coupures[500] },
      ],
      pieces: { libelle: "pièces", montant: 0 },
      compte: { libelle: "compté", montant: K.compte },
    },
    ecart: {
      libelle: "Écart",
      montant: K.evaluation.ecart,
      tolerance: { libelle: "Tolérance de l'agence :", montant: K.tolerance },
      hier: { libelle: "Hier :", montant: 0 },
      semaine: { libelle: "cette semaine :", montant: -1000 },
    },
    cloture: {
      libelle: "Clôturer · faire valider par le superviseur",
      detail: "touche 3 · il met son PIN, l'écart est tracé, le rapport part à 21 h",
    },
  },
  entites: { sessions: [SESSION_JOSEPH_OUVERTE] },
  visuel: { agent: JOSEPH_M.nom, statutEcart: K.evaluation.statut },
});
