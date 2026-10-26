// Le monde de démonstration NexG-TT, déterministe : le « lundi 12 octobre 2026 » des maquettes. Alex T. (ACC-0412, membre du Pass) détient trois droits de voyage actifs
// et en revend un ; le marché compte des reventes, une offre d'agence, un drop membres en direct, des ordres, des intentions d'achat et une soute partagée.
// Tous les montants sont fictifs. Aérolys et Nordelle sont des compagnies fictives.
import { maintenant, instant } from './horloge.ts';
import { MAINTENANT_DEMO } from './constantes.ts';
import { departDe } from '../core/regles.ts';
import type { Aeroport, Agence, BagageDroit, Compagnie, Compte, Droit, Drop, DropAVenir, Ecriture, Etat, Intention, Maillon, Monde, Notification, Ordre, Vol, Audit, Alerte, Cabine, OrigineDroit, StatutDroit, OffreAgence, DemandeBagage } from '../domain/types.ts';

const H = 3_600_000, J = 24 * H;
const NOW = Date.parse(MAINTENANT_DEMO);

export const AEROPORTS: Aeroport[] = [
  { code: 'YUL', ville: 'Montréal', pays: 'Canada', zone: 'Amériques', dureeH: 0, cap: 0 },
  { code: 'CDG', ville: 'Paris', pays: 'France', zone: 'Europe', dureeH: 7, cap: 72 }, { code: 'LIS', ville: 'Lisbonne', pays: 'Portugal', zone: 'Europe', dureeH: 6.5, cap: 82 },
  { code: 'FCO', ville: 'Rome', pays: 'Italie', zone: 'Europe', dureeH: 8.5, cap: 62 }, { code: 'KEF', ville: 'Reykjavik', pays: 'Islande', zone: 'Europe', dureeH: 5.5, cap: 48 },
  { code: 'PUJ', ville: 'Punta Cana', pays: 'République dominicaine', zone: 'Caraïbes', dureeH: 4.8, cap: 128 }, { code: 'HAV', ville: 'La Havane', pays: 'Cuba', zone: 'Caraïbes', dureeH: 4.4, cap: 168 },
  { code: 'BOG', ville: 'Bogotá', pays: 'Colombie', zone: 'Amériques', dureeH: 6.3, cap: 160 }, { code: 'MEX', ville: 'Mexico', pays: 'Mexique', zone: 'Amériques', dureeH: 5.2, cap: 200 },
  { code: 'LAX', ville: 'Los Angeles', pays: 'États-Unis', zone: 'Amériques', dureeH: 5.7, cap: 262 }, { code: 'PPT', ville: 'Papeete', pays: 'Polynésie française', zone: 'Océanie', dureeH: 12, cap: 255 },
  { code: 'NRT', ville: 'Tokyo', pays: 'Japon', zone: 'Asie', dureeH: 13, cap: 335 }
];
export const COMPAGNIES: Compagnie[] = [{ id: 'AE', nom: 'Aérolys', code: 'AE' }, { id: 'NO', nom: 'Nordelle', code: 'NO' }];

