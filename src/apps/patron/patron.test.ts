import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sceauValide } from '../../core/sceau.ts';
import { totalCompte } from '../../core/caisse.ts';
import { remplissages, tableau } from '../../core/indicateurs.ts';
import { intention, repondre, SUGGESTIONS } from '../../core/assistant.ts';
import { app, aujourdhui, maintenant, reinitialiser } from '../../data/store.svelte.ts';
import { attenduDeCaisse, billetsDe, connecter, departParId, personne, remplissage, siegesIndisponibles, verifierPin } from '../../domain/actions.ts';
import demarrage from './demarrage.ts';
import {
  accepterDemande, ajouterPiece, appliquerPrix, assurerHistorique, avancerDossier, basculerModule, changerGare, changerPart, confierColis, conventionDe, envoyerContreSignature, envoyerDossier,
  proposerConvention, reglerPartenaire, reinitialiserPin, signerConvention, simulerContreSignature, suspendrePersonne
} from './actions.ts';
import { etatFinancement, etatInterAgences, etatPatron } from './etat.ts';
import { genererHistorique, PERSONNE_CLIENTS } from './historique.ts';
import { contexte } from './lecture.ts';
import { moduleActif, prixMensuel } from './modules.ts';

const NOW = new Date('2026-11-03T19:10:00');
beforeEach(() => { vi.useFakeTimers({ now: NOW }); reinitialiser(); connecter('p-luther'); });
afterEach(() => vi.useRealTimers());
/** Les textes de l'assistant utilisent des espaces insécables (jamais de chiffre coupé en fin de ligne) : on les compare avec des espaces ordinaires. */
const sp = (s: string) => s.replace(/[\u00a0\u202f]/g, ' ');
const rep = (c: ReturnType<typeof contexte>, q: string) => { const r = repondre(c, q); return { ...r, titre: sp(r.titre), texte: sp(r.texte), points: r.points.map((p) => ({ titre: sp(p.titre), detail: sp(p.detail) })), actions: r.actions.map((a) => ({ ...a, libelle: sp(a.libelle) })), chiffres: r.chiffres.map((x) => ({ ...x, libelle: sp(x.libelle), valeur: sp(x.valeur) })), suite: r.suite && { question: sp(r.suite.question), reponse: sp(r.suite.reponse) } }; };
const avecHistorique = () => { assurerHistorique(); return contexte(); };

