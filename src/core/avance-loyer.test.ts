import { describe, expect, it } from 'vitest';
import {
  ARTICLES_EQUIPEMENT, controlerEquipement, deciderAvance, fenetreMois, formaterNumero, libelleCompte, limitesAvance, mensualiteEquipement, niveauRequis, premierePrelevement,
  prochainJourSemaine, prochainPremier, simuler, statutMois, suggerer, titulaireCoherent, titulaireValide, totalEquipement, loyersALHeure, type EntreeSimulation
} from './avance-loyer.ts';

const base: EntreeSimulation = { loyer: 80_000, mois: 6, duree: 10, taux: 0.015, salaire: 520_000, mensualitesExistantes: 44_000, niveau: 'PRO' };
const pieces = { bail: true, cniBailleur: true, photos: true, compteBailleur: true };
const dec = (o: Partial<Parameters<typeof deciderAvance>[0]> = {}) => deciderAvance({ ...base, score: 742, employeurPartenaire: true, ancienneteAns: 4, pieces, bailleur: 'M. Essomba', titulaire: 'ESSOMBA Jean-Pierre', ...o });

describe('limites par niveau', () => {
  it('START : pas d’avance ; PLUS 100 000 / 3 mois ; PRO 150 000 / 6 mois ; ELITE 300 000 / 12 mois', () => {
    expect(limitesAvance('START')).toEqual({ disponible: false, loyerMax: 0, moisMax: 0 });
    expect(limitesAvance('PLUS')).toEqual({ disponible: true, loyerMax: 100_000, moisMax: 3 });
    expect(limitesAvance('PRO')).toEqual({ disponible: true, loyerMax: 150_000, moisMax: 6 });
    expect(limitesAvance('ELITE')).toEqual({ disponible: true, loyerMax: 300_000, moisMax: 12 });
  });
  it('niveau requis pour une demande', () => {
    expect(niveauRequis(80_000, 3)).toBe('PLUS'); expect(niveauRequis(120_000, 3)).toBe('PRO');
    expect(niveauRequis(80_000, 12)).toBe('ELITE'); expect(niveauRequis(400_000, 1)).toBeNull();
  });
});

describe('simulation', () => {
  it('80 000 × 6 mois sur 10 mois à 1,5 % : 480 000, remboursement 52 048, prélèvement 132 048', () => {
    const s = simuler(base);
    expect(s.avance).toBe(480_000); expect(s.remboursement).toBe(52_048); expect(s.prelevement).toBe(132_048);
    expect(s.cout).toBe(52_048 * 10 - 480_000);
  });
  it('la part du salaire compte loyer + remboursement + crédits en cours : 33,9 % > 33 %', () => {
    const s = simuler(base);
    expect(s.part).toBeCloseTo((132_048 + 44_000) / 520_000, 6); expect(s.pct).toBe(34); expect(s.depasse).toBe(true); expect(s.ok).toBe(false); expect(s.etat).toBe('trop_lourd');
  });
  it('sur 12 mois on passe sous les 33 %', () => {
    const s = simuler({ ...base, duree: 12 });
    expect(s.depasse).toBe(false); expect(s.ok).toBe(true); expect(s.pct).toBe(32);
  });
  it('exactement 33 % est accepté', () => {
    const s = simuler({ ...base, mensualitesExistantes: 171_600 - 132_048 });
    expect(s.part).toBeCloseTo(0.33, 9); expect(s.ok).toBe(true);
  });
  it('une fois l’avance remboursée : loyer + crédits seulement', () => {
    expect(simuler(base).partApres).toBeCloseTo(124_000 / 520_000, 6);
  });
  it('refuse un loyer ou une durée hors limites du niveau', () => {
    expect(simuler({ ...base, niveau: 'PLUS', loyer: 120_000, mois: 3 }).erreurs[0]).toMatch(/maximum de 100 000/);
    expect(simuler({ ...base, niveau: 'PLUS', mois: 6 }).erreurs[0]).toMatch(/3 mois/);
    expect(simuler({ ...base, niveau: 'START' }).erreurs[0]).toMatch(/niveau Plus/);
    expect(simuler({ ...base, loyer: 0 }).ok).toBe(false);
    expect(simuler({ ...base, duree: 0 }).erreurs).toHaveLength(1);
  });
  it('salaire nul : la part est de 100 %', () => { expect(simuler({ ...base, salaire: 0 }).pct).toBe(100); });
});

describe('suggestion sous les 33 %', () => {
  it('propose d’allonger le remboursement', () => { expect(suggerer(base)).toMatchObject({ type: 'duree', valeur: 12 }); });
  it('sinon réduit les mois d’avance', () => {
    const s = suggerer({ ...base, mensualitesExistantes: 60_000, duree: 12, mois: 6 });
    expect(s?.type).toBe('mois');
    expect(simuler({ ...base, mensualitesExistantes: 60_000, duree: 12, mois: s!.valeur }).ok).toBe(true);
  });
  it('rien à suggérer quand tout va bien, ni quand rien ne suffit', () => {
    expect(suggerer({ ...base, duree: 12 })).toBeNull();
    expect(suggerer({ ...base, mensualitesExistantes: 160_000 })).toBeNull();
  });
});

