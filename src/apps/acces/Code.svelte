<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pictos from './Pictos.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { CODE_DEMO } from '../../data/constantes.ts';
  import { CODE_ERRONE, DELAI_RENVOI_S, ESSAIS_MAX, LONGUEUR_CODE, creerOuConnecter, demanderCode, essaisNeufs, identifiantDuBrouillon, minuteur, nettoyerCode, secondesRestantes, verifierCode } from './actions.ts';
  import { reseau } from './reseau.svelte.ts';
  import { va } from './nav.ts';

  /** Code de vérification à 6 chiffres : une saisie fluide (collage, retour arrière, remplissage automatique), 3 essais, renvoi après 30 s. */
  const id = identifiantDuBrouillon();
  const mode = param('mode') === 'connexion' ? 'connexion' : 'creation';
  let code = $state(''), essais = $state(essaisNeufs()), statut = $state<'repos' | 'verifie' | 'incorrect' | 'ok'>('repos');
  let maintenant = $state(Date.now()), finRenvoi = $state(Date.now() + DELAI_RENVOI_S * 1000), renvoye = $state(false), envoiEnCours = $state(false), secousse = $state(0);
  let dernier = '', creation = $state(false), destination = '/', champ: HTMLInputElement | undefined = $state(), fait = false, suivant: ReturnType<typeof setTimeout> | undefined;

  const horsLigne = $derived(!reseau.enLigne || param('etat') === 'horsligne');
  const bloque = $derived(essais.bloqueJusqua !== null && maintenant < essais.bloqueJusqua);
  const attente = $derived(secondesRestantes(finRenvoi, maintenant));
  const gele = $derived(statut === 'ok' || statut === 'verifie' || bloque || horsLigne || envoiEnCours);
  const canal = $derived(id?.type === 'tel' ? 'Téléphone' : 'Courriel');
  const mauvais = $derived(statut === 'incorrect' || bloque);
  const cases = $derived(Array.from({ length: LONGUEUR_CODE }, (_, i) => ({ ch: code[i] ?? '', actif: !gele && !mauvais && i === code.length })));

  onMount(() => {
    // Sans brouillon : retour à l'inscription (seulement si /code est encore l'écran courant : le routeur peut réinstancier l'ancien écran pendant un changement de route).
    if (!id) { if (location.pathname === '/code') aller('/inscription', { remplacer: true }); return; }
    const h = setInterval(() => (maintenant = Date.now()), 250);
    champ?.focus();
    return () => { clearInterval(h); clearTimeout(suivant); };
  });
  // Un blocage échu rend les essais : la saisie reprend.
  $effect(() => { if (essais.bloqueJusqua !== null && maintenant >= essais.bloqueJusqua) { essais = essaisNeufs(); code = ''; statut = 'repos'; queueMicrotask(() => champ?.focus()); } });

  function saisie() {
    if (!champ || gele) { if (champ) champ.value = code; return; }
    const n = nettoyerCode(champ.value); champ.value = n; code = n;
    champ.setSelectionRange(n.length, n.length);
    if (n.length < LONGUEUR_CODE) { statut = 'repos'; return; }
    if (statut === 'incorrect' && n === dernier) return; // même code redit : pas d'essai de plus
    dernier = n;
    void verifier(n);
  }
  async function verifier(n: string) {
    statut = 'verifie'; await new Promise((r) => setTimeout(r, 450));
    const r = verifierCode(n, essais, Date.now()); essais = r.essais;
    if (r.etat === 'ok') return reussir();
    statut = 'incorrect'; secousse++;
    if (r.etat === 'incorrect' || r.etat === 'bloque') queueMicrotask(() => champ?.focus());
  }
  function reussir() {
    if (fait) return; const r = creerOuConnecter(mode); fait = true;
    if (!r) { aller('/inscription', { remplacer: true }); return; }
    creation = r.creation; destination = r.creation ? '/profil' : '/'; statut = 'ok';
    suivant = setTimeout(continuer, 1200);
  }
  const continuer = () => aller(destination);
  function simuler(c: string) { if (gele) return; code = c; dernier = c; if (champ) champ.value = c; void verifier(c); }
  async function renvoyer() {
    if (envoiEnCours || attente > 0 || horsLigne) return;
    envoiEnCours = true; const r = await demanderCode({ enLigne: reseau.enLigne, delai: 600 }); envoiEnCours = false; if (!r.ok) return;
    code = ''; dernier = ''; if (champ) champ.value = ''; essais = essaisNeufs(); statut = 'repos'; renvoye = true; finRenvoi = Date.now() + DELAI_RENVOI_S * 1000; champ?.focus();
  }
  const restants = $derived(essais.restants);
</script>

