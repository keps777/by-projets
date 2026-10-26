import { beforeEach, describe, expect, it } from 'vitest';
import { app } from '../../data/store.svelte.ts';
import { etatInitial } from '../../data/seed.ts';
import { compteDe } from '../../domain/compte.ts';
import { ErreurBagage, acheterBagages, annulerDemande, confirmerTransfert, demanderBagage, remettreEnAttente, transfertPar, trancheBagages } from './actions.ts';
import {
  KG_BAGAGE, ajoutPossible, choisir, compteursSoute, comparerVols, dejaAjoutes, droitsAVenir, ecartComptoir, etiquettes, offresSoute, partDe, plafondBagage, prochainDroitId, quantiteValide,
  resoudreDroit, resumeFranchise, titreFranchise, volsAEssayer
} from './soute.ts';

const ALEX = 'ACC-0412', V812 = 'v-ae812', D812 = 'd-812';
beforeEach(() => { for (const k of Object.keys(app)) delete (app as unknown as Record<string, unknown>)[k]; Object.assign(app, etatInitial()); });
const bagage = (id: string) => app.monde.bagages.find((b) => b.id === id)!;
const erreur = (f: () => unknown): ErreurBagage | undefined => { try { f(); } catch (e) { return e as ErreurBagage; } return undefined; };

describe('soute : offres du même vol', () => {
  it('trie par prix croissant, hors les offres de l’acheteur', () => {
    expect(offresSoute(V812).length).toBe(7);
    expect(offresSoute(V812, ALEX).map((b) => b.prix)).toEqual([90, 95, 100, 110, 120, 130]);
    expect(offresSoute(V812, ALEX).every((b) => b.detenteurId !== ALEX)).toBe(true);
  });
  it('écarte les offres au-dessus du plafond (prix compagnie) et celles qui ne sont plus en vente', () => {
    expect(plafondBagage(app.monde.vols.find((v) => v.id === V812)!)).toBe(150);
    bagage('b-2').prix = 151; bagage('b-4').statut = 'vendu';
    expect(offresSoute(V812, ALEX).map((b) => b.id)).not.toContain('b-2'); expect(offresSoute(V812, ALEX).map((b) => b.id)).not.toContain('b-4');
    bagage('b-3').prix = 150; expect(offresSoute(V812, ALEX).map((b) => b.id)).toContain('b-3');
  });
  it('ne mélange jamais deux vols : l’offre d’un autre vol, même compagnie, n’apparaît pas', () => {
    app.monde.bagages.push({ id: 'b-x', volId: 'v-ae816', detenteurId: 'ACC-0301', kg: 23, prix: 50, statut: 'en_vente' });
    expect(offresSoute(V812).map((b) => b.id)).not.toContain('b-x'); expect(offresSoute('v-ae816').map((b) => b.id)).toEqual(['b-x']);
  });
  it('compte les bagages proposés et les demandes ouvertes', () => {
    expect(compteursSoute(V812)).toEqual({ proposes: 7, demandes: 0 });
    demanderBagage(ALEX, D812, 80); expect(compteursSoute(V812).demandes).toBe(1);
  });
  it('compare au comptoir avec un écart signé', () => {
    expect(ecartComptoir(90, 150)).toMatchObject({ abs: -60, libelle: '−60 $', moinsCher: true });
    expect(ecartComptoir(170, 150).libelle).toBe('+20 $'); expect(ecartComptoir(150, 150).moinsCher).toBe(false);
    expect(partDe(90, 150)).toBe(60); expect(partDe(300, 150)).toBe(100); expect(partDe(5, 0)).toBe(0);
    expect(choisir(offresSoute(V812, ALEX), 2).map((b) => b.prix)).toEqual([90, 95]);
  });
  it('borne la quantité entre 1 et ce qui est possible', () => {
    expect(ajoutPossible(ALEX, V812)).toBe(3); expect(quantiteValide(5, 3)).toBe(3); expect(quantiteValide(0, 3)).toBe(1); expect(quantiteValide(NaN, 3)).toBe(1); expect(quantiteValide(2, 0)).toBe(0);
  });
});

describe('droit de référence', () => {
  it('prend le prochain droit du compte, ou celui de ?droit= s’il est à lui', () => {
    expect(droitsAVenir(ALEX)[0].id).toBe(D812); expect(resoudreDroit(ALEX)?.id).toBe(D812); expect(prochainDroitId(ALEX)).toBe(D812);
    expect(resoudreDroit(ALEX, 'd-puj')?.id).toBe('d-puj'); expect(resoudreDroit(ALEX, 'd-8wc2')?.id).toBe(D812);
    expect(resoudreDroit('adm-01')).toBeUndefined();
  });
});

