<script lang="ts">
  import type { Snippet } from 'svelte';
  /** Ligne de réglage avec interrupteur accessible (`role="switch"`) : tout le rang est la cible, ≥ 72 px. */
  let { actif = $bindable(false), titre, sous, badge, premier = false }: { actif?: boolean; titre: string; sous: string; badge?: string; premier?: boolean } = $props();
</script>
<button type="button" role="switch" aria-checked={actif} class="rang" class:premier onclick={() => (actif = !actif)}>
  <span class="txt"><span class="tete"><span class="t">{titre}</span>{#if badge}<span class="badge">{badge}</span>{/if}</span><span class="s">{sous}</span></span>
  <span class="piste" class:on={actif} aria-hidden="true"><span class="bouton">{#if actif}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12 5 5 9-10" /></svg>{/if}</span></span>
</button>
<style>
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 14px; width: 100%; min-height: 72px; padding: 12px 16px; border: 0; border-top: 1px solid var(--line); background: var(--surface); color: var(--ink); text-align: left; cursor: pointer; }
  .txt { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .tete { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; }
  .t { font: 700 15px/20px 'Barlow', sans-serif; } .s { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .badge { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; background: var(--accent-soft); color: var(--accent); font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .piste { position: relative; flex: none; width: 52px; height: 32px; border-radius: 999px; background: var(--surface2); border: 1px solid #8494A9; transition: background-color 0.2s ease; }
  .piste.on { background: var(--accent); border-color: var(--accent); }
  .bouton { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 999px; background: var(--ink3); display: flex; align-items: center; justify-content: center; color: var(--accent); transition: left 0.2s ease; }
  .piste.on .bouton { left: 23px; background: #fff; }
  @media (min-width: 900px) {
    .rang { min-height: 76px; padding: 14px 18px; gap: 16px; } .txt { gap: 3px; }
    .t { font-size: 17px; line-height: 22px; } .s { font-size: 14px; line-height: 20px; } .badge { font-size: 12px; }
    .piste { width: 56px; border: 2px solid #7A8597; box-sizing: border-box; } .piste.on { border-color: var(--accent); }
    .bouton { top: 3px; left: 3px; width: 22px; height: 22px; background: var(--ink2); } .piste.on .bouton { left: 27px; background: #fff; }
  }
</style>
