// Covoiturage : données de démonstration déterministes (conducteurs, offres sur 7 jours, avis). Pur, testé.
import type { OffreCovoit, Personne } from '../domain/types.ts';
import { ajouterJours, jourDe } from './dates.ts';
import { departOffreMs } from './covoit.ts';
import { hachage } from './covoitRegles.ts';
import type { Carrosserie, ProfilConducteur } from './covoitTypes.ts';

interface Cond { id: string; prenom: string; nom: string; tel: string; note: number; marque: string; modele: string; couleur: string; plaque: string; carrosserie: Carrosserie; places: number; depuis: string; trajets: number; nbAvis: number; fumeur?: boolean; femmes?: boolean; clim?: boolean; verifie?: boolean; bio: string }
/** Conducteurs de démonstration : les 5 du monde (profil ajouté) et 8 nouveaux (personne ajoutée au monde). */
const CONDUCTEURS: Cond[] = [
  { id: 'p-moussa', prenom: 'Moussa', nom: 'Kaba', tel: '670000115', note: 4.9, marque: 'Toyota', modele: 'Corolla', couleur: 'Gris', plaque: 'CE 482 KM', carrosserie: 'berline', places: 3, depuis: '2024-02', trajets: 212, nbAvis: 164, bio: 'Je fais Yaoundé–Douala depuis 6 ans. Ponctuel, musique douce.' },
  { id: 'p-aminata', prenom: 'Aminata', nom: 'Diallo', tel: '670000116', note: 4.8, marque: 'Kia', modele: 'Picanto', couleur: 'Rouge', plaque: 'CE 215 AD', carrosserie: 'citadine', places: 2, depuis: '2024-09', trajets: 96, nbAvis: 71, clim: false, bio: 'Petite voiture, grande ponctualité. Bagages légers uniquement.' },
  { id: 'p-jeanpaul', prenom: 'Jean-Paul', nom: 'Nana', tel: '670000117', note: 4.6, marque: 'Toyota', modele: 'Hilux', couleur: 'Blanc', plaque: 'LT 904 JP', carrosserie: 'pickup', places: 2, depuis: '2023-11', trajets: 143, nbAvis: 98, bio: 'Pick-up double cabine : place pour les gros bagages.' },
  { id: 'p-sandrine', prenom: 'Sandrine', nom: 'Eyenga', tel: '670000118', note: 4.9, marque: 'Toyota', modele: 'Rav4', couleur: 'Noir', plaque: 'CE 733 SE', carrosserie: 'suv', places: 3, depuis: '2024-05', trajets: 188, nbAvis: 141, bio: 'Voyage confortable, pause café à Edéa si vous voulez.' },
  { id: 'p-boris', prenom: 'Boris', nom: 'Tagne', tel: '670000119', note: 4.5, marque: 'Dacia', modele: 'Logan', couleur: 'Bleu', plaque: 'LT 118 BT', carrosserie: 'berline', places: 3, depuis: '2025-01', trajets: 54, nbAvis: 37, fumeur: true, bio: 'Économique et sans prise de tête.' },
  { id: 'p-cv-ruth', prenom: 'Ruth', nom: 'Fonkou', tel: '670000201', note: 4.9, marque: 'Toyota', modele: 'Yaris', couleur: 'Blanc', plaque: 'CE 361 RF', carrosserie: 'citadine', places: 3, depuis: '2024-07', trajets: 120, nbAvis: 93, femmes: true, bio: 'Trajets entre femmes, en toute sérénité.' },
  { id: 'p-cv-hassan', prenom: 'Hassan', nom: 'Oumarou', tel: '670000202', note: 4.7, marque: 'Nissan', modele: 'Almera', couleur: 'Argent', plaque: 'CE 627 HO', carrosserie: 'berline', places: 2, depuis: '2024-03', trajets: 87, nbAvis: 60, bio: 'Chauffeur prudent, départ à l’heure.' },
  { id: 'p-cv-estelle', prenom: 'Estelle', nom: 'Mballa', tel: '670000203', note: 4.8, marque: 'Hyundai', modele: 'Elantra', couleur: 'Gris', plaque: 'LT 540 EM', carrosserie: 'berline', places: 3, depuis: '2024-10', trajets: 76, nbAvis: 55, femmes: true, bio: 'Voiture climatisée, ambiance calme.' },
  { id: 'p-cv-didier', prenom: 'Didier', nom: 'Tchinda', tel: '670000204', note: 4.6, marque: 'Hyundai', modele: 'Tucson', couleur: 'Beige', plaque: 'OU 289 DT', carrosserie: 'suv', places: 4, depuis: '2023-08', trajets: 205, nbAvis: 150, bio: 'SUV spacieux, 4 places et de la soute.' },
  { id: 'p-cv-nadine', prenom: 'Nadine', nom: 'Tamo', tel: '670000205', note: 4.9, marque: 'Suzuki', modele: 'Swift', couleur: 'Rouge', plaque: 'CE 774 NT', carrosserie: 'citadine', places: 3, depuis: '2025-02', trajets: 41, nbAvis: 33, bio: 'Étudiante, je rentre souvent à Bafoussam.' },
  { id: 'p-cv-patrick', prenom: 'Patrick', nom: 'Ngassa', tel: '670000206', note: 4.4, marque: 'Peugeot', modele: '307', couleur: 'Vert', plaque: 'OU 150 PN', carrosserie: 'berline', places: 3, depuis: '2023-05', trajets: 165, nbAvis: 112, fumeur: true, clim: false, bio: 'Vieux routier de la route de l’Ouest.' },
  { id: 'p-cv-grace', prenom: 'Grâce', nom: 'Abena', tel: '670000207', note: 4.8, marque: 'Kia', modele: 'Rio', couleur: 'Bleu', plaque: 'LT 392 GA', carrosserie: 'citadine', places: 3, depuis: '2024-12', trajets: 63, nbAvis: 48, bio: 'Douala–Kribi presque tous les jours.' },
  { id: 'p-cv-ibrahim', prenom: 'Ibrahim', nom: 'Njoya', tel: '670000208', note: 4.7, marque: 'Toyota', modele: 'Land Cruiser', couleur: 'Noir', plaque: 'LT 811 IN', carrosserie: 'suv', places: 3, depuis: '2024-01', trajets: 132, nbAvis: 101, bio: 'Gros 4x4, route sûre même sous la pluie.' }
];
export const IDS_NOUVEAUX_CONDUCTEURS = CONDUCTEURS.filter((c) => c.id.startsWith('p-cv-')).map((c) => c.id);
export const profilDemo = (c: Cond): ProfilConducteur => ({
  identite: { numero: String(100000000 + (hachage(c.id) % 899999999)), recto: '', verso: '' }, permis: { numero: `P${String(hachage(c.id + 'p') % 99999999).padStart(8, '0')}`, validite: '2029-06-30' },
  vehicule: { marque: c.marque, modele: c.modele, couleur: c.couleur, plaque: c.plaque, places: c.places, carrosserie: c.carrosserie, photos: [] },
  statut: 'verifie', soumisLe: 0, telVerifie: true, trajets: c.trajets, depuis: c.depuis, nbAvis: c.nbAvis, fumeur: !!c.fumeur, clim: c.clim !== false, femmes: !!c.femmes, bio: c.bio
});

