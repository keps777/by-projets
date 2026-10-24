<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { basculerModule } from './actions.ts';
  import { MODULES } from './modules.ts';

  /** Écran affiché quand le patron a masqué le module : on peut le réactiver d'ici. */
  let { cle }: { cle: string } = $props();
  const def = $derived(MODULES.find((m) => m.cle === cle));
  function activer() { const r = basculerModule(cle, true); montrer(r.message ?? r.raison ?? '', r.ok ? 'ok' : 'er'); }
</script>

<div class="center" role="status">
  <div class="ill" aria-hidden="true"><Icone nom="parametres" taille={56} trait={1.6} /></div>
  <span class="ttl t20">{def?.nom ?? 'Ce module'} est masqué</span>
  <span class="t14 mut">Tu l’as coupé dans les modules : il n’apparaît plus dans les apps de tes clients et de tes agents.</span>
  <button type="button" class="b p" onclick={activer}>Activer {def?.nom ?? 'le module'}{#if def?.prix}<small>{def.prix.toLocaleString('fr-FR')} F / mois</small>{/if}</button>
  <a class="b g" href="/modules" onclick={(e) => { e.preventDefault(); aller('/modules'); }}>Tous les modules</a>
</div>
