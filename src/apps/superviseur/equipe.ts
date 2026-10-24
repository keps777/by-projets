// Situation de chaque membre de l'équipe d'une gare, déduite du monde (caisse, scans, départs affectés).
import { caisseDuJour } from '../../core/gare.ts';
import { jourDe } from '../../core/dates.ts';
import { TYPES_REFUS_SCAN } from '../../core/supervision.ts';
import type { Monde, Personne, Role } from '../../domain/types.ts';

export const LIBELLE_ROLE: Partial<Record<Role, string>> = { guichet: 'guichet', quai: 'quai', chauffeur: 'chauffeur', convoyeur: 'convoyeur', controleur: 'contrôleur', superviseur: 'superviseur' };
const ORDRE: Role[] = ['guichet', 'quai', 'chauffeur', 'convoyeur', 'controleur', 'superviseur'];
export interface LigneEquipe { p: Personne; role: string; sub: string; pl: string; ton: 'ok' | 'er' | 'wa' | 'inf' | 'ac' | ''; groupe: 'guichets' | 'terrain' }
const STATUT_DEPART = { prevu: 'prévu', embarquement: 'embarquement', parti: 'en route', arrive: 'arrivé', annule: 'annulé' } as const;

export function equipeGare(m: Monde, gareId: string, now: number): LigneEquipe[] {
  const jour = jourDe(new Date(now));
  const lignes = m.personnes.filter((p) => p.gareId === gareId && ORDRE.includes(p.role)).map((p): LigneEquipe => {
    const base = { p, role: LIBELLE_ROLE[p.role] ?? p.role, groupe: p.role === 'guichet' ? ('guichets' as const) : ('terrain' as const) };
    if (!p.actif) return { ...base, sub: 'compte désactivé', pl: 'désactivé', ton: 'er' };
    if (p.role === 'guichet') {
      const c = m.caisses.filter((x) => x.agentId === p.id && (caisseDuJour(x, jour) || x.statut === 'fermee' || x.statut === 'bloquee')).sort((a, b) => b.ouvertA - a.ouvertA)[0];
      if (!c) return { ...base, sub: 'caisse non ouverte', pl: 'hors poste', ton: '' };
      const n = m.billets.filter((b) => b.caisseId === c.id && (b.statut === 'valide' || b.statut === 'scanne')).length, billets = `${n} billet${n > 1 ? 's' : ''}`;
      if (c.statut === 'bloquee') return { ...base, sub: `bloqué · ${m.evenements.find((e) => e.type === 'blocage' && e.ref === c.id)?.texte ?? 'sécurité'}`, pl: 'bloqué', ton: 'er' };
      if (c.statut === 'ouverte') return { ...base, sub: `caisse ouverte · ${billets}`, pl: 'en poste', ton: 'ok' };
      if (c.statut === 'fermee') return { ...base, sub: `caisse fermée · ${billets} · à valider`, pl: 'à valider', ton: 'wa' };
      return { ...base, sub: `caisse validée · ${billets}`, pl: 'terminé', ton: '' };
    }
    if (p.role === 'quai') {
      const ev = m.evenements.filter((e) => e.acteurId === p.id && jourDe(new Date(e.ts)) === jour), scans = ev.filter((e) => e.type === 'scan').length, refus = ev.filter((e) => (TYPES_REFUS_SCAN as readonly string[]).includes(e.type)).length;
      return { ...base, sub: `${scans} scan${scans > 1 ? 's' : ''} · ${refus} refus`, pl: scans + refus > 0 ? 'en poste' : 'disponible', ton: scans + refus > 0 ? 'ok' : '' };
    }
    if (p.role === 'chauffeur' || p.role === 'convoyeur') {
      const d = m.departs.find((x) => x.jour === jour && x.statut !== 'annule' && (p.role === 'chauffeur' ? x.chauffeurId : x.convoyeurId) === p.id);
      if (!d) return { ...base, sub: 'pas de départ affecté', pl: 'disponible', ton: '' };
      return { ...base, sub: `bus ${d.heure} · ${STATUT_DEPART[d.statut]}`, pl: STATUT_DEPART[d.statut], ton: d.statut === 'parti' ? 'inf' : d.statut === 'embarquement' ? 'ac' : '' };
    }
    return { ...base, sub: p.role === 'superviseur' ? 'responsable de la gare' : 'sur le terrain', pl: p.role === 'superviseur' ? 'en poste' : 'disponible', ton: p.role === 'superviseur' ? 'ok' : '' };
  });
  return lignes.sort((a, b) => ORDRE.indexOf(a.p.role) - ORDRE.indexOf(b.p.role) || a.p.prenom.localeCompare(b.p.prenom, 'fr'));
}
