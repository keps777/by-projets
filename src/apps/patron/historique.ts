// Historique de démonstration : sans lui, le monde neuf n'a qu'un billet et le tableau du patron serait vide.
// On y ajoute ~14 jours de ventes (billets réels, paiements, caisses clôturées, quelques colis et événements du journal), déterministes (aucun hasard réel).
// Il raconte une histoire que l'assistant retrouve dans les chiffres : depuis 3 jours, le 07:00 Yaoundé → Douala de Bêta perd des billets face au 06:15 de Finex moins cher,
// et Bafoussam baisse (un guichet absent, un départ annulé). Lancé une seule fois, seulement si le monde est presque vide.
import { ajouterJours, enDate, jourDe, type Jour } from '../../core/dates.ts';
import { prixColis } from '../../core/colis.ts';
import { codeBillet, sceller } from '../../core/sceau.ts';
import { planSieges, supplementSiege } from '../../core/sieges.ts';
import { COUPURES } from '../../core/caisse.ts';
import { fcfa } from '../../core/money.ts';
import type { Billet, Caisse, Colis, Depart, Evenement, Ligne, Monde, MoyenPaiement, Paiement, Personne } from '../../domain/types.ts';

export const PERSONNE_CLIENTS = 'p-clients';
export const SEUIL_MONDE_VIDE = 40;
const PRENOMS = ['Jean', 'Marie', 'Paul', 'Aminatou', 'Brice', 'Estelle', 'Landry', 'Nadia', 'Hervé', 'Sylvie', 'Pierre', 'Carine', 'Martial', 'Fanta', 'Cédric', 'Ruth', 'Serge', 'Odile', 'Thierry', 'Pélagie'];
const NOMS = ['Tchamba', 'Mvondo', 'Ngassa', 'Biya', 'Nkoulou', 'Fouda', 'Kenmogne', 'Abena', 'Tagne', 'Essono', 'Mbida', 'Nguimfack', 'Onana', 'Fokou', 'Manga', 'Ateba'];
const FACTEUR_SEMAINE = [1.2, 1.0, 0.85, 0.85, 0.95, 1.25, 1.1];
const ECARTS = [0, 0, -1500, 0, 500, 0, 0, -500, 0, 0, 0, -1000];

function aleatoire(graine: number) { let s = graine >>> 0; return () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296; }
const departMs = (d: Depart) => new Date(`${d.jour}T${d.heure}:00`).getTime() + d.retardMin * 60_000;
const debutJour = (j: Jour) => new Date(`${j}T00:00:00`).getTime();

export interface OptionsHistorique { jour: Jour; now: number; jours?: number; parJour?: number }
export interface BilanHistorique { billets: number; caisses: number; colis: number; evenements: number }

/** Poids d'un départ dans le tirage des ventes (le 07:00 de Bêta est un départ très demandé). */
function poids(l: Ligne, d: Depart, recent: boolean): number {
  const bx = l.compagnieId === 'BX', yd = (l.de === 'Yaoundé' && l.vers === 'Douala') || (l.de === 'Douala' && l.vers === 'Yaoundé');
  let w = bx ? (yd ? 3 : l.de === 'Bafoussam' || l.vers === 'Bafoussam' ? 2.5 : 1.2) : 0.75;
  if (l.id === 'l-BX-Classique-mvan-aller' && d.heure === '07:00') w = 7;
  if (l.compagnieId === 'FX' && l.de === 'Yaoundé' && d.heure === '06:15' && recent) w *= 1.8;
  return w;
}
function coupures(montant: number): Record<string, number> {
  const res: Record<string, number> = {}; let reste = Math.max(0, montant);
  for (const c of COUPURES) { const n = Math.floor(reste / c); if (n) res[String(c)] = n; reste -= n * c; }
  return res;
}

