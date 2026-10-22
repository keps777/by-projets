import { describe, expect, it } from 'vitest';
import { ajouterJours, ajouterMois, ecartJours, jourCourt, jourLong, moisAnnee, paiesEntre, prochainePaie, quand } from './dates.ts';
import { avanceDisponible, modes, net, semainesPourRembourser, fraisStock, remboursementJournalier } from './commerce.ts';
import { etapes, totalEuro } from './diaspora.ts';
import { dateObjectif, gainInterets, interetMensuel, moisPourAtteindre, pctCoffre, partParMembre } from './epargne.ts';
import { aFinancer, calendrierPlan, mensualiteEcole, totalRentree } from './ecole.ts';
import { ecartEneo, mensualiteKit } from './energie.ts';
import { remboursementAvance, avance, prelevementLogement, compteBailleurValide } from './logement.ts';
import { partMembrePass, soldeVerse, totalPrelevement } from './prelevement.ts';
import { prime } from './protection.ts';
import { CONSEILS, borner, hauteurBarre, scoreDesSignaux, trajectoire } from './score.ts';
import { codeCarte, distanceKm, etalerPart, repartirFacture, secondesRestantesCode } from './sante.ts';
import { fcfa, fcfaSigne, court, euro, lireMontant, versEuro } from './money.ts';

describe('dates', () => {
  it('ajouter des mois garde le quantième ou le dernier jour', () => {
    expect(ajouterMois('2026-10-28', 1)).toBe('2026-11-28');
    expect(ajouterMois('2026-01-31', 1)).toBe('2026-02-28');
    expect(ajouterMois('2026-11-28', 3)).toBe('2027-02-28');
    expect(ajouterJours('2026-10-31', 1)).toBe('2026-11-01');
    expect(ecartJours('2026-10-21', '2026-10-28')).toBe(7);
  });
  it('prochaine paie le 28 : aujourd’hui compris', () => {
    expect(prochainePaie('2026-10-21', 28)).toBe('2026-10-28');
    expect(prochainePaie('2026-10-28', 28)).toBe('2026-10-28');
    expect(prochainePaie('2026-10-29', 28)).toBe('2026-11-28');
    expect(paiesEntre('2026-10-28', '2027-01-30', 28)).toEqual(['2026-11-28', '2026-12-28', '2027-01-28']);
  });
  it('libellés en français', () => {
    expect(jourCourt('2026-10-28')).toBe('28 oct.');
    expect(jourLong('2026-11-01')).toBe('1er novembre 2026');
    expect(moisAnnee('2027-06-15')).toBe('juin 2027');
    const now = new Date(2026, 9, 21, 12).getTime();
    expect(quand(new Date(2026, 9, 21, 9, 5).getTime(), now)).toBe("Aujourd'hui · 09:05");
    expect(quand(new Date(2026, 9, 20, 18, 40).getTime(), now)).toBe('Hier · 18:40');
    expect(quand(new Date(2026, 8, 24, 10).getTime(), now)).toBe('24 sept.');
  });
});

describe('argent', () => {
  it('formats', () => {
    expect(fcfa(1240000)).toBe('1 240 000');
    expect(fcfaSigne(-7100)).toBe('−7 100');
    expect(fcfaSigne(12500)).toBe('+12 500');
    expect(court(25000)).toBe('25 k');
    expect(court(1_200_000)).toBe('1,2 M');
    expect(euro(versEuro(35500))).toBe('54,12');
    expect(lireMontant('24 500 FCFA')).toBe(24500);
    expect(lireMontant('abc')).toBeNull();
  });
});

describe('santé', () => {
  it('répartit 35 500 à 80 % : AssureMe 28 400, patient 7 100', () => {
    const r = repartirFacture([{ montant: 15000 }, { montant: 12000 }, { montant: 8500 }], 0.8, 1_014_000);
    expect(r.total).toBe(35500);
    expect(r.assureMe).toBe(28400);
    expect(r.patient).toBe(7100);
    expect(r.plafondDepasse).toBe(false);
  });
  it('le plafond restant limite la part d’AssureMe', () => {
    const r = repartirFacture([{ montant: 100_000 }], 0.8, 50_000);
    expect(r.assureMe).toBe(50_000);
    expect(r.patient).toBe(50_000);
    expect(r.plafondDepasse).toBe(true);
  });
  it('étaler 7 100 sur 3 mois ≈ 2 4xx par mois', () => {
    const m = etalerPart(7100, 3, 0.015);
    expect(m).toBeGreaterThan(2400); expect(m).toBeLessThan(2500);
  });
  it('code de carte : stable 30 s, change au créneau suivant', () => {
    const t = 1_700_000_010_000 - (1_700_000_010_000 % 30_000);
    expect(codeCarte('AM4821', t + 1000)).toBe(codeCarte('AM4821', t + 29_000));
    expect(codeCarte('AM4821', t + 31_000)).not.toBe(codeCarte('AM4821', t));
    expect(codeCarte('AM4821', t)).toMatch(/^\d{6}$/);
    expect(secondesRestantesCode(t + 1000)).toBe(29);
  });
  it('distance Douala (Bonamoussadi) → Akwa ≈ 6 km', () => {
    const d = distanceKm({ lat: 4.0883, lng: 9.7339 }, { lat: 4.0511, lng: 9.7000 });
    expect(d).toBeGreaterThan(4); expect(d).toBeLessThan(7);
  });
});

