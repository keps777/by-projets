<script lang="ts">
  import type { Personne } from '../../domain/types.ts';
  /** Bandeau de consultation : le superviseur et le patron voient le guichet de l'agent sans pouvoir vendre ni clôturer. */
  let { agent }: { agent: Personne | undefined } = $props();
</script>

<div class="gl row g8" role="status" style="border-color: rgba(255, 194, 75, 0.4)">
  <span class="pl wa">lecture seule</span>
  <span class="t13 mut">Tu consultes le guichet de {agent ? `${agent.prenom} ${agent.nom}` : 'la gare'}. Seul l’agent de guichet peut vendre et clôturer.</span>
</div>
