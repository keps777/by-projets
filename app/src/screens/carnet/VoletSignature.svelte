<script lang="ts">
  import Volet from '../../ui/Volet.svelte';
  import { texteSignature, type Signature } from '../../data/actions/livres.ts';

  /** Signature d'une page (circonstance facultative, lieu facultatif, date d'au moins l'année) avec les propositions déjà utilisées. */
  let { ouvert, sig = $bindable(), histo, bouton = 'Enregistrer', onvalider, onfermer }: {
    ouvert: boolean; sig: Signature; histo: Record<keyof Signature, string[]>; bouton?: string; onvalider: () => void; onfermer: () => void;
  } = $props();
  const CHAMPS: [keyof Signature, string, string][] = [['c', 'Circonstance', 'Durant la nuit de prière de CMCI PAT'], ['l', 'Lieu', 'Montréal'], ['d', 'Date (au moins l’année)', '21/08/26']];
</script>

<Volet {ouvert} {onfermer} label="Lieu et date">
  <form class="form" onsubmit={(e) => { e.preventDefault(); onvalider(); }}>
    <h2 class="titre">Lieu et date</h2>
    <p class="muted apercu-sig">{texteSignature(sig) || '—'}</p>
    {#each CHAMPS as [k, nom, ex] (k)}
      <label class="champ">{nom}{k === 'd' ? '' : ' · facultatif'}
        <input type="text" placeholder={ex} bind:value={sig[k]} autocomplete="off" aria-label={nom} />
      </label>
      {#if histo[k].length}<div class="puces">{#each histo[k].slice(0, 6) as h (h)}<button type="button" class="puce" onclick={() => (sig[k] = h)}>{h}</button>{/each}</div>{/if}
    {/each}
    <button type="submit" class="ok">{bouton}</button>
  </form>
</Volet>

<style>
  .form { display: flex; flex-direction: column; gap: 14px; } .titre { font-size: 22px; margin: 0; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); } .champ input { height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 16px; padding: 0 12px; }
  .puces { display: flex; gap: 6px; overflow-x: auto; margin-top: -6px; } .puce { flex: none; min-height: 36px; padding: 0 12px; border-radius: 18px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); font-size: 13px; white-space: nowrap; } .apercu-sig { font-style: italic; margin: 0; font-size: 14px; }
  .ok { min-height: 52px; border-radius: 16px; border: 0; font-size: 16px; font-weight: 600; background: var(--inverse); color: var(--inverse-texte); }
</style>
