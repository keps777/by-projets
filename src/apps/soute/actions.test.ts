import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe } from '../../domain/compte.ts';
import { ErreurBagage } from '../bagages/actions.ts';
import { annulerDemandeBagage, bagageRevendable, conclureAchatsAutomatiques, droitPourVente, mesDemandes, mettreEnVenteBagage, publierDemandeBagage, retirerAnnonceBagage } from './actions.ts';
import { marcheSoute } from './lecture.ts';

const ALEX = 'ACC-0412', V812 = 'v-ae812', D812 = 'd-812';
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const bagage = (id: string) => app.monde.bagages.find((b) => b.id === id)!;
const erreur = (f: () => unknown): ErreurBagage | undefined => { try { f(); } catch (e) { return e as ErreurBagage; } return undefined; };
const params = { nombre: 1, prixMax: 95, mode: 'prevenir' as const, alerte: true };
/** Libère le 2e bagage d'Alex (annonce retirée) pour repartir d'un bagage « inutilisé ». */
const liberer = () => retirerAnnonceBagage(ALEX, 'b-alex');

describe('marché de la soute (lecture)', () => {
  it('7 proposés dès 90 $, plafond 150 $, aucune demande dans le monde de départ', () => {
    const m = marcheSoute(V812, ALEX)!;
    expect(m.offres.length).toBe(7); expect(m.offreMin).toBe(90); expect(m.plafond).toBe(150); expect(m.nbDemandes).toBe(0); expect(m.demandeMax).toBeUndefined();
    expect(m.compte).toEqual({ U: 14, O: 7, B: 0, L: 3 }); expect(m.carnet[0].offre.prix).toBe(130); expect(m.carnet.at(-1)?.offre.prix).toBe(90); expect(m.carnet.at(-1)?.meilleure).toBe(true);
    expect(m.offres.filter((o) => o.mienne).map((o) => o.id)).toEqual(['b-alex']); expect(m.transactions).toEqual([]);
  });
  it('les demandes ouvertes apparaissent groupées ; les offres d’un autre vol non', () => {
    publierDemandeBagage(ALEX, D812, { ...params, nombre: 2 }); const m = marcheSoute(V812, ALEX)!;
    expect(m.nbDemandes).toBe(2); expect(m.demandes).toMatchObject([{ prix: 95, nombre: 2, meilleure: true }]); expect(m.demandeMax).toBe(95);
    expect(marcheSoute('v-ae816', ALEX)!.offres).toEqual([]); expect(marcheSoute('inconnu', ALEX)).toBeUndefined();
  });
  it('une vente de la soute devient une transaction et une case « acheté »', () => {
    publierDemandeBagage(ALEX, D812, { nombre: 2, prixMax: 95, mode: 'auto', alerte: true });
    const m = marcheSoute(V812, ALEX)!; expect(m.compte.B).toBe(2); expect(m.transactions.map((t) => t.prix)).toEqual([95, 90]); expect(m.transactions.map((t) => t.variation)).toEqual([5, null]);
  });
});

