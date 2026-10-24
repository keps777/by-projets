<script lang="ts">
  import { tick } from 'svelte';
  import { param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { formaterTel } from '../../core/telephone.ts';
  import { affichage, appuyer, ecranCourant, nouvelleSession, retourUssd, saisir, titulaire } from './ussd.ts';
  import { nouvelleConversation, NUMERO_WHATSAPP, repondre } from './whatsapp.ts';
  import { nav } from './lien.ts';

  /** *123# sans internet (menu numéroté fonctionnel) et WhatsApp AfriMove (conversation simulée) : deux canaux, un seul monde. */
  let canal = $state<'ussd' | 'whatsapp'>(param('canal') === 'whatsapp' ? 'whatsapp' : 'ussd');
  let session = $state(nouvelleSession()), champ = $state('');
  const a = $derived(affichage(session));
  const moi = $derived(titulaire());
  const racine = $derived(ecranCourant(session).t === 'racine');
  function taper(t: string) { appuyer(session, t); champ = ''; }
  function envoyerChamp() { if (champ.trim()) { saisir(session, champ); champ = ''; } }

  let conv = $state(nouvelleConversation()), msg = $state(''), ecrit = $state(false), fil: HTMLElement | undefined = $state();
  let nextId = 2;
  async function defiler() { await tick(); fil?.scrollTo({ top: fil.scrollHeight }); }
  function envoyer(texte: string) {
    const t = texte.trim(); if (!t || ecrit) return;
    conv.messages.push({ id: nextId++, de: 'moi', texte: t }); msg = ''; ecrit = true; void defiler();
    const reponses = repondre(conv, t);
    setTimeout(() => { for (const r of reponses) conv.messages.push({ id: nextId++, de: 'bot', texte: r }); ecrit = false; void defiler(); }, 450);
  }
</script>

<Mobile titre="Sans internet" sous="Tout marche sur un petit téléphone">
  {#snippet droite()}<span class="pl">{canal === 'ussd' ? '*123#' : 'WhatsApp'}</span>{/snippet}
  <div class="seg2" role="tablist" aria-label="Canal">
    <button type="button" role="tab" aria-selected={canal === 'ussd'} class:on={canal === 'ussd'} onclick={() => (canal = 'ussd')}>*123#</button>
    <button type="button" role="tab" aria-selected={canal === 'whatsapp'} class:on={canal === 'whatsapp'} onclick={() => (canal = 'whatsapp')}>WhatsApp</button>
  </div>

  {#if canal === 'ussd'}
    <div class="t12 mut3 mono">Ligne {formaterTel(moi.tel)} · {moi.prenom}</div>
    <div class="term" aria-live="polite" data-testid="terminal">{a.texte}</div>
    {#if a.saisie}
      <form class="row g8" onsubmit={(e) => { e.preventDefault(); envoyerChamp(); }}>
        <label class="grow"><span class="sr">{a.titreSaisie}</span><input class="inp champ" type="text" inputmode={a.saisie === 'numero' ? 'tel' : 'text'} autocapitalize="characters" placeholder={a.titreSaisie} bind:value={champ} /></label>
        <button class="b p sm" type="submit">Envoyer</button>
      </form>
    {/if}
    <div class="pad" aria-label="Choisir une option">
      {#each a.touches as k (k)}<button type="button" onclick={() => taper(k)}>{k}</button>{/each}
      <button type="button" class="retour" onclick={() => { session = retourUssd(session); champ = ''; }}>{ecranCourant(session).t === 'fin' ? 'Recomposer' : racine ? '0 · quitter' : '0 · retour'}</button>
    </div>
    <button class="wa" type="button" onclick={() => (canal = 'whatsapp')}>
      <span class="bub" style="color: #25d366; background: rgba(37, 211, 102, 0.15)"><Icone nom="info" taille={20} trait={2} /></span>
      <span class="col grow"><span class="t15 b7">WhatsApp AfriMove · {NUMERO_WHATSAPP}</span><span class="t12 mut">« Douala demain » ou un code colis : on te répond en 10 s</span></span>
    </button>
  {:else}
    <div class="chat" role="log" aria-live="polite" aria-label="Conversation WhatsApp AfriMove" bind:this={fil}>
      <div class="t12 mut3 c mono">WhatsApp AfriMove · {NUMERO_WHATSAPP}</div>
      {#each conv.messages as m (m.id)}<div class="bulle {m.de}">{m.texte}</div>{/each}
      {#if ecrit}<div class="bulle bot ecrit" aria-label="AfriMove écrit">• • •</div>{/if}
    </div>
    <div class="chips">
      {#each ['Douala demain', 'Bafoussam demain', 'AM-C-9Q2', 'Mon billet'] as q (q)}<button class="ch" type="button" onclick={() => envoyer(q)}>{q}</button>{/each}
    </div>
    <form class="row g8" onsubmit={(e) => { e.preventDefault(); envoyer(msg); }}>
      <label class="grow"><span class="sr">Message</span><input class="inp champ" type="text" placeholder="Écris un message" bind:value={msg} /></label>
      <button class="b p sm" type="submit" aria-label="Envoyer">Envoyer</button>
    </form>
  {/if}
  <a class="b g" href="/" use:nav style="margin-top: auto">J’ai du réseau · ouvrir l’app</a>
</Mobile>

<style>
  .term { border-radius: 22px; background: #0b1020; border: 1px solid rgba(255, 255, 255, 0.14); padding: 16px; font: 500 15px/1.6 'Geist Mono', monospace; color: #b7f5c3; min-height: 220px; white-space: pre-wrap; flex: none; }
  .pad button { font-family: 'Geist Mono', monospace; }
  .pad button.retour { font-size: 15px; white-space: nowrap; padding: 0 4px; }
  .wa { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; background: rgba(37, 211, 102, 0.12); border: 1px solid rgba(37, 211, 102, 0.4); color: inherit; text-align: left; min-height: 60px; cursor: pointer; font: inherit; width: 100%; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .champ { min-height: 50px; }
  .chat { flex: 1; min-height: 200px; max-height: 360px; overflow-y: auto; display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 22px; background: rgba(11, 16, 32, 0.8); border: 1px solid rgba(255, 255, 255, 0.14); scrollbar-width: none; }
  .bulle { max-width: 85%; padding: 10px 12px; border-radius: 16px; font-size: 14px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  .bulle.bot { align-self: flex-start; background: rgba(255, 255, 255, 0.1); border-top-left-radius: 4px; }
  .bulle.moi { align-self: flex-end; background: rgba(37, 211, 102, 0.22); border: 1px solid rgba(37, 211, 102, 0.4); border-top-right-radius: 4px; }
  .bulle.ecrit { letter-spacing: 3px; color: #a1accb; }
  .seg2 { flex: none; }
</style>
