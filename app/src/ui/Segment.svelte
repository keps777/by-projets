<script lang="ts" generics="T extends string">
  type Option = { valeur: T; label: string; href?: string };
  /**
   * Sélecteur segmenté des maquettes. Par défaut : boutons de 36 px, rayon 12/9, marge 3 (Le Fil, Semaine, Mois).
   * `ample` : rayon 14/10, marge 4 (Rapports 38 px, Archive 40 px, onglets de sous-projet 38 px, Connexion 44 px).
   */
  let { options, valeur, onchoisir, hauteur = 36, ample = false }: { options: Option[]; valeur: T; onchoisir?: (v: T) => void; hauteur?: number; ample?: boolean } = $props();
</script>

<div class="segment" class:ample style:grid-template-columns="repeat({options.length}, minmax(0, 1fr))" style:--h="{hauteur}px" role="tablist">
  {#each options as o (o.valeur)}
    {#if o.href && o.valeur !== valeur}
      <a href={o.href} role="tab" aria-selected="false">{o.label}</a>
    {:else}
      <button type="button" role="tab" aria-selected={o.valeur === valeur} class:actif={o.valeur === valeur} onclick={() => onchoisir?.(o.valeur)}>{o.label}</button>
    {/if}
  {/each}
</div>

<style>
  .segment { display: grid; gap: 2px; padding: 3px; background: var(--surface-2); border-radius: 12px; }
  .segment.ample { padding: 4px; border-radius: 14px; }
  button, a { position: relative; height: var(--h); border: 0; border-radius: 9px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 500; display: flex; align-items: center; justify-content: center; transition: background 0.18s, color 0.18s; }
  .ample button, .ample a { border-radius: 10px; font-weight: 600; }
  /* Zone d'appui de 44 px même quand le bouton dessiné est plus bas. */
  button::after, a::after { content: ''; position: absolute; inset: -4px 0; }
  button.actif { background: var(--surface); color: var(--texte); font-weight: 600; }
  button:active, a:active { transform: scale(0.97); }
</style>
