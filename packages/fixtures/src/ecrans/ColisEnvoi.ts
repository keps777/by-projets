import { devisColis, primeAssurance } from "@afrimove/domain";
import { ecran } from "../ecran";

/** Le devis de la planche, calculé par le domaine : port 1 500 + frais 200 + assurance 500 = 2 200. */
const devis = devisColis({ port: 1500, canal: "app", mode: "gare", valeurAssuree: 25_000 });
const relais = devisColis({ port: 1500, canal: "app", mode: "relais", valeurAssuree: 25_000 });
const moto = devisColis({ port: 1500, canal: "app", mode: "moto", valeurAssuree: 25_000 });

/** 13 · Envoyer un colis : photo, destinataire et paiement dans un seul écran. */
export const ColisEnvoi = ecran({
  planche: "ColisEnvoi",
  donnees: {
    titre: "Envoyer un colis",
    sousTitre: "Photo, destinataire, paiement : un écran",
    photo: "Photo prise · taille estimée : petit carton · 2 kg",
    formulaire: {
      pourQui: "Maman · 6 99 40 18 22",
      ou: "Bafoussam · gare Alpha",
      contenu: "Médicaments et vêtements",
      valeur: 25000,
    },
    depart: {
      titre: "Comment ça part",
      sousTitre: "prochain départ",
      options: [
        {
          heure: "08:15",
          compagnie: "Alpha Voyages",
          detail: "· retrait à la gare de Bafoussam · arrivée 13 h",
          prix: 1500,
          choisi: true,
        },
        {
          mode: "relais",
          detail: "Remis chez un commerçant près de chez elle · 7 h–20 h",
          supplement: relais.total - devis.total,
        },
        {
          mode: "moto",
          detail: "Livré à sa porte par un livreur vérifié, photo à la remise",
          supplement: moto.total - devis.total,
        },
      ],
    },
    assurance: {
      libelle: "Assurer à 25 000 F",
      detail: "· 500 F · assureur partenaire",
      prime: primeAssurance(25_000).prime,
      active: true,
    },
    action: {
      libelle: "Payer et obtenir le code",
      detail: "touche 3 · tu déposes au guichet, l'étiquette est prête",
      total: devis.total,
    },
    detailPrix:
      "1 500 port + 200 frais + 500 assurance · interdits : argent, armes, périssables non emballés",
  },
});
