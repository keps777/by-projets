<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import type { Audit } from '../../domain/types.ts';
  import { GRAVITES } from './AuditVues.ts';
  /** Puce de gravité du journal : icône ET texte (jamais la couleur seule). info : cercle « i » · attention : triangle · critique : hexagone d'alerte. */
  let { gravite }: { gravite: Audit['gravite'] } = $props();
</script>
<span class="g {gravite}">
  {#if gravite === 'info'}<Icone nom="info" taille={14} trait={2} />
  {:else if gravite === 'attention'}<Icone nom="alerte" taille={14} trait={2} />
  {:else}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 3h8l5 5v8l-5 5H8l-5-5V8z" /><path d="M12 8v5M12 16.500h.01" /></svg>{/if}
  {GRAVITES[gravite]}
</span>
<style>
  .g { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
  .info { background: rgba(98, 199, 255, 0.12); color: var(--up); } .attention { background: var(--signal-soft); color: var(--signal-ink); } .critique { background: var(--err-soft); color: var(--err); }
</style>
