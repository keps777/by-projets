import { describe, it, expect } from 'vitest';
import { composerNotification, envoyerRappels, type Abonnement, type DepotRappels, type EtatFinal, type RappelReserve } from './logique.ts';
import type { Envoyeur, ResultatPush } from '../_shared/envoi.ts';

const rappel = (r: Partial<RappelReserve> = {}): RappelReserve => ({
  id: 'r1', user_id: 'u1', type: 'bloc', occurrence_id: 'o1', rapport_id: null, envoyer_a: '2026-10-05T08:50:00Z', cle_unique: 'o1:10',
  tentatives: 1, titre: 'RDQD du matin', debut: '2026-10-05T09:00:00Z', fin: '2026-10-05T09:30:00Z', occ_etat: 'prevue', bloc_annule: false,
  rubrique: 'Ma relation avec Dieu', titres_visibles: true, fuseau: 'America/Toronto', rapport_jour: null, recu: true, ...r
});

describe('composerNotification', () => {
  it('rappel de bloc : délai, heures locales et rubrique', () => {
    const { charge, options } = composerNotification(rappel());
    expect(charge).toEqual({ titre: 'Dans 10 min : RDQD du matin', corps: '05:00 – 05:30 · Ma relation avec Dieu', url: '/action-rapide?occ=o1', tag: 'o1:10' });
    expect(options.urgence).toBe('high');
  });

  it('à l’heure, et sans rubrique pour un rendez-vous', () => {
    const { charge } = composerNotification(rappel({ envoyer_a: '2026-10-05T09:00:00Z', rubrique: null }));
    expect(charge.titre).toBe('À l’heure : RDQD du matin');
    expect(charge.corps).toBe('05:00 – 05:30');
  });

  it('titres masqués à l’écran verrouillé', () => {
    const { charge } = composerNotification(rappel({ titres_visibles: false }));
    expect(charge.titre).toBe('Un bloc commence dans 10 min');
    expect(JSON.stringify(charge)).not.toContain('RDQD');
    expect(JSON.stringify(charge)).not.toContain('Dieu');
  });

  it('respecte le fuseau du profil', () => {
    expect(composerNotification(rappel({ fuseau: 'Europe/Paris' })).charge.corps).toMatch(/^11:00 – 11:30/);
  });

  it('rapport, récapitulatifs et validation', () => {
    expect(composerNotification(rappel({ type: 'rapport', rapport_jour: '2026-10-04', occurrence_id: null })).charge)
      .toMatchObject({ titre: 'Ton rapport du 4 octobre est prêt', url: '/rapports' });
    expect(composerNotification(rappel({ type: 'recap_semaine' })).charge.url).toBe('/rapports?onglet=semaine');
    expect(composerNotification(rappel({ type: 'recap_mois' })).charge.url).toBe('/rapports?onglet=mois');
    expect(composerNotification(rappel({ type: 'valider' })).charge.url).toBe('/projets');
  });
});

function depotMemoire(rappels: RappelReserve[], abonnements: Abonnement[]) {
  const etats = new Map<string, { etat: EtatFinal; erreur: string | null }>();
  const succes = new Map<string, string>();
  const morts = new Set<string>();
  const depot: DepotRappels = {
    reserver: async (n) => rappels.splice(0, n),
    abonnements: async (ids) => abonnements.filter((a) => ids.includes(a.user_id) && !morts.has(a.id)),
    marquerRappel: async (id, etat, erreur) => { etats.set(id, { etat, erreur }); },
    abonnementReussi: async (id, quand) => { succes.set(id, quand); },
    abonnementMort: async (id) => { morts.add(id); }
  };
  return { depot, etats, succes, morts };
}

const abo = (id: string, user_id = 'u1'): Abonnement => ({ id, user_id, endpoint: `https://push.example/${id}`, cle_p256dh: 'p', cle_auth: 'a' });

