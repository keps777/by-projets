<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Logo from './Logo.svelte';
  import { LANGUES, t } from './i18n.ts';
  import { definirLangue } from './actions.ts';
  import { preferences } from './etat.ts';
  import { jouerJingle } from './jingle.ts';

  /** Première ouverture : logo en orbite, choix de la langue (fr / en / pcm), jingle de 2 s si les sons sont permis. */
  const prefs = preferences();
  const suite = (vers: string) => { app.session.vuTuto = true; aller(vers); };

  // Jingle : lecture tentée tout de suite ; si le navigateur la bloque (pas encore de geste), elle part au premier toucher.
  onMount(() => {
    if (!prefs.sons || prefs.jinglejoue) return;
    let fini = false;
    const retirer = () => { removeEventListener('pointerdown', jouer); removeEventListener('keydown', jouer); };
    async function jouer() {
      if (fini || !prefs.sons) return;
      if (await jouerJingle()) { fini = true; prefs.jinglejoue = true; retirer(); }
    }
    addEventListener('pointerdown', jouer); addEventListener('keydown', jouer);
    if (!('userActivation' in navigator) || navigator.userActivation.hasBeenActive) void jouer();
    return () => { fini = true; retirer(); };
  });
</script>

<Mobile>
  <div class="orbit" aria-hidden="true">
    <div class="anneau"><i></i></div>
    <div class="anneau b"><i></i></div>
    <Logo taille={120} classe="logo" />
  </div>
  <div class="col c" style="gap: 8px">
    <h1 class="ttl t30">AfriMove</h1>
    <span class="t16 mut" style="max-width: 28ch; margin: 0 auto">{t('tagline')} <span class="grad" style="font-weight: 700">{t('taglineGrad')}</span></span>
  </div>
  <div class="col" style="gap: 8px; margin-top: auto">
    <span class="lab c" id="lbl-langue">{t('choisisLangue')}</span>
    <div class="seg2" role="group" aria-labelledby="lbl-langue">
      {#each LANGUES as l (l.id)}
        <button type="button" class:on={app.session.langue === l.id} aria-pressed={app.session.langue === l.id} onclick={() => definirLangue(l.id)}>{l.nom}</button>
      {/each}
    </div>
    <a class="b p" href="/tuto" onclick={(e) => { e.preventDefault(); suite('/tuto'); }}>{t('commencer')}</a>
    <a class="b g" href="/connexion" onclick={(e) => { e.preventDefault(); suite('/connexion'); }}>{t('dejaCompte')}</a>
    <p class="t12 mut3 c" style="margin: 0">{t('jingleNote')}</p>
  </div>
</Mobile>

<style>
  .orbit { position: relative; width: 260px; height: 260px; margin: 30px auto 10px; perspective: 800px; flex: none; }
  .orbit .anneau { position: absolute; inset: 0; border-radius: 50%; border: 1px dashed rgba(61, 224, 255, 0.5); transform: rotateX(68deg); animation: spin 18s linear infinite; }
  .orbit .anneau i { position: absolute; top: -7px; left: 50%; width: 14px; height: 14px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 18px #3de0ff; }
  .orbit .anneau.b { inset: 34px; border-color: rgba(139, 124, 255, 0.5); animation-duration: 11s; animation-direction: reverse; }
  .orbit .anneau.b i { background: #ff5bde; box-shadow: 0 0 18px #ff5bde; }
  .orbit :global(.logo) { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); filter: drop-shadow(0 20px 40px rgba(124, 108, 255, 0.5)); }
  @keyframes spin { to { transform: rotateX(68deg) rotate(360deg); } }
  h1 { margin: 0; }
  @media (max-height: 700px) { .orbit { margin-top: 0; transform: scale(0.8); } }
</style>
