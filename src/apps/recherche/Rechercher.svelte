<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { aujourdhui } from '../../data/horloge.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { aller, routeur } from '../../router.svelte.ts';
  import { memoriserRecherche, oublierRecentes, preparerRecentes, recentes, rechercheInitiale } from './actions.ts';
  import Calendrier from './Calendrier.svelte';
  import ChampAeroport from './ChampAeroport.svelte';
  import { fmtAdultes, fmtJourAnnee } from './dates.ts';
  import { va } from './nav.ts';
  import Pictos from './Pictos.svelte';
  import { FLEX_JOURS, PARTOUT, SOURCES, VOYAGEURS_MAX, lireParams, ligneRecente, ordreErreurs, validerRecherche, versUrl, type ErreursRecherche, type Recherche, type Source } from './params.ts';

  /** Rechercher : départ (YUL par défaut), destination avec autocomplétion ou « Partout », dates (jour précis, ±3 jours, aller-retour), voyageurs, sources, billets revendables. Valide, mémorise, puis ouvre les résultats. */
  const compte = $derived(compteCourant()), aeroports = $derived(app.monde.aeroports), codes = $derived(aeroports.map((a) => a.code));
  const auj = $derived(aujourdhui());
  const init: Recherche = untrack(() => {
    const p = lireParams(routeur.recherche, app.monde.aeroports.map((a) => a.code));
    return routeur.recherche ? { ...p.recherche, vers: p.problemes.vers ? '' : p.recherche.vers, de: p.problemes.de ? rechercheInitiale(app.session.compteId).de : p.recherche.de } : rechercheInitiale(app.session.compteId);
  });
  let de = $state(init.de), vers = $state(init.vers), jour = $state(init.jour ?? ''), flex = $state(init.flex), n = $state(init.n);
  let allerRetour = $state(!!init.retour), retour = $state(init.retour ?? '');
  let sources = $state<Source[]>([...init.sources]), revendable = $state(init.revendable);
  let brutDe = $state(''), brutVers = $state(''), degres = $state(90), tente = $state(false);
  let calendrier = $state<'depart' | 'retour' | null>(null);
  const brouillon = $derived<Recherche>({ de, vers, jour: jour || undefined, flex: flex && !!jour, n, retour: allerRetour ? retour || undefined : undefined, sources: SOURCES.filter((s) => sources.includes(s)), revendable });
  /** Erreurs du formulaire ; un texte écrit mais qui ne désigne aucun aéroport est signalé comme tel. */
  function calculerErreurs(): ErreursRecherche {
    const e = validerRecherche(brouillon, app.monde.aeroports, auj, allerRetour);
    if (!de && brutDe.trim()) e.de = 'Choisissez un aéroport dans la liste.';
    if (!vers && brutVers.trim()) e.vers = 'Choisissez un aéroport dans la liste.';
    return e;
  }
  const erreurs = $derived(tente ? calculerErreurs() : {});
  const joursAvecVol = $derived(app.monde.vols.filter((v) => v.de === de && (vers === PARTOUT || !vers || v.vers === vers)).map((v) => v.jour));
  const liste = $derived(recentes().map((r) => ligneRecente(r, app.monde.aeroports)));
  onMount(() => preparerRecentes());

  const SOURCES_UI: { id: Source; titre: string; sous: string }[] = [{ id: 'neuf', titre: 'Billets neufs', sous: 'Compagnies' }, { id: 'revente', titre: 'Revente', sous: 'Marché NexG' }, { id: 'agence', titre: 'Agences', sous: 'Partenaires' }, { id: 'drop', titre: 'Drops', sous: 'Membres' }];
  const basculerSource = (s: Source) => (sources = sources.includes(s) ? sources.filter((x) => x !== s) : [...sources, s]);
  function inverser() {
    if (!de || !vers || vers === PARTOUT) { montrer(vers === PARTOUT ? 'Impossible d’inverser avec « Partout » : choisissez une destination.' : 'Choisissez d’abord le départ et l’arrivée.', 'wa'); return; }
    [de, vers] = [vers, de]; degres = degres === 90 ? 270 : 90;
  }
  function choisirJour(cible: 'depart' | 'retour', j: string) {
    if (cible === 'depart') { jour = j; if (retour && retour < j) retour = ''; } else retour = j;
    calendrier = null;
  }
  function effacerJour() { jour = ''; flex = false; calendrier = null; }
  function soumettre(e: Event) {
    e.preventDefault(); tente = true;
    const err = calculerErreurs();
    const premier = ordreErreurs.find((k) => err[k]);
    if (premier) { const cible: Record<string, string> = { de: 'from', vers: 'to', jour: 'date-out', retour: 'date-back', sources: 'src-new', n: 'pax-moins' }; queueMicrotask(() => document.getElementById(cible[premier])?.focus()); return; }
    memoriserRecherche(brouillon); aller(versUrl(brouillon));
  }
  const paxLabel = $derived(fmtAdultes(n));
