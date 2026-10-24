import { describe, expect, it } from 'vitest';
import { evaluerCloture, evolution, fmtEvolution, lienWhatsApp, segmentsGras, texteRapport, type Rapport } from './rapport.ts';

const ligne = (libelle: string, billets: number, especes: number, ecart: number | null) => ({ cle: libelle, libelle, billets, colis: 0, especes, total: especes, ecart });
const rapport = (extra: Partial<Rapport> = {}): Rapport => ({
  gareId: 'mvan', gareNom: 'Mvan', ville: 'Yaoundé', jour: '2026-11-03', genereA: new Date('2026-11-03T19:05:00').getTime(), superviseur: 'Abdou',
  recette: 1_284_500, recetteBillets: 1_278_500, recetteColis: 6000, billets: 305, evolutionPct: 9, reference: 'vs mardi dernier',
  guichets: [ligne('Fatou · G1', 112, 481_000, -1500), ligne('Joseph · G2', 64, 302_000, 0)], convoyeurs: ligne('Convoyeurs', 31, 106_000, null), enLigne: ligne('En ligne', 0, 0, null),
  departs: { total: 14, partis: 14, annules: 0, restants: 0, retards: [{ heure: '08:00', vers: 'Douala', retardMin: 15 }] },
  remplissagePct: 86, parHeure: [], pic: null, caisses: { total: 2, ouvertes: 0, aValider: 0, validees: 2, bloquees: 0, ecartTotal: -1500, ecarts: [{ agent: 'Fatou', montant: -1500 }] },
  colis: { envoyes: 46, enAttente: 2 }, incidents: ['1 scan refusé'], reserves: [], ...extra
});

describe('texte WhatsApp du rapport', () => {
  const t = texteRapport(rapport());
  it('contient recette, billets, bus, remplissage, écarts, colis, retards, incidents et la signature', () => {
    expect(t).toContain('*Rapport du soir · Mvan*'); expect(t).toContain('mardi 3 novembre · 19:05');
    expect(t).toContain('*Recette* 1 284 500 FCFA (+9 % vs mardi dernier)'); expect(t).toContain('305 billets · 14/14 bus partis · remplissage 86 %');
    expect(t).toContain('Fatou · G1 : 112 billets · 481 000 F espèces · écart −1 500 F'); expect(t).toContain('Joseph · G2 : 64 billets · 302 000 F espèces · juste');
    expect(t).toContain('*Écarts* Fatou −1 500 F'); expect(t).toContain('*Colis* 46 envoyés, 2 en attente de retrait');
    expect(t).toContain('*Retards* 08:00 Douala +15 min'); expect(t).toContain('*Incidents* 1 scan refusé'); expect(t.endsWith('— Abdou')).toBe(true);
  });
  it('journée vide : pas de bruit, pas de NaN', () => {
    const v = texteRapport(rapport({ recette: 0, billets: 0, evolutionPct: null, guichets: [], convoyeurs: ligne('Convoyeurs', 0, 0, null), departs: { total: 0, partis: 0, annules: 0, restants: 0, retards: [] }, remplissagePct: 0, caisses: { total: 0, ouvertes: 0, aValider: 0, validees: 0, bloquees: 0, ecartTotal: 0, ecarts: [] }, colis: { envoyes: 0, enAttente: 0 }, incidents: [] }));
    expect(v).toContain('*Recette* 0 FCFA (pas de référence)'); expect(v).toContain('*Écarts* aucun'); expect(v).not.toMatch(/NaN|undefined/); expect(v).not.toContain('Retards'); expect(v).not.toContain('Convoyeurs');
  });
  it('signale les réserves et les caisses non clôturées', () => {
    const v = texteRapport(rapport({ guichets: [ligne('Fatou · G1', 3, 20_000, null)], reserves: ['1 clôture à valider'] }));
    expect(v).toContain('caisse non clôturée'); expect(v).toContain('*Réserves* 1 clôture à valider');
  });
});
describe('partage WhatsApp', () => {
  it('lien wa.me avec texte encodé, avec ou sans numéro', () => {
    expect(lienWhatsApp('Bonjour *Luther*\n1 000 F')).toBe('https://wa.me/?text=Bonjour%20*Luther*%0A1%20000%20F');
    expect(lienWhatsApp('ok', '+237 670 00 01 10')).toBe('https://wa.me/237670000110?text=ok');
  });
  it('découpe le gras sans HTML', () => {
    expect(segmentsGras('*Recette* 10 F')).toEqual([{ t: 'Recette', gras: true }, { t: ' 10 F', gras: false }]); expect(segmentsGras('5 * 3')).toEqual([{ t: '5 * 3', gras: false }]);
  });
});
describe('évolution et clôture', () => {
  it('évolution : pourcentage arrondi, null sans référence', () => {
    expect(evolution(1_284_500, 1_178_400)).toBe(9); expect(evolution(100, 0)).toBeNull(); expect(fmtEvolution(-4)).toBe('−4 %'); expect(fmtEvolution(null)).toBe('pas de référence');
  });
  it('règle cloture : tardive après 20:00 seulement quand la règle est active', () => {
    expect(evaluerCloture(19 * 60 + 59, true)).toMatchObject({ tardive: false, retardMin: 0, limite: '20:00' });
    expect(evaluerCloture(20 * 60, true).tardive).toBe(false); expect(evaluerCloture(20 * 60 + 12, true)).toMatchObject({ tardive: true, retardMin: 12 });
    expect(evaluerCloture(22 * 60, false).tardive).toBe(false);
  });
});
