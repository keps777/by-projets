import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { magasin } from './magasin.svelte.ts';
import { session } from './auth.svelte.ts';
import { horloge } from './temps.svelte.ts';
import { HORAIRE_TYPE } from './horaire-type.ts';
import { assurerHoraireType, horaireTypePose, poserHoraireType, retirerHoraireType, retirerHoraireTypeDefinitivement } from './actions/horaire.ts';
import { blocsDuJour } from './requetes.ts';

const NOW = Date.parse('2026-10-12T13:00:00Z'); // lundi 12 oct., 09:00 à Toronto

describe('horaire type', () => {
  it('chaque jour est couvert de 00 h à 24 h, sans trou (sauf le vendredi après 23 h : pas de lecture)', () => {
    for (let j = 0; j < 7; j++) {
      const blocs = HORAIRE_TYPE.filter((b) => b.jours.includes(j)).sort((a, z) => a.debut - z.debut);
      const couvert = new Array(1440).fill(false);
      for (const b of blocs) for (let m = b.debut; m < b.fin; m++) couvert[m] = true;
      expect(couvert.indexOf(false), `jour ${j}`).toBe(j === 4 ? 23 * 60 : -1);
    }
  });
  it('blocs valides', () => {
    for (const b of HORAIRE_TYPE) { expect(b.fin).toBeGreaterThan(b.debut); expect(b.fin).toBeLessThanOrEqual(1440); expect(b.jours.length).toBeGreaterThan(0); }
    expect(new Set(HORAIRE_TYPE.map((b) => b.titre)).size).toBe(HORAIRE_TYPE.length);
  });

  describe('dans le Fil', () => {
    beforeEach(async () => {
      await magasin.fermer();
      await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
      horloge.maintenant = NOW;
      const stock = new Map<string, string>();
      vi.stubGlobal('localStorage', { getItem: (k: string) => stock.get(k) ?? null, setItem: (k: string, v: string) => void stock.set(k, v), removeItem: (k: string) => void stock.delete(k) });
      await session.demarrer();
    });

    it('pose les blocs du jour, sans rappel, une seule fois', () => {
      expect(poserHoraireType('2026-10-12')).toBe(HORAIRE_TYPE.length);
      expect(horaireTypePose()).toBe(HORAIRE_TYPE.length);
      expect(poserHoraireType('2026-10-12')).toBe(0);
      const lundi = blocsDuJour('2026-10-12').map((b) => b.titre);
      expect(lundi).toContain('Cuisiner pour la semaine');
      expect(lundi).toContain('Jeûne partiel du lundi');
      expect(lundi).toContain('Prière · communion avec Dieu');
      expect(lundi).not.toContain('Nuit de prière · éveillé');
      const vendredi = blocsDuJour('2026-10-16').map((b) => b.titre);
      expect(vendredi).toContain('Nuit de prière · éveillé');
      expect(vendredi).not.toContain('Lecture · littérature chrétienne');
      // Le 1er vendredi du mois (6 nov.) : dons et épargne ; le 2ᵉ lundi (9 nov.) et le dernier (30 nov.) : lessive.
      expect(blocsDuJour('2026-11-06').map((b) => b.titre)).toContain('Dons du mois et épargne (maison, mariage)');
      expect(blocsDuJour('2026-11-13').map((b) => b.titre)).not.toContain('Dons du mois et épargne (maison, mariage)');
      expect(blocsDuJour('2026-11-09').map((b) => b.titre)).toContain('Lessive · laver et sécher (2ᵉ lundi)');
      expect(blocsDuJour('2026-11-30').map((b) => b.titre)).toContain('Lessive · laver et sécher (dernier lundi)');
      expect(blocsDuJour('2026-11-16').map((b) => b.titre).filter((t) => t.startsWith('Lessive'))).toEqual([]);
      expect(magasin.lignes.rappels.filter((r) => r.etat === 'en_attente')).toHaveLength(0);
    });

    it('pose automatique : une seule fois par appareil, jamais après un retrait', () => {
      expect(assurerHoraireType('2026-10-12')).toBe(HORAIRE_TYPE.length);
      expect(assurerHoraireType('2026-10-12')).toBe(0);
      retirerHoraireTypeDefinitivement();
      expect(horaireTypePose()).toBe(0);
      expect(assurerHoraireType('2026-10-12')).toBe(0);
      expect(horaireTypePose()).toBe(0);
    });

    it('retire les séries', () => {
      poserHoraireType('2026-10-12');
      expect(retirerHoraireType()).toBe(HORAIRE_TYPE.length);
      expect(horaireTypePose()).toBe(0);
      expect(blocsDuJour('2026-10-12')).toHaveLength(0);
    });
  });
});
