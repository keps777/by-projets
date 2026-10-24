import { describe, expect, it } from 'vitest';
import { prixColis } from './colis.ts';
import { ageEnRayon, COMMISSION_RELAIS, distanceBoutique, erreurDestinataire, erreursBoutique, espacerCode, etaCourse, etatOuverture, formaterDistance, formaterTel, gainMensuelLivreur, gainMensuelRelais, heureArrivee, kmCourse, libelleHoraires, normaliserCodeColis, normaliserTel, positionCarte, positionSimulee, type Boutique } from './relais.ts';

const librairie: Boutique = { nom: 'Librairie Ndom', type: 'Librairie', adresse: 'Deïdo', ouverture: 9, fermeture: 18, h24: false, jours: [1, 2, 3, 4, 5, 6], est: 1950, nord: 780 };

describe('tarifs et gains', () => {
  it('les tarifs du noyau colis : S 1 000, M 2 500, L 5 000, moto +1 000, assurance +500', () => {
    expect(prixColis('S', { moto: false, assurance: false })).toBe(1000);
    expect(prixColis('M', { moto: false, assurance: true })).toBe(3000);
    expect(prixColis('L', { moto: true, assurance: true })).toBe(6500);
  });
  it('gain mensuel du relais : 300 F × colis par jour × 26 jours (maquette : 8 colis → 62 400 F)', () => {
    expect(COMMISSION_RELAIS).toBe(300); expect(gainMensuelRelais(8)).toBe(62_400); expect(gainMensuelRelais(0)).toBe(0); expect(gainMensuelRelais(-3)).toBe(0);
  });
  it('gain mensuel du livreur : 1 000 F par course', () => { expect(gainMensuelLivreur(6)).toBe(156_000); expect(gainMensuelLivreur(12)).toBe(312_000); });
});

describe('téléphone camerounais', () => {
  it('accepte les écritures usuelles', () => {
    for (const s of ['677102233', '6 77 10 22 33', '+237 677 10 22 33', '237677102233', '00237-677-10-22-33', '(677) 102 233']) expect(normaliserTel(s), s).toBe('677102233');
  });
  it('refuse les numéros invalides', () => {
    for (const s of ['', '12345', '577102233', '67710223', '6771022334', '+33612345678', '600000000', 'abcdefghi']) expect(normaliserTel(s), s).toBeNull();
  });
  it('formate comme la maquette', () => { expect(formaterTel('677102233')).toBe('6 77 10 22 33'); expect(formaterTel('abc')).toBe('abc'); });
  it('valide le formulaire destinataire', () => {
    expect(erreurDestinataire('Maman', '677102233')).toEqual({});
    expect(erreurDestinataire(' ', '').nom).toBeTruthy(); expect(erreurDestinataire(' ', '').tel).toBeTruthy();
    expect(erreurDestinataire('Maman', '123').tel).toContain('invalide');
  });
});

describe('codes colis', () => {
  it('normalise les saisies du relais', () => {
    for (const s of ['AM-C-9Q2', 'am-c-9q2', 'am c 9q2', 'AMC9Q2', '9q2', ' 9Q2 ']) expect(normaliserCodeColis(s), s).toBe('AM-C-9Q2');
    for (const s of ['', 'AM-C-', 'AM-C-9Q', 'AM-C-9Q22', '9Q-']) expect(normaliserCodeColis(s), s).toBeNull();
  });
  it('espace le code de remise', () => { expect(espacerCode('4819')).toBe('4 8 1 9'); });
});

describe('géographie simulée', () => {
  it('les distances des relais par défaut collent à la maquette', () => {
    const d = (est: number, nord: number) => formaterDistance(distanceBoutique({ ...librairie, est, nord }));
    expect(d(230, 190)).toBe('300 m'); expect(d(520, 730)).toBe('900 m'); expect(d(380, 1350)).toBe('1,4 km'); expect(d(1950, 780)).toBe('2,1 km');
  });
  it('garde les pins dans la carte', () => {
    for (const [e, n] of [[0, 0], [5000, 5000], [-500, -500], [230, 190]]) { const p = positionCarte(e, n); expect(p.x).toBeGreaterThanOrEqual(8); expect(p.x).toBeLessThanOrEqual(92); expect(p.y).toBeGreaterThanOrEqual(52); expect(p.y).toBeLessThanOrEqual(220); }
  });
  it('position simulée stable', () => { expect(positionSimulee('Chez Awa')).toEqual(positionSimulee('Chez Awa')); expect(positionSimulee('Chez Awa')).not.toEqual(positionSimulee('Chez Bako')); });
});

