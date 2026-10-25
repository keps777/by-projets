<script lang="ts">
  import { onMount } from 'svelte';
  import Icone from '../../ui/Icone.svelte';
  import { overlays } from '../../ui/overlays.svelte.ts';
  import { animationsPermises, delaiAvant, enteteInitial, interrompre, lettres, MARQUE_MS, modeDe, PROMESSE, rotationEnPause, rythme, sonPermis, suivant } from '../../core/marque.ts';
  import Logo from '../entree/Logo.svelte';
  import { preferences } from '../entree/etat.ts';
  import { jouerSting } from './jingle.ts';

  /** Première ligne de l'accueil : « Salut Aïcha » + sous-titre, badge des départs, cloche. De temps en temps elle laisse place à un moment de marque
   *  (logo en orbite qui pulse, « AfriMove » lettre par lettre, la promesse) accompagné du sting sonore si la personne a déjà touché la page et que les sons sont permis. */
  let { prenom, sous, nbDeparts, nonLues = 0, pause = false, onnotifications }: {
    prenom: string; sous: string; nbDeparts: number; nonLues?: number; /** Une fenêtre de la page est ouverte. */ pause?: boolean; onnotifications: () => void;
  } = $props();

  const prefs = preferences();
  const param = typeof location === 'undefined' ? null : new URLSearchParams(location.search).get('entete');
  const automatise = typeof navigator !== 'undefined' && !!navigator.webdriver;
  const mode = modeDe(param);
  const lire = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

  let reduit = $state(lire());
  let visible = $state(true);
  let horsEcran = $state(false);
  let appui = $state(false);
  let aInteragi = $state(typeof navigator !== 'undefined' && 'userActivation' in navigator && navigator.userActivation.hasBeenActive);
  let e = $state(enteteInitial());
  let fondu = $state(false); // la salutation revient un peu avant la fin du moment de marque (fondu enchaîné)
  let tete = $state<HTMLElement>();

  const permis = $derived(animationsPermises({ automatise, parametre: param, mouvementReduit: reduit }));
  const enPause = $derived(rotationEnPause({ visible, ecranVisible: true, fenetreOuverte: pause || overlays.orbe || overlays.notifications, appui, horsEcran, mouvementReduit: !permis }));
  const marque = $derived(e.moment === 'marque');
  const cache = $derived(marque && !fondu);
  const lettresMarque = lettres();

  onMount(() => {
    const mq = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
    const surMouvement = () => (reduit = lire());
    const surVisibilite = () => (visible = document.visibilityState !== 'hidden');
    const toucher = () => (aInteragi = true);
    const presser = () => { appui = true; aInteragi = true; };
    const lacher = () => (appui = false);
    mq?.addEventListener('change', surMouvement);
    document.addEventListener('visibilitychange', surVisibilite); surVisibilite();
    addEventListener('keydown', toucher); addEventListener('pointerdown', presser); addEventListener('pointerup', lacher); addEventListener('pointercancel', lacher); addEventListener('blur', lacher);
    const io = tete && typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((l) => { horsEcran = !l[l.length - 1].isIntersecting; }, { threshold: 0.2 }) : null;
    if (tete) io?.observe(tete);
    return () => {
      mq?.removeEventListener('change', surMouvement); document.removeEventListener('visibilitychange', surVisibilite);
      removeEventListener('keydown', toucher); removeEventListener('pointerdown', presser); removeEventListener('pointerup', lacher); removeEventListener('pointercancel', lacher); removeEventListener('blur', lacher);
      io?.disconnect();
    };
  });

  // Planning : une seule minuterie à la fois ; en pause elle est coupée (et un moment de marque en cours revient à la salutation).
  $effect(() => {
    if (enPause) { e = interrompre(e); return; }
    const d = delaiAvant(e, rythme(mode));
    if (d === null) return;
    const t = setTimeout(() => {
      e = suivant(e);
      if (e.moment === 'marque' && sonPermis({ aInteragi, sonsActifs: prefs.sons })) void jouerSting();
    }, d);
    return () => clearTimeout(t);
  });
  $effect(() => {
    if (!marque) return;
    const f = setTimeout(() => (fondu = true), MARQUE_MS - 300);
    return () => { clearTimeout(f); fondu = false; };
  });
</script>

