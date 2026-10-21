import type { Billet, DepartComplet, Passager, PlanStocke, ScanStocke } from "./modeles";
import {
  limiteAnnulationGratuite,
  SEUIL_PRESQUE_COMPLET,
  type ClasseBillet,
  type EtatBillet,
} from "./regles";
import { enMs } from "./temps";

/**
 * Formes des réponses : exactement celles des schémas de `@afrimove/contrats` (les tests e2e relisent
 * chaque réponse avec le schéma zod). Des fonctions pures, sans accès aux ports.
 */

/** Minutes avant le départ où il faut être au quai (texte de la carte du billet). */
export const PRESENCE_QUAI_MINUTES = 30;

/** Capacité du bus d'un départ ; un départ sans bus ne se vend pas. */
export function capaciteDe(dc: DepartComplet): number {
  return dc.bus?.capacite ?? 0;
}

/** Sièges libres d'un plan : ni occupés, ni bloqués à `maintenant`. */
export function siegesLibres(plan: PlanStocke, capacite: number, maintenant: string): number[] {
  const libres: number[] = [];
  for (let s = 1; s <= capacite; s++) {
    if (plan.occupes[s] !== undefined) continue;
    const b = plan.bloques[s];
    if (b && enMs(b.jusqua) > enMs(maintenant)) continue;
    libres.push(s);
  }
  return libres;
}

export function prixDuDepart(dc: DepartComplet): number {
  return dc.ligne.tarifs[dc.depart.classe];
}

export function departVoyageur(dc: DepartComplet, placesLibres: number) {
  return {
    id: dc.depart.id,
    numero: dc.depart.numero,
    compagnie: { id: dc.compagnie.id, nom: dc.compagnie.nom },
    classe: dc.depart.classe,
    heureDepart: dc.depart.heureDepart,
    prix: prixDuDepart(dc),
    placesLibres,
    presqueComplet: placesLibres > 0 && placesLibres <= SEUIL_PRESQUE_COMPLET,
  };
}

/** Résumé d'un départ pour les listes de l'agence. */
export function departResume(dc: DepartComplet, placesLibres: number) {
  return {
    departId: dc.depart.id,
    heureDepart: dc.depart.heureDepart,
    destination: dc.destination.ville,
    placesLibres,
  };
}

export function billetImprimable(b: Billet, p: Passager, dc: DepartComplet) {
  return {
    billetId: b.id,
    numero: b.numero,
    sequence: b.sequence,
    compagnie: dc.compagnie.nom,
    trajet: { origine: dc.origine.code, destination: dc.destination.code },
    heureDepart: dc.depart.heureDepart,
    siege: b.siege,
    classe: b.classe,
    passager: { nom: p.nom, pieceQuatreDerniers: p.pieceQuatreDerniers },
    codeBillet: b.codeBillet,
    qr: b.qr,
    prix: b.prix + b.bagage,
    aCompleterAuQuai: b.aCompleterAuQuai,
  };
}

export function billetVoyageur(b: Billet, p: Passager, dc: DepartComplet) {
  return {
    id: b.id,
    numero: b.numero,
    etat: b.etat as EtatBillet,
    smsEnvoye: b.smsEnvoye,
    compagnie: { id: dc.compagnie.id, nom: dc.compagnie.nom },
    classe: b.classe as ClasseBillet,
    departId: dc.depart.id,
    heureDepart: dc.depart.heureDepart,
    dureeMinutes: dc.ligne.dureeMinutes,
    origine: { ville: { code: dc.origine.code, nom: dc.origine.ville }, gare: dc.origine.nom },
    destination: {
      ville: { code: dc.destination.code, nom: dc.destination.ville },
      gare: dc.destination.nom,
    },
    siege: b.siege,
    prix: b.prix + b.bagage,
    passager: {
      nom: p.nom ?? "",
      ...(p.pieceQuatreDerniers ? { pieceQuatreDerniers: p.pieceQuatreDerniers } : {}),
    },
    qr: b.qr,
    codeBillet: b.codeBillet,
    presenceQuaiMinutes: PRESENCE_QUAI_MINUTES,
    annulationGratuiteJusqua: limiteAnnulationGratuite(dc.depart.heureDepart),
  };
}

/** Un scan tel que le quai l'affiche ; l'identité vient du billet, jamais de la table des scans. */
export function scanQuai(s: ScanStocke, p: Passager | null) {
  return {
    billetId: s.billetId ?? "inconnu",
    numero: s.numero ?? "inconnu",
    resultat: s.resultat,
    at: s.at,
    voyageur: p?.nom ?? null,
    siege: s.siege,
    pieceQuatreDerniers: p?.pieceQuatreDerniers ?? null,
    classe: s.classe ?? ("classique" as ClasseBillet),
    bagagesSoute: s.bagagesSoute,
  };
}
