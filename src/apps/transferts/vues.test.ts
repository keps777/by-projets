import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { echeanceDe } from '../../core/regles.ts';
import { droitDe } from '../../domain/marche.ts';
import { dernierTransfert, transferer } from '../../domain/transfert.ts';
import { actionsErreur, apercuRecu, casConnu, chaineFait, designation, etatListe, lieAuCompte, motifConnu, resumeDroit, textesErreur } from './vues.ts';

beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const ALEX = 'ACC-0412', CAMILLE = 'ACC-0187';

describe('résumé du droit', () => {
  it('la mini-carte : trajet, jour, vol et heure, statut', () => {
    expect(resumeDroit(app.monde, droitDe('d-812')!)).toMatchObject({ trajet: 'YUL → CDG', jour: 'Lun. 14 déc. 2026', ligne: 'Aérolys 812 · 18:05', statut: 'Détenu', ref: 'NXG-7Q2M' });
    expect(resumeDroit(app.monde, droitDe('d-hav')!)?.statut).toBe('En vente'); expect(resumeDroit(app.monde, droitDe('d-812')!, 'Cédé')?.statut).toBe('Cédé'); expect(resumeDroit(app.monde, { volId: 'v-x', statut: 'detenu', ref: 'X' })).toBeUndefined();
  });
  it('seul un détenteur actuel ou passé est lié au droit', () => {
    const d = droitDe('d-812')!; expect(lieAuCompte(d, ALEX)).toBe(true); expect(lieAuCompte(d, CAMILLE)).toBe(false); transferer('d-812', ALEX, CAMILLE); expect(lieAuCompte(d, ALEX)).toBe(true); expect(lieAuCompte(d, CAMILLE)).toBe(true); expect(lieAuCompte(d, 'ACC-0301')).toBe(false);
  });
});
describe('liste des proches', () => {
  it('l’état se déduit de la connexion et du contenu, ou se force', () => {
    expect(etatListe(null, true, 3, false)).toBe('liste'); expect(etatListe(null, true, 0, false)).toBe('vide'); expect(etatListe(null, false, 3, false)).toBe('horsligne'); expect(etatListe(null, true, 3, true)).toBe('chargement');
    expect(etatListe('vide', true, 3, false)).toBe('vide'); expect(etatListe('horsligne', true, 3, false)).toBe('horsligne'); expect(etatListe('chargement', false, 0, false)).toBe('chargement'); expect(etatListe('n’importe quoi', true, 3, false)).toBe('liste');
  });
  it('« Ce proche » quand le nom est inconnu', () => { expect(designation('Marc T.')).toEqual({ sujet: 'Marc T.', complement: 'Marc T.' }); expect(designation('Ce proche').complement).toBe('ce proche'); });
});
describe('textes d’erreur', () => {
  it('l’échec technique reprend la maquette', () => {
    expect(textesErreur('technique', { versNom: 'Léa A.' })).toEqual({ titre: 'Le transfert n’a pas abouti', texte1: 'Rien n’a changé : ce droit est toujours à vous et Léa A. n’a reçu aucun message.', texte2: 'Réessayer ne peut pas transférer le droit deux fois.', technique: true });
  });
  it('droit vendu, échéance passée', () => {
    expect(textesErreur('vendu', { versNom: 'Léa A.' })).toMatchObject({ titre: 'Ce droit n’est plus disponible', texte2: 'Un droit ne peut être transféré que s’il est détenu, non nommé et avant l’échéance.' }); expect(textesErreur('vendu', { versNom: 'Léa A.' }).texte1).toContain('rien n’a été envoyé à Léa A.');
    const t = textesErreur('echeance', { versNom: 'Léa A.', echeance: echeanceDe(Date.parse('2026-12-14T18:05')) }); expect(t.titre).toBe('L’échéance est passée'); expect(t.texte1).toBe('Le 13 déc. 18:05 est passé : plus aucune transaction n’est possible sur ce billet.'); expect(t.texte2).toBe('Rien n’a été transféré et Léa A. n’a reçu aucun message.');
  });
  it('chaque motif de refus a son titre ; réseau, destinataire et solde aussi ; rien de technique hors incident', () => {
    expect(textesErreur('vendu', { motif: 'en_vente' }).titre).toBe('Ce droit est en vente'); expect(textesErreur('vendu', { motif: 'nomme' }).titre).toBe('Le voyageur est déjà nommé'); expect(textesErreur('vendu', { motif: 'gele' }).titre).toBe('Ce droit est gelé'); expect(textesErreur('vendu', { motif: 'autre' }).titre).toBe('Ce droit n’est pas transférable');
    expect(textesErreur('vendu', { motif: 'nomme' }).texte1).toBe('Le billet est nominatif : il ne peut plus être transféré ni revendu. Rien n’a été transféré.'); expect(textesErreur('vendu', { motif: 'nomme', versNom: 'Léa A.' }).texte1).toMatch(/Rien n’a été transféré et rien n’a été envoyé à Léa A\.$/);
    expect(textesErreur('reseau', { versNom: 'Léa A.' }).texte1).toMatch(/exige une connexion.*Léa A\. n’a reçu aucun message/); expect(textesErreur('destinataire', { versNom: 'Léa A.' }).texte1).toMatch(/compte de Léa A\. n’est pas actif/); expect(textesErreur('solde').titre).toBe('Solde NexG insuffisant');
    for (const c of ['reseau', 'echeance', 'destinataire', 'solde', 'vendu'] as const) expect(textesErreur(c).technique).toBe(false);
  });
  it('les actions proposées selon le cas', () => {
    expect(actionsErreur('technique')).toEqual({ principale: 'reessayer', secondaire: 'billet' }); expect(actionsErreur('reseau').principale).toBe('reessayer'); expect(actionsErreur('destinataire').principale).toBe('choisir'); expect(actionsErreur('echeance')).toEqual({ principale: 'billet' });
    expect(actionsErreur('vendu')).toEqual({ principale: 'portefeuille' }); expect(actionsErreur('vendu', 'en_vente')).toEqual({ principale: 'billet' });
  });
  it('?cas= et ?motif= : seulement des valeurs connues', () => { expect(casConnu('reseau')).toBe('reseau'); expect(casConnu('pirate')).toBeUndefined(); expect(casConnu(null)).toBeUndefined(); expect(motifConnu('nomme')).toBe('nomme'); expect(motifConnu('x')).toBeUndefined(); });
});
describe('transfert effectué', () => {
  it('la chaîne de détention : l’historique, le transfert mis en avant, l’échéance, le départ', () => {
    const d = droitDe('d-812')!; const dep = Date.parse('2026-12-14T18:05'); transferer('d-812', ALEX, CAMILLE);
    const c = chaineFait(app.monde, d, dep, echeanceDe(dep));
    expect(c.map((e) => [e.kind, e.titre, e.detail])).toEqual([['passe', 'Achat neuf', 'Alex T. · 1\u00a0000\u00a0$'], ['nouveau', 'Transfert (sans vente)', 'Alex T. → Camille T.'], ['echeance', 'Échéance de finalisation', 'Camille T. nomme le voyageur ; ensuite, plus aucune transaction.'], ['depart', 'Départ YUL → CDG', 'Aérolys 812']]);
    expect(c[0].date).toBe('12 janv.'); expect(c[2]).toMatchObject({ date: '13 déc.', heure: '18:05' }); expect(c[3]).toMatchObject({ date: '14 déc.', heure: '18:05' });
  });
  it('l’aperçu reçu par le proche est mot pour mot la notification enregistrée', () => {
    const d = droitDe('d-812')!; const dep = Date.parse('2026-12-14T18:05'); transferer('d-812', ALEX, CAMILLE); const t = dernierTransfert('d-812', ALEX)!;
    const a = apercuRecu(app.monde, t, d, echeanceDe(dep))!; const n = app.monde.notifications.find((x) => x.compteId === CAMILLE && x.type === 'transfert')!;
    expect(a.notifTitre).toBe(n.titre); expect(a.notifTexte).toBe(n.sous); expect(a.courrielTitre).toBe('Alex T. vous a transféré un droit de voyage'); expect(a.courrielLignes).toEqual(['YUL → CDG · lun. 14 déc. 2026 · Aérolys 812', 'Statut : Détenu. À nommer avant le 13 déc. 18:05.']);
  });
});
