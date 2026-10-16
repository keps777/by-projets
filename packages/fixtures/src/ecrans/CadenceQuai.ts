import { ecran } from "../ecran";
import { NGONO_ALBERTINE } from "../monde";
import { partageCadence } from "../partage/cadence";

const { depart, billet0225, billet0228, billet0231, billet0232 } = partageCadence;

/** 20c · Cadence au quai : le convoyeur Alain scanne le 0232 et complète le nom et la pièce. */
export const CadenceQuai = ecran({
  planche: "CadenceQuai",
  maintenant: "05:22",
  donnees: {
    titre: "Quai 1 · 05:30 Yaoundé",
    detail: "Convoyeur Alain · scan + compléter les billets de cadence",
    heure: "05:22",
    scan: {
      libelle: "Scanné · billet de cadence, sans nom",
      heure: "05:22:10",
      _billetId: billet0232.id,
      numero: billet0232.numero,
      siege: "siège 19",
      detail: "Vendu à 05:14 au guichet 2 · cash 4 000 · valide pour ce départ",
    },
    completer: {
      titre: "Compléter · le client montre sa pièce",
      nom: { libelle: "Nom", valeur: NGONO_ALBERTINE.nom },
      piece: { libelle: "Pièce · 4 derniers", valeur: "2210" },
      telephone: { libelle: "Téléphone (facultatif, SMS)", valeur: "6 55 12 …" },
      aide: "Le nom est tapé une fois ici, jamais au guichet pendant la cadence. Sans nom, pas d'embarquement.",
    },
    embarquement: {
      embarques: 21,
      capacite: 40,
      libelle: "embarqués",
      nominatifs: 15,
      libelleNominatifs: "nominatifs ·",
      completes: 6,
      libelleCompletes: "cadence complétés",
      depart: "départ 05:30",
    },
    sansNom: {
      titre: "Billets de cadence encore sans nom",
      total: 11,
      liste: [
        {
          _billetId: billet0225.id,
          numero: "0225",
          detail: "· siège 12 · 05:11 · cash",
          action: "au scan",
        },
        {
          _billetId: billet0228.id,
          numero: "0228",
          detail: "· siège 15 · 05:12 · MoMo ·",
          sms: "SMS envoyé",
          action: "au scan",
        },
        {
          _billetId: billet0231.id,
          numero: "0231",
          detail: "· siège 18 · 05:14 · cash",
          action: "au scan",
        },
      ],
    },
    rapport:
      "Un billet de cadence jamais scanné ni complété au départ apparaît dans le rapport du soir comme « vendu, non embarqué, sans nom ». C'est ce que le patron et l'assistant surveillent.",
    actions: {
      vue: "Vue du quai",
      embarquer: {
        libelle: "Embarquer · siège 19",
        detail: "le billet devient nominatif · scan suivant",
      },
    },
  },
  visuel: { progression: 21 / 40 },
  entites: { departs: [depart], billets: [billet0225, billet0228, billet0231, billet0232] },
});
