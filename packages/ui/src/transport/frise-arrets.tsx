import { FriseEtapes } from "./frise-etapes";
import type { EtapeFrise } from "./frise-etapes";

export type EtatArret = "passe" | "en-cours" | "prochain";

export type Arret = {
  id?: string;
  nom: string;
  heure: string;
  etat: EtatArret;
  /** « parti », « arrêt 10 min », « prochain arrêt » */
  detail?: string;
  /** Nombre de places qui montent à cet arrêt (arrêt de montée). */
  montees?: number;
  href?: string;
  onSelect?: () => void;
};

export type PropsFriseArrets = {
  arrets: readonly Arret[];
  libelle?: string;
  className?: string;
};

function contenuArret(arret: Arret): string {
  if (arret.montees !== undefined && arret.montees > 0) {
    const verbe = arret.montees > 1 ? "montent" : "monte";
    const noun = arret.montees > 1 ? "places" : "place";
    return `${arret.nom} · ${arret.montees} ${noun} ${verbe} ici`;
  }
  return arret.detail ? `${arret.nom} · ${arret.detail}` : arret.nom;
}

/**
 * Frise verticale des arrêts d'un trajet (maquette Direct) : passé en vert, arrêt en cours qui
 * pulse en orange, arrêts suivants en anneau gris, avec les montées en route cliquables.
 */
export function FriseArrets({ arrets, libelle = "Arrêts du trajet", className }: PropsFriseArrets) {
  const etapes: EtapeFrise[] = arrets.map((arret, index) => ({
    id: arret.id ?? `${index}-${arret.nom}`,
    etat: arret.etat === "prochain" ? "a-venir" : arret.etat,
    contenu: contenuArret(arret),
    heure: arret.heure,
    href: arret.href,
    onSelect: arret.onSelect,
  }));
  return <FriseEtapes etapes={etapes} libelle={libelle} variante="arrets" className={className} />;
}
