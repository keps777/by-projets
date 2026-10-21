import { ecran } from "../ecran";
import { MODULES } from "../monde";

const DETAILS: Readonly<Record<string, string>> = {
  guichet_caisse: "socle · toujours actif",
  colis: "3 gares · assurance partenaire active",
  quai_bus: "vente en route autorisée · 14 bus",
  supervision: "rapport à 21 h · 3 destinataires",
  voyageur: "paiement en ligne actif · sièges visibles",
  ussd: "code court attribué par MTN · Orange en attente",
  relais: "Douala 12 · Bafoussam 6 · Yaoundé 0",
  livraison_moto: "Douala actif · 18 livreurs · Bafoussam dès 15 livreurs",
  inter_agences: "convention signée avec Oméga · colis en correspondance",
  covoit_vendeurs: "covoit visible dans l'app voyageur · 0 vendeur",
  financement: "partenaire financier en cours · simulation disponible",
  fidelite: "1 point = 1 F · code AMI · 250 F offerts",
};

const actifs = MODULES.filter((m) => m.actif).length;

/** 35 · Les 12 modules d'Alpha : 10 actifs, covoiturage/vendeurs et financement éteints. */
export const Modules = ecran({
  planche: "Modules",
  donnees: {
    titre: "Les 12 modules",
    sousTitre: "Tout est livré. Tu allumes ce que tu utilises, par gare ou par ville.",
    modules: MODULES.map((m) => ({
      _code: m.code,
      nom: m.nom,
      detail: DETAILS[m.code] ?? "",
      actif: m.actif,
    })),
    pied: `Un module masqué disparaît des écrans de tes équipes et de tes voyageurs, sans rien perdre. ${actifs} sur ${MODULES.length} actifs chez Alpha.`,
  },
});
