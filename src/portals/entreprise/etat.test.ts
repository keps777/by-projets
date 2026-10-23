import { beforeEach, describe, expect, it } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { avancerSuivi, champsDe, emettreAttestation, enregistrerParametres, envoyerDossier, importerSalaries, inviter, modifierSalaire, simulerInscription, simulerValidationDossier, validerRetenue } from './actions.ts';
import { demoEntreprise, ent, entrepriseDe, partEmployeurDuPass } from './etat.ts';
import { analyserImport } from '../../core/entreprise.ts';
import { csvRetenues, lignes, statistiques } from './vues.ts';
import '../../screens/coffres/demarrage.ts'; // le portail lit le versement des coffres via le moteur de paie

describe('portail entreprise : compte démo', () => {
  beforeEach(() => reinitialiser('demo'));
  it("Aïcha apparaît dans le tableau avec ses données vivantes, sans modifier son compte", () => {
    const avant = JSON.stringify({ c: app.compte, cr: app.credits, s: app.solde, m: app.mouvements, n: app.notifications });
    const a = lignes().find((l) => l.membre)!;
    expect(a).toMatchObject({ nom: 'Aïcha Ndiba', niveau: 'PRO', pass: 'famille', salaire: 520_000, affiche: 'Validé' });
    expect(a.retenue).toMatchObject({ pass: 12_500, credit: 44_000, coffre: 12_500, total: 69_000 });
    app.credits[0].mensualite = 50_000; // le tableau suit le compte membre
    expect(lignes().find((l) => l.membre)!.retenue.credit).toBe(50_000);
    app.credits[0].mensualite = 44_000;
    emettreAttestation('s-aicha'); modifierSalaire('s-jp', '950000');
    expect(JSON.stringify({ c: app.compte, cr: app.credits, s: app.solde, m: app.mouvements, n: app.notifications })).toBe(avant);
  });
  it('partEmployeurDuPass : moitié du Pass Famille, plafonnée, 0 hors partenaire ou dossier non validé', () => {
    expect(partEmployeurDuPass(app.compte)).toBe(12_500);
    expect(partEmployeurDuPass(null)).toBe(0);
    expect(partEmployeurDuPass({ ...app.compte!, employeur: 'AUTRE', telephone: '600000000' })).toBe(0);
    expect(partEmployeurDuPass({ ...app.compte!, pass: 'essentiel' })).toBe(4_500);
    ent().entreprise!.part = 1;
    expect(partEmployeurDuPass(app.compte)).toBe(12_500);
    expect(partEmployeurDuPass({ ...app.compte!, pass: 'essentiel' })).toBe(9_000);
    ent().entreprise!.part = 0;
    expect(partEmployeurDuPass(app.compte)).toBe(0);
    ent().entreprise!.part = 0.5; ent().entreprise!.statut = 'envoye';
    expect(partEmployeurDuPass(app.compte)).toBe(0);
  });
  it('lecture sans tranche : valeur par défaut, sans écrire dans le compte', () => {
    expect('entreprise' in app.tranches).toBe(false);
    expect(entrepriseDe(app.compte)?.raisonSociale).toBe('NDIBA LOGISTIQUE');
    expect('entreprise' in app.tranches).toBe(false);
  });
  it('statistiques et fichier de retenues : seules les retenues validées, plafonnées à 33 %', () => {
    const st = statistiques();
    expect(st).toMatchObject({ inscrits: 10, aValider: 2, plafonnes: 1, effectif: 260 });
    expect(st.totalRetenues).toBe(708_900);
    const csv = csvRetenues(lignes(), '2026-10-28');
    expect(csv.split('\r\n').filter(Boolean)).toHaveLength(1 + 8);
    expect(csv).toContain('NDL-0097;Ibrahim Bello;655100097;12500;99000;0;111500;Plafonné;2026-10-28');
    expect(csv).not.toContain('Estelle');
    expect(validerRetenue('s-estelle')).toBe(true);
    expect(statistiques().totalRetenues).toBe(708_900 + 29_500);
    expect(validerRetenue('s-estelle')).toBe(false);
  });
  it('coût employeur = somme des parts de Pass', () => {
    // 10 inscrits : 4 familles x 12 500 (Aïcha, Jean-Paul, Ibrahim, Mireille) + 5 essentiels x 4 500 + 1 premium x 12 500
    expect(statistiques().coutEmployeur).toBe(4 * 12_500 + 5 * 4_500 + 12_500);
  });
  it('invités : inscription simulée, import sans doublon, invitations', () => {
    expect(simulerInscription('s-prisca')).toBe(true);
    expect(lignes().find((l) => l.id === 's-prisca')).toMatchObject({ affiche: 'Nouveau', pass: 'essentiel' });
    const a = analyserImport('Ana;NDL-0412;691000001\nBob;NDL-5000;691000002\nCyr;NDL-5001;691000002', { matricules: ent().salaries.map((s) => s.matricule), telephones: ent().salaries.map((s) => s.telephone) });
    expect(importerSalaries(a.lignes)).toBe(1);
    expect(importerSalaries(a.lignes)).toBe(0);
    const r = inviter('691000003\n691000003\nabc');
    expect(r.valides).toEqual(['691000003']); expect(r.erreurs).toHaveLength(2);
  });
  it('attestation : refusée sans salaire ou pour un invité, numérotée sinon', () => {
    expect(emettreAttestation('s-prisca')).toMatchObject({ ok: false });
    const a = emettreAttestation('s-herve');
    expect(a).toMatchObject({ ok: true }); if (a.ok) expect(a.attestation).toMatchObject({ numero: `ATT-${new Date().getFullYear()}-0001`, salaire: 210_000 });
    expect(modifierSalaire('s-jp', 'abc')).toBeTruthy();
    expect(modifierSalaire('s-aicha', '600000')).toContain('compte AssureMe');
  });
  it('suivi du fichier de paie : généré → intégré → reversé', () => {
    expect(avancerSuivi('2026-10-28')).toBe('integre'); expect(avancerSuivi('2026-10-28')).toBe('reverse'); expect(avancerSuivi('2026-10-28')).toBeNull();
  });
  it('paramètres : validation et mise à jour', () => {
    const base = { contactNom: 'RH', contactFonction: 'DRH', contactTelephone: '6 91 22 48 21', jourPaie: '5', part: 1 as const };
    expect(enregistrerParametres({ ...base, jourPaie: '0' })).toMatchObject({ ok: false });
    expect(enregistrerParametres(base)).toEqual({ ok: true });
    expect(ent().entreprise).toMatchObject({ jourPaie: 5, part: 1 });
  });
});

