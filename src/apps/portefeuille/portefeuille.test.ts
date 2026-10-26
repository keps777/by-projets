import { beforeEach, describe, expect, it } from 'vitest';
import { etatInitial } from '../../data/seed.ts';
import type { Monde } from '../../domain/types.ts';
import { agregatPortefeuille } from '../voyager/portefeuille.ts';
import { bagagesEnVente, billetsCedesOuVoyages, carteDe, enTete, HORIZON_NOMMER_JOURS, intentionsSurVol, origineLibelle, ordinal, titreActifs, transactions, vuePortefeuille } from './portefeuille.ts';

const NOW = Date.parse('2026-10-12T09:00'), ALEX = 'ACC-0412';
let m: Monde;
beforeEach(() => { m = etatInitial().monde; });
const nbsp = (s: string) => s.replace(/ /g, ' ');

describe('vuePortefeuille (monde de démonstration)', () => {
  it('trois droits actifs triés par départ, agrégat identique à celui de l’accueil', () => {
    const v = vuePortefeuille(m, ALEX, NOW);
    expect(v.actifs.map((c) => c.droitId)).toEqual(['d-812', 'd-puj', 'd-ppt']); expect(v.titre).toBe('3 droits de voyage actifs');
    expect(v.agregat).toEqual(agregatPortefeuille(m, ALEX, NOW)); expect(v.agregat).toMatchObject({ nb: 3, equivalent: 4730, paye: 3050 }); expect(v.agregat.ecart.abs).toBe(1680);
  });
  it('« En revente » compte le droit annoncé et le droit de bagage ; l’historique liste les achats du plus récent au plus ancien', () => {
    const v = vuePortefeuille(m, ALEX, NOW);
    expect(v.revente.map((c) => c.droitId)).toEqual(['d-hav']); expect(v.bagages).toHaveLength(1); expect(v.nbRevente).toBe(2);
    expect(v.transactions.map((t) => t.titre)).toEqual(['Drop membre obtenu', 'Achat en revente', 'Achat en revente', 'Achat neuf']);
    expect(v.cedes).toEqual([]);
  });
});
describe('cartes', () => {
  it('statut À nommer à moins de 90 jours de l’échéance, Détenu au-delà ; J-N depuis l’échéance', () => {
    const c = Object.fromEntries(vuePortefeuille(m, ALEX, NOW).actifs.map((x) => [x.droitId, x]));
    expect(c['d-812']).toMatchObject({ statut: 'a_nommer', statutLib: 'À nommer', jEcheance: 'J-62', echeance: '13 déc. 18:05', de: 'YUL', vers: 'CDG', ville: 'Paris', enTete: 'Aérolys · Vol 812', date: 'Paris · lun. 14 déc. 2026' });
    expect(c['d-puj']).toMatchObject({ statut: 'detenu', origine: 'Obtenu via Drop' }); expect(c['d-ppt']).toMatchObject({ statut: 'detenu', origine: 'Revente · 3e détenteur', enTete: 'Aérolys · 1 escale LAX' });
    expect(HORIZON_NOMMER_JOURS).toBe(90);
  });
  it('prix payé, prix équivalent et écart signés viennent du vol et du droit', () => {
    const c = vuePortefeuille(m, ALEX, NOW).actifs;
    expect(c.map((x) => [x.prixPaye, x.equivalent, x.ecart.pct])).toEqual([[1000, 2000, 100], [200, 940, 370], [1850, 1790, -3.2]]); expect(c[2].ecart.sens).toBe('baisse');
    m.vols.find((v) => v.id === 'v-ae812')!.prixNeuf = 1500; expect(vuePortefeuille(m, ALEX, NOW).actifs[0].ecart.pct).toBe(50);
  });
  it('droit en vente : prix annoncé, retrait automatique à l’échéance', () => {
    const c = carteDe(m, m.droits.find((d) => d.id === 'd-hav')!, NOW)!;
    expect(c).toMatchObject({ statut: 'en_vente', statutLib: 'En revente', annonce: 620, retrait: '29 janv. 2027', equivalent: 650, prixPaye: 480 });
  });
  it('acheteurs qui cherchent ce vol : intentions publiées des autres comptes', () => {
    const d = m.droits.find((x) => x.id === 'd-r816')!, v = m.vols.find((x) => x.id === 'v-ae816')!;
    expect(intentionsSurVol(m, d, v)).toEqual({ n: 1, max: 1300, fonds: true });
    expect(intentionsSurVol(m, m.droits.find((x) => x.id === 'd-812')!, m.vols.find((x) => x.id === 'v-ae812')!).n).toBe(0);
    m.intentions.push({ id: 'I-9', compteId: 'ACC-0301', de: 'YUL', vers: 'PUJ', budget: 400, fondsReserves: 0, creeLe: NOW, statut: 'publiee', propositions: [] });
    const puj = carteDe(m, m.droits.find((x) => x.id === 'd-puj')!, NOW)!; expect(puj.intentions).toEqual({ n: 1, max: 400, fonds: false });
  });
  it('origines et libellés', () => {
    expect(origineLibelle({ origine: 'neuf', chaine: [] })).toBeNull(); expect(origineLibelle({ origine: 'import', chaine: [] })).toBe('Billet importé'); expect(ordinal(1)).toBe('1er'); expect(ordinal(2)).toBe('2e');
    expect(titreActifs(0)).toBe('Aucun droit de voyage actif'); expect(titreActifs(1)).toBe('1 droit de voyage actif'); expect(enTete(m, m.vols.find((v) => v.id === 'v-no905')!)).toBe('Nordelle · Vol 905');
  });
});
describe('bagages en vente', () => {
  it('le droit de bagage d’Alex, avec le plafond de la compagnie', () => {
    const [b] = bagagesEnVente(m, ALEX, NOW); expect(b).toMatchObject({ bagageId: 'b-alex', droitId: 'd-812', vers: 'CDG', numeroVol: 'AE 812', kg: 23, prix: 100, plafond: 150 });
    expect(nbsp(b.note)).toBe('Votre 2e bagage inclus, non utilisé. Seuls les passagers du vol AE 812 du 14 déc. peuvent l’acheter. Plafond : prix compagnie 150 $ (règle provisoire). Transfert sous réserve d’accord d’Aérolys — hypothèse.');
  });
  it('rien pour un vol parti ou un autre compte', () => { expect(bagagesEnVente(m, 'ACC-0187', NOW).length).toBe(1); expect(bagagesEnVente(m, ALEX, Date.parse('2026-12-15T00:00'))).toEqual([]); });
});
describe('transactions et historique', () => {
  it('libellés et montants des mouvements', () => {
    const t = transactions(m, ALEX, NOW), r = Object.fromEntries(t.map((x) => [x.droitId, x]));
    expect(nbsp(r['d-puj'].montant)).toBe('200 $'); expect(r['d-puj']).toMatchObject({ titre: 'Drop membre obtenu', sous: 'YUL → PUJ · Nordelle', date: '3 sept.' });
    expect(r['d-ppt']).toMatchObject({ titre: 'Achat en revente', sous: 'YUL → PPT · 2 détenteurs avant vous', date: '3 août' }); expect(r['d-812']).toMatchObject({ titre: 'Achat neuf', date: '12 janv.' });
  });
  it('un billet revendu apparaît dans l’historique avec son prix de cession ; le vendeur n’y a plus accès', () => {
    const d = m.droits.find((x) => x.id === 'd-812')!;
    d.chaine.push({ id: 'mx', quand: NOW - 1000, type: 'revente', de: ALEX, vers: 'ACC-0301', prix: 1900, commission: 237.5 }); d.detenteurId = 'ACC-0301'; d.statut = 'detenu';
    const v = vuePortefeuille(m, ALEX, NOW); expect(v.actifs.map((c) => c.droitId)).not.toContain('d-812'); expect(v.cedes).toHaveLength(1);
    expect(v.cedes[0]).toMatchObject({ droitId: 'd-812', nature: 'revendu', natureLib: 'Revendu', prixPaye: 1000, prixCession: 1900, ouvrable: false }); expect(v.transactions[0]).toMatchObject({ titre: 'Revente', sous: 'YUL → CDG · billet vendu' });
  });
  it('transfert : sans prix ; billet voyagé : consultable', () => {
    const d = m.droits.find((x) => x.id === 'd-puj')!; d.chaine.push({ id: 'mt', quand: NOW, type: 'transfert', de: ALEX, vers: 'ACC-0187', prix: 0 }); d.detenteurId = 'ACC-0187';
    const t = transactions(m, ALEX, NOW)[0]; expect(t).toMatchObject({ titre: 'Transfert à un proche', montant: 'Sans vente' }); expect(billetsCedesOuVoyages(m, ALEX, NOW)[0].natureLib).toBe('Transféré');
    const h = m.droits.find((x) => x.id === 'd-ppt')!; h.statut = 'voyage'; expect(billetsCedesOuVoyages(m, ALEX, NOW).find((c) => c.droitId === 'd-ppt')).toMatchObject({ nature: 'voyage', ouvrable: true });
  });
  it('compte sans droit : tout est vide', () => { const v = vuePortefeuille(m, 'ACC-0999', NOW); expect(v.actifs).toEqual([]); expect(v.nbRevente).toBe(0); expect(v.titre).toBe('Aucun droit de voyage actif'); expect(v.agregat.equivalent).toBe(0); });
});
