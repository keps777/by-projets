import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { app, reinitialiser } from '../../data/store.svelte.ts';
import { planSieges } from '../../core/sieges.ts';
import { annulerBillet, billetsDe, connecter, personne, reserver, siegesIndisponibles } from '../../domain/actions.ts';
import { billetChoisi, billetMemorise, billetsEnCours, itemsDe, memoriserBillet } from './selection.ts';
import { etat } from './etat.ts';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-02T20:00:00')); reinitialiser(); connecter('p-aicha'); });
afterEach(() => vi.useRealTimers());
/** Aïcha achète un billet pour Marie (un autre départ) et le règle (MoMo simulé accepté). */
function billetPourMarie() {
  const d = app.monde.departs.find((x) => x.statut === 'prevu' && x.jour === '2026-11-04' && x.heure === '07:00')!;
  const siege = planSieges('Classique', d.capacite).map((x) => x.id).find((id) => !siegesIndisponibles(d).has(id) && !/^1/.test(id))!;
  const { billets, paiement } = reserver({ departId: d.id, sieges: [siege], passagers: [{ nom: 'Marie Ndiba', tel: '655329810' }], acheteurId: 'p-aicha', canal: 'app', moyen: 'momo' });
  paiement.statut = 'ok'; billets[0].statut = 'valide'; return billets[0];
}

describe('sélecteur de bus : billets en cours', () => {
  it('liste les billets à moi et ceux achetés pour un proche, du plus proche départ au plus lointain', () => {
    const marie = billetPourMarie(), liste = billetsEnCours('p-aicha');
    expect(liste.map((b) => b.id)).toEqual(['b-aicha1', marie.id]);
    const items = itemsDe(liste, 'p-aicha');
    expect(items[0]).toMatchObject({ passager: 'Aïcha', pourMoi: true, payePar: undefined, statut: 'a_venir', trajet: 'Yaoundé → Douala', heure: '08:00' });
    expect(items[1]).toMatchObject({ passager: 'Marie', pourMoi: false, payePar: 'toi', siege: marie.siege });
  });
  it('un billet annulé ou remboursé n’est plus proposé', () => {
    const marie = billetPourMarie(); annulerBillet(marie.id);
    expect(billetsEnCours('p-aicha').map((b) => b.id)).toEqual(['b-aicha1']);
    app.monde.billets.find((b) => b.id === 'b-aicha1')!.statut = 'rembourse'; expect(billetsEnCours('p-aicha')).toEqual([]);
  });
  it('un billet acheté pour moi par un proche indique qui a payé', () => {
    const b = billetsDe('p-aicha')[0]; b.acheteurId = 'p-maman'; const [it] = itemsDe([b], 'p-aicha');
    expect(it).toMatchObject({ pourMoi: true, payePar: personne('p-maman')!.prenom });
  });
});

describe('sélecteur de bus : choix mémorisé', () => {
  it('par défaut, le prochain départ ; le choix est mémorisé dans la tranche reglement', () => {
    const marie = billetPourMarie();
    expect(billetChoisi('p-aicha')?.id).toBe('b-aicha1'); expect(billetMemorise()).toBeNull();
    memoriserBillet(marie.id); expect(etat().billetChoisi).toBe(marie.id); expect(app.tranches.reglement).toMatchObject({ billetChoisi: marie.id });
    expect(billetChoisi('p-aicha')?.id).toBe(marie.id);
  });
  it('le lien ?billet= l’emporte sur le choix mémorisé', () => {
    const marie = billetPourMarie(); memoriserBillet(marie.id);
    expect(billetChoisi('p-aicha', 'b-aicha1')?.id).toBe('b-aicha1'); expect(billetChoisi('p-aicha', 'inconnu')?.id).toBe(marie.id);
  });
  it('un choix devenu inutilisable (annulé) retombe sur le prochain billet', () => {
    const marie = billetPourMarie(); memoriserBillet(marie.id); annulerBillet(marie.id); expect(billetChoisi('p-aicha')?.id).toBe('b-aicha1');
  });
  it('sans billet : rien', () => { app.monde.billets.length = 0; expect(billetChoisi('p-aicha')).toBeUndefined(); expect(billetsEnCours('p-aicha')).toEqual([]); });
});
