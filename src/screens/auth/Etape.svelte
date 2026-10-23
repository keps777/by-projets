<script lang="ts">
  import type { Snippet } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  /** Mise en page d'une étape d'inscription ou de sécurité : retour, repère d'étape, titre, contenu, pied fixe. */
  let { retourVers = '', onretour, repere = '', segments = 0, segmentActif = 0, titre, sous = '', pied, children, tonSegments = 'var(--primaire)' }: {
    retourVers?: string; onretour?: () => void; repere?: string; segments?: number; segmentActif?: number; titre: string; sous?: string; pied?: Snippet; children: Snippet; tonSegments?: string;
  } = $props();
</script>

<main class="etape">
  <header>
    {#if retourVers || onretour}<button type="button" class="rond" aria-label="Retour" onclick={() => (onretour ? onretour() : aller(retourVers, { remplacer: true }))}><Icone nom="retour" taille={18} trait={2.2} /></button>{:else}<span class="rond vide"></span>{/if}
    {#if repere}<span class="repere">{repere}</span>{/if}
  </header>
  {#if segments}<div class="segs" aria-hidden="true">{#each Array.from({ length: segments }, (_, i) => i + 1) as i (i)}<span style:background={i <= segmentActif ? tonSegments : '#1e2638'}></span>{/each}</div>{/if}
  <div class="tete"><h1>{titre}</h1>{#if sous}<p>{sous}</p>{/if}</div>
  <div class="corps">{@render children()}</div>
  {#if pied}<footer>{@render pied()}</footer>{/if}
</main>

<style>
  .etape { display: flex; flex-direction: column; min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 12px) 20px 0; gap: 12px; }
  header { display: flex; align-items: center; gap: 12px; min-height: 44px; }
  .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; flex: none; } .vide { visibility: hidden; }
  .repere { font: 500 11px var(--mono); letter-spacing: 0.12em; color: var(--muted); text-transform: uppercase; }
  .segs { display: flex; gap: 6px; } .segs span { flex: 1; height: 4px; border-radius: 2px; transition: background 0.3s; }
  .tete { display: flex; flex-direction: column; gap: 8px; } h1 { font-size: 27px; font-weight: 650; letter-spacing: -0.035em; line-height: 1.1; }
  .tete p { color: var(--muted); font-size: 14.5px; line-height: 1.45; }
  .corps { flex: 1; display: flex; flex-direction: column; gap: 14px; padding-bottom: 16px; }
  footer { position: sticky; bottom: 0; display: flex; flex-direction: column; gap: 6px; padding: 12px 0 calc(env(safe-area-inset-bottom) + 14px); background: linear-gradient(transparent, var(--fond) 28%); }
</style>
