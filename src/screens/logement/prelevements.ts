// Prélèvements du logement sur la paie : loyer (+ remboursement de l'avance) et équipement. Lecture sans création de tranche.
import type { LigneAvecEffet } from '../../data/paie.ts';
import { app, notifier } from '../../data/store.svelte.ts';
import { ajouterMois, jourCourt, type Jour } from '../../core/dates.ts';
import { fcfa } from '../../core/money.ts';
import { POINTS } from '../../core/score.ts';
import { ajouterPoints } from '../score/actions.ts';
import { moisCle, prochainPremier } from '../../core/avance-loyer.ts';
import type { Bail } from './etat.ts';
import { logementLu } from './etat.ts';

/** Marque une mensualité de crédit passée : prochaine échéance, fin éventuelle. */
function avancer(creditId: string, paie: Jour, jourPaie: number, titreFin: string) {
  const c = app.credits.find((x) => x.id === creditId); if (!c) return;
  c.payees += 1; c.prochaine = ajouterMois(paie, 1, jourPaie);
  if (c.payees >= c.duree) { c.statut = 'termine'; notifier({ titre: titreFin, sous: `${c.libelle} · ${c.duree} mensualités payées`, lien: '/logement' }); }
}
function reporter(creditId: string | null, paie: Jour, jourPaie: number) {
  const c = creditId ? app.credits.find((x) => x.id === creditId) : undefined;
  if (c) c.prochaine = ajouterMois(paie, 1, jourPaie);
}

export function lignesLogement(paie: Jour): LigneAvecEffet[] {
  const l = logementLu(); const b = l?.bail; const jp = app.compte?.jourPaie;
  if (!b || !jp) return [];
  const lignes: LigneAvecEffet[] = [];
  const avance = b.avanceId ? app.credits.find((c) => c.id === b.avanceId && c.statut === 'actif' && c.prochaine <= paie) : undefined;
  const premier = prochainPremier(paie);
  const loyerDu = Boolean(b.prelevement && b.prochaine && b.prochaine <= paie && paie <= b.finBail && moisCle(premier) >= moisCle(b.entree));
  if (loyerDu || avance) {
    const nbLoyers = loyerDu ? 1 + b.arrieres : 0;
    const montant = nbLoyers * b.loyer + (avance?.mensualite ?? 0);
    const detail = [loyerDu ? `loyer ${fcfa(b.loyer)}${b.arrieres ? ` × ${nbLoyers}` : ''}` : '', avance ? `remboursement ${avance.payees + 1} / ${avance.duree}` : ''].filter(Boolean).join(' + ');
    lignes.push({
      id: `logement-${b.id}`, type: 'credit', libelle: avance ? 'Logement · loyer et avance' : 'Logement · loyer', detail: `${detail} · ${b.libelle}`, montant,
      appliquer: () => payerLoyer(b, paie, jp, loyerDu, avance?.id ?? null),
      reporter: () => { // Prélèvement reporté sans pénalité : AssureMe garantit quand même le loyer au bailleur, à régulariser à la paie suivante.
        if (loyerDu) { b.loyers.push({ mois: moisCle(premier), montant: b.loyer, statut: 'garanti' }); b.arrieres += 1; b.prochaine = ajouterMois(paie, 1, jp); }
        reporter(avance?.id ?? null, paie, jp);
        notifier({ titre: 'Prélèvement logement reporté', sous: loyerDu ? `Le loyer du ${jourCourt(premier)} est garanti au bailleur. Il sera repris à la prochaine paie.` : 'La mensualité est reprise à la prochaine paie.', lien: '/logement' });
      }
    });
  }
  const eq = b.equipement ? app.credits.find((c) => c.id === b.equipement!.creditId && c.statut === 'actif' && c.prochaine <= paie) : undefined;
  if (eq) lignes.push({
    id: `logement-equip-${eq.id}`, type: 'credit', libelle: 'Logement · équipement', detail: `mensualité ${eq.payees + 1} / ${eq.duree} · ${eq.libelle}`, montant: eq.mensualite,
    appliquer: () => avancer(eq.id, paie, jp, 'Équipement remboursé'), reporter: () => reporter(eq.id, paie, jp)
  });
  return lignes;
}

function payerLoyer(b: Bail, paie: Jour, jp: number, loyerDu: boolean, avanceId: string | null) {
  if (loyerDu) {
    const premier = prochainPremier(paie);
    // Les loyers garantis pendant un report restent marqués « garanti » ; seul le loyer du mois compte à l'heure (+6 points).
    b.arrieres = 0;
    if (!b.loyers.some((x) => x.mois === moisCle(premier))) b.loyers.push({ mois: moisCle(premier), montant: b.loyer, statut: 'paye' });
    b.prochaine = ajouterMois(paie, 1, jp);
    ajouterPoints('Loyer payé à l’heure', POINTS.loyerPaye, 'ponctualite');
  }
  if (avanceId) avancer(avanceId, paie, jp, 'Avance de loyer remboursée');
}
