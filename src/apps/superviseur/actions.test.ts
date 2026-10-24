import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { billetsDe, caisseOuverte, fermerCaisse, ligneDe, notificationsDe, personne, regler, reserver, scannerBillet, siegesIndisponibles, verifierPin } from '../../domain/actions.ts';
import { planSieges } from '../../core/sieges.ts';
import { pinValide } from '../../core/supervision.ts';
import { construireRapport } from '../../core/gare.ts';
import { alertesGare } from './alertes.ts';
import { amorcerDemo } from './demo.ts';
import { ajouterAgent, annulerBilletDecide, annulerDepartDecide, basculerCompte, bloquerCaisse, cloturerGare, debloquerCaisse, demanderAnnulation, demanderRecomptage, envoyerRapport, leverSuspensions, refuserAnnulation, reinitialiserPin, signalerPinFaux, signalerScanRefuse, suspendreJournee, transmettreAuPatron, validerCloture } from './actions.ts';
import { lireTranche } from './etat.svelte.ts';
import type { Depart } from '../../domain/types.ts';

const T = (hhmm: string) => new Date(`2026-11-03T${hhmm}:00`).getTime(), JOUR = '2026-11-03';
const departMvan = (heure: string) => app.monde.departs.find((d) => d.jour === JOUR && ligneDe(d).gareDe === 'mvan' && d.heure === heure)!;
const sieges = (d: Depart, n: number) => { const pris = siegesIndisponibles(d); return planSieges(ligneDe(d).classe, d.capacite).map((x) => x.id).filter((s) => !pris.has(s)).slice(6, 6 + n); };
function vendre(d: Depart, n: number, moyen: 'especes' | 'momo' = 'momo') {
  const s = sieges(d, n), r = reserver({ departId: d.id, sieges: s, passagers: s.map((_, i) => ({ nom: `P${i}`, tel: '690000000' })), acheteurId: 'p-aicha', canal: moyen === 'especes' ? 'guichet' : 'app', moyen, caisseId: moyen === 'especes' ? 'c-fatou' : undefined });
  if (moyen === 'momo') regler(r.paiement.id, { ok: true }); return r.billets;
}
const fermerFatou = (compte: Record<string, number>) => { vendre(departMvan('22:30'), 1, 'especes'); return fermerCaisse('c-fatou', compte).caisse; };

