<script lang="ts">
  import { onMount } from 'svelte';
  import { minutesDuJour } from '../../data/horloge.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { aller } from '../../router.svelte.ts';
  import { nav } from './lien.ts';

  /** Maintenance programmée de 02:00 à 03:00 : décompte, ce qui marche quand même. Hors fenêtre, la démo part de 38 min. */
  const DEBUT = 2 * 60, FIN = 3 * 60;
  const minutes = minutesDuJour();
  let reste = $state(minutes >= DEBUT && minutes < FIN ? FIN - minutes : 38);
  onMount(() => { const id = setInterval(() => { reste = Math.max(0, reste - 1); }, 60_000); return () => clearInterval(id); });
</script>

<Mobile titre="Maintenance" sansRetour>
  {#snippet droite()}<span class="pl wa"><span class="dot"></span>jusqu’à 03:00</span>{/snippet}
  <div class="center">
    <div class="rings" aria-hidden="true"><i></i><i></i><i></i><b>{reste > 0 ? `${reste} min` : 'fini'}</b></div>
    <h1 class="ttl t20">{reste > 0 ? 'On améliore AfriMove' : 'C’est terminé'}</h1>
    <span class="t14 mut" style="max-width: 30ch">{reste > 0 ? 'Entre 02:00 et 03:00, les paiements dans l’app sont en pause. Les billets déjà payés restent valables.' : 'Les paiements sont de nouveau ouverts. Merci d’avoir patienté.'}</span>
    <span class="sr" role="status">{reste > 0 ? `Reste ${reste} minutes` : 'Maintenance terminée'}</span>
    <button class="b s sm" type="button" onclick={() => (reste = Math.max(0, reste - 10))} disabled={reste === 0}>Avancer l’horloge (démo)</button>
  </div>
  <span class="lab">Ça marche quand même</span>
  <div class="gl col" style="gap: 0">
    <a class="li" href="/pass/hors-ligne" use:nav><span class="bub aq" aria-hidden="true">✓</span><span class="grow t14">Montrer mon billet hors ligne</span></a>
    <a class="li" href="/ussd" use:nav><span class="bub aq" aria-hidden="true">✓</span><span class="grow t14">Acheter par *123# ou WhatsApp</span></a>
    <div class="li"><span class="bub aq" aria-hidden="true">✓</span><span class="grow t14">Les guichets vendent en mode hors ligne</span></div>
  </div>
  <button class="b p" type="button" style="margin-top: auto" onclick={() => aller('/')}>Revenir à l’accueil</button>
</Mobile>

<style>
  h1 { margin: 0; }
  .rings { position: relative; width: 170px; height: 170px; perspective: 600px; }
  .rings i { position: absolute; inset: 0; border-radius: 50%; border: 2px dashed rgba(61, 224, 255, 0.5); transform: rotateX(68deg); animation: spin 14s linear infinite; }
  .rings i:nth-child(2) { inset: 26px; border-color: rgba(139, 124, 255, 0.5); animation-duration: 9s; animation-direction: reverse; }
  .rings i:nth-child(3) { inset: 52px; border-color: rgba(255, 91, 222, 0.5); animation-duration: 6s; }
  @keyframes spin { to { transform: rotateX(68deg) rotate(360deg); } }
  .rings b { position: absolute; inset: 0; display: grid; place-items: center; font: 700 26px 'Unbounded Variable', 'Unbounded', sans-serif; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .b:disabled { opacity: 0.4; }
</style>
