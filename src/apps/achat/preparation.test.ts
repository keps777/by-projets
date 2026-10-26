import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { bagagesDuDroit, basculerCoche, basculerWallet, cochesDe, dansLeWallet, detailBagages, noteBagages, progression, titreBagages } from './preparation.ts';
import { dateFinalisation, etapesChaine, nomPartie } from './chaine.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const MAI = Date.parse('2026-10-12T09:00');
describe('préparation du voyage', () => {
  it('coche et décoche, droit par droit, et compte la progression sur 4', () => {
    expect(cochesDe('d-812')).toEqual({}); expect(progression(false, {})).toBe(0);
    basculerCoche('d-812', 'passeport'); basculerCoche('d-812', 'bagages'); expect(cochesDe('d-812')).toEqual({ passeport: true, bagages: true }); expect(cochesDe('d-puj')).toEqual({}); expect(progression(true, cochesDe('d-812'))).toBe(3);
    basculerCoche('d-812', 'passeport'); expect(progression(false, cochesDe('d-812'))).toBe(1);
  });
  it('ajout simulé au portefeuille du téléphone, réversible', () => { expect(dansLeWallet('d-812')).toBe(false); basculerWallet('d-812'); expect(dansLeWallet('d-812')).toBe(true); basculerWallet('d-812'); expect(dansLeWallet('d-812')).toBe(false); });
  it('bagages d’Alex sur le vol 812 : 2 inclus, 1 utilisé (celui qu’il propose)', () => {
    const d = app.monde.droits.find((x) => x.id === 'd-812')!, r = bagagesDuDroit(app.monde.bagages, d);
    expect(r).toEqual({ inclus: 2, engages: 1, libres: 1, enVente: 1, revendus: 0 }); expect(titreBagages(r)).toBe('Bagages : 2 inclus, 1 utilisé'); expect(detailBagages(r)).toBe('2 × 23 kg en soute avec votre tarif (hypothèse démo). Le 2e reste libre.'); expect(noteBagages(r)).toBe('(1 bagage en vente sur ce vol)');
  });
  it('aucun bagage engagé, ou tous', () => {
    expect(detailBagages({ inclus: 2, engages: 0, libres: 2, enVente: 0, revendus: 0 })).toMatch(/Aucun n’est encore utilisé/); expect(detailBagages({ inclus: 2, engages: 2, libres: 0, enVente: 0, revendus: 2 })).toMatch(/Aucun ne reste libre/);
    expect(noteBagages({ inclus: 2, engages: 2, libres: 0, enVente: 0, revendus: 2 })).toBe('(2 bagages revendus sur ce vol)'); expect(noteBagages({ inclus: 2, engages: 0, libres: 2, enVente: 0, revendus: 0 })).toBe('');
  });
});
describe('chaîne de détention', () => {
  it('décrit l’achat neuf d’Alex, puis la finalisation', () => {
    const d = app.monde.droits.find((x) => x.id === 'd-812')!; let e = etapesChaine(d, app.monde, MAI);
    expect(e).toHaveLength(1); expect(e[0]).toMatchObject({ date: '12 janv.', titre: 'Achat neuf', detail: 'Alex T. devient détenteur · 1 000 $', finale: false });
    d.chaine.push({ id: 'm-n', quand: MAI, type: 'nommage', de: 'ACC-0412', vers: 'ACC-0412', prix: 0 }); d.voyageur = { prenom: 'Alex', nom: 'Exemple', pourSoi: true };
    e = etapesChaine(d, app.monde, MAI); expect(e[1]).toMatchObject({ date: '12 oct.', titre: 'Finalisation — voyageur nommé', detail: 'Alex Exemple, transmis à la compagnie. Revente et transfert fermés.', finale: true }); expect(dateFinalisation(d, 0)).toBe(MAI);
  });
  it('nomme les parties : NexG-TT, agence, compte, inconnu', () => { expect(nomPartie('nexgtt', app.monde)).toBe('NexG-TT'); expect(nomPartie('agence:horizon', app.monde)).toBe('Agence Horizon'); expect(nomPartie('ACC-0187', app.monde)).toBe('Camille T.'); expect(nomPartie('ACC-9', app.monde)).toBe('Un détenteur'); });
  it('revente : prix et nouveau détenteur', () => { const d = app.monde.droits.find((x) => x.id === 'd-ppt')!; const e = etapesChaine(d, app.monde, MAI); expect(e.map((x) => x.titre)).toEqual(['Achat neuf', 'Revente', 'Revente']); expect(e[2].detail).toBe('Alex T. devient détenteur · 1 850 $'); });
});