describe('équipe : PIN et comptes', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T('07:30')); reinitialiser(); });
  afterEach(() => vi.useRealTimers());
  it('nouveau PIN : 4 chiffres non triviaux, différent, remis par notification (SMS simulé)', () => {
    const avant = personne('p-fatou')!.pin; const r = reinitialiserPin('p-abdou', 'p-fatou');
    expect(r.ok).toBe(true); const pin = personne('p-fatou')!.pin!;
    expect(pinValide(pin)).toBe(true); expect(pin).not.toBe(avant); expect(verifierPin('p-fatou', pin)).toBe(true); expect(verifierPin('p-fatou', avant!)).toBe(false);
    expect(notificationsDe('p-fatou')[0]).toMatchObject({ titre: 'Nouveau PIN' }); expect(notificationsDe('p-fatou')[0].sous).toContain(pin);
    expect(app.monde.evenements[0]).toMatchObject({ type: 'equipe', acteurId: 'p-abdou' });
  });
  it('refuse hors de sa gare, le patron, un autre superviseur et un non-superviseur', () => {
    expect(reinitialiserPin('p-mireille', 'p-fatou')).toMatchObject({ ok: false }); expect(reinitialiserPin('p-abdou', 'p-luther')).toMatchObject({ ok: false });
    expect(reinitialiserPin('p-abdou', 'p-mireille')).toMatchObject({ ok: false }); expect(reinitialiserPin('p-fatou', 'p-joseph')).toMatchObject({ ok: false, erreur: 'Action réservée au superviseur' });
    expect(reinitialiserPin('p-luther', 'p-mireille').ok).toBe(true);
  });
  it('désactiver / réactiver un compte, sauf soi-même et un agent à la caisse ouverte', () => {
    expect(basculerCompte('p-abdou', 'p-abdou', false)).toMatchObject({ ok: false });
    expect(basculerCompte('p-abdou', 'p-fatou', false)).toMatchObject({ ok: false }); expect(caisseOuverte('p-fatou')).toBeDefined();
    expect(basculerCompte('p-abdou', 'p-ibrahim', false).ok).toBe(true); expect(personne('p-ibrahim')!.actif).toBe(false);
    expect(basculerCompte('p-abdou', 'p-ibrahim', true).ok).toBe(true); expect(personne('p-ibrahim')!.actif).toBe(true);
  });
  it('un compte désactivé ne peut plus décider', () => { personne('p-abdou')!.actif = false; expect(reinitialiserPin('p-abdou', 'p-fatou').ok).toBe(false); });
  it('ajouter un agent : validations, numéro unique, PIN généré, rattaché à la gare', () => {
    const base = { prenom: 'Awa', nom: 'Mfou', tel: '655 12 34 56', role: 'guichet' as const };
    expect(ajouterAgent('p-abdou', { ...base, tel: '555123456' })).toMatchObject({ ok: false }); expect(ajouterAgent('p-abdou', { ...base, tel: '670000101' })).toMatchObject({ ok: false, erreur: 'Ce numéro est déjà utilisé' });
    expect(ajouterAgent('p-abdou', { ...base, prenom: 'A' }).ok).toBe(false); expect(ajouterAgent('p-abdou', { ...base, role: 'patron' }).ok).toBe(false);
    const r = ajouterAgent('p-abdou', base); expect(r.ok).toBe(true); if (!r.ok) return;
    expect(r.personne).toMatchObject({ prenom: 'Awa', gareId: 'mvan', compagnieId: 'BX', tel: '655123456', actif: true }); expect(pinValide(r.pin)).toBe(true); expect(personne(r.personne.id)).toBeDefined();
    expect(ajouterAgent('p-abdou', base)).toMatchObject({ ok: false, erreur: 'Ce numéro est déjà utilisé' });
    expect(ajouterAgent('p-luther', { ...base, tel: '655000000' })).toMatchObject({ ok: false }); expect(ajouterAgent('p-luther', { ...base, tel: '655000000' }, 'akwa').ok).toBe(true);
    expect(ajouterAgent('p-abdou', { ...base, tel: '655000001', role: 'convoyeur' })).toMatchObject({ ok: true, personne: { commission: 5 } });
  });
  it('suspension pour la journée : levée le lendemain', () => {
    expect(suspendreJournee('p-abdou', 'p-joseph').ok).toBe(true); expect(personne('p-joseph')!.actif).toBe(false); expect(lireTranche().suspensions['p-joseph']).toBe(JOUR);
    expect(leverSuspensions()).toBe(0); vi.setSystemTime(T('07:30') + 86_400_000);
    expect(leverSuspensions()).toBe(1); expect(personne('p-joseph')!.actif).toBe(true); expect(lireTranche().suspensions['p-joseph']).toBeUndefined();
  });
});