describe('historique de démonstration', () => {
  it('ajoute ~14 jours de ventes cohérentes avec le domaine, une seule fois', () => {
    expect(app.monde.billets).toHaveLength(1);
    expect(assurerHistorique()).toBe(true);
    const n = app.monde.billets.length; expect(n).toBeGreaterThan(600);
    expect(assurerHistorique()).toBe(false); expect(app.monde.billets).toHaveLength(n); expect(etatPatron().historique?.billets).toBe(n - 1);
    const departs = new Map(app.monde.departs.map((d) => [d.id, d])), codes = new Set<string>();
    for (const b of app.monde.billets) {
      expect(departs.has(b.departId)).toBe(true); expect(codes.has(b.code)).toBe(false); codes.add(b.code);
      expect(sceauValide({ code: b.code, departId: b.departId, siege: b.siege, nom: b.passager.nom, sceau: b.sceau })).toBe(true);
      expect(app.monde.paiements.some((p) => p.id === b.paiementId)).toBe(true); expect(b.creeLe).toBeLessThanOrEqual(maintenant());
    }
  });
  it('aucun siège vendu deux fois, jamais plus de places que la capacité', () => {
    assurerHistorique();
    for (const d of app.monde.departs) {
      const sieges = app.monde.billets.filter((b) => b.departId === d.id && b.siege && (b.statut === 'valide' || b.statut === 'scanne')).map((b) => b.siege!);
      expect(new Set(sieges).size).toBe(sieges.length); expect(siegesIndisponibles(d).size).toBeLessThanOrEqual(d.capacite);
      for (const s of sieges) expect(d.prisAilleurs).not.toContain(s);
    }
  });
  it('les caisses clôturées sont justes : attendu recalculé par le domaine, comptage par coupure = attendu + écart', () => {
    assurerHistorique();
    const histo = app.monde.caisses.filter((c) => c.id.startsWith('c-h-')); expect(histo.length).toBeGreaterThan(15);
    for (const c of histo) { expect(attenduDeCaisse(c)).toBe(c.attendu); expect(totalCompte(c.compte!)).toBe(c.attendu! + c.ecart!); expect(c.statut).toBe('validee'); }
    expect(app.monde.caisses.find((c) => c.id === 'c-fatou')?.statut).toBe('ouverte');
  });
  it('le remplissage du noyau pur égale celui du domaine pour tous les départs', () => {
    assurerHistorique();
    const r = remplissages(app.monde, maintenant());
    for (const d of app.monde.departs) expect(r.get(d.id)).toBeCloseTo(remplissage(d), 10);
  });
  it('déterministe : deux mondes neufs donnent le même historique ; ignoré si le monde a déjà des ventes', () => {
    genererHistorique(app.monde, { jour: aujourdhui(), now: maintenant() });
    const a = app.monde.billets.map((b) => `${b.code}${b.departId}${b.siege}${b.creeLe}`).join('|');
    reinitialiser(); genererHistorique(app.monde, { jour: aujourdhui(), now: maintenant() });
    expect(app.monde.billets.map((b) => `${b.code}${b.departId}${b.siege}${b.creeLe}`).join('|')).toBe(a);
    expect(genererHistorique(app.monde, { jour: aujourdhui(), now: maintenant() }).billets).toBe(0);
  });
  it('un départ de Bafoussam annulé hier : billets remboursés, hors recette ; clients de démonstration à part', () => {
    assurerHistorique();
    const annule = app.monde.departs.find((d) => d.statut === 'annule')!; expect(annule.jour).toBe('2026-11-02');
    const bs = app.monde.billets.filter((b) => b.departId === annule.id); expect(bs.length).toBeGreaterThan(0); expect(bs.every((b) => b.statut === 'rembourse')).toBe(true);
    expect(personne(PERSONNE_CLIENTS)?.role).toBe('voyageur'); expect(billetsDe('p-aicha')).toHaveLength(1);
  });
  it('tableau du jour sur le vrai monde : recette > 0, comparaison à la même heure, gares de la compagnie', () => {
    const c = avecHistorique(), t = tableau(app.monde, { jour: c.jour, now: c.now, compagnieId: 'BX' });
    expect(t.recette).toBeGreaterThan(0); expect(t.billets).toBeGreaterThan(5); expect(t.variation).not.toBeNull(); expect(t.bus).toBeGreaterThan(10);
    expect(t.gares.map((g) => g.gareId)).toContain('mvan'); expect(t.remplissage).toBeGreaterThan(0.3); expect(t.remplissage).toBeLessThanOrEqual(1);
    expect(t.gares.reduce((s, g) => s + g.recette, 0)).toBe(t.recette);
  });
});

