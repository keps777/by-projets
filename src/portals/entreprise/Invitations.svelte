<script lang="ts">
  import { montrer } from '../../ui/toast.svelte.ts';
  import { analyserInvitations } from '../../core/entreprise.ts';
  import { inviter, telephonesConnus } from './actions.ts';
  import { ent } from './etat.ts';
  import { copier } from './nav.ts';
  import Panneau from './Panneau.svelte';

  let { ouvert = $bindable(false) }: { ouvert?: boolean } = $props();
  let texte = $state('');
  let envoye = $state(false);
  const code = $derived(ent().entreprise?.code ?? '');
  const analyse = $derived(analyserInvitations(texte, ouvert ? telephonesConnus() : []));
  $effect(() => { if (ouvert) { texte = ''; envoye = false; } });

  function envoyer() {
    envoye = true;
    if (!analyse.valides.length) { if (texte.trim()) montrer('Aucun numéro valide à inviter', 'danger'); return; }
    const r = inviter(texte);
    if (r.valides.length) {
      montrer(`${r.valides.length} invitation${r.valides.length > 1 ? 's' : ''} envoyée${r.valides.length > 1 ? 's' : ''} par SMS (simulation)`);
      if (!r.erreurs.length) ouvert = false; else texte = r.erreurs.map((x) => x.texte).join('\n');
    }
  }
  async function copierCode() { montrer((await copier(code)) ? "Code de l'entreprise copié" : 'Copie impossible : notez le code à la main'); }
</script>

<Panneau bind:ouvert titre="Inviter des salariés" sous="Un numéro de téléphone par ligne">
  <form onsubmit={(e) => { e.preventDefault(); envoyer(); }} novalidate>
    <div class="champ" class:err={envoye && (!texte.trim() || analyse.erreurs.length > 0)}>
      <label class="et" for="inv-num">Numéros de téléphone</label>
      <textarea id="inv-num" bind:value={texte} placeholder={'6 90 00 00 00\n+237 6 91 00 00 00'} aria-describedby="inv-aide inv-err" oninput={() => (envoye = false)}></textarea>
      <span id="inv-aide" class="doux">Chaque salarié reçoit un SMS avec le code de l'entreprise (simulation : aucun SMS n'est réellement envoyé).</span>
    </div>
    <div id="inv-err" aria-live="polite">
      {#if envoye && !texte.trim()}<p class="msg" role="alert">Ajoutez au moins un numéro.</p>{/if}
      {#if texte.trim() && analyse.erreurs.length}
        <ul class="erreurs">{#each analyse.erreurs as x (x.ligne)}<li class="msg">Ligne {x.ligne} : {x.message} (« {x.texte} »)</li>{/each}</ul>
      {/if}
      {#if texte.trim() && analyse.valides.length}<p class="doux">{analyse.valides.length} numéro{analyse.valides.length > 1 ? 's' : ''} valide{analyse.valides.length > 1 ? 's' : ''}.</p>{/if}
    </div>
    <div class="code"><span class="doux">Code de l'entreprise</span><b class="mono">{code}</b><button type="button" class="btn" onclick={copierCode}>Copier</button></div>
    <div class="pied"><button type="button" class="btn" onclick={() => (ouvert = false)}>Annuler</button><button class="btn prim" type="submit">Envoyer {analyse.valides.length > 1 ? `les ${analyse.valides.length} invitations` : "l'invitation"}</button></div>
  </form>
</Panneau>

<style>
  form { display: flex; flex-direction: column; gap: 14px; } .erreurs { list-style: none; display: flex; flex-direction: column; gap: 4px; }
  .code { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; background: var(--carte2); border-radius: 12px; padding: 10px 14px; } .code b { font-size: 20px; letter-spacing: 0.06em; } .code .btn { margin-left: auto; }
  .pied { display: flex; gap: 10px; justify-content: flex-end; flex-wrap: wrap; }
</style>
