import { describe, expect, it } from 'vitest';
import type { Envoyeur, ResultatPush } from '../_shared/envoi.ts';
import { envoyerTest, type AbonnementTest, type DepotTest } from './logique.ts';

const abo = (id: string, appareil = 'iPhone · app installée'): AbonnementTest => ({ id, endpoint: `https://push.example/${id}`, cle_p256dh: 'p', cle_auth: 'a', appareil });

function simuler(abos: AbonnementTest[], reponses: Record<string, ResultatPush>) {
  const retires: string[] = [], envoyes: string[] = [];
  const depot: DepotTest = { abonnements: async () => abos, retirer: async (ids) => void retires.push(...ids) };
  const envoyeur: Envoyeur = { envoyer: async (cible, charge) => { envoyes.push(JSON.parse(charge).titre); return reponses[cible.endpoint.split('/').pop()!] ?? { ok: true }; } };
  return { depot, envoyeur, retires, envoyes };
}

describe('notification de test', () => {
  it('envoie à chaque appareil abonné', async () => {
    const s = simuler([abo('a'), abo('b')], {});
    expect(await envoyerTest('u1', s.depot, s.envoyeur)).toEqual({ abonnes: 2, envoyes: 2, echecs: [] });
    expect(s.envoyes).toEqual(['Notification de test', 'Notification de test']);
  });
  it('sans abonnement : rien n’est envoyé, et c’est dit clairement', async () => {
    const s = simuler([], {});
    expect(await envoyerTest('u1', s.depot, s.envoyeur)).toEqual({ abonnes: 0, envoyes: 0, echecs: [] });
  });
  it('rapporte les échecs avec le code du service de push et retire les abonnements morts', async () => {
    const s = simuler([abo('a'), abo('b'), abo('c')], {
      b: { ok: false, statut: 410, message: '410 gone', mort: true },
      c: { ok: false, statut: 403, message: '403 BadJwtToken', mort: false }
    });
    const b = await envoyerTest('u1', s.depot, s.envoyeur);
    expect(b.envoyes).toBe(1);
    expect(b.echecs.map((e) => e.statut)).toEqual([410, 403]);
    expect(s.retires).toEqual(['b']);
  });
});
