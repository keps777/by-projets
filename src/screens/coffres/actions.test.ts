import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { lignesDe, passerPaie } from '../../data/paie.ts';
import { moisDe, moisPrecedent } from '../../core/coffres.ts';
import { niveauDuScore } from '../../core/credit.ts';
import { basculerAuto, creerCoffre, crediterInterets, modifierMensuel, retirer, supprimerCoffre, versementExceptionnel } from './actions.ts';
import './demarrage.ts';
import { coffreRentree, coffres, etatCoffres, totalEpargne } from './etat.ts';

const NOW = Date.now();
beforeEach(() => { reinitialiser('demo'); etatCoffres(); });

describe('tranche coffres', () => {
  it("démo : trois coffres, l'école lit le coffre Rentrée", () => {
    expect(coffres().map((c) => c.nom)).toEqual(['Rentrée 2027', 'Apport voiture', 'Urgences famille']);
    expect(totalEpargne()).toBe(780_000);
    expect(coffreRentree()).toMatchObject({ epargne: 160_000, objectif: 600_000 });
  });
  it('compte vierge : aucun coffre', () => {
    reinitialiser('vierge');
    expect(coffres()).toEqual([]); expect(coffreRentree()).toBeNull(); expect(lignesDe('2099-01-28')).toEqual([]);
  });
});

describe('versement exceptionnel', () => {
  it('débite le solde, crédite le coffre et gagne 5 points une fois par mois', () => {
    const r = versementExceptionnel('cf-rentree', 10_000);
    expect(r.ok).toBe(true);
    expect(app.solde).toBe(76_500); expect(coffres()[0].epargne).toBe(170_000);
    expect(app.score.valeur).toBe(747); expect(app.mouvements[0].montant).toBe(-10_000);
    versementExceptionnel('cf-rentree', 5_000);
    expect(app.score.valeur).toBe(747);
  });
  it('refuse solde insuffisant, montant invalide et dépassement de l’objectif', () => {
    expect(versementExceptionnel('cf-rentree', 90_000)).toMatchObject({ ok: false, erreur: expect.stringContaining('Solde insuffisant') });
    expect(versementExceptionnel('cf-rentree', 0).ok).toBe(false);
    expect(versementExceptionnel('cf-rentree', 12.5).ok).toBe(false);
    app.solde = 10_000_000;
    expect(versementExceptionnel('cf-rentree', 500_000)).toMatchObject({ ok: false, erreur: expect.stringContaining('440') });
    expect(versementExceptionnel('inconnu', 1000).ok).toBe(false);
  });
  it('atteindre l’objectif complète le coffre et notifie', () => {
    app.solde = 1_000_000;
    expect(versementExceptionnel('cf-urgences', 80_000).ok).toBe(true);
    expect(versementExceptionnel('cf-urgences', 1_000)).toMatchObject({ ok: false });
    expect(app.notifications[0].titre).toContain('Objectif atteint');
  });
});

describe('retrait', () => {
  it('avant objectif : 1er gratuit, 2e avec 2 % de frais, crédité sur le solde', () => {
    const a = retirer('cf-voiture', 100_000);
    expect(a.ok).toBe(true); expect(app.solde).toBe(186_500);
    const b = retirer('cf-voiture', 100_000);
    expect(b.ok).toBe(true); expect(app.solde).toBe(186_500 + 98_000);
    expect(coffres()[1].epargne).toBe(300_000);
  });
  it('refuse plus que l’épargne', () => expect(retirer('cf-rentree', 999_999).ok).toBe(false));
  it('coffre vide : suppression possible, sinon refusée', () => {
    expect(supprimerCoffre('cf-rentree').ok).toBe(false);
    retirer('cf-rentree', 160_000);
    expect(supprimerCoffre('cf-rentree').ok).toBe(true); expect(coffres()).toHaveLength(2);
  });
});

describe('création', () => {
  it('crée un coffre personnel ou partagé', () => {
    const r = creerCoffre('Mariage', { nom: ' Mariage ', objectif: 1_000_000, mensuel: 50_000, partage: true, membres: 4 });
    expect(r.ok).toBe(true);
    expect(coffres()[0]).toMatchObject({ nom: 'Mariage', partage: true, membres: 4, epargne: 0 });
    expect(app.notifications[0].sous).toContain('3 proches');
  });
  it('refuse une saisie invalide', () => {
    expect(creerCoffre('Libre', { nom: '', objectif: 1_000_000, mensuel: 50_000, partage: false, membres: 1 })).toMatchObject({ ok: false });
    expect(coffres()).toHaveLength(3);
  });
  it('refuse au-delà de 8 coffres', () => {
    for (let i = 0; i < 5; i++) creerCoffre('Libre', { nom: `C${i}`, objectif: 100_000, mensuel: 10_000, partage: false, membres: 1 });
    expect(creerCoffre('Libre', { nom: 'trop', objectif: 100_000, mensuel: 10_000, partage: false, membres: 1 })).toMatchObject({ ok: false, erreur: expect.stringContaining('maximum') });
  });
  it('modifie et suspend le versement', () => {
    expect(modifierMensuel('cf-rentree', 30_000).ok).toBe(true); expect(modifierMensuel('cf-rentree', 10).ok).toBe(false);
    basculerAuto('cf-rentree'); expect(lignesDe('2099-01-28').map((l) => l.id)).not.toContain('coffre-cf-rentree');
  });
});

describe('paie et intérêts', () => {
  it('le jour de paie : prélève 25 000 + 40 000 + 2 500 (part) et crédite les coffres', () => {
    const l = lignesDe('2099-01-28').filter((x) => x.type === 'coffre');
    expect(l.map((x) => x.montant)).toEqual([25_000, 40_000, 2_500]);
    app.solde = 0;
    passerPaie('2099-01-28');
    expect(app.solde).toBe(520_000 - 67_500);
    expect(coffres().map((c) => c.epargne)).toEqual([185_000, 540_000, 130_000]);
  });
  it('reporte sans pénalité si le solde ne suffit pas', () => {
    app.compte!.salaireNet = 0; app.solde = 0;
    passerPaie('2099-01-28');
    expect(coffres()[0].epargne).toBe(160_000); expect(app.notifications.some((n) => n.titre.includes('reporté'))).toBe(true);
  });
  it('le dernier versement ne dépasse pas l’objectif', () => {
    etatCoffres().coffres[0].epargne = 590_000;
    expect(lignesDe('2099-01-28')[0].montant).toBe(10_000);
  });
  it('crédite 3,5 % par an chaque mois et rattrape les mois manqués', () => {
    expect(crediterInterets(NOW)).toBe(0);
    const plus2 = NOW + 62 * 86_400_000;
    const t = crediterInterets(plus2);
    expect(t).toBeGreaterThan(0);
    expect(coffres()[0].epargne).toBeGreaterThan(160_000);
    expect(coffres()[0].interetsMois).toBe(moisPrecedent(moisDe(plus2)));
    expect(crediterInterets(plus2 + 86_400_000)).toBe(0);
  });
  it('le niveau reste cohérent avec le score après les points', () => {
    expect(niveauDuScore(app.score.valeur)).toBe('PRO');
  });
});