describe('assistant du patron (moteur de règles)', () => {
  it('reconnaît l’intention de la question', () => {
    const cas: [string, string][] = [['Pourquoi les ventes baissent sur Yaoundé → Douala ?', 'baisse'], ['Pourquoi Bafoussam baisse depuis 3 jours ?', 'baisse'], ['Quelle ligne rapporte le plus par bus ?', 'classement'],
      ['Compare Mvan et Douala sur la semaine', 'comparer'], ['Qu’est-ce qui manque au rapprochement MoMo ?', 'rapprochement'], ['Est-ce que je peux acheter un bus ce trimestre ?', 'financement'],
      ['Où en sont les écarts de caisse ?', 'caisse'], ['des retards aujourd’hui ?', 'retards'], ['et les colis ?', 'colis'], ['bilan du jour', 'bilan'], ['le partage 60 / 40 est juste ?', 'convention'], ['blabla', 'inconnue'], ['', 'inconnue']];
    for (const [q, i] of cas) expect(intention(q), q).toBe(i);
    expect(SUGGESTIONS.every((s) => intention(s) !== 'inconnue')).toBe(true);
  });
  it('« pourquoi les ventes baissent sur Yaoundé → Douala » : compare semaine à semaine, trouve le concurrent moins cher et propose un prix', () => {
    const c = avecHistorique(), r = rep(c, 'Pourquoi les ventes baissent sur Yaoundé → Douala ?');
    expect(r.intention).toBe('baisse'); expect(r.titre).toMatch(/^Yaoundé → Douala fait −\d+ % en 7 jours/);
    expect(r.serie?.valeurs).toHaveLength(7); expect(r.serie?.creux.some(Boolean)).toBe(true);
    expect(r.points[0].titre).toBe('Finex propose un 06:15 à 6 000 F'); expect(r.points[0].detail).toContain('ton 07:00 est à 7 000 F (+1 000 F)');
    const a = r.actions.find((x) => x.prix)!; expect(a.prix).toEqual({ ligneId: 'l-BX-Classique-mvan-aller', heure: '07:00', prix: 6000 }); expect(a.libelle).toBe('Passer le 07:00 à 6 000 F');
    expect(r.suite?.reponse).toMatch(/^Si tu passes à 6 000 F : −14 % par billet, remplissage attendu de \d+ % à \d+ %/);
    expect(r.points.length).toBeLessThanOrEqual(3);
  });
  it('les chiffres de la réponse viennent des billets du monde (somme de la série = billets de la semaine)', () => {
    const c = avecHistorique(), r = rep(c, 'Pourquoi les ventes baissent sur Yaoundé → Douala ?');
    expect(r.serie!.valeurs.reduce((s, x) => s + x, 0)).toBe(Number(r.chiffres[0].valeur.split(' ')[0]));
  });
  it('Bafoussam : cause = départ annulé hier avec billets remboursés', () => {
    const c = avecHistorique(), r = rep(c, 'Pourquoi Bafoussam baisse depuis 3 jours ?');
    expect(r.titre).toMatch(/^Bafoussam fait −\d+ % en 7 jours/); expect(r.points[0].titre).toBe('1 départ annulé cette semaine'); expect(r.points[0].detail).toMatch(/billets? remboursés? automatiquement/);
  });
  it('une ville sans baisse : pas de cause inventée', () => {
    const c = avecHistorique(), r = rep(c, 'Pourquoi Kribi baisse ?');
    expect(r.points.length).toBeLessThanOrEqual(1); if ((r.chiffres[0]?.ton ?? 'ok') === 'ok') expect(r.titre).toMatch(/Pas de baisse|rien à comparer/);
  });
  it('classement par bus, comparaison de gares, rapprochement, financement, écarts, bilan', () => {
    const c = avecHistorique();
    const cl = rep(c, 'Quelle ligne rapporte le plus par bus ?'); expect(cl.points.length).toBeGreaterThanOrEqual(3);
    const parBus = cl.points.map((p) => Number(p.detail.split(' F')[0].replace(/\s/g, ''))); expect([...parBus].sort((a, b) => b - a)).toEqual(parBus);
    const co = rep(c, 'Compare Mvan et Douala sur la semaine'); expect(co.titre).toMatch(/Yaoundé Mvan|Douala/); expect(co.chiffres).toHaveLength(6);
    expect(rep(c, 'Compare Mvan').titre).toContain('Quelles gares');
    const ra = rep(c, 'Qu’est-ce qui manque au rapprochement MoMo ?'); expect(ra.titre).toContain('rapproché'); expect(ra.actions[0].lien).toBe('/siege/comptable/rapprochement');
    const fi = rep(c, 'Est-ce que je peux acheter un bus ce trimestre ?'); expect(fi.chiffres.map((x) => x.libelle)).toContain('Plafond selon recettes');
    const ca = rep(c, 'Où en sont les écarts de caisse ?'); expect(ca.points.length).toBeGreaterThan(0); expect(ca.titre).toMatch(/écarts? de caisse/);
    const bi = rep(c, 'bilan'); expect(bi.titre).toMatch(/^Journée à [\d ]+ F/);
  });
  it('rapprochement : repère les paiements en attente, expirés et refusés', () => {
    const c = avecHistorique(), bx = new Set(app.monde.lignes.filter((l) => l.compagnieId === 'BX').map((l) => l.id)), b = app.monde.billets.find((x) => x.id.startsWith('b-h') && bx.has(departParId(x.departId)!.ligneId))!, d = departParId(b.departId)!;
    app.monde.paiements.push({ id: 'pm1', ts: maintenant(), montant: 7000, moyen: 'momo', statut: 'attente', ref: 'x', canal: 'app', payeurId: 'a', pour: { type: 'billet', ids: [b.id] }, expireLe: maintenant() + 60_000 });
    app.monde.paiements.push({ id: 'pm2', ts: maintenant(), montant: 6000, moyen: 'om', statut: 'refuse', ref: 'y', canal: 'app', payeurId: 'a', pour: { type: 'billet', ids: [b.id] } }); void d;
    const r = rep(contexte(), 'rapprochement MoMo'); expect(r.points.map((p) => p.titre).join('|')).toMatch(/1 paiement en attente · 7 000 F.*1 paiement refusé · 6 000 F/); void c;
  });
  it('l’assistant ne modifie jamais le monde', () => {
    const c = avecHistorique(), avant = JSON.stringify($snapshot());
    for (const q of [...SUGGESTIONS, 'bonjour', 'bilan', 'colis', 'retards', 'partage convention']) repondre(c, q);
    expect(JSON.stringify($snapshot())).toBe(avant);
  });
  it('question vide ou inconnue : propose des questions possibles', () => {
    const c = avecHistorique(), r = rep(c, '   '); expect(r.intention).toBe('inconnue'); expect(r.points.length).toBeGreaterThan(0);
  });
});
const $snapshot = () => app.monde;