type Modele = [axe: [string, string], heure: string, cond: string, places: number, prix: number, point: string, jours: number[]];
/** Trajets entre villes (le seed du monde porte déjà les 5 offres Yaoundé → Douala de demain : on n'en ajoute pas ce jour-là, le panorama les compte). L'axe, l'heure, le conducteur, la capacité encore proposée, le prix par place, le point de départ et les jours (0 = aujourd'hui). */
const INTERURBAIN: Modele[] = [
  [['Yaoundé', 'Douala'], '06:30', 'p-cv-ruth', 3, 4500, 'Mvan', [0, 2, 4, 6]], [['Yaoundé', 'Douala'], '13:00', 'p-cv-hassan', 2, 4000, 'Etoudi', [2, 3, 5]],
  [['Yaoundé', 'Douala'], '17:30', 'p-moussa', 1, 4500, 'Nsam', [0, 3, 5]], [['Douala', 'Yaoundé'], '07:00', 'p-cv-estelle', 3, 4500, 'Bonabéri', [0, 1, 2, 3, 5]],
  [['Douala', 'Yaoundé'], '16:30', 'p-jeanpaul', 2, 5000, 'Akwa', [0, 2, 4, 6]], [['Yaoundé', 'Bafoussam'], '07:30', 'p-cv-nadine', 3, 5000, 'Biyem-Assi', [0, 1, 3, 4]],
  [['Yaoundé', 'Bafoussam'], '14:00', 'p-cv-didier', 4, 4500, 'Mvog-Mbi', [2, 5]], [['Bafoussam', 'Yaoundé'], '08:00', 'p-cv-patrick', 3, 5000, 'Marché A', [1, 2, 4, 6]],
  [['Douala', 'Kribi'], '08:30', 'p-cv-grace', 3, 2500, 'Bonamoussadi', [0, 1, 3, 5, 6]], [['Kribi', 'Douala'], '15:00', 'p-cv-ibrahim', 3, 3000, 'Gare routière', [1, 3, 4]],
  [['Douala', 'Bafoussam'], '06:00', 'p-sandrine', 3, 4500, 'Ndokotti', [0, 2, 3, 5]], [['Bafoussam', 'Douala'], '13:30', 'p-boris', 2, 4000, 'Tamdja', [1, 4, 6]],
  [['Yaoundé', 'Kribi'], '09:00', 'p-aminata', 2, 5000, 'Tongolo', [2, 4, 6]]
];
/** Trajets dans la ville : quartier de départ, quartier d'arrivée (le prix suit la distance). */
const VILLE: [axe: [string, string], heure: string, cond: string, places: number, prix: number, jours: number[]][] = [
  [['Bastos', 'Essos'], '07:15', 'p-aminata', 2, 400, [0, 1, 2, 3, 4, 5, 6]], [['Biyem-Assi', 'Mokolo'], '08:10', 'p-cv-hassan', 3, 500, [0, 1, 2, 3, 4]], [['Nlongkak', 'Omnisports'], '17:45', 'p-sandrine', 2, 350, [0, 2, 4, 6]],
  [['Akwa', 'Bonamoussadi'], '07:40', 'p-cv-grace', 3, 500, [0, 1, 2, 3, 4, 5]], [['Bonapriso', 'Deido'], '12:20', 'p-cv-ibrahim', 2, 450, [1, 2, 3, 5]], [['Makepe', 'Akwa'], '18:10', 'p-boris', 3, 400, [0, 1, 3, 4, 6]]
];
const dernierMot = (s: string) => s.replace(/^p-(cv-)?/, '');
export interface DemoCovoit { conducteurs: Personne[]; profils: Record<string, ProfilConducteur>; offres: OffreCovoit[] }
/** Tout ce qu'il faut pour que l'onglet soit vivant : les départs des 7 jours à partir de `jourRef` qui ne sont pas encore partis à `nowMs`. Mêmes entrées, mêmes sorties. */
export function genererDemo(jourRef: string, nowMs: number): DemoCovoit {
  const offres: OffreCovoit[] = [];
  const cond = (id: string) => CONDUCTEURS.find((c) => c.id === id)!;
  for (let d = 0; d < 7; d++) {
    const jour = ajouterJours(jourRef, d);
    INTERURBAIN.forEach(([axe, heure, c, places, prix, depart, jours], i) => {
      if (!jours.includes(d)) return; const cd = cond(c);
      offres.push({ id: `cvd-${jour}-${i}`, conducteurId: c, de: axe[0], vers: axe[1], jour, heure, places: Math.min(places, cd.places), prix, vehicule: `${cd.marque} ${cd.modele}`, enVille: false, depart, reservations: [], statut: 'ouverte' });
    });
    VILLE.forEach(([axe, heure, c, places, prix, jours], i) => {
      if (!jours.includes(d)) return; const cd = cond(c);
      offres.push({ id: `cvd-${jour}-v${i}`, conducteurId: c, de: axe[0], vers: axe[1], jour, heure, places: Math.min(places, cd.places), prix, vehicule: `${cd.marque} ${cd.modele}`, enVille: true, depart: axe[0], reservations: [], statut: 'ouverte' });
    });
  }
  const profils: Record<string, ProfilConducteur> = {};
  for (const c of CONDUCTEURS) profils[c.id] = profilDemo(c);
  const conducteurs: Personne[] = CONDUCTEURS.filter((c) => c.id.startsWith('p-cv-')).map((c) => ({ id: c.id, prenom: c.prenom, nom: c.nom, tel: c.tel, role: 'conducteur', actif: true, vehicule: dernierMot(c.modele), note: c.note }));
  return { conducteurs, profils, offres: offres.filter((o) => departOffreMs(o) >= nowMs) };
}
/** Le jour d'une date en ms (aide pour les appelants). */
export const jourDeMs = (ms: number) => jourDe(new Date(ms));