describe('annulations', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T('07:30')); reinitialiser(); });
  afterEach(() => vi.useRealTimers());
  it('une demande d’annulation ouvre un litige et prévient le superviseur de la gare, sans doublon', () => {
    const [b] = vendre(departMvan('07:00'), 1), r = demanderAnnulation('p-ibrahim', b.id, 'capture d’écran');
    expect(r.ok).toBe(true); expect(app.monde.litiges).toHaveLength(1); expect(app.monde.litiges[0]).toMatchObject({ type: 'annulation', statut: 'ouvert' });
    expect(notificationsDe('p-abdou')[0].lien).toContain('/superviseur/voir?litige='); expect(notificationsDe('p-mireille')).toHaveLength(0);
    demanderAnnulation('p-ibrahim', b.id, 'encore'); expect(app.monde.litiges).toHaveLength(1);
    expect(demanderAnnulation('p-ibrahim', b.id, '  ')).toMatchObject({ ok: false });
    expect(alertesGare(app.monde, 'mvan', T('07:30')).some((a) => a.genre === 'annulation' && a.ton === 'er')).toBe(true);
  });
  it('annuler avec remboursement intégral (annulation par la compagnie) et clore la demande', () => {
    const [b] = vendre(departMvan('12:00'), 1); demanderAnnulation('p-ibrahim', b.id, 'erreur de vente');
    const r = annulerBilletDecide('p-abdou', b.id, { motif: 'erreur de vente', rembourser: true });
    expect(r).toMatchObject({ ok: true, rembourse: 5500 }); expect(b.statut).toBe('rembourse'); expect(app.monde.litiges[0].statut).toBe('resolu');
    expect(siegesIndisponibles(departMvan('12:00')).has(b.siege!)).toBe(false);
    expect(annulerBilletDecide('p-abdou', b.id, { motif: 'x', rembourser: true })).toMatchObject({ ok: false });
  });
  it('après départ : libère la place sans rembourser, même pour un billet déjà scanné', () => {
    const [b] = vendre(departMvan('07:00'), 1); scannerBillet(b.code, 'p-ibrahim');
    const r = annulerBilletDecide('p-abdou', b.id, { motif: 'copie', rembourser: false }); expect(r).toMatchObject({ ok: true, rembourse: 0 });
    expect(b.statut).toBe('annule'); expect(siegesIndisponibles(departMvan('07:00')).has(b.siege!)).toBe(false); expect(app.monde.paiements.find((p) => p.id === b.paiementId)!.statut).toBe('ok');
  });
  it('refuse hors gare, sans motif ; refuser une annulation clôt la demande et garde le billet', () => {
    const [b] = vendre(departMvan('07:00'), 1); demanderAnnulation('p-ibrahim', b.id, 'copie');
    expect(annulerBilletDecide('p-mireille', b.id, { motif: 'x', rembourser: false })).toMatchObject({ ok: false }); expect(annulerBilletDecide('p-abdou', b.id, { motif: ' ', rembourser: false })).toMatchObject({ ok: false });
    expect(refuserAnnulation('p-abdou', b.id).ok).toBe(true); expect(b.statut).toBe('valide'); expect(app.monde.litiges[0]).toMatchObject({ statut: 'resolu', reponse: 'Annulation refusée' });
    expect(alertesGare(app.monde, 'mvan', T('07:30')).some((a) => a.genre === 'annulation')).toBe(false);
  });
  it('annuler un départ : billets remboursés, équipe prévenue ; refusé s’il est parti ou si des passagers sont montés', () => {
    const d = departMvan('12:00'), bs = vendre(d, 2);
    const r = annulerDepartDecide('p-abdou', d.id, 'panne du bus'); expect(r).toMatchObject({ ok: true, rembourses: 2 });
    expect(d.statut).toBe('annule'); expect(bs.every((b) => b.statut === 'rembourse')).toBe(true); expect(notificationsDe('p-ibrahim')[0].titre).toBe('Départ annulé');
    expect(annulerDepartDecide('p-abdou', d.id, 'x')).toMatchObject({ ok: false, erreur: 'Départ déjà annulé' });
    expect(annulerDepartDecide('p-abdou', departMvan('07:00').id, 'x')).toMatchObject({ ok: false });
    const d2 = departMvan('16:00'), [b2] = vendre(d2, 1); scannerBillet(b2.code, 'p-ibrahim'); expect(annulerDepartDecide('p-abdou', d2.id, 'x')).toMatchObject({ ok: false });
    expect(annulerDepartDecide('p-mireille', departMvan('19:00').id, 'x')).toMatchObject({ ok: false }); expect(annulerDepartDecide('p-abdou', departMvan('19:00').id, '')).toMatchObject({ ok: false });
  });
});