export function genererHistorique(m: Monde, o: OptionsHistorique): BilanHistorique {
  const bilan: BilanHistorique = { billets: 0, caisses: 0, colis: 0, evenements: 0 };
  if (m.billets.length >= SEUIL_MONDE_VIDE) return bilan;
  const jours = o.jours ?? 14, parJour = o.parJour ?? 64, alea = aleatoire(20261103), lignes = new Map(m.lignes.map((l) => [l.id, l]));
  if (!m.personnes.some((p) => p.id === PERSONNE_CLIENTS)) m.personnes.push({ id: PERSONNE_CLIENTS, prenom: 'Clients', nom: 'AfriMove (historique)', tel: '600000000', role: 'voyageur', actif: true } satisfies Personne);
  // Les départs sont lus une seule fois (le monde est un proxy réactif : le relire dans la boucle des ventes serait lent)
  interface Cand { d: Depart; l: Ligne; ms: number; w: [number, number]; frein: number }
  const departsParJour = new Map<Jour, Cand[]>();
  for (const d of m.departs) {
    const l = lignes.get(d.ligneId); if (d.statut === 'annule' || !l) continue;
    const frein = d.ligneId === 'l-BX-Classique-mvan-aller' && d.heure === '07:00' ? 0.65 : l.compagnieId === 'BX' && l.de === 'Bafoussam' ? 0.5 : 0;
    (departsParJour.get(d.jour) ?? departsParJour.set(d.jour, []).get(d.jour)!).push({ d, l, ms: departMs(d), w: [poids(l, d, false), poids(l, d, true)], frein });
  }
  const pris = new Map<string, Set<string>>(), plans = new Map<string, string[]>(), codes = new Set(m.billets.map((b) => b.code));
  const occupes = new Map<string, string[]>(); for (const b of m.billets) if (b.siege) (occupes.get(b.departId) ?? occupes.set(b.departId, []).get(b.departId)!).push(b.siege);
  const sieges = (d: Depart, l: Ligne) => { if (!pris.has(d.id)) pris.set(d.id, new Set([...d.prisAilleurs, ...(occupes.get(d.id) ?? [])])); if (!plans.has(d.id)) plans.set(d.id, planSieges(l.classe, d.capacite).map((s) => s.id)); return { pris: pris.get(d.id)!, plan: plans.get(d.id)! }; };
  const agents = m.personnes.filter((p) => p.role === 'guichet' && p.gareId === 'mvan'), absent = ajouterJours(o.jour, -2);
  const billets: Billet[] = [], paiements: Paiement[] = [], parCaisse = new Map<string, Billet[]>();
  let compteur = 0;
  const jours7 = new Map<Jour, Jour[]>(); const sept = (j: Jour) => { if (!jours7.has(j)) jours7.set(j, Array.from({ length: 7 }, (_, k) => ajouterJours(j, k))); };

  for (let s = -(jours - 1); s <= 0; s++) {
    const jour = ajouterJours(o.jour, s), recent = s >= -2, base = debutJour(jour), maxMin = s === 0 ? Math.floor((o.now - base) / 60_000) : 1260;
    if (maxMin <= 300) continue;
    const fraction = s === 0 ? Math.min(1, (maxMin - 300) / 960) : 1;
    const n = Math.round(parJour * FACTEUR_SEMAINE[enDate(jour).getDay()] * (0.92 + 0.16 * alea()) * fraction);
    for (let i = 0; i < n; i++) {
      const frac = alea() < 0.55 ? alea() * 0.375 : 0.375 + alea() * 0.625, ts = base + Math.floor(300 + frac * (maxMin - 300)) * 60_000;
      // départ tiré parmi les 7 jours qui suivent la vente (jamais avant hier : le monde n'a pas de départs plus anciens)
      const premier = jour > ajouterJours(o.jour, -1) ? jour : ajouterJours(o.jour, -1); sept(premier);
      const cands: { c: Cand; w: number }[] = [];
      for (let k = 0; k < 7; k++) for (const c of departsParJour.get(jours7.get(premier)![k]) ?? []) if (c.ms >= ts + 15 * 60_000) cands.push({ c, w: c.w[recent ? 1 : 0] / (1 + k) });
      const somme = cands.reduce((t, x) => t + x.w, 0); if (!somme) continue;
      let tirage = alea() * somme, choix = cands[0]; for (const x of cands) { tirage -= x.w; if (tirage <= 0) { choix = x; break; } }
      const { d, l, frein } = choix.c, { pris: p, plan } = sieges(d, l), libres = plan.filter((x) => !p.has(x));
      // l'histoire des trois derniers jours : des ventes qui n'ont pas lieu (prix trop haut face à Finex ; Bafoussam en baisse)
      if (recent && alea() < frein) continue;
      if (!libres.length) continue;
      const siege = libres[Math.floor(alea() * libres.length)]; p.add(siege);
      const guichet = jour < o.jour && l.compagnieId === 'BX' && l.gareDe === 'mvan' && alea() < 0.45, agent = guichet ? (jour === absent ? agents[0] : agents[Math.floor(alea() * agents.length)]) : undefined;
      const moyen: MoyenPaiement = guichet ? 'especes' : alea() < 0.58 ? 'momo' : alea() < 0.75 ? 'om' : 'carte', canal = guichet ? 'guichet' as const : alea() < 0.12 ? 'ussd' as const : 'app' as const;
      const nom = `${PRENOMS[Math.floor(alea() * PRENOMS.length)]} ${NOMS[Math.floor(alea() * NOMS.length)]}`;
      let code = codeBillet(o.now / 1000 + compteur * 13 + 5); for (let k = 1; codes.has(code); k++) code = codeBillet(o.now / 1000 + compteur * 13 + 5 + k * 1009); codes.add(code);
      const num = ++compteur, parti = choix.c.ms < o.now, prix = d.prix + supplementSiege(l.classe, siege);
      const cle = agent ? `${jour}|${agent.id}` : '';
      const b: Billet = {
        id: `b-h${num}`, code, departId: d.id, siege, passager: { nom, tel: `6${String(10_000_000 + Math.floor(alea() * 89_999_999))}` }, prix, canal, acheteurId: agent?.id ?? PERSONNE_CLIENTS, paiementId: `pay-h${num}`,
        statut: parti && alea() < 0.95 ? 'scanne' : 'valide', creeLe: ts, sceau: sceller({ code, departId: d.id, siege, nom }), caisseId: agent ? `c-h-${jour}-${agent.id}` : undefined
      };
      if (b.statut === 'scanne') { b.scanneLe = choix.c.ms - (10 + Math.floor(alea() * 20)) * 60_000; b.scannePar = 'p-ibrahim'; }
      billets.push(b);
      paiements.push({ id: b.paiementId, ts, montant: prix, moyen, statut: 'ok', ref: `${moyen.toUpperCase()}-H${num}`, canal, payeurId: b.acheteurId, pour: { type: 'billet', ids: [b.id] } });
      if (cle) (parCaisse.get(cle) ?? parCaisse.set(cle, []).get(cle)!).push(b);
    }
  }
  // Hier, un départ de Bafoussam annulé (pluie) : ses billets sont remboursés
  const veille = m.departs.find((d) => d.jour === ajouterJours(o.jour, -1) && d.heure === '07:30' && lignes.get(d.ligneId)?.de === 'Bafoussam' && lignes.get(d.ligneId)?.compagnieId === 'BX');
  if (veille) {
    veille.statut = 'annule';
    for (const b of billets.filter((x) => x.departId === veille.id)) { b.statut = 'rembourse'; b.annuleLe = b.creeLe + 3_600_000; const pa = paiements.find((x) => x.id === b.paiementId); if (pa) pa.statut = 'rembourse'; }
  }
  m.billets.push(...billets); m.paiements.push(...paiements); bilan.billets = billets.length;

  // Caisses clôturées du guichet de Mvan, avec comptage par coupure
  const evenements: Evenement[] = [], ev = (ts: number, type: string, texte: string, acteurId?: string, ref?: string) => evenements.push({ id: `ev-h${evenements.length + 1}`, ts, type, texte, acteurId, ref });
  let k = 0;
  for (const [cle, bs] of parCaisse) {
    const [jour, agentId] = cle.split('|'), base = debutJour(jour), valides = bs.filter((b) => b.statut === 'valide' || b.statut === 'scanne');
    const fond = 20_000, attendu = fond + valides.reduce((t, b) => t + b.prix, 0), ecart = ECARTS[k++ % ECARTS.length], id = `c-h-${jour}-${agentId}`;
    const c: Caisse = { id, agentId, gareId: 'mvan', jour, ouvertA: base + 330 * 60_000, fond, statut: 'validee', fermeeA: base + 21 * 3_600_000, compte: coupures(attendu + ecart), attendu, ecart, valideeA: base + 21.5 * 3_600_000, validePar: 'p-abdou', justification: ecart ? (ecart < 0 ? 'Erreur de monnaie au guichet' : 'Trop-perçu rendu le lendemain') : undefined };
    m.caisses.push(c); bilan.caisses++;
    ev(c.ouvertA, 'caisse', `Ouverture de caisse · fond ${fcfa(fond)} F`, agentId, id); ev(c.fermeeA!, 'caisse', ecart ? `Fermeture de caisse · écart ${ecart < 0 ? '−' : '+'}${fcfa(Math.abs(ecart))} F` : 'Fermeture de caisse · caisse juste', agentId, id); ev(c.valideeA!, 'caisse', 'Clôture validée', 'p-abdou', id);
  }
  // Journal des autres équipes : scans du quai, rapports du soir, contrôles, sécurité
  for (let s = -6; s <= -1; s++) {
    const base = debutJour(ajouterJours(o.jour, s)), scans = billets.filter((b) => b.scanneLe && jourDe(new Date(b.scanneLe)) === jourDe(new Date(base))).length;
    if (scans) ev(base + 20 * 3_600_000 + 50 * 60_000, 'scan', `${scans} billets scannés au quai`, 'p-ibrahim');
    ev(base + 20.8 * 3_600_000, 'rapport', 'Rapport du soir envoyé', 'p-mireille'); ev(base + 20.9 * 3_600_000, 'rapport', 'Rapport du soir envoyé', 'p-abdou');
    ev(base + (s === -1 || s === -2 ? 21.7 : 20.7) * 3_600_000, 'rapport', s === -1 || s === -2 ? 'Rapport du soir envoyé en retard' : 'Rapport du soir envoyé', 'p-pascal');
  }
  ev(o.now - 3 * 86_400_000, 'controle', 'Contrôle à bord Mvan → Akwa : 38 billets vérifiés', 'p-clarisse'); ev(o.now - 5 * 86_400_000, 'controle', 'Contrôle à bord Mvan → Bafoussam : 41 billets vérifiés', 'p-clarisse');
  ev(o.now - 2 * 86_400_000, 'securite', 'Excès de vitesse signalé (112 km/h) sur Mvan → Akwa', 'p-emile'); ev(o.now - 4 * 86_400_000, 'formation', 'Formation cadence certifiée', 'p-fatou');
  m.evenements.push(...evenements); m.evenements.sort((a, b) => b.ts - a.ts); if (m.evenements.length > 400) m.evenements.length = 400; bilan.evenements = evenements.length;

  // Quatre colis : deux à déposer pour Douala (confiables à un partenaire), un pour Bafoussam, un livré
  const t = (h: number) => o.now - h * 3_600_000, ouvrage: [string, string, string, string, 'S' | 'M' | 'L', Colis['statut'], number, string][] = [
    ['col-h1', 'AM-C-4KM', 'Yaoundé · Mvan', 'Douala · Akwa', 'M', 'depose', 2, 'p-maman'], ['col-h2', 'AM-C-7PN', 'Yaoundé · Mvan', 'Douala · relais Chez Mado', 'S', 'cree', 1, 'p-paul'],
    ['col-h3', 'AM-C-2XR', 'Yaoundé · Mvan', 'Bafoussam · Bafoussam', 'L', 'depose', 20, 'p-maman'], ['col-h4', 'AM-C-8TD', 'Douala · Akwa', 'Yaoundé · Mvan', 'M', 'livre', 80, 'p-paul']
  ];
  for (const [id, code, depart, arrivee, taille, statut, heures, exp] of ouvrage) {
    const etapes: Colis['etapes'] = [{ ts: t(heures), statut: 'cree', lieu: 'App' }];
    if (statut !== 'cree') etapes.push({ ts: t(heures - 0.5), statut: 'depose', lieu: depart, par: 'p-fatou' });
    if (statut === 'livre') etapes.push({ ts: t(heures - 10), statut: 'en_route', lieu: 'Bus Mvan → Akwa' }, { ts: t(heures - 30), statut: 'livre', lieu: arrivee });
    m.colis.push({ id, code, expediteurId: exp, destinataire: { nom: 'Destinataire de démonstration', tel: '690000000' }, taille, prix: prixColis(taille, { moto: false, assurance: false }), options: { moto: false, assurance: false, contreRemboursement: false }, depart, arrivee, statut, etapes, codeRetrait: String(4000 + ouvrage.findIndex((x) => x[0] === id) * 1111) });
    bilan.colis++;
  }
  return bilan;
}
