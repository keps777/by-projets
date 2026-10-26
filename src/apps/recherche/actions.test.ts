import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { acheter, offresDuVol } from '../../domain/marche.ts';
import { aLePass, alerteActive, basculerAlerte, envoyerMessageAgence, lignesDuTrajet, memoriserRecherche, offresDeAgence, oublierRecentes, preparerRecentes, recentes, rechercheInitiale, trouverOffre } from './actions.ts';
import { rechercheVide, type Recherche } from './params.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', SOPHIE = 'ACC-0301', INES = 'ACC-0402';
const cdg = (p: Partial<Recherche> = {}): Recherche => ({ ...rechercheVide('YUL'), vers: 'CDG', jour: '2026-12-18', ...p });

describe('lignes d’un trajet', () => {
  it('toutes les offres des vols du trajet, issues du marché', () => {
    const l = lignesDuTrajet(cdg(), false); expect(l).toHaveLength(9); expect(l.filter((x) => x.vol.numero === 'AE 816').map((x) => x.offre.prix)).toEqual([1500, 1520, 1610, 1700, 2050]);
  });
  it('applique les sources décochées', () => { expect(lignesDuTrajet(cdg({ sources: ['agence'] }), false).map((x) => x.offre.id)).toEqual(['agence:oa-1']); });
  it('le Pass montre le drop', () => {
    const r = cdg({ vers: 'PUJ', jour: '2027-02-21' }); expect(lignesDuTrajet(r, false).find((x) => x.offre.type === 'drop')!.offre.masquee).toBe(true); expect(lignesDuTrajet(r, true).find((x) => x.offre.type === 'drop')!.offre.masquee).toBe(false);
    expect(aLePass(ALEX)).toBe(true); expect(aLePass(SOPHIE)).toBe(false); expect(aLePass(null)).toBe(false);
  });
});

describe('retrouver une offre', () => {
  it('une revente : droit, vendeur, pas la mienne', () => {
    const r = trouverOffre('revente:d-r816', INES); expect(r.ok).toBe(true); if (r.ok) { expect(r.offre.prix).toBe(1500); expect(r.vol.numero).toBe('AE 816'); expect(r.droit!.id).toBe('d-r816'); expect(r.laMienne).toBe(false); }
  });
  it('mon annonce est reconnue', () => { const r = trouverOffre('revente:d-hav', ALEX); expect(r.ok && r.laMienne).toBe(true); expect(trouverOffre('revente:d-hav', INES)).toMatchObject({ ok: true, laMienne: false }); });
  it('neuf et agence', () => {
    expect(trouverOffre('neuf:v-ae816', null)).toMatchObject({ ok: true, offre: { prix: 2050, type: 'neuf' } }); const a = trouverOffre('agence:oa-1', null);
    expect(a.ok && a.agence!.nom).toBe('Agence Horizon'); expect(a.ok && a.offre.prix).toBe(1690);
  });
  it('une offre déjà vendue : raison claire et vol pour rebondir', () => {
    acheter(offresDuVol('v-ae816').find((o) => o.id === 'revente:d-r816')!, ALEX); const r = trouverOffre('revente:d-r816', INES);
    expect(r).toMatchObject({ ok: false, raison: 'vendue' }); expect(!r.ok && r.message).toMatch(/vendu/); expect(!r.ok && r.vol?.id).toBe('v-ae816');
  });
  it('identifiants inconnus ou mal formés', () => { for (const id of ['', 'x', 'revente:zzz', 'neuf:v-nexiste-pas', 'agence:oa-99', 'drop:nope', 'autre:d-r816']) expect(trouverOffre(id, null), id).toMatchObject({ ok: false, raison: 'inconnue' }); });
  it('un drop n’est pas une offre à acheter ici', () => {
    expect(trouverOffre('drop:drop-128', SOPHIE)).toMatchObject({ ok: false, raison: 'drop' }); expect(trouverOffre('drop:drop-128', SOPHIE).ok === false && (trouverOffre('drop:drop-128', SOPHIE) as { message: string }).message).toMatch(/Pass/);
    expect((trouverOffre('drop:drop-128', ALEX) as { message: string }).message).toMatch(/écran du drop/);
  });
});

describe('recherches récentes', () => {
  it('commence par les deux de la maquette, sans écrire dans un dérivé', () => { expect(recentes().map((r) => r.vers)).toEqual(['PUJ', 'PPT']); expect(app.tranches.recherche).toBeUndefined(); preparerRecentes(); expect(app.tranches.recherche).toBeDefined(); });
  it('mémorise en tête, sans doublon, puis efface', () => {
    preparerRecentes(); memoriserRecherche(cdg()); memoriserRecherche(cdg({ vers: 'PUJ', jour: '2027-02-21', n: 2 })); expect(recentes().map((r) => r.vers)).toEqual(['PUJ', 'CDG', 'PPT']); memoriserRecherche(cdg()); expect(recentes().map((r) => r.vers)).toEqual(['CDG', 'PUJ', 'PPT']);
    oublierRecentes(); expect(recentes()).toEqual([]);
  });
  it('part de l’aéroport du compte', () => { expect(rechercheInitiale(ALEX).de).toBe('YUL'); expect(rechercheInitiale(null).de).toBe('YUL'); app.monde.comptes.find((c) => c.id === ALEX)!.aeroport = 'LAX'; expect(rechercheInitiale(ALEX).de).toBe('LAX'); });
});

describe('alerte de prix', () => {
  it('crée l’alerte puis la retire', () => {
    const vol = app.monde.vols.find((v) => v.id === 'v-ae816')!, n = app.monde.alertes.length;
    expect(alerteActive(INES, vol, 1500)).toBe(false); expect(basculerAlerte(INES, vol, 1500)).toBe(true); expect(app.monde.alertes).toHaveLength(n + 1); expect(app.monde.alertes.at(-1)).toMatchObject({ compteId: INES, de: 'YUL', vers: 'CDG', prixMax: 1500, actif: true });
    expect(alerteActive(INES, vol, 1500)).toBe(true); expect(alerteActive(ALEX, vol, 1500)).toBe(false); expect(alerteActive(null, vol, 1500)).toBe(false); expect(basculerAlerte(INES, vol, 1500)).toBe(false); expect(app.monde.alertes).toHaveLength(n);
  });
});

describe('vitrine d’agence', () => {
  it('liste les offres de l’agence, par départ', () => { expect(offresDeAgence('horizon', false).map((l) => l.offre.id)).toEqual(['agence:oa-2', 'agence:oa-1']); expect(offresDeAgence('cap-nord', false).map((l) => l.offre.id)).toEqual(['agence:oa-3']); expect(offresDeAgence('inconnue', false)).toEqual([]); });
  it('message à l’agence : refuse le vide et l’absence de compte, sinon notifie', () => {
    const ag = { id: 'horizon', nom: 'Agence Horizon' }; expect(envoyerMessageAgence(ALEX, ag, '   ')).toEqual({ ok: false, raison: 'vide' }); expect(envoyerMessageAgence(null, ag, 'Bonjour')).toEqual({ ok: false, raison: 'compte' });
    const avant = app.monde.notifications.length; expect(envoyerMessageAgence(ALEX, ag, ' Bonjour ')).toEqual({ ok: true }); expect(app.monde.notifications).toHaveLength(avant + 1); expect(app.monde.notifications[0]).toMatchObject({ compteId: ALEX, titre: 'Message envoyé à Agence Horizon' });
    expect((app.tranches.recherche as { messages: { texte: string }[] }).messages.at(-1)!.texte).toBe('Bonjour');
  });
});
