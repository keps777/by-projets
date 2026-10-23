import { describe, expect, it } from 'vitest';
import { PLAFOND_CAPITAL, PLAFOND_STOCK, creneauxInstallation, deciderService, dureeCourte, indexSemaine, instantsEtapes, lundiDe, niveauPourCapital, niveauPourKit, niveauPourStock, plafondDiaspora, premierPrelevementKit, primeParAge, variationPct, verifierAge } from './services.ts';
import { codeClient, motifQr, numeroRecu, pdfSimple } from './recu.ts';
import { prime } from './protection.ts';
import { KITS } from './energie.ts';

describe('niveaux et plafonds des services', () => {
  it('kits : le niveau requis suit le plafond de crédit', () => {
    expect(niveauPourKit(KITS[0].prix)).toBe('START');
    expect(niveauPourKit(KITS[1].prix)).toBe('START');
    expect(niveauPourKit(KITS[2].prix)).toBe('PLUS');
    expect(niveauPourKit(9_000_000)).toBeNull();
  });
  it('stock, capital, diaspora', () => {
    expect(niveauPourStock()).toBe('PLUS');
    expect(PLAFOND_STOCK.PRO).toBe(850_000);
    expect(niveauPourCapital(5_000_000)).toBe('PRO');
    expect(PLAFOND_CAPITAL.START).toBe(1_000_000);
    expect(plafondDiaspora('START')).toBe(500_000);
  });
});

describe('décision de service (règle des 33 %)', () => {
  const base = { score: 742, seuilScore: 600, salaire: 520_000, mensualiteNouvelle: 20_000, mensualitesExistantes: 44_000, employeurPartenaire: true, ancienneteAns: 4 };
  it('accorde sous 33 % et ignore le contrôle véhicule', () => {
    const d = deciderService(base);
    expect(d.approuve).toBe(true);
    expect(d.controles.map((c) => c.id)).toEqual(['score', 'part', 'employeur']);
  });
  it('refuse au-delà de 33 % (171 600 de plafond)', () => {
    expect(deciderService({ ...base, mensualiteNouvelle: 127_601 }).motif).toContain('Mensualités totales');
    expect(deciderService({ ...base, mensualiteNouvelle: 127_600 }).approuve).toBe(true);
  });
  it('refuse sans score suffisant ou sans employeur', () => {
    expect(deciderService({ ...base, score: 550 }).approuve).toBe(false);
    expect(deciderService({ ...base, employeurPartenaire: false }).approuve).toBe(false);
    expect(deciderService({ ...base, employeurPartenaire: false }, ['employeur']).approuve).toBe(true);
  });
});

describe('protection : âge et prime', () => {
  it('tarif par âge, comme la maquette', () => {
    expect([35, 64, 69, 13, 9].map(primeParAge)).toEqual([900, 1800, 2400, 400, 400]);
    const assures = [0, 35, 64, 13].map((a, i) => ({ prime: i === 0 ? 0 : primeParAge(a) }));
    expect(prime(assures, 2_000_000)).toBe(4600);
  });
  it('âge maximum 75 à l\'entrée', () => {
    expect(verifierAge(75).ok).toBe(true);
    expect(verifierAge(76).ok).toBe(false);
    expect(verifierAge(-1).ok).toBe(false);
    expect(verifierAge(null).ok).toBe(false);
  });
});

describe('énergie : installation et première mensualité', () => {
  it('créneaux lun/mer/ven à partir du jeudi 22 oct. 2026', () => {
    const c = creneauxInstallation('2026-10-22');
    expect(c.map((x) => x.jour)).toEqual(['2026-10-26', '2026-10-28', '2026-10-30']);
  });
  it('au plus tôt 3 jours après', () => {
    expect(creneauxInstallation('2026-10-23')[0].jour).toBe('2026-10-26');
    expect(creneauxInstallation('2026-10-22')[0].jour).not.toBe('2026-10-22');
  });
  it('première mensualité à la paie suivant 5 jours après la pose', () => {
    expect(premierPrelevementKit('2026-10-27', 28)).toBe('2026-11-28');
    expect(premierPrelevementKit('2026-11-25', 28)).toBe('2026-12-28');
  });
});

describe('semaine, durées et étapes', () => {
  it('lundi de la semaine', () => {
    const jeudi = new Date(2026, 9, 22, 10).getTime();
    expect(indexSemaine(jeudi)).toBe(3);
    expect(lundiDe(jeudi)).toBe('2026-10-19');
    expect(indexSemaine(new Date(2026, 9, 25, 10).getTime())).toBe(6);
  });
  it('variation et durée', () => {
    expect(variationPct(1_240_000, 1_050_000)).toBe(18);
    expect(variationPct(10, 0)).toBeNull();
    expect(dureeCourte(29 * 60_000)).toBe('29 min');
    expect(dureeCourte(65 * 60_000)).toBe('1 h 05');
    expect(instantsEtapes(1000, 60_000 * 29)).toEqual([1000, 1000, 61_000, 1000 + 29 * 60_000]);
  });
});

describe('reçu, PDF et QR', () => {
  it('numéro de reçu', () => {
    expect(numeroRecu('Clinique Les Palmiers', 2026, 1187)).toBe('CLP-2026-1187');
    expect(numeroRecu('eneo', 2026, 3)).toBe('AM-2026-3');
  });
  it('PDF valide : en-tête, xref cohérent, accents et euro', () => {
    const o = pdfSimple('Reçu AssureMe', ['Montant : 54,12 € (35 500 FCFA)', 'Parenthèse (test)']);
    const t = String.fromCharCode(...o);
    expect(t.startsWith('%PDF-1.4')).toBe(true);
    expect(t).toContain('EUR');
    expect(t).toContain('\\(test\\)');
    const xref = Number(/startxref\n(\d+)/.exec(t)![1]);
    expect(t.slice(xref, xref + 4)).toBe('xref');
    const off = Number(/0 6\n0000000000 65535 f \n(\d{10})/.exec(t)![1]);
    expect(t.slice(off, off + 7)).toBe('1 0 obj');
  });
  it('QR déterministe avec trois repères', () => {
    const a = motifQr(42), b = motifQr(42), c = motifQr(43);
    expect(a).toEqual(b); expect(a).not.toEqual(c);
    expect(a.length).toBe(21);
    expect([a[0][0], a[0][20], a[20][0]]).toEqual([true, true, true]);
    expect(a[3][3]).toBe(true); expect(a[1][1]).toBe(false);
  });
  it('code client à 6 chiffres', () => {
    expect(codeClient(7)).toMatch(/^\d{3} \d{3}$/);
    expect(codeClient(7)).toBe(codeClient(7));
  });
});