describe('décision', () => {
  it('approuvée : score, niveau, 33 %, employeur, dossier', () => {
    const d = dec({ duree: 12 });
    expect(d.approuve).toBe(true); expect(d.motif).toBeNull(); expect(d.controles.map((c) => c.id)).toEqual(['score', 'niveau', 'part', 'employeur', 'dossier']);
  });
  it('refusée au-dessus de 33 %, avec le motif', () => {
    const d = dec();
    expect(d.approuve).toBe(false); expect(d.motif).toMatch(/34 %/); expect(d.controles.find((c) => c.id === 'part')?.ok).toBe(false);
  });
  it('refusée sous le score de 600, sans employeur partenaire, avec un dossier incomplet ou un titulaire différent', () => {
    expect(dec({ duree: 12, score: 580 }).controles[0].ok).toBe(false);
    expect(dec({ duree: 12, employeurPartenaire: false }).approuve).toBe(false);
    expect(dec({ duree: 12, pieces: { ...pieces, cniBailleur: false } }).motif).toMatch(/1 pièce/);
    expect(dec({ duree: 12, titulaire: 'KAMGA Paul' }).motif).toMatch(/titulaire/);
  });
  it('refusée si la demande dépasse le niveau', () => { expect(dec({ duree: 12, niveau: 'PLUS' }).controles.find((c) => c.id === 'niveau')?.ok).toBe(false); });
});

describe('compte du bailleur', () => {
  it('formate la saisie', () => {
    expect(formaterNumero('orange', '690123456')).toBe('6 90 12 34 56');
    expect(formaterNumero('orange', '+237 6 90 12 34 56')).toBe('6 90 12 34 56');
    expect(formaterNumero('banque', 'cm21 0000 0000 0000 1234')).toBe('CM21 0000 0000 0000 1234');
    expect(libelleCompte('orange', '6 90 12 09 37')).toBe('Orange Money ···· 0937');
  });
  it('titulaire = bailleur', () => {
    expect(titulaireCoherent('M. Essomba', 'ESSOMBA Jean-Pierre')).toBe(true);
    expect(titulaireCoherent('Jean-Pierre Essomba', 'Essomba Jean Pierre')).toBe(true);
    expect(titulaireCoherent('Jean-Pierre Essomba', 'Kamga Paul')).toBe(false);
    expect(titulaireCoherent('', 'Kamga Paul')).toBe(false);
    expect(titulaireValide('Essomba')).toBe(false); expect(titulaireValide('Essomba Paul')).toBe(true);
  });
});

describe('calendrier des loyers', () => {
  it('prochain 1er et première paie après aujourd’hui', () => {
    expect(prochainPremier('2026-10-22')).toBe('2026-11-01'); expect(prochainPremier('2026-12-31')).toBe('2027-01-01');
    expect(premierePrelevement('2026-10-22', 28)).toBe('2026-10-28');
    expect(premierePrelevement('2026-10-28', 28)).toBe('2026-11-28'); // la paie du jour est déjà passée
    expect(premierePrelevement('2027-01-30', 28)).toBe('2027-02-28');
  });
  it('fenêtre de 12 mois et statuts', () => {
    const f = fenetreMois('2026-05-01', '2026-10-22');
    expect(f).toHaveLength(12); expect(f[0]).toBe('2026-05'); expect(f[11]).toBe('2027-04');
    const loyers = ['2026-05', '2026-06'].map((mois) => ({ mois, montant: 80_000, statut: 'paye' as const }));
    expect(statutMois('2026-05', '2026-10-22', loyers)).toBe('paye');
    expect(statutMois('2026-08', '2026-10-22', loyers)).toBe('passe');
    expect(statutMois('2026-11', '2026-10-22', loyers)).toBe('prevu');
    expect(statutMois('2027-01', '2026-10-22', loyers)).toBe('avenir');
    expect(loyersALHeure([...loyers, { mois: '2026-07', montant: 1, statut: 'garanti' }])).toBe(2);
  });
  it('un suivi ancien est ramené aux 5 derniers mois', () => { expect(fenetreMois('2024-01-01', '2026-10-22')[0]).toBe('2026-05'); });
  it('un début futur (entrée dans les lieux) commence au mois de l’entrée', () => { expect(fenetreMois('2026-12-01', '2026-10-22')[0]).toBe('2026-11'); });
  it('prochain jeudi', () => { expect(prochainJourSemaine('2026-10-23', 4)).toBe('2026-10-29'); });
});

describe('équipement', () => {
  it('mensualité sur 12 mois à 1,5 %', () => {
    expect(totalEquipement(['frigo', 'matelas'])).toBe(275_000);
    expect(mensualiteEquipement(185_000, 0.015)).toBe(16_961);
    expect(ARTICLES_EQUIPEMENT).toHaveLength(3);
  });
  it('règle des 33 % pour une commande', () => {
    expect(controlerEquipement({ salaire: 520_000, mensualitesExistantes: 44_000, loyerPreleve: 0, nouvelle: 16_961 }).ok).toBe(true);
    expect(controlerEquipement({ salaire: 520_000, mensualitesExistantes: 44_000, loyerPreleve: 80_000, nouvelle: 60_000 }).ok).toBe(false);
  });
});
