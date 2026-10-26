<script lang="ts">
  /** Barre des trois étapes du transfert : choisir le proche, confirmer, transfert fait. L'étape faite est en gris clair, l'étape en cours en jaune. */
  let { n, libelle }: { n: 1 | 2 | 3; libelle: string } = $props();
</script>
<div class="etapes">
  <p class="t-sur">Étape {n} sur 3 · {libelle}</p>
  <div class="barres" aria-hidden="true">{#each [1, 2, 3] as i (i)}<span class:fait={i < n} class:cours={i === n}></span>{/each}</div>
</div>
<style>
  .etapes { display: flex; flex-direction: column; gap: 8px; }
  .barres { display: flex; gap: 6px; } .barres span { flex: 1; height: 4px; border-radius: 999px; background: var(--line); }
  .barres .fait { background: var(--ink2); } .barres .cours { background: var(--accent); }
</style>
