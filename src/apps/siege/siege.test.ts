import { beforeEach, describe, expect, it } from 'vitest';
import { app, aujourdhui, reinitialiser } from '../../data/store.svelte.ts';
import { ajouterJours } from '../../core/dates.ts';
import { annulerBillet, billetsDe, caisseOuverte, placesLibres, reserver, verifierPin } from '../../domain/actions.ts';
import { optionsLigne, basculerParametre, changerActivation, creerLigne, creerPersonne, departsFuturs, ErreurValidation, fixerPermission, groupeLigne, modifierLigne, modifierPersonne, normaliserTel, permission, pinAleatoire, renouvelerPin, validerPersonne, type FichePersonne } from './actions.ts';
import { etatSiege } from './etat.ts';
import { exporterCsv, lignesCaisses, lignesColis, lignesPaiements, lignesVentes, nombreLignes } from './exports.ts';
import { injecterDemo } from './demo.ts';
import { associerTransaction, etatRapprochement, messageRapprochement, rembourserTransaction, releveComplet } from './rapprochementMonde.ts';

const fiche = (extra: Partial<FichePersonne> = {}): FichePersonne => ({ prenom: 'Awa', nom: 'Tchamba', tel: '6 55 44 33 22', role: 'guichet', gareId: 'mvan', pin: '5927', visage: false, ...extra });
const tomber = (f: () => unknown): Record<string, string> => { try { f(); } catch (e) { if (e instanceof ErreurValidation) return e.champs; throw e; } return {}; };
const ligneBX = () => app.monde.lignes.find((l) => l.id === 'l-BX-bafoussam')!;

