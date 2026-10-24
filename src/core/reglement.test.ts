import { describe, expect, it } from 'vitest';
import { planSieges } from './sieges.ts';
import { autreMoyen, chrono, codeAffiche, colonneEcran, echeanceAtteinte, formaterExpiration, formaterNumeroCarte, formaterTel, frequencesCode, limiteRemboursement, luhn, meilleurSiege, messageProche, normaliserTel, OPERATEURS, partParPersonne, pourcentPaye, refusAutomatique, telValide, totalBusEntier, validerCarte } from './reglement.ts';

describe('téléphones camerounais', () => {
  it('normalise, valide et formate', () => {
    expect(normaliserTel('+237 691 22 10 08')).toBe('691221008'); expect(normaliserTel('6 91 22 10 08')).toBe('691221008');
    expect(telValide('691221008')).toBe(true); expect(telValide('591221008')).toBe(false); expect(telValide('69122100')).toBe(false);
    expect(formaterTel('691221008')).toBe('6 91 22 10 08'); expect(formaterTel('abc')).toBe('abc');
  });
  it('un numéro qui finit par 00 est refusé : solde insuffisant', () => {
    expect(refusAutomatique('691221100')).toBe('Solde insuffisant'); expect(refusAutomatique('6 91 22 10 00')).toBe('Solde insuffisant'); expect(refusAutomatique('691221008')).toBeNull();
  });
  it('autre moyen pour réessayer', () => { expect(autreMoyen('momo')).toBe('om'); expect(autreMoyen('om')).toBe('momo'); expect(autreMoyen('carte')).toBe('momo'); expect(OPERATEURS.om.ussd).toBe('#150#'); });
});

describe('carte bancaire', () => {
  const maintenant = new Date(2026, 9, 24).getTime();
  const ok = { numero: '4111 1111 1111 1111', expiration: '12/29', cvc: '123', titulaire: 'Aïcha Ndiba' };
  it('Luhn', () => { expect(luhn('4111111111111111')).toBe(true); expect(luhn('4111 1111 1111 1112')).toBe(false); expect(luhn('123')).toBe(false); });
  it('carte valide : aucune erreur', () => { expect(validerCarte(ok, maintenant)).toEqual({}); });
  it('erreurs par champ', () => {
    expect(validerCarte({ ...ok, numero: '4111 1111 1111 1112' }, maintenant).numero).toBeTruthy();
    expect(validerCarte({ ...ok, expiration: '13/29' }, maintenant).expiration).toBeTruthy();
    expect(validerCarte({ ...ok, expiration: '09/26' }, maintenant).expiration).toBe('Carte expirée');
    expect(validerCarte({ ...ok, expiration: '10/26' }, maintenant).expiration).toBeUndefined();
    expect(validerCarte({ ...ok, cvc: '12' }, maintenant).cvc).toBeTruthy(); expect(validerCarte({ ...ok, titulaire: ' ' }, maintenant).titulaire).toBeTruthy();
  });
  it('formats de saisie', () => { expect(formaterNumeroCarte('4111111111111111')).toBe('4111 1111 1111 1111'); expect(formaterExpiration('1229')).toBe('12/29'); expect(formaterExpiration('1')).toBe('1'); });
});

describe('chrono et billet', () => {
  it('chrono', () => { expect(chrono(588_000)).toBe('9:48'); expect(chrono(-5)).toBe('0:00'); expect(chrono(600_000)).toBe('10:00'); });
  it('code affiché et signal sonore', () => {
    expect(codeAffiche('AM7F3K22')).toBe('AM-7F3K-22'); expect(codeAffiche('XY')).toBe('XY');
    const f = frequencesCode('AM7F3K22'); expect(f).toHaveLength(8); expect(Math.min(...f)).toBeGreaterThanOrEqual(600); expect(Math.max(...f)).toBeLessThanOrEqual(1800);
  });
  it('messages WhatsApp', () => {
    const i = { payeur: 'Aïcha', voyageur: 'Aïcha', trajet: 'Yaoundé → Douala', quand: 'Bêta Express mar. 3 nov. 08:00', places: 'place 3C', code: 'AM-7F3K-22', montant: '7 500 F' };
    expect(messageProche('paie', i, 'Maman')).toContain('a payé ton billet'); expect(messageProche('paie', i, 'Maman')).toContain('AM-7F3K-22');
    expect(messageProche('demande', i, 'Paul')).toContain('7 500 F'); expect(messageProche('partage', i, 'Paul')).toContain('te partage');
  });
});

describe('plan de sièges', () => {
  it('choix rapide : fenêtre, couloir, devant ; saute les sièges indisponibles et déjà choisis', () => {
    const plan = planSieges('Classique', 50), pris = new Set(['1A', '1B']);
    expect(meilleurSiege(plan, pris, 'fenetre')).toBe('1D'); expect(meilleurSiege(plan, pris, 'couloir')).toBe('1C'); expect(meilleurSiege(plan, pris, 'devant')).toBe('1C');
    expect(meilleurSiege(plan, pris, 'fenetre', ['1D'])).toBe('2A'); expect(meilleurSiege(plan, new Set(plan.map((s) => s.id)), 'devant')).toBeNull();
  });
  it('colonnes à l’écran : couloir au milieu', () => {
    expect([1, 2, 4, 5].map((c) => colonneEcran('Classique', c))).toEqual([1, 2, 4, 5]); expect([1, 2, 3].map((c) => colonneEcran('VIP', c))).toEqual([1, 3, 4]);
  });
});

describe('cagnotte bus entier', () => {
  it('tarif : 60 000 F + 4 000 F par place, comme les maquettes', () => {
    expect([30, 50, 70].map(totalBusEntier)).toEqual([180_000, 260_000, 340_000]);
    expect(partParPersonne(180_000, 30)).toBe(6000); expect(partParPersonne(260_000, 50)).toBe(5200); expect(partParPersonne(340_000, 70)).toBe(4900);
  });
  it('la cagnotte pleine couvre toujours le total', () => { for (const n of [30, 50, 70]) expect(partParPersonne(totalBusEntier(n), n) * n).toBeGreaterThanOrEqual(totalBusEntier(n)); });
  it('pourcentage et échéance J-2', () => {
    expect(pourcentPaye(23, 50)).toBe(46); expect(pourcentPaye(60, 50)).toBe(100); expect(pourcentPaye(0, 0)).toBe(0);
    expect(limiteRemboursement('2026-11-14')).toBe('2026-11-12'); expect(echeanceAtteinte('2026-11-14', '2026-11-11')).toBe(false); expect(echeanceAtteinte('2026-11-14', '2026-11-12')).toBe(true);
  });
});