describe('clôtures de caisse', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T('19:00')); reinitialiser(); });
  afterEach(() => vi.useRealTimers());
  it('valide avec le bon PIN, impute l’écart et prévient l’agent', () => {
    const c = fermerFatou({ 10000: 2, 2000: 2 }); expect(c).toMatchObject({ statut: 'fermee', ecart: -1000 });
    expect(alertesGare(app.monde, 'mvan', T('19:00')).some((a) => a.genre === 'caisse' && a.href.includes(c.id))).toBe(true);
    expect(validerCloture('p-abdou', c.id, { pin: '0000' })).toMatchObject({ ok: false, erreur: 'PIN incorrect' }); expect(c.statut).toBe('fermee');
    expect(validerCloture('p-abdou', c.id, { pin: '1357' })).toMatchObject({ ok: true, ecart: -1000 }); expect(c).toMatchObject({ statut: 'validee', validePar: 'p-abdou' });
    expect(app.monde.evenements.some((e) => e.type === 'ecart' && e.texte.includes('Fatou'))).toBe(true); expect(notificationsDe('p-fatou')[0].titre).toBe('Clôture validée');
    expect(validerCloture('p-abdou', c.id, { pin: '1357' })).toMatchObject({ ok: false, erreur: 'Clôture déjà validée' });
  });
  it('validation au visage (simulé) pour Abdou, impossible pour qui n’en a pas ou si la règle est coupée', () => {
    const c = fermerFatou({ 10000: 2, 2000: 2 });
    app.monde.params.regles.visage = false; expect(validerCloture('p-abdou', c.id, { visage: true })).toMatchObject({ ok: false });
    app.monde.params.regles.visage = true; personne('p-abdou')!.visage = false; expect(validerCloture('p-abdou', c.id, { visage: true })).toMatchObject({ ok: false });
    personne('p-abdou')!.visage = true; expect(validerCloture('p-abdou', c.id, { visage: true }).ok).toBe(true);
  });
  it('écart supérieur à 2 000 F : seul le patron valide, le superviseur transmet', () => {
    const c = fermerFatou({ 10000: 1 }); expect(c.ecart).toBeLessThan(-2000);
    expect(validerCloture('p-abdou', c.id, { pin: '1357' })).toMatchObject({ ok: false }); expect(transmettreAuPatron('p-abdou', c.id).ok).toBe(true); expect(notificationsDe('p-luther')[0].titre).toBe('Écart à valider');
    expect(validerCloture('p-luther', c.id, { pin: '0001' }).ok).toBe(true);
  });
  it('refus : la caisse repasse ouverte pour un recomptage, puis peut être refermée', () => {
    const c = fermerFatou({ 10000: 2, 2000: 2 });
    expect(demanderRecomptage('p-mireille', c.id)).toMatchObject({ ok: false }); expect(demanderRecomptage('p-abdou', c.id, 'Recompte les billets de 1 000').ok).toBe(true);
    expect(c.statut).toBe('ouverte'); expect(c.compte).toBeUndefined(); expect(c.ecart).toBeUndefined(); expect(notificationsDe('p-fatou')[0].titre).toBe('Recomptage demandé');
    const apres = fermerCaisse(c.id, { 10000: 2, 5000: 1 }); expect(apres.montant).toBe(0); expect(c.statut).toBe('fermee');
    expect(validerCloture('p-abdou', c.id, { pin: '1357' }).ok).toBe(true);
    expect(demanderRecomptage('p-abdou', c.id)).toMatchObject({ ok: false });
  });
});

describe('guichet bloqué', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T('07:30')); reinitialiser(); });
  afterEach(() => vi.useRealTimers());
  it('trois PIN faux bloquent la caisse ouverte et préviennent le superviseur', () => {
    expect(signalerPinFaux('p-fatou')).toEqual({ tentatives: 1, bloque: false }); expect(signalerPinFaux('p-fatou').tentatives).toBe(2);
    expect(signalerPinFaux('p-fatou')).toEqual({ tentatives: 3, bloque: true }); expect(app.monde.caisses[0].statut).toBe('bloquee');
    expect(notificationsDe('p-abdou')[0]).toMatchObject({ titre: 'Guichet bloqué', lien: '/superviseur/debloquer?caisse=c-fatou' }); expect(signalerPinFaux('p-joseph')).toEqual({ tentatives: 1, bloque: false });
    const a = alertesGare(app.monde, 'mvan', T('07:30')).find((x) => x.genre === 'acces')!; expect(a.titre).toBe('Guichet 1 bloqué · 3 PIN faux');
  });
  it('débloque après reconnaissance du visage ; nouveau PIN et recomptage en option', () => {
    bloquerCaisse('c-fatou', '3 PIN faux'); expect(bloquerCaisse('c-fatou', 'encore')).toMatchObject({ ok: false });
    expect(debloquerCaisse('p-abdou', 'c-fatou', { visageReconnu: false, nouveauPin: false, recompter: false })).toMatchObject({ ok: false });
    expect(debloquerCaisse('p-mireille', 'c-fatou', { visageReconnu: true, nouveauPin: false, recompter: false })).toMatchObject({ ok: false });
    const avant = personne('p-fatou')!.pin, r = debloquerCaisse('p-abdou', 'c-fatou', { visageReconnu: true, nouveauPin: true, recompter: true });
    expect(r.ok).toBe(true); expect(app.monde.caisses[0].statut).toBe('ouverte'); expect(personne('p-fatou')!.pin).not.toBe(avant); expect(personne('p-fatou')!.visage).toBe(true);
    expect(notificationsDe('p-fatou').some((n) => n.titre === 'Guichet débloqué' && n.sous.includes('Recompte'))).toBe(true);
    expect(debloquerCaisse('p-abdou', 'c-fatou', { visageReconnu: true, nouveauPin: false, recompter: false })).toMatchObject({ ok: false, erreur: 'Ce guichet n’est pas bloqué' });
  });
});

