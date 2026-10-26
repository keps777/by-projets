<script lang="ts">
  import { aller, routeur } from '../router.svelte.ts';
  import { app } from '../data/store.svelte.ts';
  import Icone from './Icone.svelte';
  import Logo from './Logo.svelte';
  import { liensPc, rechercheRapide } from './pc.ts';
  /** En-tête de l'application sur PC (≥ 900 px) : logo, bascule Voyager ⇄ Mes actifs, recherche d'une ville / d'un code / d'une référence NXG, cloche, avatar, puis la navigation de la face. */
  let { face }: { face: 'jour' | 'nuit' } = $props();
  const compte = $derived(app.monde.comptes.find((c) => c.id === app.session.compteId));
  const initiales = $derived(compte ? `${compte.prenom[0] ?? ''}${compte.nom[0] ?? ''}` : '');
  const nonLues = $derived(compte ? app.monde.notifications.filter((n) => n.compteId === compte.id && !n.lu).length : 0);
  const liens = $derived(liensPc(face, compte?.id, routeur.chemin));
  let q = $state('');
  const aF = (a: 'voyage' | 'marche') => { app.session.face = a; aller(a === 'voyage' ? '/' : '/portefeuille'); };
  function chercher(e: SubmitEvent) { e.preventDefault(); aller(rechercheRapide(q, app.monde, compte?.id)); q = ''; }
</script>

<div class="barre">
  <a class="marque" href="/" onclick={(e) => { e.preventDefault(); aller('/'); }} aria-label="NexG-TT, accueil"><Logo /></a>
  <div class="bascule" role="group" aria-label="Face de l’application">
    <button type="button" aria-pressed={face === 'jour'} onclick={() => aF('voyage')}><Icone nom="soleil" taille={16} trait={2} />Voyager</button>
    <button type="button" aria-pressed={face === 'nuit'} onclick={() => aF('marche')}><Icone nom="lune" taille={16} trait={2} />Mes actifs</button>
  </div>
  <form class="recherche" role="search" onsubmit={chercher}>
    <label class="sr" for="rech-pc">Rechercher une ville, un code d’aéroport ou une référence</label>
    <Icone nom="chercher" taille={18} /><input id="rech-pc" type="search" placeholder="Ville, code d’aéroport ou référence" autocomplete="off" bind:value={q} />
  </form>
  <div class="actions">
    <a class="rond" href="/notifications" aria-label={nonLues ? `Notifications, ${nonLues} non lues` : 'Notifications'} onclick={(e) => { e.preventDefault(); aller('/notifications'); }}><Icone nom="cloche" />{#if nonLues}<span class="pastille" aria-hidden="true"></span>{/if}</a>
    <a class="rond av" href="/compte" aria-label="Mon compte" onclick={(e) => { e.preventDefault(); aller('/compte'); }}>{initiales || '·'}</a>
  </div>
</div>
<nav class="liens" aria-label="Navigation principale">
  {#each liens as l (l.label)}<a href={l.href} class:on={l.actif} aria-current={l.actif ? 'page' : undefined} onclick={(e) => { e.preventDefault(); aller(l.href); }}><Icone nom={l.icone} taille={18} />{l.label}</a>{/each}
</nav>

<style>
  .barre { display: grid; grid-template-columns: auto auto 1fr auto; align-items: center; gap: 20px; }
  .bascule { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); }
  .bascule button { display: inline-flex; align-items: center; gap: 6px; min-height: 40px; padding: 0 16px; border: 0; border-radius: 999px; background: transparent; color: var(--ink2); font: 700 13px/1 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
  .bascule button[aria-pressed='true'] { background: var(--signal); color: #0B1B2E; }
  [data-face='jour'] .bascule button[aria-pressed='true'] { background: #0B1B2E; color: #fff; }
  .recherche { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink3); max-width: 420px; justify-self: end; width: 100%; }
  .recherche input { flex: 1; min-width: 0; border: 0; outline: 0; background: transparent; color: var(--ink); font-size: 15px; }
  .recherche:focus-within { border-color: var(--focus); }
  .actions { display: flex; gap: 8px; align-items: center; }
  .rond { position: relative; width: 44px; height: 44px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); display: grid; place-items: center; text-decoration: none; }
  .rond.av { background: var(--accent); color: var(--on-signal); font: 700 15px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
  [data-face='jour'] .rond.av { background: #0B1B2E; color: #fff; }
  .pastille { position: absolute; top: 9px; right: 10px; width: 9px; height: 9px; border-radius: 999px; background: var(--signal); border: 2px solid var(--surface); }
  .liens { display: flex; gap: 4px; margin-top: 8px; }
  .liens a { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 16px; border-radius: 10px; color: var(--ink2); font: 600 15px/1 'Barlow', sans-serif; border-bottom: 2px solid transparent; }
  .liens a.on { color: var(--ink); border-bottom-color: var(--signal); background: var(--accent-soft); }
  [data-face='jour'] .liens a.on { border-bottom-color: var(--accent); }
</style>