describe('portail entreprise : compte vierge', () => {
  beforeEach(() => reinitialiser('vierge'));
  it('état vide : pas d’entreprise, pas de salarié, pas de part employeur', () => {
    expect(lignes()).toEqual([]);
    expect(partEmployeurDuPass(null)).toBe(0);
  });
  it("inscription : dossier envoyé (sans effet) puis validé, modification conserve le code", () => {
    const c = { ...champsDe(demoEntreprise().entreprise!), signature: 'Ndiba RH', convention: true, niu: 'M1', };
    expect(envoyerDossier(c)).toMatchObject({ ok: false, etape: 1 });
    const bon = { ...c, niu: 'M012345678901' };
    expect(envoyerDossier(bon)).toEqual({ ok: true });
    const code = ent().entreprise!.code;
    expect(ent().entreprise).toMatchObject({ statut: 'envoye', part: 0.5, jourPaie: 28, effectif: 260 });
    expect(envoyerDossier({ ...bon, effectif: '300' })).toEqual({ ok: true });
    expect(ent().entreprise).toMatchObject({ code, effectif: 300 });
    app.compte = { id: 'u', prenom: 'A', nom: 'B', telephone: '690000000', ville: 'Douala', quartier: '', employeur: 'ndiba logistique', salaireNet: 400_000, jourPaie: 28, anciennete: '1 an', pass: 'famille', numeroMembre: 'AM1', cree: Date.now() };
    expect(partEmployeurDuPass(app.compte)).toBe(0);
    simulerValidationDossier();
    expect(partEmployeurDuPass(app.compte)).toBe(12_500);
    expect(lignes().find((l) => l.membre)).toMatchObject({ nom: 'A B', affiche: 'Nouveau' }); // le membre est salarié de cette entreprise
  });
});