</script>

<Ecran onglet="rechercher" face="jour" large>
  <header class="tete"><div class="tete-g"><h1 class="titre">Rechercher</h1><p class="sous-pc">Voyager · neuf, revente, agences et drops</p></div><p class="intro-pc">Comparez, pour un même trajet, les billets neufs des compagnies, les reventes entre détenteurs et les offres d’agences partenaires.</p></header>
  <div class="grille-pc">
  <form id="form-recherche" class="form" novalidate onsubmit={soumettre} aria-label="Rechercher un vol">
    <h2 class="titre-pc">Votre trajet</h2>
    <section aria-label="Trajet" class="ticket">
      <div class="moitie haut"><ChampAeroport id="from" label="Départ" bind:valeur={de} bind:brut={brutDe} {aeroports} exclure={vers === PARTOUT ? '' : vers} erreur={erreurs.de} /></div>
      <div class="perfo" aria-hidden="true"><span class="trait"></span><span class="rond g"></span><span class="rond d"></span></div>
      <button type="button" class="inverser" aria-label="Inverser départ et arrivée" onclick={inverser}><span style="display:flex;transform:rotate({degres}deg);transition:transform 0.25s ease"><Pictos nom="echange" taille={20} trait={2} /></span></button>
      <div class="moitie bas"><ChampAeroport id="to" label="Arrivée" bind:valeur={vers} bind:brut={brutVers} {aeroports} partout exclure={de} erreur={erreurs.vers} placeholder="Ville ou « Partout »" /></div>
    </section>

    <div role="group" aria-label="Type de trajet" class="seg">
      <button type="button" aria-pressed={!allerRetour} onclick={() => (allerRetour = false)}>Aller simple</button>
      <button type="button" aria-pressed={allerRetour} onclick={() => (allerRetour = true)}>Aller-retour</button>
    </div>

    <div class="col g6">
      <label for="date-out" class="lib">Date de départ</label>
      <div class="rangee">
        <button type="button" id="date-out" class="champdate" class:vide={!jour} aria-haspopup="dialog" class:invalide={!!erreurs.jour} aria-describedby={erreurs.jour ? 'date-out-e' : undefined} onclick={() => (calendrier = 'depart')}>
          <Pictos nom="calendrier" taille={20} />{jour ? fmtJourAnnee(jour) : 'Toutes les dates'}
        </button>
        <label for="flex3" class="flex" class:on={flex && !!jour} class:off={!jour}><input id="flex3" type="checkbox" bind:checked={flex} disabled={!jour} />±{FLEX_JOURS}&nbsp;jours</label>
      </div>
      {#if erreurs.jour}<span class="erreur" id="date-out-e" role="alert"><Pictos nom="alerte" taille={16} />{erreurs.jour}</span>{:else if !jour}<span class="aide">Sans date, tous les départs à venir s’affichent.</span>{/if}
    </div>

    {#if allerRetour}
      <div class="col g6">
        <label for="date-back" class="lib">Date de retour</label>
        <button type="button" id="date-back" class="champdate" class:pointille={!retour} aria-haspopup="dialog" class:invalide={!!erreurs.retour} aria-describedby={erreurs.retour ? 'date-back-e' : undefined} onclick={() => (calendrier = 'retour')}>
          <Pictos nom="calendrier" taille={20} />{retour ? fmtJourAnnee(retour) : 'Choisir la date de retour'}
        </button>
        {#if erreurs.retour}<span class="erreur" id="date-back-e" role="alert"><Pictos nom="alerte" taille={16} />{erreurs.retour}</span>{/if}
      </div>
    {/if}

    <div class="pax">
      <div class="pax-g"><span class="pax-i"><Pictos nom="voyageurs" taille={20} /></span>
        <div class="col"><span id="pax-label" class="lib2">Voyageurs</span><span class="pax-v" aria-live="polite">{paxLabel}</span></div></div>
      <div role="group" aria-labelledby="pax-label" class="pax-b">
        <button type="button" id="pax-moins" aria-label="Retirer un adulte" aria-disabled={n <= 1} class="rond-b" onclick={() => (n = Math.max(1, n - 1))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14" /></svg></button>
        <button type="button" id="pax-plus" aria-label="Ajouter un adulte" aria-disabled={n >= VOYAGEURS_MAX} class="rond-b" onclick={() => (n = Math.min(VOYAGEURS_MAX, n + 1))}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg></button>
      </div>
    </div>

    <fieldset class="sources">
      <legend>Sources</legend>
      <div class="grille">
        {#each SOURCES_UI as s (s.id)}
          <label for="src-{s.id === 'neuf' ? 'new' : s.id === 'revente' ? 'resale' : s.id === 'agence' ? 'agency' : 'drops'}" class="tuile" class:on={sources.includes(s.id)}>
            <input id="src-{s.id === 'neuf' ? 'new' : s.id === 'revente' ? 'resale' : s.id === 'agence' ? 'agency' : 'drops'}" type="checkbox" checked={sources.includes(s.id)} onchange={() => basculerSource(s.id)} aria-describedby={erreurs.sources ? 'src-e' : undefined} />
            <span class="col"><span class="t1">{s.titre}</span><span class="t2">{s.sous}</span></span>
          </label>
        {/each}
      </div>
      {#if erreurs.sources}<span class="erreur" id="src-e" role="alert"><Pictos nom="alerte" taille={16} />{erreurs.sources}</span>{/if}
    </fieldset>

    <button type="button" role="switch" aria-checked={revendable} class="interrupteur" onclick={() => (revendable = !revendable)}>
      <span class="col g2"><span class="t1">Seulement les billets revendables</span><span class="t3">Revendables jusqu’à 24&nbsp;h avant le départ</span></span>
      <span class="piste" class:on={revendable} aria-hidden="true"><span class="bouton"></span></span>
    </button>

    <a class="intention" href="/intention/nouvelle" onclick={(e) => va(e, '/intention/nouvelle')}><Pictos nom="etiquette" taille={18} trait={2} />Ou publiez une intention d’achat à votre prix</a>
  </form>

  <div class="lateral">
  {#if liste.length}
    <section aria-labelledby="recent-title" class="recentes">
      <div class="rt"><h2 id="recent-title">Recherches récentes</h2><button type="button" class="effacer" onclick={() => { oublierRecentes(); montrer('Recherches récentes effacées.'); }}>Effacer</button></div>
      <ul class="liste-plain">
        {#each liste as r, i (r.url)}
          <li><a href={r.url} class="recente" onclick={(e) => va(e, r.url)} data-recente={i}><span class="rc">{r.code}</span><span class="col"><span class="t1">{r.titre}</span><span class="t3">{r.sous}</span></span><Pictos nom="suivant" taille={18} /></a></li>
        {/each}
      </ul>
    </section>
  {/if}

  <aside class="note"><span class="note-i" aria-hidden="true"><Pictos nom="etiquette" taille={18} /></span>
    <p><strong>Un billet revendable garde sa valeur si vos plans changent.</strong> Le prix obtenu à la revente dépend du marché.</p></aside>
  </div>

  <div class="barre"><div class="barre-in"><p class="note-prix">Prix indicatifs, par voyageur. Les prix des drops ne sont visibles qu’aux membres.</p><button type="submit" form="form-recherche" class="btn go"><Pictos nom="chercher" taille={20} trait={2} />Rechercher</button></div></div>
  </div>

  <Feuille ouvert={calendrier !== null} titre={calendrier === 'retour' ? 'Date de retour' : 'Date de départ'} sous={calendrier === 'retour' ? 'Choisissez le jour du vol retour.' : 'Choisissez le jour du départ.'} surfermer={() => (calendrier = null)}>
    {#if calendrier}
      <Calendrier choisi={calendrier === 'retour' ? retour : jour} min={calendrier === 'retour' ? (jour && jour >= auj ? jour : auj) : auj} avecVols={joursAvecVol} aujourdhui={auj} onchoisir={(j) => choisirJour(calendrier!, j)} />
    {/if}
    {#snippet pied()}{#if calendrier === 'depart'}<button type="button" class="btn sec" onclick={effacerJour}>Toutes les dates</button>{:else}<button type="button" class="btn sec" onclick={() => { retour = ''; calendrier = null; }}>Effacer la date de retour</button>{/if}{/snippet}
  </Feuille>
</Ecran>

<style>
  .titre { margin: 0; font: 600 34px/38px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; }
  .form { display: flex; flex-direction: column; gap: clamp(10px, 2.2dvh, 16px); } .col { display: flex; flex-direction: column; } .g6 { gap: 6px; } .g2 { gap: 2px; min-width: 0; }
  .ticket { position: relative; background: var(--surface); border-radius: 18px; box-shadow: var(--ombre); padding: 0; }
  .moitie { padding: 12px 18px; } .haut { padding-bottom: 4px; } .bas { padding-top: 4px; }
  .perfo { position: relative; height: 22px; } .trait { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed var(--line); }
  .rond { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .rond.g { left: -11px; } .rond.d { right: -11px; }
  .inverser { position: absolute; right: 30px; top: calc(50% - 22px); z-index: 2; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 999px; background: var(--ink); color: #fff; box-shadow: 0 0 0 4px var(--surface); display: grid; place-items: center; cursor: pointer; }
  .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface2); }
  .seg button { height: 44px; border: 0; border-radius: 10px; background: transparent; color: var(--ink2); font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; } .seg button[aria-pressed='true'] { background: var(--surface); color: var(--ink); box-shadow: 0 1px 2px rgba(11, 27, 46, 0.16); }
  .lib { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .rangee { display: flex; gap: 8px; }
  .champdate { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; height: 52px; padding: 0 14px; border-radius: 12px; background: var(--surface); border: 1px solid #7a8597; color: var(--ink); font: 400 16px/1 'Barlow', sans-serif; text-align: left; cursor: pointer; }
  .champdate :global(svg) { color: var(--ink2); } .champdate.vide { color: var(--ink2); } .champdate.pointille { border: 1px dashed var(--line-strong); color: var(--accent); font-weight: 600; } .champdate.pointille :global(svg) { color: var(--accent); }
  .champdate.invalide { border-color: var(--err); box-shadow: 0 0 0 1px var(--err); }
  .flex { flex: none; display: flex; align-items: center; gap: 8px; height: 52px; padding: 0 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-strong); font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; white-space: nowrap; } .flex.on { background: var(--accent-soft); border-color: var(--accent); } .flex.off { opacity: 0.55; cursor: not-allowed; }
  input[type='checkbox'] { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); flex: none; cursor: pointer; }
  .erreur { display: flex; gap: 6px; align-items: flex-start; font: 500 13px/18px 'Barlow', sans-serif; color: var(--err); } .aide { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .pax { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 56px; padding: 4px 6px 4px 14px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line-strong); }
  .pax-g { display: flex; align-items: center; gap: 10px; min-width: 0; } .pax-i { color: var(--ink2); display: flex; } .lib2 { font: 500 13px/16px 'Barlow', sans-serif; color: var(--ink2); } .pax-v { font: 600 16px/20px 'Barlow', sans-serif; }
  .pax-b { display: flex; gap: 6px; } .rond-b { width: 44px; height: 44px; padding: 0; border-radius: 12px; background: var(--bg); border: 1px solid var(--line-strong); color: var(--ink); display: grid; place-items: center; cursor: pointer; } .rond-b[aria-disabled='true'] { color: var(--ink3); cursor: not-allowed; }
  .sources { margin: 0; padding: 0; border: 0; min-width: 0; } legend { padding: 0; margin: 0 0 10px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .tuile { display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 8px 12px; border-radius: 14px; background: var(--bg); border: 1px solid var(--line); cursor: pointer; min-width: 0; } .tuile.on { background: var(--surface); border-color: var(--line-strong); }
  .t1 { font: 600 15px/20px 'Barlow', sans-serif; color: var(--ink2); } .tuile.on .t1 { color: var(--ink); } .t2 { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); } .t3 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .interrupteur { display: flex; align-items: center; justify-content: space-between; gap: 12px; width: 100%; min-height: 60px; padding: 8px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); text-align: left; cursor: pointer; } .interrupteur .t1 { color: var(--ink); }
  .piste { position: relative; flex: none; width: 48px; height: 28px; border-radius: 999px; background: var(--surface2); border: 1px solid var(--line-strong); box-sizing: border-box; } .piste.on { background: var(--accent); border-color: var(--accent); }
  .bouton { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 999px; background: var(--ink3); transition: left 0.2s ease; } .piste.on .bouton { left: 23px; background: #fff; }
  .intention { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; margin-top: -4px; padding: 0 12px; border-radius: 12px; color: var(--accent); font: 600 15px/20px 'Barlow', sans-serif; text-align: center; }
  /* Barre d'action collée au-dessus de la barre d'onglets (56 px) : l'action principale reste visible, jamais recouverte. */
  .barre { position: sticky; bottom: calc(56px + env(safe-area-inset-bottom)); z-index: 5; margin: 0 -20px -24px; padding: 14px 20px 12px; background: linear-gradient(180deg, transparent, var(--bg) 30%); }
  .go { gap: 8px; } .barre-in { display: contents; } .tete, .tete-g { display: contents; } .sous-pc, .intro-pc, .titre-pc, .note-prix { display: none; } .grille-pc, .lateral { display: contents; }
  .recentes { display: flex; flex-direction: column; gap: 10px; padding-top: 4px; } .rt { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h2 { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .effacer { min-height: 44px; padding: 0 8px; border: 0; background: none; color: var(--accent); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; }
  ul { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; } li + li { border-top: 1px solid var(--line); }
  .recente { display: grid; grid-template-columns: 52px 1fr auto; align-items: center; gap: 12px; min-height: 64px; padding: 0 14px; color: var(--ink); } .recente :global(svg) { color: var(--ink3); }
  .rc { font: 700 26px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; } .recente .t1 { color: var(--ink); }
  .note { display: flex; align-items: flex-start; gap: 12px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); } .note p { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .note strong { color: var(--ink); font-weight: 600; }
  .note-i { flex: none; width: 36px; height: 36px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; }

  /* PC (≥ 900 px) : planche WebRecherche. Titre 44 px, carte « Votre trajet » à gauche (réglages, trajet, dates, sources, interrupteur, action), recherches récentes et rappel à droite. */
  @media (min-width: 900px) {
    .tete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 32px; }
    .tete-g { display: flex; flex-direction: column; gap: 6px; min-width: 0; } .tete .titre { font-size: 44px; line-height: 44px; }
    .sous-pc { display: block; font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
    .intro-pc { display: block; flex: 0 1 560px; font: 400 15px/22px 'Barlow', sans-serif; color: var(--ink2); }
    .grille-pc { display: grid; grid-template-columns: minmax(0, 1fr) minmax(300px, 340px); grid-template-areas: 'form lateral' 'barre lateral'; column-gap: 24px; align-items: start; }
    .form { grid-area: form; display: flex; flex-flow: row wrap; align-items: flex-start; gap: 18px 24px; padding: 22px; border-radius: 20px 20px 0 0; background: var(--surface); border: 1px solid var(--line); border-bottom: 0; }
    .form > * { order: 5; }
    .titre-pc { display: block; order: 0; flex: 1 1 100%; font: 600 24px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
    .seg { order: 1; flex: 1 1 300px; max-width: 420px; background: var(--surface2); } .pax { order: 2; flex: 1 1 300px; max-width: 420px; min-height: 60px; padding: 8px 8px 8px 14px; border-color: var(--line-strong); }
    .pax-b { gap: 8px; } .rond-b { border-radius: 999px; background: var(--surface); }
    .ticket { order: 3; flex: 1 1 100%; display: flex; flex-wrap: wrap; align-items: flex-start; gap: 12px; background: none; box-shadow: none; border-radius: 0; }
    .ticket .moitie { flex: 1 1 260px; min-width: 0; padding: 0; } .ticket .perfo { display: none; }
    .inverser { position: static; flex: none; margin-top: 22px; width: 44px; height: 52px; border-radius: 12px; background: var(--surface); color: var(--ink); border: 1px solid var(--line-strong); box-shadow: none; }
    .form > .col { order: 4; flex: 1 1 300px; min-width: 0; } .form > .col + .col { order: 4; }
    .lib { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
    .sources { order: 6; flex: 1 1 100%; } legend { font: 500 13px/18px 'Barlow', sans-serif; letter-spacing: 0; text-transform: none; }
    .grille { grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; } .tuile { min-height: 64px; padding: 10px 14px; gap: 12px; } .tuile.on { background: var(--accent-soft); border-color: var(--accent); }
    .tuile .t1 { font-weight: 700; color: var(--ink); } .tuile .t2 { font-size: 13px; line-height: 17px; }
    input[type='checkbox'] { width: 22px; height: 22px; }
    .interrupteur { order: 7; flex: 1 1 100%; width: auto; border-color: var(--line-strong); } .intention { order: 8; flex: 1 1 100%; justify-content: flex-start; margin-top: 0; }
    .barre { grid-area: barre; position: static; z-index: auto; margin: 0; padding: 0 22px 22px; background: var(--surface); border: 1px solid var(--line); border-top: 0; border-radius: 0 0 20px 20px; }
    .barre-in { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 24px; padding-top: 14px; border-top: 1px solid var(--line); }
    .note-prix { display: block; flex: 1 1 260px; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
    .barre .go { width: auto; min-height: 52px; padding: 0 26px; }
    .lateral { grid-area: lateral; display: flex; flex-direction: column; gap: 18px; }
    .recentes { padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); gap: 8px; } h2 { font-size: 24px; line-height: 28px; }
    .recentes ul { border: 0; border-radius: 0; background: none; } .recente { min-height: 56px; padding: 0 2px; }
    .recente .t3 { line-height: 17px; padding-block: 2px; }
    .note { background: var(--accent-soft); border-color: var(--accent); }
  }
</style>
