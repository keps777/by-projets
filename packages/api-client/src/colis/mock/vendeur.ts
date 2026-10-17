import { PLAGE_EN_LIGNE, numeroBillet } from "@afrimove/domain";
import type { colis as c } from "@afrimove/contrats";
import { ErreurHttp } from "../../infra/erreurs";
import {
  OP_CLIENTS_VENDEUR,
  OP_DEPARTS_VENDEUR,
  OP_ESPACE_VENDEUR,
  OP_VENDRE_BILLET_VENDEUR,
} from "../operations";
import {
  entierDe,
  installer,
  isoDu,
  jourDe,
  lire,
  masquerTelephone,
  MOIS_ABREGES,
  sansPuce,
  slug,
} from "./outils";
import type { DonneesScenario, ScenarioEnConstruction } from "./outils";

interface DonneesVendeur {
  titre: string;
  detail: string;
  numero: string;
  vente: {
    titre: string;
    commission: string;
    trajet: string;
    quand: string;
    departs: {
      _departId: string;
      heure: string;
      compagnie: string;
      detail: string;
      prix: number;
    }[];
  };
  bilan: { libelle: string; valeur: number; detail: string }[];
  clients: { titre: string; liste: { nom: string; detail: string; action: string }[] };
  regle: string;
}

export function installerVendeur(sc: ScenarioEnConstruction, d: DonneesScenario): void {
  const e = lire<DonneesVendeur>(d);
  const jour = jourDe(d.horloge);
  const [annee = 0, moisCourant = 0] = jour.split("-").map(Number);
  const [nom = "", infoQuartier = "", infoCompagnies = ""] = e.detail
    .split("·")
    .map((s) => s.trim());
  const commissionParDefaut = entierDe(/(\d[\d ]*)\s*F/.exec(e.vente.commission)?.[1] ?? "0");
  const [billets, gain, clients] = e.bilan;

  let billetsDuMois = billets?.valeur ?? 0;
  let gainDuMois = gain?.valeur ?? 0;
  let sequence = PLAGE_EN_LIGNE.debut;

  const departsPlanche = e.vente.departs.map((x) => {
    const entite = d.entites.departs?.find((y) => y.id === x._departId);
    if (!entite) throw new Error(`Vendeur : départ « ${x._departId} » absent des entités`);
    const [compagnie = "", places = ""] = x.compagnie.split("·").map((s) => s.trim());
    return {
      departId: x._departId,
      compagnie,
      classe: entite.classe,
      heureDepart: entite.heureDepart,
      placesLibres: Number(/(\d+) places?/.exec(places)?.[1] ?? 0),
      prix: x.prix,
      commission: entierDe(/commission (\d[\d ]*)\s*F/.exec(x.detail)?.[1] ?? commissionParDefaut),
      numero: entite.numero,
    };
  });

  installer(sc, OP_ESPACE_VENDEUR, () => ({
    vendeur: {
      id: `pers-${slug(nom)}`,
      nom,
      numero: e.numero.replace(/^n°\s*/, ""),
      quartier: infoQuartier.replace(/^quartier\s+/, ""),
      compagnies: infoCompagnies
        .replace(/^agréée? par\s+/, "")
        .split(/\s+et\s+|,\s*/)
        .map((s) => s.trim()),
    },
    commissionParDefaut,
    bilan: {
      billetsDuMois,
      gainDuMois,
      versement: sansPuce(/versé le (\w+)/.exec(gain?.detail ?? "")?.[1] ?? ""),
      clients: clients?.valeur ?? 0,
      clientsReguliers: Number(/(\d+) réguliers/.exec(clients?.detail ?? "")?.[1] ?? 0),
    },
    regle: e.regle,
  }));

  installer(sc, OP_DEPARTS_VENDEUR, () => ({
    trajet: e.vente.trajet,
    jour: jourDe(departsPlanche[0]?.heureDepart ?? jour),
    commissionLibelle: e.vente.commission,
    departs: departsPlanche.map(({ numero: _numero, ...depart }) => depart),
    detailPaiement: e.vente.departs[0]?.detail ?? "",
  }));

  installer(sc, OP_CLIENTS_VENDEUR, () => ({
    titre: e.clients.titre,
    clients: e.clients.liste.map((l): c.ClientVendeur => {
      const parties = sansPuce(l.detail)
        .split("·")
        .map((s) => s.trim());
      const [destinationBrute = "", telephoneMasque = ""] = parties;
      const [destination = "", ...habitude] = destinationBrute.split(" ");
      const dernier = /^dernier : (\d{1,2}) ([^\s]+)$/.exec(l.action);
      let dernierVoyage: string | null = null;
      if (dernier) {
        const mois = MOIS_ABREGES[dernier[2] ?? ""] ?? 1;
        // Un dernier voyage « 28 déc. » vu en janvier date de l'année précédente.
        const an = mois > moisCourant ? annee - 1 : annee;
        dernierVoyage = isoDu(
          `${an}-${String(mois).padStart(2, "0")}-${String(dernier[1]).padStart(2, "0")}`,
          "00:00",
        );
      }
      const proposition = dernier ? null : l.action.replace(/\s*\?$/, "");
      // Le départ de la proposition : celui dont l'heure y figure (« vendredi 08:30 »), sinon le premier de la carte.
      const heureProposee = proposition === null ? null : /\b(\d{1,2}):(\d{2})\b/.exec(proposition);
      const voulue = heureProposee
        ? `${(heureProposee[1] ?? "").padStart(2, "0")}:${heureProposee[2]}`
        : null;
      const departPropose =
        proposition === null
          ? undefined
          : (departsPlanche.find((x) => /T(\d{2}:\d{2})/.exec(x.heureDepart)?.[1] === voulue) ??
            departsPlanche[0]);
      return {
        nom: l.nom,
        destination,
        habitude: habitude.length > 0 ? habitude.join(" ") : null,
        telephoneMasque,
        proposition,
        ...(departPropose ? { departId: departPropose.departId } : {}),
        dernierVoyage,
      };
    }),
  }));

  installer(sc, OP_VENDRE_BILLET_VENDEUR, (p, ctx) => {
    const depart = departsPlanche.find((x) => x.departId === p.departId);
    if (!depart) throw new ErreurHttp(404, "Départ introuvable", "depart_introuvable");
    if (depart.placesLibres <= 0) throw new ErreurHttp(409, "Départ complet", "depart_complet");
    depart.placesLibres -= 1;
    billetsDuMois += 1;
    gainDuMois += depart.commission;
    sequence += 1;
    const venduLe = ctx.horloge.iso();
    const numero = numeroBillet({
      agence: depart.numero.split("-")[0] ?? "ALP",
      gare: "DLA",
      at: venduLe,
      sequence,
    });
    return {
      billetId: `billet-${numero.toLowerCase()}`,
      numero,
      departId: depart.departId,
      prix: depart.prix,
      commission: depart.commission,
      aRegler: depart.prix,
      smsEnvoyeA: masquerTelephone(p.voisin.telephone),
      venduLe,
    };
  });
}
