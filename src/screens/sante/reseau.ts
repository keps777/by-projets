// Annuaire du réseau de soins (données d'exemple pour Douala) et position de repli quand la géolocalisation est refusée.
import type { Lieu, Point } from '../../core/reseau.ts';

/** Bonamoussadi, Douala : position de repli. */
export const POSITION_PAR_DEFAUT: Point = { lat: 4.09, lng: 9.73 };
export const LIEUX: Lieu[] = [
  { id: 'palmiers', nom: 'Clinique Les Palmiers', type: 'clinique', quartier: 'Bonamoussadi', lat: 4.0959, lng: 9.739, telephone: '+237 233 40 12 00',
    sous: 'Bonamoussadi · tiers payant · 24h/24', detail: 'Ouvert 24h/24. Tiers payant : vous ne payez que votre part. Urgences, imagerie, maternité.' },
  { id: 'saint-raphael', nom: 'Hôpital Saint-Raphaël', type: 'clinique', quartier: 'Akwa', lat: 4.0563, lng: 9.703, telephone: '+237 233 42 55 10',
    sous: 'Akwa · maternité, pédiatrie', detail: 'Ouvert 7h à 22h. Spécialités : maternité, pédiatrie, chirurgie. Tiers payant sur présentation de la carte.' },
  { id: 'rond-point', nom: 'Pharmacie du Rond-Point', type: 'pharmacie', quartier: 'Bonamoussadi', lat: 4.0936, lng: 9.7259, telephone: '+237 233 40 77 31',
    sous: 'Bonamoussadi · ordonnances', detail: 'Ouvert 8h à 21h. Prise en charge sur ordonnance, livraison en 2 h possible.' },
  { id: 'bioplus', nom: 'Laboratoire Bio-Plus', type: 'laboratoire', quartier: 'Makepe', lat: 4.1055, lng: 9.7192, telephone: '+237 233 41 08 64',
    sous: 'Makepe · analyses, bilans', detail: 'Ouvert 7h à 18h, du lundi au samedi. Résultats envoyés dans l’application.' },
  { id: 'horizon', nom: "Centre d'imagerie Horizon", type: 'imagerie', quartier: 'Bonapriso', lat: 4.0693, lng: 9.7525, telephone: '+237 233 43 20 90',
    sous: 'Bonapriso · radio, échographie', detail: 'Ouvert 8h à 19h. Radiographie, échographie et scanner, tiers payant sur présentation de la carte.' }
];
export const TYPES_LIEU: { id: string; libelle: string }[] = [
  { id: 'tous', libelle: 'Tous' }, { id: 'clinique', libelle: 'Cliniques' }, { id: 'pharmacie', libelle: 'Pharmacies' }, { id: 'laboratoire', libelle: 'Labos' }, { id: 'imagerie', libelle: 'Imagerie' }
];
export const PHARMACIES = LIEUX.filter((l) => l.type === 'pharmacie');
