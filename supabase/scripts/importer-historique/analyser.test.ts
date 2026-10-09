import { describe, expect, it } from 'vitest';
import { analyserHistorique, deduireLivres, lireDate, lireDuree } from './analyser.ts';

const TEXTE = `[8/23/26, 1:45:15 AM] Luther: *Report · August 5, 2026 · Luther Kevin K.*

1. *DDEWG* : 1/1 · 1h07
2. *PA* : ~3h27
3. *BR* : 10/7 ch
   • Acts 8-17
4. *CL* :
   • _Jouir du choix de ton conjoint_ (ZTF) : 98/213 pages
   • _Réveil Spirituel Personnel_ (ZTF) : 80/80 pages (+80 today en audio) ✅
5. *PWO* : 2h05

[8/23/26, 1:45:15 AM] Luther: *CR · 6 août 2026 · Luther Kevin K.*

1. *RDQD* : 1/1 · 1h08
2. *PS* : ~2h20
3. *LB* : 1/10 ch
   • Actes 18
4. *LLC* : ~0h45
   • _Jouir du choix de ton conjoint_ (ZTF) : 98/213 pages
   • _La Repentance, clé d’une réelle conversion biblique_ (Samuel & Dorothée Hatzakortzian) : 95/95 pages (+45 auj.) ✅
5. *PAA* : ~1h55

[8/23/26, 1:45:15 AM] Luther: *Report · August 11, 2026 · Luther Kevin K.*

1. *DDEWG* : 3/3 · 1h33 (0h20; 0h16; 0h57)
2. *PA* : ~1h43 + NC
3. *BR* : 105/10 ch, 9h50
   • Romans 1-16 · 1 Corinthians 1-16
4. *CL* : 295p, 7h07
   • _Le chemin de la vie_ (ZTF) : 124/124 pages (+124 today) ✅
5. *PWO* :
6. *MW* : Yes

[9/2/26, 1:04:05 AM] Luther: *Luther Kevin K. - Recap du Mois d'Août 2026*
▫️ RDQD : 34 sessions`;

describe('lecture de l’historique des rapports', () => {
  const r = analyserHistorique(TEXTE);

  it('lit une date en anglais ou en français, une durée avec ou sans ~', () => {
    expect(lireDate('September 8, 2026')).toBe('2026-09-08');
    expect(lireDate('6 août 2026')).toBe('2026-08-06');
    expect(lireDate('1er septembre 2026')).toBe('2026-09-01');
    expect(lireDuree('~0h45')).toEqual({ secondes: 2700, approx: true });
    expect(lireDuree('1h33 (0h20; 0h16)')).toEqual({ secondes: 5580, approx: false });
    expect(lireDuree('0h00 😭')).toEqual({ secondes: 0, approx: false });
  });

  it('un rapport par jour (récapitulatifs ignorés), envoyé à l’heure du message, heure de Toronto', () => {
    expect(r.map((x) => x.jour)).toEqual(['2026-08-05', '2026-08-06', '2026-08-11']);
    expect(r[0].envoyeA).toBe('2026-08-23T05:45:15.000Z'); // 1:45:15 à Toronto (UTC−4)
  });

  it('lit les points : fois, chapitres en trop, temps approximatif, passages, anciens codes français', () => {
    const [a, b, c] = r;
    expect(a.points.map((p) => p.code)).toEqual(['DDEWG', 'PA', 'BR', 'CL', 'PWO']);
    expect(a.points[0]).toMatchObject({ fois: 1, attenduFois: 1, temps: { secondes: 4020, approx: false } });
    expect(a.points[1].temps).toEqual({ secondes: 12420, approx: true });
    expect(a.points[2]).toMatchObject({ chapitres: 10, attenduChapitres: 7, passages: 'Acts 8-17' });
    expect(b.points.map((p) => p.code)).toEqual(['DDEWG', 'PA', 'BR', 'CL', 'PWO']); // RDQD, PS, LB, LLC, PAA
    expect(b.points[2]).toMatchObject({ chapitres: 1, attenduChapitres: 10, passages: 'Actes 18' });
    expect(b.points[3].temps).toEqual({ secondes: 2700, approx: true });
    expect(c.points[0]).toMatchObject({ fois: 3, temps: { secondes: 5580, approx: false } }); // les séances entre parenthèses ne comptent pas en plus
    expect(c.points[2]).toMatchObject({ chapitres: 105, attenduChapitres: 10, temps: { secondes: 35400, approx: false } });
    expect(c.points[3]).toMatchObject({ pages: 295, temps: { secondes: 25620, approx: false } });
    expect(c.points[4].temps).toEqual({ secondes: 0, approx: false });
    expect(c.points[5].code).toBe('MW');
  });

  it('lit les livres de CL, auteur entre parenthèses, « + » et ✅', () => {
    const [a, b] = r;
    expect(a.points[3].livres).toEqual([
      { titre: 'Jouir du choix de ton conjoint', auteur: 'ZTF', cumul: 98, total: 213, plus: null, termine: false },
      { titre: 'Réveil Spirituel Personnel', auteur: 'ZTF', cumul: 80, total: 80, plus: 80, termine: true }
    ]);
    expect(b.points[3].livres[1]).toMatchObject({ titre: 'La Repentance, clé d’une réelle conversion biblique', auteur: 'Samuel & Dorothée Hatzakortzian', cumul: 95, plus: 45 });
  });

  it('déduit les lectures de chaque livre d’un rapport à l’autre', () => {
    const { livres, lectures } = deduireLivres(r);
    expect(livres.find((l) => l.titre.startsWith('Jouir'))).toMatchObject({ depart: 98, premierJour: '2026-08-05', dernierJour: '2026-08-06' });
    expect(livres.find((l) => l.titre.startsWith('Réveil'))).toMatchObject({ depart: 0, termine: true });
    expect(livres.find((l) => l.titre.startsWith('La Repentance'))).toMatchObject({ depart: 50 });
    expect(lectures).toEqual([
      { jour: '2026-08-05', titre: 'Réveil Spirituel Personnel', pages: 80 },
      { jour: '2026-08-06', titre: 'La Repentance, clé d’une réelle conversion biblique', pages: 45 },
      { jour: '2026-08-11', titre: 'Le chemin de la vie', pages: 124 }
    ]);
  });
});
