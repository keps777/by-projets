import { describe, it, expect } from 'vitest';
import { occurrencesEntre, decrire, type Regle } from './recurrence.ts';
import { disponibilite, prochainLibreApres, prochainLibreAvant, journeeTresChargee } from './disponibilite.ts';
import { lancer, pause, reprendre, terminer, ecouleS, remplissage, estArrive } from './minuteur.ts';
import { LIVRES, trouverLivre, validerPassage, compterChapitres, formaterPassages } from './bible.ts';
import type { Creneau } from './types.ts';

describe('récurrences', () => {
  it('ce jour seulement', () => {
    const r: Regle = { frequence: 'une_fois', debut: '2026-10-08', fin: { type: 'aucune' } };
    expect(occurrencesEntre(r, '2026-10-01', '2026-10-31')).toEqual(['2026-10-08']);
    expect(occurrencesEntre(r, '2026-10-09', '2026-10-31')).toEqual([]);
  });
  it('tous les jours, avec une fin', () => {
    const r: Regle = { frequence: 'quotidien', debut: '2026-10-29', fin: { type: 'fois', fois: 4 } };
    expect(occurrencesEntre(r, '2026-10-01', '2026-12-31')).toEqual(['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
    const s: Regle = { frequence: 'quotidien', debut: '2026-10-29', fin: { type: 'date', date: '2026-10-31' } };
    expect(occurrencesEntre(s, '2026-10-01', '2026-12-31')).toHaveLength(3);
  });
  it('chaque semaine, plusieurs jours : 5 fois par semaine', () => {
    const r: Regle = { frequence: 'hebdo', debut: '2026-10-05', jours: [0, 1, 2, 3, 4], fin: { type: 'aucune' } };
    expect(occurrencesEntre(r, '2026-10-05', '2026-10-11')).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09']);
    expect(occurrencesEntre(r, '2026-10-05', '2026-10-31')).toHaveLength(20);
  });
  it('chaque semaine : ne commence pas avant le jour de début', () => {
    const r: Regle = { frequence: 'hebdo', debut: '2026-10-08', jours: [0, 3], fin: { type: 'aucune' } };
    expect(occurrencesEntre(r, '2026-10-01', '2026-10-16')).toEqual(['2026-10-08', '2026-10-12', '2026-10-15']);
  });
  it('chaque mois : le 8, le 2ᵉ jeudi, le dernier vendredi, et le 31 plafonné', () => {
    const jour: Regle = { frequence: 'mensuel', debut: '2026-10-08', mensuel: { mode: 'jour_du_mois', jour: 8 }, fin: { type: 'aucune' } };
    expect(occurrencesEntre(jour, '2026-10-01', '2026-12-31')).toEqual(['2026-10-08', '2026-11-08', '2026-12-08']);
    const rang: Regle = { frequence: 'mensuel', debut: '2026-10-08', mensuel: { mode: 'rang', rang: 2, jour: 3 }, fin: { type: 'aucune' } };
    expect(occurrencesEntre(rang, '2026-10-01', '2026-12-31')).toEqual(['2026-10-08', '2026-11-12', '2026-12-10']);
    const dernier: Regle = { frequence: 'mensuel', debut: '2026-10-01', mensuel: { mode: 'rang', rang: 5, jour: 4 }, fin: { type: 'aucune' } };
    expect(occurrencesEntre(dernier, '2026-10-01', '2026-11-30')).toEqual(['2026-10-30', '2026-11-27']);
    const trente1: Regle = { frequence: 'mensuel', debut: '2026-10-31', mensuel: { mode: 'jour_du_mois', jour: 31 }, fin: { type: 'aucune' } };
    expect(occurrencesEntre(trente1, '2026-10-01', '2026-12-31')).toEqual(['2026-10-31', '2026-11-30', '2026-12-31']);
  });
  it('décrit la règle en français', () => {
    expect(decrire({ frequence: 'hebdo', debut: '2026-10-08', jours: [3], fin: { type: 'aucune' } })).toBe('chaque jeudi');
    expect(decrire({ frequence: 'hebdo', debut: '2026-10-05', jours: [0, 2, 4], fin: { type: 'aucune' } })).toBe('3 fois par semaine (lun., mer., ven.)');
    expect(decrire({ frequence: 'mensuel', debut: '2026-10-08', mensuel: { mode: 'rang', rang: 2, jour: 3 }, fin: { type: 'aucune' } })).toBe('le 2ᵉ jeudi du mois');
    expect(decrire({ frequence: 'une_fois', debut: '2026-10-08', fin: { type: 'aucune' } })).toBe('ce jour seulement');
  });
});

describe('disponibilité', () => {
  const j: Creneau[] = [
    { debut: 1095, fin: 1170, titre: 'Sortie dans le quartier' }, { debut: 1185, fin: 1230, titre: 'Prière avec les frères' },
    { debut: 1230, fin: 1275, titre: 'Lecture à deux' }, { debut: 1275, fin: 1290, titre: 'Rapport du jour' }, { debut: 1290, fin: 1310, titre: 'RDQD du soir' },
    { debut: 450, fin: 510, titre: 'Libre le matin ?' }
  ];
  it('libre : annonce jusqu’à quand', () => {
    const d = disponibilite(j, 1020, 60);
    expect(d.libre).toBe(true);
    expect(d.libreJusqua).toBe(1095);
  });
  it('occupé : nomme la tâche et propose le plus proche après et avant', () => {
    const d = disponibilite(j, 1140, 45);
    expect(d.libre).toBe(false);
    expect(d.occupePar?.titre).toBe('Sortie dans le quartier');
    expect(d.apres).toBe(1310);
    expect(d.avant).toBe(1050);
  });
  it('trouve un créneau sans dépasser minuit', () => {
    expect(prochainLibreApres(j, 1380, 90)).toBeNull();
    expect(prochainLibreAvant(j, 10, 30)).toBe(10);
  });
  it('alerte quand la journée dépasse 12 h', () => {
    expect(journeeTresChargee([{ debut: 300, fin: 1100, titre: 'x' }])).toBe(true);
    expect(journeeTresChargee(j)).toBe(false);
  });
});

describe('minuteur par horodatage', () => {
  const T0 = 1_700_000_000_000;
  it('compte le temps, pauses déduites, même après une longue absence', () => {
    let m = lancer(T0);
    expect(ecouleS(m, T0 + 600_000)).toBe(600);
    m = pause(m, T0 + 600_000);
    expect(ecouleS(m, T0 + 3_600_000)).toBe(600);
    m = reprendre(m, T0 + 1_200_000);
    expect(ecouleS(m, T0 + 1_500_000)).toBe(900);
    m = terminer(m, T0 + 1_800_000);
    expect(ecouleS(m, T0 + 9_999_999)).toBe(1200);
    expect(m.etat).toBe('faite');
  });
  it('relance avec du temps déjà acquis et se remplit', () => {
    const m = lancer(T0, 1200);
    expect(ecouleS(m, T0)).toBe(1200);
    expect(remplissage(m, T0, 1800)).toBeCloseTo(0.667, 2);
    expect(estArrive(m, T0 + 600_000, 1800)).toBe(true);
  });
});

describe('Bible', () => {
  it('compte 66 livres et 1189 chapitres', () => {
    expect(LIVRES).toHaveLength(66);
    expect(LIVRES.reduce((s, l) => s + l.chapitres, 0)).toBe(1189);
  });
  it('reconnaît les livres sans accents ni majuscules', () => {
    expect(trouverLivre('matthieu')?.abrev).toBe('Mt');
    expect(trouverLivre('Luc')?.nom).toBe('Luc');
    expect(trouverLivre('1 cor')?.nom).toBe('1 Corinthiens');
    expect(trouverLivre('cor')).toBeUndefined();
    expect(trouverLivre('1 co')?.nom).toBe('1 Corinthiens');
    expect(trouverLivre('esaie')?.nom).toBe('Ésaïe');
  });
  it('valide les passages et additionne les chapitres', () => {
    expect(validerPassage('Matthieu', 8, 10)).toEqual({ ok: true, passage: { livre: 'Matthieu', de: 8, a: 10 } });
    expect(validerPassage('Matthieu', 8, 40)).toEqual({ ok: false, erreur: 'chapitre_invalide' });
    expect(validerPassage('Matthieu', 10, 8)).toEqual({ ok: false, erreur: 'ordre_inverse' });
    expect(validerPassage('Zzz', 1, 1)).toEqual({ ok: false, erreur: 'livre_inconnu' });
    const ps = [{ livre: 'Matthieu', de: 8, a: 10 }, { livre: 'Luc', de: 22, a: 22 }];
    expect(compterChapitres(ps)).toBe(4);
    expect(formaterPassages(ps)).toBe('Matthieu 8–10 · Luc 22');
    expect(formaterPassages(ps, true)).toBe('Mt 8–10 · Lc 22');
  });
});

import { lirePassages, NB_LIVRES_AT } from './bible.ts';

describe('lecture de références écrites à la main', () => {
  it('relit les passages, les formes courtes et les séparateurs variés', () => {
    expect(lirePassages('Matthieu 8–10 · Luc 22')).toEqual([{ livre: 'Matthieu', de: 8, a: 10 }, { livre: 'Luc', de: 22, a: 22 }]);
    expect(lirePassages('Jn 3; Ps 23, 1 Co 13-14')).toEqual([{ livre: 'Jean', de: 3, a: 3 }, { livre: 'Psaumes', de: 23, a: 23 }, { livre: '1 Corinthiens', de: 13, a: 14 }]);
  });
  it('ignore ce qu’on ne comprend pas ou qui sort du livre', () => {
    expect(lirePassages('bientôt · Jude 5 · Marc 2')).toEqual([{ livre: 'Marc', de: 2, a: 2 }]);
    expect(lirePassages('')).toEqual([]);
  });
  it('les 39 premiers livres sont l’Ancien Testament', () => {
    expect(LIVRES[NB_LIVRES_AT - 1].nom).toBe('Malachie');
    expect(LIVRES[NB_LIVRES_AT].nom).toBe('Matthieu');
  });
});