describe('modules', () => {
  it('activer ou masquer un module : les autres applications lisent app.monde.params.modules', () => {
    expect(moduleActif('colis')).toBe(true); expect(moduleActif('ussd')).toBe(true);
    const total = prixMensuel(app.monde.params.modules);
    expect(basculerModule('colis', false).ok).toBe(true); expect(app.monde.params.modules.colis).toBe(false); expect(moduleActif('colis')).toBe(false);
    expect(prixMensuel(app.monde.params.modules)).toBe(total - 15000);
    expect(basculerModule('ussd', false).ok).toBe(true); expect(moduleActif('ussd')).toBe(false); expect(basculerModule('ussd', true).ok).toBe(true); expect(moduleActif('ussd')).toBe(true);
    expect(app.monde.evenements[0].texte).toContain('USSD'); expect(app.monde.evenements[0].acteurId).toBe('p-luther');
  });
  it('le module de base ne se coupe pas ; un module inconnu est refusé', () => {
    expect(basculerModule('billets', false).ok).toBe(false); expect(basculerModule('nimporte', true).ok).toBe(false);
  });
});

describe('équipe : suspendre, changer de gare, réinitialiser le PIN', () => {
  it('suspendre coupe l’accès, réactiver le rétablit ; le patron ne se suspend pas', () => {
    expect(suspendrePersonne('p-ibrahim', true).ok).toBe(true); expect(personne('p-ibrahim')?.actif).toBe(false);
    expect(app.monde.notifications[0]).toMatchObject({ destId: 'p-ibrahim', titre: 'Accès suspendu' }); expect(app.monde.evenements[0].texte).toContain('suspendu');
    expect(suspendrePersonne('p-ibrahim', false).ok).toBe(true); expect(personne('p-ibrahim')?.actif).toBe(true);
    expect(suspendrePersonne('p-luther', true).ok).toBe(false); expect(suspendrePersonne('p-inconnu', true).ok).toBe(false);
  });
  it('suspendre une personne à caisse ouverte prévient que la caisse reste à clôturer', () => {
    const r = suspendrePersonne('p-fatou', true); expect(r.ok).toBe(true); expect(r.message).toContain('caisse reste ouverte');
  });
  it('changer de gare : notifie la personne et le superviseur de la nouvelle gare ; refusé avec une caisse ouverte', () => {
    expect(changerGare('p-fatou', 'akwa')).toMatchObject({ ok: false, raison: expect.stringContaining('Caisse ouverte') }); expect(personne('p-fatou')?.gareId).toBe('mvan');
    expect(changerGare('p-ibrahim', 'akwa').ok).toBe(true); expect(personne('p-ibrahim')?.gareId).toBe('akwa');
    expect(app.monde.notifications.some((n) => n.destId === 'p-mireille' && n.titre === 'Nouvelle recrue')).toBe(true); expect(app.monde.notifications.some((n) => n.destId === 'p-ibrahim' && n.titre === 'Nouvelle gare')).toBe(true);
    expect(changerGare('p-ibrahim', 'akwa').ok).toBe(false); expect(changerGare('p-ibrahim', 'nulle-part').ok).toBe(false); expect(changerGare('p-nadege', 'akwa').raison).toContain('aucune gare');
  });
  it('réinitialiser le PIN : nouveau PIN valide, ancien refusé, SMS simulé', () => {
    const r = reinitialiserPin('p-fatou'); expect(r.ok).toBe(true); expect(r.pin).toMatch(/^\d{4}$/); expect(r.pin).not.toBe('4821');
    expect(verifierPin('p-fatou', r.pin!)).toBe(true); expect(verifierPin('p-fatou', '4821')).toBe(false);
    expect(app.monde.notifications[0]).toMatchObject({ destId: 'p-fatou', type: 'sms' }); expect(app.monde.notifications[0].sous).toContain(r.pin!);
    expect(reinitialiserPin('p-luther').ok).toBe(false);
  });
});

