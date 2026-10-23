<script lang="ts">
  import { LONGUEUR_CODE } from '../../core/auth.ts';
  /** Affichage d'un code à 6 chiffres : points (connexion) ou cases (création, SMS). */
  let { valeur, variante = 'cases', ton = 'neutre', visible = false, secousse = 0, etiquette = 'Code' }: {
    valeur: string; variante?: 'points' | 'cases'; ton?: 'neutre' | 'ok' | 'mauvais' | 'alerte'; visible?: boolean; secousse?: number; etiquette?: string;
  } = $props();
  const places = Array.from({ length: LONGUEUR_CODE }, (_, i) => i);
</script>

{#key secousse}
  <div class="rangee {variante} {ton}" class:secoue={secousse > 0} role="group" aria-label="{etiquette} : {valeur.length} chiffre{valeur.length > 1 ? 's' : ''} sur {LONGUEUR_CODE}">
    {#each places as i (i)}
      {@const plein = i < valeur.length}
      <span class="place" class:plein class:curseur={i === valeur.length && ton === 'neutre'} data-plein={plein}>{#if variante === 'cases' && plein}{visible ? valeur[i] : '•'}{/if}</span>
    {/each}
  </div>
{/key}

<style>
  .rangee { display: flex; justify-content: center; gap: 16px; padding: 6px 0; }
  .cases { gap: 10px; }
  .place { box-sizing: border-box; transition: all 0.15s; border: 2px solid var(--ligne-forte); }
  .points .place { width: 16px; height: 16px; border-radius: 8px; border-color: rgba(255, 255, 255, 0.2); }
  .points .plein { background: var(--pale); border-color: var(--pale); }
  .cases .place { width: 46px; height: 58px; border-radius: 14px; border-width: 1px; background: var(--carte); display: grid; place-items: center; font: 500 26px var(--mono); }
  .cases .plein { border-color: rgba(124, 147, 255, 0.5); }
  .curseur { border-color: var(--primaire) !important; box-shadow: 0 0 18px rgba(48, 80, 255, 0.35); }
  .ok .place { border-color: var(--bon); color: var(--bon); } .ok.points .plein { background: var(--bon); box-shadow: 0 0 12px rgba(61, 213, 152, 0.5); }
  .mauvais .place { border-color: var(--danger); color: var(--danger); } .mauvais.points .plein { background: var(--danger); box-shadow: 0 0 12px rgba(255, 114, 114, 0.5); }
  .alerte .place { border-color: var(--alerte); color: var(--alerte); } .alerte.points .plein { background: var(--alerte); }
  .secoue { animation: secoue 0.45s; }
  @keyframes secoue { 0%, 100% { transform: translateX(0); } 15% { transform: translateX(-10px); } 30% { transform: translateX(9px); } 45% { transform: translateX(-7px); } 60% { transform: translateX(5px); } 75% { transform: translateX(-3px); } }
</style>