describe('étiquettes et franchise', () => {
  it('2 bagages inclus dont 1 en vente : 1 utilisé, 1 sans valise', () => {
    const e = etiquettes(app.monde.droits.find((d) => d.id === D812)!);
    expect(e.map((x) => x.genre)).toEqual(['utilise', 'en_vente']); expect(e[1]).toMatchObject({ rang: 2, sur: 2, kg: 23, prix: 100 });
    const r = resumeFranchise(e); expect(r).toMatchObject({ inclus: 2, utilises: 1, libres: 1, enVente: 1 }); expect(titreFranchise(r)).toEqual(['2 bagages inclus,', '1 sans valise.']);
  });
  it('un droit libre non proposé est « inutilisé » ; sans ligne de soute, tout est utilisé', () => {
    bagage('b-alex').statut = 'inclus'; expect(etiquettes(app.monde.droits.find((d) => d.id === D812)!).map((x) => x.genre)).toEqual(['utilise', 'inutilise']);
    app.monde.bagages = app.monde.bagages.filter((b) => b.id !== 'b-alex'); const e = etiquettes(app.monde.droits.find((d) => d.id === D812)!);
    expect(e.map((x) => x.genre)).toEqual(['utilise', 'utilise']); expect(titreFranchise(resumeFranchise(e))).toEqual(['2 bagages inclus,', 'tous utilisés.']);
  });
  it('un bagage vendu donne « 1 vendu »', () => {
    bagage('b-alex').statut = 'vendu'; const r = resumeFranchise(etiquettes(app.monde.droits.find((d) => d.id === D812)!)); expect(titreFranchise(r)).toEqual(['2 bagages inclus,', '1 vendu.']);
  });
});

describe('acheter des bagages', () => {
  it('prend les moins chères, crédite chaque vendeur net de commission et transfère le droit', () => {
    const t = acheterBagages(ALEX, D812, 2);
    expect(t.total).toBe(185); expect(t.lignes.map((l) => l.prix)).toEqual([90, 95]); expect(t.confirme).toBe(false); expect(t.ref).toMatch(/^NXG-/);
    // vendeur b-2 : ACC-0187, sans Pass → 90 − 12,5 % (11,25) = 78,75
    const v = compteDe('ACC-0187')!; expect(v.solde).toBe(78.75);
    const l = app.monde.ecritures.filter((e) => e.compteId === 'ACC-0187'); expect(l.map((e) => [e.type, e.montant])).toEqual([['bagage', 90], ['commission', -11.25]]); expect(l[1].solde).toBe(78.75); expect(l[1].hypothese).toBe(true);
    expect(compteDe('ACC-0301')!.solde).toBe(83.12); // 95 − 11,875 arrondi à 11,88
    expect(bagage('b-2').statut).toBe('vendu'); expect(bagage('b-4').statut).toBe('vendu');
    const acquis = app.monde.bagages.filter((b) => b.detenteurId === ALEX && b.statut === 'achete'); expect(acquis.map((b) => [b.prix, b.de, b.volId])).toEqual([[90, 'ACC-0187', V812], [95, 'ACC-0301', V812]]);
    expect(offresSoute(V812, ALEX).map((b) => b.prix)).toEqual([100, 110, 120, 130]); expect(dejaAjoutes(ALEX, V812)).toBe(2);
  });
  it('applique la commission réduite du Pass au vendeur membre', () => {
    app.monde.bagages.find((b) => b.id === 'b-7')!.prix = 80; // ACC-0402 (Pass) devient le moins cher
    acheterBagages(ALEX, D812, 1); expect(compteDe('ACC-0402')!.solde).toBe(72); // 80 − 10 % (8)
  });
  it('avec le solde NexG : débite l’acheteur et refuse si insuffisant', () => {
    expect(erreur(() => acheterBagages('ACC-0187', 'd-8wc2', 3, 'solde'))?.code).toBe('solde'); // 0 $ de solde
    const avant = compteDe(ALEX)!.solde; acheterBagages(ALEX, D812, 2, 'solde'); expect(compteDe(ALEX)!.solde).toBe(avant - 185);
    expect(app.monde.ecritures.at(-1)).toMatchObject({ compteId: ALEX, type: 'bagage', montant: -185 });
  });
  it('prévient le vendeur et l’acheteur', () => {
    compteDe('ACC-0187')!.prefsNotif = 'tout'; compteDe(ALEX)!.prefsNotif = 'tout';
    acheterBagages(ALEX, D812, 1);
    const nv = app.monde.notifications.find((n) => n.compteId === 'ACC-0187')!; expect(nv.titre).toBe('Bagage vendu : AE 812'); expect(nv.sous).toContain('78,75');
    expect(app.monde.notifications.find((n) => n.compteId === ALEX && n.titre.includes('ajouté'))?.lien).toBe('/bagages/transfere');
  });
  it('refuse : plus de 3, moins de 1, trop peu d’offres, droit d’autrui, après l’échéance', () => {
    expect(erreur(() => acheterBagages(ALEX, D812, 0))?.code).toBe('quantite'); expect(erreur(() => acheterBagages(ALEX, D812, 4))?.code).toBe('quantite'); expect(erreur(() => acheterBagages(ALEX, D812, 1.5))?.code).toBe('quantite');
    acheterBagages(ALEX, D812, 2); expect(erreur(() => acheterBagages(ALEX, D812, 2))?.code).toBe('limite');
    expect(erreur(() => acheterBagages(ALEX, 'd-8wc2', 1))?.code).toBe('droit'); expect(erreur(() => acheterBagages('ACC-0319', D812, 1))?.code).toBe('droit');
    expect(erreur(() => acheterBagages('ACC-0999', D812, 1))?.code).toBe('compte');
  });
  it('refuse quand il reste moins d’offres que demandé, sans rien écrire', () => {
    for (const b of app.monde.bagages) if (b.detenteurId !== ALEX && b.id !== 'b-2') b.statut = 'vendu';
    const e = erreur(() => acheterBagages(ALEX, D812, 2)); expect(e?.code).toBe('offres'); expect(e?.message).toContain('Seulement 1 bagage disponible');
    expect(bagage('b-2').statut).toBe('en_vente'); expect(trancheBagages().transferts).toHaveLength(0);
  });
  it('refuse après l’échéance de nommage (J-1)', () => {
    app.monde.vols.find((v) => v.id === V812)!.jour = '2026-10-12'; // départ le jour même : l’échéance est déjà passée
    expect(erreur(() => acheterBagages(ALEX, D812, 1))?.code).toBe('echeance');
  });
  it('n’achète jamais ses propres offres', () => {
    for (const b of app.monde.bagages) if (b.detenteurId !== ALEX) b.statut = 'vendu';
    expect(erreur(() => acheterBagages(ALEX, D812, 1))?.message).toBe('Aucun bagage disponible sur ce vol pour l’instant.'); expect(bagage('b-alex').statut).toBe('en_vente');
  });
  it('le droit acheté apparaît en étiquette « en attente », puis « ajouté » à la confirmation de la compagnie', () => {
    const t = acheterBagages(ALEX, D812, 2); const droit = app.monde.droits.find((d) => d.id === D812)!;
    expect(etiquettes(droit).map((x) => x.genre)).toEqual(['utilise', 'en_vente', 'attente', 'attente']);
    expect(transfertPar(null, ALEX)?.id).toBe(t.id); confirmerTransfert(t.id, ALEX);
    expect(etiquettes(droit).map((x) => x.genre)).toEqual(['utilise', 'en_vente', 'ajoute', 'ajoute']); expect(trancheBagages().transferts[0].confirme).toBe(true);
    expect(resumeFranchise(etiquettes(droit))).toMatchObject({ total: 4, ajoutes: 2 });
    remettreEnAttente(t.id, ALEX); expect(etiquettes(droit).at(-1)?.genre).toBe('attente');
    expect(erreur(() => confirmerTransfert('inconnu', ALEX))?.code).toBe('introuvable');
  });
});

