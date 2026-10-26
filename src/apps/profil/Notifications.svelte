<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import type { Prefs } from '../../domain/types.ts';
  import Etapes from './Etapes.svelte';
  import { largeur } from './largeur.svelte.ts';
  import { CHOIX_NOTIF, enregistrerNotifications, profil, type Permission } from './actions.ts';

  /** Étape 4 sur 4 : on explique avant de demander. La demande d'autorisation du téléphone est simulée (aucun appel à `Notification.requestPermission`). */
  const depart = compteCourant(); const tr = profil();
  let prefs = $state<Prefs>(depart?.prefsNotif ?? 'essentiel');
  let permission = $state<Permission>(tr.permission);
  let feuille = $state(false);
  const decide = $derived(permission !== 'inconnue');

  const exemples = [
    { icone: 'drops', fond: 'var(--signal)', encre: '#0B1B2E', quand: 'maintenant', texte: 'Drop membres : YUL → PUJ à 200 $ · 3 places', d: 0 },
    { icone: 'horloge', fond: 'rgba(255,210,63,0.30)', encre: '#5C4600', quand: 'il y a 2 h', texte: 'YUL → CDG : nommez le voyageur avant demain 18:05', d: 140 },
    { icone: 'sac', fond: 'var(--accent-soft)', encre: 'var(--accent)', quand: 'hier', texte: 'Soute du vol 812 : un bagage à 95 $', d: 280 }
  ];
  const points = [
    { icone: 'horloge', fort: 'Échéances :', reste: ' un rappel avant chaque date limite pour nommer un voyageur.' },
    { icone: 'drops', fort: 'Drops et prix :', reste: ' seulement pour les intérêts que vous avez choisis.' },
    { icone: 'echange', fort: 'Fréquence réglable', reste: ' à tout moment dans Compte › Notifications : tout, l\'essentiel ou rien.' }
  ];

  function sauver(p: Permission) { const c = compteCourant(); if (c) enregistrerNotifications(c.id, prefs, p); permission = p; }
  function activer() { feuille = true; }
  function repondre(p: Permission) { feuille = false; sauver(p); }
  function annuler() { permission = 'inconnue'; const c = compteCourant(); if (c) enregistrerNotifications(c.id, prefs, 'inconnue'); }
  function continuer() { const c = compteCourant(); if (c) enregistrerNotifications(c.id, prefs, permission); aller('/pret'); }
  function plusTard() { aller('/pret'); }
</script>

