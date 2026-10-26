<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aujourdhui } from '../../data/horloge.ts';
  import { echeanceDe } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { routeur } from '../../router.svelte.ts';
  import PanneauxMarche from '../voyager/PanneauxMarche.svelte';
  import { alerteActive, basculerAlerte } from './actions.ts';
  import BarometrePc from './BarometrePc.svelte';
  import BarreRecherche from './BarreRecherche.svelte';
  import CarteOffrePc from './CarteOffrePc.svelte';
  import { fmtInstant, fmtJourCourt, fmtJourAnnee, fmtVoyageurs, fmtDuree } from './dates.ts';
  import { appliquerFiltresPc, basculerTriPc, bornesPrix, filtresDefaut, trierPc, type CleTriPc, type TriPc } from './filtresPc.ts';
  import FiltresPcVue from './FiltresPc.svelte';
  import { dollars, nbsp } from './montants.ts';
  import { va } from './nav.ts';
  import { compter, datesProches, departDuVol, elargir, existeTrajet, type LigneOffre } from './offres.ts';
  import Pictos from './Pictos.svelte';
  import { FLEX_JOURS, PARTOUT, versUrl, type Recherche } from './params.ts';
  import { reseau } from './reseau.svelte.ts';
  import TableauDeparts from './TableauDeparts.svelte';
  import { fmtSigne } from '../../core/argent.ts';
  import { compagnieDe } from '../../domain/marche.ts';

  /** Résultats, variante PC (≥ 900 px). Face jour : « Résultats » (planche WebResultats : filtres, cartes d'offres, baromètre, alerte de prix). Face nuit (`app.session.face === 'marche'`) : « Marché des billets »
   *  (planche WebMarche : filtres, tableau des départs à volets, offre sélectionnée, drop en direct et portefeuille). Les données viennent de `Resultats.svelte` ; les filtres et tris se règlent ici. */
  let { r, lignes, invalide, etatForce, meilleure, retourForm }: { r: Recherche; lignes: LigneOffre[]; invalide: string[]; etatForce: string | null; meilleure?: { ligne: LigneOffre; critere: 'direct' | 'tous' }; retourForm: string } = $props();
  const nuit = $derived(app.session.face === 'marche'), compte = $derived(compteCourant());
  let filtres = $state(filtresDefaut()), tri = $state<TriPc>({ cle: 'prix', sens: 'asc' }), choix = $state(''), alerteMsg = $state('');
  const bornes = $derived(bornesPrix(lignes)), compteurs = $derived(compter(lignes));
  const visibles = $derived(trierPc(appliquerFiltresPc(lignes, filtres, maintenant()), tri)), ids = $derived(new Set(visibles.map((l) => l.offre.id)));
  const selection = $derived(visibles.find((l) => l.offre.id === choix) ?? visibles[0]);
  const ville = (c: string) => app.monde.aeroports.find((a) => a.code === c)?.ville ?? c;
  const avecDate = $derived(new Set(lignes.map((l) => l.vol.jour)).size > 1 || new Set(lignes.map((l) => l.vol.vers)).size > 1);
  const refNeuf = $derived((lignes.find((l) => l.offre.type === 'neuf') ?? lignes.find((l) => !l.offre.masquee))?.vol.prixNeuf ?? null);
  const dest = $derived(r.vers === PARTOUT ? 'Partout' : r.vers || '…');
  const quand = $derived(r.jour ? `${fmtJourAnnee(r.jour)}${r.flex ? ` ±${FLEX_JOURS} jours` : ''}` : 'Toutes les dates');
  const n = $derived(visibles.length), comptage = $derived(n === 0 ? 'Aucune offre' : `${n} offre${n > 1 ? 's' : ''}`);
  const proches = $derived(datesProches(app.monde.vols, r, aujourdhui())), trajetExiste = $derived(existeTrajet(app.monde.vols, r));
  const reinit = () => { filtres = filtresDefaut(); };
  const trier = (c: CleTriPc) => { tri = basculerTriPc(tri, c); };
  const refAlerte = $derived((meilleure?.ligne ?? lignes.find((l) => !l.offre.masquee))), alerteOn = $derived(compte && refAlerte ? alerteActive(compte.id, refAlerte.vol, refAlerte.offre.prix) : false);
  function alerte() {
    if (!refAlerte) return;
    if (!compte) { alerteMsg = 'Connectez-vous pour créer une alerte de prix.'; return; }
    alerteMsg = basculerAlerte(compte.id, refAlerte.vol, refAlerte.offre.prix) ? '' : 'Alerte retirée.';
  }
  const dateEcheance = (l: LigneOffre) => { const t = fmtInstant(echeanceDe(departDuVol(l.vol))); const i = t.lastIndexOf(' '); return `${t.slice(0, i)} à ${t.slice(i + 1)}`; };
  const ligneSource = (l: LigneOffre) => (l.offre.type === 'neuf' ? 'Billet neuf vendu par la compagnie' : l.offre.type === 'revente' ? 'Revente par un détenteur vérifié, prix encadré' : l.offre.type === 'agence' ? `${l.offre.vendeur} (exemple), non revendable` : 'Drop membres : prix visible avec le Pass NexG');
  const hrefSel = $derived(selection ? (selection.offre.type === 'drop' ? (selection.offre.masquee ? '/pass' : '/drops') : selection.offre.type === 'agence' ? `/agence/${encodeURIComponent(selection.offre.agenceId ?? '')}` : `/offre/${encodeURIComponent(selection.offre.id)}`) : '#');
  const ctaSel = $derived(!selection ? '' : selection.offre.type === 'agence' ? 'Voir l’offre de l’agence' : selection.offre.type === 'drop' ? (selection.offre.masquee ? 'Débloquer avec le Pass NexG' : 'Voir le drop') : 'Voir l’offre');
