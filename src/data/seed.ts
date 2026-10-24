// Monde de démonstration d'AfriMove : 5 compagnies, 4 villes, ~30 départs par jour sur 15 jours, une équipe, une voyageuse (Aïcha Ndiba).
// Tout est déterministe (aucun hasard) pour que les tests et les maquettes se recoupent.
import { ajouterJours, jourDe, type Jour } from '../core/dates.ts';
import { codeBillet, sceller } from '../core/sceau.ts';
import { planSieges } from '../core/sieges.ts';
import { aujourdhui, maintenant } from './horloge.ts';
import type { Billet, Bus, Caisse, Colis, Compagnie, Depart, Etat, Gare, Ligne, Monde, OffreCovoit, Paiement, Personne } from '../domain/types.ts';

export const COMPAGNIES: Compagnie[] = [
  { id: 'BX', nom: 'Bêta Express', abrev: 'BX', couleur: '#3DE0FF' }, { id: 'AV', nom: 'Alpha VIP', abrev: 'AV', couleur: '#B3A8FF' },
  { id: 'FX', nom: 'Finex', abrev: 'FX', couleur: '#FFC24B' }, { id: 'TR', nom: 'Touristique', abrev: 'TR', couleur: '#7CF0A6' }, { id: 'GE', nom: 'Général Express', abrev: 'GE', couleur: '#FF9BEA' }
];
export const GARES: Gare[] = [
  { id: 'mvan', ville: 'Yaoundé', nom: 'Mvan' }, { id: 'nsam', ville: 'Yaoundé', nom: 'Nsam' }, { id: 'tongolo', ville: 'Yaoundé', nom: 'Tongolo' },
  { id: 'akwa', ville: 'Douala', nom: 'Akwa' }, { id: 'bafoussam', ville: 'Bafoussam', nom: 'Bafoussam' }, { id: 'ntarikon', ville: 'Bamenda', nom: 'Ntarikon' }, { id: 'kribi', ville: 'Kribi', nom: 'Kribi centre' }
];
/** Modèle des départs Yaoundé → Douala d'un jour (heure, compagnie, classe, gare, prix, durée en min, places libres au départ de la démo). */
const MODELE: [string, string, 'Classique' | 'VIP', string, number, number, number][] = [
  ['00:30', 'GE', 'Classique', 'mvan', 5000, 250, 30], ['06:00', 'AV', 'VIP', 'nsam', 8000, 195, 4], ['06:15', 'FX', 'Classique', 'mvan', 6000, 225, 22],
  ['07:00', 'BX', 'Classique', 'mvan', 7000, 210, 14], ['08:00', 'BX', 'VIP', 'mvan', 7500, 195, 9], ['08:00', 'AV', 'VIP', 'nsam', 8000, 190, 3],
  ['09:00', 'BX', 'Classique', 'mvan', 6000, 210, 35], ['09:30', 'AV', 'VIP', 'nsam', 8000, 190, 20], ['10:30', 'TR', 'Classique', 'tongolo', 6500, 220, 26],
  ['12:00', 'GE', 'Classique', 'mvan', 5500, 240, 38], ['13:30', 'AV', 'VIP', 'nsam', 8000, 190, 24], ['16:00', 'FX', 'Classique', 'mvan', 6000, 225, 31],
  ['19:00', 'BX', 'VIP', 'mvan', 7500, 195, 12], ['22:30', 'GE', 'Classique', 'mvan', 5000, 250, 27]
];
const AUTRES: [string, string, string, string, 'Classique' | 'VIP', string[], number, number][] = [
  ['Yaoundé', 'Bafoussam', 'mvan', 'bafoussam', 'Classique', ['07:30', '13:00'], 5000, 240], ['Yaoundé', 'Bamenda', 'mvan', 'ntarikon', 'Classique', ['06:45', '18:00'], 7000, 420],
  ['Douala', 'Kribi', 'akwa', 'kribi', 'Classique', ['08:30', '15:30'], 6000, 180]
];
const CAP = { Classique: 50, VIP: 30 } as const;

