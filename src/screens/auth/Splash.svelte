<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Logo from './Logo.svelte';

  const destination = () => (app.auth.connecte ? '/' : app.auth.hash ? '/connexion' : '/bienvenue');
  let parti = false;
  function entrer() { if (parti) return; parti = true; aller(destination(), { remplacer: true }); }
  onMount(() => { const t = setTimeout(entrer, 2600); return () => clearTimeout(t); });
</script>

<a class="splash" href={destination()} aria-label="Entrer dans AssureMe" onclick={(e) => { e.preventDefault(); entrer(); }}>
  <div class="grille" aria-hidden="true"></div>
  <div class="lueur" aria-hidden="true"></div>
  <div class="anneau a1" aria-hidden="true"></div><div class="anneau a2" aria-hidden="true"></div>
  <div class="centre">
    <span class="tuile"><Logo taille={120} anime titre="" /></span>
    <div class="mot">Assure<span>Me</span></div>
    <div class="slogan">Votre salaire travaille pour vous.</div>
  </div>
  <div class="pied">
    <div class="barre" aria-hidden="true"><i></i></div>
    <div class="mention">CHIFFRÉ DE BOUT EN BOUT · [ÉTABLISSEMENT AGRÉÉ COBAC]</div>
  </div>
</a>

<style>
  .splash { display: block; position: relative; overflow: hidden; min-height: 100dvh; background: var(--fond); }
  .grille { position: absolute; inset: 0; background-image: linear-gradient(rgba(255, 255, 255, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.03) 1px, transparent 1px); background-size: 40px 40px; }
  .lueur { position: absolute; top: 50%; left: 50%; width: 280px; height: 280px; margin: -170px 0 0 -140px; border-radius: 50%; background: radial-gradient(closest-side, rgba(48, 80, 255, 0.55), rgba(48, 80, 255, 0)); animation: lueur 2.4s 1.2s ease-in-out infinite; }
  .anneau { position: absolute; top: 50%; left: 50%; width: 160px; height: 160px; margin: -150px 0 0 -80px; border-radius: 50%; border: 1px solid rgba(124, 147, 255, 0.6); animation: anneau 1.6s 1.1s ease-out both; }
  .a2 { border-color: rgba(124, 147, 255, 0.4); animation-delay: 1.4s; }
  .centre { position: absolute; inset: 0 0 40px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 22px; }
  .tuile { display: block; border-radius: 30px; box-shadow: 0 30px 80px -20px rgba(48, 80, 255, 0.9), 0 0 0 1px rgba(255, 255, 255, 0.1); line-height: 0; }
  .tuile :global(svg) { border-radius: 30px; }
  .mot { font-weight: 600; font-size: 34px; letter-spacing: -0.04em; line-height: 1; animation: monte 0.6s 1.35s ease-out both; } .mot span { color: var(--primaire-clair); }
  .slogan { font-size: 14px; color: var(--muted); letter-spacing: 0.01em; animation: monte 0.6s 1.65s ease-out both; }
  .pied { position: absolute; left: 20px; right: 20px; bottom: calc(env(safe-area-inset-bottom) + 32px); display: flex; flex-direction: column; align-items: center; gap: 14px; animation: fondu 0.6s 2.2s ease-out both; }
  .barre { width: 160px; height: 2px; border-radius: 1px; background: #1e2638; overflow: hidden; } .barre i { display: block; height: 2px; background: var(--primaire); box-shadow: 0 0 10px var(--primaire); animation: ligne 2.4s 0.2s linear both; }
  .mention { font: 400 10px var(--mono); color: var(--faint); letter-spacing: 0.1em; text-align: center; }
  @keyframes lueur { 0%, 100% { opacity: 0.45; transform: scale(1); } 50% { opacity: 0.9; transform: scale(1.18); } }
  @keyframes anneau { 0% { transform: scale(0.6); opacity: 0.7; } 100% { transform: scale(1.6); opacity: 0; } }
  @keyframes monte { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes ligne { from { width: 0; } to { width: 100%; } } @keyframes fondu { from { opacity: 0; } to { opacity: 1; } }
</style>
