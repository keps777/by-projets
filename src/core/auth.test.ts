import { describe, expect, it } from 'vitest';
import { apresEchec, apresSucces, chiffresTel, codeOtp, codeTropSimple, creerOtp, essaisRestants, estVerrouille, forceCode, formaterTel, hacher, masquerTel, operateurDuNumero, secondesAvantDeverrou, secondesAvantRenvoi, selAleatoire, sessionExpiree, telValide, verifierHash, verifierOtp } from './auth.ts';

describe('code à 6 chiffres', () => {
  it('refuse les suites, les répétitions et la liste noire', () => {
    for (const c of ['123456', '654321', '111111', '121212', '000000', '112233', '456789', '909090']) expect(codeTropSimple(c)).toBe(true);
    for (const c of ['482915', '739104', '208157']) expect(codeTropSimple(c)).toBe(false);
  });
  it('solidité : plus de chiffres différents = plus solide', () => {
    expect(forceCode('12345').score).toBe(0);
    expect(forceCode('123456').score).toBe(0);
    expect(forceCode('482915').libelle).toBe('SOLIDE');
    expect(forceCode('481481').score).toBe(1);
    expect(forceCode('481482').score).toBe(2);
  });
  it('hachage : même code + même sel = même hash ; autre code ou autre sel = autre hash', async () => {
    const sel = selAleatoire();
    const h = await hacher('482915', sel, 1000);
    expect(h).toHaveLength(64);
    expect(await verifierHash('482915', sel, h, 1000)).toBe(true);
    expect(await verifierHash('482916', sel, h, 1000)).toBe(false);
    expect(await hacher('482915', selAleatoire(), 1000)).not.toBe(h);
  });
});

describe('verrouillage et session', () => {
  const t0 = 1_000_000;
  it('trois codes faux verrouillent 15 minutes ; un succès remet à zéro', () => {
    let e = apresSucces();
    e = apresEchec(e, t0); expect(essaisRestants(e)).toBe(2); expect(estVerrouille(e, t0)).toBe(false);
    e = apresEchec(e, t0); e = apresEchec(e, t0);
    expect(estVerrouille(e, t0 + 1)).toBe(true);
    expect(secondesAvantDeverrou(e, t0)).toBe(900);
    expect(estVerrouille(e, t0 + 15 * 60_000)).toBe(false);
    expect(apresSucces()).toEqual({ echecs: 0, verrouJusqua: null });
  });
  it('la session expire après 5 minutes d’inactivité', () => {
    expect(sessionExpiree(t0, t0 + 299_000)).toBe(false);
    expect(sessionExpiree(t0, t0 + 300_000)).toBe(true);
  });
});

describe('code SMS', () => {
  const t0 = 5_000_000;
  it('un code de 6 chiffres, valable 5 minutes, 5 essais', async () => {
    expect(codeOtp()).toMatch(/^\d{6}$/);
    const otp = await creerOtp('482915', t0);
    expect((await verifierOtp(otp, '000001', t0 + 1000)).resultat).toBe('faux');
    expect((await verifierOtp(otp, '482915', t0 + 301_000)).resultat).toBe('expire');
    const ok = await verifierOtp(otp, '482915', t0 + 1000);
    expect(ok.resultat).toBe('ok');
    expect(ok.otp).toBeNull();
    let cur: typeof otp | null = otp; let r = 'faux';
    for (let i = 0; i < 5; i++) { const v = await verifierOtp(cur, '111111', t0); cur = v.otp; r = v.resultat; }
    expect(r).toBe('trop_d_essais');
    expect((await verifierOtp(cur, '482915', t0)).resultat).toBe('trop_d_essais');
  });
  it('renvoi possible après 42 secondes', async () => {
    const otp = await creerOtp('1', t0);
    expect(secondesAvantRenvoi(otp, t0)).toBe(42);
    expect(secondesAvantRenvoi(otp, t0 + 42_000)).toBe(0);
  });
});

describe('numéros camerounais', () => {
  it('normalise, formate, masque', () => {
    expect(chiffresTel('+237 6 91 22 48 21')).toBe('691224821');
    expect(chiffresTel('00237691224821')).toBe('691224821');
    expect(formaterTel('691224821')).toBe('6 91 22 48 21');
    expect(masquerTel('6 91 22 48 21')).toBe('6•• •• 48 21');
    expect(telValide('6 91 22 48 21')).toBe(true);
    expect(telValide('6 91 22')).toBe(false);
    expect(telValide('5 91 22 48 21')).toBe(false);
  });
  it('opérateur d’après le préfixe', () => {
    expect(operateurDuNumero('691224821')).toBe('Orange');
    expect(operateurDuNumero('655000000')).toBe('Orange');
    expect(operateurDuNumero('677412210')).toBe('MTN');
    expect(operateurDuNumero('650000000')).toBe('MTN');
    expect(operateurDuNumero('233001122')).toBe('Camtel');
    expect(operateurDuNumero('511111111')).toBeNull();
  });
});
