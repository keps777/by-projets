import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../data/store.svelte.ts';
import { etatInitial } from '../data/seed.ts';
import { degeler, ErreurAdmin, geler, MOTIF_MAX, statutAvantGel } from './admin.ts';
import { acheter, droitDe, ErreurMarche, nommerVoyageur, offresDuVol } from './marche.ts';
import { blocageDe, ErreurRevente, mettreEnVente, retirerAnnonce } from './revente.ts';
import { etatTransfert, ErreurTransfert, transferer } from './transfert.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187', ADM = 'adm-01';
const code = (f: () => unknown): string | undefined => { try { f(); } catch (e) { return e instanceof ErreurAdmin ? e.code : `autre:${(e as Error).message}`; } return undefined; };

describe('geler un droit', () => {
  it('passe le droit à « gelé » avec sa raison, ajoute un maillon « gel », consigne l’audit (attention) et notifie le détenteur', () => {
    const avant = app.monde.audit.length, chaine = droitDe('d-812')!.chaine.length;
    const d = geler('d-812', ADM, '  Vérification   d’identité en cours  ');
    expect(d.statut).toBe('gele'); expect(d.gelRaison).toBe('Vérification d’identité en cours');
    expect(d.chaine).toHaveLength(chaine + 1); expect(d.chaine.at(-1)).toMatchObject({ type: 'gel', de: ADM, vers: ALEX, prix: 0, note: 'Vérification d’identité en cours' });
    expect(app.monde.audit).toHaveLength(avant + 1); expect(app.monde.audit[0]).toMatchObject({ acteur: ADM, action: 'Gel du droit', cible: 'NXG-7Q2M', gravite: 'attention', detail: 'Vérification d’identité en cours' });
    const n = app.monde.notifications[0]; expect(n).toMatchObject({ compteId: ALEX, essentielle: true, lien: '/droit/d-812' }); expect(n.titre).toContain('NXG-7Q2M'); expect(n.titre).toContain('gelé');
  });
  it('exige un motif (non vide, au plus 200 caractères), un administrateur et un droit existant', () => {
    expect(code(() => geler('d-812', ADM, ''))).toBe('motif'); expect(code(() => geler('d-812', ADM, '   '))).toBe('motif');
    expect(code(() => geler('d-812', ADM, 'x'.repeat(MOTIF_MAX + 1)))).toBe('motif'); expect(code(() => geler('d-812', ADM, 'x'.repeat(MOTIF_MAX)))).toBeUndefined();
    expect(code(() => geler('d-8wc2', ALEX, 'Essai'))).toBe('admin'); expect(code(() => geler('d-8wc2', 'ACC-9999', 'Essai'))).toBe('admin');
    expect(code(() => geler('d-inconnu', ADM, 'Essai'))).toBe('droit');
    expect(droitDe('d-8wc2')!.statut).toBe('nomme'); expect(app.monde.audit.some((a) => a.cible === 'NXG-8WC2')).toBe(false);
  });
  it('refuse un droit déjà gelé ou qui n’est plus actif, sans rien écrire', () => {
    expect(code(() => geler('d-gele', ADM, 'Encore'))).toBe('deja_gele');
    droitDe('d-812')!.statut = 'vendu'; const n = app.monde.audit.length; expect(code(() => geler('d-812', ADM, 'Trop tard'))).toBe('statut'); expect(app.monde.audit).toHaveLength(n); expect(droitDe('d-812')!.chaine).toHaveLength(1);
  });
});

describe('dégeler un droit', () => {
  it('rend le statut d’avant le gel (détenu, en vente avec son annonce, nommé), ajoute un maillon « degel », consigne et notifie', () => {
    for (const [id, statut] of [['d-812', 'detenu'], ['d-hav', 'en_vente'], ['d-8wc2', 'nomme']] as const) {
      const d = droitDe(id)!, annonce = d.annonce ? { ...d.annonce } : undefined, n = d.chaine.length;
      geler(id, ADM, 'Gel d’essai'); expect(statutAvantGel(d)).toBe(statut);
      degeler(id, ADM, 'Vérification terminée');
      expect(d.statut).toBe(statut); expect(d.gelRaison).toBeUndefined(); expect(d.annonce).toEqual(annonce);
      expect(d.chaine.slice(n).map((m) => m.type)).toEqual(['gel', 'degel']); expect(d.chaine.at(-1)).toMatchObject({ de: ADM, vers: d.detenteurId, note: 'Vérification terminée' });
      expect(app.monde.audit[0]).toMatchObject({ action: 'Dégel du droit', cible: d.ref, gravite: 'attention', acteur: ADM });
      expect(app.monde.notifications[0].titre).toContain('dégelé');
    }
  });
  it('dégèle le droit gelé de la démonstration (sans mémoire du gel) : il redevient détenu', () => {
    const d = degeler('d-gele', ADM, 'Identité vérifiée'); expect(d.statut).toBe('detenu'); expect(d.gelRaison).toBeUndefined();
  });
  it('exige un motif, un administrateur et un droit gelé', () => {
    expect(code(() => degeler('d-gele', ADM, ''))).toBe('motif'); expect(code(() => degeler('d-gele', ALEX, 'Essai'))).toBe('admin');
    expect(code(() => degeler('d-812', ADM, 'Essai'))).toBe('pas_gele'); expect(code(() => degeler('d-inconnu', ADM, 'Essai'))).toBe('droit');
    expect(droitDe('d-gele')!.statut).toBe('gele');
  });
});

describe('un droit gelé est inerte (intégration avec le marché, la revente et le transfert)', () => {
  it('ne peut être ni mis en vente, ni transféré, ni nommé, ni acheté, puis redevient actif au dégel', () => {
    geler('d-812', ADM, 'Contrôle');
    expect(() => mettreEnVente('d-812', ALEX, 1500)).toThrow(ErreurRevente); expect(blocageDe('d-812', ALEX)).toBe('gele');
    expect(() => transferer('d-812', ALEX, CAMILLE)).toThrow(ErreurTransfert); expect(etatTransfert('d-812', ALEX)).toMatchObject({ ok: false, motif: 'gele' });
    expect(() => nommerVoyageur('d-812', ALEX, { prenom: 'Alex', nom: 'Exemple', pourSoi: true, compteId: ALEX })).toThrow(ErreurMarche);
    expect(droitDe('d-812')).toMatchObject({ statut: 'gele', detenteurId: ALEX }); expect(droitDe('d-812')!.voyageur).toBeUndefined();
    degeler('d-812', ADM, 'Contrôle terminé');
    expect(blocageDe('d-812', ALEX)).toBeUndefined(); expect(etatTransfert('d-812', ALEX).ok).toBe(true);
    expect(mettreEnVente('d-812', ALEX, 1500).statut).toBe('en_vente');
  });
  it('une annonce gelée disparaît du marché, ne peut pas être achetée ni retirée, et revient au dégel', () => {
    const vol = droitDe('d-r816')!.volId, offre = () => offresDuVol(vol).find((o) => o.droitId === 'd-r816');
    expect(offre()).toBeDefined(); const o = offre()!;
    geler('d-r816', ADM, 'Contrôle');
    expect(offre()).toBeUndefined(); expect(() => acheter(o, CAMILLE)).toThrow(ErreurMarche); expect(() => retirerAnnonce('d-r816', 'ACC-0301')).toThrow(ErreurRevente);
    degeler('d-r816', ADM, 'Contrôle terminé'); expect(offre()?.prix).toBe(1500);
  });
});
