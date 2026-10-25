<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import type { Jour } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { app } from '../../data/store.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import CarteCameroun from './CarteCameroun.svelte';
  import ChoixDate from './ChoixDate.svelte';
  import TambourHeure from './TambourHeure.svelte';
  import { initRecherche } from './etat.ts';
  import { destinations, prixBasDuJour, villesDeDepart } from './offres.ts';
  import { appliquerTrajet, garesDepart, haut, infoInvite, infoSansLigne, infoVille, libelleDate, ligneExiste, mouvementReduit, pointsCarte, prixEtDuree, sousDestination, texteGares, voisine } from './trajet.ts';

  /** Fenêtre « Où vas-tu ? » : se déroule vers le bas depuis la ligne de trajet de l'accueil (comme une carte qu'on déroule). Carte du Cameroun en 3D, propositions de destinations,
   *  barre Départ → Arrivée · Date. Travaille sur un brouillon ; la recherche partagée (tranche `recherche`) n'est écrite qu'à la validation (`onappliquer`). */
  let { ouvert = $bindable(false), onappliquer }: { ouvert?: boolean; onappliquer?: () => void } = $props();
  const R = initRecherche();

  // ---- brouillon du trajet
  let de = $state(R.de), vers = $state<string | null>(R.vers), jour = $state<Jour>(R.jour), heure = $state<string | null>(R.heureCible);
  let choixDepart = $state(false), dateOuverte = $state(false), message = $state<string | null>(null);
  const dests = $derived(destinations(de, jour));
  const choisie = $derived(dests.find((d) => d.ville === vers) ?? null);
  const points = $derived(pointsCarte(de, choisie ? vers : null, dests));
  const noms = $derived(dests.map((d) => d.ville));
  const curseur = $derived(choisie?.ville ?? noms[0] ?? null);
  const info = $derived(message ?? (choisie ? infoVille(choisie) : infoInvite(de, dests.length)));
  const gares = $derived(garesDepart(de, choisie ? vers : null));
  const prixJour = $derived(choisie ? prixBasDuJour(jour, de, choisie.ville) : null);
  const horsLigne = $derived(app.session.hors_ligne);
  const origines = $derived(villesDeDepart());

  // ---- ouverture, fermeture, ancrage
  let rendu = $state(false), fermeture = $state(false), hautPx = $state(108), el = $state<HTMLElement | undefined>(), zone = $state<HTMLElement | undefined>();
  let precedent: HTMLElement | null = null, derniere: Element | null = null, minuterie: ReturnType<typeof setTimeout> | undefined;
  onMount(() => {
    const noter = (e: PointerEvent) => { derniere = e.target as Element; };
    addEventListener('pointerdown', noter, true);
    return () => { removeEventListener('pointerdown', noter, true); clearTimeout(minuterie); };
  });
  function ouvrir() {
    clearTimeout(minuterie);
    const actif = document.activeElement as HTMLElement | null, source = actif && actif !== document.body && actif !== document.documentElement ? actif : (derniere as HTMLElement | null);
    precedent = actif && actif !== document.body ? actif : null;
    const ligne = source?.closest?.('.gl') ?? source;
    hautPx = haut(ligne?.isConnected ? ligne.getBoundingClientRect() : null, innerHeight);
    de = R.de; jour = R.jour; heure = R.heureCible; vers = destinations(R.de, R.jour).some((d) => d.ville === R.vers) ? R.vers : null;
    choixDepart = false; dateOuverte = false; message = null; fermeture = false; rendu = true;
    tick().then(() => (el?.querySelector<HTMLElement>('.vil[tabindex="0"]') ?? el?.querySelector<HTMLElement>('button'))?.focus());
  }
  function enrouler() {
    if (!rendu) return;
    fermeture = true; clearTimeout(minuterie);
    minuterie = setTimeout(() => { rendu = false; fermeture = false; precedent?.focus?.(); }, mouvementReduit() ? 200 : 420);
  }
  $effect(() => { const o = ouvert; untrack(() => (o ? ouvrir() : enrouler())); });
  const fermer = () => { ouvert = false; };

  // ---- gestes
  /** Premier toucher : choisit la ville (l'arc se trace). Second toucher sur la même ville : valide. */
  function toucher(nom: string) { if (vers === nom && choisie) valider(); else { vers = nom; message = null; } }
  function ville(nom: string) {
    if (nom === de) { choixDepart = !choixDepart; return; }
    if (dests.some((x) => x.ville === nom)) toucher(nom); else { vers = null; message = infoSansLigne(de, nom, dests); }
  }
  function changerDepart(nom: string) {
    de = nom; choixDepart = false; message = null;
    if (vers && (vers === nom || !ligneExiste(nom, vers))) vers = null;
  }
  function echanger() {
    if (!choisie) { message = 'Choisis d’abord une ville d’arrivée pour échanger.'; return; }
    if (!ligneExiste(choisie.ville, de)) { message = `Pas de ligne retour ${choisie.ville} → ${de} pour l’instant.`; return; }
    const a = de; de = choisie.ville; vers = a; message = null;
  }
  function valider() { if (!choisie) return; appliquerTrajet(R, de, choisie.ville, jour, heure); ouvert = false; onappliquer?.(); }
  function fleche(e: KeyboardEvent, nom: string) {
    const n = voisine(noms, nom, e.key); if (!n) return;
    e.preventDefault(); vers = n; message = null;
    tick().then(() => el?.querySelector<HTMLElement>(`.vil[data-ville="${n}"]`)?.focus());
  }
  const versListe = () => el?.querySelector<HTMLElement>('.vil[tabindex="0"]')?.focus();
  async function basculerDate() { dateOuverte = !dateOuverte; if (dateOuverte) { await tick(); zone?.scrollIntoView({ block: 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' }); } }
  function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'Tab' || !el) return;
    const f = [...el.querySelectorAll<HTMLElement>('a[href], button:not([disabled]):not([tabindex="-1"]), input, select, textarea, [tabindex]:not([tabindex="-1"])')].filter((x) => x.offsetParent !== null && !x.closest('[aria-hidden="true"]'));
    if (!f.length) return;
    const a = f[0], z = f[f.length - 1];
    if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); } else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
  }
