import { describe, expect, it } from 'vitest';
import { NOTES_JINGLE } from '../entree/jingle.ts';
import { DUREE_STING, NOTES_STING } from './jingle.ts';

describe('sting AfriMove', () => {
  it('monte de note en note, dure environ 1,2 s', () => {
    for (let i = 1; i < NOTES_STING.length; i++) { expect(NOTES_STING[i].hz).toBeGreaterThan(NOTES_STING[i - 1].hz); expect(NOTES_STING[i].debut).toBeGreaterThan(NOTES_STING[i - 1].debut); }
    expect(NOTES_STING.length).toBeGreaterThanOrEqual(3); expect(NOTES_STING.length).toBeLessThanOrEqual(4);
    expect(DUREE_STING).toBeGreaterThan(1); expect(DUREE_STING).toBeLessThanOrEqual(1.3);
  });
  it('reste doux et distinct du jingle d’accueil', () => {
    expect(Math.max(...NOTES_STING.map((n) => n.volume))).toBeLessThanOrEqual(0.2);
    expect(NOTES_STING.map((n) => n.hz)).not.toEqual(NOTES_JINGLE.map((n) => n.hz));
    expect(DUREE_STING).toBeLessThan(2);
  });
});
