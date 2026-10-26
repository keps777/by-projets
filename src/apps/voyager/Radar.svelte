<script lang="ts">
  import { largeur as ecran } from '../recherche/largeur.svelte.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import HorsLigne from './HorsLigne.svelte';
  import Picto from './Picto.svelte';
  import { dureeHeures, nb, nombreDe } from './format.ts';
  import { va } from './lien.ts';
  import { ANNEAUX, BUDGET_DEFAUT, BUDGET_MAX, BUDGET_MIN, BUDGET_PAS, CENTRE, TAILLE, placerEtiquettes, dansLeBudget, destinationsRadar, direction, evaluer, lienResultats, messageVide, sousTitre, texteBudget, type Filtres } from './radar.ts';
  import { tempsReel } from './temps.svelte.ts';

  /** Explorer — radar des destinations : direction et durée de vol placent les destinations, le budget et les types d'offre les éclairent. La liste « Dans votre budget » est l'alternative accessible. */
  const compte = $derived(compteCourant());
  const temps = tempsReel(30_000);
  let largeur = $state(TAILLE), budget = $state(BUDGET_DEFAUT), neuf = $state(true), revente = $state(true), drop = $state(false), choix = $state('PUJ');
  const filtres = $derived<Filtres>({ budget, neuf, revente, drop });
  const evals = $derived(destinationsRadar(app.monde, temps.maintenant, compte?.id).map((d) => evaluer(d, filtres)));
  const liste = $derived(dansLeBudget(evals));
  const sel = $derived(evals.find((e) => e.dest.code === choix) ?? evals[0]);
  const pct = (n: number) => `${(n / TAILLE) * 100}%`;
  const types = $derived<{ id: 'neuf' | 'revente' | 'drop'; libelle: string; icone: string; actif: boolean }[]>([
    { id: 'neuf', libelle: 'Neuf', icone: 'avion', actif: neuf }, { id: 'revente', libelle: 'Revente', icone: 'echange', actif: revente }, { id: 'drop', libelle: 'Drops', icone: 'drops', actif: drop }
  ]);
  function basculer(id: 'neuf' | 'revente' | 'drop') { if (id === 'neuf') neuf = !neuf; else if (id === 'revente') revente = !revente; else drop = !drop; }
  const cotes = $derived(placerEtiquettes(evals.map((e) => ({ x: e.dest.x, y: e.dest.y })), largeur));
  const surPlafond = $derived(!!sel?.meilleure && !sel.dans);
  const kind = $derived(sel?.meilleure?.etiquette ?? 'Aucune offre');
  const classeKind = $derived(sel?.estDrop ? 'signal' : kind === 'Revente' ? 'info' : '');
</script>

