<script lang="ts">
  import { montrer } from '../../ui/toast.svelte.ts';
  import { publierVehicule, type FormVehicule } from '../../screens/auto/actions.ts';
  import type { EtatVehicule } from '../../screens/auto/etat.ts';

  let { fermer, publie }: { fermer: () => void; publie: () => void } = $props();
  let f = $state<FormVehicule>({ titre: '', annee: '', prix: '', type: 'voiture', etat: 'occasion' as EtatVehicule, controle: true });
  let erreur = $state('');
  let premier: HTMLInputElement | undefined = $state();
  $effect(() => { premier?.focus(); });
  function envoyer(e: SubmitEvent) {
    e.preventDefault();
    const err = publierVehicule(f);
    if (err) { erreur = err; return; }
    montrer('Véhicule publié dans le catalogue'); publie(); fermer();
  }
</script>

<div class="voile" role="presentation" onclick={fermer}></div>
<div class="modale" role="dialog" aria-modal="true" aria-labelledby="titre-pub" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && fermer()}>
<form onsubmit={envoyer} novalidate>
  <h2 id="titre-pub">Publier un véhicule</h2>
  <label>Marque et modèle<input bind:this={premier} bind:value={f.titre} placeholder="Toyota Corolla" autocomplete="off" aria-invalid={!!erreur && !f.titre.trim()} /></label>
  <div class="deux">
    <label>Année<input bind:value={f.annee} inputmode="numeric" placeholder="2018" maxlength="4" /></label>
    <label>Prix (FCFA)<input bind:value={f.prix} inputmode="numeric" placeholder="5 000 000" /></label>
  </div>
  <div class="deux">
    <label>Type<select bind:value={f.type}><option value="voiture">Voiture</option><option value="moto">Moto</option></select></label>
    <label>État<select bind:value={f.etat}><option value="neuve">Neuve</option><option value="quasi_neuve">Quasi neuve</option><option value="occasion">Occasion certifiée</option></select></label>
  </div>
  <label class="case"><input type="checkbox" bind:checked={f.controle} /><span>Contrôlé par un garage partenaire <small>(sinon, les demandes de financement seront refusées)</small></span></label>
  {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
  <div class="actions"><button type="button" class="sec" onclick={fermer}>Annuler</button><button type="submit" class="prim">Publier</button></div>
</form>
</div>

<style>
  .voile { position: fixed; inset: 0; background: rgba(15, 20, 34, 0.45); z-index: 40; }
  .modale { position: fixed; z-index: 41; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92vw, 440px); max-height: 92dvh; overflow-y: auto; padding: 22px; border-radius: 20px; background: var(--carte); box-shadow: var(--ombre); }
  form { display: flex; flex-direction: column; gap: 14px; }
  h2 { font-size: 19px; } label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; color: var(--doux); } .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  input:not([type='checkbox']), select { min-height: 44px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--ligne-forte); background: var(--fond); font-weight: 400; color: var(--texte); } input:focus, select:focus { border-color: var(--primaire); outline: none; }
  .case { flex-direction: row; align-items: flex-start; gap: 10px; min-height: 44px; font-weight: 500; } .case input { width: 22px; height: 22px; margin-top: 2px; flex: none; } small { display: block; color: var(--muted); font-weight: 400; }
  .erreur { color: #b3261e; font-size: 13px; } .actions { display: flex; justify-content: flex-end; gap: 10px; }
  .actions button { min-height: 44px; padding: 0 20px; border-radius: 10px; font-weight: 650; } .sec { border: 1px solid var(--ligne-forte); } .prim { background: var(--primaire); color: #fff; }
</style>