<header class="hd mq" class:cache bind:this={tete}>
  <div class="salut">
    <span role="img" aria-label="AfriMove"><Logo taille={38} /></span>
    <div class="col"><span class="ttl t16 ell">Salut {prenom}</span><span class="t13 mut ell">{sous}</span></div>
  </div>
  <div class="droite">
    <span class="pl ok badge"><span class="dot"></span>{nbDeparts}<span class="long">&nbsp;départ{nbDeparts > 1 ? 's' : ''}</span></span>
    <button type="button" class="ib cloche" aria-label={nonLues ? `Notifications, ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : 'Notifications'} aria-haspopup="dialog" onclick={onnotifications}>
      <Icone nom="cloche" taille={22} />{#if nonLues}<b class="nb" aria-hidden="true">{nonLues > 9 ? '9+' : nonLues}</b>{/if}
    </button>
  </div>
  {#if marque}
    <div class="marque" aria-hidden="true">
      <div class="orbe">
        <div class="anneau"><i></i></div><div class="anneau b"><i></i></div>
        <span class="logo"><Logo taille={40} /></span>
        <span class="reflet"></span>
      </div>
      <div class="col txt">
        <span class="mot ttl">{#each lettresMarque as l (l.retard)}<span class="lt" style="--d:{l.retard}ms">{l.c}</span>{/each}<span class="reflet"></span></span>
        <span class="promesse t12 mut">{PROMESSE}</span>
      </div>
    </div>
  {/if}
</header>

<style>
  .mq { position: relative; min-height: 68px; gap: 8px; }
  .salut { display: flex; align-items: center; gap: 10px; min-width: 0; flex: 1; transition: opacity 0.3s, transform 0.3s; }
  .droite { display: flex; align-items: center; gap: 8px; flex: none; }
  .badge { transition: opacity 0.3s; }
  .cache .salut { opacity: 0; transform: translateY(-5px); }
  .cache .badge { opacity: 0; }
  .cloche { position: relative; min-width: 46px; backdrop-filter: blur(14px); }
  .nb { position: absolute; top: 3px; right: 3px; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: #ff5bde; color: #06080f; font: 700 11px/18px 'Geist Mono', monospace; text-align: center; box-shadow: 0 0 0 2px #0a0e1c; }

  /* moment de marque : couvre la ligne (sauf la cloche) pendant 1,6 s */
  .marque { position: absolute; left: 12px; right: 66px; top: 0; bottom: 0; display: flex; align-items: center; gap: 12px; pointer-events: none; animation: mqCouche 1.6s linear both; }
  .orbe { position: relative; flex: none; width: 68px; height: 68px; display: grid; place-items: center; perspective: 500px; overflow: hidden; border-radius: 22px; }
  .logo { position: relative; display: block; line-height: 0; border-radius: 13px; animation: mqPouls 1.6s cubic-bezier(0.3, 0.8, 0.3, 1) both; }
  .anneau { position: absolute; inset: 2px; border-radius: 50%; border: 1px dashed rgba(61, 224, 255, 0.7); transform: rotateX(62deg); animation: mqOrbite 1.6s cubic-bezier(0.3, 0.6, 0.4, 1) both; }
  .anneau i { position: absolute; top: -4px; left: 50%; width: 8px; height: 8px; margin-left: -4px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 12px #3de0ff; }
  .anneau.b { inset: 11px; border-color: rgba(139, 124, 255, 0.75); animation-name: mqOrbiteB; }
  .anneau.b i { background: #ff5bde; box-shadow: 0 0 12px #ff5bde; }
  .txt { min-width: 0; gap: 2px; }
  .mot { position: relative; display: inline-block; align-self: flex-start; font-size: 24px; line-height: 1.1; white-space: nowrap; overflow: hidden; padding: 2px 4px 4px 0; margin: -2px -4px -4px 0; }
  .lt { display: inline-block; background: linear-gradient(180deg, #f2f4ff 20%, #b3a8ff 120%); -webkit-background-clip: text; background-clip: text; color: transparent; animation: mqLettre 0.55s cubic-bezier(0.2, 0.9, 0.3, 1.35) var(--d) both; }
  .lt:nth-child(n + 5) { background-image: linear-gradient(180deg, #f2f4ff 10%, #7febff 130%); }
  .promesse { white-space: normal; line-height: 1.25; animation: mqFondu 0.5s 0.8s both; }
  .reflet { position: absolute; top: -20%; bottom: -20%; left: 0; width: 28%; pointer-events: none; opacity: 0; background: linear-gradient(100deg, transparent, rgba(255, 255, 255, 0.5), transparent); transform: translateX(-130%) skewX(-18deg); animation: mqReflet 0.7s ease-out 0.75s both; filter: blur(1.5px); }
  .orbe .reflet { animation-delay: 0.3s; width: 30%; opacity: 0; }
  @keyframes mqCouche { 0% { opacity: 0; } 12% { opacity: 1; } 80% { opacity: 1; } 100% { opacity: 0; } }
  @keyframes mqPouls { 0% { transform: scale(0.6); filter: drop-shadow(0 0 0 rgba(61, 224, 255, 0)); } 22% { transform: scale(1.18); filter: drop-shadow(0 0 14px rgba(61, 224, 255, 0.9)); } 40% { transform: scale(0.96); } 60% { transform: scale(1.1); filter: drop-shadow(0 0 12px rgba(139, 124, 255, 0.9)); } 100% { transform: scale(1); filter: drop-shadow(0 0 6px rgba(124, 108, 255, 0.5)); } }
  @keyframes mqOrbite { 0% { opacity: 0; transform: rotateX(62deg) rotate(0) scale(0.5); } 18% { opacity: 1; } 100% { opacity: 1; transform: rotateX(62deg) rotate(300deg) scale(1); } }
  @keyframes mqOrbiteB { 0% { opacity: 0; transform: rotateX(62deg) rotate(0) scale(0.5); } 18% { opacity: 1; } 100% { opacity: 1; transform: rotateX(62deg) rotate(-420deg) scale(1); } }
  @keyframes mqLettre { 0% { opacity: 0; transform: translateY(12px) scale(0.6); filter: blur(4px); } 100% { opacity: 1; transform: none; filter: none; } }
  @keyframes mqFondu { 0% { opacity: 0; transform: translateY(5px); } 100% { opacity: 1; transform: none; } }
  @keyframes mqReflet { 0% { opacity: 0; transform: translateX(-130%) skewX(-18deg); } 25% { opacity: 0.9; } 100% { opacity: 0; transform: translateX(430%) skewX(-18deg); } }
  @media (max-width: 359px) { .long { display: none; } .droite { gap: 4px; } .mq { padding-left: 12px; padding-right: 12px; } .marque { left: 6px; right: 62px; gap: 6px; } .mot { font-size: 21px; } .promesse { font-size: 11px; } }
  @media (prefers-reduced-motion: reduce) { .marque, .logo, .anneau, .lt, .promesse, .reflet { animation: none !important; } .reflet { display: none; } }
</style>
