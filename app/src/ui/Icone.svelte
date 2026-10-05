<script lang="ts">
  import { ICONES, type NomIcone } from './icones.ts';
  let { nom, taille = 22, trait = 2, titre }: { nom: NomIcone; taille?: number; trait?: number; titre?: string } = $props();
</script>

<svg width={taille} height={taille} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width={trait} stroke-linecap="round" stroke-linejoin="round"
  aria-hidden={titre ? undefined : 'true'} role={titre ? 'img' : undefined} aria-label={titre}><path d={ICONES[nom]} /></svg>
