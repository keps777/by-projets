import { FriseEtapes } from "./frise-etapes";
import type { EtapeFrise } from "./frise-etapes";

export const ETAPES_COLIS = ["Déposé", "Chargé", "En route", "Disponible", "Remis"] as const;

export type EtapeColis = (typeof ETAPES_COLIS)[number];

export type DetailEtapeColis = {
  /** Remplace le nom de l'étape : « Disponible à Bafoussam ». */
  libelle?: string;
  /** « gare Alpha Douala · étiquette imprimée » */
  detail?: string;
  /** « 07:52 », « ~13:00 », « — » */
  heure?: string;
};

export type PropsFriseColis = {
  /** Étape en cours, de 0 (Déposé) à 4 (Remis). Au-delà de 4, tout est fait. */
  etapeCourante: number;
  /** Un élément par étape, dans l'ordre : déposé, chargé, en route, disponible, remis. */
  details?: readonly DetailEtapeColis[];
  libelle?: string;
  className?: string;
};

/** Frise de suivi d'un colis en 5 étapes (maquette ColisCode). */
export function FriseColis({
  etapeCourante,
  details = [],
  libelle = "Suivi du colis",
  className,
}: PropsFriseColis) {
  const etapes: EtapeFrise[] = ETAPES_COLIS.map((nom, index) => {
    const info = details[index];
    const etat = index < etapeCourante ? "passe" : index === etapeCourante ? "en-cours" : "a-venir";
    const titre = info?.libelle ?? nom;
    const accent = etat !== "a-venir";
    return {
      id: nom,
      etat,
      contenu: (
        <>
          {accent ? <strong>{titre}</strong> : titre}
          {info?.detail ? ` · ${info.detail}` : ""}
        </>
      ),
      heure: info?.heure,
    };
  });
  return <FriseEtapes etapes={etapes} libelle={libelle} variante="suivi" className={className} />;
}