describe('demander un bagage', () => {
  it('publie une demande plafonnée au prix compagnie', () => {
    const d = demanderBagage(ALEX, D812, 80); expect(d).toMatchObject({ compteId: ALEX, volId: V812, kg: KG_BAGAGE, prixMax: 80, statut: 'ouverte' }); expect(app.monde.demandesBagage).toHaveLength(1);
    expect(erreur(() => demanderBagage(ALEX, D812, 151))?.code).toBe('prix'); expect(erreur(() => demanderBagage(ALEX, D812, 0))?.code).toBe('prix');
    expect(erreur(() => demanderBagage(ALEX, 'd-8wc2', 80))?.code).toBe('droit'); expect(erreur(() => demanderBagage(ALEX, D812, 80, 30))?.code).toBe('quantite');
  });
  it('prévient les vendeurs dont l’offre correspond, et peut être annulée', () => {
    compteDe('ACC-0187')!.prefsNotif = 'tout';
    const d = demanderBagage(ALEX, D812, 95); expect(app.monde.notifications.some((n) => n.compteId === 'ACC-0187' && n.titre.includes('cherche un bagage'))).toBe(true);
    expect(annulerDemande(ALEX, d.id).statut).toBe('annulee'); expect(erreur(() => annulerDemande('ACC-0319', d.id))?.code).toBe('introuvable');
  });
});

describe('vol identique', () => {
  it('même numéro et même date, sinon le vol est différent', () => {
    expect(comparerVols({ numero: '812', jour: '2026-12-14' }, { numero: '812', jour: '2026-12-14' }).memeVol).toBe(true);
    const a = comparerVols({ numero: '812', jour: '2026-12-14' }, { numero: '814', jour: '2026-12-14' }); expect(a.memeVol).toBe(false); expect(a.numero.identique).toBe(false); expect(a.date.identique).toBe(true);
    const b = comparerVols({ numero: '812', jour: '2026-12-14' }, { numero: '812', jour: '2026-12-15' }); expect(b.memeVol).toBe(false); expect(b.date.identique).toBe(false);
  });
  it('propose d’abord les autres droits du compte, puis deux exemples', () => {
    const l = volsAEssayer(app.monde.droits.find((d) => d.id === D812)!);
    expect(l.slice(-2).map((x) => [x.numero, x.jour])).toEqual([['814', '2026-12-14'], ['812', '2026-12-15']]); expect(l.filter((x) => x.origine === 'portefeuille').length).toBe(l.length - 2);
    expect(l.every((x) => !(x.numero === '812' && x.jour === '2026-12-14'))).toBe(true);
  });
});
