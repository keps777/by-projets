<script lang="ts">
  import { onMount } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { LONGUEUR_CODE, OTP_ESSAIS_MAX, secondesAvantRenvoi, type ResultatOtp } from '../../core/auth.ts';
  import { minutesSecondes } from '../../core/inscription.ts';
  import Alerte from './Alerte.svelte';
  import BandeauSms from './BandeauSms.svelte';
  import Clavier from './Clavier.svelte';
  import SaisieCode from './SaisieCode.svelte';
  import { controlerOtp, envoyerOtp } from './actions.ts';

  /** Saisie du code SMS à 6 chiffres : bandeau de démo, 5 essais, 5 minutes, renvoi possible après 42 s. */
  let { numero, verifie = $bindable(false), compact = false, onverifie }: { numero: string; verifie?: boolean; compact?: boolean; onverifie?: () => void } = $props();

  let code = $state('');
  let resultat = $state<ResultatOtp | null>(null);
  let secousse = $state(0);
  let occupe = $state(false);
  let renvoye = $state(false);
  let maint = $state(maintenant());

  onMount(() => {
    if (!app.auth.otp && !verifie) void envoyerOtp(numero);
    const t = setInterval(() => (maint = maintenant()), 1000);
    return () => clearInterval(t);
  });

  const attente = $derived(secondesAvantRenvoi(app.auth.otp, maint));
  const restants = $derived(app.auth.otp ? Math.max(0, OTP_ESSAIS_MAX - app.auth.otp.essais) : OTP_ESSAIS_MAX);
  const ton = $derived(verifie ? 'ok' : resultat && resultat !== 'ok' ? 'mauvais' : 'neutre');
  const finie = $derived(resultat === 'expire' || resultat === 'trop_d_essais');

  async function chiffre(d: string) {
    if (verifie || occupe || finie || (code.length >= LONGUEUR_CODE && resultat !== 'faux')) return;
    if (resultat === 'faux') { code = ''; resultat = null; }
    code += d;
    if (code.length < LONGUEUR_CODE) return;
    occupe = true;
    const r = await controlerOtp(code);
    occupe = false; resultat = r;
    if (r === 'ok') { verifie = true; onverifie?.(); }
    else { secousse++; if (r === 'faux') { /* le code reste affiché en rouge jusqu'à la prochaine frappe */ } }
  }
  function efface() {
    if (verifie || occupe || finie) return;
    code = resultat === 'faux' ? '' : code.slice(0, -1); resultat = null;
  }
  async function renvoyer() {
    if (attente > 0 || occupe) return;
    await envoyerOtp(numero);
    code = ''; resultat = null; renvoye = true; maint = maintenant();
  }
  const manque = $derived(LONGUEUR_CODE - code.length);
</script>

<BandeauSms />

<div class="otp">
  <SaisieCode valeur={code} {ton} {secousse} etiquette="Code SMS" />

  <div class="msg" aria-live="polite">
    {#if verifie}<Alerte ton="succes">Numéro vérifié. Vous pouvez continuer.</Alerte>
    {:else if resultat === 'faux'}<Alerte ton="erreur">Code incorrect. {restants} essai{restants > 1 ? 's' : ''} restant{restants > 1 ? 's' : ''}.</Alerte>
    {:else if resultat === 'expire'}<Alerte ton="erreur">Ce code a expiré (5 minutes). Demandez-en un nouveau.</Alerte>
    {:else if resultat === 'trop_d_essais'}<Alerte ton="erreur">Trop d'essais. Demandez un nouveau code.</Alerte>
    {:else}<p class="aide">{manque} chiffre{manque > 1 ? 's' : ''} à saisir</p>{/if}
  </div>

  {#if !verifie}<p class="renvoi">
    {#if attente > 0}Renvoyer <span class="mono">dans {minutesSecondes(attente).replace(/^0/, '')}</span>.
    {:else}<button type="button" onclick={renvoyer}>Renvoyer le code</button>{/if}
    {#if renvoye && attente > 0}<span class="ok">Code renvoyé à l'instant.</span>{/if}
  </p>{/if}

  <Clavier {compact} onchiffre={chiffre} oneffacer={efface} desactive={verifie || occupe} />
</div>

<style>
  .otp { display: flex; flex-direction: column; gap: 14px; }
  .msg { min-height: 46px; display: flex; align-items: center; justify-content: center; } .msg > :global(*) { width: 100%; }
  .aide { text-align: center; color: var(--muted); font-size: 13px; width: 100%; }
  .renvoi { text-align: center; color: var(--muted); font-size: 13.5px; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; }
  .renvoi button { color: var(--primaire-clair); font-weight: 600; min-height: 44px; padding: 0 12px; } .ok { color: var(--bon); }
</style>
