import { randomUUID } from "node:crypto";
import type { Vente } from "../modele";

/**
 * Une vente terminée d'un vendeur, pour les tests qui ont besoin d'un historique (clients, départs
 * habituels) sans rejouer chaque vente par l'API. Tout peut être remplacé.
 */
export function uneVente(surcharge: Partial<Vente> = {}): Vente {
  const creeA = surcharge.creeA ?? "2026-10-20T10:00:00.000+01:00";
  const telephone = surcharge.voisin?.telephone ?? "+237670123456";
  return {
    id: randomUUID(),
    version: 2,
    vendeurId: "vendeur-1",
    compagnieId: "compagnie-1",
    departId: randomUUID(),
    billetId: randomUUID(),
    billetNumero: "ALP-DLA-261020-0001",
    siege: 1,
    voisin: { nom: "Mme Ebogo", telephone },
    voisinIndex: `idx:${telephone}`,
    empreinte: `emp:${telephone}`,
    origine: { code: "DLA", ville: "Douala" },
    destination: { code: "YDE", ville: "Yaoundé" },
    classe: "classique",
    departA: "2026-10-23T08:30:00.000+01:00",
    prix: 4000,
    commission: 100,
    moyen: "mtn_momo",
    etat: "terminee",
    creeA,
    expireA: creeA,
    reference: "MM-1",
    regleeA: creeA,
    cause: null,
    termineeA: creeA,
    majA: creeA,
    ...surcharge,
  };
}