describe('prix proposé par l’assistant', () => {
  it('applique le prix aux prochains départs de l’heure, sans toucher aux billets vendus ni aux départs partis', () => {
    const avant = app.monde.billets[0].prix, r = appliquerPrix('l-BX-Classique-mvan-aller', '07:00', 6000);
    expect(r.ok).toBe(true); expect(r.departs).toBeGreaterThan(8);
    const deps = app.monde.departs.filter((d) => d.ligneId === 'l-BX-Classique-mvan-aller' && d.heure === '07:00');
    expect(deps.filter((d) => d.jour >= aujourdhui() && d.statut === 'prevu').every((d) => d.prix === 6000)).toBe(true);
    expect(deps.filter((d) => d.jour < aujourdhui()).every((d) => d.prix === 7000)).toBe(true); expect(app.monde.billets[0].prix).toBe(avant);
    expect(app.monde.evenements[0].type).toBe('tarif');
  });
  it('refuse un prix invalide ou une ligne sans départ à cette heure', () => {
    expect(appliquerPrix('l-BX-Classique-mvan-aller', '07:00', -5).ok).toBe(false); expect(appliquerPrix('l-BX-Classique-mvan-aller', '07:00', 999_999).ok).toBe(false);
    expect(appliquerPrix('l-BX-Classique-mvan-aller', '03:33', 5000).ok).toBe(false); expect(appliquerPrix('nulle', '07:00', 5000).ok).toBe(false);
  });
});