function envoyeur(reponses: Record<string, ResultatPush>): Envoyeur & { envois: { endpoint: string; charge: string }[] } {
  const envois: { endpoint: string; charge: string }[] = [];
  return {
    envois,
    async envoyer(cible, charge) {
      envois.push({ endpoint: cible.endpoint, charge });
      return reponses[cible.endpoint.split('/').pop()!] ?? { ok: true };
    }
  };
}

describe('envoyerRappels', () => {
  it('envoie à tous les appareils, marque « envoye » et note le dernier succès', async () => {
    const m = depotMemoire([rappel()], [abo('a1'), abo('a2'), abo('b1', 'u2')]);
    const e = envoyeur({});
    const bilan = await envoyerRappels(m.depot, e, 200, () => '2026-10-05T08:50:05Z');
    expect(e.envois.map((x) => x.endpoint)).toEqual(['https://push.example/a1', 'https://push.example/a2']);
    expect(JSON.parse(e.envois[0].charge).url).toBe('/action-rapide?occ=o1');
    expect(m.etats.get('r1')).toEqual({ etat: 'envoye', erreur: null });
    expect([...m.succes.keys()]).toEqual(['a1', 'a2']);
    expect(bilan).toMatchObject({ envoyes: 1, echecs: 0 });
  });

  it('retire un abonnement mort (410) et réussit par l’autre appareil', async () => {
    const m = depotMemoire([rappel()], [abo('a1'), abo('a2')]);
    const bilan = await envoyerRappels(m.depot, envoyeur({ a1: { ok: false, statut: 410, message: '410 Gone', mort: true } }));
    expect(m.morts).toEqual(new Set(['a1']));
    expect(m.etats.get('r1')?.etat).toBe('envoye');
    expect(bilan.abonnementsRetires).toBe(1);
  });

  it('échec définitif si tous les abonnements sont morts ou absents', async () => {
    const m = depotMemoire([rappel(), rappel({ id: 'r2', user_id: 'u3' })], [abo('a1')]);
    await envoyerRappels(m.depot, envoyeur({ a1: { ok: false, statut: 404, message: '404 Not Found', mort: true } }));
    expect(m.etats.get('r1')).toEqual({ etat: 'echec', erreur: '404 Not Found' });
    expect(m.etats.get('r2')).toEqual({ etat: 'echec', erreur: 'aucun abonnement push actif' });
  });

  it('erreur passagère : nouvel essai, puis échec après le nombre maximal d’essais', async () => {
    const panne: ResultatPush = { ok: false, statut: 503, message: '503 indisponible', mort: false };
    const m = depotMemoire([rappel({ tentatives: 1 }), rappel({ id: 'r2', tentatives: 3 })], [abo('a1')]);
    await envoyerRappels(m.depot, envoyeur({ a1: panne }));
    expect(m.etats.get('r1')).toEqual({ etat: 'en_attente', erreur: '503 indisponible' });
    expect(m.etats.get('r2')?.etat).toBe('echec');
  });

  it('annule sans envoyer un rappel d’un type que l’utilisateur ne veut plus recevoir', async () => {
    const m = depotMemoire([rappel({ recu: false }), rappel({ id: 'r2', type: 'rapport', occurrence_id: null, rapport_jour: '2026-10-04' })], [abo('a1')]);
    const e = envoyeur({});
    const bilan = await envoyerRappels(m.depot, e);
    expect(m.etats.get('r1')?.etat).toBe('annule');
    expect(m.etats.get('r2')?.etat).toBe('envoye');
    expect(e.envois).toHaveLength(1);
    expect(bilan).toMatchObject({ annules: 1, envoyes: 1 });
  });
  it('annule sans envoyer le rappel d’un bloc devenu sans objet', async () => {
    const m = depotMemoire([rappel({ bloc_annule: true })], [abo('a1')]);
    const e = envoyeur({});
    await envoyerRappels(m.depot, e);
    expect(e.envois).toHaveLength(0);
    expect(m.etats.get('r1')?.etat).toBe('annule');
  });
});
