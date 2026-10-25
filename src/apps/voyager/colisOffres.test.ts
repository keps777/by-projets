import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { prixColisLigne } from '../../core/prixColis.ts';
import { filtrer, filtresVides } from '../../core/recherche.ts';
import { aujourdhui } from '../../data/store.svelte.ts';
import { ajouterJours } from '../../core/dates.ts';
import { lienEnvoiColis, offresColis, phraseColis } from './colisOffres.ts';
import { offresDuJour } from './offres.ts';

beforeEach(() => reinitialiser());
const demain = () => ajouterJours(aujourdhui(), 1);
const jour = () => offresDuJour(demain(), 'Yaoundé', 'Douala');

describe('mode colis de l’accueil', () => {
  it('garde tous les bus et seulement les covoiturages qui prennent un S', () => {
    const base = jour(), bus = base.filter((o) => o.genre === 'bus').length, cv = base.filter((o) => o.genre === 'cv').length;
    expect(bus).toBeGreaterThan(0); expect(cv).toBeGreaterThan(0);
    const s = offresColis(base, 'S'), m = offresColis(base, 'M');
    expect(s).toHaveLength(bus + cv);
    expect(m.filter((o) => o.genre === 'cv')).toHaveLength(0); expect(m.filter((o) => o.genre === 'bus')).toHaveLength(bus);
    expect(offresColis(base, 'L').every((o) => o.genre === 'bus')).toBe(true);
  });
  it('un covoiturage qui annonce colisOk prend M, un autre qui refuse ne prend rien', () => {
    const [a, b] = app.monde.covoits.filter((c) => c.jour === demain() && c.de === 'Yaoundé' && c.vers === 'Douala');
    (a as { colisOk?: boolean }).colisOk = true; (b as { colisOk?: boolean }).colisOk = false;
    const m = offresColis(jour(), 'M'), s = offresColis(jour(), 'S');
    expect(m.some((o) => o.covoitId === a.id)).toBe(true); expect(s.some((o) => o.covoitId === b.id)).toBe(false);
  });
  it('le prix affiché est celui du colis sur la ligne, plus bas sur une ligne plus rapide', () => {
    const m = offresColis(jour(), 'M').filter((o) => o.genre === 'bus');
    for (const o of m) { expect(o.prix).toBe(prixColisLigne('M', o.dureeMin)); expect(o.prix).toBeLessThan(5000); expect(o.complet).toBe(false); }
    const rapide = [...m].sort((a, b) => a.dureeMin - b.dureeMin)[0], lent = [...m].sort((a, b) => b.dureeMin - a.dureeMin)[0];
    expect(rapide.dureeMin).toBeLessThan(lent.dureeMin); expect(rapide.prix).toBeLessThan(lent.prix);
    const l = offresColis(jour(), 'L').filter((o) => o.genre === 'bus')[0]; expect(l.prix).toBeGreaterThan(m[0].prix);
  });
  it('les filtres restent applicables sur les offres de colis', () => {
    const m = offresColis(jour(), 'M');
    expect(filtrer(m, { ...filtresVides(), genre: 'bus' }).every((o) => o.genre === 'bus')).toBe(true);
  });
  it('phrase et lien d’envoi', () => {
    const o = offresColis(jour(), 'M').find((x) => x.genre === 'bus' && x.dureeMin === 195)!;
    expect(phraseColis(o, 'M', 'Douala')).toBe('colis M · livré à Douala dans 3 h 15');
    expect(lienEnvoiColis(o, 'M')).toBe(`/colis/envoi?depart=${o.departId}&taille=M`);
  });
});
