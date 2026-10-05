<script lang="ts">
  import { routeur } from '../../routeur.svelte.ts';
  import EcranTache from './EcranTache.svelte';

  /** /tache/nouvelle crée une tâche, /tache/:id la modifie. Le formulaire repart de zéro quand l'adresse change. */
  let { params = {} }: { params?: Record<string, string> } = $props();
</script>

{#key `${params.id ?? ''}${routeur.recherche}`}
  <EcranTache {params} />
{/key}
