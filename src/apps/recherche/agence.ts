// Vitrine d'une agence partenaire : monogramme, spécialités déduites de ses offres, libellés. Fonctions pures.
import type { Aeroport, Agence, OffreAgence, Vol, Zone } from '../../domain/types.ts';

/** Numéro de permis affiché (exemple fictif, comme dans la maquette). */
export const PERMIS_EXEMPLE = 'n° 000000 (exemple)';
/** « Agence Horizon » → « AH », « Cap Nord Voyages » → « CN » : initiales des deux premiers mots. */
export function monogramme(nom: string): string {
  const mots = nom.trim().split(/\s+/).filter(Boolean); return (mots.slice(0, 2).map((m) => m[0]).join('') || '·').toUpperCase();
}
/** Zones des destinations proposées par l'agence, sans doublon, dans l'ordre d'apparition. */
export function zonesDe(offres: OffreAgence[], vols: Vol[], aeroports: Aeroport[]): Zone[] {
  const zones: Zone[] = [];
  for (const o of offres) { const v = vols.find((x) => x.id === o.volId), a = aeroports.find((x) => x.code === v?.vers); if (a && !zones.includes(a.zone)) zones.push(a.zone); }
  return zones;
}
/** « Europe » / « Europe, Caraïbes » / « Europe et plus » : spécialités de la vitrine. */
export const specialitesTexte = (zones: Zone[]): string => (zones.length ? zones.join(', ') : 'À préciser');
/** Nom affiché : toutes les agences de la démonstration sont des exemples. */
export const nomAffiche = (a: Pick<Agence, 'nom'>): string => a.nom;
export const SUFFIXE_EXEMPLE = '(exemple)';
/** Message prérempli pour un forfait vol + hôtel. */
export const messageForfait = (a: Pick<Agence, 'nom'>): string => `Bonjour, je souhaite un forfait vol + hôtel avec ${a.nom}. Pouvez-vous me proposer des dates et un prix ?`;
