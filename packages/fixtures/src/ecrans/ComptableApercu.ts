import { ecran } from "../ecran";
import { nombre } from "../format";
import { DECEMBRE } from "../partage/comptable";

/** Une ligne du journal des ventes : date, heure, ligne, départ, siège, classe, prix, mode, guichet. */
type Vente = readonly [string, string, string, string, string, string, number, string, string];

const VENTES: readonly Vente[] = [
  ["01/12", "05:52", "DLA-YDE", "06:00", "12", "CLASS.", 5000, "CASH", "GU1 · JM"],
  ["01/12", "05:54", "DLA-YDE", "06:00", "13", "CLASS.", 5000, "MOMO", "GU1 · JM"],
  ["01/12", "05:57", "DLA-BAF", "06:30", "04", "VIP", 7500, "CASH", "GU2 · MT"],
  ["01/12", "06:01", "DLA-YDE", "07:00", "01", "VIP", 7500, "APP", "en ligne"],
  ["01/12", "06:03", "DLA-YDE", "06:00", "14", "CLASS.", 5000, "CASH", "GU1 · JM"],
  ["01/12", "06:08", "COLIS", "06:30", "—", "3 kg", 3000, "MOMO", "GU3 · PN"],
  ["01/12", "06:12", "DLA-BAF", "06:30", "17", "CLASS.", 3500, "CASH", "GU2 · MT"],
  ["01/12", "06:15", "DLA-YDE", "07:00", "02", "VIP", 7500, "USSD", "en ligne"],
  ["01/12", "06:20", "DLA-YDE", "07:00", "15", "CLASS.", 5000, "ANNULÉ", "GU1 · JM"],
  ["01/12", "06:24", "DLA-BAF", "06:30", "18", "CLASS.", 3500, "CASH", "GU2 · MT"],
];

/** 33c · Aperçu du journal des ventes de décembre (pop-up XLSX) : 31 404 lignes, total 28 414 000. */
export const ComptableApercu = ecran({
  planche: "ComptableApercu",
  donnees: {
    fond: {
      titre: "Comptable",
      periode: `${DECEMBRE.mois} · ${DECEMBRE.cloture}`,
      rapprochement: "Rapprochement MoMo · décembre",
      exports: "Exports · colonnes fixes",
    },
    export: {
      format: "XLSX",
      nom: "Journal des ventes · décembre",
      detail: "31 404 lignes · 11 colonnes · 1,2 Mo · généré à l'instant",
      fermer: "Fermer",
      onglets: ["Ventes · 31 404", "Par jour", "Par guichet", "Totaux"],
    },
    tableau: {
      colonnes: ["date", "heure", "ligne", "dép.", "siège", "classe", "prix", "mode", "guichet"],
      lignes: VENTES.map(
        ([date, heureVente, ligne, depart, siege, classe, prix, mode, guichet]) => ({
          date,
          heure: heureVente,
          ligne,
          depart,
          siege,
          classe,
          prix,
          mode,
          guichet,
        }),
      ),
      pied: "Lignes 1 – 10 sur 31 404 · glisser pour les suivantes",
      total: `total ${nombre(DECEMBRE.encaisse)}`,
    },
    garanties: [
      {
        titre: "Colonnes fixes",
        detail: "identiques chaque mois · le cabinet importe sans retoucher",
      },
      { titre: "Un onglet par vue", detail: "ventes · par jour · par guichet · totaux" },
      { titre: "Signé", detail: "empreinte AfriMove dans le fichier · infalsifiable" },
    ],
    actions: ["Fermer", "Télécharger", "Envoyer au cabinet"],
  },
  visuel: { fenetre: "pop-up", voile: true },
});