describe('financement : dossier suivi en étapes', () => {
  it('sans historique de caisses, aucun dossier ne part', () => {
    expect(envoyerDossier('bus-70', 38_000_000, 36)).toMatchObject({ ok: false });
  });
  it('envoi, pièces, étapes : la visite exige le devis ; les fonds ne se versent qu’une fois', () => {
    avecHistorique();
    const r = envoyerDossier('bus-70', 38_000_000, 36); expect(r.ok).toBe(true); const d = r.dossier!;
    expect(d.id).toBe('D-7731'); expect(d.etape).toBe(0); expect(d.pieces).toEqual({ releves: true, registre: true, cni: true, devis: false }); expect(d.apport).toBe(5_700_000);
    expect(envoyerDossier('bus-70', 38_000_000, 36).dossier?.id).toBe('D-7731'); expect(etatFinancement().dossiers).toHaveLength(1);
    expect(avancerDossier(d.id)).toMatchObject({ ok: true, message: 'Analyse par la banque' }); expect(d.horodatage[1]).not.toBeNull();
    expect(avancerDossier(d.id)).toMatchObject({ ok: false, raison: expect.stringContaining('Devis du bus') }); expect(d.etape).toBe(1);
    expect(ajouterPiece(d.id, 'devis').ok).toBe(true);
    for (const e of ['Visite de la gare', 'Offre signée', 'Fonds versés']) expect(avancerDossier(d.id).message).toBe(e);
    expect(avancerDossier(d.id).ok).toBe(false); expect(d.etape).toBe(4);
    expect(app.monde.notifications.filter((n) => n.destId === 'p-luther' && n.type === 'financement').length).toBeGreaterThanOrEqual(4);
    expect(envoyerDossier('bus-70', 38_000_000, 36).dossier?.id).toBe('D-7732');
  });
  it('une avance de trésorerie n’exige pas de devis ; offre inconnue ou plafond dépassé refusés', () => {
    avecHistorique();
    const r = envoyerDossier('roulement', 5_000_000, 6); expect(r.ok).toBe(true); expect(r.dossier!.pieces).toEqual({ releves: true, cni: true });
    expect(envoyerDossier('inconnue', 1, 1).ok).toBe(false); expect(envoyerDossier('entretien', 100, 4)).toMatchObject({ ok: false, raison: expect.stringContaining('minimum') });
    expect(avancerDossier('D-0').ok).toBe(false); expect(ajouterPiece('D-0', 'devis').ok).toBe(false);
  });
});

