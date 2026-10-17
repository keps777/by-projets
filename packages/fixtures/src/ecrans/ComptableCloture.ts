import { ecran } from "../ecran";
import { DECEMBRE } from "../partage/comptable";

/** 33d · Décembre clôturé le 5 janvier à 09:12 et envoyé au cabinet : 28 414 000 F encaissés. */
export const ComptableCloture = ecran({
  planche: "ComptableCloture",
  maintenant: "09:13",
  donnees: {
    titre: "Décembre clôturé",
    detail: "5 janv. 2027 · 09:12 · signé par ton PIN",
    encaisse: {
      montant: DECEMBRE.encaisse,
      libelle: "FCFA encaissés · décembre",
      cash: { libelle: "Cash", montant: DECEMBRE.cash },
      momo: { libelle: "MoMo", montant: DECEMBRE.momo.enregistre },
      ecart: { libelle: "Écart", montant: 0 },
      verrou:
        "Les 4 transactions sans correspondance sont traitées. Le mois est verrouillé : plus aucune modification, seulement des écritures de janvier.",
    },
    envoi: {
      titre: "Envoyé à cabinet@…",
      recu: "reçu 09:13",
      fichiers: [
        {
          nom: "Journal des ventes",
          detail: "6 802 lignes · une par billet",
          format: "xlsx · 1,2 Mo",
        },
        {
          nom: "Journal de caisse",
          detail: "31 jours · 3 guichets · dépôts banque",
          format: "xlsx · 84 ko",
        },
        {
          nom: "Annulations et remboursements",
          detail: "212 lignes · motif · qui · PIN",
          format: "csv · 31 ko",
        },
        {
          nom: "Écritures SYSCOHADA",
          detail: "706 · 571 · 462 · 622 · prêt à importer",
          format: "csv · 58 ko",
        },
        {
          nom: "Factures AfriMove · décembre",
          detail: "abonnement + 6 802 × 75 + 1 940 colis × 150",
          format: "pdf · 2 p.",
        },
      ],
    },
    apercu: {
      titre: "Aperçu · journal des ventes · 3 premières lignes",
      lignes: [
        "date;heure;ligne;depart;siege;classe;prix;mode;ref;guichet;pin",
        "2026-12-01;05:52;DLA-YDE;06:00;12;CLASSIQUE;5000;CASH;A-ALP-2341;GU1;JM",
        "2026-12-01;05:54;DLA-YDE;06:00;13;CLASSIQUE;5000;MOMO;MP261201.0554.C10211;GU1;JM",
        "2026-12-01;05:57;DLA-BAF;06:30;04;VIP;7500;CASH;A-ALP-2342;GU2;MT",
      ],
    },
    actions: ["Revoir les exports", "Retour au tableau de bord"],
  },
});
