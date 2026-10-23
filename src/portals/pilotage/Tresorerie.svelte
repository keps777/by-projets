<script lang="ts">
  import type { Indicateurs } from '../../core/pilotage.ts';
  import { demanderLigne, regler } from './actions.ts';
  import type { EtatPilotage } from './etat.ts';
  import { decimal, entier } from './format.ts';
  let { ind, e }: { ind: Indicateurs; e: EtatPilotage } = $props();
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const pic = $derived(Math.max(...ind.tresorerie)), moisPic = $derived(MOIS[ind.tresorerie.indexOf(pic)]);
  const couv = $derived((e.ligne * 1000) / pic);
  const ok = $derived(couv >= 1);
  const total = $derived(ind.tresorerie.reduce((a, b) => a + b, 0));
</script>

<section class="carte" aria-labelledby="h-ligne">
  <h2 id="h-ligne">Ligne de refinancement de la rentrée</h2>
  <label class="curseur"><span class="stat"><span>Montant de la ligne</span><strong>{decimal(e.ligne)} Md FCFA</strong></span>
    <input type="range" min="0.5" max="3" step="0.1" value={e.ligne} oninput={(ev) => regler('ligne', parseFloat(ev.currentTarget.value))} aria-label="Montant de la ligne en milliards de FCFA" aria-valuetext="{decimal(e.ligne)} milliards de FCFA" /></label>
  <svg viewBox="0 0 100 4" preserveAspectRatio="none" role="img" aria-label="Couverture du pic de {moisPic} : {Math.round(couv * 100)} %" class="couv"><rect width="100" height="4" rx="2" fill="#eff1f6" /><rect width={Math.min(100, Math.round((couv * 100) / 2))} height="4" rx="2" fill={ok ? '#3050ff' : '#c0392b'} /><line x1="50" x2="50" y1="0" y2="4" stroke="#0b0f1a" stroke-width="0.4" /></svg>
  <p class="note" class:alerte={!ok} role="status" aria-live="polite">{ok ? `La ligne couvre ${Math.round(couv * 100)} % du pic de ${moisPic} (${entier(pic)} millions).` : `La ligne ne couvre que ${Math.round(couv * 100)} % du pic de ${moisPic} (${entier(pic)} millions).`}</p>
  <div class="droite"><button class="btn noir" disabled={e.ligneDemandee} onclick={() => demanderLigne()}>{e.ligneDemandee ? 'Demande envoyée ✓' : 'Demander la ligne au partenaire'}</button></div>
  <p class="doux petit">Projection issue de la <span class="etiquette">population simulée</span> : {entier(total)} millions décaissés sur l'année. Le compte local n'entre pas dans cette projection. Aucune demande réelle n'est transmise.</p>
</section>

<style>.curseur { display: flex; flex-direction: column; gap: 4px; } .couv { width: 100%; height: 14px; } .droite { display: flex; justify-content: flex-end; } .petit { font-size: 13px; }</style>