function construireFlotte() {
  const lignes: Ligne[] = [], bus: Bus[] = [];
  const busDe = (compagnieId: string, classe: 'Classique' | 'VIP', n: number) => { const id = `bus-${compagnieId}-${classe[0]}${n}`; if (!bus.some((b) => b.id === id)) bus.push({ id, immat: `${compagnieId}-${classe === 'VIP' ? '7' : '3'}${n}${n}1-CE`, compagnieId, classe, capacite: CAP[classe] }); return id; };
  const clefs = new Map<string, Ligne>();
  for (const [h, co, classe, gare, prix, dm] of MODELE) for (const sens of ['aller', 'retour'] as const) {
    const de = sens === 'aller' ? 'Yaoundé' : 'Douala', vers = sens === 'aller' ? 'Douala' : 'Yaoundé', gDe = sens === 'aller' ? gare : 'akwa', gVers = sens === 'aller' ? 'akwa' : gare;
    const k = `${co}-${classe}-${gare}-${sens}`; let l = clefs.get(k);
    if (!l) { l = { id: `l-${k}`, de, vers, gareDe: gDe, gareVers: gVers, compagnieId: co, classe, prix, dureeMin: dm, actif: true, horaires: [] }; clefs.set(k, l); lignes.push(l); }
    l.horaires.push(h);
  }
  for (const [de, vers, gDe, gVers, classe, hs, prix, dm] of AUTRES) {
    lignes.push({ id: `l-BX-${vers.toLowerCase()}`, de, vers, gareDe: gDe, gareVers: gVers, compagnieId: 'BX', classe, prix, dureeMin: dm, actif: true, horaires: hs });
    lignes.push({ id: `l-BX-${de.toLowerCase()}-${vers.toLowerCase()}-r`, de: vers, vers: de, gareDe: gVers, gareVers: gDe, compagnieId: 'BX', classe, prix, dureeMin: dm, actif: true, horaires: hs });
  }
  for (const l of lignes) l.horaires.forEach((_, i) => busDe(l.compagnieId, l.classe, 1 + (i % 2)));
  return { lignes, bus, busDe };
}

/** Sièges déjà pris par d'autres voyageurs : `n` sièges répartis de façon déterministe. */
function prisAilleurs(classe: 'Classique' | 'VIP', capacite: number, libres: number, graine: number): string[] {
  const plan = planSieges(classe, capacite), n = Math.max(0, capacite - libres), pris: string[] = [];
  for (let i = 0; pris.length < n && i < plan.length * 3; i++) { const id = plan[(graine * 7 + i * 11 + i * i) % plan.length].id; if (!pris.includes(id)) pris.push(id); }
  for (const s of plan) { if (pris.length >= n) break; if (!pris.includes(s.id)) pris.push(s.id); }
  return pris;
}