/** Générateur pseudo-aléatoire déterministe. */
function lcg(graine: number) { let x = graine >>> 0 || 1; return () => ((x = (Math.imul(x, 1664525) + 1013904223) >>> 0) / 4294967296); }
/** 90 points quotidiens qui se terminent exactement sur `fin`, partant d'environ `fin × depart`. */
export function courbe(fin: number, graine: number, depart = 0.9): number[] {
  const r = lcg(graine), n = 90, pts: number[] = []; let v = fin * depart;
  for (let i = 0; i < n; i++) { const cible = fin * depart + ((fin - fin * depart) * i) / (n - 1); v += (cible - v) * 0.25 + (r() - 0.5) * fin * 0.035; pts.push(Math.round(v)); }
  pts[n - 1] = fin; return pts;
}
const hhmm = (min: number) => `${String(Math.floor(min / 60) % 24).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const jourPlus = (jour: string, n: number) => { const d = new Date(`${jour}T12:00`); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
interface V { id: string; cie: string; no: number; vers: string; jour: string; dep: string; duree: number; escales?: string[]; prix: number; cabine?: Cabine; graine: number; bag?: number }
function vol(v: V): Vol {
  const [h, m] = v.dep.split(':').map(Number), arrMin = h * 60 + m + v.duree - 300 * 0 /* les heures locales des maquettes sont données telles quelles */;
  return { id: v.id, compagnieId: v.cie, numero: `${v.cie} ${v.no}`, de: 'YUL', vers: v.vers, jour: v.jour, heureDepart: v.dep, heureArrivee: '', plusJours: Math.floor(arrMin / 1440), dureeMin: v.duree, escales: v.escales ?? [], cabine: v.cabine ?? 'Économie', prixNeuf: v.prix, courbe: courbe(v.prix, v.graine), prixBagageCompagnie: v.bag ?? 150 };
}
// Heures d'arrivée locales des maquettes (décalages horaires inclus), fixées à la main pour les vols qui y figurent ; calculées sinon (départ + durée + décalage de la destination).
const DECALAGE: Record<string, number> = { CDG: 360, LIS: 300, FCO: 360, KEF: 240, PUJ: 0, HAV: 0, BOG: -60, MEX: -60, LAX: -180, PPT: -360, NRT: 780 };
const ARRIVEES: Record<string, string> = { 'v-ae812': '07:10', 'v-ae816': '07:10', 'v-no220': '09:55', 'v-no224': '13:55', 'v-no905': '12:15' };

const VOLS_BRUT: V[] = [
  // Les vols des maquettes
  { id: 'v-ae812', cie: 'AE', no: 812, vers: 'CDG', jour: '2026-12-14', dep: '18:05', duree: 425, prix: 2000, graine: 812, bag: 150 },
  { id: 'v-ae816', cie: 'AE', no: 816, vers: 'CDG', jour: '2026-12-18', dep: '18:05', duree: 425, prix: 2050, graine: 816 },
  { id: 'v-no220', cie: 'NO', no: 220, vers: 'CDG', jour: '2026-12-18', dep: '16:40', duree: 675, escales: ['KEF'], prix: 2130, graine: 220 },
  { id: 'v-no224', cie: 'NO', no: 224, vers: 'CDG', jour: '2026-12-18', dep: '21:40', duree: 615, escales: ['KEF'], prix: 1890, graine: 224 },
  { id: 'v-no905', cie: 'NO', no: 905, vers: 'PUJ', jour: '2027-02-21', dep: '07:30', duree: 285, prix: 940, graine: 905 },
  { id: 'v-ae410', cie: 'AE', no: 410, vers: 'PPT', jour: '2027-05-09', dep: '09:10', duree: 870, escales: ['LAX'], prix: 1790, graine: 410 },
  { id: 'v-no156', cie: 'NO', no: 156, vers: 'HAV', jour: '2027-01-30', dep: '08:15', duree: 265, prix: 650, graine: 156 },
  // Cette semaine (« Ces billets cherchent un voyageur »)
  { id: 'v-ae830', cie: 'AE', no: 830, vers: 'CDG', jour: '2026-10-14', dep: '19:20', duree: 425, prix: 1210, graine: 830 }, { id: 'v-no611', cie: 'NO', no: 611, vers: 'LIS', jour: '2026-10-15', dep: '21:05', duree: 390, prix: 840, graine: 611 },
  { id: 'v-no902', cie: 'NO', no: 902, vers: 'PUJ', jour: '2026-10-16', dep: '06:50', duree: 285, prix: 690, graine: 902 }, { id: 'v-ae455', cie: 'AE', no: 455, vers: 'MEX', jour: '2026-10-17', dep: '11:30', duree: 312, prix: 760, graine: 455 },
  { id: 'v-ae071', cie: 'AE', no: 71, vers: 'NRT', jour: '2026-10-18', dep: '13:15', duree: 780, prix: 1980, graine: 71 }, { id: 'v-no150', cie: 'NO', no: 150, vers: 'HAV', jour: '2026-10-17', dep: '07:45', duree: 265, prix: 720, graine: 150 },
  // Autres départs (radar, recherche, indices)
  { id: 'v-ae820', cie: 'AE', no: 820, vers: 'CDG', jour: '2026-11-20', dep: '18:05', duree: 425, prix: 1340, graine: 820 }, { id: 'v-ae822', cie: 'AE', no: 822, vers: 'CDG', jour: '2027-01-12', dep: '18:05', duree: 425, prix: 1080, graine: 822 },
  { id: 'v-no618', cie: 'NO', no: 618, vers: 'LIS', jour: '2026-12-19', dep: '20:40', duree: 390, prix: 1250, graine: 618 }, { id: 'v-no620', cie: 'NO', no: 620, vers: 'LIS', jour: '2027-03-06', dep: '20:40', duree: 390, prix: 790, graine: 620 },
  { id: 'v-ae561', cie: 'AE', no: 561, vers: 'FCO', jour: '2026-12-21', dep: '17:30', duree: 500, prix: 1560, graine: 561 }, { id: 'v-ae563', cie: 'AE', no: 563, vers: 'FCO', jour: '2027-04-10', dep: '17:30', duree: 500, prix: 980, graine: 563 },
  { id: 'v-no330', cie: 'NO', no: 330, vers: 'KEF', jour: '2026-11-27', dep: '19:50', duree: 330, prix: 640, graine: 330 }, { id: 'v-no332', cie: 'NO', no: 332, vers: 'KEF', jour: '2027-02-05', dep: '19:50', duree: 330, prix: 590, graine: 332 },
  { id: 'v-no906', cie: 'NO', no: 906, vers: 'PUJ', jour: '2026-12-26', dep: '07:30', duree: 285, prix: 1210, graine: 906 }, { id: 'v-no908', cie: 'NO', no: 908, vers: 'PUJ', jour: '2027-03-14', dep: '07:30', duree: 285, prix: 910, graine: 908 },
  { id: 'v-no152', cie: 'NO', no: 152, vers: 'HAV', jour: '2026-12-22', dep: '08:15', duree: 265, prix: 780, graine: 152 }, { id: 'v-ae200', cie: 'AE', no: 200, vers: 'BOG', jour: '2026-12-02', dep: '23:10', duree: 378, prix: 1130, graine: 200 },
  { id: 'v-ae202', cie: 'AE', no: 202, vers: 'BOG', jour: '2027-02-18', dep: '23:10', duree: 378, prix: 960, graine: 202 }, { id: 'v-ae456', cie: 'AE', no: 456, vers: 'MEX', jour: '2026-12-12', dep: '11:30', duree: 312, prix: 980, graine: 456 },
  { id: 'v-ae072', cie: 'AE', no: 72, vers: 'NRT', jour: '2027-03-22', dep: '13:15', duree: 780, prix: 1520, graine: 72 }, { id: 'v-ae073', cie: 'AE', no: 73, vers: 'NRT', jour: '2026-12-29', dep: '13:15', duree: 780, prix: 2210, graine: 73, cabine: 'Économie plus' },
  { id: 'v-ae412', cie: 'AE', no: 412, vers: 'PPT', jour: '2027-07-04', dep: '09:10', duree: 870, escales: ['LAX'], prix: 2090, graine: 412 }
];
export const VOLS: Vol[] = VOLS_BRUT.map((b) => {
  const v = vol(b);
  if (ARRIVEES[v.id]) { v.heureArrivee = ARRIVEES[v.id]; v.plusJours = v.id === 'v-no905' ? 0 : 1; }
  else { const [h, m] = b.dep.split(':').map(Number), total = h * 60 + m + b.duree + (DECALAGE[b.vers] ?? 0) - 0; v.plusJours = Math.floor(total / 1440); v.heureArrivee = hhmm(((total % 1440) + 1440) % 1440); }
  return v;
});
const volDe = (id: string) => VOLS.find((v) => v.id === id)!;

export const AGENCES: Agence[] = [
  { id: 'horizon', nom: 'Agence Horizon', ville: 'Montréal', permisVerifie: true, depuis: Date.parse('2024-03-01'), description: 'Agence de voyages montréalaise (exemple fictif). Billets, forfaits vol et hôtel.', offresForfait: 'Forfaits vol + hôtel possibles' },
  { id: 'cap-nord', nom: 'Cap Nord Voyages', ville: 'Québec', permisVerifie: true, depuis: Date.parse('2025-01-15'), description: 'Spécialiste des destinations nordiques (exemple fictif).' }
];
export const OFFRES_AGENCE: OffreAgence[] = [
  { id: 'oa-1', agenceId: 'horizon', volId: 'v-no220', prix: 1690, note: 'Offre d’agence partenaire' }, { id: 'oa-2', agenceId: 'horizon', volId: 'v-no330', prix: 520 }, { id: 'oa-3', agenceId: 'cap-nord', volId: 'v-no332', prix: 480 }
];

const ALEX = 'ACC-0412';
const compte = (id: string, prenom: string, nom: string, extra: Partial<Compte> = {}): Compte => ({
  id, role: 'voyageur', prenom, nom, email: `${prenom.toLowerCase().replace(/[^a-z]/g, '')}.${nom.toLowerCase().replace(/[^a-z]/g, '')}@exemple.test`, tel: '514 555 0100', ville: 'Montréal', aeroport: 'YUL', langue: 'fr', region: 'Canada · CAD',
  pass: { actif: false }, passkey: false, proches: [], solde: 0, enAttente: 0, prefsNotif: 'essentiel', partage: { offres: true, analyses: false, partenaires: false }, creeLe: Date.parse('2025-11-02'), actif: true, ...extra
});
export const COMPTES: Compte[] = [
  compte(ALEX, 'Alex', 'Tremblay', { email: 'alex.tremblay@exemple.test', tel: '514 555 0142', pass: { actif: true, depuis: Date.parse('2026-03-12') }, identiteVerifiee: Date.parse('2026-08-28'), passkey: true, carte4: '4821', proches: ['ACC-0187', 'ACC-0233'], solde: 1152, creeLe: Date.parse('2025-11-02') }),
  compte('ACC-0187', 'Camille', 'Tremblay', { tel: '514 555 0187', creeLe: Date.parse('2026-01-10') }), compte('ACC-0233', 'Paul', 'Roy', { tel: '438 555 0233', ville: 'Québec', pass: { actif: true, depuis: Date.parse('2026-06-01') }, creeLe: Date.parse('2026-04-22') }),
  compte('ACC-0301', 'Sophie', 'Lavoie', { tel: '514 555 0301', creeLe: Date.parse('2026-02-14') }), compte('ACC-0319', 'Nadia', 'Benali', { tel: '450 555 0319', creeLe: Date.parse('2026-05-30') }),
  compte('ACC-0356', 'Louis', 'Gagnon', { tel: '819 555 0356', ville: 'Gatineau', creeLe: Date.parse('2026-07-08') }), compte('ACC-0402', 'Inès', 'Moreau', { tel: '514 555 0402', pass: { actif: true, depuis: Date.parse('2026-09-02') }, creeLe: Date.parse('2026-08-25') }),
  compte('adm-01', 'Maya', 'Lefebvre', { role: 'admin', email: 'maya.lefebvre@nexg-tt.test', passkey: true, creeLe: Date.parse('2025-06-01') })
];

let ni = 0;
const mid = () => `m-${(++ni).toString(36)}`;
const maillon = (type: Maillon['type'], quand: number, de: string | null, vers: string, prix: number, commission?: number): Maillon => ({ id: mid(), quand, type, de, vers, prix, ...(commission !== undefined ? { commission } : {}) });
let nd = 0;
function droit(id: string, ref: string, volId: string, det: string, statut: StatutDroit, paye: number, origine: OrigineDroit, chaine: Maillon[], extra: Partial<Droit> = {}): Droit {
  void ++nd; return { id, ref, volId, detenteurId: det, statut, prixPaye: paye, origine, chaine, bagagesInclus: 2, ...extra };
}
const d = (iso: string) => Date.parse(iso);
export const DROITS: Droit[] = [
  droit('d-812', 'NXG-7Q2M', 'v-ae812', ALEX, 'detenu', 1000, 'neuf', [maillon('achat_neuf', d('2026-01-12T10:14'), 'nexgtt', ALEX, 1000)]),
  droit('d-puj', 'NXG-4PUJ', 'v-no905', ALEX, 'detenu', 200, 'drop', [maillon('drop', d('2026-09-03T12:00'), 'nexgtt', ALEX, 200)], { dropId: 'drop-127' }),
  droit('d-ppt', 'NXG-9PPT', 'v-ae410', ALEX, 'detenu', 1850, 'revente', [maillon('achat_neuf', d('2026-02-02T09:00'), 'nexgtt', 'ACC-0301', 1700), maillon('revente', d('2026-06-18T15:30'), 'ACC-0301', 'ACC-0356', 1800, 225), maillon('revente', d('2026-08-03T11:20'), 'ACC-0356', ALEX, 1850, 231.25)]),
  droit('d-hav', 'NXG-2HV6', 'v-no156', ALEX, 'en_vente', 480, 'revente', [maillon('achat_neuf', d('2026-03-20T09:00'), 'nexgtt', 'ACC-0319', 520), maillon('revente', d('2026-07-14T10:00'), 'ACC-0319', ALEX, 480, 60)], { annonce: { prix: 620, depuis: d('2026-10-05T10:00') } }),
  droit('d-8wc2', 'NXG-8WC2', 'v-ae812', 'ACC-0187', 'nomme', 1100, 'neuf', [maillon('achat_neuf', d('2026-02-14T09:00'), 'nexgtt', 'ACC-0187', 1100), maillon('nommage', d('2026-10-02T09:00'), 'ACC-0187', 'ACC-0187', 0)], { voyageur: { prenom: 'Camille', nom: 'Tremblay', pourSoi: true, compteId: 'ACC-0187' }, siege: '24A' }),
  // Reventes en cours sur les vols des maquettes
  droit('d-r816', 'NXG-3K9X', 'v-ae816', 'ACC-0301', 'en_vente', 1150, 'neuf', [maillon('achat_neuf', d('2026-04-02T09:00'), 'nexgtt', 'ACC-0301', 1150)], { annonce: { prix: 1500, depuis: d('2026-10-08T14:00') } }),
  droit('d-r816b', 'NXG-5M2T', 'v-ae816', 'ACC-0356', 'en_vente', 1300, 'neuf', [maillon('achat_neuf', d('2026-05-02T09:00'), 'nexgtt', 'ACC-0356', 1300)], { annonce: { prix: 1520, depuis: d('2026-10-09T09:00') } }),
  droit('d-r816c', 'NXG-6R4N', 'v-ae816', 'ACC-0319', 'en_vente', 1400, 'neuf', [maillon('achat_neuf', d('2026-05-20T09:00'), 'nexgtt', 'ACC-0319', 1400)], { annonce: { prix: 1610, depuis: d('2026-10-09T18:00') } }),
  droit('d-r816d', 'NXG-7T8W', 'v-ae816', 'ACC-0402', 'en_vente', 1500, 'neuf', [maillon('achat_neuf', d('2026-06-02T09:00'), 'nexgtt', 'ACC-0402', 1500)], { annonce: { prix: 1700, depuis: d('2026-10-10T11:00') } }),
  droit('d-r224', 'NXG-2D6Q', 'v-no224', 'ACC-0233', 'en_vente', 1200, 'neuf', [maillon('achat_neuf', d('2026-03-02T09:00'), 'nexgtt', 'ACC-0233', 1200)], { annonce: { prix: 1380, depuis: d('2026-10-07T10:00') } }),
  droit('d-r830', 'NXG-8F3H', 'v-ae830', 'ACC-0356', 'en_vente', 980, 'neuf', [maillon('achat_neuf', d('2026-07-02T09:00'), 'nexgtt', 'ACC-0356', 980)], { annonce: { prix: 870, depuis: d('2026-10-09T10:00') } }),
  droit('d-r611', 'NXG-3LS6', 'v-no611', 'ACC-0301', 'en_vente', 700, 'neuf', [maillon('achat_neuf', d('2026-07-12T09:00'), 'nexgtt', 'ACC-0301', 700)], { annonce: { prix: 590, depuis: d('2026-10-10T10:00') } }),
  droit('d-r902', 'NXG-9PU2', 'v-no902', 'ACC-0319', 'en_vente', 600, 'neuf', [maillon('achat_neuf', d('2026-08-02T09:00'), 'nexgtt', 'ACC-0319', 600)], { annonce: { prix: 510, depuis: d('2026-10-10T16:00') } }),
  droit('d-r455', 'NXG-4MX5', 'v-ae455', 'ACC-0402', 'en_vente', 650, 'neuf', [maillon('achat_neuf', d('2026-08-12T09:00'), 'nexgtt', 'ACC-0402', 650)], { annonce: { prix: 540, depuis: d('2026-10-11T08:00') } }),
  droit('d-r071', 'NXG-6NR1', 'v-ae071', 'ACC-0233', 'en_vente', 1700, 'neuf', [maillon('achat_neuf', d('2026-06-12T09:00'), 'nexgtt', 'ACC-0233', 1700)], { annonce: { prix: 1490, depuis: d('2026-10-11T09:00') } }),
  droit('d-r150', 'NXG-1HV7', 'v-no150', 'ACC-0356', 'en_vente', 560, 'neuf', [maillon('achat_neuf', d('2026-08-22T09:00'), 'nexgtt', 'ACC-0356', 560)], { annonce: { prix: 470, depuis: d('2026-10-11T12:00') } }),
  droit('d-r820', 'NXG-7CD2', 'v-ae820', 'ACC-0301', 'en_vente', 1100, 'neuf', [maillon('achat_neuf', d('2026-08-30T09:00'), 'nexgtt', 'ACC-0301', 1100)], { annonce: { prix: 1190, depuis: d('2026-10-06T09:00') } }),
  droit('d-gele', 'NXG-0GEL', 'v-ae818x', 'ACC-0402', 'gele', 900, 'neuf', [], { gelRaison: 'Vérification d’identité en cours (démo).' })
].filter((x) => VOLS.some((v) => v.id === x.volId) || x.id === 'd-gele').map((x) => (x.id === 'd-gele' ? { ...x, volId: 'v-ae822', chaine: [maillon('achat_neuf', d('2026-09-12T09:00'), 'nexgtt', 'ACC-0402', 900), maillon('gel', d('2026-10-10T15:00'), 'adm-01', 'ACC-0402', 0)] } : x));

export const DROP_EN_DIRECT: Drop = { id: 'drop-128', n: 128, volId: 'v-no905', prixMembre: 200, prixEquivalent: 1000, places: 6, restantes: 3, ouvre: NOW - 3 * H, fin: NOW + 4 * 60_000 + 31_000, servis: [] };
export const DROPS_A_VENIR: DropAVenir[] = [
  { id: 'dv-1', ouvre: d('2026-10-14T12:00'), zone: 'Europe', volId: 'v-no618', alerteIds: [] }, { id: 'dv-2', ouvre: d('2026-10-17T09:00'), zone: 'Caraïbes', volId: 'v-no152', alerteIds: [] }, { id: 'dv-3', ouvre: d('2026-10-21T12:00'), zone: 'Asie', volId: 'v-ae072', alerteIds: [] }
];
const ORDRES: Ordre[] = [{ id: 'o-1', compteId: ALEX, volId: 'v-ae816', limite: 1450, validite: 'semaine', statut: 'actif', creeLe: d('2026-10-09T09:30') }];
const INTENTIONS: Intention[] = [
  { id: 'INT-4F7K', compteId: ALEX, de: 'YUL', vers: 'CDG', volId: 'v-ae816', budget: 1300, fondsReserves: 1300, creeLe: d('2026-09-12T10:00'), statut: 'publiee', propositions: [
    { id: 'p-1', intentionId: 'INT-4F7K', vendeurId: 'ACC-0301', droitId: 'd-r816', prix: 1500, quand: NOW - 10 * H, statut: 'recue' }, { id: 'p-2', intentionId: 'INT-4F7K', vendeurId: 'ACC-0233', droitId: 'd-r224', prix: 1380, quand: NOW - 5 * H, statut: 'recue' }, { id: 'p-3', intentionId: 'INT-4F7K', vendeurId: 'ACC-0356', droitId: 'd-r816b', prix: 1300, quand: NOW - 2 * H, statut: 'recue' }
  ] },
  { id: 'INT-2B9X', compteId: ALEX, de: 'YUL', vers: 'HAV', volId: 'v-no156', budget: 350, fondsReserves: 0, creeLe: d('2026-09-20T10:00'), statut: 'accord', propositions: [] }
];
export const BAGAGES: BagageDroit[] = [
  { id: 'b-alex', volId: 'v-ae812', detenteurId: ALEX, kg: 23, prix: 100, statut: 'en_vente' },
  { id: 'b-2', volId: 'v-ae812', detenteurId: 'ACC-0187', kg: 23, prix: 90, statut: 'en_vente' }, { id: 'b-3', volId: 'v-ae812', detenteurId: 'ACC-0233', kg: 23, prix: 110, statut: 'en_vente' },
  { id: 'b-4', volId: 'v-ae812', detenteurId: 'ACC-0301', kg: 23, prix: 95, statut: 'en_vente' }, { id: 'b-5', volId: 'v-ae812', detenteurId: 'ACC-0319', kg: 23, prix: 120, statut: 'en_vente' },
  { id: 'b-6', volId: 'v-ae812', detenteurId: 'ACC-0356', kg: 23, prix: 100, statut: 'en_vente' }, { id: 'b-7', volId: 'v-ae812', detenteurId: 'ACC-0402', kg: 23, prix: 130, statut: 'en_vente' }
];
const DEMANDES_BAGAGE: DemandeBagage[] = [];
const ECRITURES: Ecriture[] = [
  { id: 'e-1', compteId: ALEX, quand: d('2026-08-14T16:20'), type: 'revente', libelle: 'Revente YUL → LIS', sous: 'Vol NO 610 · billet vendu', montant: 1280, solde: 1280 },
  { id: 'e-2', compteId: ALEX, quand: d('2026-08-14T16:20'), type: 'commission', libelle: 'Commission de revente · membre Pass', sous: 'Taux hypothèse 10 %', montant: -128, solde: 1152, hypothese: true }
];
const NOTIFICATIONS: Notification[] = [
  { id: 'n-1', compteId: ALEX, quand: NOW - 2 * H, type: 'bagage', titre: 'Votre 2e bagage est inutilisé', sous: 'D’autres passagers du vol 812 en cherchent.', lu: false, lien: '/bagages', essentielle: false },
  { id: 'n-2', compteId: ALEX, quand: NOW - 26 * H, type: 'prix', titre: 'YUL → CDG : le prix équivalent monte', sous: 'Votre droit du vol 812 vaut +4 % depuis hier.', lu: false, lien: '/droit/d-812', essentielle: false },
  { id: 'n-3', compteId: ALEX, quand: NOW - 4 * J, type: 'echeance', titre: 'Nommer le voyageur avant le 13 déc.', sous: 'YUL → CDG · Aérolys 812', lu: true, lien: '/nommer/d-812', essentielle: true },
  { id: 'n-4', compteId: ALEX, quand: NOW - 9 * J, type: 'drop', titre: 'Drop n° 127 : votre place est confirmée', sous: 'YUL → PUJ · 200 $', lu: true, lien: '/droit/d-puj', essentielle: true }
];
const ALERTES: Alerte[] = [{ id: 'al-1', compteId: ALEX, de: 'YUL', vers: 'Partout', prixMax: 600, actif: true, creeLe: d('2026-09-01T10:00') }];
const AUDIT: Audit[] = [
  { id: 'a-1', quand: d('2026-10-10T15:00'), acteur: 'adm-01', action: 'Gel du droit', cible: 'NXG-0GEL', detail: 'Vérification d’identité en cours (démo).', gravite: 'attention' },
  { id: 'a-2', quand: d('2026-10-12T02:00'), acteur: 'système', action: 'Rapprochement quotidien', cible: 'Registre', detail: 'Aucun écart.', gravite: 'info' }
];

export function monde(): Monde {
  void instant; void departDe;
  const clone = <T,>(x: T): T => structuredClone(x);
  return clone({ aeroports: AEROPORTS, compagnies: COMPAGNIES, vols: VOLS, droits: DROITS, offresAgence: OFFRES_AGENCE, agences: AGENCES, drops: [DROP_EN_DIRECT], dropsAVenir: DROPS_A_VENIR, ordres: ORDRES, intentions: INTENTIONS, bagages: BAGAGES, demandesBagage: DEMANDES_BAGAGE, ecritures: ECRITURES, comptes: COMPTES, notifications: NOTIFICATIONS, transferts: [], audit: AUDIT, alertes: ALERTES });
}
export function etatInitial(): Etat {
  return { version: 1, monde: monde(), session: { compteId: null, langue: 'fr', face: 'voyage', inscription: { etape: 1 }, vuTuto: false, derniereActivite: maintenant() }, tranches: {} };
}
export { volDe };
