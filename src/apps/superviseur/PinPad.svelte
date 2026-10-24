<script lang="ts">
  /** Saisie d'un PIN à 4 chiffres : cases, pavé numérique (clavier accepté), message d'erreur. */
  let { valeur = $bindable(''), longueur = 4, erreur = '', desactive = false, label = 'Ton PIN superviseur' }: { valeur?: string; longueur?: number; erreur?: string; desactive?: boolean; label?: string } = $props();
  const ajouter = (c: string) => { if (!desactive && valeur.length < longueur) valeur += c; };
  const touche = (e: KeyboardEvent) => {
    if (desactive || e.metaKey || e.ctrlKey || (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName))) return;
    if (/^\d$/.test(e.key)) ajouter(e.key); else if (e.key === 'Backspace') valeur = valeur.slice(0, -1);
  };
</script>

<svelte:window onkeydown={touche} />

<span class="lab c">{label}</span>
<div class="otp" role="group" aria-label="{label} : {valeur.length} chiffre{valeur.length > 1 ? 's' : ''} saisi{valeur.length > 1 ? 's' : ''} sur {longueur}">
  {#each Array.from({ length: longueur }, (_, i) => i) as i (i)}<span class:on={valeur.length === i} class:err={!!erreur}>{valeur[i] ? '•' : ''}</span>{/each}
</div>
{#if erreur}<span class="t13 erc c" role="alert">{erreur}</span>{/if}
<div class="pad">
  {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as c (c)}<button type="button" disabled={desactive} onclick={() => ajouter(c)}>{c}</button>{/each}
  <button type="button" aria-label="Tout effacer" disabled={desactive} onclick={() => (valeur = '')}>C</button>
  <button type="button" disabled={desactive} onclick={() => ajouter('0')}>0</button>
  <button type="button" aria-label="Effacer le dernier chiffre" disabled={desactive} onclick={() => (valeur = valeur.slice(0, -1))}>←</button>
</div>

<style>
  .otp { display: flex; gap: 8px; justify-content: center; }
  .otp span { width: 46px; height: 54px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; font: 700 22px 'Geist Mono', monospace; }
  .otp span.on { border-color: #3de0ff; }
  .otp span.err { border-color: #ff6b6b; }
  .pad button:disabled { opacity: 0.45; }
</style>