const P = (id: string, prenom: string, nom: string, tel: string, role: Personne['role'], extra: Partial<Personne> = {}): Personne => ({ id, prenom, nom, tel, role, actif: true, ...extra });
export const PERSONNES: Personne[] = [
  P('p-aicha', 'Aïcha', 'Ndiba', '691221008', 'voyageur', { ville: 'Yaoundé', langue: 'fr', points: 1480, prochesIds: ['p-maman', 'p-paul'], passkey: true, visage: true }),
  P('p-maman', 'Marie', 'Ndiba', '677000111', 'voyageur', { ville: 'Douala' }), P('p-paul', 'Paul', 'Ndiba', '699000222', 'voyageur', { ville: 'Bafoussam' }),
  P('p-fatou', 'Fatou', 'Mbarga', '670000101', 'guichet', { gareId: 'mvan', compagnieId: 'BX', pin: '4821' }), P('p-joseph', 'Joseph', 'Kamga', '670000102', 'guichet', { gareId: 'mvan', compagnieId: 'BX', pin: '2468' }),
  P('p-ibrahim', 'Ibrahim', 'Sali', '670000103', 'quai', { gareId: 'mvan', compagnieId: 'BX', pin: '1122' }), P('p-emile', 'Émile', 'Fotso', '670000104', 'chauffeur', { gareId: 'mvan', compagnieId: 'BX', pin: '3344' }),
  P('p-youssouf', 'Youssouf', 'Bello', '670000105', 'convoyeur', { gareId: 'mvan', compagnieId: 'BX', pin: '5566', commission: 5 }), P('p-clarisse', 'Clarisse', 'Eto', '670000106', 'controleur', { gareId: 'mvan', compagnieId: 'BX', pin: '7788' }),
  P('p-abdou', 'Abdou', 'Tchoua', '670000107', 'superviseur', { gareId: 'mvan', compagnieId: 'BX', pin: '1357', visage: true }), P('p-mireille', 'Mireille', 'Ngo', '670000108', 'superviseur', { gareId: 'akwa', compagnieId: 'BX', pin: '2580' }),
  P('p-pascal', 'Pascal', 'Mbouda', '670000109', 'superviseur', { gareId: 'bafoussam', compagnieId: 'BX', pin: '9876' }), P('p-luther', 'Luther', 'Kepseu', '670000110', 'patron', { compagnieId: 'BX', pin: '0001', visage: true }),
  P('p-nadege', 'Nadège', 'Owona', '670000111', 'comptable', { compagnieId: 'BX', pin: '0002' }), P('p-mado', 'Mado', 'Essomba', '670000112', 'relais', { zone: 'Douala · Bonabéri', note: 4.8, pin: '0003' }),
  P('p-samuel', 'Samuel', 'Njoya', '670000113', 'livreur', { zone: 'Douala', vehicule: 'Moto Haojue', note: 4.7, pin: '0004' }), P('p-brigitte', 'Brigitte', 'Kouam', '670000114', 'vendeur', { zone: 'marché Mokolo', commission: 5, compagnieId: 'BX', pin: '0005' }),
  P('p-moussa', 'Moussa', 'Kaba', '670000115', 'conducteur', { vehicule: 'Corolla', note: 4.9, pin: '0006' }), P('p-aminata', 'Aminata', 'Diallo', '670000116', 'conducteur', { vehicule: 'Picanto', note: 4.8 }),
  P('p-jeanpaul', 'Jean-Paul', 'Nana', '670000117', 'conducteur', { vehicule: 'Hilux', note: 4.6 }), P('p-sandrine', 'Sandrine', 'Eyenga', '670000118', 'conducteur', { vehicule: 'Rav4', note: 4.9 }), P('p-boris', 'Boris', 'Tagne', '670000119', 'conducteur', { vehicule: 'Logan', note: 4.5 })
];

