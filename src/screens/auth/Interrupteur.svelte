<script lang="ts">
  /** Réglage actif/inactif : libellé, aide et interrupteur (role="switch"). 56 px de haut au minimum. */
  /** `controle` : l'interrupteur ne bascule pas seul, c'est le parent qui décide (confirmation, saisie d'un code…) et met `actif` à jour. */
  let { actif = $bindable(false), titre, aide = '', desactive = false, controle = false, onchange }: { actif?: boolean; titre: string; aide?: string; desactive?: boolean; controle?: boolean; onchange?: (actif: boolean) => void } = $props();
  function basculer() { if (desactive) return; if (controle) { onchange?.(!actif); return; } actif = !actif; onchange?.(actif); }
</script>

<button type="button" class="ligne" role="switch" aria-checked={actif} disabled={desactive} onclick={basculer}>
  <span class="txt"><b>{titre}</b>{#if aide}<small>{aide}</small>{/if}</span>
  <span class="inter" class:on={actif} aria-hidden="true"><i></i></span>
</button>

<style>
  .ligne { display: flex; align-items: center; gap: 12px; width: 100%; min-height: 56px; padding: 10px 0; text-align: left; border-bottom: 1px solid var(--ligne); }
  .ligne:last-child { border: 0; } .ligne:disabled { opacity: 0.5; }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } b { font-weight: 600; font-size: 14.5px; } small { color: var(--muted); font-size: 12.5px; line-height: 1.35; }
  .inter { position: relative; flex: none; width: 46px; height: 28px; border-radius: 14px; background: #1e2638; border: 1px solid var(--ligne-forte); transition: background 0.2s; }
  .inter i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 10px; background: #8b94a9; transition: transform 0.2s, background 0.2s; }
  .on { background: var(--primaire); border-color: var(--primaire); } .on i { transform: translateX(18px); background: #fff; }
</style>
