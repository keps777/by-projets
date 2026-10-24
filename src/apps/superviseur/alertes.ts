// Alertes « à traiter » du superviseur, construites depuis le monde (fonction pure, testable sans store).
import { departsGare, numeroGuichet } from '../../core/gare.ts';
import { jourDe } from '../../core/dates.ts';
import { GRAVITE, TYPES_REFUS_SCAN, trierAlertes, type Alerte } from '../../core/supervision.ts';
import { fcfaSigne } from '../../core/money.ts';
import type { Monde } from '../../domain/types.ts';

const hhmm = (ts: number) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export const gareDuBillet = (m: Monde, billetId: string) => { const b = m.billets.find((x) => x.id === billetId), d = m.departs.find((x) => x.id === b?.departId); return d ? m.lignes.find((l) => l.id === d.ligneId)?.gareDe : undefined; };
export const gareDuDepartId = (m: Monde, departId: string) => { const d = m.departs.find((x) => x.id === departId); return d ? m.lignes.find((l) => l.id === d.ligneId)?.gareDe : undefined; };
/** Gare concernée par un litige (billet ou départ), pour le router vers le bon superviseur. */
export const gareDuLitige = (m: Monde, l: Monde['litiges'][number]) => (l.objet.type === 'billet' ? gareDuBillet(m, l.objet.id) : l.objet.type === 'depart' ? gareDuDepartId(m, l.objet.id) : undefined);

export function alertesGare(m: Monde, gareId: string, now: number): Alerte[] {
  const jour = jourDe(new Date(now)), A: (Alerte & { ts: number })[] = [], nom = (id?: string) => m.personnes.find((p) => p.id === id)?.prenom ?? '—';
  for (const c of m.caisses.filter((x) => x.gareId === gareId)) {
    const n = numeroGuichet(m, gareId, c.agentId);
    if (c.statut === 'fermee') A.push({ id: `caisse-${c.id}`, genre: 'caisse', ton: 'wa', etiquette: 'caisse', titre: (c.ecart ?? 0) === 0 ? `Clôture à valider · ${nom(c.agentId)} · guichet ${n}` : `Écart de caisse · ${nom(c.agentId)} · guichet ${n}`, sous: (c.ecart ?? 0) === 0 ? 'caisse juste' : `${fcfaSigne(c.ecart ?? 0)} F à la clôture`, href: `/superviseur/valider?caisse=${c.id}`, gravite: GRAVITE.caisse, ts: c.fermeeA ?? 0 });
    if (c.statut === 'bloquee') {
      const ev = m.evenements.find((e) => e.type === 'blocage' && e.ref === c.id);
      A.push({ id: `acces-${c.id}`, genre: 'acces', ton: 'inf', etiquette: 'accès', titre: `Guichet ${n} bloqué${ev ? ` · ${ev.texte}` : ''}`, sous: `${nom(c.agentId)}${ev ? ` · depuis ${hhmm(ev.ts)}` : ''}`, href: `/superviseur/debloquer?caisse=${c.id}`, gravite: GRAVITE.acces, ts: ev?.ts ?? 0 });
    }
  }
  const ouverts = m.litiges.filter((l) => l.statut !== 'resolu' && gareDuLitige(m, l) === gareId);
  for (const l of ouverts) {
    const b = l.objet.type === 'billet' ? m.billets.find((x) => x.id === l.objet.id) : undefined, annul = l.type === 'annulation', d = b ? m.departs.find((x) => x.id === b.departId) : undefined;
    const parti = !!d && (d.statut === 'parti' || d.statut === 'arrive' || new Date(`${d.jour}T${d.heure}:00`).getTime() + d.retardMin * 60_000 < now);
    A.push({ id: `litige-${l.id}`, genre: annul ? 'annulation' : 'litige', ton: annul ? 'er' : 'wa', etiquette: annul ? 'billet' : 'litige', titre: annul ? `Annulation demandée ${parti ? 'après' : 'avant'} départ` : `Litige · ${l.type}`, sous: annul && b ? `billet ${b.code}${b.siege ? ` · place ${b.siege}` : ''}` : l.texte, href: `/superviseur/voir?litige=${l.id}`, gravite: GRAVITE[annul ? 'annulation' : 'litige'], ts: l.ts });
  }
  for (const v of departsGare(m, gareId, jour, now)) {
    if (v.statut !== 'prevu' && v.statut !== 'embarquement') continue;
    const href = `/superviseur/voir?depart=${v.id}`;
    if (v.enRetard) A.push({ id: `depart-${v.id}`, genre: 'depart', ton: 'er', etiquette: 'départ', titre: `Départ ${v.heure} pas encore parti`, sous: `${v.vers} · ${v.compagnie} · +${Math.round((now - v.ts) / 60_000) + v.retardMin} min`, href, gravite: GRAVITE.depart, ts: v.ts });
    else if (v.retardMin > 0) A.push({ id: `retard-${v.id}`, genre: 'retard', ton: 'wa', etiquette: 'retard', titre: `Retard annoncé +${v.retardMin} min · ${v.heure}`, sous: `${v.vers} · ${v.compagnie} · maintenir ou annuler`, href, gravite: GRAVITE.retard, ts: v.ts });
  }
  const traites = new Set(ouverts.map((l) => l.objet.id));
  const refus = m.evenements.filter((e) => (TYPES_REFUS_SCAN as readonly string[]).includes(e.type) && jourDe(new Date(e.ts)) === jour && m.personnes.find((p) => p.id === e.acteurId)?.gareId === gareId && !(e.ref && traites.has(e.ref)));
  for (const e of refus.slice(0, 3)) A.push({ id: `scan-${e.id}`, genre: 'scan', ton: 'wa', etiquette: 'scan', titre: 'Scan refusé au quai', sous: `${e.texte} · ${hhmm(e.ts)}`, href: e.ref && m.billets.some((b) => b.id === e.ref) ? `/superviseur/voir?billet=${e.ref}` : '/superviseur/voir', gravite: GRAVITE.scan, ts: e.ts });
  return trierAlertes(A);
}