describe('revendre mon bagage inutilisé', () => {
  it('le monde de départ : le 2e bagage d’Alex est déjà en vente à 100 $', () => {
    expect(bagageRevendable(ALEX, V812)).toMatchObject({ enVente: true, vendus: 0 }); expect(bagageRevendable(ALEX, V812).bagage?.prix).toBe(100);
    expect(droitPourVente(ALEX)?.id).toBe(D812); expect(droitPourVente(ALEX, 'd-puj')?.id).toBe('d-puj');
  });
  it('retirer l’annonce libère le bagage ; le remettre en vente le publie avec son prix', () => {
    liberer(); expect(bagage('b-alex').statut).toBe('inclus'); expect(bagageRevendable(ALEX, V812).enVente).toBe(false); expect(marcheSoute(V812, ALEX)!.offres.length).toBe(6);
    const b = mettreEnVenteBagage(ALEX, D812, 85); expect(b).toMatchObject({ id: 'b-alex', statut: 'en_vente', prix: 85 }); expect(marcheSoute(V812, ALEX)!.offreMin).toBe(85);
    expect((app.tranches.soute as { annonces: Record<string, number> }).annonces['b-alex']).toBeGreaterThan(0);
  });
  it('modifier le prix d’une annonce existante ne crée pas d’autre bagage', () => {
    const avant = app.monde.bagages.length; mettreEnVenteBagage(ALEX, D812, 120); expect(app.monde.bagages.length).toBe(avant); expect(bagage('b-alex').prix).toBe(120);
  });
  it('jamais au-dessus du prix compagnie, jamais sous le minimum', () => {
    expect(erreur(() => mettreEnVenteBagage(ALEX, D812, 151))?.code).toBe('prix'); expect(erreur(() => mettreEnVenteBagage(ALEX, D812, 151))?.message).toContain('150');
    expect(erreur(() => mettreEnVenteBagage(ALEX, D812, 0))?.code).toBe('prix'); expect(erreur(() => mettreEnVenteBagage(ALEX, D812, NaN))?.code).toBe('prix');
    expect(mettreEnVenteBagage(ALEX, D812, 150).prix).toBe(150);
  });
  it('refuse sans bagage inutilisé (franchise utilisée), sans droit à soi, après l’échéance', () => {
    expect(erreur(() => mettreEnVenteBagage(ALEX, 'd-puj', 100))?.code).toBe('introuvable');
    expect(erreur(() => mettreEnVenteBagage('ACC-0301', D812, 100))?.code).toBe('droit'); expect(erreur(() => mettreEnVenteBagage('inconnu', D812, 100))?.code).toBe('compte');
    const v = app.monde.vols.find((x) => x.id === V812)!; v.jour = '2026-10-12';
    expect(erreur(() => mettreEnVenteBagage(ALEX, D812, 100))?.code).toBe('echeance');
  });
  it('retirer une annonce qui n’est pas à soi ou plus en vente échoue', () => {
    expect(erreur(() => retirerAnnonceBagage(ALEX, 'b-2'))?.code).toBe('introuvable'); liberer(); expect(erreur(() => retirerAnnonceBagage(ALEX, 'b-alex'))?.code).toBe('introuvable');
  });
  it('prévient le passager dont la demande correspond à la nouvelle offre (si son alerte est active)', () => {
    retirerAnnonceBagage('ACC-0187', 'b-2'); const r = publierDemandeBagage(ALEX, D812, { nombre: 1, prixMax: 80, mode: 'prevenir', alerte: true });
    expect(r.correspondances).toBe(0); const avant = app.monde.notifications.filter((n) => n.compteId === ALEX).length;
    mettreEnVenteBagage('ACC-0187', 'd-8wc2', 85); expect(app.monde.notifications.filter((n) => n.compteId === ALEX).length).toBe(avant);
    mettreEnVenteBagage('ACC-0187', 'd-8wc2', 75);
    const n = app.monde.notifications.find((x) => x.compteId === ALEX && x.titre.startsWith('Un bagage correspond'));
    expect(n?.sous).toContain('75'); expect(n?.lien).toBe(`/bagages/ajouter?droit=${D812}`);
  });
  it('ne prévient pas si l’alerte est désactivée', () => {
    retirerAnnonceBagage('ACC-0187', 'b-2'); publierDemandeBagage(ALEX, D812, { nombre: 1, prixMax: 80, mode: 'prevenir', alerte: false });
    const avant = app.monde.notifications.filter((n) => n.compteId === ALEX).length; mettreEnVenteBagage('ACC-0187', 'd-8wc2', 75); expect(app.monde.notifications.filter((n) => n.compteId === ALEX).length).toBe(avant);
  });
});

