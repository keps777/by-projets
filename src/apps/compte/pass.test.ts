import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { creerCompte, compteDe } from '../../domain/compte.ts';
import { PRIX_PASS } from '../../core/regles.ts';
import { COMPARAISON, NIVEAUX, commissionDe, niveauPour, numeroMembre, pct, prixPass, resilier, souscrire, transactionsAnnee } from './pass.ts';
import { ajouterProche, initiales, nomCourt, prochesDe, retirerProche } from './proches.ts';

const ALEX = 'ACC-0412', MAINTENANT = Date.parse('2026-10-12T09:00');
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); app.session.compteId = ALEX; });

describe('Pass : textes et niveaux', () => {
  it('formate les taux et le prix à partir des constantes', () => { expect(pct(0.125)).toBe('12,5 %'); expect(pct(0.1)).toBe('10 %'); expect(prixPass()).toBe('9,99 $'); expect(PRIX_PASS).toBe(9.99); });
  it('trois niveaux selon les transactions des douze derniers mois (hypothèse)', () => { expect(niveauPour(0).nom).toBe('Pass'); expect(niveauPour(4).nom).toBe('Pass'); expect(niveauPour(5).nom).toBe('Pass Pro'); expect(niveauPour(19).nom).toBe('Pass Pro'); expect(niveauPour(20).nom).toBe('Pass Premium'); expect(NIVEAUX).toHaveLength(3); });
  it('compte les achats, reventes et transferts de la chaîne sur 12 mois, pas les nommages', () => {
    const n = transactionsAnnee(app.monde, ALEX, MAINTENANT); expect(n).toBeGreaterThan(0);
    const d = app.monde.droits.find((x) => x.detenteurId === ALEX)!; d.chaine.push({ id: 'm-x', quand: MAINTENANT - 1000, type: 'nommage', de: ALEX, vers: ALEX, prix: 0 });
    expect(transactionsAnnee(app.monde, ALEX, MAINTENANT)).toBe(n);
    d.chaine.push({ id: 'm-y', quand: MAINTENANT - 400 * 86_400_000, type: 'revente', de: 'x', vers: ALEX, prix: 1 }); expect(transactionsAnnee(app.monde, ALEX, MAINTENANT)).toBe(n);
    d.chaine.push({ id: 'm-z', quand: MAINTENANT - 86_400_000, type: 'revente', de: 'x', vers: ALEX, prix: 1 }); expect(transactionsAnnee(app.monde, ALEX, MAINTENANT)).toBe(n + 1);
  });
  it('numéro de membre à 6 chiffres', () => { expect(numeroMembre('ACC-0412')).toBe('000 412'); expect(numeroMembre('ACC-7')).toBe('000 007'); });
  it('le tableau comparatif suit les taux du produit', () => { const c = COMPARAISON.find((r) => r.fonction.startsWith('Commission'))!; expect([c.gratuit, c.pass]).toEqual(['12,5 %', '10 %']); expect(COMPARAISON.at(-1)!.pass).toBe('9,99 $'); });
});

describe('Pass : souscrire et résilier', () => {
  const sansPass = (id: string, solde = 0) => { const c = compteDe(id)!; c.pass = { actif: false }; c.solde = solde; return c; };
  it('exige un compte', () => { expect(souscrire(null).ok).toBe(false); expect(souscrire('ACC-9999').ok).toBe(false); });
  it('refuse un Pass déjà actif', () => { expect(compteDe(ALEX)!.pass.actif).toBe(true); expect(souscrire(ALEX).ok).toBe(false); });
  it('active par carte de démonstration quand le solde ne suffit pas, sans ligne au grand livre', () => {
    const c = sansPass(ALEX, 0); const avant = app.monde.ecritures.length; const r = souscrire(ALEX);
    expect(r).toEqual({ ok: true, mode: 'carte' }); expect(c.pass.actif).toBe(true); expect(c.pass.depuis).toBeGreaterThan(0); expect(app.monde.ecritures.length).toBe(avant);
  });
  it('paie sur le solde NexG quand il suffit : écriture « pass » négative', () => {
    const c = sansPass(ALEX, 100); const r = souscrire(ALEX); expect(r).toEqual({ ok: true, mode: 'solde' });
    expect(app.monde.ecritures.at(-1)).toMatchObject({ type: 'pass', montant: -9.99, solde: 90.01 }); expect(c.solde).toBe(90.01);
  });
  it('change la commission applicable, puis résilie', () => {
    sansPass(ALEX, 0); expect(commissionDe(ALEX)).toBe('12,5 %'); souscrire(ALEX); expect(commissionDe(ALEX)).toBe('10 %');
    expect(resilier(ALEX)).toBe(true); expect(compteDe(ALEX)!.pass.actif).toBe(false); expect(commissionDe(ALEX)).toBe('12,5 %'); expect(resilier(ALEX)).toBe(false);
    expect(app.monde.notifications.some((n) => n.titre === 'Le Pass NexG est résilié')).toBe(true);
  });
});

describe('Proches', () => {
  it('liste les proches du compte', () => { expect(prochesDe(ALEX).map((p) => p.id)).toEqual(['ACC-0187', 'ACC-0233']); expect(nomCourt(compteDe(ALEX)!)).toBe('Alex T.'); expect(initiales(compteDe(ALEX)!)).toBe('AT'); });
  it('ajoute un proche inscrit par téléphone ou courriel', () => {
    const r = ajouterProche(ALEX, '514 555 0301'); expect(r.ok && r.proche.id).toBe('ACC-0301'); expect(compteDe(ALEX)!.proches).toContain('ACC-0301');
    const n = creerCompte({ prenom: 'Léa', nom: 'Roy', email: 'lea@exemple.test' }); const r2 = ajouterProche(ALEX, ' LEA@exemple.test '); expect(r2.ok && r2.proche.id).toBe(n.id);
  });
  it('refuse un doublon, soi-même, un inconnu et un champ vide', () => {
    expect(ajouterProche(ALEX, '514 555 0187').ok).toBe(false); expect(ajouterProche(ALEX, 'alex.tremblay@exemple.test').ok).toBe(false);
    const inconnu = ajouterProche(ALEX, 'personne@exemple.test'); expect(inconnu.ok).toBe(false); expect(!inconnu.ok && inconnu.message).toContain('Aucun compte'); expect(ajouterProche(ALEX, '  ').ok).toBe(false);
    expect(compteDe(ALEX)!.proches).toEqual(['ACC-0187', 'ACC-0233']);
  });
  it('retire un proche', () => { expect(retirerProche(ALEX, 'ACC-0187')).toBe(true); expect(compteDe(ALEX)!.proches).toEqual(['ACC-0233']); expect(retirerProche(ALEX, 'ACC-0187')).toBe(false); });
});
