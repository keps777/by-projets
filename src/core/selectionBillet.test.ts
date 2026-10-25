import { describe, expect, it } from 'vitest';
import { choisirBillet, deplacer, descriptionItem, estEnCours, libelleItem, libellePassager, libelleStatut, trierItems, type ItemBillet } from './selectionBillet.ts';

const item = (o: Partial<ItemBillet> = {}): ItemBillet => ({ id: 'b1', passager: 'Aïcha', pourMoi: true, trajet: 'Yaoundé → Douala', jour: 'mer.', heure: '08:00', departMs: 1000, statut: 'a_venir', siege: '3C', ...o });

describe('sélecteur de bus : libellés', () => {
  it('dit qui voyage et qui a payé', () => {
    expect(libellePassager(item())).toBe('Toi'); expect(libellePassager(item({ pourMoi: false, passager: 'Marie', payePar: 'toi' }))).toBe('Marie · payé par toi');
    expect(libellePassager(item({ payePar: 'Paul' }))).toBe('Toi · payé par Paul'); expect(libellePassager(item({ pourMoi: false, passager: 'Marie' }))).toBe('Marie');
  });
  it('trajet, heure, statut et description pour lecteur d’écran', () => {
    expect(libelleItem(item())).toBe('Yaoundé → Douala · mer. 08:00'); expect(libelleStatut('en_route')).toBe('en route');
    expect(descriptionItem(item({ pourMoi: false, passager: 'Marie', statut: 'embarquement' }))).toBe('Marie, Yaoundé → Douala · mer. 08:00, place 3C, embarquement');
    expect(descriptionItem(item({ siege: null }))).not.toContain('place');
  });
  it('en cours = ni passé ni annulé', () => { expect(['a_venir', 'embarquement', 'en_route', 'a_bord'].every((s) => estEnCours({ statut: s as never }))).toBe(true); expect(estEnCours({ statut: 'passe' })).toBe(false); expect(estEnCours({ statut: 'annule' })).toBe(false); });
  it('trie par heure de départ, stable', () => {
    const l = [item({ id: 'c', departMs: 30 }), item({ id: 'a', departMs: 10 }), item({ id: 'b', departMs: 10 })];
    expect(trierItems(l).map((x) => x.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('sélecteur de bus : billet affiché', () => {
  const enCours = ['b1', 'b2', 'b3'];
  it('le lien ?billet= l’emporte, même sur un billet passé', () => { expect(choisirBillet({ enCours, tous: [...enCours, 'vieux'], demande: 'vieux', memorise: 'b3' })).toBe('vieux'); expect(choisirBillet({ enCours, demande: 'b2', memorise: 'b3' })).toBe('b2'); });
  it('sinon le dernier choix mémorisé, s’il est encore en cours', () => { expect(choisirBillet({ enCours, memorise: 'b3' })).toBe('b3'); });
  it('sinon le prochain départ (mémorisé périmé ou lien inconnu)', () => { expect(choisirBillet({ enCours, memorise: 'perime' })).toBe('b1'); expect(choisirBillet({ enCours, demande: 'inconnu' })).toBe('b1'); expect(choisirBillet({ enCours })).toBe('b1'); });
  it('rien à choisir quand il n’y a aucun billet en cours', () => { expect(choisirBillet({ enCours: [] })).toBeUndefined(); expect(choisirBillet({ enCours: [], memorise: 'b1' })).toBeUndefined(); });
});

describe('sélecteur de bus : clavier', () => {
  it('flèches circulaires, Home et End', () => {
    expect(deplacer(-1, 'ArrowDown', 3)).toBe(0); expect(deplacer(0, 'ArrowDown', 3)).toBe(1); expect(deplacer(2, 'ArrowDown', 3)).toBe(0);
    expect(deplacer(-1, 'ArrowUp', 3)).toBe(2); expect(deplacer(0, 'ArrowUp', 3)).toBe(2); expect(deplacer(2, 'ArrowUp', 3)).toBe(1);
    expect(deplacer(1, 'Home', 3)).toBe(0); expect(deplacer(1, 'End', 3)).toBe(2);
  });
  it('autre touche ou liste vide : pas de déplacement', () => { expect(deplacer(1, 'a', 3)).toBeNull(); expect(deplacer(0, 'ArrowDown', 0)).toBeNull(); });
});