describe('chercher un bagage sur ce vol', () => {
  it('publie N demandes au prix maximum, plafonné au prix compagnie', () => {
    const r = publierDemandeBagage(ALEX, D812, { ...params, nombre: 3 });
    expect(r.groupe).toMatchObject({ nombre: 3, prixMax: 95, mode: 'prevenir', statut: 'ouverte', volId: V812 }); expect(r.groupe.ref).toMatch(/^NXG-/);
    expect(app.monde.demandesBagage.filter((d) => d.statut === 'ouverte').length).toBe(3); expect(r.correspondances).toBe(2);
    expect(erreur(() => publierDemandeBagage(ALEX, D812, { ...params, prixMax: 151 }))?.code).toBe('prix'); expect(erreur(() => publierDemandeBagage(ALEX, D812, { ...params, nombre: 5 }))?.code).toBe('quantite');
    expect(erreur(() => publierDemandeBagage(ALEX, D812, { ...params, nombre: 0 }))?.code).toBe('quantite'); expect(erreur(() => publierDemandeBagage(ALEX, D812, { ...params, prixMax: 0 }))?.code).toBe('prix');
    expect(erreur(() => publierDemandeBagage('ACC-0301', D812, params))?.code).toBe('droit');
  });
  it('prévient le demandeur quand une offre correspond déjà (mode « prévenu »), sans acheter', () => {
    const avant = app.monde.notifications.filter((n) => n.compteId === ALEX).length; const r = publierDemandeBagage(ALEX, D812, params);
    expect(r.achat).toBeUndefined(); expect(bagage('b-2').statut).toBe('en_vente');
    expect(app.monde.notifications.filter((n) => n.compteId === ALEX).length).toBe(avant + 1);
  });
  it('sans alerte, aucune notification de correspondance', () => {
    const avant = app.monde.notifications.filter((n) => n.compteId === ALEX).length; publierDemandeBagage(ALEX, D812, { ...params, alerte: false });
    expect(app.monde.notifications.filter((n) => n.compteId === ALEX).length).toBe(avant);
  });
  it('achat automatique : les moins chères ≤ prix maximum sont achetées, la demande est servie', () => {
    const r = publierDemandeBagage(ALEX, D812, { nombre: 2, prixMax: 95, mode: 'auto', alerte: true });
    expect(r.achat?.lignes.map((l) => l.prix)).toEqual([90, 95]); expect(bagage('b-2').statut).toBe('vendu'); expect(bagage('b-4').statut).toBe('vendu');
    expect(r.groupe.statut).toBe('servie'); expect(app.monde.demandesBagage.every((d) => d.statut === 'servie')).toBe(true); expect(mesDemandes(ALEX, V812)).toEqual([]);
    expect(compteDe('ACC-0187')!.solde).toBeGreaterThan(0);
  });
  it('achat automatique : s’arrête aux offres qui respectent le prix maximum', () => {
    const r = publierDemandeBagage(ALEX, D812, { nombre: 3, prixMax: 90, mode: 'auto', alerte: true });
    expect(r.achat?.lignes.length).toBe(1); expect(r.groupe.statut).toBe('ouverte'); expect(mesDemandes(ALEX, V812)).toMatchObject([{ nombre: 2, prixMax: 90, mode: 'auto' }]);
  });
  it('achat automatique différé : une offre qui arrive plus tard est achetée à la mise en vente', () => {
    const r = publierDemandeBagage(ALEX, D812, { nombre: 1, prixMax: 60, mode: 'auto', alerte: true }); expect(r.achat).toBeUndefined();
    app.monde.bagages.push({ id: 'b-nouveau', volId: V812, detenteurId: 'ACC-0301', kg: 23, prix: 60, statut: 'en_vente' });
    expect(conclureAchatsAutomatiques(V812).length).toBe(1); expect(bagage('b-nouveau').statut).toBe('vendu');
  });
  it('mes demandes : groupe, puis annulation de toutes ses copies', () => {
    const r = publierDemandeBagage(ALEX, D812, { ...params, nombre: 2, prixMax: 60 }); expect(mesDemandes(ALEX, V812)).toMatchObject([{ id: r.groupe.id, nombre: 2, prixMax: 60 }]);
    annulerDemandeBagage(ALEX, r.groupe.id); expect(mesDemandes(ALEX, V812)).toEqual([]); expect(app.monde.demandesBagage.every((d) => d.statut === 'annulee')).toBe(true);
    expect(erreur(() => annulerDemandeBagage(ALEX, 'inconnue'))?.code).toBe('introuvable');
  });
  it('une demande isolée (publiée depuis « Ajouter des bagages ») est listée et annulable', () => {
    app.monde.demandesBagage.push({ id: 'db-x', compteId: ALEX, volId: V812, kg: 23, prixMax: 80, creeLe: 1, statut: 'ouverte' });
    expect(mesDemandes(ALEX, V812)).toEqual([{ id: 'db-x', nombre: 1, prixMax: 80 }]); annulerDemandeBagage(ALEX, 'db-x'); expect(mesDemandes(ALEX, V812)).toEqual([]);
  });
});
