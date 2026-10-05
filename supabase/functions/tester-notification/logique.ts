// tester-notification : envoie tout de suite une notification de test aux appareils abonnés de l'utilisateur connecté.
// Sert à vérifier toute la chaîne (abonnement, clés VAPID, service de push de l'iPhone) sans attendre un rappel.
import type { ChargePush, CiblePush, Envoyeur } from '../_shared/envoi.ts';

export interface AbonnementTest extends CiblePush { id: string; appareil: string | null }

export interface DepotTest {
  /** Abonnements actifs de l'utilisateur. */
  abonnements(userId: string): Promise<AbonnementTest[]>;
  /** Retire un abonnement que le service de push déclare mort (404 ou 410). */
  retirer(ids: string[]): Promise<void>;
}

export interface BilanTest {
  /** Nombre d'appareils abonnés. */
  abonnes: number;
  envoyes: number;
  /** Pour chaque échec : l'appareil, le code du service de push et le message. */
  echecs: { appareil: string | null; statut: number | null; message: string }[];
}

export const CHARGE_TEST: ChargePush = {
  titre: 'Notification de test',
  corps: 'Ça marche : tu recevras tes rappels sur cet appareil.',
  url: '/reglages#notifications',
  tag: 'test'
};

export async function envoyerTest(userId: string, depot: DepotTest, envoyeur: Envoyeur): Promise<BilanTest> {
  const abos = await depot.abonnements(userId);
  const bilan: BilanTest = { abonnes: abos.length, envoyes: 0, echecs: [] };
  const morts: string[] = [];
  for (const a of abos) {
    const r = await envoyeur.envoyer(a, JSON.stringify(CHARGE_TEST), { ttl: 120, urgence: 'high' });
    if (r.ok) bilan.envoyes++;
    else {
      bilan.echecs.push({ appareil: a.appareil, statut: r.statut, message: r.message });
      if (r.mort) morts.push(a.id);
    }
  }
  if (morts.length) await depot.retirer(morts);
  return bilan;
}
