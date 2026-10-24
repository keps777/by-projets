// Rapport du soir d'une gare : structure, texte WhatsApp prêt à envoyer, lien de partage, règle de clôture.
// Module pur : le calcul à partir du monde est dans `gare.ts`.
import { fcfa, fcfaSigne, fcfaUnite } from './money.ts';
import { jourSemaineLong, type Jour } from './dates.ts';
import { hhmm } from './retard.ts';

export interface LigneVente { cle: string; libelle: string; billets: number; colis: number; especes: number; total: number; /** null : caisse encore ouverte ou sans caisse. */ ecart: number | null; statut?: string }
export interface Rapport {
  gareId: string; gareNom: string; ville: string; jour: Jour; genereA: number; superviseur: string;
  recette: number; recetteBillets: number; recetteColis: number; billets: number; evolutionPct: number | null; reference: string;
  guichets: LigneVente[]; convoyeurs: LigneVente; enLigne: LigneVente;
  departs: { total: number; partis: number; annules: number; restants: number; retards: { heure: string; vers: string; retardMin: number }[] };
  remplissagePct: number; parHeure: { heure: number; ventes: number }[]; pic: string | null;
  caisses: { total: number; ouvertes: number; aValider: number; validees: number; bloquees: number; ecartTotal: number; ecarts: { agent: string; montant: number }[] };
  colis: { envoyes: number; enAttente: number };
  /** Lignes d'incident en clair (scans refusés, litiges, blocages…). */ incidents: string[];
  /** Points qui restent ouverts à la clôture (caisse non validée, départ restant…). */ reserves: string[];
}

/** Évolution en % par rapport à une référence ; null quand il n'y a rien à comparer. */
export function evolution(valeur: number, reference: number): number | null {
  return reference > 0 ? Math.round(((valeur - reference) / reference) * 100) : null;
}
export const fmtEvolution = (p: number | null) => (p === null ? 'pas de référence' : `${p > 0 ? '+' : p < 0 ? '−' : ''}${Math.abs(p)} %`);

// ------------------------------------------------------------------ clôture de la gare
/** Heure limite de clôture (règle `cloture`) : 20:00. */
export const HEURE_LIMITE_CLOTURE = 20 * 60;
export interface Cloture { tardive: boolean; retardMin: number; limite: string }
/** Règle `cloture` active : clôturer après 20:00 déclenche une alerte au patron. Règle coupée : jamais tardive. */
export function evaluerCloture(minutesDuJour: number, regleActive: boolean): Cloture {
  const retardMin = Math.max(0, minutesDuJour - HEURE_LIMITE_CLOTURE);
  return { tardive: regleActive && retardMin > 0, retardMin, limite: hhmm(HEURE_LIMITE_CLOTURE) };
}

// ------------------------------------------------------------------ texte WhatsApp
const pl = (n: number, un: string, plus = `${un}s`) => `${n} ${n > 1 ? plus : un}`;
const heureDe = (ms: number) => { const d = new Date(ms); return hhmm(d.getHours() * 60 + d.getMinutes()); };
/** Texte du rapport au format WhatsApp (*gras*). Une ligne par sujet, court, lisible sur un petit écran. */
export function texteRapport(r: Rapport): string {
  const L: string[] = [];
  L.push(`*Rapport du soir · ${r.gareNom}*`, `${jourSemaineLong(r.jour)} · ${heureDe(r.genereA)}`, '');
  L.push(`*Recette* ${fcfaUnite(r.recette)} (${fmtEvolution(r.evolutionPct)}${r.evolutionPct === null ? '' : ` ${r.reference}`})`);
  L.push(`${pl(r.billets, 'billet')} · ${r.departs.partis}/${r.departs.total} bus partis · remplissage ${r.remplissagePct} %`);
  for (const g of r.guichets) L.push(`${g.libelle} : ${pl(g.billets, 'billet')} · ${fcfa(g.especes)} F espèces${g.ecart === null ? ' · caisse non clôturée' : g.ecart === 0 ? ' · juste' : ` · écart ${fcfaSigne(g.ecart)} F`}`);
  if (r.convoyeurs.billets) L.push(`Convoyeurs : ${pl(r.convoyeurs.billets, 'billet')} · ${fcfa(r.convoyeurs.total)} F`);
  if (r.enLigne.billets) L.push(`En ligne : ${pl(r.enLigne.billets, 'billet')} · ${fcfa(r.enLigne.total)} F`);
  const c = r.caisses;
  L.push(`*Caisses* ${c.validees} validée${c.validees > 1 ? 's' : ''} · ${c.aValider} à valider · ${pl(c.bloquees, 'bloquée')} · ${c.ouvertes} ouverte${c.ouvertes > 1 ? 's' : ''}`);
  L.push(c.ecarts.length ? `*Écarts* ${c.ecarts.map((e) => `${e.agent} ${fcfaSigne(e.montant)} F`).join(' · ')}` : '*Écarts* aucun');
  L.push(`*Colis* ${pl(r.colis.envoyes, 'envoyé')}${r.colis.enAttente ? `, ${r.colis.enAttente} en attente de retrait` : ''}`);
  if (r.departs.retards.length) L.push(`*Retards* ${r.departs.retards.map((x) => `${x.heure} ${x.vers} +${x.retardMin} min`).join(' · ')}`);
  if (r.departs.annules) L.push(`*Départs annulés* ${r.departs.annules}`);
  if (r.incidents.length) L.push(`*Incidents* ${r.incidents.join(' · ')}`);
  if (r.reserves.length) L.push(`*Réserves* ${r.reserves.join(' · ')}`);
  L.push(`— ${r.superviseur}`);
  return L.join('\n');
}

/** Lien WhatsApp avec le texte prérempli ; avec un numéro (chiffres, indicatif compris), la discussion s'ouvre sur ce contact. Aucun envoi automatique. */
export function lienWhatsApp(texte: string, tel?: string): string {
  const num = (tel ?? '').replace(/\D/g, '');
  return `https://wa.me/${num}?text=${encodeURIComponent(texte)}`;
}
/** Découpe un texte `*gras*` en segments pour l'afficher sans innerHTML. */
export function segmentsGras(ligne: string): { t: string; gras: boolean }[] {
  return ligne.split(/(\*[^*]+\*)/).filter(Boolean).map((t) => (t.startsWith('*') && t.endsWith('*') && t.length > 2 ? { t: t.slice(1, -1), gras: true } : { t, gras: false }));
}
