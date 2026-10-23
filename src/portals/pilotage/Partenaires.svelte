<script lang="ts">
  import { tick } from 'svelte';
  import { signerConvention } from './actions.ts';
  import type { EtatPilotage } from './etat.ts';
  let { e }: { e: EtatPilotage } = $props();
  const NOMS = ['À signer', 'En discussion', '[À CONTRACTER]', 'Signé'];
  let sel = $state(-1); let fermer = $state<HTMLButtonElement | null>(null); let retour: HTMLElement | null = null;
  const c = $derived(sel >= 0 ? e.conventions[sel] : null);
  async function ouvrir(i: number, ev: Event) { retour = ev.currentTarget as HTMLElement; sel = i; await tick(); fermer?.focus(); }
  function clore() { sel = -1; retour?.focus(); }
</script>

<svelte:window onkeydown={(ev) => { if (ev.key === 'Escape' && sel >= 0) clore(); }} />

<section class="carte" aria-labelledby="h-pa">
  <h2 id="h-pa">Partenaires réglementés</h2>
  <div class="defile"><table>
    <thead><tr><th scope="col">Rôle</th><th scope="col">Partenaire</th><th scope="col">Autorité</th><th scope="col">Statut</th></tr></thead>
    <tbody>{#each e.conventions as p, i (p.role)}
      <tr class:sel={sel === i}><th scope="row"><button onclick={(ev) => ouvrir(i, ev)} aria-haspopup="dialog">{p.role}</button></th><td>{p.qui}</td><td>{p.autorite}</td>
        <td><span class="statut" class:signe={p.statut === 3} class:attente={p.statut === 0}>{NOMS[p.statut]}</span></td></tr>{/each}</tbody>
  </table></div>
  <p class="doux petit">Les noms entre crochets sont des emplacements : aucun partenaire n'est encore sous contrat.</p>
</section>

{#if c}
  <button class="voile" aria-label="Fermer le détail" tabindex="-1" onclick={clore}></button>
  <div class="tiroir" role="dialog" aria-modal="true" aria-labelledby="t-conv">
    <div class="tete"><div><h2 id="t-conv">{c.role}</h2><p class="doux">{c.qui} · {c.autorite}</p></div><button class="btn" bind:this={fermer} onclick={clore} aria-label="Fermer">×</button></div>
    <p><span class="statut" class:signe={c.statut === 3} class:attente={c.statut === 0}>{NOMS[c.statut]}</span></p>
    <p class="note">{c.statut === 3 ? `Convention signée. L'agrément ${c.autorite} du partenaire est à jour dans le dossier.` : `Cette convention doit être signée avant l'ouverture du pilier correspondant. L'agrément ${c.autorite} du partenaire sera vérifié à la signature.`}</p>
    <button class="btn noir" disabled={c.statut === 3} onclick={() => signerConvention(sel)}>{c.statut === 3 ? 'Contrat signé ✓' : 'Marquer comme signé'}</button>
    <button class="btn" onclick={clore}>Fermer</button>
  </div>
{/if}

<style>
  .defile { overflow-x: auto; } table { width: 100%; min-width: 560px; border-collapse: collapse; font-size: 14px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #eff1f6; } thead th { font-size: 12px; color: var(--muted); font-weight: 600; } tr.sel { background: #f5f7ff; }
  th[scope='row'] button { min-height: 44px; font-weight: 600; text-align: left; color: var(--texte); } th[scope='row'] button:hover { color: var(--primaire); text-decoration: underline; } th[scope='row'] { font-weight: 600; }
  .voile { position: fixed; inset: 0; background: rgba(11, 15, 26, 0.4); z-index: 40; cursor: default; }
  .tiroir { position: fixed; top: 0; right: 0; bottom: 0; width: min(100%, 420px); background: var(--carte); z-index: 41; padding: 24px; display: flex; flex-direction: column; gap: 16px; box-shadow: var(--ombre); overflow-y: auto; }
  .tete { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; } .tete h2 { font-size: 20px; } .petit { font-size: 13px; }
  .tete .btn { width: 44px; padding: 0; font-size: 22px; }
</style>
