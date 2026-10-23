// Tranche d'état « auth » : brouillon d'inscription, réglages de sécurité et de notifications, Pass, proches.
import { app, maintenant, tranche } from '../../data/store.svelte.ts';
import type { Jour, Pass } from '../../data/types.ts';
import type { Facturation } from '../../core/inscription.ts';
import { trouverEmployeurParNom } from '../../core/inscription.ts';
import { ajouterJours, jourDe, prochainePaie } from '../../core/dates.ts';

export interface Brouillon {
  debut: number;
  /** Dernière étape franchie : 0 rien, 1 numéro envoyé, 2 SMS vérifié, 3 identité, 4 Pass. */
  etape: 0 | 1 | 2 | 3 | 4;
  tel: string; operateur: number; employeur: string;
  source: 'cam' | 'gal'; lecture: 'attente' | 'capture' | 'faite';
  nomComplet: string; cni: string; naissance: string;
  pass: Pass; facturation: Facturation;
}
export interface Proche { id: string; nom: string; lien: 'Conjoint' | 'Enfant' | 'Parent' | 'Autre' }
export type PermissionNotif = 'inconnue' | 'accordee' | 'refusee' | 'indisponible';
export interface PrefsNotif { paiements: boolean; salaire: boolean; score: boolean }
export interface EtatAuth {
  brouillon: Brouillon;
  notif: PrefsNotif; permissionNotif: PermissionNotif;
  /** Code demandé pour les paiements au-dessus de SEUIL_CODE_PAIEMENT (50 000 FCFA). */
  codePaiement: boolean;
  codeModifieLe: number | null;
  /** Code employeur validé (NDIBA-2026…) : donne la part employeur du Pass. */
  employeurCode: string;
  facturation: Facturation;
  /** Prochaine paie où le Pass est prélevé ; avance d'un mois (ou d'un an) à chaque prélèvement. */
  passEcheance: Jour | null;
  operateur: number;
  proches: Proche[];
  cartesDemandees: boolean;
  /** Appareils bloqués après un « ce n'est pas moi ». */
  bloques: string[];
}

export const brouillonVide = (): Brouillon => ({
  debut: maintenant(), etape: 0, tel: '', operateur: 0, employeur: '', source: 'cam', lecture: 'attente',
  nomComplet: '', cni: '', naissance: '', pass: 'famille', facturation: 'mensuel'
});

function defaut(): EtatAuth {
  const c = app.compte;
  const employeur = c ? trouverEmployeurParNom(c.employeur) : null;
  return {
    brouillon: brouillonVide(),
    notif: { paiements: true, salaire: true, score: app.mode === 'demo' },
    permissionNotif: 'inconnue',
    codePaiement: true,
    codeModifieLe: app.mode === 'demo' ? maintenant() - 3 * 86_400_000 : null,
    employeurCode: employeur?.code ?? '',
    facturation: 'mensuel',
    // Pass dû dès la première paie pas encore traitée (compte démo : celle qui suit la dernière paie passée).
    passEcheance: c ? prochainePaie(app.dernierePaie ? ajouterJours(app.dernierePaie, 1) : jourDe(new Date(maintenant())), c.jourPaie) : null,
    operateur: 0,
    proches: app.mode === 'demo' ? [{ id: 'p1', nom: 'Paul', lien: 'Conjoint' }, { id: 'p2', nom: 'Lisa', lien: 'Enfant' }, { id: 'p3', nom: 'Junior', lien: 'Enfant' }] : [],
    cartesDemandees: false,
    bloques: []
  };
}
/** À lire dans le `<script>` d'un composant ou dans une action, jamais dans une expression de gabarit (création paresseuse). */
export const etatAuth = (): EtatAuth => tranche<EtatAuth>('auth', defaut);
/** Lecture seule (sûre dans un `$derived` ou un aperçu de paie) : la tranche si elle existe, sinon ses valeurs par défaut sans rien créer. */
export const lireAuth = (): EtatAuth => (app.tranches['auth'] as EtatAuth | undefined) ?? defaut();
