<script lang="ts">
  import type { Snippet } from 'svelte';
  import { va } from './lien.ts';
  /** Lien interne : vrai `<a>` (clic droit, nouvel onglet) mais navigation par `aller()` au clic. */
  let { href, class: classe = '', children, ...reste }: { href: string; class?: string; children: Snippet; [cle: string]: unknown } = $props();
</script>

<a {href} class={classe} onclick={(e) => va(e, href)} {...reste}>{@render children()}</a>
