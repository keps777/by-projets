// Tranche « pilotage » : préférences de filtre et réglages internes du tableau de bord. Seule tranche que ce portail écrit.
import type { FiltreProduit } from '../../core/pilotage.ts';
import { app, tranche } from '../../data/store.svelte.ts';

export type Panneau = 'ensemble' | 'risque' | 'activite' | 'tresorerie' | 'partenaires' | 'conformite';
export const CLE = 'pilotage';
export interface Convention { role: string; qui: string; autorite: string; /** 0 à signer, 1 en discussion, 2 à contracter, 3 signé. */ statut: 0 | 1 | 2 | 3 }
export interface EtatPilotage {
  panneau: Panneau; periode: number; produit: FiltreProduit; mode: 'mensuel' | 'cumule';
  /** Seuil interne des retards de plus de 30 jours (%). */ seuil: number;
  relances: boolean[]; /** Ligne de refinancement (Md FCFA) et état de la demande. */ ligne: number; ligneDemandee: boolean;
  conventions: Convention[]; conformite: boolean[];
}
export const defautPilotage = (): EtatPilotage => ({
  panneau: 'ensemble', periode: 0, produit: 'tous', mode: 'mensuel', seuil: 3, relances: [true, true, false], ligne: 1.5, ligneDemandee: false,
  conventions: [
    { role: 'Octroi des crédits', qui: '[MICROFINANCE OU BANQUE AGRÉÉE]', autorite: 'COBAC', statut: 0 },
    { role: 'Assurance santé et auto', qui: '[ASSUREUR AGRÉÉ]', autorite: 'CIMA', statut: 1 },
    { role: 'Paiements mobiles', qui: 'Orange Money, MTN MoMo', autorite: 'BEAC', statut: 2 }
  ],
  conformite: [true, false, false, true, false]
});
const sain = (e: Partial<EtatPilotage> | undefined): EtatPilotage => ({ ...defautPilotage(), ...e });
/** Lecture sans création (utilisable depuis un `$derived`). */
export const lirePilotage = (): EtatPilotage => sain(app.tranches[CLE] as Partial<EtatPilotage> | undefined);
/** À appeler depuis une action ou l'initialisation d'un composant, jamais depuis un `$derived`. */
export const pilotage = (): EtatPilotage => {
  const t = tranche<EtatPilotage>(CLE, defautPilotage);
  // Tranche écrite par une version plus ancienne : on complète les champs manquants.
  for (const [k, v] of Object.entries(defautPilotage())) if (!(k in t)) (t as unknown as Record<string, unknown>)[k] = v;
  return t;
};
