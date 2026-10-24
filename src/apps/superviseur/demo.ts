// Journée de démonstration d'une gare : des ventes au guichet, un guichet bloqué, une clôture d'hier avec écart, un billet contesté, un retard.
// Amorcée une seule fois par appareil, à la première ouverture de l'espace superviseur, uniquement avec les transactions du domaine.
import { app, maintenant } from '../../data/store.svelte.ts';
import { annoncerRetard, consigner, equipeDe, ligneDe, notifier, ouvrirCaisse, regler, reserver, siegesIndisponibles } from '../../domain/actions.ts';
import { planSieges } from '../../core/sieges.ts';
import { ajouterJours, jourDe } from '../../core/dates.ts';
import { bloquerCaisse, demanderAnnulation, signalerScanRefuse } from './actions.ts';
import { creerTranche } from './etat.svelte.ts';
import type { Caisse, Depart } from '../../domain/types.ts';

function siegesLibres(d: Depart, n: number): string[] {
  const pris = siegesIndisponibles(d);
  return planSieges(ligneDe(d).classe, d.capacite).map((x) => x.id).filter((id) => !pris.has(id)).slice(4, 4 + n);
}
function vendreAuGuichet(d: Depart, agentId: string, caisseId: string, noms: string[]) {
  const sieges = siegesLibres(d, noms.length); if (sieges.length < noms.length) return;
  reserver({ departId: d.id, sieges, passagers: noms.map((nom, i) => ({ nom, tel: `69000${i}0${i}${i}` })), acheteurId: agentId, canal: 'guichet', moyen: 'especes', caisseId });
}

/** Amorce la journée de démonstration d'une gare ; rend false si elle l'était déjà. */
export function amorcerDemo(gareId: string): boolean {
  const t = creerTranche(); if (t.demos[gareId]) return false;
  t.demos[gareId] = true;
  const m = app.monde, now = maintenant(), jour = jourDe(new Date(now)), hier = ajouterJours(jour, -1);
  const guichets = equipeDe(gareId, 'guichet'), quai = equipeDe(gareId, 'quai')[0], sup = equipeDe(gareId, 'superviseur')[0];
  const cie = sup?.compagnieId, deLaCie = (d: Depart) => !cie || ligneDe(d).compagnieId === cie; // la gare accueille plusieurs compagnies : la démo reste dans celle du superviseur
  const departsGare = m.departs.filter((d) => ligneDe(d).gareDe === gareId && deLaCie(d) && d.jour >= jour && (d.statut === 'prevu' || d.statut === 'embarquement')).sort((x, y) => x.jour.localeCompare(y.jour) || x.heure.localeCompare(y.heure));
  const [a, b] = guichets;
  if (a && departsGare.length >= 2) {
    const caisse = m.caisses.find((c) => c.agentId === a.id && c.statut === 'ouverte') ?? ouvrirCaisse(a.id, 20_000);
    vendreAuGuichet(departsGare[0], a.id, caisse.id, ['Rose Mballa', 'Hervé Tabi']); vendreAuGuichet(departsGare[1], a.id, caisse.id, ['Carine Nkou']);
    // Clôture d'hier en attente de validation : 162 500 F attendus, 161 000 F comptés.
    const cl: Caisse = { id: 'c-demo-hier-' + a.id, agentId: a.id, gareId, jour: hier, ouvertA: now - 30 * 3_600_000, fond: 20_000, statut: 'fermee', fermeeA: now - 25 * 3_600_000, compte: { 10000: 12, 5000: 8, 1000: 1 }, attendu: 162_500, ecart: -1500, justification: 'rendu de 2 000 au lieu de 500, client parti' };
    m.caisses.push(cl); consigner('caisse', 'Fermeture de caisse · écart -1500 F', a.id, cl.id);
    if (sup) notifier(sup.id, 'Clôture à valider', `${a.prenom} · écart −1 500 F`, `/superviseur/valider?caisse=${cl.id}`, 'caisse');
  }
  if (b && departsGare.length >= 1) {
    const caisse = m.caisses.find((c) => c.agentId === b.id && c.statut === 'ouverte') ?? ouvrirCaisse(b.id, 20_000);
    vendreAuGuichet(departsGare[Math.min(2, departsGare.length - 1)], b.id, caisse.id, ['Eric Fouda', 'Nadine Biloa']);
    const t0 = now - 12 * 60_000; for (let i = 0; i < 3; i++) m.evenements.unshift({ id: `ev-demo-pin-${b.id}-${i}`, ts: t0 + i * 20_000, type: 'pin_faux', acteurId: b.id, texte: 'PIN erroné', ref: caisse.id });
    bloquerCaisse(caisse.id, '3 PIN faux');
  }
  const enRoute = m.departs.filter((d) => ligneDe(d).gareDe === gareId && deLaCie(d) && d.jour === jour && (d.statut === 'parti' || d.statut === 'embarquement')).sort((x, y) => Number(y.statut === 'parti') - Number(x.statut === 'parti') || y.heure.localeCompare(x.heure))[0];
  if (enRoute && quai) {
    const sieges = siegesLibres(enRoute, 1);
    if (sieges.length) {
      const serge = m.personnes.find((p) => p.id === 'p-serge-demo') ?? m.personnes[m.personnes.push({ id: 'p-serge-demo', prenom: 'Serge', nom: 'Bidzana', tel: '690112233', role: 'voyageur', actif: true, ville: 'Yaoundé' }) - 1];
      const { paiement, billets } = reserver({ departId: enRoute.id, sieges, passagers: [{ nom: 'Serge Bidzana', tel: '690112233' }], acheteurId: serge.id, canal: 'app', moyen: 'momo' });
      regler(paiement.id, { ok: true });
      signalerScanRefuse(quai.id, `Capture d’écran présentée par un tiers · billet ${billets[0].code}`, billets[0].id);
      demanderAnnulation(quai.id, billets[0].id, 'capture d’écran présentée par un tiers');
    }
  }
  const prochain = departsGare.find((d) => d.statut === 'prevu' && d.jour === jour && d.id !== enRoute?.id);
  if (prochain && !prochain.retardMin) annoncerRetard(prochain.id, 15, sup?.id);
  return true;
}