describe('inter-agences : convention et colis confiés', () => {
  const traits: [number, number][][] = [[[10, 50], [30, 20], [60, 70], [90, 40]]];
  it('état de départ : Alpha VIP en brouillon, Touristique a demandé une convention', () => {
    demarrage();
    expect(conventionDe('AV')).toMatchObject({ statut: 'brouillon', partBetaPct: 60 }); expect(conventionDe('TR')?.statut).toBe('demandee');
    expect(etatInterAgences().liens).toEqual([]);
  });
  it('signature : la case d’accord est obligatoire, le tracé aussi (sauf visage) ; après signature les conditions sont figées', () => {
    expect(changerPart('AV', -5).ok).toBe(true); expect(conventionDe('AV')?.partBetaPct).toBe(55); expect(changerPart('AV', 5).ok).toBe(true);
    for (let i = 0; i < 10; i++) changerPart('AV', 5); expect(conventionDe('AV')?.partBetaPct).toBe(70); expect(changerPart('AV', 5)).toMatchObject({ ok: false });
    expect(signerConvention('AV', { accord: false, mode: 'doigt', traits })).toMatchObject({ ok: false, raison: expect.stringContaining('accepte') });
    expect(signerConvention('AV', { accord: true, mode: 'doigt', traits: [] })).toMatchObject({ ok: false, raison: expect.stringContaining('Trace') });
    expect(signerConvention('AV', { accord: true, mode: 'doigt', traits: [[[1, 1], [2, 2]]] }).ok).toBe(false);
    expect(signerConvention('TR', { accord: true, mode: 'visage' })).toMatchObject({ ok: false, raison: expect.stringContaining('Accepte') });
    expect(signerConvention('AV', { accord: true, mode: 'doigt', traits }).ok).toBe(true);
    expect(conventionDe('AV')).toMatchObject({ statut: 'signee', signee: { par: 'p-luther', mode: 'doigt' } });
    expect(changerPart('AV', -5).ok).toBe(false); expect(signerConvention('AV', { accord: true, mode: 'visage' }).raison).toBe('Déjà signée');
  });
  it('envoi pour contre-signature puis activation ; accepter une demande ; proposer une convention', () => {
    expect(envoyerContreSignature('AV').ok).toBe(false); signerConvention('AV', { accord: true, mode: 'visage' });
    expect(simulerContreSignature('AV').ok).toBe(false); expect(envoyerContreSignature('AV').ok).toBe(true); expect(conventionDe('AV')?.envoyeeLe).toBeTruthy();
    expect(simulerContreSignature('AV').ok).toBe(true); expect(conventionDe('AV')?.statut).toBe('active');
    expect(accepterDemande('AV').ok).toBe(false); expect(accepterDemande('TR').ok).toBe(true); expect(conventionDe('TR')?.statut).toBe('brouillon');
    expect(proposerConvention('FX').ok).toBe(true); expect(proposerConvention('FX').ok).toBe(false); expect(proposerConvention('BX').ok).toBe(false); expect(proposerConvention('ZZ').ok).toBe(false);
  });
  it('confier un colis : convention active, colis pas encore parti, ligne desservie ; la part est figée ; règlement du partenaire', () => {
    avecHistorique(); demarrage();
    expect(confierColis('col-h1', 'AV')).toMatchObject({ ok: false, raison: expect.stringContaining('Pas de convention active') });
    changerPart('AV', -5); signerConvention('AV', { accord: true, mode: 'visage' }); envoyerContreSignature('AV'); simulerContreSignature('AV'); // 55 / 45
    expect(confierColis('col-h3', 'AV')).toMatchObject({ ok: false, raison: expect.stringContaining('ne dessert pas') });
    expect(confierColis('col-1', 'AV')).toMatchObject({ ok: false, raison: expect.stringContaining('déjà parti') }); expect(confierColis('nulle', 'AV').ok).toBe(false);
    const col = app.monde.colis.find((c) => c.id === 'col-h1')!, etapes = col.etapes.length;
    expect(confierColis('col-h1', 'AV').ok).toBe(true); expect(col.etapes).toHaveLength(etapes + 1); expect(col.etapes.at(-1)?.lieu).toContain('Alpha VIP');
    expect(confierColis('col-h1', 'AV')).toMatchObject({ ok: false, raison: 'Colis déjà confié' });
    changerPart('AV', 5); // sans effet : la convention est signée
    expect(etatInterAgences().liens[0]).toMatchObject({ colisId: 'col-h1', partBetaPct: 55, prix: 2500 });
    expect(confierColis('col-h2', 'AV').ok).toBe(true);
    const r = reglerPartenaire('AV'); expect(r).toMatchObject({ ok: true, montant: Math.round(2500 * 0.45) + Math.round(1000 * 0.45) }); expect(etatInterAgences().liens.every((l) => l.regleLe)).toBe(true);
    expect(reglerPartenaire('AV')).toMatchObject({ ok: false });
  });
});

describe('démarrage', () => {
  it('crée les tranches, charge l’historique une fois, coupe la session d’une personne suspendue', () => {
    demarrage();
    for (const k of ['patron', 'assistant', 'financement', 'interAgences']) expect(app.tranches[k]).toBeDefined();
    const n = app.monde.billets.length; expect(n).toBeGreaterThan(600); demarrage(); expect(app.monde.billets).toHaveLength(n);
    expect(app.session.personneId).toBe('p-luther'); personne('p-luther')!.actif = false; demarrage(); expect(app.session.personneId).toBeNull();
  });
});
