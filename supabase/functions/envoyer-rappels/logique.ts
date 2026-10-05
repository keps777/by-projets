// Envoi des rappels dus (spec §10) : composition des notifications et suivi des états. Aucune API Deno ici.
import { formatHeure, libelleDelai, utcVersLocal, type TypeRappel } from '../_shared/core/index.ts';
import type { ChargePush, CiblePush, Envoyeur, OptionsPush } from '../_shared/envoi.ts';

/** Ligne rendue par la fonction SQL reserver_rappels. */
export interface RappelReserve {
  id: string; user_id: string; type: TypeRappel; occurrence_id: string | null; rapport_id: string | null;
  envoyer_a: string; cle_unique: string; tentatives: number;
  titre: string | null; debut: string | null; fin: string | null; occ_etat: string | null; bloc_annule: boolean | null;
  rubrique: string | null; titres_visibles: boolean | null; fuseau: string | null; rapport_jour: string | null;
  /** Faux si l'utilisateur a désactivé ce type de rappel (Réglages · Quels rappels recevoir). */
  recu: boolean | null;
}

export interface Abonnement extends CiblePush { id: string; user_id: string }
export type EtatFinal = 'envoye' | 'echec' | 'en_attente' | 'annule';

export interface DepotRappels {
  reserver(limite: number): Promise<RappelReserve[]>;
  /** Abonnements non supprimés des utilisateurs donnés. */
  abonnements(userIds: string[]): Promise<Abonnement[]>;
  marquerRappel(id: string, etat: EtatFinal, erreur: string | null): Promise<void>;
  abonnementReussi(id: string, quand: string): Promise<void>;
  abonnementMort(id: string, quand: string): Promise<void>;
}

/** Nombre d'essais avant de déclarer un rappel en échec quand l'erreur est passagère. */
export const ESSAIS_MAX = 3;

const FUSEAU_DEFAUT = 'America/Toronto';

function heureLocale(iso: string, fuseau: string): string { return formatHeure(utcVersLocal(Date.parse(iso), fuseau).minutes); }

function dateLongue(jour: string): string {
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(new Date(`${jour}T00:00:00Z`));
}

/** Notification d'un rappel, avec ses options d'envoi. */
export function composerNotification(r: RappelReserve): { charge: ChargePush; options: OptionsPush } {
  const tag = r.cle_unique;
  switch (r.type) {
    case 'bloc': {
      const fuseau = r.fuseau || FUSEAU_DEFAUT;
      const delai = r.debut ? Math.max(0, Math.round((Date.parse(r.debut) - Date.parse(r.envoyer_a)) / 60000)) : 0;
      const quand = delai === 0 ? 'À l’heure' : `Dans ${libelleDelai(delai)}`;
      const heures = r.debut ? heureLocale(r.debut, fuseau) + (r.fin ? ` – ${heureLocale(r.fin, fuseau)}` : '') : '';
      const url = `/action-rapide?occ=${r.occurrence_id ?? ''}`;
      const ttl = r.debut ? Math.max(60, Math.round((Date.parse(r.debut) - Date.parse(r.envoyer_a)) / 1000) + 900) : 900;
      if (r.titres_visibles === false) {
        // Écran verrouillé discret : ni titre ni rubrique.
        const titre = delai === 0 ? 'Un bloc commence maintenant' : `Un bloc commence dans ${libelleDelai(delai)}`;
        return { charge: { titre, corps: heures, url, tag }, options: { ttl, urgence: 'high' } };
      }
      const corps = [heures, r.rubrique].filter(Boolean).join(' · ');
      return { charge: { titre: `${quand} : ${r.titre ?? 'bloc'}`, corps, url, tag }, options: { ttl, urgence: 'high' } };
    }
    case 'rapport': {
      const titre = r.rapport_jour ? `Ton rapport du ${dateLongue(r.rapport_jour)} est prêt` : 'Ton rapport est prêt';
      return { charge: { titre, corps: 'Relire · Envoyer', url: '/rapports', tag }, options: { ttl: 12 * 3600 } };
    }
    case 'recap_semaine':
      return { charge: { titre: 'Ta semaine en résumé', corps: 'Ton récapitulatif de la semaine est prêt.', url: '/rapports?onglet=semaine', tag }, options: { ttl: 24 * 3600, urgence: 'low' } };
    case 'recap_mois':
      return { charge: { titre: 'Ton mois en résumé', corps: 'Ton récapitulatif du mois est prêt.', url: '/rapports?onglet=mois', tag }, options: { ttl: 24 * 3600, urgence: 'low' } };
    case 'valider':
      return { charge: { titre: 'Un sous-projet est à valider', corps: 'Sa période est terminée : fais-en le bilan.', url: '/projets', tag }, options: { ttl: 24 * 3600, urgence: 'low' } };
  }
}

export interface Bilan { rappels: number; envoyes: number; echecs: number; reessais: number; annules: number; abonnementsRetires: number }

export async function envoyerRappels(depot: DepotRappels, envoyeur: Envoyeur, limite = 200, maintenant = () => new Date().toISOString()): Promise<Bilan> {
  const rappels = await depot.reserver(limite);
  const bilan: Bilan = { rappels: rappels.length, envoyes: 0, echecs: 0, reessais: 0, annules: 0, abonnementsRetires: 0 };
  if (!rappels.length) return bilan;
  const abonnements = await depot.abonnements([...new Set(rappels.map((r) => r.user_id))]);
  const morts = new Set<string>();

  for (const r of rappels) {
    if ((r.type === 'bloc' && r.bloc_annule) || r.recu === false) {
      await depot.marquerRappel(r.id, 'annule', null);
      bilan.annules++;
      continue;
    }
    const cibles = abonnements.filter((a) => a.user_id === r.user_id && !morts.has(a.id));
    if (!cibles.length) {
      await depot.marquerRappel(r.id, 'echec', 'aucun abonnement push actif');
      bilan.echecs++;
      continue;
    }
    const { charge, options } = composerNotification(r);
    const texte = JSON.stringify(charge);
    let reussi = false;
    const erreurs: string[] = [];
    let passagere = false;
    for (const a of cibles) {
      const res = await envoyeur.envoyer(a, texte, options);
      if (res.ok) {
        reussi = true;
        await depot.abonnementReussi(a.id, maintenant());
      } else {
        erreurs.push(res.message);
        if (res.mort) {
          morts.add(a.id);
          await depot.abonnementMort(a.id, maintenant());
          bilan.abonnementsRetires++;
        } else passagere = true;
      }
    }
    if (reussi) {
      await depot.marquerRappel(r.id, 'envoye', null);
      bilan.envoyes++;
    } else if (passagere && r.tentatives < ESSAIS_MAX) {
      await depot.marquerRappel(r.id, 'en_attente', erreurs.join(' | ').slice(0, 500));
      bilan.reessais++;
    } else {
      await depot.marquerRappel(r.id, 'echec', erreurs.join(' | ').slice(0, 500));
      bilan.echecs++;
    }
  }
  return bilan;
}
