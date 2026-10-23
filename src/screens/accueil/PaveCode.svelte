<script lang="ts">
  import Pict from './Pict.svelte';
  import { LONGUEUR_CODE } from '../../core/auth.ts';
  /** Pavé numérique à 6 chiffres. `onsaisi` reçoit le code complet ; le parent vide le champ en changeant `cle`. */
  let { onsaisi, erreur = '', desactive = false, cle = 0 }: { onsaisi: (code: string) => void; erreur?: string; desactive?: boolean; cle?: number } = $props();
  let code = $state('');
  $effect(() => { cle; code = ''; });
  function toucher(c: string) {
    if (desactive || code.length >= LONGUEUR_CODE) return;
    code += c;
    if (code.length === LONGUEUR_CODE) onsaisi(code);
  }
  const effacer = () => { if (!desactive) code = code.slice(0, -1); };
  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
</script>

<svelte:window onkeydown={(e) => { if (/^\d$/.test(e.key)) toucher(e.key); else if (e.key === 'Backspace') effacer(); }} />

<div class="pave">
  <div class="points" role="img" aria-label="{code.length} chiffre{code.length > 1 ? 's' : ''} saisi{code.length > 1 ? 's' : ''} sur {LONGUEUR_CODE}">
    {#each Array(LONGUEUR_CODE) as _, i (i)}<i class:plein={i < code.length} class:err={!!erreur}></i>{/each}
  </div>
  <p class="msg" role="alert">{erreur}</p>
  <div class="grille">
    {#each touches as t (t)}<button type="button" onclick={() => toucher(t)} disabled={desactive}>{t}</button>{/each}
    <span></span>
    <button type="button" onclick={() => toucher('0')} disabled={desactive}>0</button>
    <button type="button" class="ef" onclick={effacer} disabled={desactive} aria-label="Effacer le dernier chiffre"><Pict nom="efface" taille={22} /></button>
  </div>
</div>

<style>
  .pave { display: flex; flex-direction: column; align-items: center; gap: 10px; }
  .points { display: flex; gap: 14px; height: 18px; align-items: center; }
  i { width: 14px; height: 14px; border-radius: 7px; border: 2px solid var(--ligne-forte); transition: all 0.12s; }
  i.plein { background: var(--primaire); border-color: var(--primaire); } i.err { border-color: var(--danger); background: color-mix(in srgb, var(--danger) 60%, transparent); }
  .msg { min-height: 18px; color: var(--danger); font-size: 13px; text-align: center; }
  .grille { display: grid; grid-template-columns: repeat(3, 76px); gap: 10px; }
  button { height: 58px; border-radius: 18px; background: var(--carte2); border: 1px solid var(--ligne); font: 500 24px var(--mono); display: grid; place-items: center; }
  button:active { background: var(--primaire-fond); } button:disabled { opacity: 0.4; } .ef { color: var(--muted); }
</style>