describe('horaires', () => {
  const lundi11h = new Date(2026, 10, 2, 11, 0), lundi16h = new Date(2026, 10, 2, 16, 0), lundi19h = new Date(2026, 10, 2, 19, 0), dimanche = new Date(2026, 10, 1, 11, 0), lundi7h = new Date(2026, 10, 2, 7, 0);
  it('ouvert, ferme bientôt, fermé', () => {
    expect(etatOuverture(librairie, lundi11h)).toMatchObject({ ouvert: true, libelle: 'ouvert', ton: 'ok' });
    expect(etatOuverture(librairie, lundi16h)).toMatchObject({ ouvert: true, libelle: 'ferme 18 h', ton: 'wa' });
    expect(etatOuverture(librairie, lundi19h)).toMatchObject({ ouvert: false, libelle: 'fermé' });
    expect(etatOuverture(librairie, lundi7h)).toMatchObject({ ouvert: false, libelle: 'ouvre 9 h' });
    expect(etatOuverture(librairie, dimanche)).toMatchObject({ ouvert: false, libelle: 'fermé aujourd’hui' });
  });
  it('24 h/24', () => { expect(etatOuverture({ ...librairie, h24: true }, lundi19h)).toMatchObject({ ouvert: true, libelle: '24 h' }); expect(libelleHoraires({ ...librairie, h24: true })).toBe('24 h/24'); });
  it('libellé', () => { expect(libelleHoraires(librairie)).toBe('9 h – 18 h · lundi à samedi'); });
  it('valide la fiche boutique', () => {
    const ok = { nom: 'Chez Mado', adresse: 'Akwa, rue Joffre', ouverture: 7, fermeture: 21, h24: false, jours: [1, 2, 3, 4, 5, 6] };
    expect(erreursBoutique(ok)).toEqual({});
    expect(erreursBoutique({ ...ok, nom: 'x' }).nom).toBeTruthy(); expect(erreursBoutique({ ...ok, adresse: 'Akwa' }).adresse).toBeTruthy();
    expect(erreursBoutique({ ...ok, ouverture: 9, fermeture: 12 }).horaires).toBeTruthy(); expect(erreursBoutique({ ...ok, jours: [1, 2, 3] }).horaires).toBeTruthy();
    expect(erreursBoutique({ ...ok, h24: true, jours: [] })).toEqual({});
  });
});

describe('colis en rayon', () => {
  const t = new Date(2026, 10, 3, 12, 0).getTime(), jours = (n: number) => t - n * 86_400_000;
  it('âge et alerte', () => {
    expect(ageEnRayon(jours(0), t)).toMatchObject({ pl: 'J+0', ton: 'ok', texte: 'aujourd’hui' });
    expect(ageEnRayon(jours(1), t)).toMatchObject({ pl: 'J+1', ton: 'ok', texte: 'hier' });
    expect(ageEnRayon(jours(3), t)).toMatchObject({ pl: 'J+3', ton: 'wa' });
    expect(ageEnRayon(jours(6), t)).toMatchObject({ pl: 'J+6', ton: 'er', aRetourner: false });
    expect(ageEnRayon(jours(7), t)).toMatchObject({ pl: 'à rendre', aRetourner: true });
  });
});

describe('livraison moto', () => {
  it('ETA de la maquette pour 6 km : 14, 6, 1 min puis remis', () => {
    expect([0, 1, 2, 3].map((e) => etaCourse(6, e))).toEqual([14, 6, 1, 0]);
  });
  it('km par quartier', () => { expect(kmCourse('Bonamoussadi')).toBe(6); expect(kmCourse('Inconnu')).toBe(5); expect(kmCourse(undefined)).toBe(5); });
  it('heure d’arrivée du bus', () => { expect(heureArrivee('08:00', 210)).toBe('11:30'); expect(heureArrivee('22:30', 250)).toBe('02:40'); expect(heureArrivee('08:00', 210, 20)).toBe('11:50'); });
});