describe('lignes', () => {
  beforeEach(() => reinitialiser());
  it('regroupe Classique et VIP d’une même liaison', () => {
    const g = groupeLigne('l-BX-Classique-mvan-aller'); expect(g.map((l) => l.classe)).toEqual(['Classique', 'VIP']); expect(groupeLigne('l-BX-bafoussam')).toHaveLength(1); expect(groupeLigne('nope')).toEqual([]);
  });
  it('changer le prix met à jour la ligne et les départs à venir, pas les billets vendus', () => {
    const l = ligneBX(), avant = departsFuturs(l.id).length; expect(avant).toBeGreaterThan(10);
    const bilan = modifierLigne(l.id, { prix: 5500 }); expect(l.prix).toBe(5500); expect(bilan.prixMisAJour).toBe(avant); expect(departsFuturs(l.id).every((d) => d.prix === 5500)).toBe(true);
    expect(billetsDe('p-aicha')[0].prix).toBe(7500); expect(app.monde.evenements[0]).toMatchObject({ type: 'config' });
  });
  it('refuse un prix invalide sans rien modifier', () => {
    const l = ligneBX(); expect(tomber(() => modifierLigne(l.id, { prix: 5030 })).prix).toBeTruthy(); expect(tomber(() => modifierLigne(l.id, { prix: 200 })).prix).toBeTruthy(); expect(l.prix).toBe(5000);
    expect(tomber(() => modifierLigne(l.id, { horaires: ['25:00'] })).horaires).toBeTruthy(); expect(tomber(() => modifierLigne(l.id, { horaires: ['07:30', '07:30'] })).horaires).toBeTruthy();
  });
  it('ajouter un horaire crée les départs des jours à venir ; le retirer les annule', () => {
    const l = ligneBX(), nb = departsFuturs(l.id).length, bilan = modifierLigne(l.id, { horaires: [...l.horaires, '16:30'] });
    expect(l.horaires).toContain('16:30'); expect(bilan.crees).toBeGreaterThan(10); expect(departsFuturs(l.id).length).toBe(nb + bilan.crees);
    const d = app.monde.departs.find((x) => x.ligneId === l.id && x.heure === '16:30' && x.jour > aujourdhui())!; expect(d).toMatchObject({ statut: 'prevu', prisAilleurs: [], capacite: 50 }); expect(app.monde.bus.some((b) => b.id === d.busId)).toBe(true);
    const b2 = modifierLigne(l.id, { horaires: l.horaires.filter((h) => h !== '16:30') }); expect(b2.annules).toBe(bilan.crees); expect(d.statut).toBe('annule');
    const b3 = modifierLigne(l.id, { horaires: [...l.horaires, '16:30'] }); expect(b3.restaures).toBe(bilan.crees); expect(d.statut).toBe('prevu');
  });
  it('retirer un horaire qui a des billets rembourse les voyageurs', () => {
    const b = billetsDe('p-aicha')[0], d = app.monde.departs.find((x) => x.id === b.departId)!, l = app.monde.lignes.find((x) => x.id === d.ligneId)!;
    const bilan = modifierLigne(l.id, { horaires: l.horaires.filter((h) => h !== d.heure) }); expect(bilan.rembourses).toBe(1); expect(b.statut).toBe('rembourse'); expect(d.statut).toBe('annule');
  });
  it('suspendre une ligne annule ses départs à venir, la réactiver les rétablit', () => {
    const l = ligneBX(), nb = departsFuturs(l.id).length, bilan = modifierLigne(l.id, { actif: false });
    expect(l.actif).toBe(false); expect(bilan.annules).toBe(nb); expect(departsFuturs(l.id).filter((d) => d.statut !== 'annule')).toHaveLength(0);
    const b2 = modifierLigne(l.id, { actif: true }); expect(l.actif).toBe(true); expect(b2.restaures).toBe(nb); expect(departsFuturs(l.id).every((d) => d.statut === 'prevu')).toBe(true);
  });
  it('créer une ligne : validations puis création avec ses départs', () => {
    const spec = { compagnieId: 'BX', de: 'Yaoundé', vers: 'Kribi', gareDe: 'mvan', gareVers: 'kribi', classe: 'Classique' as const, prix: 6500, dureeMin: 240, horaires: ['09:00'] };
    expect(tomber(() => creerLigne({ ...spec, vers: 'Yaoundé', gareVers: 'mvan' })).vers).toBeTruthy(); expect(tomber(() => creerLigne({ ...spec, gareDe: 'akwa' })).gareDe).toBeTruthy(); expect(tomber(() => creerLigne({ ...spec, dureeMin: 5 })).dureeMin).toBeTruthy();
    const l = creerLigne(spec, 'p-luther'); expect(app.monde.lignes).toContain(l); expect(departsFuturs(l.id).length).toBeGreaterThan(10); expect(tomber(() => creerLigne(spec)).vers).toBe('Cette ligne existe déjà.');
  });
});
describe('équipe', () => {
  beforeEach(() => reinitialiser());
  it('normalise et valide les fiches', () => {
    expect(normaliserTel('+237 6 91 22 10 08')).toBe('691221008'); expect(validerPersonne(fiche())).toEqual({});
    expect(validerPersonne(fiche({ prenom: ' ', tel: '123', pin: '1234', gareId: undefined }))).toMatchObject({ prenom: expect.any(String), tel: expect.any(String), pin: expect.stringContaining('facile'), gareId: expect.any(String) });
    expect(validerPersonne(fiche({ tel: '691221008' })).tel).toContain('déjà'); expect(validerPersonne(fiche({ pin: '12' })).pin).toContain('4 chiffres'); expect(validerPersonne(fiche({ role: 'comptable', gareId: undefined }))).toEqual({});
  });
  it('ajouter une personne : elle peut se connecter avec son PIN', () => {
    const p = creerPersonne(fiche(), 'p-luther'); expect(p).toMatchObject({ role: 'guichet', gareId: 'mvan', tel: '655443322', actif: true, compagnieId: 'BX' }); expect(verifierPin(p.id, '5927')).toBe(true); expect(app.monde.notifications[0].destId).toBe(p.id);
  });
  it('modifier rôle, gare et PIN ; refuse de changer le rôle de qui a une caisse ouverte ou son propre rôle', () => {
    const p = creerPersonne(fiche(), 'p-luther'); modifierPersonne(p.id, fiche({ role: 'quai', gareId: 'akwa', pin: '8642' }), 'p-luther'); expect(p).toMatchObject({ role: 'quai', gareId: 'akwa', pin: '8642' }); expect(app.monde.evenements[0].texte).toContain('rôle guichet → quai');
    expect(caisseOuverte('p-fatou')).toBeTruthy(); expect(tomber(() => modifierPersonne('p-fatou', fiche({ tel: '670000101', role: 'quai' }), 'p-luther')).role).toContain('caisse');
    expect(tomber(() => modifierPersonne('p-luther', fiche({ tel: '670000110', role: 'comptable', gareId: undefined }), 'p-luther')).role).toContain('propre rôle');
  });
  it('suspendre retire la connexion et garde le PIN pour la réactivation', () => {
    const p = creerPersonne(fiche(), 'p-luther'); changerActivation(p.id, false, 'p-luther'); expect(p.actif).toBe(false); expect(verifierPin(p.id, '5927')).toBe(false);
    modifierPersonne(p.id, fiche({ pin: '8642' }), 'p-luther'); changerActivation(p.id, true, 'p-luther'); expect(verifierPin(p.id, '8642')).toBe(true);
    expect(tomber(() => changerActivation('p-fatou', false, 'p-luther')).actif).toContain('caisse'); expect(tomber(() => changerActivation('p-luther', false, 'p-luther')).actif).toContain('propre compte');
  });
  it('nouveau PIN : 4 chiffres non triviaux, notification', () => {
    const pin = renouvelerPin('p-joseph', 'p-luther'); expect(pin).toMatch(/^\d{4}$/); expect(verifierPin('p-joseph', pin)).toBe(true); expect(pinAleatoire(3)).toMatch(/^[1-9]\d{3}$/); expect(app.monde.notifications[0].titre).toBe('Nouveau PIN');
  });
});
describe('tarifs, règles et permissions', () => {
  beforeEach(() => reinitialiser());
  it('bascule un paramètre et le journalise', () => {
    expect(basculerParametre('tarifs', 'dynamique', 'p-luther')).toBe(false); expect(app.monde.params.tarifs.dynamique).toBe(false); expect(app.monde.evenements[0].texte).toContain('dynamique'); expect(basculerParametre('regles', 'cloture')).toBe(false);
    expect(() => basculerParametre('regles', 'inconnue')).toThrow();
  });
  it('permissions : valeurs par défaut du rôle puis surcharge', () => {
    expect(permission('guichet', 'vendre')).toBe(true); expect(permission('quai', 'vendre')).toBe(false); fixerPermission('quai', 'vendre', true); expect(permission('quai', 'vendre')).toBe(true);
  });
});
describe('exports CSV', () => {
  beforeEach(() => reinitialiser());
  it('ventes : en-tête, billets du monde, montants', () => {
    const l = lignesVentes(app.monde); expect(l[0][2]).toBe('Pièce'); expect(l).toHaveLength(2); expect(l[1]).toContain('AM7F3K22'); expect(l[1]).toContain(7500);
  });
  it('neutralise les formules et protège séparateurs et guillemets', () => {
    app.monde.billets[0].passager.nom = '=HYPERLINK("http://x";"cliquez")'; app.monde.colis[0].destinataire.nom = '+33; "Marie"';
    const csv = exporterCsv('ventes', app.monde); expect(csv.startsWith('﻿')).toBe(true); expect(csv).toContain(`"'=HYPERLINK(""http://x"";""cliquez"")"`); expect(csv).not.toMatch(/;=HYPERLINK/);
    expect(exporterCsv('colis', app.monde)).toContain(`"'+33; ""Marie"""`); expect(csv).toContain('\r\n');
  });
  it('caisses, colis, paiements et filtre par date', () => {
    expect(lignesCaisses(app.monde)).toHaveLength(2); expect(lignesColis(app.monde)[1][0]).toBe('AM-C-9Q2'); expect(lignesPaiements(app.monde)[1][0]).toBe('MOMO-81736');
    expect(nombreLignes('ventes', app.monde, { depuis: Date.now() + 86_400_000 })).toBe(0); expect(nombreLignes('paiements', app.monde)).toBe(1);
  });
  it('ne contient pas les billets en attente ni expirés', () => {
    const d = app.monde.departs.find((x) => x.statut === 'prevu' && x.jour > aujourdhui())!; reserver({ departId: d.id, sieges: [null], passagers: [{ nom: 'Attente', tel: '1' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' });
    expect(lignesVentes(app.monde)).toHaveLength(2); expect(lignesPaiements(app.monde)).toHaveLength(3);
  });
});
describe('rapprochement MoMo / OM', () => {
  beforeEach(() => { reinitialiser(); });
  it('la démo ajoute 4 transactions sans correspondance (27 500 F) une seule fois', () => {
    expect(injecterDemo()).toBe(true); expect(injecterDemo()).toBe(false);
    const r = etatRapprochement(), motifs = r.ecarts.map((e) => e.motif).sort(); expect(r.ecarts).toHaveLength(4); expect(motifs).toEqual(['doublon', 'expire', 'sans_billet', 'sans_billet']);
    expect(r.ecarts.reduce((s, e) => s + e.tx.montant, 0)).toBe(27_500); expect(r.rapproches).toBeGreaterThanOrEqual(2); expect(releveComplet().some((t) => t.paiementRef === 'MOMO-81736')).toBe(true);
    expect(app.monde.evenements.length).toBeGreaterThanOrEqual(5);
  });
  it('associer : le billet expiré redevient valide, le paiement est réglé, l’écart disparaît', () => {
    injecterDemo(); const ecart = etatRapprochement().ecarts.find((e) => e.motif === 'expire')!, billet = ecart.candidats[0], libresAvant = placesLibres(app.monde.departs.find((d) => d.id === app.monde.billets.find((b) => b.id === billet)!.departId)!);
    expect(billet).toBe('b-s1'); associerTransaction(ecart.tx.ref, billet, 'p-nadege');
    const b = app.monde.billets.find((x) => x.id === billet)!, p = app.monde.paiements.find((x) => x.id === 'pay-s1')!; expect(b.statut).toBe('valide'); expect(p.statut).toBe('ok'); expect(etatRapprochement().ecarts).toHaveLength(3);
    expect(placesLibres(app.monde.departs.find((d) => d.id === b.departId)!)).toBe(libresAvant - 1); expect(etatSiege().decisions[ecart.tx.ref]).toMatchObject({ type: 'associe', billetId: 'b-s1' });
    expect(() => associerTransaction(ecart.tx.ref, billet)).toThrow('inconnue');
  });
  it('associer un paiement orphelin : le billet est rattaché à ce paiement et l’ancien paiement expiré est écarté', () => {
    injecterDemo(); const ecart = etatRapprochement().ecarts.find((e) => e.paiementId === 'pay-s2')!; expect(ecart.candidats).toContain('b-s2'); expect(ecart.candidats).toContain('b-s1');
    associerTransaction(ecart.tx.ref, 'b-s2', 'p-nadege'); const b = app.monde.billets.find((x) => x.id === 'b-s2')!;
    expect(b).toMatchObject({ statut: 'valide', paiementId: 'pay-s2' }); expect(app.monde.paiements.find((p) => p.id === 'pay-s5')!).toMatchObject({ statut: 'refuse' }); expect(app.monde.paiements.find((p) => p.id === 'pay-s2')!.pour.ids).toEqual(['b-s2']);
  });
  it('rembourser : décision enregistrée, paiement remboursé, le doublon n’est jamais associable', () => {
    injecterDemo(); const doublon = etatRapprochement().ecarts.find((e) => e.motif === 'doublon')!; expect(doublon.candidats).toEqual([]);
    expect(() => associerTransaction(doublon.tx.ref, 'b-s1')).toThrow('doublon'); expect(messageRapprochement('doublon')).toContain('rembourse');
    rembourserTransaction(doublon.tx.ref, 'p-nadege'); expect(etatSiege().decisions[doublon.tx.ref].type).toBe('rembourse');
    const orphelin = etatRapprochement().ecarts.find((e) => e.paiementId === 'pay-s4')!; rembourserTransaction(orphelin.tx.ref, 'p-nadege'); expect(app.monde.paiements.find((p) => p.id === 'pay-s4')!.statut).toBe('rembourse'); expect(etatRapprochement().ecarts).toHaveLength(2);
  });
  it('départ déjà parti ou annulé : association refusée', () => {
    injecterDemo(); const ecart = etatRapprochement().ecarts.find((e) => e.motif === 'expire')!, b = app.monde.billets.find((x) => x.id === ecart.candidats[0])!;
    app.monde.departs.find((d) => d.id === b.departId)!.statut = 'parti'; expect(() => associerTransaction(ecart.tx.ref, b.id)).toThrow('depart_ferme'); expect(messageRapprochement('depart_ferme')).toContain('rembourse');
  });
  it('une vente MoMo normale est rapprochée d’emblée', () => {
    const d = app.monde.departs.find((x) => x.statut === 'prevu' && x.jour > aujourdhui())!, { paiement } = reserver({ departId: d.id, sieges: [null], passagers: [{ nom: 'N', tel: '1' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' });
    expect(etatRapprochement().total).toBe(1); paiement.statut = 'ok'; app.monde.billets.at(-1)!.statut = 'valide'; const r = etatRapprochement(); expect(r.ecarts).toHaveLength(0); expect(r.rapproches).toBe(2);
    annulerBillet(app.monde.billets.at(-1)!.id);
  });
});

describe('jours de circulation et options', () => {
  beforeEach(() => reinitialiser());
  const jours = (x: boolean[]) => ({ jours: x, arrets: true, colis: false });
  it('décocher un jour annule les départs de ce jour (et rembourse), le recocher les rétablit', () => {
    const l = ligneBX(), lundi = (d: { jour: string }) => new Date(`${d.jour}T12:00:00`).getDay() === 1;
    const concernes = departsFuturs(l.id).filter(lundi); expect(concernes.length).toBeGreaterThan(0);
    const bilan = modifierLigne(l.id, { options: jours([false, true, true, true, true, true, true]) }); expect(bilan.annules).toBe(concernes.length); expect(concernes.every((d) => d.statut === 'annule')).toBe(true);
    expect(optionsLigne(l.id)).toMatchObject({ colis: false });
    const b2 = modifierLigne(l.id, { options: jours(Array(7).fill(true)) }); expect(b2.restaures).toBe(concernes.length); expect(concernes.every((d) => d.statut === 'prevu')).toBe(true);
  });
  it('refuse une ligne sans aucun jour de circulation ; un horaire ajouté saute les jours décochés', () => {
    const l = ligneBX(); expect(tomber(() => modifierLigne(l.id, { options: jours(Array(7).fill(false)) })).jours).toBeTruthy();
    modifierLigne(l.id, { options: jours([true, true, true, true, true, true, false]) }); modifierLigne(l.id, { horaires: [...l.horaires, '15:00'] });
    expect(app.monde.departs.filter((d) => d.ligneId === l.id && d.heure === '15:00' && new Date(`${d.jour}T12:00:00`).getDay() === 0)).toHaveLength(0);
    expect(app.monde.departs.filter((d) => d.ligneId === l.id && d.heure === '15:00').length).toBeGreaterThan(8);
  });
});
