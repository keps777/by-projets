<script lang="ts">
  // Lancer un temps depuis un sous-projet : le chrono tourne (il survit au rechargement) ; à l'arrêt, on choisit ce qui a été fait
  // (les métriques du sous-projet), puis la session s'enregistre comme saisie du projet (spec §9, comme les points du rapport).
  import type { Metrique } from '@core/types.ts';
  import { chrono, dureeMin } from '../fil/format.ts';
  import { chronos, cleSousProjet } from '../../data/chronos.svelte.ts';
  import { horloge } from '../../data/temps.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import VoletSession from '../rapports/VoletSession.svelte';
  import { enregistrerSession, type ValeurSession } from '../rapports/session.ts';

  let { spId, projetId, nom, metriques }: { spId: string; projetId: string; nom: string; metriques: Metrique[] } = $props();

  const cle = $derived(cleSousProjet(spId));
  const etat = $derived(chronos.etat(cle));
  const secondes = $derived(chronos.secondes(cle, horloge.maintenant));
  let ouvert = $state(false);

  function lancer() { chronos.demarrer(cle); }
  function arreter() { chronos.arreter(cle); ouvert = true; }
  function valider(autres: ValeurSession[], total: number, clesTemps: string[]) {
    const s = chronos.sessions[cle];
    if (!s) { ouvert = false; return; }
    const sid = enregistrerSession(projetId, s.jour, total, autres, 'temps', clesTemps);
    chronos.oublier(cle);
    ouvert = false;
    dire(sid ? `Session enregistrée · ${dureeMin(Math.round(total / 60))}` : 'Rien à enregistrer');
  }
  function annuler() { chronos.oublier(cle); ouvert = false; dire('Session annulée'); }
</script>

<div class="chrono" class:tourne={etat === 'cours'} role="group" aria-label="Temps du sous-projet">
  {#if etat === 'repos'}
    <button type="button" class="lancer" onclick={lancer}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
      Lancer un temps
    </button>
    <span class="muted petit">Chronomètre ce que tu fais ici ; à l’arrêt, tu notes ce qui a été fait.</span>
  {:else}
    <span class="col">
      <span class="etiquette">{etat === 'cours' ? 'Temps en cours' : 'Session arrêtée · à enregistrer'}</span>
      <span class="mono horloge" aria-live="off">{chrono(secondes)}</span>
    </span>
    <span class="actions">
      {#if etat === 'cours'}
        <button type="button" class="plein" onclick={arreter}>Arrêter</button>
      {:else}
        <button type="button" class="plein" onclick={() => (ouvert = true)}>Enregistrer</button>
      {/if}
      <button type="button" class="discret" onclick={annuler}>Annuler</button>
    </span>
  {/if}
</div>

<VoletSession {ouvert} titre={nom} {secondes} {metriques} onvalider={valider} onannuler={annuler} onfermer={() => (ouvert = false)} />

<style>
  .chrono { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; padding: 12px 14px; border-radius: 18px; border: 1px solid var(--ligne); background: var(--surface); }
  .chrono.tourne { border-color: var(--c); background: var(--c-fond); }
  .lancer { min-height: 46px; padding: 0 18px; border-radius: 23px; border: 0; background: var(--c); color: var(--c-sur); font-size: 15px; font-weight: 600; display: inline-flex; align-items: center; gap: 8px; }
  .petit { font-size: 12px; flex: 1 1 160px; }
  .col { display: flex; flex-direction: column; gap: 2px; }
  .horloge { font-size: 30px; letter-spacing: -0.02em; color: var(--c-encre, var(--texte)); }
  .actions { display: flex; gap: 8px; align-items: center; }
  .plein { min-height: 46px; padding: 0 20px; border-radius: 23px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 15px; font-weight: 600; }
  .discret { min-height: 44px; padding: 0 10px; border: 0; background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
</style>