{#snippet actions(pc: boolean)}
  {#if permission === 'accordee'}
    <div class="ok" role="status"><span class="coche" aria-hidden="true"><Icone nom="ok" taille={pc ? 22 : 18} trait={2.5} /></span><span class="col"><b>Notifications activées</b><span class="s">{pc ? 'Démo : la demande de l’appareil apparaîtrait ici.' : 'Démo : la demande du téléphone apparaîtrait ici.'}</span></span></div>
    {#if pc}<div class="ligne-pc"><button type="button" class="btn cta" onclick={continuer}>Continuer<Icone nom="suivant" taille={20} /></button><button type="button" class="btn texte" onclick={annuler}>Annuler (démo)</button></div>
    {:else}<button type="button" class="btn texte centre" onclick={annuler}>Annuler (démo)</button>
      <button type="button" class="btn" onclick={continuer}>Continuer<Icone nom="suivant" taille={20} /></button>{/if}
  {:else if permission === 'refusee' || prefs === 'rien'}
    <button type="button" class="btn cta" onclick={continuer}>Continuer<Icone nom="suivant" taille={20} /></button>
  {:else}
    <p class="t-aide centre aide-appareil">{pc ? 'Votre appareil affichera ensuite sa propre demande d’autorisation.' : 'Votre téléphone affichera ensuite sa propre demande d\'autorisation.'}</p>
    <div class="ligne-pc"><button type="button" class="btn cta" onclick={activer}><Icone nom="cloche" taille={20} trait={2} />Activer les notifications</button>
      <a class="plus-tard" href="/pret" onclick={(e) => { e.preventDefault(); plusTard(); }}>Plus tard</a></div>
  {/if}
{/snippet}
{#snippet piedMobile()}{@render actions(false)}{/snippet}

<Ecran titre="" face="jour" retour="/partage" large pied={largeur.pc ? undefined : piedMobile}>
  <div class="grille">
    <div class="gauche">
      {#if largeur.pc && permission === 'refusee'}
        <div class="bloque" role="alert"><span class="ib" aria-hidden="true"><Icone nom="alerte" taille={22} /></span><span class="col g4"><b>Notifications bloquées par l’appareil</b><span>Vous avez refusé la demande de l’appareil : aucune notification ne sera envoyée. Comment l’activer plus tard : dans les réglages de l’appareil, puis dans Compte › Notifications. Votre inscription continue.</span></span></div>
      {/if}
      <div class="et"><Etapes etape={4} ensuite="Dernière étape" /></div>
      <section class="col g8"><h1 class="t-titre">Être prévenu au bon moment</h1><p class="intro">Les drops membres ont peu de places, et nommer le voyageur a une date limite. Une notification vous évite de les manquer.</p></section>
      <ul class="points liste-plain">
        {#each points as p (p.fort)}<li><span class="pic2" aria-hidden="true"><Icone nom={p.icone} taille={largeur.pc ? 20 : 18} /></span><span class="txt-pt"><strong>{p.fort}</strong>{p.reste}</span></li>{/each}
      </ul>

      <fieldset class="choix">
        <legend class="t-section">Fréquence</legend>
        <div class="radios" role="radiogroup" aria-label="Fréquence des notifications">
          {#each CHOIX_NOTIF as c (c.id)}
            <label class="radio" class:on={prefs === c.id}><input type="radio" name="freq" value={c.id} bind:group={prefs} /><span class="col g4"><span class="t">{c.titre}</span><span class="s">{c.sous}</span></span></label>
          {/each}
        </div>
      </fieldset>

      <p class="aide-bas" aria-live="polite">
        {#if permission === 'refusee' && !largeur.pc}Pas de souci : vous pourrez les activer plus tard dans Compte › Notifications.{/if}
      </p>
      {#if largeur.pc}<div class="act">{@render actions(true)}</div>{/if}
    </div>

    <figure class="ex">
      <div class="ciel">
        {#each exemples as e (e.texte)}
          <div class="notif" style="animation-delay:{e.d}ms"><span class="pic" style="background:{e.fond};color:{e.encre}"><Icone nom={e.icone} taille={20} trait={2} /></span>
            <span class="col g4 grow"><span class="meta"><b>NEXG·TT</b><span>{e.quand}</span></span><span class="txt">{e.texte}</span></span></div>
        {/each}
        {#if largeur.pc}<p class="hyp"><span class="h">[H]</span><span>Canal des notifications sur PC (navigateur ou application) : à valider. Les exemples sont fictifs.</span></p>{/if}
      </div>
      {#if largeur.pc}<figcaption class="t-sec">Exemples de notifications · données fictives</figcaption>{/if}
    </figure>
  </div>
</Ecran>

<div class="nx" data-face="jour" style="display:contents"><Feuille bind:ouvert={feuille} titre="Autoriser les notifications ?" sous={largeur.pc ? 'Fenêtre simulée de l’appareil · démo' : 'Fenêtre simulée du téléphone · démo'}>
  <p class="t-sec">« NexG-TT » souhaite vous envoyer des notifications ({prefs === 'tout' ? 'tout' : 'l’essentiel'}). Aucune demande réelle n'est faite au navigateur.</p>
  {#snippet pied()}
    <button type="button" class="btn" onclick={() => repondre('accordee')}>Autoriser</button>
    <button type="button" class="btn sec" onclick={() => repondre('refusee')}>Ne pas autoriser</button>
  {/snippet}
</Feuille></div>

<style>
  .ex { margin: 0; display: flex; flex-direction: column; gap: 8px; }
  .ciel { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 18px 14px 16px; border-radius: 24px; background: #0B1B2E; overflow: hidden; }
  .notif { display: flex; gap: 12px; padding: 12px; border-radius: 16px; background: #fff; color: #0B1B2E; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.28); animation: nx-rise 420ms cubic-bezier(.2, .7, .2, 1) both; }
  .pic { flex: none; width: 38px; height: 38px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
  .meta { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; color: var(--ink3); } .meta b { letter-spacing: 0.04em; }
  .txt { font: 700 15px/20px 'Barlow', sans-serif; overflow-wrap: anywhere; }
  .t-titre { font: 600 38px/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; overflow-wrap: anywhere; }
  .intro { color: var(--ink2); font-size: 15px; line-height: 22px; }
  .points { display: flex; flex-direction: column; gap: 12px; } .points li { display: flex; align-items: flex-start; gap: 12px; font-size: 14px; line-height: 20px; color: var(--ink2); } .points strong { color: var(--ink); font-weight: 600; }
  .pic2 { flex: none; width: 32px; height: 32px; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .choix { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 10px; } .choix legend { padding: 0; margin-bottom: 10px; }
  .radios { display: flex; flex-direction: column; gap: 8px; }
  .radio { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 10px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line-strong); cursor: pointer; }
  .radio.on { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); background: var(--accent-soft); }
  .radio input { width: 22px; height: 22px; accent-color: var(--accent); flex: none; margin: 0; } .radio:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
  .t { font: 700 15px/20px 'Barlow', sans-serif; } .s { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .aide-bas { margin: 0; font-size: 13px; line-height: 18px; color: var(--ink3); min-height: 0; } .aide-bas:empty { display: none; }
  .ok { display: flex; align-items: center; gap: 12px; min-height: 52px; padding: 8px 14px; border-radius: 14px; background: var(--ok-soft); color: var(--ok); }
  .ok b { font-size: 15px; } .ok .s { color: var(--ink2); }
  .coche { flex: none; width: 32px; height: 32px; border-radius: 999px; background: var(--ok); color: #fff; display: flex; align-items: center; justify-content: center; animation: nx-pop 360ms cubic-bezier(.2, .8, .2, 1) both; }
  .plus-tard { display: flex; align-items: center; justify-content: center; height: 44px; color: var(--accent); font: 600 16px/1 'Barlow', sans-serif; }
  .centre { text-align: center; align-self: center; }
  @keyframes nx-rise { 0% { opacity: 0; transform: translateY(14px); } 100% { opacity: 1; transform: translateY(0); } }
  @keyframes nx-pop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); } }
  .grille, .gauche { display: contents; } .et { order: -2; } .ex { order: -1; } .ligne-pc { display: contents; } .hyp, .bloque { display: none; }
  @media (min-width: 900px) {
    .grille { display: grid; grid-template-columns: minmax(0, 1fr) clamp(300px, 40%, 500px); gap: 24px; align-items: start; }
    .gauche { display: flex; flex-direction: column; gap: 22px; max-width: 760px; min-width: 0; } .et, .ex { order: 0; }
    .t-titre { font-size: 40px; line-height: 40px; } .intro { font-size: 17px; line-height: 26px; color: var(--ink2); }
    .points li { align-items: flex-start; gap: 14px; min-height: 52px; font-size: 16px; line-height: 24px; } .txt-pt { padding-top: 8px; } .pic2 { width: 44px; height: 44px; border-radius: 12px; }
    .choix { max-width: 520px; }
    .act { display: flex; flex-direction: column; align-items: flex-start; gap: 12px; } .act .aide-appareil { margin: 0; text-align: left; align-self: auto; font-size: 14px; line-height: 20px; color: var(--ink2); }
    .ligne-pc { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 20px; }
    .cta { width: auto; min-width: 280px; min-height: 56px; padding: 8px 22px; font-size: 17px; }
    .plus-tard { min-height: 48px; padding: 0 12px; font-size: 16px; font-weight: 700; } .act .btn.texte { min-height: 48px; font-size: 16px; font-weight: 700; }
    .act .ok { width: 100%; box-sizing: border-box; padding: 14px; border-radius: 16px; border: 1px solid var(--ok); } .act .ok b { font-size: 16px; color: var(--ink); } .act .ok .s { font-size: 14px; line-height: 20px; color: var(--ink); } .act .coche { width: 48px; height: 48px; background: var(--ok); }
    .bloque { display: flex; align-items: center; gap: 14px; padding: 12px 16px; border-radius: 14px; background: var(--err-soft); border: 1px solid var(--err); font-size: 14px; line-height: 20px; color: var(--ink2); } .bloque b { font-size: 15px; color: var(--ink); } .ib { flex: none; display: flex; color: var(--err); }
    .ex { position: sticky; top: 16px; gap: 10px; } .ciel { gap: 12px; padding: 22px; border-radius: 24px; }
    .notif { gap: 14px; padding: 14px 16px; box-shadow: none; } .notif:nth-child(3) { background: var(--surface2); } .pic { width: 44px; height: 44px; border-radius: 12px; }
    .meta { font-size: 13px; color: var(--ink2); } .txt { font-size: 16px; line-height: 22px; }
    .hyp { display: flex; align-items: flex-start; gap: 8px; margin: 0; font-size: 13px; line-height: 20px; color: #C9D3DF; }
    .h { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; background: rgba(255, 210, 63, 0.16); color: #FFD23F; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.04em; }
  }
</style>