// ------------------------------------------------------------------ avis de démonstration
const AUTEURS = ['Carine', 'Fabrice', 'Mireille', 'Brice', 'Yvette', 'Serge', 'Laure', 'Armand', 'Fanta', 'Hervé', 'Pauline', 'Cédric'];
const TEXTES = ['Arrivé à l’heure, voiture propre, je recommande.', 'Conduite très sûre, on se sent en confiance.', 'Très sympa, bonne musique et clim au top.', 'Départ ponctuel, prix honnête.', 'Voyage tranquille, merci pour les arrêts.', 'Ma valise a bien rentré, conducteur serviable.', 'Excellente ambiance, je reprendrai avec plaisir.', 'Un peu de retard au départ mais très correct ensuite.', 'Parfait pour rentrer à Douala sans stress.', 'Voiture confortable et conducteur aimable.'];
export interface AvisAffiche { auteur: string; note: number; texte: string; quand: string }
/** Trois avis stables pour un conducteur de démonstration (même conducteur, mêmes avis). */
export function avisDemo(conducteurId: string, nb = 3): AvisAffiche[] {
  const h = hachage(conducteurId);
  return Array.from({ length: nb }, (_, k) => {
    const g = hachage(`${conducteurId}${k}`);
    return { auteur: AUTEURS[(h + k * 5) % AUTEURS.length], note: g % 5 === 0 ? 4 : 5, texte: TEXTES[(g >>> 3) % TEXTES.length], quand: ['il y a 2 jours', 'il y a 1 semaine', 'il y a 3 semaines'][k % 3] };
  });
}