describe('score', () => {
  it('500 à 900, courbe exigeante', () => {
    expect(scoreDesSignaux({ ponctualite: 100, anciennete: 100, endettement: 100, epargne: 100, dossier: 100 })).toBe(900);
    expect(scoreDesSignaux({ ponctualite: 0, anciennete: 0, endettement: 0, epargne: 0, dossier: 0 })).toBe(500);
    const s = scoreDesSignaux({ ponctualite: 94, anciennete: 72, endettement: 88, epargne: 61, dossier: 80 });
    expect(s).toBeGreaterThan(700); expect(s).toBeLessThan(800);
    expect(borner(1200)).toBe(900);
  });
  it('trajectoire : les 4 conseils (58 points) font passer 742 à 800', () => {
    const t = trajectoire(742, []);
    expect(t.manque).toBe(58);
    expect(t.gainPossible).toBe(58);
    expect(t.atteignable).toBe(true);
    expect(trajectoire(742, ['facture']).atteignable).toBe(false);
    expect(CONSEILS.reduce((s, c) => s + c.points, 0)).toBe(58);
    expect(hauteurBarre(742)).toBe(Math.round((242 / 400) * 46) + 6);
  });
});

describe('coffres', () => {
  it('durée, date et intérêts d’un coffre mariage (1 M à 50 k par mois)', () => {
    expect(moisPourAtteindre(1_000_000, 0, 50_000)).toBe(20);
    expect(moisPourAtteindre(1_000_000, 500_000, 0)).toBe(Infinity);
    expect(dateObjectif('2026-10-21', 20)).toBe('2028-06-01');
    expect(gainInterets(1_000_000, 20)).toBe(29_167);
    expect(interetMensuel(780_000)).toBe(2275);
    expect(pctCoffre(160_000, 600_000)).toBe(27);
    expect(partParMembre(50_000, 4)).toBe(12_500);
  });
});

describe('école, logement, énergie', () => {
  it('rentrée 2027 : 3 enfants = 600 000, coffre 160 000, 440 000 à financer, 47 711 par mois sur 10 mois', () => {
    const total = totalRentree([{ montant: 250_000, inclus: true }, { montant: 150_000, inclus: true }, { montant: 200_000, inclus: true }, { montant: 999, inclus: false }]);
    expect(total).toBe(600_000);
    expect(aFinancer(total, 160_000)).toBe(440_000);
    expect(mensualiteEcole(440_000, 10, 0.015)).toBe(47_711);
    const cal = calendrierPlan('2027-09-01', 10);
    expect(cal[0].etat).toBe('ecoles'); expect(cal[9].etat).toBe('mensualite'); expect(cal[10].etat).toBe('libre');
  });
  it('avance de loyer : 6 mois de 80 000 = 480 000 remboursés sur 10 mois', () => {
    expect(avance(80_000, 6)).toBe(480_000);
    const r = remboursementAvance(80_000, 6, 10, 0.015);
    expect(r).toBe(52_048);
    expect(prelevementLogement(80_000, r)).toBe(132_048);
    expect(compteBailleurValide('orange', '6 90 12 34 56')).toBe(true);
    expect(compteBailleurValide('banque', 'CM21 0000')).toBe(false);
  });
  it('kit Maison 350 000 sur 24 mois ≈ 17 473', () => {
    expect(mensualiteKit(350_000, 24)).toBe(17_473);
    expect(ecartEneo(17_473, 18_000)).toBe(-527);
  });
});

describe('diaspora, commerce, protection, prélèvement', () => {
  it('35 500 FCFA = 54,12 €, 4 étapes', () => {
    expect(totalEuro(35_500).toFixed(2)).toBe('54.12');
    const e = etapes('Clinique', 'Visa ···· 4410', 'Paris', new Date(2026, 9, 21, 14, 2).getTime());
    expect(e.map((x) => x.heure)).toEqual(['14:02', '14:02', '14:03', '14:31']);
  });
  it('encaisser 24 500 : net 24 255, modes 1/3/6 fois', () => {
    expect(net(24_500)).toBe(24_255);
    expect(modes(24_500).map((m) => m.valeur)).toEqual([24_500, 8_167, 4_083]);
  });
  it('avance de stock 500 000 à 12 % des ventes AssureMe', () => {
    const j = remboursementJournalier((1_240_000 / 7) * 0.62, 12);
    expect(j).toBe(13_179);
    expect(fraisStock(500_000)).toBe(10_000);
    expect(semainesPourRembourser(500_000, j)).toBe(6);
    expect(avanceDisponible(1_240_000, 0.62, 850_000)).toBe(846_000);
    expect(avanceDisponible(1_240_000, 0.62, 500_000)).toBe(500_000);
  });
  it('protection : prime selon les assurés et le capital', () => {
    const a = [{ prime: 0 }, { prime: 900 }, { prime: 1800 }, { prime: 400 }];
    expect(prime(a, 2_000_000)).toBe(4600);
    expect(prime(a, 1_000_000)).toBe(2300);
  });
  it('prélèvement du 28 : 69 000 sur 520 000, solde versé 451 000', () => {
    const l = [
      { id: 'pass', type: 'pass' as const, libelle: 'Pass', detail: '', montant: partMembrePass(25_000, 0.5) },
      { id: 'ecole', type: 'credit' as const, libelle: 'École', detail: '', montant: 44_000 },
      { id: 'coffre', type: 'coffre' as const, libelle: 'Coffre', detail: '', montant: 12_500 }
    ];
    expect(totalPrelevement(l)).toBe(69_000);
    expect(soldeVerse(520_000, l)).toBe(451_000);
    expect(totalPrelevement(l.map((x) => (x.id === 'ecole' ? { ...x, reporte: true } : x)))).toBe(25_000);
  });
});
