// Lieux de prise en charge des courses moto / taxi : quartiers, gares, marchés, hôpitaux et repères des villes du réseau.
// Les positions sont des coordonnées locales approximatives en km (x vers l'est, y vers le nord) autour du centre de chaque ville. Données de démonstration.
export type TypeLieu = 'quartier' | 'gare' | 'marché' | 'hôpital' | 'repère';
export interface Lieu { nom: string; ville: string; type: TypeLieu; x: number; y: number; /** Saisi à la main, absent de la liste. */ libre?: boolean }

type Ligne = [nom: string, type: TypeLieu, x: number, y: number];
const de = (ville: string, lignes: Ligne[]): Lieu[] => lignes.map(([nom, type, x, y]) => ({ nom, ville, type, x, y }));
const Q = 'quartier', G = 'gare', M = 'marché', H = 'hôpital', R = 'repère';

const YAOUNDE = de('Yaoundé', [
  ['Bastos', Q, 1.8, 3.2], ['Essos', Q, 3.2, 0.6], ['Nlongkak', Q, 1.2, 2.4], ['Biyem-Assi', Q, -7, 0], ['Mendong', Q, -8.5, -1.5], ['Mvog-Ada', Q, 1.5, -1], ['Mvog-Mbi', Q, 1, -2.6],
  ['Ngoa-Ekélé', Q, -2, 1.8], ['Melen', Q, -2.4, 0.5], ['Obili', Q, -1.5, -0.9], ['Messa', Q, -1.8, -0.8], ['Tsinga', Q, -0.5, 1.6], ['Briqueterie', Q, 0.8, 0.9], ['Elig-Essono', Q, 0.5, 1],
  ['Mfandena', Q, 1.8, 1.8], ['Nkolndongo', Q, 1.8, 1.2], ['Mimboman', Q, 4.6, 1.4], ['Ekounou', Q, 3, -3.8], ['Simbock', Q, -1.5, -3.2], ['Nsimeyong', Q, -3, -4], ['Odza', Q, 6.2, -6],
  ['Emana', Q, -1, 6], ['Etoudi', Q, 0.8, 6.5], ['Ngousso', Q, 4.5, 3.2], ['Mokolo', Q, -1.5, 0.8], ['Santa Barbara', Q, 2.4, 3.8], ['Nkolbisson', Q, -9.5, 2.5], ['Efoulan', Q, -0.4, -5.2],
  ['Gare routière de Mvan', G, 0.6, -3.4], ['Gare routière de Nsam', G, -0.2, -4.8], ['Gare routière de Tongolo', G, -3, 2],
  ['Marché central', M, -0.3, -0.4], ['Marché Mokolo', M, -1.6, 0.9], ['Marché Mfoundi', M, 0.4, -0.3], ['Marché Mvog-Mbi', M, 1, -2.7], ['Marché d’Essos', M, 3.1, 0.8], ['Marché de Mendong', M, -8.3, -1.8], ['Marché de Biyem-Assi', M, -6.8, -0.2], ['Marché d’Etoudi', M, 0.9, 6.3],
  ['Hôpital Central', H, -0.8, -0.2], ['Hôpital Général', H, 3.6, -0.3], ['Hôpital gynéco-obstétrique de Ngousso', H, 4.4, 3.3], ['CHU de Yaoundé', H, -2.1, 1.6], ['Hôpital de la Caisse', H, 1.5, 2.2], ['Clinique de Bastos', H, 1.9, 3.4],
  ['Poste centrale', R, 0, 0], ['Hôtel Hilton', R, 0.2, 0.2], ['Palais des congrès', R, -0.6, 1.3], ['Université de Yaoundé I', R, -2.2, 1.7], ['Carrefour Warda', R, 3, 1.5], ['Aéroport de Nsimalen', R, 6, -14]
]);
const DOUALA = de('Douala', [
  ['Akwa', Q, 0, 0], ['Bonanjo', Q, -0.8, -0.9], ['Deido', Q, 1, 1.4], ['Bonapriso', Q, -1, -2], ['Bali', Q, 0.9, 0], ['New Bell', Q, 2.3, -1.2], ['Bépanda', Q, 4.2, 1.2], ['Makepe', Q, 5.5, 1.3],
  ['Bonamoussadi', Q, 7.5, 3.8], ['Ndokoti', Q, 4.4, -1.6], ['Bassa', Q, 8, -3.2], ['Logpom', Q, 9.5, 4.3], ['Kotto', Q, 6.6, 3], ['Cité des Palmiers', Q, 6.6, -0.7], ['PK8', Q, 9, -0.5], ['Nylon', Q, 3.9, -0.8],
  ['Ndogbong', Q, 5, 0.4], ['Youpwé', Q, 3.2, -3], ['Bonabéri', Q, -4.8, 2], ['Logbessou', Q, 7.5, 6.5], ['Akwa Nord', Q, -0.4, 1.2], ['Bessengué', Q, 1.6, -2.4], ['Bonendale', Q, -6.5, 1],
  ['Gare routière d’Akwa', G, 0.5, 0.1], ['Gare routière de Bonabéri', G, -4.6, 2.2],
  ['Marché Sandaga', M, 0.9, -0.5], ['Marché Mboppi', M, 2.5, 1.6], ['Marché New Bell', M, 2.4, -1.4], ['Marché Deido', M, 1.1, 1.3], ['Marché de Bonamoussadi', M, 7.4, 3.6], ['Marché Congo', M, 3.6, -0.9], ['Marché des fleurs de Makepe', M, 5.4, 1.1],
  ['Hôpital Laquintinie', H, -0.2, -0.5], ['Hôpital Général de Douala', H, 4.8, -1.5], ['Hôpital gynéco-obstétrique de Ndogbong', H, 5, 0.8], ['Clinique Bonanjo', H, -0.7, -1], ['Hôpital de district de Deido', H, 1.2, 1.1],
  ['Port de Douala', R, -2, -1.8], ['Stade de la Réunification', R, 3.9, 1.8], ['Aéroport de Douala', R, 5.6, -2.4], ['Université de Douala', R, 9.5, 5.5], ['Pont du Wouri', R, -2.4, 1.5]
]);
const AUTRES = [
  ...de('Bafoussam', [['Marché A', M, 0, 0], ['Marché B', M, 0.6, 0.4], ['Tamdja', Q, 1.4, -1], ['Djeleng', Q, -1.2, 1], ['Banengo', Q, 1.8, 1.4], ['Kamkop', Q, -1.6, -1.2], ['Hôpital régional de Bafoussam', H, 0.8, 0.9], ['Gare routière de Bafoussam', G, 0.2, -0.5]]),
  ...de('Bamenda', [['Commercial Avenue', Q, 0, 0], ['Up Station', Q, -1.8, 1.4], ['Mankon', Q, 1.6, 0.6], ['Nkwen', Q, 3, 2], ['Mile 4 Nkwen', Q, 2.4, 1.2], ['Food Market', M, 0.4, -0.3], ['Hôpital régional de Bamenda', H, 0.5, 1], ['Gare routière de Ntarikon', G, -1, -1.5]]),
  ...de('Kribi', [['Centre-ville', Q, 0, 0], ['Mboa-Manga', Q, 1.2, -0.8], ['Ngoyè', Q, 2.4, 1], ['Marché de Kribi', M, 0.3, 0.2], ['Port de Kribi', R, -1.2, -0.6], ['Hôpital de district de Kribi', H, 0.6, 0.9], ['Gare de Kribi centre', G, 0.1, -0.2]])
];
export const LIEUX: Lieu[] = [...YAOUNDE, ...DOUALA, ...AUTRES];

/** Position des gares dans le même repère local (clé = identifiant de la gare dans le monde). */
export const GARES_POSITION: Record<string, { ville: string; x: number; y: number }> = {
  mvan: { ville: 'Yaoundé', x: 0.6, y: -3.4 }, nsam: { ville: 'Yaoundé', x: -0.2, y: -4.8 }, tongolo: { ville: 'Yaoundé', x: -3, y: 2 }, akwa: { ville: 'Douala', x: 0.5, y: 0.1 },
  bafoussam: { ville: 'Bafoussam', x: 0.2, y: -0.5 }, ntarikon: { ville: 'Bamenda', x: -1, y: -1.5 }, kribi: { ville: 'Kribi', x: 0.1, y: -0.2 }
};
