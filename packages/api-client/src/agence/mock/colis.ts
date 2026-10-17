import { numeroColis } from "@afrimove/domain";
import type { agence as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/index";
import { ECRITURES, OP_COLIS_DEPOT, OP_COLIS_FORMULAIRE } from "../operations";
import { installerImpression } from "./impression";
import type { InstallateurPlanche } from "./types";
import {
  capturer,
  groupe,
  guichetAlpha,
  idDepartAlpha,
  iso,
  lire,
  montant,
  telephone,
} from "./utilitaires";

/** « Ngo Aïcha · 6 91 22 10 08 » → un contact du contrat. */
function contact(texte: string, quoi: string): c.ContactColis {
  const m = capturer(/^(.+) · ([\d\s]+)$/, texte, quoi);
  return {
    nom: groupe(m, 1),
    telephone: lire(telephone(groupe(m, 2)), `le téléphone de ${quoi}`),
  };
}

function kilos(texte: string): number {
  return Number(texte.replace(",", "."));
}

/* ------------------------------------------------------------------ GuichetColis */

/** Planche « GuichetColis » : `useColisFormulaire`, `useEnregistrerColis`, impression. */
export const installerGuichetColis: InstallateurPlanche<"GuichetColis"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const colis0 = lire(ecran.entites.colis?.[0], "le colis du guichet");
  const guichet = capturer(/guichet (\d+)$/, d.guichet, "le guichet");
  const poids = capturer(/^([\d,]+) kg$/, d.formulaire.poids, "le poids");
  const departs: c.DepartSoute[] = d.departs.flatMap((x) => {
    if (x.heure === undefined || x.detail === undefined) return [];
    const m = capturer(/^(\S+) · (?:soute )?(\d+) ?%$/, x.detail, "un départ");
    return [
      {
        departId: idDepartAlpha(x.heure, groupe(m, 1)),
        heureDepart: iso(x.heure),
        destination: groupe(m, 1),
        soutePct: Number(groupe(m, 2)),
      },
    ];
  });
  const choisi = lire(
    d.departs.flatMap((x) => ("heure" in x && x.choisi ? [x.heure] : []))[0],
    "le départ choisi",
  );
  const departChoisi = lire(
    departs.find((x) => x.heureDepart === iso(choisi)),
    "le départ choisi dans la liste",
  );
  const format = capturer(/(\d+) × (\d+) mm/, d.etiquette.titre, "le format d'étiquette");
  const trajet = capturer(/^([A-Z]{3}) → ([A-Z]{3})$/, d.etiquette.trajet, "le trajet");
  const masque = capturer(/ · (.+)$/, d.etiquette.destinataire, "le destinataire masqué");
  const imprimante = d.etiquette.imprimante.toLowerCase().includes("ok");
  const [cash, , assurance] = d.paiement;
  const prime = lire(assurance?.montant, "l'assurance");
  const total = d.action.montant;

  const formulaire: c.ColisFormulaire = {
    prochainNumero: { sequence: colis0.sequence, numero: colis0.numero },
    guichet: guichetAlpha(Number(groupe(guichet, 1))),
    departs,
    autreVilleDisponible: d.departs.some((x) => "libelle" in x && x.libelle === "Autre ville"),
    imprimante: { etat: imprimante ? "ok" : "hors_service", nom: null },
    devis: {
      lignes: [
        { code: "port", libelle: "Port", montant: total - prime },
        { code: "assurance", libelle: "Assurance", montant: prime },
      ],
      total,
    },
    etiquette: {
      largeurMm: Number(groupe(format, 1)),
      hauteurMm: Number(groupe(format, 2)),
      trajet: { origine: groupe(trajet, 1), destination: groupe(trajet, 2) },
      destinataireMasque: groupe(masque, 1),
      poidsKg: kilos(groupe(poids, 1)),
      heureDepart: departChoisi.heureDepart,
    },
    brouillon: {
      photoPrise: d.photo.libelle.startsWith("Photo prise"),
      expediteur: contact(d.formulaire.expediteur, "l'expéditeur"),
      destinataire: contact(d.formulaire.destinataire, "le destinataire"),
      contenu: d.formulaire.contenu,
      poidsKg: kilos(groupe(poids, 1)),
      valeurDeclaree: d.formulaire.valeur,
      assure: assurance?.choisi === true,
      departId: departChoisi.departId,
      modePaiement: cash?.choisi ? "cash" : "momo",
    },
  };

  poseur.lecture(OP_COLIS_FORMULAIRE, () => formulaire);

  poseur.ecriture(ECRITURES.colisEnregistre, (evenement) => {
    const colis = evenement.donnees;
    if (!formulaire.departs.some((x) => x.departId === colis.departId)) {
      throw new ErreurHttp(404, "Départ inconnu", "DEPART_INCONNU");
    }
    const sequence = evenement.numeroPlage;
    formulaire.prochainNumero = {
      sequence: sequence + 1,
      numero: numeroColis({ gare: "DLA", at: evenement.at, sequence: sequence + 1 }),
    };
    formulaire.brouillon = null;
    return {
      colis: {
        colisId: colis.colisId,
        numero: numeroColis({ gare: "DLA", at: evenement.at, sequence }),
        sequence,
        etat: "enregistre" as const,
        prixTotal: colis.paiement.montant,
        smsDestinataire: "envoye" as const,
      },
    };
  });

  installerImpression(poseur, formulaire.imprimante);
};

