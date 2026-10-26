import { beforeEach, describe, expect, it } from 'vitest';
import { app, maintenant } from '../data/store.svelte.ts';
import { etatInitial } from '../data/seed.ts';
import { acheter, offresDuVol } from './marche.ts';
import { acheterDrop, etatDrop, prochainsDrops } from './drop.ts';
import { ajouterOffreAgence, annulerDrop, cloreDrop, creerDrop, derniereVerification, ErreurAdmin, lignesDrops, offresPubliees, ouvrirDrop, reactiverAgence, retirerOffreAgence, statutAgence, suspendreAgence, validerDrop, verifierAgence, type EntreeDrop } from './admin-drops.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ADM = 'adm-01', ALEX = 'ACC-0412', H = 3_600_000;
const code = (f: () => unknown) => { try { f(); } catch (e) { return e instanceof ErreurAdmin ? e.code : `autre:${(e as Error).message}`; } return 'aucune'; };
/** Un drop valide sur le vol NO 905 (prix équivalent neuf 940 $) : s'ouvre dans 2 h, dure 6 h. */
const entree = (o: Partial<EntreeDrop> = {}): EntreeDrop => ({ volId: 'v-no905', prixMembre: 250, places: 8, ouvre: maintenant() + 2 * H, fin: maintenant() + 8 * H, ...o });
const derniere = () => app.monde.audit[0];

describe('validation d’un drop', () => {
  it('un drop valide ne signale rien', () => { expect(validerDrop(entree())).toEqual({}); });
  it('le prix membre doit être inférieur au prix équivalent du vol', () => {
    expect(validerDrop(entree({ prixMembre: 940 })).prixMembre).toMatch(/inférieur au prix équivalent \(940\s\$\)/); expect(validerDrop(entree({ prixMembre: 939 }))).toEqual({});
    expect(validerDrop(entree({ prixMembre: 0 })).prixMembre).toBeDefined(); expect(validerDrop(entree({ prixMembre: 99.5 })).prixMembre).toMatch(/entier/);
  });
  it('1 à 50 places, entières', () => {
    for (const p of [0, 51, 2.5, NaN]) expect(validerDrop(entree({ places: p })).places).toBeDefined(); for (const p of [1, 50]) expect(validerDrop(entree({ places: p })).places).toBeUndefined();
  });
  it('l’ouverture est future, la fin la suit et précède l’échéance du vol', () => {
    expect(validerDrop(entree({ ouvre: maintenant() - 1 })).ouvre).toMatch(/futur/); expect(validerDrop(entree({ ouvre: NaN })).ouvre).toBeDefined();
    expect(validerDrop(entree({ fin: maintenant() + H })).fin).toMatch(/suivre/);
    expect(validerDrop(entree({ fin: Date.parse('2027-03-01T00:00') })).fin).toMatch(/échéance du vol/);
  });
  it('un vol inconnu est refusé', () => { expect(validerDrop(entree({ volId: 'v-xx' })).volId).toBeDefined(); });
});

describe('creerDrop', () => {
  it('crée le drop (numéro suivant, prix équivalent du vol), l’annonce aux membres et consigne', () => {
    const d = creerDrop(ADM, entree());
    expect(d).toMatchObject({ id: 'drop-129', n: 129, volId: 'v-no905', prixMembre: 250, prixEquivalent: 940, places: 8, restantes: 8, servis: [] });
    expect(app.monde.drops.map((x) => x.n)).toEqual([128, 129]); expect(prochainsDrops().some((x) => x.id === 'dv-drop-129' && x.volId === 'v-no905')).toBe(true);
    expect(derniere()).toMatchObject({ acteur: ADM, action: 'Création de drop', cible: 'Drop N° 129', gravite: 'info' }); expect(derniere().detail).toMatch(/8 places/);
  });
  it('refuse un drop invalide (champs en erreur) et ne consigne rien', () => {
    const avant = app.monde.audit.length;
    try { creerDrop(ADM, entree({ prixMembre: 1200, places: 80 })); throw new Error('aucune'); } catch (e) { expect(e).toBeInstanceOf(ErreurAdmin); expect(Object.keys((e as ErreurAdmin).champs).sort()).toEqual(['places', 'prixMembre']); }
    expect(app.monde.drops).toHaveLength(1); expect(app.monde.audit).toHaveLength(avant);
  });
  it('est réservé aux administrateurs', () => { expect(code(() => creerDrop(ALEX, entree()))).toBe('acteur'); expect(code(() => creerDrop('inconnu', entree()))).toBe('acteur'); expect(app.monde.drops).toHaveLength(1); });
  it('un drop planifié n’apparaît pas dans les offres du vol avant son ouverture, puis oui', () => {
    const d = creerDrop(ADM, entree({ volId: 'v-ae816', ouvre: maintenant() + H })); expect(offresDuVol('v-ae816', true).some((o) => o.type === 'drop')).toBe(false);
    expect(() => acheterDrop(d.id, ALEX)).toThrow(/pas encore ouvert/);
    ouvrirDrop(ADM, d.id); expect(offresDuVol('v-ae816', true).find((o) => o.type === 'drop')).toMatchObject({ dropId: d.id, prix: 250, masquee: false });
  });
});

