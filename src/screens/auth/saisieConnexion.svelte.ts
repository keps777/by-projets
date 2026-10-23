// Saisie du code de l'app (connexion, session expirée) : états, essais restants, secousse.
import { app } from '../../data/store.svelte.ts';
import { essaisRestants, LONGUEUR_CODE } from '../../core/auth.ts';
import { tenterCode, type ResultatCode } from './actions.ts';

export type StatutSaisie = 'attente' | 'verification' | 'faux' | 'ok' | 'verrouille' | 'bloque' | 'nouvel_appareil';

export class SaisieConnexion {
  code = $state('');
  statut = $state<StatutSaisie>('attente');
  secousse = $state(0);
  restants = $derived(essaisRestants(app.auth.verrou));
  #fin: (r: ResultatCode) => void;
  constructor(fin: (r: ResultatCode) => void) { this.#fin = fin; }

  get bloquee() { return this.statut === 'verification' || this.statut === 'ok' || this.statut === 'verrouille' || this.statut === 'bloque' || this.statut === 'nouvel_appareil'; }
  chiffre(d: string) {
    if (this.bloquee) return;
    if (this.statut === 'faux') { this.code = ''; this.statut = 'attente'; }
    if (this.code.length >= LONGUEUR_CODE) return;
    this.code += d;
    if (this.code.length === LONGUEUR_CODE) void this.verifier();
  }
  efface() {
    if (this.bloquee) return;
    this.code = this.statut === 'faux' ? '' : this.code.slice(0, -1);
    this.statut = 'attente';
  }
  async verifier() {
    this.statut = 'verification';
    const r = await tenterCode(this.code);
    if (r === 'faux') { this.statut = 'faux'; this.secousse++; }
    else if (r === 'verrouille') { this.statut = 'verrouille'; this.secousse++; }
    else if (r === 'bloque') { this.statut = 'bloque'; this.code = ''; }
    else if (r === 'nouvel_appareil') this.statut = 'nouvel_appareil';
    else if (r === 'ok') this.statut = 'ok';
    else { this.statut = 'attente'; this.code = ''; }
    this.#fin(r);
  }
}