describe('rapport du soir et clôture de la gare', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T('19:05')); reinitialiser(); });
  afterEach(() => vi.useRealTimers());
  const rapport = () => construireRapport(app.monde, { gareId: 'mvan', jour: JOUR, now: T('19:05'), superviseur: 'Abdou' });
  it('envoyer le rapport le consigne et prévient le patron', () => {
    vendre(departMvan('22:30'), 2, 'especes'); expect(envoyerRapport('p-mireille', rapport(), 'whatsapp').ok).toBe(false);
    expect(envoyerRapport('p-abdou', rapport(), 'whatsapp').ok).toBe(true);
    expect(lireTranche().rapports[`mvan|${JOUR}`]).toMatchObject({ via: 'whatsapp', par: 'p-abdou' }); expect(lireTranche().rapports[`mvan|${JOUR}`].texte).toContain('Rapport du soir · Mvan');
    expect(notificationsDe('p-luther')[0]).toMatchObject({ titre: 'Rapport du soir · Mvan' });
  });
  it('clôture avant 20:00 : aucune alerte ; une seule clôture par jour', () => {
    expect(cloturerGare('p-abdou', 'mvan')).toEqual({ ok: true, tardive: false, retardMin: 0 }); expect(notificationsDe('p-luther')).toHaveLength(0);
    expect(cloturerGare('p-abdou', 'mvan')).toMatchObject({ ok: false }); expect(cloturerGare('p-abdou', 'akwa')).toMatchObject({ ok: false });
  });
  it('clôture après 20:00 avec la règle cloture : le patron est alerté ; règle coupée : silence', () => {
    vi.setSystemTime(T('21:12')); expect(cloturerGare('p-abdou', 'mvan')).toEqual({ ok: true, tardive: true, retardMin: 72 });
    expect(notificationsDe('p-luther')[0]).toMatchObject({ titre: 'Clôture tardive · Mvan' }); expect(notificationsDe('p-luther')[0].sous).toContain('21:12');
    reinitialiser(); app.monde.params.regles.cloture = false; expect(cloturerGare('p-abdou', 'mvan')).toMatchObject({ ok: true, tardive: false }); expect(notificationsDe('p-luther')).toHaveLength(0);
  });
});

describe('journée de démonstration', () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(T('07:30')); reinitialiser(); });
  afterEach(() => vi.useRealTimers());
  it('amorcée une seule fois : ventes, guichet bloqué, clôture d’hier, demande d’annulation et retard apparaissent', () => {
    expect(amorcerDemo('mvan')).toBe(true); expect(amorcerDemo('mvan')).toBe(false);
    const al = alertesGare(app.monde, 'mvan', T('07:30')), genres = al.map((a) => a.genre);
    expect(genres).toEqual(expect.arrayContaining(['annulation', 'acces', 'caisse', 'retard'])); expect(al[0].genre).toBe('annulation');
    const r = construireRapport(app.monde, { gareId: 'mvan', jour: JOUR, now: T('07:30'), superviseur: 'Abdou' });
    expect(r.caisses).toMatchObject({ bloquees: 1, aValider: 1, ouvertes: 1 }); expect(r.billets).toBeGreaterThanOrEqual(5); expect(r.incidents.join()).toContain('1 scan refusé');
    expect(billetsDe('p-aicha')).toHaveLength(1); // la démo n'ajoute rien au compte d'Aïcha
    expect(app.monde.litiges[0].objet.type).toBe('billet'); expect(personne('p-serge-demo')).toBeDefined();
    // la clôture d'hier se valide de bout en bout
    const hier = app.monde.caisses.find((c) => c.statut === 'fermee')!; expect(hier.ecart).toBe(-1500); expect(validerCloture('p-abdou', hier.id, { pin: '1357' }).ok).toBe(true);
  });
  it('un scan refusé consigné par le quai remonte en alerte et dans le rapport', () => {
    vi.setSystemTime(T('07:30')); signalerScanRefuse('p-ibrahim', 'Billet falsifié');
    expect(alertesGare(app.monde, 'mvan', T('07:30')).filter((a) => a.genre === 'scan')).toHaveLength(1);
    expect(construireRapport(app.monde, { gareId: 'mvan', jour: JOUR, now: T('07:30'), superviseur: 'Abdou' }).incidents).toContain('1 scan refusé');
    expect(alertesGare(app.monde, 'akwa', T('07:30'))).toEqual([]);
  });
  it('gare sans guichet : seul un retard est annoncé, pas d’erreur', () => { expect(() => amorcerDemo('akwa')).not.toThrow(); expect(alertesGare(app.monde, 'akwa', T('07:30')).map((a) => a.genre)).toEqual(['retard']); });
});