describe('ouvrir, clore, annuler', () => {
  it('ouvrir un drop planifié : ouverture immédiate, annonce retirée, consigné', () => {
    const d = creerDrop(ADM, entree()); expect(etatDrop(d)).toBe('avenir'); ouvrirDrop(ADM, d.id);
    expect(etatDrop(d)).toBe('direct'); expect(prochainsDrops().some((x) => x.id === 'dv-drop-129')).toBe(false); expect(derniere()).toMatchObject({ action: 'Ouverture de drop', cible: 'Drop N° 129', gravite: 'attention' });
    expect(code(() => ouvrirDrop(ADM, d.id))).toBe('etat'); expect(code(() => ouvrirDrop(ADM, 'drop-1'))).toBe('drop');
  });
  it('clore un drop en direct : fin = maintenant, plus d’offre ni d’achat, places déjà prises conservées', () => {
    acheterDrop('drop-128', ALEX); expect(offresDuVol('v-no905', true).some((o) => o.type === 'drop')).toBe(true);
    const d = cloreDrop(ADM, 'drop-128'); expect(etatDrop(d)).toBe('termine'); expect(d.restantes).toBe(2); expect(d.servis).toEqual([ALEX]);
    expect(offresDuVol('v-no905', true).some((o) => o.type === 'drop')).toBe(false); expect(derniere()).toMatchObject({ action: 'Clôture de drop', cible: 'Drop N° 128' }); expect(derniere().detail).toMatch(/4 place\(s\) attribuée\(s\), 2 restante/);
    expect(code(() => cloreDrop(ADM, 'drop-128'))).toBe('etat');
  });
  it('annuler un drop planifié le supprime avec son annonce ; un drop ouvert ne s’annule pas', () => {
    const d = creerDrop(ADM, entree()); annulerDrop(ADM, d.id);
    expect(app.monde.drops.map((x) => x.id)).toEqual(['drop-128']); expect(app.monde.dropsAVenir.some((x) => x.id === 'dv-drop-129')).toBe(false); expect(derniere()).toMatchObject({ action: 'Annulation de drop', cible: 'Drop N° 129', gravite: 'attention' });
    expect(code(() => annulerDrop(ADM, 'drop-128'))).toBe('etat'); expect(code(() => annulerDrop(ADM, 'nexiste-pas'))).toBe('drop'); expect(code(() => annulerDrop(ALEX, 'dv-1'))).toBe('acteur');
  });
  it('annuler une annonce sans lot (prochain drop) la retire', () => { const n = app.monde.dropsAVenir.length; annulerDrop(ADM, 'dv-1'); expect(app.monde.dropsAVenir).toHaveLength(n - 1); expect(derniere().cible).toMatch(/^Drop annoncé \(Europe\)/); });
  it('la liste réunit drops et annonces, du plus récent au plus ancien, avec leur statut', () => {
    creerDrop(ADM, entree({ ouvre: maintenant() + 20 * 24 * H, fin: maintenant() + 21 * 24 * H }));
    const l = lignesDrops(); expect(l[0]).toMatchObject({ n: 129, statut: 'planifie', annonce: false }); expect(l.find((x) => x.id === 'drop-128')).toMatchObject({ statut: 'ouvert', places: 6, restantes: 3, trajet: 'YUL → PUJ' });
    expect(l.filter((x) => x.annonce).map((x) => x.id).sort()).toEqual(['dv-1', 'dv-2', 'dv-3']); expect(l.map((x) => x.ouvre)).toEqual([...l.map((x) => x.ouvre)].sort((a, b) => b - a));
  });
});