<Ecran titre={ecran.pc ? undefined : 'Explorer'} onglet={ecran.pc ? 'accueil' : undefined} large face="jour" retour={compte ? '/' : '/explorer'}>
  {#snippet droite()}<a class="rond" href="/rechercher" aria-label="Recherche détaillée" onclick={(e) => va(e, '/rechercher')}><Picto nom="filtres" taille={22} trait={1.75} /></a>{/snippet}

  <div class="cadre">
  <HorsLigne />
  <section class="titre">
    <p class="t-sur">Depuis Montréal · YUL</p>
    <h1 class="h1">Jusqu’où, pour combien ?</h1>
    <p class="intro">Chaque cercle ajoute 3 heures de vol. Plus le point est gros, plus l’aubaine est forte.</p>
  </section>

  <div class="types" role="group" aria-label="Types d’offres affichés">
    {#each types as t (t.id)}<button type="button" class="chip" aria-pressed={t.actif} onclick={() => basculer(t.id)}><Icone nom={t.icone} taille={16} trait={2} />{t.libelle}</button>{/each}
  </div>

  <div class="pc-cols"><div class="pc-g">
  <section class="radar" bind:clientWidth={largeur} role="group" aria-label="Radar des destinations depuis Montréal : cercles de 3, 6, 9 et 12 heures et plus de vol">
    <span class="disque" aria-hidden="true"></span>
    {#each [...ANNEAUX].reverse().slice(1) as a (a.h)}<span class="anneau" class:centre={a.h === 3} aria-hidden="true" style="left:{pct(CENTRE - a.rayon)};top:{pct(CENTRE - a.rayon)};width:{pct(2 * a.rayon)};height:{pct(2 * a.rayon)}"></span>{/each}
    <span class="axe v" aria-hidden="true"></span><span class="axe h" aria-hidden="true"></span>
    <span class="balayage" data-motion aria-hidden="true"></span>
    {#each ANNEAUX as a (a.h)}<span class="duree" aria-hidden="true" style="left:{pct(CENTRE - 3)};top:{pct(CENTRE - a.rayon - 8)}">{a.etiquette}</span>{/each}
    <span class="nord" aria-hidden="true"><Picto nom="nord" taille={14} />N</span>
    <span class="yul" aria-hidden="true">YUL</span>
    {#each evals as e, i (e.dest.code)}
      {@const cote = cotes[i]}
      <button type="button" class="pt" aria-pressed={e.dest.code === choix} aria-label="{e.dest.ville}, {e.dest.code}, environ {dureeHeures(e.dest.dureeH)} de vol, {nb(e.prixTexte)}{e.meilleure && !e.dans ? ', au-dessus du budget' : ''}" onclick={() => (choix = e.dest.code)} style="left:{pct(e.dest.x)};top:{pct(e.dest.y)}">
        <span class="dot" class:drop={e.estDrop} class:aucune={!e.meilleure} class:choisi={e.dest.code === choix} style="width:{e.taille}px;height:{e.taille}px;opacity:{e.dans ? 1 : 0.32}"></span>
        <span class="etq {cote}" aria-hidden="true" style="opacity:{e.dans ? 1 : 0.8}"><span class="code">{e.dest.code}</span><span class="px">{nb(e.prixTexte)}</span></span>
      </button>
    {/each}
  </section>

  <div class="legende">
    <span><span class="ex neuf"></span>Neuf ou revente</span><span><span class="ex dropx"></span>Drop membres</span><span>Taille du point = aubaine</span>
  </div>

  </div><div class="pc-d">
  <div class="budget">
    <div class="budget-ligne"><label for="budget-max">Budget max</label><span class="valeur" aria-hidden="true">{nb(texteBudget(budget))}</span></div>
    <input id="budget-max" type="range" min={BUDGET_MIN} max={BUDGET_MAX} step={BUDGET_PAS} bind:value={budget} aria-valuetext={nb(texteBudget(budget))} />
    <div class="bornes" aria-hidden="true"><span>{nb(texteBudget(BUDGET_MIN))}</span><span>{nb(texteBudget(BUDGET_MAX))}</span></div>
  </div>

  {#if sel}
    <section class="fiche" aria-live="polite" aria-labelledby="fiche-titre">
      <div class="fiche-tete"><span class="chip-code">{sel.dest.code}</span><span class="meta">Direction {direction(sel.dest.cap).toLowerCase()} · ≈ {dureeHeures(sel.dest.dureeH)} de vol</span></div>
      <div class="col g2"><h2 id="fiche-titre" class="ville">{sel.dest.ville}</h2><span class="pays">{sel.dest.pays}</span></div>
      <div class="fiche-prix"><span class="prix">{sel.meilleure ? texteBudget(sel.meilleure.prix) : '—'}</span><span class="puce {classeKind}">{kind}</span></div>
      {#if surPlafond}<p class="alerte"><Icone nom="info" taille={16} trait={2} />Au-dessus de votre budget max ({nb(texteBudget(budget))}).</p>{/if}
      {#if sel.estDrop}<p class="drop-note"><Icone nom="drops" taille={16} trait={2} />{compte?.pass.actif ? 'Drop réservé aux membres du Pass NexG : vous y avez accès. Places limitées.' : 'Drop réservé aux membres du Pass NexG (nom provisoire), places limitées.'}</p>{/if}
      <a class="btn" href={lienResultats(sel)} onclick={(e) => va(e, lienResultats(sel))}>Voir les billets pour {sel.dest.ville}<Picto nom="fleche" /></a>
    </section>
  {/if}

  <section class="liste" aria-labelledby="liste-titre">
    <div class="liste-tete"><h2 id="liste-titre" class="h2">Dans votre budget</h2><span class="compte" aria-live="polite">{nombreDe(liste.length, 'destination')} sur {evals.length}</span></div>
    {#if liste.length}
      <ul class="liste-plain cartes">
        {#each liste as e (e.dest.code)}
          <li><a class="ligne" href={lienResultats(e)} onclick={(ev) => va(ev, lienResultats(e))}>
            <span class="code-plaque">{e.dest.code}</span>
            <span class="grow col"><span class="v">{e.dest.ville}</span><span class="s">{sousTitre(e)}</span></span>
            <span class="p">{nb(e.prixTexte)}</span><Picto nom="chevron" /></a></li>
        {/each}
      </ul>
    {:else}
      <div class="vide" role="status"><span class="v">Rien sur le radar pour l’instant</span><span class="s">{nb(messageVide(filtres))}</span></div>
    {/if}
  </section>
  </div></div>

  <p class="note">Durées et prix indicatifs, aller simple. Directions approximatives depuis Montréal, positions ajustées pour la lisibilité.</p>
  </div>
</Ecran>

<style>
  .cadre { contain: inline-size; display: flex; flex-direction: column; gap: 20px; }
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .grow { flex: 1; min-width: 0; }
  .titre { display: flex; flex-direction: column; gap: 4px; }
  .h1 { font: 600 42px/42px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; }
  .intro { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .rond { width: 44px; height: 44px; border-radius: 999px; display: flex; align-items: center; justify-content: center; color: var(--ink); }
  .types { display: flex; gap: 8px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 16px; border-radius: 999px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 700 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .chip[aria-pressed='true'] { background: #0B1B2E; border-color: #0B1B2E; color: #fff; }
  /* Radar : carré de 350 px au plus, tout en pourcentages du carré */
  .radar { position: relative; width: min(350px, 100%); aspect-ratio: 1; flex: none; margin: 0 auto; }
  .disque, .anneau, .axe, .balayage, .duree, .nord, .yul { position: absolute; }
  .disque { left: 4.2857%; top: 4.2857%; width: 91.4286%; height: 91.4286%; box-sizing: border-box; border-radius: 999px; background: var(--surface); border: 1px dashed var(--line-strong); box-shadow: 0 12px 32px rgba(11, 27, 46, 0.08); }
  .anneau { box-sizing: border-box; border-radius: 999px; border: 1px solid var(--line); } .anneau.centre { background: #F5F8FB; }
  .axe { background: var(--surface2); } .axe.v { left: 50%; top: 4.2857%; width: 1px; height: 91.4286%; } .axe.h { top: 50%; left: 4.2857%; height: 1px; width: 91.4286%; }
  .balayage { left: calc(50% - 1px); top: 4.2857%; width: 2px; height: 45.7%; border-radius: 2px; background: rgba(26, 100, 200, 0.45); transform-origin: 50% 100%; opacity: 0; animation: nx-sweep 1800ms cubic-bezier(.3, .6, .3, 1) 150ms both; pointer-events: none; }
  .duree { transform: translateX(-100%); padding: 0 3px; border-radius: 4px; background: var(--surface); font: 500 11px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); }
  .nord { right: 2px; top: 2px; display: flex; flex-direction: column; align-items: center; font: 700 12px/12px 'Barlow Condensed', 'Arial Narrow', sans-serif; color: var(--ink2); }
  .yul { left: calc(50% - 18px); top: calc(50% - 18px); width: 36px; height: 36px; border-radius: 999px; background: #0B1B2E; color: #fff; display: flex; align-items: center; justify-content: center; font: 700 13px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; box-shadow: 0 0 0 6px rgba(26, 100, 200, 0.14); }
  .pt { position: absolute; width: 44px; height: 44px; transform: translate(-50%, -50%); padding: 0; border: 0; border-radius: 999px; background: transparent; cursor: pointer; display: flex; align-items: center; justify-content: center; color: var(--ink); }
  .dot { box-sizing: border-box; border-radius: 999px; background: var(--accent); border: 2px solid #fff; box-shadow: 0 0 0 1px var(--accent); transition: width 200ms ease, height 200ms ease, opacity 200ms ease; }
  .dot.drop { background: var(--signal); border-color: #0B1B2E; box-shadow: none; } .dot.aucune { background: var(--surface2); border-color: var(--line-strong); box-shadow: none; }
  .dot.choisi { box-shadow: 0 0 0 3px #fff, 0 0 0 5px #0B1B2E; }
  .etq { position: absolute; top: 50%; display: flex; flex-direction: column; padding: 1px 5px; border-radius: 6px; background: rgba(255, 255, 255, 0.9); white-space: nowrap; pointer-events: none; transition: opacity 200ms ease; }
  .etq.D { left: 36px; transform: translateY(-50%); align-items: flex-start; } .etq.G { right: 36px; transform: translateY(-50%); align-items: flex-end; }
  .etq.H { left: 50%; top: auto; bottom: 36px; transform: translateX(-50%); align-items: center; } .etq.B { left: 50%; top: 36px; transform: translateX(-50%); align-items: center; }
  .code { font: 700 16px/17px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.03em; } .px { font-size: 12px; line-height: 15px; font-weight: 600; color: var(--ink2); }
  .legende { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; font-size: 13px; line-height: 18px; color: var(--ink2); }
  .legende > span { display: inline-flex; align-items: center; gap: 6px; }
  .ex { width: 12px; height: 12px; box-sizing: border-box; border-radius: 999px; } .ex.neuf { background: var(--accent); border: 2px solid #fff; box-shadow: 0 0 0 1px var(--accent); } .ex.dropx { background: var(--signal); border: 2px solid #0B1B2E; }
  .budget { display: flex; flex-direction: column; gap: 4px; padding: 16px 18px 12px; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); }
  .budget-ligne { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
  .budget label { font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .valeur { font: 600 24px/28px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .budget input { width: 100%; height: 44px; margin: 0; accent-color: var(--accent); cursor: pointer; }
  .bornes { display: flex; justify-content: space-between; font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); }
  /* Fiche de la destination choisie */
  .fiche { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); box-shadow: var(--ombre); }
  .fiche-tete { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .chip-code { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 8px; background: #0B1B2E; color: #fff; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.06em; }
  .meta { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .ville { font: 600 56px/52px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; } .pays { font-size: 15px; color: var(--ink2); }
  .fiche-prix { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 2px dashed var(--surface2); }
  .prix { font: 600 28px/32px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .alerte { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; font-weight: 600; color: #A84A0E; }
  .drop-note { display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 12px; background: var(--signal-soft); font-size: 13px; line-height: 18px; font-weight: 600; color: var(--signal-ink); }
  .fiche .btn { color: #0B1B2E; height: 52px; }
  /* Liste accessible */
  .liste { display: flex; flex-direction: column; gap: 10px; }
  .liste-tete { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .h2 { font: 600 26px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; } .compte { font-size: 13px; font-weight: 600; color: var(--ink2); }
  .cartes { display: flex; flex-direction: column; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; }
  .cartes li + li { border-top: 1px solid var(--surface2); }
  .ligne { display: flex; align-items: center; gap: 8px; min-height: 60px; padding: 8px 12px 8px 14px; color: var(--ink); text-decoration: none; }
  .code-plaque { width: 52px; height: 32px; flex: none; border-radius: 8px; background: #0B1B2E; color: #fff; display: flex; align-items: center; justify-content: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0.06em; }
  .v { font-size: 16px; line-height: 22px; font-weight: 600; } .s { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .p { font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .ligne :global(svg) { color: var(--accent); }
  .vide { display: flex; flex-direction: column; gap: 6px; padding: 18px; border-radius: 18px; background: var(--surface); border: 1px dashed var(--line-strong); }
  .vide .v { font-weight: 700; } .vide .s { font-size: 14px; line-height: 20px; }
  .note { font-size: 13px; line-height: 18px; color: var(--ink3); }
  a:focus-visible, button:focus-visible, input:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  @keyframes nx-sweep { 0% { transform: rotate(0deg); opacity: 0.9; } 80% { opacity: 0.6; } 100% { transform: rotate(360deg); opacity: 0; } }
  @media (prefers-reduced-motion: reduce) { .balayage { animation: none; display: none; } .dot, .etq { transition: none; } }
  .pc-cols, .pc-g, .pc-d { display: contents; }
  /* PC (≥ 900 px) : le radar à gauche (collant), le budget, la fiche de la destination et la liste à droite. */
  @media (min-width: 900px) {
    .cadre { contain: none; gap: 18px; } .pc-cols { display: grid; grid-template-columns: minmax(360px, 1fr) minmax(0, 1fr); gap: 24px; align-items: start; }
    .pc-g { display: flex; flex-direction: column; gap: 14px; position: sticky; top: 16px; } .pc-d { display: flex; flex-direction: column; gap: 18px; min-width: 0; } .radar { width: min(460px, 100%); }
    .h1 { font-size: 44px; line-height: 44px; text-transform: uppercase; }
  }
</style>
