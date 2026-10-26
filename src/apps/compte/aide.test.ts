import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe } from '../../domain/compte.ts';
import { FAQ, THEMES, correspond, envoyerMessage, etat, grouperFaq, lisse, majBrouillon, validerMessage, viderBrouillon } from './aide.ts';

const ALEX = 'ACC-0412';
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); app.session.compteId = ALEX; });

describe('questions fréquentes', () => {
  it('six questions dans quatre thèmes, dans l’ordre', () => { expect(FAQ).toHaveLength(6); expect(grouperFaq('').map((g) => [g.titre, g.questions.length])).toEqual([['Droits de voyage', 2], ['Revendre et argent', 2], ['Bagages', 1], ['Notifications et compte', 1]]); expect(THEMES).toHaveLength(4); });
  it('cherche sans tenir compte des accents ni de la casse, dans la question comme dans la réponse', () => {
    expect(lisse('Échéance')).toBe('echeance'); expect(grouperFaq('ECHEANCE').flatMap((g) => g.questions.map((q) => q.id))).toEqual(['q1', 'q2']);
    expect(grouperFaq('commission').flatMap((g) => g.questions.map((q) => q.id))).toEqual(['q3']); expect(grouperFaq('  ')).toHaveLength(4);
  });
  it('une recherche sans résultat renvoie une liste vide', () => { expect(grouperFaq('xyzzy')).toEqual([]); expect(correspond(FAQ[0], 'xyzzy')).toBe(false); });
  it('la réponse sur la commission suit les taux du produit', () => { const r = FAQ.find((f) => f.id === 'q3')!.a; expect(r).toContain('12,5 %'); expect(r).toContain('10 %'); });
});

describe('contact simulé', () => {
  it('refuse un message vide ou démesuré', () => { expect(validerMessage({ message: '   ' }).message).toBe('Écrivez votre message.'); expect(validerMessage({ message: 'a'.repeat(2001) }).message).toContain('2000'); expect(validerMessage({ message: 'Bonjour' })).toEqual({}); });
  it('conserve un brouillon dans la tranche, puis le vide', () => { majBrouillon({ message: 'Bonjour', sujet: 'billet' }); expect(etat().brouillon).toEqual({ sujet: 'billet', reference: '', message: 'Bonjour' }); viderBrouillon(); expect(etat().brouillon).toEqual({ sujet: null, reference: '', message: '' }); });
  it('enregistre la demande, notifie et vide le brouillon', () => {
    majBrouillon({ message: ' Mon versement n’apparaît pas. ', sujet: 'paiement', reference: ' NXG-7Q2M ' }); const n = app.monde.notifications.length;
    const r = envoyerMessage(ALEX, etat().brouillon); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.demande.numero).toMatch(/^AS-[A-Z0-9]{4}$/); expect(r.demande).toMatchObject({ message: 'Mon versement n’apparaît pas.', reference: 'NXG-7Q2M', sujet: 'paiement', compteId: ALEX });
    expect(app.monde.notifications.length).toBe(n + 1); expect(app.monde.notifications[0].titre).toContain('assistance'); expect(etat().brouillon.message).toBe(''); expect(etat().demandes).toHaveLength(1);
  });
  it('un message vide ne crée rien, le brouillon reste', () => { majBrouillon({ message: '' , sujet: 'bagage' }); const r = envoyerMessage(ALEX, etat().brouillon); expect(r.ok).toBe(false); expect(etat().demandes).toHaveLength(0); expect(etat().brouillon.sujet).toBe('bagage'); });
  it('deux demandes ont deux numéros', () => { const a = envoyerMessage(ALEX, { sujet: null, reference: '', message: 'un' }), b = envoyerMessage(ALEX, { sujet: null, reference: '', message: 'deux' }); expect(a.ok && b.ok && a.demande.numero !== b.demande.numero).toBe(true); });
  it('exige un compte', () => { const r = envoyerMessage('ACC-9999', { sujet: null, reference: '', message: 'x' }); expect(!r.ok && r.code).toBe('compte'); expect(compteDe(ALEX)).toBeTruthy(); });
});
