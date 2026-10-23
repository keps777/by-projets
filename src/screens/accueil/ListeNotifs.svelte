<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { quand } from '../../core/dates.ts';
  import { marquerLue, toutMarquerLu } from './actions.ts';
  import Icone from '../../ui/Icone.svelte';
  /** Liste des notifications : un appui marque comme lu et ouvre l'écran concerné. */
  let { onouvert }: { onouvert?: () => void } = $props();
  const liste = $derived([...app.notifications].sort((a, b) => b.ts - a.ts));
  const nonLu = $derived(app.notifications.filter((n) => !n.lu).length);
  function ouvrir(id: string, lien?: string) { marquerLue(id); if (lien) { onouvert?.(); aller(lien); } }
</script>

<div class="entete">
  <span class="muted compte">{nonLu ? `${nonLu} non lue${nonLu > 1 ? 's' : ''}` : 'Tout est lu'}</span>
  <button type="button" class="tout" onclick={toutMarquerLu} disabled={!nonLu}>Tout marquer comme lu</button>
</div>
{#if liste.length === 0}
  <p class="vide muted">Aucune notification pour l'instant. Vos paiements, prélèvements et rappels apparaîtront ici.</p>
{:else}
  <ul>
    {#each liste as n (n.id)}
      <li>
        <button type="button" class="n" class:nonlue={!n.lu} onclick={() => ouvrir(n.id, n.lien)} aria-label="{n.lu ? '' : 'Non lue. '}{n.titre}. {n.sous}{n.lien ? '. Ouvrir' : ''}">
          <span class="pt" aria-hidden="true"></span>
          <span class="txt"><b>{n.titre}</b><small>{n.sous}</small><em class="mono">{quand(n.ts, maintenant())}</em></span>
          {#if n.lien}<span class="fl"><Icone nom="suivant" taille={16} /></span>{/if}
        </button>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .entete { display: flex; justify-content: space-between; align-items: center; } .compte { font-size: 12.5px; }
  .tout { color: var(--primaire-clair); font-weight: 500; font-size: 13px; min-height: 44px; padding: 0 4px; } .tout:disabled { opacity: 0.4; }
  ul { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .n { width: 100%; display: flex; align-items: center; gap: 12px; text-align: left; min-height: 64px; padding: 12px 14px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); }
  .n.nonlue { background: var(--carte2); border-color: rgba(255, 122, 47, 0.35); }
  .pt { width: 8px; height: 8px; border-radius: 4px; background: transparent; flex: none; } .nonlue .pt { background: var(--alerte); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } b { font-weight: 450; font-size: 14.5px; } .nonlue b { font-weight: 650; }
  small { color: var(--muted); font-size: 12.5px; } em { font-style: normal; font-size: 10.5px; color: var(--faint); letter-spacing: 0.06em; text-transform: uppercase; }
  .fl { color: var(--faint); display: grid; } .vide { padding: 22px 6px; text-align: center; font-size: 14px; }
</style>
