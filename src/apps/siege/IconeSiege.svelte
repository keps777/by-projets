<script lang="ts">
  /** Icônes de la barre latérale du siège (celles des maquettes). */
  let { nom }: { nom: string } = $props();
</script>

<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  {#if nom === 'tableau'}<rect x="3.5" y="3.5" width="7" height="7" rx="2" /><rect x="13.5" y="3.5" width="7" height="7" rx="2" /><rect x="3.5" y="13.5" width="7" height="7" rx="2" /><rect x="13.5" y="13.5" width="7" height="7" rx="2" />
  {:else if nom === 'analyses'}<path d="M4 18L10 11l4 4 6-8M15 7h5v5" />
  {:else if nom === 'comptable'}<rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 11h18M7 15h3" />
  {:else if nom === 'config'}<circle cx="12" cy="12" r="3" /><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
  {:else if nom === 'controle'}<circle cx="12" cy="12" r="8.5" /><path d="M12 7v5l3 2" />
  {:else if nom === 'assistant'}<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
  {:else if nom === 'parcours'}<path d="M4 6h16M4 12h10M4 18h7" />
  {:else if nom === 'voyageur'}<rect x="6" y="2.5" width="12" height="19" rx="3" /><path d="M10 18h4" />
  {:else if nom === 'retour'}<path d="M15 5l-7 7 7 7" />{/if}
</svg>