/* ------------------------------------------------------------------ Depot */

/** Planche « Depot » : `useColisDepot`, `useAccepterDepotColis`, impression. */
export const installerDepot: InstallateurPlanche<"Depot"> = (ecran, poseur) => {
  const d = ecran.donnees;
  const colis = lire(ecran.entites.colis?.[0], "le colis du dépôt");
  const paye = capturer(/payé ([\d\s]+) F dans l'app/, d.trouve.libelle, "le montant payé");
  const de = capturer(/^· (.+)$/, d.fiche.de.detail, "le téléphone de l'expéditeur");
  const pour = capturer(/^· (.+)$/, d.fiche.pour.detail, "la destination");
  const declare = capturer(
    /^(.+) · ([\d,]+) kg · ([\d\s]+) F · (assuré|non assuré)$/,
    d.fiche.declare,
    "la déclaration",
  );
  const depart = capturer(
    /^(\d{2}:\d{2}) Alpha (\S+) · soute (\d+) ?%$/,
    d.fiche.depart,
    "le départ",
  );
  const poids = capturer(
    /^([\d,]+) kg · (.+)$/,
    lire(d.verifications[0], "la vérification du poids").detail,
    "le poids relevé",
  );
  const seuil = capturer(/plus de (\d+) kg/, d.note, "le seuil de dépassement");

  const vue: c.ColisDepot = {
    colisId: colis.id,
    numero: colis.numero,
    codeLu: d.code,
    etat: colis.etat,
    payeDansApp: montant(groupe(paye, 1)),
    trouveA: iso(d.trouve.heure),
    expediteur: { nom: d.fiche.de.nom, telephone: lire(telephone(groupe(de, 1)), "téléphone") },
    destinataire: { nom: d.fiche.pour.nom, destination: groupe(pour, 1) },
    declare: {
      contenu: groupe(declare, 1),
      poidsKg: kilos(groupe(declare, 2)),
      valeurDeclaree: montant(groupe(declare, 3)),
      assure: groupe(declare, 4) === "assuré",
    },
    depart: {
      departId: idDepartAlpha(groupe(depart, 1), groupe(depart, 2)),
      heureDepart: iso(groupe(depart, 1)),
      destination: groupe(depart, 2),
      soutePct: Number(groupe(depart, 3)),
    },
    verifications: {
      poidsReleveKg: kilos(groupe(poids, 1)),
      poidsConforme: groupe(poids, 2).startsWith("conforme"),
      photoRequise: true,
      seuilDepassementKg: Number(groupe(seuil, 1)),
    },
  };

  poseur.lecture(OP_COLIS_DEPOT, ({ code }) => {
    if (code !== vue.codeLu && code !== vue.numero) {
      throw new ErreurHttp(404, "Aucun colis prépayé pour ce code", "COLIS_INCONNU");
    }
    return vue;
  });

  poseur.ecriture(ECRITURES.colisDepose, (evenement) => {
    const depot = evenement.donnees;
    if (depot.colisId !== vue.colisId) throw new ErreurHttp(404, "Colis inconnu", "COLIS_INCONNU");
    const depassement = depot.poidsReleveKg - vue.declare.poidsKg;
    if (depassement > vue.verifications.seuilDepassementKg && depot.complement === 0) {
      throw new ErreurHttp(422, "Complément de poids à payer", "COMPLEMENT_REQUIS");
    }
    vue.verifications = {
      ...vue.verifications,
      poidsReleveKg: depot.poidsReleveKg,
      poidsConforme: depassement <= vue.verifications.seuilDepassementKg,
      photoRequise: false,
    };
    return {
      colis: {
        colisId: vue.colisId,
        numero: vue.numero,
        sequence: colis.sequence,
        etat: vue.etat,
        prixTotal: colis.prixTotal + depot.complement,
        smsDestinataire: "envoye" as const,
      },
      complementDemande: depot.complement,
    };
  });

  installerImpression(poseur);
};
