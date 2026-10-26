<script lang="ts">
  import { onMount } from 'svelte';
  import './compte.css';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pic from './Pic.svelte';
  import { etatForce, reseau } from './reseau.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { CATEGORIES, NIVEAUX_NOTIF, alertesSuspendues, canaux, choisirNiveau, incluse, reglerCanal } from './notifs.ts';
  import type { Prefs } from '../../domain/types.ts';

  /** Préférences de notifications : fréquence (tout / l'essentiel / rien), ce que l'on reçoit par catégorie, canaux, messages toujours envoyés. */
  const compte = $derived(compteCourant());
  const niveau = $derived<Prefs>(compte?.prefsNotif ?? 'essentiel');
  const cx = $derived(canaux());
  let vue = $state<'normal' | 'chargement' | 'erreur'>('normal');
  let tentative = $state<Prefs | null>(null), message = $state(''), aide = $state(false);
  const refusee = typeof Notification !== 'undefined' && Notification.permission === 'denied';
  const bloque = $derived(!reseau.enLigne || vue === 'chargement');
  onMount(() => { const f = etatForce(); if (f === 'erreur' || f === 'chargement') vue = f; });

  function choisir(p: Prefs) {
    if (bloque) return;
    if (vue === 'erreur') { tentative = p; return; }
    if (compte && choisirNiveau(compte.id, p)) message = 'Préférence enregistrée';
  }
  function reessayer() { vue = 'normal'; if (tentative && compte) { choisirNiveau(compte.id, tentative); message = 'Préférence enregistrée'; } tentative = null; }
  function canal(c: 'appareil' | 'courriel', e: Event) { if (bloque) return; reglerCanal(c, (e.currentTarget as HTMLInputElement).checked); message = 'Préférence enregistrée'; }
  const va = (e: MouseEvent, c: string) => { e.preventDefault(); aller(c); };
</script>