export function monde(jourRef: Jour = aujourdhui()): Monde {
  const { lignes, bus, busDe } = construireFlotte();
  const departs: Depart[] = [];
  const nowMin = new Date(maintenant()).getHours() * 60 + new Date(maintenant()).getMinutes();
  let g = 0;
  for (let j = -1; j <= 13; j++) {
    const jour = ajouterJours(jourRef, j);
    for (const l of lignes) l.horaires.forEach((h, i) => {
      g++;
      const modele = MODELE.find((m) => m[0] === h && m[1] === l.compagnieId && m[2] === l.classe), libres = modele ? modele[6] : 20 + (g % 25), cap = CAP[l.classe];
      const [hh, mm] = h.split('.')[0].split(':').map(Number), min = hh * 60 + mm;
      const statut = j < 0 ? 'arrive' : j === 0 ? (nowMin >= min + l.dureeMin ? 'arrive' : nowMin >= min ? 'parti' : nowMin >= min - 30 ? 'embarquement' : 'prevu') : 'prevu';
      departs.push({ id: `d-${jour}-${l.id.slice(2)}-${h.replace(':', '')}`, ligneId: l.id, jour, heure: h, busId: busDe(l.compagnieId, l.classe, 1 + (i % 2)), capacite: cap, prix: modele ? modele[4] : l.prix, statut,
        retardMin: 0, avancement: statut === 'arrive' ? 1 : statut === 'parti' ? Math.min(1, (nowMin - min) / l.dureeMin) : 0, prisAilleurs: j < 0 ? [] : prisAilleurs(l.classe, cap, Math.min(libres, cap), g) });
    });
  }
  const demain = ajouterJours(jourRef, 1), dAicha = departs.find((d) => d.jour === demain && d.heure === '08:00' && d.ligneId.includes('BX-VIP-mvan-aller'))!;
  dAicha.prisAilleurs = dAicha.prisAilleurs.filter((s) => s !== '3C').slice(0, dAicha.capacite - 9);
  const paiement: Paiement = { id: 'pay-aicha1', ts: maintenant() - 3_600_000, montant: dAicha.prix, moyen: 'momo', statut: 'ok', ref: 'MOMO-81736', canal: 'app', payeurId: 'p-aicha', pour: { type: 'billet', ids: ['b-aicha1'] } };
  const champs = { code: 'AM7F3K22', departId: dAicha.id, siege: '3C', nom: 'Aïcha Ndiba' };
  const billet: Billet = { id: 'b-aicha1', code: champs.code, departId: dAicha.id, siege: '3C', passager: { nom: 'Aïcha Ndiba', tel: '691221008' }, prix: dAicha.prix, canal: 'app', acheteurId: 'p-aicha', paiementId: paiement.id, statut: 'valide', creeLe: paiement.ts, sceau: sceller(champs) };
  dAicha.prisAilleurs = dAicha.prisAilleurs.filter((s) => s !== '3C');
  const caisse: Caisse = { id: 'c-fatou', agentId: 'p-fatou', gareId: 'mvan', jour: jourRef, ouvertA: maintenant() - 6 * 3_600_000, fond: 20_000, statut: 'ouverte' };
  const colis: Colis = { id: 'col-1', code: 'AM-C-9Q2', expediteurId: 'p-aicha', destinataire: { nom: 'Marie Ndiba', tel: '677000111' }, taille: 'M', prix: 3000, options: { moto: false, assurance: true, contreRemboursement: false },
    depart: 'Yaoundé · Mvan', arrivee: 'Douala · relais Chez Mado', relaisId: 'p-mado', statut: 'en_route', codeRetrait: '4172', etapes: [{ ts: maintenant() - 20 * 3_600_000, statut: 'cree', lieu: 'App' }, { ts: maintenant() - 14 * 3_600_000, statut: 'depose', lieu: 'Yaoundé · Mvan', par: 'p-fatou' }, { ts: maintenant() - 2 * 3_600_000, statut: 'en_route', lieu: 'Bus 08:30 Mvan → Akwa' }] };
  const covoits: OffreCovoit[] = ([['v1', 'p-moussa', 'Yaoundé', 'Douala', '05:00', 3, 4500, 'Corolla', 'Nsam'], ['v2', 'p-aminata', 'Yaoundé', 'Douala', '07:30', 2, 4500, 'Picanto', 'Tongolo'], ['v3', 'p-jeanpaul', 'Yaoundé', 'Douala', '10:00', 2, 5000, 'Hilux', 'Mvan'],
    ['v4', 'p-sandrine', 'Yaoundé', 'Douala', '14:00', 3, 4500, 'Rav4', 'Nsam'], ['v5', 'p-boris', 'Yaoundé', 'Douala', '17:00', 1, 4500, 'Logan', 'Tongolo']] as const).map(([id, c, de, vers, h, pl, px, v, dep]) => ({ id, conducteurId: c, de, vers, jour: demain, heure: h, places: pl, prix: px, vehicule: v, enVille: false, depart: dep, reservations: [], statut: 'ouverte' as const }));
  return {
    compagnies: COMPAGNIES, gares: GARES, bus, lignes, departs, billets: [billet], paiements: [paiement], covoits, colis: [colis], personnes: PERSONNES.map((p) => ({ ...p })), caisses: [caisse], litiges: [],
    notifications: [{ id: 'n1', destId: 'p-aicha', ts: maintenant() - 3_000_000, titre: 'Billet confirmé', sous: 'Yaoundé → Douala · demain 08:00 · place 3C', lu: false, lien: '/pass', type: 'billet' }],
    evenements: [], params: { modules: { colis: true, covoiturage: true, moto: true, relais: true, groupe: true, assistant: true, financement: true, interAgences: true }, regles: { cloture: true, bordereau: true, scanQuai: true, cadence: true, visage: true },
      tarifs: { dynamique: false, calendrierBas: true, etudiant: true, memePrix: true } }
  };
}
export const sessionVide = () => ({ personneId: null as string | null, role: null as Etat['session']['role'], derniereActivite: 0, langue: 'fr' as const, vuTuto: false, hors_ligne: false });
export const etatInitial = (): Etat => ({ version: 1, monde: monde(), session: sessionVide(), tranches: {} });
export { codeBillet, jourDe };
