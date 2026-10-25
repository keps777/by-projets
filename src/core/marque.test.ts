import { describe, expect, it } from 'vitest';
import { MARQUE_MS, MAX_CHANGEMENTS, animationsPermises, delaiAvant, enteteInitial, interrompre, lettres, modeDe, rotationEnPause, rythme, sonPermis, suivant, type EtatEntete } from './marque.ts';

describe('rotation de la première ligne', () => {
  it('alterne salutation et marque, premier changement à ~4 s puis ~8 s', () => {
    let e = enteteInitial();
    expect(e.moment).toBe('salut');
    expect(delaiAvant(e)).toBe(4000);
    e = suivant(e);
    expect(e).toEqual({ moment: 'marque', changements: 1 });
    expect(delaiAvant(e)).toBe(MARQUE_MS);
    e = suivant(e);
    expect(e.moment).toBe('salut');
    expect(delaiAvant(e)).toBe(8000);
  });
  it('s’arrête sur la salutation après 10 changements au plus', () => {
    let e = enteteInitial(), n = 0;
    for (let d = delaiAvant(e); d !== null; d = delaiAvant(e)) { e = suivant(e); n++; expect(n).toBeLessThanOrEqual(MAX_CHANGEMENTS + 1); }
    expect(e.changements).toBeLessThanOrEqual(MAX_CHANGEMENTS);
    expect(e.moment).toBe('salut');
    expect(delaiAvant(e)).toBeNull();
  });
  it('accorde toujours le retour à la salutation, même à la limite', () => {
    const e: EtatEntete = { moment: 'marque', changements: MAX_CHANGEMENTS - 1 };
    expect(delaiAvant(e)).toBe(MARQUE_MS);
    expect(suivant(e)).toEqual({ moment: 'salut', changements: MAX_CHANGEMENTS });
  });
  it('une interruption pendant la marque ramène à la salutation sans compter', () => {
    expect(interrompre({ moment: 'marque', changements: 3 })).toEqual({ moment: 'salut', changements: 3 });
    const s: EtatEntete = { moment: 'salut', changements: 3 };
    expect(interrompre(s)).toBe(s);
  });
  it('le rythme rapide raccourcit les attentes mais pas le moment de marque', () => {
    const r = rythme('rapide');
    expect(r.premier).toBeLessThan(rythme().premier);
    expect(r.marque).toBe(MARQUE_MS);
    expect(modeDe('rapide')).toBe('rapide');
    expect(modeDe('anime')).toBe('normal');
  });
});

describe('pauses et autorisations', () => {
  const libre = { visible: true, ecranVisible: true, fenetreOuverte: false, appui: false, horsEcran: false, mouvementReduit: false };
  it('pause dès qu’une condition gêne', () => {
    expect(rotationEnPause(libre)).toBe(false);
    for (const k of ['fenetreOuverte', 'appui', 'horsEcran', 'mouvementReduit'] as const) expect(rotationEnPause({ ...libre, [k]: true })).toBe(true);
    expect(rotationEnPause({ ...libre, visible: false })).toBe(true);
    expect(rotationEnPause({ ...libre, ecranVisible: false })).toBe(true);
  });
  it('les animations sont coupées sous automatisation sauf demande explicite, et toujours en mouvement réduit', () => {
    expect(animationsPermises({ automatise: false, parametre: null, mouvementReduit: false })).toBe(true);
    expect(animationsPermises({ automatise: true, parametre: null, mouvementReduit: false })).toBe(false);
    expect(animationsPermises({ automatise: true, parametre: 'anime', mouvementReduit: false })).toBe(true);
    expect(animationsPermises({ automatise: true, parametre: 'rapide', mouvementReduit: false })).toBe(true);
    expect(animationsPermises({ automatise: false, parametre: 'anime', mouvementReduit: true })).toBe(false);
  });
  it('jamais de son sans interaction ni sans le réglage « Sons et jingle »', () => {
    expect(sonPermis({ aInteragi: false, sonsActifs: true })).toBe(false);
    expect(sonPermis({ aInteragi: true, sonsActifs: false })).toBe(false);
    expect(sonPermis({ aInteragi: true, sonsActifs: true })).toBe(true);
  });
  it('les lettres entrent en cascade', () => {
    const l = lettres();
    expect(l.map((x) => x.c).join('')).toBe('AfriMove');
    expect(l[7].retard).toBeGreaterThan(l[0].retard);
  });
});
