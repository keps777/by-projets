<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { PLANS, tarifPass, type Employeur, type Facturation } from '../../core/inscription.ts';
  import type { Pass } from '../../core/credit.ts';

  /** Choix du Pass (essentiel, famille, premium) et de la facturation, avec le prix après part employeur. */
  let { pass = $bindable('famille'), facturation = $bindable('mensuel'), employeur = null }: { pass?: Pass; facturation?: Facturation; employeur?: Employeur | null } = $props();
  const TEINTES: Record<Pass, string> = { essentiel: 'var(--muted)', famille: 'var(--primaire-clair)', premium: 'var(--alerte)' };
</script>

<div class="plans" role="radiogroup" aria-label="Pass">
  {#each PLANS as p (p.id)}
    {@const t = tarifPass(p.id, facturation, null)}
    <button type="button" role="radio" aria-checked={pass === p.id} class:on={pass === p.id} onclick={() => (pass = p.id)}>
      <span class="radio" aria-hidden="true"><i></i></span>
      <span class="corps">
        <span class="entete"><b>{p.nom}</b><em style:color={TEINTES[p.id]}>{p.etiquette}</em></span>
        <span class="desc">{p.description}</span>
      </span>
      <span class="prix"><b class="mono">{fcfa(t.total)}</b><small>FCFA / {t.unite}</small></span>
    </button>
  {/each}
</div>
<div class="fact" role="radiogroup" aria-label="Facturation">
  <button type="button" role="radio" aria-checked={facturation === 'mensuel'} class:on={facturation === 'mensuel'} onclick={() => (facturation = 'mensuel')}>Mensuel</button>
  <button type="button" role="radio" aria-checked={facturation === 'annuel'} class:on={facturation === 'annuel'} onclick={() => (facturation = 'annuel')}>Annuel − 10 %</button>
</div>

<style>
  .plans { display: flex; flex-direction: column; gap: 10px; }
  .plans button { display: flex; align-items: center; gap: 12px; text-align: left; padding: 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); min-height: 76px; transition: border-color 0.2s, background 0.2s; }
  .plans button.on { background: rgba(48, 80, 255, 0.14); border-color: var(--primaire); }
  .radio { width: 20px; height: 20px; border-radius: 10px; border: 2px solid #3a4566; display: grid; place-items: center; flex: none; } .radio i { width: 10px; height: 10px; border-radius: 5px; background: transparent; } .on .radio { border-color: var(--primaire); } .on .radio i { background: var(--primaire); }
  .corps { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; } .entete { display: flex; align-items: baseline; gap: 8px; flex-wrap: wrap; } .entete b { font-size: 16px; } em { font: 500 9.5px var(--mono); letter-spacing: 0.1em; font-style: normal; }
  .desc { font-size: 12.5px; color: var(--muted); line-height: 1.4; }
  .prix { display: flex; flex-direction: column; align-items: flex-end; flex: none; } .prix b { font-size: 16px; } .prix small { font: 400 10px var(--mono); color: var(--muted); }
  .fact { display: flex; gap: 8px; } .fact button { flex: 1; min-height: 44px; border-radius: 12px; background: #161d2f; border: 1px solid var(--ligne); color: var(--muted); font-weight: 600; font-size: 13.5px; }
  .fact button.on { background: rgba(48, 80, 255, 0.18); border-color: var(--primaire); color: var(--texte); }
</style>