<Ecran titre="Notifications" face="nuit" retour="/notifications">
  <div class="cp page">
    <p class="intro">Choisissez ce que NexG-TT vous envoie.</p>
    <p class="etat" role="status" aria-live="polite">{#if message}<Pic nom="ok" taille={16} trait={2} />{message}{/if}</p>

    {#if vue === 'erreur'}
      <div class="cp-erreur ligne" role="alert"><span class="col"><b>Votre choix n’a pas été enregistré.</b><span>Votre réglage précédent est conservé.</span></span><button type="button" class="btn sm" onclick={reessayer}>Réessayer</button></div>
    {/if}
    {#if !reseau.enLigne}<div class="cp-hl" role="status"><Icone nom="hors_ligne" taille={20} /><span class="col"><b>Hors ligne : les préférences ne peuvent pas être modifiées.</b><span class="d">Reconnectez-vous pour changer vos réglages.</span></span></div>{/if}

    {#if vue === 'chargement'}
      <div aria-busy="true"><span class="sr" role="status">Chargement des préférences…</span><div class="cp-sq" aria-hidden="true">{#each [0, 1, 2] as i (i)}<div><i class="b"></i><span class="c"><i style="height:14px;width:60%"></i><i style="height:10px;width:90%"></i></span></div>{/each}</div></div>
    {:else}
      <fieldset class="niv"><legend class="cp-sur">Fréquence</legend>
        {#each NIVEAUX_NOTIF as n (n.id)}
          <label class="radio" class:sel={niveau === n.id} class:fige={bloque}>
            <input type="radio" name="niveau" value={n.id} checked={niveau === n.id} disabled={bloque} onchange={() => choisir(n.id)} />
            <span class="col g2"><span class="nom">{n.nom}</span><span class="desc">{n.texte}</span></span></label>
        {/each}
        <p class="cp-note">Contenu des niveaux : proposition à valider.</p></fieldset>

      {#if niveau === 'rien'}
        <div class="alerte-j" role="status"><Icone nom="alerte" taille={22} /><span class="col g4"><span class="fort">Sans rappel, vous serez nommé voyageur à l’échéance sans avoir été prévenu.</span>
          <a class="cp-lien l0" href="/echeances" onclick={(e) => va(e, '/echeances')}>Régler les rappels d’échéance</a></span></div>
      {/if}

      <section class="cp-groupe g10" aria-labelledby="apercu-titre"><h2 id="apercu-titre" class="cp-h2">Ce que vous recevez</h2>
        <ul class="cp-liste">
          {#each CATEGORIES as c (c.id)}
            {@const inc = incluse(c.id, niveau)}
            <li class="cat" data-type={c.id}><span class="cp-ico carre sm" aria-hidden="true"><Pic nom={c.icone} taille={18} /></span><span class="cp-t grow">{c.libelle}</span>
              <span class="cp-puce" class:ok={inc} data-statut>{#if inc}<Pic nom="ok" taille={14} trait={2.5} />{:else}<Pic nom="moins" taille={14} trait={2.5} />{/if}{inc ? 'Inclus' : 'Non inclus'}</span></li>
          {/each}
        </ul>
        {#if alertesSuspendues(niveau)}<p class="susp" data-note="alertes"><Icone nom="info" taille={16} /><span>Vos alertes de prix et de drops sont suspendues (hypothèse à valider).</span></p>{/if}
      </section>

      <section class="cp-groupe g10" aria-labelledby="canaux-titre"><h2 id="canaux-titre" class="cp-h2">Où les recevoir</h2>
        <div class="cp-liste">
          <div class="cp-ligne stat" data-canal="application"><span class="cp-ico carre" aria-hidden="true"><Pic nom="cloche" taille={20} /></span><span class="cp-txt"><span class="cp-t t16">Dans l’application</span><span class="cp-s clair"><Pic nom="ok" taille={14} trait={2} /> Toujours actif · Centre de notifications</span></span></div>
          <div data-canal="appareil"><label class="cp-ligne" class:att={bloque || refusee}><span class="cp-ico carre" aria-hidden="true"><Pic nom="telephone" taille={20} /></span>
            <span class="cp-txt"><span class="cp-t t16">Notifications de l’appareil</span><span id="canal-appareil-d" class="cp-s clair">{refusee ? 'Bloquées dans les réglages du téléphone' : cx.appareil ? 'Autorisées sur ce téléphone' : 'Désactivées'}</span></span>
            <span class="cp-sw"><input type="checkbox" role="switch" checked={!refusee && cx.appareil} disabled={bloque || refusee} aria-describedby="canal-appareil-d" onchange={(e) => canal('appareil', e)} /><span aria-hidden="true"></span></span></label>
            {#if refusee}<div class="comment"><button type="button" class="cp-lien l0" aria-expanded={aide} aria-controls="aide-permission" onclick={() => (aide = !aide)}>Comment l’activer</button>
              {#if aide}<ol id="aide-permission"><li>Ouvrez les réglages de votre téléphone.</li><li>Choisissez NexG-TT dans la liste des applications.</li><li>Autorisez les notifications.</li></ol>{/if}</div>{/if}</div>
          <label class="cp-ligne" data-canal="courriel" class:att={bloque}><span class="cp-ico carre" aria-hidden="true"><Pic nom="courriel" taille={20} /></span>
            <span class="cp-txt"><span class="cp-t t16">Courriel</span><span id="canal-courriel-d" class="cp-s clair">{compte?.email || 'Aucune adresse enregistrée'}</span></span>
            <span class="cp-sw"><input type="checkbox" role="switch" checked={cx.courriel} disabled={bloque} aria-describedby="canal-courriel-d" onchange={(e) => canal('courriel', e)} /><span aria-hidden="true"></span></span></label>
        </div>
      </section>

      <section class="cp-groupe g10" aria-labelledby="toujours-titre"><h2 id="toujours-titre" class="cp-h2">Toujours envoyés</h2>
        <p class="qq"><Pic nom="cadenas" taille={16} />Quel que soit le niveau</p>
        <ul class="toujours"><li>Code de vérification</li><li>Reçus d’achat et de vente</li><li>Sécurité du compte</li><li>Changement ou annulation de votre vol</li></ul>
        <p class="cp-note">Messages nécessaires au service : proposition à valider.</p></section>
    {/if}
  </div>
</Ecran>

<style>
  .page { display: flex; flex-direction: column; gap: 24px; } .g2 { gap: 2px; } .g10 { gap: 10px; } .g4 { gap: 4px; } .intro { margin: 0; font-size: 15px; line-height: 22px; color: var(--ink2); }
  .etat { margin: -12px 0 -8px; min-height: 20px; display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; color: var(--ok); }
  .cp-erreur.ligne { flex-direction: row; align-items: center; justify-content: space-between; text-align: left; padding: 14px 16px; border-radius: 16px; gap: 10px; flex-wrap: wrap; } .cp-erreur.ligne b { font-size: 15px; line-height: 21px; } .cp-erreur.ligne span { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .niv { margin: 0; padding: 0; border: 0; min-width: 0; display: flex; flex-direction: column; gap: 8px; } .niv legend { padding: 0; margin-bottom: 8px; }
  .radio { display: flex; align-items: flex-start; gap: 14px; min-height: 72px; padding: 14px 16px; box-sizing: border-box; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); cursor: pointer; } .radio.sel { background: var(--accent-soft); border-color: var(--accent); } .radio.fige { opacity: 0.6; cursor: not-allowed; } .radio:has(input:focus-visible) { outline: 2px solid var(--focus); outline-offset: 2px; }
  .radio input { appearance: none; -webkit-appearance: none; margin: 1px 0 0; width: 22px; height: 22px; flex: none; border-radius: 999px; border: 2px solid var(--ink3); background: transparent; display: grid; place-items: center; cursor: inherit; } .radio input:checked { border-color: var(--accent); } .radio input:checked::after { content: ''; width: 10px; height: 10px; border-radius: 999px; background: var(--accent); }
  .nom { font-size: 16px; line-height: 22px; font-weight: 700; } .desc { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .alerte-j { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; background: var(--signal-soft); border: 1px solid rgba(255, 210, 63, 0.45); color: var(--accent); } .fort { font-size: 15px; line-height: 21px; font-weight: 600; color: var(--ink); } .l0 { padding: 0; justify-content: flex-start; }
  .cat { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 10px 16px; box-sizing: border-box; } .cat .cp-t { line-height: 20px; } .cp-ico.sm { width: 36px; height: 36px; border-radius: 10px; }
  .susp { margin: 0; display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink2); }
  .t16 { font-size: 16px; line-height: 22px; } .clair { color: var(--ink2); display: inline-flex; align-items: center; gap: 6px; } .att { opacity: 0.75; cursor: not-allowed; } .stat { cursor: default; }
  .comment { padding: 0 16px 8px 68px; display: flex; flex-direction: column; gap: 4px; } .comment ol { margin: 0 0 8px; padding-left: 20px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 20px; color: var(--ink2); }
  .qq { margin: -4px 0 0; display: flex; align-items: center; gap: 6px; font-size: 13px; line-height: 18px; color: var(--ink2); }
  .toujours { list-style: none; margin: 0; padding: 14px 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; gap: 10px; font-size: 15px; line-height: 20px; }
</style>