describe('agences', () => {
  it('statuts : vérifiée, en vérification, suspendue', () => {
    const a = app.monde.agences[0]; expect(statutAgence(a)).toBe('verifiee'); a.permisVerifie = false; expect(statutAgence(a)).toBe('en_verification'); a.suspendue = true; expect(statutAgence(a)).toBe('suspendue');
  });
  it('vérifier exige les trois contrôles puis marque le permis vérifié (consigné, date de vérification)', () => {
    const a = app.monde.agences[1]; a.permisVerifie = false;
    expect(code(() => verifierAgence(ADM, a.id, { identite: true, permis: true, cautionnement: false }))).toBe('controles'); expect(a.permisVerifie).toBe(false);
    verifierAgence(ADM, a.id, { identite: true, permis: true, cautionnement: true }); expect(a.permisVerifie).toBe(true);
    expect(derniere()).toMatchObject({ action: 'Vérification d’agence', cible: a.nom, gravite: 'info' }); expect(derniereVerification(a)).toBe(derniere().quand);
    expect(code(() => verifierAgence(ADM, a.id, { identite: true, permis: true, cautionnement: true }))).toBe('etat');
  });
  it('suspendre retire les offres de l’agence du marché (motif obligatoire), réactiver les rend', () => {
    expect(offresDuVol('v-no220').some((o) => o.type === 'agence')).toBe(true); const a = app.monde.agences.find((x) => x.id === 'horizon')!; expect(offresPubliees(a)).toBe(2);
    expect(code(() => suspendreAgence(ADM, 'horizon', ' '))).toBe('motif');
    suspendreAgence(ADM, 'horizon', 'Permis expiré (démo)');
    expect(offresDuVol('v-no220').some((o) => o.type === 'agence')).toBe(false); expect(offresDuVol('v-no330').some((o) => o.type === 'agence')).toBe(false); expect(offresPubliees(a)).toBe(0); expect(app.monde.offresAgence).toHaveLength(3);
    expect(derniere()).toMatchObject({ action: 'Suspension d’agence', cible: 'Agence Horizon', gravite: 'critique' }); expect(derniere().detail).toMatch(/Permis expiré \(démo\) · 2 offre\(s\)/);
    expect(offresDuVol('v-no332').some((o) => o.type === 'agence')).toBe(true);
    reactiverAgence(ADM, 'horizon'); expect(offresDuVol('v-no220').some((o) => o.type === 'agence')).toBe(true); expect(derniere().action).toBe('Réactivation d’agence'); expect(code(() => reactiverAgence(ADM, 'horizon'))).toBe('etat');
  });
  it('une offre d’agence déjà affichée ne s’achète plus une fois l’agence suspendue', () => {
    const offre = offresDuVol('v-no220').find((o) => o.type === 'agence')!; suspendreAgence(ADM, 'horizon', 'Contrôle (démo)'); expect(() => acheter(offre, ALEX)).toThrow(/n’est plus disponible/);
  });
  it('ajouter une offre : plafonnée au prix équivalent neuf, une par vol, agence vérifiée et active', () => {
    const neuf = app.monde.vols.find((v) => v.id === 'v-ae816')!.prixNeuf;
    expect(code(() => ajouterOffreAgence(ADM, 'horizon', 'v-ae816', neuf + 1))).toBe('offre'); expect(code(() => ajouterOffreAgence(ADM, 'horizon', 'v-ae816', 0))).toBe('offre'); expect(code(() => ajouterOffreAgence(ADM, 'horizon', 'v-xx', 100))).toBe('vol');
    const o = ajouterOffreAgence(ADM, 'horizon', 'v-ae816', neuf, ' Offre d’essai '); expect(o).toMatchObject({ agenceId: 'horizon', volId: 'v-ae816', prix: neuf, note: 'Offre d’essai' });
    expect(offresDuVol('v-ae816').find((x) => x.type === 'agence')).toMatchObject({ prix: neuf, agenceId: 'horizon' }); expect(derniere()).toMatchObject({ action: 'Ajout d’une offre d’agence', cible: 'Agence Horizon' });
    expect(code(() => ajouterOffreAgence(ADM, 'horizon', 'v-ae816', 100))).toBe('offre');
    suspendreAgence(ADM, 'cap-nord', 'Contrôle'); expect(code(() => ajouterOffreAgence(ADM, 'cap-nord', 'v-ae816', 100))).toBe('etat');
    app.monde.agences.find((a) => a.id === 'horizon')!.permisVerifie = false; expect(code(() => ajouterOffreAgence(ADM, 'horizon', 'v-ae812', 100))).toBe('etat');
  });
  it('refuse l’offre sur un vol dont l’échéance est passée', () => { const v = app.monde.vols.find((x) => x.id === 'v-ae816')!; v.jour = '2026-10-12'; v.heureDepart = '12:00'; expect(code(() => ajouterOffreAgence(ADM, 'horizon', v.id, 100))).toBe('vol'); });
  it('retirer une offre la supprime du marché et consigne', () => {
    retirerOffreAgence(ADM, 'oa-1'); expect(offresDuVol('v-no220').some((o) => o.type === 'agence')).toBe(false); expect(derniere()).toMatchObject({ action: 'Retrait d’une offre d’agence', cible: 'Agence Horizon' }); expect(derniere().detail).toMatch(/NO 220/);
    expect(code(() => retirerOffreAgence(ADM, 'oa-1'))).toBe('offre'); expect(code(() => retirerOffreAgence(ALEX, 'oa-2'))).toBe('acteur');
  });
});
