import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { lignesDe, passerPaie } from '../../data/paie.ts';
import demarrage from './demarrage.ts';
import { commander, creneaux, evaluer } from './actions.ts';
import { apercu, dateFinPlan, etatInstallation, kitAccessible, texteEcart } from './calcul.ts';
import { etat } from './etat.ts';
import { mensualiteKit } from '../../core/energie.ts';

const T0 = Date.parse('2026-10-22T10:00:00');

describe('énergie : aperçu', () => {
  it('Maison sur 24 mois à 1,5 % : mensualité et écart avec ENEO', () => {
    const m = mensualiteKit(350_000, 24, 0.015);
    expect(m).toBe(17_473);
    const a = apercu(350_000, 24, 0.015, 18_000);
    expect(a).toMatchObject({ mensualite: 17_473, ecart: -527, economie: true });
    expect(texteEcart(a.ecart)).toBe('−527 vs facture ENEO');
    expect(texteEcart(apercu(1_200_000, 12, 0.015, 18_000).ecart)).toMatch(/^\+/);
    expect(apercu(45_000, 12, 0.015, 0).ecart).toBeNull();
    expect(texteEcart(null)).toBe('—');
  });
  it('kits accessibles selon le niveau', () => {
    expect(kitAccessible(1_200_000, 'START')).toBe(false);
    expect(kitAccessible(1_200_000, 'PLUS')).toBe(true);
    expect(kitAccessible(350_000, 'START')).toBe(true);
  });
});

describe('énergie : commande, règle des 33 % et mensualités', () => {
  beforeEach(() => { reinitialiser('demo'); demarrage(); });
  it('accorde Maison 24 mois et crée le crédit + le plan', () => {
    const c = creneaux(T0)[0];
    const r = commander('maison', 24, c.jour, T0);
    expect(r.ok).toBe(true);
    const cr = app.credits.find((x) => x.produit === 'solaire')!;
    expect(cr).toMatchObject({ capital: 350_000, mensualite: 17_473, duree: 24, payees: 0, prochaine: '2026-11-28', statut: 'actif' });
    const p = etat().plans[0];
    expect(p).toMatchObject({ kit: 'maison', installation: '2026-10-26', premier: '2026-11-28', veille: false });
    expect(etatInstallation(p, '2026-10-22')).toBe('planifiee'); expect(etatInstallation(p, '2026-10-26')).toBe('installee');
    expect(dateFinPlan(p, 28)).toBe('2028-10-28');
  });
  it('refuse au-delà de 33 % (171 600) : Business 12 mois avec 100 000 déjà prélevés', () => {
    app.credits[0].mensualite = 100_000;
    const ev = evaluer('business', 12)!;
    expect(ev.mensualite + 100_000).toBeGreaterThan(171_600);
    expect(ev.decision.approuve).toBe(false);
    const r = commander('business', 12, creneaux(T0)[0].jour, T0);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.decision?.controles.find((c) => c.id === 'part')?.ok).toBe(false);
    expect(app.credits.filter((x) => x.produit === 'solaire').length).toBe(0);
    expect(commander('business', 36, creneaux(T0)[0].jour, T0).ok).toBe(true); // 36 mois : sous 33 %
  });
  it('niveau et score insuffisants, créneau invalide', () => {
    app.score.valeur = 520;
    expect(commander('business', 36, creneaux(T0)[0].jour, T0).ok).toBe(false);
    expect(commander('maison', 24, '2020-01-01', T0)).toMatchObject({ ok: false });
    app.compte!.employeur = '';
    expect(evaluer('lampes', 12)!.decision.approuve).toBe(false);
  });
  it('prélevé à la paie du 28 nov., puis à chaque paie ; report = veille ; fin du plan = kit à soi', () => {
    commander('lampes', 12, creneaux(T0)[0].jour, T0);
    const cr = app.credits.find((x) => x.produit === 'solaire')!; const p = etat().plans[0];
    expect(lignesDe('2026-10-28').some((l) => l.id === cr.id)).toBe(false);
    const ligne = lignesDe('2026-11-28').find((l) => l.id === cr.id)!;
    expect(ligne).toMatchObject({ type: 'credit', montant: cr.mensualite, detail: 'Mensualité 1 / 12' });
    // solde insuffisant : report sans pénalité
    app.solde = 0; app.compte!.salaireNet = 1;
    passerPaie('2026-11-28'); expect(cr.payees).toBe(0); expect(p.veille).toBe(true); expect(cr.prochaine).toBe('2026-12-28');
    app.compte!.salaireNet = 520_000; app.solde = 100_000;
    passerPaie('2026-12-28'); expect(cr.payees).toBe(1); expect(p.veille).toBe(false); expect(cr.prochaine).toBe('2027-01-28');
    for (let i = 2; i <= 12; i++) passerPaie(`2027-${String(i - 1).padStart(2, '0')}-28`);
    expect(cr.payees).toBe(12); expect(cr.statut).toBe('termine'); expect(p.termine).toBe(true);
    expect(lignesDe('2028-03-28').some((l) => l.id === cr.id)).toBe(false);
  });
});
