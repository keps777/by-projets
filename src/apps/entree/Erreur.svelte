<script lang="ts">
  import { onDestroy } from 'svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { nav } from './lien.ts';

  /** Erreur inattendue : réessayer (2 s de reconnexion), puis retour à l'accueil. `?code=504` change le code affiché. */
  const code = param('code') && /^\d{3}$/.test(param('code')!) ? param('code')! : '502';
  const d = new Date(maintenant()), p2 = (n: number) => String(n).padStart(2, '0');
  const ref = `E-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}`;
  let k = $state<0 | 1 | 2>(0), horsLigne = $state(false), minuteur: ReturnType<typeof setTimeout> | undefined;
  onDestroy(() => clearTimeout(minuteur));
  const titre = $derived(horsLigne ? 'Toujours pas de réseau' : ['Ça n’a pas marché', 'On réessaie…', 'C’est revenu'][k]);
  const sous = $derived(horsLigne ? 'Ton téléphone n’a pas de connexion. Ton billet reste disponible hors ligne, et *123# marche sans internet.' : ['Le serveur n’a pas répondu. Ton billet et ton argent sont en sécurité : rien n’a été débité deux fois.', 'Reconnexion en cours, 2 s.', 'Tout est de nouveau en ligne. Désolés pour l’attente.'][k]);
  const cta = $derived(['Réessayer', 'Patiente…', 'Revenir à l’accueil'][k]);
  function reessayer() {
    if (k === 2) { aller('/'); return; }
    if (k === 1) return;
    horsLigne = false; k = 1;
    minuteur = setTimeout(() => { if (typeof navigator !== 'undefined' && navigator.onLine === false) { horsLigne = true; k = 0; } else k = 2; }, 2000);
  }
</script>

<Mobile titre="Oups" sansRetour>
  {#snippet droite()}<span class="pl er">erreur {code}</span>{/snippet}
  <div class="center">
    <span class="ill" class:er={k !== 2} class:ok={k === 2}>
      {#if k === 2}<svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      {:else}<svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l9.5 17h-19z" /><path d="M12 10v4M12 17.5v.5" /></svg>{/if}
    </span>
    <h1 class="ttl t20" aria-live="polite">{titre}</h1>
    <span class="t14 mut" style="max-width: 30ch">{sous}</span>
    <span class="mono t12 mut3">réf. {ref} · envoyée à l’équipe</span>
  </div>
  <div class="col g8" style="margin-top: auto">
    <button class="b p" type="button" onclick={reessayer} aria-busy={k === 1}>{#if k === 1}<span class="spin" aria-hidden="true"></span>{/if}{cta}</button>
    <a class="b s" href="/pass/hors-ligne" use:nav>Mon billet hors ligne</a>
    <a class="b g" href="/ussd" use:nav>Continuer par *123#</a>
  </div>
</Mobile>

<style>
  h1 { margin: 0; }
  .spin { width: 22px; height: 22px; border-radius: 50%; border: 3px solid rgba(6, 8, 15, 0.3); border-top-color: #06080f; animation: tourne 0.8s linear infinite; }
  @keyframes tourne { to { transform: rotate(360deg); } }
</style>
