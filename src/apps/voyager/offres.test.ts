import { beforeEach, describe, expect, it } from 'vitest';
import { filtrer, filtresVides, nbFiltres } from '../../core/recherche.ts';
import { ajouterJours } from '../../core/dates.ts';
import { parTranche } from '../../core/tranches.ts';
import { app, aujourdhui, reinitialiser } from '../../data/store.svelte.ts';
import { departsDuJour, placesLibres, prixDuDepart, reserver, siegesIndisponibles } from '../../domain/actions.ts';
import { planSieges } from '../../core/sieges.ts';
import { choisirJour, choisirTrajet, demain, effacerFiltres, initRecherche, lireRecherche, rechercheParDefaut } from './etat.ts';
import { destinations, etiquette, nbAnnules, offreBus, offresDuJour, placesCovoit, prixAffiche, prixBasDuJour, villesDeDepart } from './offres.ts';

const J = () => demain();
const dep = (heure: string, jour = J()) => departsDuJour(jour, 'Yaoundé', 'Douala').find((d) => d.heure === heure)!;

describe('offres du jour', () => {
  beforeEach(() => reinitialiser());
  it('demain Yaoundé → Douala : 14 bus et 5 covoiturages, rangés dans les 8 tranches', () => {
    const o = offresDuJour(J(), 'Yaoundé', 'Douala');
    expect(o.filter((x) => x.genre === 'bus')).toHaveLength(14); expect(o.filter((x) => x.genre === 'cv')).toHaveLength(5);
    const t = parTranche(o); expect(t).toHaveLength(8); expect(t.reduce((s, x) => s + x.items.length, 0)).toBe(19);
    expect(t[2].items.map((x) => x.heure).sort()).toEqual(['06:00', '06:15', '07:00', '07:30', '08:00', '08:00']);
  });
  it('un bus porte compagnie, classe, gare, durée, places et confort', () => {
    const o = offreBus(dep('06:00'));
    expect(o).toMatchObject({ genre: 'bus', ab: 'AV', co: 'Alpha VIP', cl: 'VIP', gare: 'Nsam', dureeMin: 195, vip: true, cap: 30, complet: false, compagnieId: 'AV' });
    expect(o.confort).toContain('Wi-Fi à bord'); expect(o.places).toBe(placesLibres(dep('06:00')));
  });
  it('un covoiturage : conducteur abrégé, place libres, pas de compagnie', () => {
    const c = offresDuJour(J(), 'Yaoundé', 'Douala').find((x) => x.covoitId === 'v1')!;
    expect(c).toMatchObject({ co: 'Moussa K.', ab: 'MK', cl: 'Corolla', gare: 'Nsam', prix: 4500, places: 3 }); expect(c.compagnieId).toBeUndefined(); expect(c.dureeMin).toBe(195 + 5);
  });
  it('les covoiturages réservés à plein deviennent complets', () => {
    const o = app.monde.covoits.find((c) => c.id === 'v5')!; o.reservations.push({ voyageurId: 'p-maman', places: 1, paiementId: 'x' });
    expect(placesCovoit(o)).toBe(0); expect(offresDuJour(J(), 'Yaoundé', 'Douala').find((x) => x.covoitId === 'v5')!.complet).toBe(true);
  });
  it('un covoiturage annulé ou en ville n’est pas proposé', () => {
    app.monde.covoits.find((c) => c.id === 'v1')!.statut = 'annulee'; app.monde.covoits.find((c) => c.id === 'v2')!.enVille = true;
    expect(offresDuJour(J(), 'Yaoundé', 'Douala').filter((x) => x.genre === 'cv')).toHaveLength(3);
  });
  it('les départs annulés disparaissent mais sont comptés', () => {
    dep('09:00').statut = 'annule';
    expect(offresDuJour(J(), 'Yaoundé', 'Douala')).toHaveLength(18); expect(nbAnnules(J(), 'Yaoundé', 'Douala')).toBe(1);
  });
  it('les bus déjà partis ne sont plus proposés', () => {
    const d = dep('06:00', aujourdhui()); if (!d) return; d.statut = 'parti';
    expect(offresDuJour(aujourdhui(), 'Yaoundé', 'Douala').some((x) => x.id === d.id)).toBe(false);
  });
  it('sens inverse et ligne inexistante', () => {
    expect(offresDuJour(J(), 'Douala', 'Yaoundé').length).toBeGreaterThan(0); expect(offresDuJour(J(), 'Kribi', 'Bamenda')).toEqual([]);
  });
});
describe('prix dynamique', () => {
  beforeEach(() => { reinitialiser(); app.monde.params.tarifs.dynamique = true; });
  it('−500 F la veille quand le bus est à moins de la moitié, +500 F au-dessus de 90 %', () => {
    const peu = dep('09:00'), presque = dep('06:00');
    expect(peu.prix).toBe(6000); expect(prixAffiche(peu)).toBe(5500);
    expect(presque.prix).toBe(8000); expect(prixAffiche(presque)).toBe(8000); // 4 places libres sur 30 : 87 %, pas encore plus de 90 %
    presque.prisAilleurs = planSieges('VIP', 30).slice(0, 28).map((x) => x.id); // 2 libres : 93 %
    expect(prixAffiche(presque)).toBe(8500); expect(offreBus(presque)).toMatchObject({ prix: 8500, prixBase: 8000 });
  });
  it('sans l’option du patron, le prix est celui du départ', () => {
    app.monde.params.tarifs.dynamique = false; expect(prixAffiche(dep('09:00'))).toBe(6000); expect(prixAffiche(dep('06:00'))).toBe(8000);
  });
  it('plus loin dans le temps, pas de baisse', () => { expect(prixAffiche(dep('09:00', ajouterJours(aujourdhui(), 5)))).toBe(6000); });
  it('prix le plus bas du jour : bus avec des places seulement', () => {
    expect(prixBasDuJour(J(), 'Yaoundé', 'Douala')).toBe(4500);
    expect(prixBasDuJour(J(), 'Kribi', 'Bamenda')).toBeNull();
    for (const d of departsDuJour(J(), 'Yaoundé', 'Douala')) d.prisAilleurs = planSieges(d.ligneId.includes('VIP') ? 'VIP' : 'Classique', d.capacite).map((s) => s.id);
    expect(prixBasDuJour(J(), 'Yaoundé', 'Douala')).toBeNull();
  });
});
describe('complet, étiquettes et destinations', () => {
  beforeEach(() => { reinitialiser(); app.monde.params.tarifs.dynamique = true; });
  it('un bus plein est complet et étiqueté ainsi', () => {
    const d = dep('06:00'), plan = planSieges('VIP', d.capacite).map((s) => s.id);
    d.prisAilleurs = plan; expect(siegesIndisponibles(d).size).toBe(plan.length);
    const o = offreBus(d); expect(o.complet).toBe(true); expect(etiquette(o, [o])).toEqual({ texte: 'complet', ton: 'er' });
  });
  it('une place vendue au guichet retire une place du panorama', () => {
    const d = dep('09:00'), avant = offreBus(d).places;
    reserver({ departId: d.id, sieges: [null], passagers: [{ nom: 'Test', tel: '690000000' }], acheteurId: 'p-fatou', canal: 'guichet', moyen: 'especes' });
    expect(offreBus(d).places).toBe(avant - 1);
  });
  it('retard annoncé : étiquette dédiée', () => {
    const d = dep('09:00'); d.retardMin = 20; const o = offreBus(d); expect(etiquette(o, [o])).toEqual({ texte: 'retard +20 min', ton: 'wa' });
  });
  it('les étiquettes : dernières places, moins cher, plus rapide', () => {
    const t = parTranche(offresDuJour(J(), 'Yaoundé', 'Douala'))[2].items;
    expect(etiquette(t.find((x) => x.heure === '06:00')!, t).texte).toBe('+ que 4 pl.');
    expect(etiquette(t.find((x) => x.covoitId === 'v2')!, t).texte).toBe('moins cher');
  });
  it('destinations depuis Yaoundé et départs possibles', () => {
    const d = destinations('Yaoundé', J());
    expect(d.map((x) => x.ville).sort()).toEqual(['Bafoussam', 'Bamenda', 'Douala']);
    expect(d.find((x) => x.ville === 'Douala')).toMatchObject({ compagnies: 5, dureeMin: 195, prix: 4500, gares: ['Akwa'] });
    expect(d.find((x) => x.ville === 'Bamenda')).toMatchObject({ compagnies: 1, dureeMin: 420 });
    expect(villesDeDepart().sort()).toEqual(['Bafoussam', 'Bamenda', 'Douala', 'Kribi', 'Yaoundé']);
    expect(destinations('Douala', J()).map((x) => x.ville).sort()).toEqual(['Kribi', 'Yaoundé']);
  });
});
describe('recherche partagée', () => {
  beforeEach(() => reinitialiser());
  it('par défaut : Yaoundé → Douala, demain, sans filtre, panorama, tri par heure', () => {
    const r = initRecherche();
    expect(r).toMatchObject({ de: 'Yaoundé', vers: 'Douala', jour: demain(), genre: 'tout', prixMax: null, creneaux: [], compagnies: [], confort: [], tri: 'heure', vue: '3d', heureCible: null });
    expect(app.tranches.recherche).toBeDefined(); expect(lireRecherche().vers).toBe('Douala');
  });
  it('un jour passé redevient demain ; les champs manquants sont rétablis', () => {
    const r = initRecherche(); r.jour = ajouterJours(aujourdhui(), -3); delete (r as Partial<typeof r>).tri;
    const r2 = initRecherche(); expect(r2.jour).toBe(demain()); expect(r2.tri).toBe('heure');
  });
  it('les autres écrans lisent la même recherche', () => {
    const r = initRecherche(); choisirTrajet(r, 'Yaoundé', 'Bafoussam'); choisirJour(r, ajouterJours(aujourdhui(), 3), '14:30');
    expect(lireRecherche()).toMatchObject({ vers: 'Bafoussam', heureCible: '14:30' });
    expect(initRecherche().vers).toBe('Bafoussam');
  });
  it('changer de trajet efface l’heure souhaitée ; effacer les filtres garde le type', () => {
    const r = initRecherche(); r.heureCible = '08:00'; choisirTrajet(r, 'Douala', 'Yaoundé'); expect(r.heureCible).toBeNull();
    r.genre = 'bus'; r.prixMax = 6000; r.creneaux = ['Matin']; effacerFiltres(r); expect(r).toMatchObject({ genre: 'bus', prixMax: null, creneaux: [] });
  });
  it('un départ identique à l’arrivée est corrigé', () => { const r = initRecherche(); r.vers = 'Yaoundé'; expect(initRecherche().vers).toBe('Douala'); });
  it('le compteur « Voir N départs » est le vrai nombre de départs filtrés', () => {
    const r = initRecherche(), base = offresDuJour(r.jour, r.de, r.vers);
    expect(filtrer(base, r)).toHaveLength(19);
    r.genre = 'bus'; expect(filtrer(base, r)).toHaveLength(14);
    r.prixMax = 5500; const n = filtrer(base, r).length; expect(n).toBe(base.filter((o) => o.genre === 'bus' && o.prix <= 5500).length);
    r.creneaux = ['Nuit']; expect(filtrer(base, r).map((o) => o.heure).sort()).toEqual(['00:30', '22:30']); expect(nbFiltres(r)).toBe(2);
    r.compagnies = ['FX']; expect(filtrer(base, r)).toEqual([]);
    expect(rechercheParDefaut().jour).toBe(demain()); expect(filtrer(base, { ...filtresVides(), confort: ['Wi-Fi à bord'] }).every((o) => o.vip)).toBe(true);
  });
});

describe('le prix affiché est le prix payé', () => {
  beforeEach(() => reinitialiser());
  it('avec ou sans prix dynamique, le panorama affiche ce que `reserver` encaisse', () => {
    for (const dynamique of [false, true]) {
      app.monde.params.tarifs.dynamique = dynamique;
      for (const d of departsDuJour(J(), 'Yaoundé', 'Douala').slice(0, 6)) {
        expect(prixAffiche(d), `${d.id} (dynamique ${dynamique})`).toBe(prixDuDepart(d));
        const libre = planSieges('Classique', d.capacite).map((x) => x.id).find((id) => !siegesIndisponibles(d).has(id) && !/^1/.test(id));
        if (!libre || d.capacite !== 50) continue;
        const affiche = prixAffiche(d);
        const { paiement } = reserver({ departId: d.id, sieges: [libre], passagers: [{ nom: 'Test', tel: '690000000' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' });
        expect(paiement.montant).toBe(affiche); // prix payé = prix affiché (hors supplément de siège)
      }
    }
  });
});
