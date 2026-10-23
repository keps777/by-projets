<script lang="ts">
  /** Logo AssureMe : un A (chevron à 64°) dont la barre bleue dépasse à droite. Jamais de rotation ni de dégradé sur le signe. */
  let { taille = 40, nom = false, anime = false, fond = 'clair', titre = 'AssureMe' }: {
    taille?: number; nom?: boolean; anime?: boolean; fond?: 'clair' | 'sombre' | 'electrique' | 'mono'; titre?: string;
  } = $props();
  const couleurs = $derived({
    clair: { tuile: '#FFFFFF', chevron: '#0B0F1A', barre: '#3050FF' },
    sombre: { tuile: '#0B0F1A', chevron: '#FFFFFF', barre: '#3050FF' },
    electrique: { tuile: '#3050FF', chevron: '#FFFFFF', barre: '#FFFFFF' },
    mono: { tuile: '#0B0F1A', chevron: '#FFFFFF', barre: '#FFFFFF' }
  }[fond]);
</script>

<span class="logo" class:anime role="img" aria-label={titre}>
  <svg class="signe" width={taille} height={taille} viewBox="0 0 40 40" aria-hidden="true">
    <rect width="40" height="40" rx="10" fill={couleurs.tuile} />
    <path class="chevron" d="M11.5 29L20 11L28.5 29" fill="none" stroke={couleurs.chevron} stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round" />
    <rect class="barre" x="13" y="21.6" width="18" height="3.6" rx="1.8" fill={couleurs.barre} />
  </svg>
  {#if nom}<span class="mot" style:font-size="{Math.round(taille * 0.6)}px" aria-hidden="true">Assure<span class="me">Me</span></span>{/if}
</span>

<style>
  .logo { display: inline-flex; align-items: center; gap: 8px; line-height: 1; }
  .signe { flex: none; display: block; }
  .mot { font-weight: 600; letter-spacing: -0.03em; } .me { color: var(--primaire-clair); }
  .anime .signe { animation: entree 0.7s cubic-bezier(0.2, 0.9, 0.3, 1.2) both; }
  .anime .chevron { stroke-dasharray: 42; stroke-dashoffset: 42; animation: trace 0.6s 0.45s ease-out both; }
  .anime .barre { transform-box: view-box; transform-origin: 13px 23.4px; animation: barre 0.45s 1s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  @keyframes entree { 0% { opacity: 0; transform: scale(0.6); } 55% { opacity: 1; transform: scale(1.05); } 100% { opacity: 1; transform: scale(1); } }
  @keyframes trace { from { stroke-dashoffset: 42; } to { stroke-dashoffset: 0; } }
  @keyframes barre { from { transform: scaleX(0); opacity: 0; } to { transform: scaleX(1); opacity: 1; } }
</style>
