<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt as fmtBrut, fmtPct as fmtPctBrut, fmtSigne as fmtSigneBrut, flecheEcart } from '../../core/argent.ts';
  const fmt = (n: number) => nb(fmtBrut(n));
  const fmtPct = (n: number) => nb(fmtPctBrut(n));
  const fmtSigne = (n: number) => nb(fmtSigneBrut(n));
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import type { Compte } from '../../domain/types.ts';
  import Picto from './Picto.svelte';
  import { dropEnDirect, nbIntentions, prochainVoyage, soute } from './accueil.ts';
  import { heureDe, horlogeDrop, jourCourt, jourSemaine, nb } from './format.ts';
  import { va } from './lien.ts';
  import { agregatPortefeuille, pointsLigne, prochaineEcheance, serieValeur } from './portefeuille.ts';
  import { mouvementReduit } from './temps.svelte.ts';
  import { tendances } from './tendances.ts';
  import BarreRecherche from '../recherche/BarreRecherche.svelte';
  import { largeur } from '../recherche/largeur.svelte.ts';
  import { rechercheInitiale } from '../recherche/actions.ts';

  /** Face « Mes actifs » (nuit) de l'accueil : bandeau des prix, drop en direct, portefeuille, départs qui montent, indices. */
  let { compte, now }: { compte: Compte; now: number } = $props();
  const agregat = $derived(agregatPortefeuille(app.monde, compte.id, now));
  const ligne = $derived(pointsLigne(serieValeur(app.monde, compte.id, now)));
  const echeance = $derived(prochaineEcheance(app.monde, compte.id, now));
  const pv = $derived(prochainVoyage(app.monde, compte.id, now));
  const sout = $derived(pv ? soute(app.monde, pv.vol.id) : undefined);
  const intentions = $derived(nbIntentions(app.monde, compte.id));
  const drop = $derived(dropEnDirect(app.monde, now));
  const dropVol = $derived(drop ? volDe(drop.volId) : undefined);
  const prochainDrop = $derived([...app.monde.dropsAVenir].filter((d) => d.ouvre > now).sort((a, b) => a.ouvre - b.ouvre)[0]);
  const tend = $derived(tendances(app.monde, now));
  const montent = $derived(tend.slice(0, 4));
  const bandeau = $derived(tend.slice(0, 7));
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  let pause = $state(mouvementReduit());
  const signe = (pct: number) => (pct < 0 ? 'baisse' : 'hausse');
</script>