</script>

<Ecran onglet="rechercher" face={nuit ? 'nuit' : 'jour'} large>
  {#key routeur.recherche}
  <div class="page">
    <header class="tete">
      <div class="tete-g">
        <h1>{invalide.length ? 'Recherche incomplète' : nuit ? 'Marché des billets' : 'Résultats'}</h1>
        <p class="sous">{nuit ? 'Mes actifs · marché secondaire contrôlé' : `Voyager · ${r.de} → ${dest} · ${quand} · ${fmtVoyageurs(r.n)}`}</p>
      </div>
      <p class="intro">{nuit ? 'Billets neufs, reventes entre détenteurs et offres d’agences, comparés au prix d’un billet neuf équivalent. Le nom du voyageur se donne au plus tard 24 h avant le départ.' : 'Neuf, revente, agences et drops, comparés au prix d’un billet neuf équivalent. Prix indicatifs, par voyageur.'}</p>
    </header>
    <BarreRecherche init={r} {nuit} ou="rs" />

    {#if invalide.length}
      <section class="bloc" aria-labelledby="inc-pc"><p class="alerte" role="alert"><Pictos nom="alerte" taille={20} /><span><strong id="inc-pc">Cette recherche est incomplète.</strong><br />{invalide.join(' ')}</span></p><a class="btn" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Modifier la recherche</a></section>
    {:else if etatForce === 'erreur'}
      <section class="bloc"><p class="alerte" role="alert"><Pictos nom="alerte" taille={20} /><span><strong>Les prix n’ont pas pu être chargés.</strong><br />Vérifiez votre connexion puis réessayez.</span></p><a class="btn" href={versUrl(r)} onclick={(e) => va(e, versUrl(r))}>Réessayer</a></section>
    {:else if etatForce === 'chargement'}
      <div aria-busy="true" aria-live="polite" class="squelette"><p class="sr">Chargement des offres…</p><span class="s1"></span><span class="s2"></span><span class="s2"></span></div>
    {:else}
      <div class="grille" class:nuit>
        <div class="c-filtres"><FiltresPcVue bind:filtres {compteurs} {bornes} ordre={nuit ? ['neuf', 'revente', 'agence', 'drop'] : ['revente', 'neuf', 'agence', 'drop']} onreset={reinit} prefixe="pcf" /></div>
        <section class="milieu" aria-labelledby="liste-titre">
          <div class="c-ent">
            <div class="col"><h2 id="liste-titre">{nuit ? 'Tableau des départs' : 'Offres'}</h2>
              <p class="cpt" aria-live="polite">{comptage}{nuit ? ` · ${r.de} → ${dest}${r.jour ? ` · ${fmtJourAnnee(r.jour)}` : ''}` : ` · prix par voyageur${refNeuf !== null ? ` · prix équivalent neuf ${dollars(refNeuf)} (indicatif)` : ''}`}</p></div>
            <div class="tri" role="group" aria-label="Trier les offres"><span class="tri-l">Trier par</span><div class="seg">
              <button type="button" class:on={tri.cle === 'prix'} aria-pressed={tri.cle === 'prix'} onclick={() => trier('prix')}>Prix<span aria-hidden="true">{tri.cle === 'prix' ? (tri.sens === 'asc' ? '↑' : '↓') : ''}</span><span class="sr">{tri.cle === 'prix' ? (tri.sens === 'asc' ? ', ordre croissant' : ', ordre décroissant') : ''}</span></button>
              <button type="button" class:on={tri.cle === 'depart'} aria-pressed={tri.cle === 'depart'} onclick={() => trier('depart')}>Heure de départ<span aria-hidden="true">{tri.cle === 'depart' ? (tri.sens === 'asc' ? '↑' : '↓') : ''}</span><span class="sr">{tri.cle === 'depart' ? (tri.sens === 'asc' ? ', ordre croissant' : ', ordre décroissant') : ''}</span></button>
            </div></div>
          </div>
          {#if !reseau.enLigne}<p class="hors" role="status"><Pictos nom="horsligne" taille={18} />Vous êtes hors ligne : ces prix datent de votre dernière visite et peuvent avoir changé.</p>{/if}

          {#if visibles.length}
            {#if nuit}
              <TableauDeparts lignes={visibles} selection={selection?.offre.id} {tri} ontri={trier} onselect={(id) => (choix = id)} titre="Départs · {ville(r.de)} {r.de}" {refNeuf} description="Offres {ville(r.de)} ({r.de}) vers {dest === 'Partout' ? 'toutes les destinations' : `${ville(r.vers)} (${r.vers})`}. Écart calculé par rapport au prix équivalent d’un billet neuf." />
              {#if selection}
                <div class="sel">
                  <div class="col g4 grow"><span class="sur">Offre sélectionnée</span>
                    <span class="sel-t">{#if selection.offre.masquee}Drop membres · {selection.vol.de} → {selection.vol.vers}{:else}{selection.vol.heureDepart} → {selection.vol.heureArrivee}{selection.vol.plusJours > 0 ? ` (+${selection.vol.plusJours})` : ''} · {compagnieDe(selection.vol).nom} vol {selection.vol.numero.split(' ').slice(1).join(' ')} · {selection.vol.escales.length ? `${selection.vol.escales.length} escale${selection.vol.escales.length > 1 ? 's' : ''}` : 'direct'}, {fmtDuree(selection.vol.dureeMin)}{/if}</span>
                    <span class="sel-s">{ligneSource(selection)} · nom du voyageur à donner au plus tard le {dateEcheance(selection)}</span></div>
                  <div class="sel-a">{#if !selection.offre.masquee}<span class="sel-p">{dollars(selection.offre.prix)}</span>{/if}<a class="jaune" href={hrefSel} onclick={(e) => va(e, hrefSel)}>{#if selection.offre.masquee}<Pictos nom="cadenas" taille={18} trait={2} />{/if}{ctaSel}{#if !selection.offre.masquee}<Pictos nom="suivant" taille={18} trait={2} />{/if}</a></div>
                </div>
              {/if}
            {:else}
              <ul class="liste-plain cartes" aria-label="Offres">
                {#each visibles as l (l.offre.id)}<li><CarteOffrePc ligne={l} meilleure={meilleure && meilleure.ligne.offre.id === l.offre.id ? meilleure.critere : null} {avecDate} /></li>{/each}
              </ul>
            {/if}
          {:else}
            <section class="vide" aria-labelledby="vide-pc">
              {#if lignes.length}
                <h3 id="vide-pc">Aucune offre ne correspond à ces filtres.</h3><p>{nuit ? 'Élargissez le prix maximum ou réactivez une source.' : `Élargissez le prix maximum ou réactivez une source. Vous pouvez aussi chercher à ±${FLEX_JOURS} jours.`}</p>
                <div class="actions"><button type="button" class="btn sec sm" onclick={reinit}>Réinitialiser les filtres</button>{#if r.jour && !r.flex}<a class="btn sec sm" href={versUrl(elargir(r))} onclick={(e) => va(e, versUrl(elargir(r)))}>Chercher à ±{FLEX_JOURS} jours</a>{/if}</div>
              {:else}
                <h3 id="vide-pc">Aucun vol ne correspond à cette recherche</h3>
                <p>{r.jour ? `Aucune offre pour ${r.de} → ${dest} le ${fmtJourCourt(r.jour)}${r.flex ? ` (±${FLEX_JOURS} jours)` : ''}.` : `Aucun départ à venir pour ${r.de} → ${dest}.`}{r.sources.length < 4 || r.revendable ? ' Vos filtres de source écartent peut-être des offres.' : ''}</p>
                {#if proches.length}<p class="sur">Dates proches avec des vols</p>
                  <ul class="liste-plain dates">{#each proches as d (d.jour)}<li><a href={versUrl({ ...r, jour: d.jour, flex: false })} onclick={(e) => va(e, versUrl({ ...r, jour: d.jour, flex: false }))}><span class="dj">{fmtJourCourt(d.jour)}</span><span class="dn">{d.vols} vol{d.vols > 1 ? 's' : ''} · {Math.abs(d.ecart)} jour{Math.abs(d.ecart) > 1 ? 's' : ''} {d.ecart > 0 ? 'plus tard' : 'plus tôt'}</span><Pictos nom="suivant" taille={18} /></a></li>{/each}</ul>{/if}
                <div class="actions">
                  {#if r.jour && !r.flex}<a class="btn sec sm" href={versUrl(elargir(r))} onclick={(e) => va(e, versUrl(elargir(r)))}>Élargir à ±{FLEX_JOURS}&nbsp;jours</a>{/if}
                  {#if r.vers !== PARTOUT}<a class="btn sec sm" href={versUrl({ ...r, vers: PARTOUT })} onclick={(e) => va(e, versUrl({ ...r, vers: PARTOUT }))}>Voir toutes les destinations{r.jour ? ' ce jour-là' : ''}</a>{/if}
                  <a class="btn sec sm" href={retourForm} onclick={(e) => va(e, retourForm)}>Modifier la recherche</a>
                </div>
                {#if !trajetExiste}<p class="aide">Aucun vol de ce trajet n’est proposé pour l’instant.</p>{/if}
              {/if}
            </section>
          {/if}
          <p class="note">{nuit ? `Écart = prix de l’offre − prix équivalent neuf${refNeuf !== null ? ` (${dollars(refNeuf)})` : ''}. Prix indicatifs. Reventes : prix plafonné (règle à définir) et commission de 10 à 20 % — hypothèses.` : 'Écart = prix de l’offre − prix équivalent neuf. Prix indicatifs. Reventes : prix plafonné (règle à définir). Les droits revendus restent soumis aux règles de finalisation.'}</p>
          <a class="intention" href="/intention/nouvelle" onclick={(e) => va(e, '/intention/nouvelle')}><Pictos nom="etiquette" taille={18} trait={2} />Trop cher ? Dites votre prix : publiez une intention d’achat</a>
        </section>
        <div class="c-droite">
          {#if nuit}<PanneauxMarche {compte} />
          {:else}
            {#if lignes.some((l) => !l.offre.masquee)}<BarometrePc {lignes} meilleureId={meilleure?.ligne.offre.id} {ids} />{/if}
            <section class="alerte-prix" aria-labelledby="al-titre"><h2 id="al-titre">Alerte de prix</h2><p>Soyez prévenu si le prix d’un billet de ce trajet change.</p>
              <button type="button" class="btn sec" class:on={alerteOn} aria-pressed={alerteOn} disabled={!refAlerte} onclick={alerte}><Pictos nom="cloche" taille={18} trait={2} />{alerteOn ? 'Alerte activée' : 'Créer une alerte'}</button>
              <div role="status" aria-live="polite">{#if alerteOn}<p class="statut"><Pictos nom="ok" taille={16} trait={2} />Alerte créée : vous serez prévenu si le prix change.</p>{:else if alerteMsg}<p class="statut"><Pictos nom="info" taille={16} trait={2} />{alerteMsg}</p>{/if}</div></section>
          {/if}
        </div>
      </div>
    {/if}
  </div>
  {/key}
</Ecran>

<style>
  .page { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .tete { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 32px; } .tete-g { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  h1 { margin: 0; font: 600 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; }
  .sous { margin: 0; font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .intro { margin: 0; flex: 0 1 560px; font: 400 15px/22px 'Barlow', sans-serif; color: var(--ink2); }
  .grille { display: grid; grid-template-columns: 220px minmax(0, 1fr); grid-template-areas: 'filtres centre' 'droite droite'; gap: 24px; align-items: start; }
  .c-filtres { grid-area: filtres; min-width: 0; } .milieu { grid-area: centre; min-width: 0; display: flex; flex-direction: column; gap: 14px; } .c-droite { grid-area: droite; min-width: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 18px; align-items: start; }
  @media (min-width: 1180px) { .grille { grid-template-columns: 220px minmax(0, 1fr) 300px; grid-template-areas: 'filtres centre droite'; } .grille.nuit { grid-template-columns: 220px minmax(0, 1fr) 280px; } .c-droite { display: flex; flex-direction: column; } }
  .c-ent { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px 16px; } .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .g4 { gap: 4px; } .grow { flex: 1 1 320px; }
  h2 { margin: 0; font: 600 24px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .cpt { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .tri { display: flex; align-items: center; gap: 8px; } .tri-l { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .seg { display: flex; gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); } .seg button { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border: 0; border-radius: 10px; background: transparent; color: var(--ink2); font: 700 14px/1 'Barlow', sans-serif; cursor: pointer; } .seg button.on { background: var(--ink); color: var(--bg); }
  .cartes { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; }
  .note { margin: 0; font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink2); } [data-face='nuit'] .note { color: var(--ink3); }
  .intention { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; align-self: flex-start; color: var(--accent); font: 600 14px/20px 'Barlow', sans-serif; }
  .hors { display: flex; gap: 8px; align-items: flex-start; margin: 0; padding: 10px 12px; border-radius: 12px; background: var(--signal-soft); color: var(--signal-ink); font: 600 14px/20px 'Barlow', sans-serif; }
  .sel { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 20px; padding: 16px 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); margin: 0; } .sel-t { font: 600 17px/22px 'Barlow', sans-serif; } .sel-s { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .sel-a { display: flex; flex-wrap: wrap; align-items: center; gap: 12px 18px; } .sel-p { font: 600 26px/30px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .jaune { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 0 22px; border-radius: 14px; background: var(--signal); color: #0d0e11; font: 700 16px/1 'Barlow', sans-serif; } .jaune:hover { background: var(--signal-2); }
  .bloc, .vide { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .vide { align-items: center; text-align: center; } .vide h3 { margin: 0; font: 600 16px/22px 'Barlow', sans-serif; } .vide p { margin: 0; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 10px; } .actions :global(.btn) { width: auto; } .vide .aide { font-size: 13px; color: var(--ink3); }
  .alerte { display: flex; gap: 10px; align-items: flex-start; margin: 0; padding: 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 500 14px/20px 'Barlow', sans-serif; } .alerte strong { font-weight: 700; }
  .dates { align-self: stretch; text-align: left; border-radius: 14px; border: 1px solid var(--line); overflow: hidden; } .dates li + li { border-top: 1px solid var(--line); } .dates a { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; min-height: 56px; padding: 0 14px; color: var(--ink); } .dates :global(svg) { color: var(--ink3); } .dj { font: 700 15px/20px 'Barlow', sans-serif; white-space: nowrap; } .dn { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .alerte-prix { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .alerte-prix h2 { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; color: var(--ink2); } .alerte-prix p { margin: 0; font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .alerte-prix .btn { min-height: 48px; width: 100%; } .alerte-prix .btn.on { background: var(--accent-soft); border-color: var(--accent); } .alerte-prix .statut { display: flex; align-items: center; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink); }
  .squelette { display: flex; flex-direction: column; gap: 14px; } .s1, .s2 { display: block; border-radius: 20px; background: var(--surface2); animation: nx-pulse 1.4s ease-in-out infinite; } .s1 { height: 180px; } .s2 { height: 150px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
</style>
