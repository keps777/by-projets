<script lang="ts">
  import './guichet.css';
  import { onDestroy, tick } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { caisseOuverte, departParId } from '../../domain/actions.ts';
  import { TAILLES } from '../../core/colis.ts';
  import { fcfa } from '../../core/money.ts';
  import { quand } from '../../core/dates.ts';
  import { libelleErreur, supplementTaille } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Lecture from './Lecture.svelte';
  import Etiquette from './Etiquette.svelte';
  import { dockAgent } from './dock.ts';
  import { etat } from './etat.ts';
  import { compterImpression, contexte, departsVers, deposerColisPrepaye, lireColis, nomDepart } from './actions.ts';
  import { lancerScan, scanDisponible } from './scanner.ts';

  const ctx = $derived(contexte()), agent = $derived(ctx.agent);
  const caisse = $derived(agent ? caisseOuverte(agent.id) : undefined);
  const compagnie = $derived(app.monde.compagnies.find((c) => c.id === agent?.compagnieId)?.nom ?? 'AfriMove');
  const initial = param('colis') ? (app.monde.colis.find((c) => c.id === param('colis'))?.code ?? '') : '';
  let saisie = $state(initial), texte = $state(initial);
  let scanOn = $state(false), erreurScan = $state(''), video = $state<HTMLVideoElement>(), arret: (() => void) | null = null;
  let ajuste = $state(false), reelle = $state<keyof typeof TAILLES | ''>(''), deposeId = $state(''), erreur = $state(''), occupe = $state(false);

  const lecture = $derived(texte.trim() ? lireColis(texte) : null);
  const colis = $derived(lecture?.ok ? lecture.colis : undefined);
  const depose = $derived(deposeId ? app.monde.colis.find((c) => c.id === deposeId) : undefined);
  const tailleEff = $derived(colis ? (reelle || colis.taille) : 'M');
  const supplement = $derived(colis ? supplementTaille(colis.taille, tailleEff as keyof typeof TAILLES, colis.options) : 0);
  const depart = $derived(colis ? (colis.departId ? departParId(colis.departId) : departsVers(agent?.gareId ?? '', colis.arrivee.split(' · ')[0], 1)[0]) : undefined);
  const copies = $derived(depose ? (etat().copies[depose.id] ?? 0) : 0);

  function verifier(e?: Event) { e?.preventDefault(); texte = saisie; reelle = ''; ajuste = false; erreur = ''; }
  async function scanner() {
    if (scanOn) { arret?.(); scanOn = false; return; }
    erreurScan = ''; scanOn = true; await tick(); if (!video) return;
    arret = await lancerScan(video, (t) => { scanOn = false; saisie = t; verifier(); }, (m) => { scanOn = false; erreurScan = m; });
  }
  onDestroy(() => arret?.());
  function confirmer() {
    if (!agent || !colis || ctx.lecture) return; erreur = ''; occupe = true;
    try { const r = deposerColisPrepaye(agent.id, colis.id, tailleEff as keyof typeof TAILLES); deposeId = r.colis.id; montrer(r.supplement ? `Colis déposé · ${fcfa(r.supplement)} F encaissés` : 'Colis déposé'); }
    catch (e) { erreur = libelleErreur(e); } finally { occupe = false; }
  }
  function imprimer() { if (!depose) return; compterImpression(depose.id); if (typeof window.print === 'function') window.print(); }
  function autre() { deposeId = ''; saisie = texte = ''; reelle = ''; ajuste = false; erreur = ''; }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre="Dépôt prépayé" sous="le client a payé dans l’app" retourVers="/guichet" dock={dockAgent()}>
  {#snippet droite()}<span class="pl {depose ? 'ok' : colis ? 'ok' : 'inf'}">{depose ? 'déposé' : colis ? 'reconnu' : 'scan'}</span>{/snippet}
  {#if ctx.lecture}<Lecture {agent} />{/if}

  {#if depose}
    <div class="gl col g8" role="status"><span class="pl ok">colis déposé</span><span class="t14">Le colis {depose.code} est au guichet et part avec le prochain bus.</span></div>
    <div class="g-papier a-imprimer"><Etiquette colis={depose} {compagnie} /></div>
    <button type="button" class="b s" onclick={imprimer}>{copies ? 'Réimprimer l’étiquette' : 'Imprimer l’étiquette'}</button>
    <button type="button" class="b p" onclick={autre}>Dépôt suivant</button>
    <a class="b g" href="/guichet" onclick={(e) => lien(e, '/guichet')}>Retour au guichet</a>
  {:else}
    <div class="scan g-fix" class:ok={!!colis}>
      {#if scanOn}<!-- svelte-ignore a11y_media_has_caption --><video bind:this={video} playsinline muted aria-label="Caméra : vise le code du colis"></video>{/if}
      <div class="frame" aria-hidden="true">{#if colis}<Icone nom="ok" taille={80} trait={2.4} />{:else}<span class="line"></span>{/if}</div>
    </div>
    <p class="t13 mut c" aria-live="polite">{colis ? 'Colis reconnu · vérifie la taille réelle' : 'Vise le code sur le téléphone du client (ou tape-le : *123# → 4)'}</p>
    {#if scanDisponible()}<button type="button" class="b s" onclick={scanner}>{scanOn ? 'Arrêter la caméra' : 'Scanner avec la caméra'}</button>{/if}
    {#if erreurScan}<span class="t13 wac" role="status">{erreurScan}</span>{/if}
    <form class="row g8" onsubmit={verifier}>
      <label class="fld grow"><span class="lab">Code du colis</span><input class="inp" bind:value={saisie} placeholder="AM-C-9Q2" autocapitalize="characters" autocomplete="off" spellcheck="false" aria-invalid={lecture ? !lecture.ok : undefined} /></label>
      <button type="submit" class="b p" style="flex: none; width: auto; align-self: flex-end">Vérifier</button>
    </form>
    {#if lecture && !lecture.ok}<div class="gl col g4" role="alert"><span class="pl er">refusé</span><span class="t14">{lecture.raison}</span></div>{/if}

    {#if colis && lecture?.ok}
      <div class="gl col" style="gap: 0">
        <div class="li"><span class="grow mut t13">Code</span><b class="mono">{colis.code}</b></div>
        <div class="li"><span class="grow mut t13">Payé dans l’app</span><b>{fcfa(lecture.paye.montant)} F · {quand(lecture.paye.ts, maintenant()).toLowerCase()}</b></div>
        <div class="li"><span class="grow mut t13">Taille déclarée</span><b>{TAILLES[colis.taille].nom}{colis.options.assurance ? ' · assuré' : ''}</b></div>
        <div class="li"><span class="grow mut t13">Bus</span><b class="c" style="text-align: right">{depart ? `${depart.heure} ${nomDepart(depart)} · ` : ''}{colis.arrivee.split(' · ')[1] ?? colis.arrivee}</b></div>
        <div class="li"><span class="grow mut t13">Destinataire</span><b>{colis.destinataire.nom}</b></div>
      </div>
      <button type="button" class="b s" aria-expanded={ajuste} onclick={() => (ajuste = !ajuste)}>{supplement ? `Trop gros : + ${fcfa(supplement)} F à encaisser` : 'Plus gros que déclaré ? Ajuster'}</button>
      {#if ajuste}
        <div class="row g8" role="group" aria-label="Taille réelle">{#each Object.entries(TAILLES) as [k, t] (k)}<button type="button" class="ch" class:on={tailleEff === k} aria-pressed={tailleEff === k} style="flex: 1; justify-content: center" onclick={() => (reelle = k as keyof typeof TAILLES)}>{k} · {t.nom.split(' · ')[1]}</button>{/each}</div>
        {#if tailleEff !== colis.taille && supplement === 0}<span class="t12 mut">Plus petit que déclaré : pas de remboursement au dépôt.</span>{/if}
        {#if supplement > 0 && !caisse}<span class="t13 erc" role="alert">Ouvre ta caisse pour encaisser le supplément.</span>{/if}
      {/if}
      {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
      <button type="button" class="b p" disabled={occupe || ctx.lecture || (supplement > 0 && !caisse)} onclick={confirmer}>{supplement ? `Confirmer le dépôt · ${fcfa(supplement)} F encaissés` : 'Confirmer le dépôt · imprimer l’étiquette'}</button>
    {/if}
    <a class="b g" href="/guichet/colis" onclick={(e) => lien(e, '/guichet/colis')}>Pas de code ? Créer le colis au guichet</a>
  {/if}
</Mobile>

<style>
  .scan { position: relative; height: 220px; border-radius: 24px; overflow: hidden; background: #0a0e1c; border: 1px solid rgba(255, 255, 255, 0.14); display: grid; place-items: center; }
  .scan video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; opacity: 0.85; }
  .frame { position: relative; width: 170px; height: 170px; border: 2px solid rgba(61, 224, 255, 0.6); border-radius: 22px; display: grid; place-items: center; }
  .line { position: absolute; left: 10px; right: 10px; height: 2px; background: #3de0ff; box-shadow: 0 0 14px #3de0ff; animation: balaye 1.6s ease-in-out infinite; }
  @keyframes balaye { 0%, 100% { top: 10px; } 50% { top: 150px; } }
  .scan.ok .frame { border-color: #4ade80; color: #4ade80; }
</style>