<div class="face" data-motion>
  <section class="bandeau" aria-label="Prix équivalents des principaux départs">
    <div class="vue" tabindex="-1">
      <div class="piste" class:pause>
        {#each [0, 1] as copie (copie)}
          <span class="serie" aria-hidden={copie === 1 ? 'true' : undefined}>
            {#each bandeau as k (k.code)}<span class="item"><span class="r">YUL→{k.code}</span><span class="p">{fmt(k.prix)}</span><span class="d {signe(k.variationPct)}">{fmtPct(k.variationPct)}</span></span>{/each}
          </span>
        {/each}
      </div>
    </div>
    <button type="button" class="pause-btn" aria-label={pause ? 'Reprendre le défilement des prix' : 'Mettre en pause le défilement des prix'} onclick={() => (pause = !pause)}><Picto nom={pause ? 'lecture' : 'pause'} /></button>
  </section>

  <main class="corps">
    <section class="hello"><p class="salut">Bonjour {compte.prenom}</p><h1 class="titre-ecran">Mes actifs</h1></section>

    {#if largeur.pc}<div class="barre-pc"><BarreRecherche init={{ ...rechercheInitiale(compte.id), vers: 'partout' }} nuit ou="acn" /></div>{:else}
    <a class="recherche" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>
      <Icone nom="chercher" taille={22} trait={2} />
      <span class="texte"><span class="q">{ville(compte.aeroport)} ({compte.aeroport}) → Partout</span><span class="s">Dates flexibles · 1 voyageur · neuf et revente</span></span>
      <span class="filtres" aria-hidden="true"><Picto nom="filtres" taille={20} trait={1.75} /></span>
    </a>{/if}

    {#if drop && dropVol}
      <a class="drop" href="/drops" onclick={(e) => va(e, '/drops')}>
        <div class="drop-haut"><span class="live"><span class="pouls" data-motion aria-hidden="true"></span>Drop membres · en direct</span>
          <span class="decompte"><Icone nom="horloge" taille={16} trait={2} /><span role="timer" aria-label="Temps restant">{horlogeDrop(drop.fin - now)}</span></span></div>
        <div class="col g4"><span class="route-drop">{dropVol.de} → {dropVol.vers}</span><span class="detail">{ville(dropVol.vers)} · {jourSemaine(Date.parse(`${dropVol.jour}T${dropVol.heureDepart}`), { avecAnnee: true })} · {compagnieDe(dropVol).nom}</span></div>
        <div class="drop-bas"><div class="col g2"><span class="prix-drop">{fmt(drop.prixMembre)}</span><span class="equiv-drop">Prix équivalent ≈ <s>{fmt(drop.prixEquivalent)}</s></span></div>
          <span class="places">{drop.restantes} place{drop.restantes > 1 ? 's' : ''}<Picto nom="fleche" /></span></div>
      </a>
    {:else}
      <a class="sans-drop" href="/drops" onclick={(e) => va(e, '/drops')}>
        <span class="icone-drop" aria-hidden="true"><Icone nom="drops" taille={20} /></span>
        <span class="texte"><span class="q">Aucun drop en direct</span><span class="s">{prochainDrop ? `Prochain drop : ${jourSemaine(prochainDrop.ouvre)} · ${heureDe(prochainDrop.ouvre)} · ${prochainDrop.zone}` : 'Vous serez alerté à la prochaine ouverture.'}</span></span>
        <Picto nom="chevron" taille={20} trait={1.75} />
      </a>
    {/if}

    <section class="portefeuille" aria-labelledby="pf-titre">
      <a class="pf-entete" href="/portefeuille" onclick={(e) => va(e, '/portefeuille')}><span id="pf-titre" class="t-sur">Mon portefeuille · {agregat.nb === 0 ? 'aucun droit de voyage' : `${agregat.nb} droit${agregat.nb > 1 ? 's' : ''} de voyage`}</span><Picto nom="chevron" taille={20} trait={1.75} /></a>
      {#if agregat.nb}
        <div class="pf-valeur">
          <div class="col g2"><span class="lib">Prix équivalent aujourd’hui</span><span class="gros">{fmt(agregat.equivalent)}</span>
            <span class="paye">Payé {fmt(agregat.paye)}<span class="ecart {agregat.ecart.sens}"><Picto nom={agregat.ecart.sens === 'baisse' ? 'baisse' : 'hausse'} taille={14} trait={2.25} /><span class="sr">{agregat.ecart.sens === 'baisse' ? 'En baisse de' : agregat.ecart.sens === 'hausse' ? 'En hausse de' : 'Stable :'} </span>{agregat.ecart.sens === 'stable' ? `${flecheEcart(agregat.ecart)} ` : ''}{fmtSigne(agregat.ecart.abs)}</span></span></div>
          {#if ligne}<svg width="112" height="48" viewBox="0 0 112 48" aria-hidden="true" style="flex:none"><polyline points={ligne.points} fill="none" stroke="var(--up)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><circle cx={ligne.dernier.x} cy={ligne.dernier.y} r="3.5" fill="var(--up)" /></svg>{/if}
        </div>
      {:else}
        <p class="vide">Achetez un billet neuf ou en revente : votre premier droit de voyage apparaîtra ici, avec son prix équivalent du jour.</p>
      {/if}
      {#if echeance}
        <a class="rang jaune" href="/nommer/{echeance.droitId}" onclick={(e) => va(e, `/nommer/${echeance.droitId}`)}><Icone nom="horloge" taille={18} trait={2} /><span class="grow">{echeance.vol.de} → {echeance.vol.vers}&nbsp;: nommez le voyageur avant le {jourCourt(echeance.echeanceMs)} {heureDe(echeance.echeanceMs)}</span><Picto nom="chevron" /></a>
      {/if}
      {#if sout && pv}
        <a class="rang" class:serre={!!echeance} href="/bagages" onclick={(e) => va(e, '/bagages')}><Picto nom="soute" taille={18} trait={1.75} /><span class="grow">Soute du vol {pv.vol.numero.split(' ')[1]} · {sout.nb} bagage{sout.nb > 1 ? 's' : ''} proposé{sout.nb > 1 ? 's' : ''}</span><span class="num">dès {fmt(sout.des)}</span><Picto nom="chevron" /></a>
      {/if}
      {#if intentions.nb}
        <a class="rang" class:serre={!!echeance || !!sout} href="/intentions" onclick={(e) => va(e, '/intentions')}><Picto nom="etiquette" taille={18} trait={1.75} /><span class="grow"><span class="num">{intentions.nb}</span> intention{intentions.nb > 1 ? 's' : ''} d’achat sur vos vols</span>{#if intentions.fondsReserves}<span class="fonds"><Picto nom="coche" taille={14} trait={2.25} />Fonds réservés</span>{/if}<Picto nom="chevron" /></a>
      {/if}
    </section>

    <section class="montent" aria-labelledby="tr-titre">
      <div class="tr-entete"><h2 id="tr-titre" class="titre-section">Départs qui montent</h2><a class="tout" href="/indices" onclick={(e) => va(e, '/indices')}>Tout voir</a></div>
      <div class="tableau">
        <div class="thead" aria-hidden="true"><span>Dest.</span><span>Ville</span><span>30 jours</span></div>
        {#each montent as t (t.code)}
          <a class="tr" href="/cours/{t.volId}" onclick={(e) => va(e, `/cours/${t.volId}`)}>
            <span class="lettres" aria-label={t.code}>{#each t.code.split('') as ch, i (i)}<span class="lettre" aria-hidden="true">{ch}</span>{/each}</span>
            <span class="col mn"><span class="ville">{t.ville}</span><span class="sous">{t.sous}</span></span>
            <span class="delta {signe(t.variationPct)}"><span class="sr">{t.variationPct < 0 ? 'Baisse de ' : 'Hausse de '}</span>{fmtPct(t.variationPct)}</span>
          </a>
        {/each}
      </div>
      <p class="aide">Variation du prix équivalent d’un billet neuf, au départ de Montréal.</p>
      <a class="indices" href="/indices" onclick={(e) => va(e, '/indices')}>
        <span class="ic" aria-hidden="true"><Picto nom="hausse" taille={20} trait={1.75} /></span>
        <span class="texte"><span class="q2">Indices NexG</span><span class="s">Prix équivalents par région, au départ de Montréal</span></span><Picto nom="chevron" taille={20} trait={1.75} />
      </a>
    </section>

    <p class="aide">Prix indicatifs. Un droit de voyage n’est pas un placement financier.</p>
  </main>
</div>

<style>
  .face { contain: inline-size; display: flex; flex-direction: column; gap: 14px; animation: nx-flap 450ms cubic-bezier(.2, .8, .2, 1) backwards; transform-origin: 50% 0; }
  .corps { display: flex; flex-direction: column; gap: 20px; padding-top: 4px; }
  a { color: var(--ink); text-decoration: none; }
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .g4 { gap: 4px; } .grow { flex: 1; min-width: 0; }
  .num { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-weight: 600; font-variant-numeric: tabular-nums; }
  /* Bandeau défilant */
  .bandeau { display: flex; align-items: stretch; height: 44px; margin: 0 -20px; background: #060708; border-top: 1px solid var(--line); border-bottom: 1px solid var(--line); }
  .vue { flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; }
  .piste { display: flex; width: max-content; animation: nx-ticker 42s linear infinite; } .piste.pause { animation-play-state: paused; }
  .serie { display: flex; }
  .item { display: inline-flex; align-items: center; gap: 8px; padding: 0 16px; border-right: 1px solid #1A1C21; white-space: nowrap; font: 500 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .item .r { color: var(--ink2); } .item .p { color: var(--ink); font-weight: 600; } .item .d { font-weight: 600; }
  .d.hausse, .delta.hausse { color: var(--up); } .d.baisse, .delta.baisse { color: var(--down); }
  .pause-btn { flex: none; width: 44px; height: 44px; padding: 0; border: 0; border-left: 1px solid var(--line); background: #060708; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .hello { display: flex; flex-direction: column; gap: 6px; }
  .salut { font-size: 15px; line-height: 20px; color: var(--ink2); }
  .titre-ecran { font: 600 36px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; }
  /* Recherche */
  .recherche { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 10px 10px 16px; border-radius: 16px; background: #fff; color: #121418; }
  .recherche:hover { color: #121418; }
  .texte { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .q { font-weight: 600; font-size: 16px; line-height: 22px; } .s { font-size: 13px; line-height: 18px; color: #555C6B; }
  .filtres { width: 44px; height: 44px; flex: none; border-radius: 12px; background: #0D0E11; color: #FFD23F; display: flex; align-items: center; justify-content: center; }
  /* Drop en direct */
  .drop { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: #FFD23F; color: #0D0E11; }
  .drop:hover { color: #0D0E11; }
  .drop-haut { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .live { display: inline-flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; }
  .pouls { width: 8px; height: 8px; border-radius: 999px; background: #0D0E11; animation: nx-pulse 1.4s ease-in-out infinite; }
  .decompte { display: inline-flex; align-items: center; gap: 6px; font: 600 15px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .route-drop { font: 700 52px/46px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .detail { font-size: 14px; line-height: 20px; font-weight: 500; }
  .drop-bas { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; padding-top: 14px; border-top: 1px solid rgba(13, 14, 17, 0.22); }
  .prix-drop { font: 600 34px/36px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .equiv-drop { font-size: 13px; font-weight: 500; }
  .places { display: inline-flex; align-items: center; gap: 8px; height: 44px; padding: 0 16px; border-radius: 12px; background: #0D0E11; color: #FFD23F; font-weight: 700; font-size: 15px; white-space: nowrap; }
  .sans-drop { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .icone-drop { width: 40px; height: 40px; flex: none; border-radius: 12px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .sans-drop .q { color: var(--ink); } .sans-drop .s { color: var(--ink2); }
  /* Portefeuille */
  .portefeuille { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .pf-entete { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 44px; color: var(--ink2); }
  .pf-valeur { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .lib { font-size: 13px; line-height: 18px; color: var(--ink2); } .gros { font: 600 30px/34px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .paye { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; font-size: 13px; line-height: 18px; color: var(--ink2); }
  .ecart { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ecart.hausse { color: var(--up); } .ecart.baisse { color: var(--down); } .ecart.stable { color: var(--ink2); }
  .vide { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .rang { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border-radius: 12px; background: var(--surface2); border: 1px solid var(--line); color: var(--ink); font-size: 14px; font-weight: 600; line-height: 18px; }
  .rang.serre { margin-top: -6px; }
  .rang.jaune { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
  .rang :global(svg) { color: var(--ink2); } .rang.jaune :global(svg) { color: var(--accent); }
  .rang .num { font-size: 13px; white-space: nowrap; }
  .fonds { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: var(--ok); white-space: nowrap; } .fonds :global(svg) { color: var(--ok); }
  /* Départs qui montent */
  .montent { display: flex; flex-direction: column; gap: 10px; }
  .tr-entete { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .titre-section { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .tout { display: flex; align-items: center; min-height: 44px; font-size: 14px; font-weight: 600; color: var(--accent); }
  .tableau { border-radius: 16px; background: #060708; border: 1px solid var(--line); overflow: hidden; }
  .thead { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; padding: 10px 14px 6px; font-size: 11px; font-weight: 700; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); }
  .tr { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 12px; min-height: 54px; padding: 0 14px; border-top: 1px solid #1A1C21; color: var(--ink); }
  .lettres { display: flex; gap: 3px; }
  .lettre { width: 22px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1C1F25; box-shadow: inset 0 -15px 0 #15171B; font: 600 17px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--accent); }
  .mn { min-width: 0; } .ville { font-size: 15px; font-weight: 600; line-height: 20px; } .sous { font-size: 12px; line-height: 16px; color: var(--ink3); }
  .delta { font: 600 15px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .aide { font-size: 12px; line-height: 18px; color: var(--ink3); }
  .indices { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
  .indices :global(> svg:last-child) { color: var(--ink2); }
  .ic { width: 36px; height: 36px; flex: none; border-radius: 10px; background: rgba(98, 199, 255, 0.12); color: var(--up); display: flex; align-items: center; justify-content: center; }
  .q2 { font: 600 18px/22px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .indices .s { color: var(--ink2); }
  /* PC (≥ 900 px) : « Mes actifs » en grille. Bandeau des prix pleine largeur, titre, recherche ; à gauche le drop et le portefeuille, à droite les départs qui montent. */
  @media (min-width: 900px) {
    .bandeau { margin: 0; border-radius: 14px; border: 1px solid var(--line); overflow: hidden; }
    .corps { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); column-gap: 24px; row-gap: 18px; align-items: start; padding-top: 6px; }
    .hello, .barre-pc, .corps > .aide { grid-column: 1 / -1; }
    .titre-ecran { font-size: 44px; line-height: 44px; } .hello { flex-direction: column-reverse; } .salut { font-size: 13px; font-weight: 600; line-height: 18px; }
    .drop, .sans-drop { grid-column: 1; grid-row: 3; } .portefeuille { grid-column: 1; grid-row: 4; } .montent { grid-column: 2; grid-row: 3 / span 2; }
  }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (prefers-reduced-motion: reduce) { .face { animation: nx-fondu 250ms ease backwards !important; animation-duration: 250ms !important; } .piste { animation: none !important; } .vue { overflow-x: auto; } .pouls { animation: none !important; } }
  @keyframes nx-fondu { from { opacity: 0; } to { opacity: 1; } }
</style>
