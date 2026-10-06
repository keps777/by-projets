<script lang="ts">
  import Volet from '../../ui/Volet.svelte';
  import Bouton from '../../ui/Bouton.svelte';

  /** Fenêtre pour changer le nom d'un projet ou d'un sous-projet. */
  let { ouvert, titre, nom, exemple = '', onfermer, onenregistrer }: {
    ouvert: boolean; titre: string; nom: string; exemple?: string; onfermer: () => void; onenregistrer: (nom: string) => void;
  } = $props();

  let valeur = $state('');
  $effect(() => { if (ouvert) valeur = nom; });
  const valide = $derived(!!valeur.trim());

  function enregistrer() {
    if (!valide) return;
    if (valeur.trim() !== nom) onenregistrer(valeur.trim());
    onfermer();
  }
</script>

<Volet {ouvert} {onfermer} label={titre}>
  <h2 class="titre">{titre}</h2>
  <label class="champ">Nom
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={valeur} placeholder={exemple} autofocus autocomplete="off" enterkeyhint="done" onkeydown={(e) => e.key === 'Enter' && enregistrer()} />
  </label>
  <Bouton grand plein desactive={!valide} onclick={enregistrer}>Enregistrer</Bouton>
</Volet>

<style>
  .titre { font-size: 22px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .champ input { height: 50px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); font-size: 17px; font-weight: 600; padding: 0 14px; }
</style>