{#snippet droite()}
  <span class="fantome" aria-hidden="true"></span>
  <nav class="haut-pc" aria-label="Accès au compte"><a href="/explorer" onclick={(e) => va(e, '/explorer')}>Explorer sans compte</a><a href="/connexion" onclick={(e) => va(e, '/connexion')}>J’ai déjà un compte</a></nav>
{/snippet}

{#snippet suite()}
  {#if statut === 'ok'}<button type="button" class="btn" onclick={() => { clearTimeout(suivant); continuer(); }}>Continuer<Pictos nom="fleche" /></button>
  {:else}<button type="button" class="btn inactif" aria-disabled="true">Continuer · entrez les 6 chiffres</button>{/if}
{/snippet}

<Ecran titre="Vérification" face="jour" retour="/inscription" large {droite}>
  {#if horsLigne}
    <div class="bandeau" role="status"><Icone nom="hors_ligne" /><div><b>Hors ligne</b><span>La vérification du code demande le réseau : la saisie est suspendue et rien n’a été envoyé. Elle reprend au retour de la connexion.</span></div></div>
  {/if}

  <div class="mise"><div class="gauche">
  {#if mode === 'creation'}
    <div class="etapes" role="progressbar" aria-valuemin="1" aria-valuemax="4" aria-valuenow="1" aria-valuetext="Étape 1 sur 4 : vérifier votre {id?.type === 'tel' ? 'téléphone' : 'courriel'}" aria-label="Création du compte">
      <div class="entete-etapes"><b>Étape 1 sur 4</b><span>Ensuite : profil, alertes, clé d’accès</span></div>
      <div class="segments" aria-hidden="true"><span class:fait={statut === 'ok'} class="actuel"></span><span></span><span></span><span></span></div>
    </div>
  {/if}

  <section class="col g8">
    <h1 class="t-h1">Entrez le code reçu</h1>
    <p class="envoye">Envoyé à <strong>{id?.valeur ?? ''}</strong></p>
    <a class="modifier" href="/inscription" onclick={(e) => va(e, '/inscription')}>Modifier l’adresse</a>
  </section>

  <section class="col g12">
    <label for="otp" class="etiquette">Code à 6 chiffres</label>
    <div class="saisie" class:s0={mauvais && secousse % 2 === 1} class:s1={mauvais && secousse % 2 === 0}>
      <div class="cases" aria-hidden="true">
        {#each cases as c, i (i)}
          <span class="case" class:actif={c.actif} class:mauvais class:ok={statut === 'ok'}>{c.ch}{#if c.actif}<i class="curseur"></i>{/if}</span>
        {/each}
      </div>
      <input id="otp" bind:this={champ} type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]*" enterkeyhint="done" value={code} oninput={saisie} onfocus={() => champ?.setSelectionRange(code.length, code.length)} readonly={gele} aria-invalid={mauvais ? 'true' : undefined} aria-describedby="otp-msg" />
    </div>
    <div id="otp-msg" class="messages">
      {#if statut === 'verifie'}<p class="note" role="status"><span class="tourne" aria-hidden="true"></span>Vérification du code en cours…</p>{/if}
      {#if statut === 'incorrect' && !bloque}<p class="msg-err" role="alert"><Icone nom="info" taille={18} trait={2} /><span>Ce code ne correspond pas. Il vous reste {restants} {restants > 1 ? 'essais' : 'essai'}.</span></p>{/if}
      {#if bloque}<p class="msg-err" role="alert"><Icone nom="cadenas" taille={18} trait={2} /><span>Trop d’essais. Demandez un nouveau code pour continuer.</span></p>{/if}
      {#if statut === 'ok'}
        <div class="succes" role="status"><span class="coche" aria-hidden="true"><Icone nom="ok" taille={26} trait={2.5} /></span>
          <span class="col g4">{#if creation}<b>{canal} vérifié</b><span>Votre compte est créé. Encore trois petites étapes, toutes facultatives.</span>{:else}<b>Connexion confirmée</b><span>Content de vous revoir.</span>{/if}</span></div>
      {/if}
    </div>
    <div class="col renvoi">
      {#if attente > 0}
        <p class="attente"><Icone nom="horloge" taille={18} /><span>Renvoyer le code dans <span class="mono minuteur">{minuteur(attente)}</span></span></p>
      {:else}
        <button type="button" class="relancer" onclick={renvoyer} disabled={envoiEnCours || horsLigne}><Pictos nom="renvoyer" taille={18} trait={1.75} />{envoiEnCours ? 'Envoi du code…' : 'Renvoyer le code'}</button>
      {/if}
      <p class="aide">Rien reçu&#8239;? Vérifiez le dossier des indésirables.</p>
    </div>
    <div role="status" aria-live="polite">{#if renvoye}<p class="renvoye">Nouveau code envoyé (démo). L’ancien ne fonctionne plus.</p>{/if}</div>
  </section>

  <div class="suite-pc">{@render suite()}</div>
  </div>

  <section class="demo" aria-labelledby="demo-titre">
    <p id="demo-titre" class="demo-titre">MODE DÉMO — aucun code réel n’est envoyé</p>
    <p class="demo-code mob-t">Mode démo : le code est <span class="mono">{CODE_DEMO}</span></p>
    <p class="demo-code pc-t">Code de démonstration : <span class="mono">{CODE_DEMO}</span></p>
    <div class="deux">
      <button type="button" onclick={() => simuler(CODE_ERRONE)} disabled={gele}>Simuler un code erroné</button>
      <button type="button" onclick={() => simuler(CODE_DEMO)} disabled={gele}>Simuler le bon code</button>
    </div>
    <p class="hyp-pc"><span class="pastille-h">[H]</span><span>Longueur du code (6 chiffres), nombre d’essais (3) et délai de renvoi (0:42) : valeurs de démonstration à valider.</span></p>
  </section>
  </div>

  {#snippet pied()}
    <div class="barre">{@render suite()}</div>
  {/snippet}
</Ecran>

<style>
  .etapes { display: flex; flex-direction: column; gap: 8px; }
  .entete-etapes { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; } .entete-etapes span { color: var(--ink2); text-align: right; }
  .segments { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; } .segments span { height: 6px; border-radius: 999px; background: var(--line); transition: background-color 300ms ease; }
  .segments .actuel { background: var(--accent); } .segments .actuel.fait { background: var(--ok); }
  .envoye { font-size: 15px; line-height: 22px; color: var(--ink2); overflow-wrap: anywhere; } .envoye strong { color: var(--ink); font-weight: 700; }
  .modifier { align-self: flex-start; display: flex; align-items: center; min-height: 44px; margin-top: -8px; font-size: 15px; font-weight: 600; }
  .etiquette { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .saisie { position: relative; }
  .cases { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 8px; }
  .case { position: relative; height: 60px; border-radius: 12px; background: var(--surface); border: 1px solid #7A8597; display: flex; align-items: center; justify-content: center; font: 600 28px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink); transition: border-color 160ms ease, background-color 160ms ease; }
  .case.actif { border: 2px solid var(--accent); } .case.mauvais { border: 2px solid var(--err); } .case.ok { border: 2px solid var(--ok); background: var(--ok-soft); color: var(--ok); }
  .curseur { position: absolute; left: calc(50% - 1px); top: 18px; width: 2px; height: 24px; background: var(--accent); animation: caret 1s steps(1) infinite; }
  #otp { position: absolute; inset: 0; width: 100%; height: 100%; margin: 0; padding: 0; border: 0; border-radius: 12px; background: transparent; color: transparent; caret-color: transparent; font-size: 16px; letter-spacing: 40px; cursor: text; }
  #otp:focus-visible { outline: none; } /* le focus se lit sur la case active (bordure bleue + curseur) */
  .messages { min-height: 22px; display: flex; flex-direction: column; gap: 8px; }
  .msg-err { margin: 0; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 14px/20px 'Barlow', sans-serif; } .msg-err :global(svg) { flex: none; }
  .note { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--ink2); }
  .succes { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 16px; background: var(--ok-soft); font-size: 14px; line-height: 20px; }
  .succes b { font-size: 16px; color: var(--ok); }
  .coche { flex: none; width: 48px; height: 48px; border-radius: 999px; background: var(--ok); color: #fff; display: grid; place-items: center; animation: pop 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .renvoi { gap: 2px; } .attente { margin: 0; display: flex; align-items: center; gap: 8px; min-height: 44px; font-size: 15px; color: var(--ink2); } .minuteur { font-weight: 600; color: var(--ink); font-variant-numeric: tabular-nums; }
  .relancer { align-self: flex-start; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0; border: 0; background: transparent; color: var(--accent); font: 700 15px/1 'Barlow', sans-serif; cursor: pointer; } .relancer:disabled { opacity: 0.5; cursor: not-allowed; }
  .aide { margin: 0; font-size: 13px; color: var(--ink3); } .renvoye { margin: 0; font-size: 13px; color: var(--ok); font-weight: 600; }
  .demo { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; background: var(--surface); border: 1px dashed var(--line-strong); }
  .demo-titre { margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 700; }
  .demo-code { margin: 0; font-size: 14px; color: var(--ink2); } .demo-code .mono { font-weight: 600; color: var(--ink); letter-spacing: 0.04em; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .deux button { min-height: 48px; padding: 6px 10px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-strong); color: var(--ink); font: 700 14px/18px 'Barlow', sans-serif; cursor: pointer; } .deux button:disabled { opacity: 0.5; cursor: not-allowed; }
  .btn.inactif { background: var(--surface2); color: var(--ink3); cursor: not-allowed; }
  .bandeau { display: flex; align-items: flex-start; gap: 12px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); border: 1px solid #7A8597; font-size: 14px; line-height: 20px; color: var(--ink2); }
  .bandeau > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .bandeau b { font-size: 15px; color: var(--ink); }
  .tourne { width: 16px; height: 16px; border-radius: 50%; border: 2px solid var(--line-strong); border-top-color: var(--accent); animation: tourne 0.8s linear infinite; }
  .s0 { animation: -global-nx-shake 420ms ease-out 1; } .s1 { animation: secoue 420ms ease-out 1; }
  @keyframes secoue { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(5px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(2px); } }
  @keyframes caret { 0%, 49% { opacity: 1; } 50%, 100% { opacity: 0; } }
  @keyframes pop { 0% { transform: scale(0.6); opacity: 0; } 70% { transform: scale(1.08); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
  @keyframes tourne { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .s0, .s1, .tourne, .coche, .curseur { animation: none; } .curseur { opacity: 1; } }
  @media (max-width: 899px) { :global(.pied:has(.barre)) { background: #fff; border-top: 1px solid var(--line); } }
  @media (max-width: 340px) { .cases { gap: 5px; } .case { height: 52px; font-size: 24px; } .curseur { top: 14px; } .entete-etapes { flex-direction: column; } .entete-etapes span { text-align: left; } .deux { grid-template-columns: 1fr; } }
  /* PC (≥ 900 px) : étapes, saisie et suite à gauche ; carte de démonstration en pointillés, collante, à droite. Planche WebCode. */
  .fantome { display: block; width: 44px; height: 44px; } .haut-pc, .suite-pc, .hyp-pc, .pc-t { display: none; } .mise, .gauche { display: contents; }
  @media (min-width: 900px) {
    .fantome, .mob-t { display: none; } .pc-t { display: block; }
    .haut-pc { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 8px; }
    .haut-pc a { display: inline-flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 12px; font: 700 15px/1 'Barlow', sans-serif; }
    .mise { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 24px; }
    .gauche { display: flex; flex: 999 1 560px; min-width: 0; max-width: 760px; flex-direction: column; gap: 22px; }
    .entete-etapes span, .etiquette, .aide { color: #3E4F66; } .segments span { background: #D3DCE6; } .segments .actuel { background: var(--accent); } .segments .actuel.fait { background: var(--ok); }
    .envoye { font-size: 17px; line-height: 26px; color: #3E4F66; } .modifier { margin: 0 0 0 -4px; padding: 0 4px; }
    .saisie, .messages { max-width: 520px; } .case { height: 64px; font-size: 30px; } .curseur { top: 20px; }
    .msg-err { padding: 12px 14px; background: var(--err-soft); border: 1px solid var(--err); font-size: 15px; line-height: 21px; color: var(--ink); } .msg-err :global(svg) { color: var(--err); }
    .succes { border: 1px solid var(--ok); } .renvoye { font-size: 14px; font-weight: 700; }
    .relancer { margin-left: -4px; padding: 0 4px; }
    .suite-pc { display: flex; } .suite-pc :global(.btn) { width: auto; min-width: 280px; min-height: 56px; padding: 8px 22px; font-size: 17px; align-self: flex-start; } .suite-pc :global(.btn.inactif) { background: #E3EAF2; color: #3E4F66; border-color: #7A8597; }
    .demo { position: sticky; top: 16px; flex: 1 1 320px; max-width: 460px; min-width: 0; gap: 12px; padding: 18px; border-radius: 20px; background: #fff; border: 1px dashed #7A8597; }
    .demo-titre { padding: 10px 12px; color: #124C9C; font-size: 14px; } .demo-code { font-size: 15px; color: #3E4F66; } .demo-code .mono { letter-spacing: 0; }
    .deux { display: flex; flex-wrap: wrap; gap: 8px; } .deux button { flex: 1 1 200px; min-width: 0; min-height: 52px; border-radius: 14px; border-color: #7A8597; font-size: 15px; line-height: 20px; }
    .hyp-pc { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 20px; color: #3E4F66; }
    .pastille-h { flex: none; display: inline-flex; align-items: center; height: 20px; padding: 0 6px; border-radius: 6px; background: rgba(255, 210, 63, 0.30); color: #5C4600; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; }
    :global(.pied:has(.barre)) { display: none; }
  }
</style>