</script>

{#if rendu}
  <div class="voile" class:ferme={fermeture} role="presentation" onclick={fermer}></div>
  <div bind:this={el} class="rouleau" class:ferme={fermeture} role="dialog" aria-modal="true" aria-labelledby="ot-titre" tabindex="-1" onkeydown={touche} style:--haut="{hautPx}px">
    <header class="tete">
      <div class="col grow"><h2 id="ot-titre" class="ttl t20">Où vas-tu ?</h2><span class="t13 mut ell">Touche une ville, puis valide</span></div>
      <button type="button" class="ib" aria-label="Fermer" onclick={fermer}><Icone nom="fermer" /></button>
    </header>
    <div class="corps">
      {#if horsLigne}<p class="gl hl t13" role="status" style="padding: 10px 14px">Hors ligne · prix et places de la dernière synchronisation.</p>{/if}
      <CarteCameroun {points} {de} vers={choisie ? vers : null} onville={ville} />
      <p class="info" class:alerte={message !== null} role="status" aria-live="polite"><Icone nom={message !== null ? 'alerte' : 'info'} taille={18} /><span>{info}</span></p>

      <div class="col g8" role="group" aria-label="Propositions de destination depuis {de}">
        {#each dests as d (d.ville)}
          {@const pd = prixEtDuree(d)}
          <button type="button" class="vil" class:on={choisie?.ville === d.ville} aria-pressed={choisie?.ville === d.ville} data-ville={d.ville} tabindex={curseur === d.ville ? 0 : -1} onclick={() => toucher(d.ville)} onkeydown={(e) => fleche(e, d.ville)}>
            <span class="bub"><Icone nom="pin" /></span>
            <span class="col grow"><span class="t15 b7">{d.ville}</span><span class="t12 mut ell">{sousDestination(d)}</span></span>
            <span class="col fin"><span class="t14 b7 aq">{pd.prix}</span><span class="t12 mut3">{pd.duree}</span></span>
          </button>
        {:else}
          <div class="gl" role="status"><span class="t14 b7">Aucune ligne au départ de {de}</span><p class="t12 mut">Choisis une autre ville de départ dans la barre ci-dessous.</p></div>
        {/each}
      </div>

      <div class="barre" role="group" aria-label="Trajet et date">
        <div class="duo">
          <button type="button" class="carte2" aria-expanded={choixDepart} aria-controls="ot-depart" aria-label="Départ : {de}, gare {texteGares(gares)}. Changer la ville de départ" data-carte="depart" onclick={() => (choixDepart = !choixDepart)}>
            <span class="lab">Départ</span><span class="t16 b7 ell">{de}</span><span class="t12 mut ell">gare {texteGares(gares)}</span>
          </button>
          <button type="button" class="carte2 arr" aria-label={choisie ? `Arrivée : ${choisie.ville}. Voir les propositions` : 'Arrivée : à choisir. Voir les propositions'} data-carte="arrivee" onclick={versListe}>
            <span class="lab">Arrivée</span><span class="t16 b7 ell" class:mut={!choisie}>{choisie ? choisie.ville : 'À choisir'}</span><span class="t12 mut ell">{choisie ? `gare ${texteGares(choisie.gares)}` : 'touche une ville'}</span>
          </button>
          <button type="button" class="echange" aria-label="Échanger départ et arrivée" onclick={echanger}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 20V5M4 9l4-4 4 4M16 4v15M12 15l4 4 4-4" /></svg></button>
        </div>
        {#if choixDepart}
          <div id="ot-depart" class="chips-depart" role="group" aria-label="Ville de départ" transition:slide={{ duration: mouvementReduit() ? 0 : 200 }}>
            {#each origines as o (o)}<button type="button" class="ch" class:on={o === de} aria-pressed={o === de} onclick={() => changerDepart(o)}>{o}</button>{/each}
          </div>
        {/if}
        <button type="button" class="carte2 date" aria-expanded={dateOuverte} aria-controls="ot-date" data-carte="date" onclick={basculerDate}>
          <span class="bub aq"><Icone nom="calendrier" /></span>
          <span class="col grow"><span class="lab">Date et heure</span><span class="t15 b7 ell">{libelleDate(jour, heure)}</span></span>
          <span class="col fin"><span class="t13 b7 aq">{prixJour === null ? (choisie ? 'aucun départ' : '') : `dès ${fmtF(prixJour)}`}</span><span class="chev" class:ouvert={dateOuverte}><Icone nom="suivant" taille={18} /></span></span>
        </button>
        {#if dateOuverte}
          <div id="ot-date" bind:this={zone} class="zone-date" transition:slide={{ duration: mouvementReduit() ? 0 : 260 }}>
            <ChoixDate {de} vers={choisie ? vers : null} bind:jour />
            <TambourHeure bind:heure />
          </div>
        {/if}
      </div>
    </div>
    <footer class="pied">
      <button type="button" class="b p" disabled={!choisie} onclick={valider}>{choisie ? `Voir les départs · ${choisie.ville}` : 'Choisis une ville d’arrivée'}</button>
    </footer>
    <span class="tube" aria-hidden="true"></span>
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; z-index: 70; background: rgba(2, 4, 10, 0.62); backdrop-filter: blur(3px); animation: fond 0.3s ease; }
  .voile.ferme { animation: fond-sortie 0.38s ease forwards; }
  .rouleau { position: fixed; z-index: 71; left: 0; right: 0; margin: 0 auto; top: var(--haut); width: min(calc(100% - 20px), 440px); height: calc(100dvh - var(--haut) - 12px); display: flex; flex-direction: column; border-radius: 26px; overflow: hidden;
    background: linear-gradient(180deg, rgba(26, 30, 58, 0.97), rgba(8, 11, 24, 0.99)); border: 1px solid rgba(255, 255, 255, 0.2); color: #f2f4ff; transform-origin: 50% 0; animation: deroule 0.62s cubic-bezier(0.22, 0.9, 0.28, 1) backwards; }
  .rouleau.ferme { animation: enroule 0.4s cubic-bezier(0.55, 0.05, 0.75, 0.3) forwards; }
  .tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; padding: 14px 14px 6px 18px; }
  .corps { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 12px; padding: 0 14px 14px; scrollbar-width: none; overscroll-behavior: contain; }
  .corps > * { flex: none; }
  .pied { padding: 10px 14px calc(env(safe-area-inset-bottom) + 12px); border-top: 1px solid rgba(255, 255, 255, 0.1); background: rgba(8, 11, 24, 0.9); }
  .pied .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .tube { position: absolute; left: 8px; right: 8px; bottom: 0; height: 16px; border-radius: 9px; pointer-events: none; opacity: 0; background: linear-gradient(180deg, #d8d2ff 0%, #8b7cff 35%, #3de0ff 70%, #1a1f4a 100%); box-shadow: 0 6px 18px rgba(124, 108, 255, 0.6); animation: tube 0.62s cubic-bezier(0.22, 0.9, 0.28, 1); }
  .rouleau.ferme .tube { animation: tube-sortie 0.4s cubic-bezier(0.55, 0.05, 0.75, 0.3) forwards; }
  .info { display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 16px; background: linear-gradient(135deg, rgba(139, 124, 255, 0.2), rgba(61, 224, 255, 0.12)); border: 1px solid rgba(139, 124, 255, 0.4); font: 600 13px/1.35 'Sora Variable', 'Sora', sans-serif; min-height: 44px; }
  .info :global(svg) { margin-top: 1px; color: #7febff; } .info.alerte { background: rgba(255, 194, 75, 0.12); border-color: rgba(255, 194, 75, 0.5); } .info.alerte :global(svg) { color: #ffc24b; }
  .vil { display: flex; align-items: center; gap: 12px; padding: 10px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.1); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 60px; flex: none; }
  .vil.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.28), rgba(61, 224, 255, 0.16)); border-color: rgba(139, 124, 255, 0.6); }
  .vil:focus-visible, .carte2:focus-visible, .echange:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .fin { align-items: flex-end; text-align: right; flex: none; }
  .barre { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-radius: 22px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); }
  .duo { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
  .carte2 { display: flex; flex-direction: column; gap: 2px; min-width: 0; min-height: 70px; padding: 9px 14px 9px 12px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.07); color: #f2f4ff; font: inherit; text-align: left; cursor: pointer; }
  .carte2.arr { padding: 9px 12px 9px 24px; }
  .carte2 .lab { font-size: 10.5px; }
  .carte2[aria-expanded='true'] { border-color: #8b7cff; background: rgba(139, 124, 255, 0.18); }
  .carte2.date { flex-direction: row; align-items: center; gap: 12px; min-height: 60px; padding: 8px 12px; }
  .echange { position: absolute; left: 50%; top: 50%; width: 44px; height: 44px; margin: -22px 0 0 -22px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.3); background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; display: grid; place-items: center; cursor: pointer; box-shadow: 0 8px 20px -6px rgba(0, 0, 0, 0.7), 0 0 0 4px #121632; }
  .chips-depart { display: flex; flex-wrap: wrap; gap: 8px; }
  .chev { display: inline-grid; transition: transform 0.25s; color: #a1accb; } .chev.ouvert { transform: rotate(90deg); }
  .zone-date { display: flex; flex-direction: column; gap: 14px; padding-top: 4px; margin: 0 -6px; }
  @keyframes fond { from { opacity: 0; } } @keyframes fond-sortie { to { opacity: 0; } }
  @keyframes deroule {
    0% { clip-path: inset(0 0 calc(100% - 64px) 0 round 26px); transform: perspective(1100px) rotateX(-34deg); opacity: 0; }
    20% { opacity: 1; }
    55% { transform: perspective(1100px) rotateX(5deg); opacity: 1; }
    100% { clip-path: inset(0 0 0 0 round 26px); transform: perspective(1100px) rotateX(0); opacity: 1; }
  }
  @keyframes enroule { to { clip-path: inset(0 0 calc(100% - 64px) 0 round 26px); transform: perspective(1100px) rotateX(-34deg); opacity: 0; } }
  @keyframes tube { 0% { bottom: calc(100% - 64px); opacity: 1; } 85% { opacity: 1; } 100% { bottom: 0; opacity: 0; } }
  @keyframes tube-sortie { 0% { bottom: 0; opacity: 0; } 15% { opacity: 1; } 100% { bottom: calc(100% - 64px); opacity: 1; } }
  @media (prefers-reduced-motion: reduce) {
    .rouleau { animation: fond 0.2s ease; } .rouleau.ferme { animation: fond-sortie 0.18s ease forwards; } .tube { display: none; }
  }
  @media (max-width: 359px) { .carte2.arr { padding-left: 22px; } .t15 { font-size: 14px; } }
  .t15 { font-size: 15px; } .g8 { gap: 8px; }
</style>
