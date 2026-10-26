<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import { dollars } from './montants.ts';
  import { app } from '../../data/store.svelte.ts';
  import { aujourdhui } from '../../data/horloge.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { aller, routeur } from '../../router.svelte.ts';
  import { aLePass, lignesDuTrajet } from './actions.ts';
  import CarteOffre from './CarteOffre.svelte';
  import { fmtJourCourt, fmtVoyageurs } from './dates.ts';
  import { va } from './nav.ts';
  import { ONGLETS, TRIS, barometre, compter, datesProches, elargir, existeTrajet, filtrerOnglet, meilleureAffaire, trier, type Onglet, type Tri } from './offres.ts';
  import Pictos from './Pictos.svelte';
  import { FLEX_JOURS, PARTOUT, lireParams, versFormulaire, versUrl } from './params.ts';
  import { reseau } from './reseau.svelte.ts';

  /** Résultats d'une recherche : en-tête de trajet, onglets avec compteurs, baromètre du marché, cartes d'offres (un vol après l'autre), tris, état vide utile, intention d'achat. */
  const lu = $derived(lireParams(routeur.recherche, app.monde.aeroports.map((a) => a.code)));
  const r = $derived(lu.recherche), problemes = $derived(lu.problemes), invalide = $derived(Object.values(problemes).filter(Boolean));
  const etatForce = $derived(new URLSearchParams(routeur.recherche).get('etat'));
  const pass = $derived(aLePass(compteCourant()?.id));
  const lignes = $derived(invalide.length ? [] : lignesDuTrajet(r, pass));
  let onglet = $state<Onglet>('tous'), tri = $state<Tri>('recommande'), triOuvert = $state(false);
  const compteurs = $derived(compter(lignes)), meilleure = $derived(meilleureAffaire(lignes));
  const visibles = $derived(trier(filtrerOnglet(lignes, onglet), tri)), ids = $derived(new Set(visibles.map((l) => l.offre.id)));
  const baro = $derived(barometre(lignes, meilleure?.ligne.offre.id));
  const avecDate = $derived(new Set(lignes.map((l) => l.vol.jour)).size > 1 || new Set(lignes.map((l) => l.vol.vers)).size > 1);
  const titre = $derived(`${r.de} → ${r.vers === PARTOUT ? 'Partout' : r.vers || '…'}`);
  const sous = $derived([r.jour ? `${fmtJourCourt(r.jour)}${r.flex ? ` ±${FLEX_JOURS} jours` : ''}` : 'Toutes les dates', fmtVoyageurs(r.n), r.retour ? `retour ${fmtJourCourt(r.retour)}` : ''].filter(Boolean).join(' · '));
  const retourForm = $derived(versFormulaire(r));
  const proches = $derived(datesProches(app.monde.vols, r, aujourdhui()));
  const trajetExiste = $derived(existeTrajet(app.monde.vols, r));
  const nomOnglet = $derived(ONGLETS.find((o) => o.id === onglet)!.libelle);
  const comptage = $derived(`${visibles.length} offre${visibles.length > 1 ? 's' : ''}`);
  const triActif = $derived(TRIS.find((t) => t.id === tri)!);
  const echelleDescr = $derived(`Échelle de ${dollars(baro.echelle.min)} à ${dollars(baro.echelle.max)}. Offres : ${baro.points.map((p) => `${dollars(p.prix)}${p.meilleure ? ' (meilleure affaire)' : ''}`).join(', ')}.${baro.neuf !== null ? ` Prix équivalent neuf : ${dollars(baro.neuf)}.` : ''}`);
  const cacher = (pos: number) => (pos < 12 ? 0 : pos > 88 ? 100 : 50);
</script>

<Ecran titre={invalide.length ? 'Recherche incomplète' : titre} etape={invalide.length ? undefined : sous} face="jour" retour={retourForm}>
  <h1 class="sr">{invalide.length ? 'Recherche incomplète' : `Résultats ${titre}`}</h1>
  {#snippet droite()}<a class="rond" href={retourForm} aria-label="Modifier la recherche" onclick={(e) => va(e, retourForm)}><Pictos nom="reglages" taille={20} /></a>{/snippet}

  {#if invalide.length}
    <section class="vide" aria-labelledby="inc">
      <p class="alerte" role="alert"><Pictos nom="alerte" taille={20} /><span><strong id="inc">Cette recherche est incomplète.</strong><br />{invalide.join(' ')}</span></p>
      <a class="btn" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Modifier la recherche</a>
    </section>
  {:else if etatForce === 'erreur'}
    <section class="vide"><p class="alerte" role="alert"><Pictos nom="alerte" taille={20} /><span><strong>Les prix n’ont pas pu être chargés.</strong><br />Vérifiez votre connexion puis réessayez.</span></p>
      <a class="btn" href={versUrl(r)} onclick={(e) => va(e, versUrl(r))}>Réessayer</a></section>
  {:else if etatForce === 'chargement'}
    <div aria-busy="true" aria-live="polite" class="squelette"><p class="sr">Chargement des offres…</p><span class="s1"></span><span class="s2"></span><span class="s2"></span></div>
  {:else}
    {#if !reseau.enLigne}<p class="hors" role="status"><Pictos nom="horsligne" taille={18} />Vous êtes hors ligne : ces prix datent de votre dernière visite et peuvent avoir changé.</p>{/if}

    <div role="group" aria-label="Filtrer par source" class="onglets">
      {#each ONGLETS as o (o.id)}
        <button type="button" aria-pressed={onglet === o.id} class="onglet" class:on={onglet === o.id} onclick={() => (onglet = o.id)}>{o.libelle} <span class="n">{compteurs[o.id]}</span></button>
      {/each}
    </div>

    {#if lignes.some((l) => !l.offre.masquee)}
      <section aria-labelledby="baro-title" class="baro">
        <div class="b-ent"><h2 id="baro-title">Baromètre du marché</h2><span class="b-sub">Prix indicatifs</span></div>
        <p class="b-txt">
          {#if baro.sousNeuf > 0}<span class="m">{baro.sousNeuf}</span> offre{baro.sousNeuf > 1 ? 's' : ''} sous le prix équivalent neuf, dès <span class="m">{dollars(baro.des!)}</span>.
          {:else}Aucune offre sous le prix équivalent neuf pour l’instant{#if baro.des !== null}, dès <span class="m">{dollars(baro.des)}</span>{/if}.{/if}
        </p>
        <div role="img" aria-label={echelleDescr} class="ech">
          <span class="axe"></span><span class="bande" style="left:{baro.posMin}%;width:{baro.posMax - baro.posMin}%"></span>
          {#if baro.posNeuf !== null}<span class="neuf-l" style="left:{baro.posNeuf}%"></span><span class="neuf-t" style="right:{100 - baro.posNeuf}%">Neuf {dollars(baro.neuf!)}</span>{/if}
          {#each baro.points as p (p.id)}
            {#if p.meilleure}
              <span class="tag" style="left:{p.pos}%;transform:translateX(-{cacher(p.pos)}%)"><span class="tag-p">{dollars(p.prix)}</span><span class="tige"></span><span class="tag-d"></span></span>
            {:else}
              <span class="dot" class:neuf={p.type === 'neuf'} style="left:{p.pos}%;opacity:{ids.has(p.id) ? 1 : 0.6}"></span>
            {/if}
          {/each}
        </div>
        <div class="grad" aria-hidden="true">{#each baro.echelle.graduations as g (g.pos)}<span style="left:{g.pos}%">{dollars(g.prix)}</span>{/each}</div>
        {#if baro.masques > 0}<p class="b-pied"><Pictos nom="cadenas" taille={16} trait={2} />+ {baro.masques} drop{baro.masques > 1 ? 's' : ''} membres non affiché{baro.masques > 1 ? 's' : ''} : prix visible{baro.masques > 1 ? 's' : ''} avec le Pass NexG</p>{/if}
      </section>
    {/if}

    {#if visibles.length}
      <div class="comptage"><p class="cpt" aria-live="polite">{comptage} · prix par voyageur</p>
        <button type="button" class="tri" aria-haspopup="dialog" onclick={() => (triOuvert = true)}><Pictos nom="trier" taille={16} trait={2} />Trier : {triActif.libelle}</button></div>
      <ul class="liste-plain cartes" aria-label="Offres">
        {#each visibles as l (l.offre.id)}
          <li><CarteOffre ligne={l} miseEnAvant={meilleure && meilleure.ligne.offre.id === l.offre.id ? meilleure.critere : null} {avecDate} /></li>
        {/each}
      </ul>
    {:else}
      <section class="vide" aria-labelledby="vide-t">
        {#if lignes.length}
          <h2 id="vide-t" class="t-section">Aucune offre « {nomOnglet} » pour cette recherche</h2>
          <p class="t-sec">Les autres sources ont {lignes.length} offre{lignes.length > 1 ? 's' : ''}.</p>
          <button type="button" class="btn sec" onclick={() => (onglet = 'tous')}>Voir toutes les offres</button>
        {:else}
          <h2 id="vide-t" class="t-section">Aucun vol ne correspond à cette recherche</h2>
          <p class="t-sec">{r.jour ? `Aucune offre pour ${titre} le ${fmtJourCourt(r.jour)}${r.flex ? ` (±${FLEX_JOURS}\u00a0jours)` : ''}${r.flex ? '.' : ''}` : `Aucun départ à venir pour ${titre}.`}{r.sources.length < 4 || r.revendable ? ' Vos filtres de source écartent peut-être des offres.' : ''}</p>
          {#if proches.length}
            <p class="t-sur">Dates proches avec des vols</p>
            <ul class="liste-plain dates">
              {#each proches as d (d.jour)}<li><a href={versUrl({ ...r, jour: d.jour, flex: false })} onclick={(e) => va(e, versUrl({ ...r, jour: d.jour, flex: false }))}><span class="dj">{fmtJourCourt(d.jour)}</span><span class="dn">{d.vols} vol{d.vols > 1 ? 's' : ''} · {Math.abs(d.ecart)} jour{Math.abs(d.ecart) > 1 ? 's' : ''} {d.ecart > 0 ? 'plus tard' : 'plus tôt'}</span><Pictos nom="suivant" taille={18} /></a></li>{/each}
            </ul>
          {/if}
          <div class="col g8">
            {#if r.jour && !r.flex}<a class="btn sec" href={versUrl(elargir(r))} onclick={(e) => va(e, versUrl(elargir(r)))}>Élargir à ±{FLEX_JOURS}&nbsp;jours</a>{/if}
            {#if r.vers !== PARTOUT}<a class="btn sec" href={versUrl({ ...r, vers: PARTOUT })} onclick={(e) => va(e, versUrl({ ...r, vers: PARTOUT }))}>Voir toutes les destinations{r.jour ? ' ce jour-là' : ''}</a>{/if}
            <a class="btn sec" href={retourForm} onclick={(e) => va(e, retourForm)}>Modifier la recherche</a>
          </div>
          {#if !trajetExiste}<p class="t-aide">Aucun vol de ce trajet n’est proposé pour l’instant.</p>{/if}
        {/if}
      </section>
    {/if}

    <a class="intention" href="/intention/nouvelle" onclick={(e) => va(e, '/intention/nouvelle')}>
      <span class="i-ent"><span class="i-ico" aria-hidden="true"><Pictos nom="etiquette" taille={22} /></span>
        <span class="col g2"><span class="i-t">Trop cher&nbsp;? Dites votre prix</span><span class="t13">Publiez une intention d’achat&nbsp;: les vendeurs de ce vol viennent à vous.</span></span></span>
      <span class="puces"><span class="puce ready"><Pictos nom="cadenas" taille={14} trait={2} />Fonds réservés</span><span class="puce">Aucun débit sans accord</span></span>
      <span class="i-cta">Publier une intention d’achat<Pictos nom="suivant" taille={18} trait={2} /></span>
    </a>
  {/if}
  <Feuille bind:ouvert={triOuvert} titre="Trier les offres" sous="L’ordre change, pas les offres.">
    <div role="radiogroup" aria-label="Ordre des offres" class="radios">
      {#each TRIS as t (t.id)}
        <label class="radio" class:on={tri === t.id}><input type="radio" name="tri" value={t.id} checked={tri === t.id} onchange={() => { tri = t.id; triOuvert = false; }} /><span class="col g2"><span class="r1">{t.libelle}</span><span class="r2">{t.aide}</span></span></label>
      {/each}
    </div>
  </Feuille>
</Ecran>

<style>
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; min-width: 0; } .g8 { gap: 8px; }
  .rond { width: 44px; height: 44px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); display: grid; place-items: center; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); margin: 0; }
  .hors { display: flex; gap: 8px; align-items: flex-start; padding: 10px 12px; border-radius: 12px; background: var(--signal-soft); color: var(--signal-ink); font: 600 14px/20px 'Barlow', sans-serif; }
  .onglets { display: flex; gap: 8px; margin: 0 -20px; padding: 4px 20px 8px; overflow-x: auto; contain: inline-size; scrollbar-width: none; } .onglets::-webkit-scrollbar { display: none; }
  .onglet { flex: none; display: inline-flex; align-items: center; gap: 6px; height: 44px; padding: 0 16px; border-radius: 999px; background: var(--surface); border: 1px solid var(--line); color: var(--ink2); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .onglet.on { background: var(--ink); border-color: var(--ink); color: #fff; } .n { font: 400 12px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .baro { display: flex; flex-direction: column; gap: 12px; padding: 16px 16px 14px; border-radius: 20px; background: var(--ink); color: #fff; }
  .b-ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .baro h2 { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #c9d3df; } .b-sub { font: 500 12px/16px 'Barlow', sans-serif; color: #c9d3df; }
  .b-txt { margin: 0; font: 400 15px/21px 'Barlow', sans-serif; color: #fff; } .m { font: 600 15px/21px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ech { position: relative; height: 66px; margin: 0 12px; } .ech > span { position: absolute; }
  .axe { left: 0; right: 0; top: 47px; height: 2px; background: rgba(255, 255, 255, 0.18); } .bande { top: 45px; height: 6px; border-radius: 999px; background: rgba(255, 255, 255, 0.22); }
  .neuf-l { top: 4px; height: 52px; border-left: 2px dashed #c9d3df; } .neuf-t { top: 2px; margin-right: 8px; font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #c9d3df; white-space: nowrap; }
  .dot { top: 42px; width: 12px; height: 12px; box-sizing: border-box; border-radius: 999px; background: #c9d3df; border: 2px solid var(--ink); transform: translateX(-50%); } .dot.neuf { background: #fff; }
  .tag { top: 0; display: flex; flex-direction: column; align-items: center; } .tag-p { height: 24px; padding: 0 8px; display: flex; align-items: center; border-radius: 6px; background: var(--signal); color: #0b1b2e; font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .tige { width: 2px; height: 14px; background: var(--signal); } .tag-d { width: 18px; height: 18px; box-sizing: border-box; border-radius: 999px; background: var(--signal); border: 3px solid var(--ink); }
  .grad { position: relative; height: 16px; margin: 0 12px; font: 400 11px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #c9d3df; font-variant-numeric: tabular-nums; } .grad span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
  .b-pied { margin: 0; padding-top: 10px; border-top: 1px solid rgba(255, 255, 255, 0.12); display: flex; align-items: center; gap: 8px; font: 400 13px/18px 'Barlow', sans-serif; color: #c9d3df; } .b-pied :global(svg) { color: var(--signal); }
  .comptage { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px; } .cpt { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .tri { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 10px; border: 0; background: none; color: var(--accent); font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; text-align: right; }
  .cartes { display: flex; flex-direction: column; gap: 14px; margin: 0; padding: 0; }
  .vide { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .alerte { display: flex; gap: 10px; align-items: flex-start; padding: 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 500 14px/20px 'Barlow', sans-serif; } .alerte strong { font-weight: 700; }
  .dates { border-radius: 14px; border: 1px solid var(--line); overflow: hidden; margin: 0; padding: 0; } .dates li + li { border-top: 1px solid var(--line); }
  .dates a { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; min-height: 56px; padding: 0 14px; color: var(--ink); } .dates :global(svg) { color: var(--ink3); }
  .dj { font: 700 15px/20px 'Barlow', sans-serif; white-space: nowrap; } .dn { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .intention { display: flex; flex-direction: column; gap: 14px; margin-top: 6px; padding: 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); box-shadow: var(--ombre); }
  .i-ent { display: flex; align-items: center; gap: 14px; } .i-ico { flex: none; width: 44px; height: 44px; border-radius: 12px; background: var(--ink); color: var(--signal); display: grid; place-items: center; }
  .i-t { font: 600 22px/24px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .t13 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .puce { white-space: normal; line-height: 14px; padding-block: 6px; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; } .i-cta { display: flex; align-items: center; justify-content: space-between; min-height: 44px; padding: 0 14px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font: 600 14px/18px 'Barlow', sans-serif; }
  .squelette { display: flex; flex-direction: column; gap: 14px; } .s1, .s2 { display: block; border-radius: 20px; background: var(--surface2); animation: nx-pulse 1.4s ease-in-out infinite; } .s1 { height: 180px; } .s2 { height: 150px; }
  .radios { display: flex; flex-direction: column; gap: 6px; } .radio { display: flex; align-items: center; gap: 12px; min-height: 56px; padding: 8px 12px; border-radius: 14px; border: 1px solid var(--line); cursor: pointer; } .radio.on { border-color: var(--accent); background: var(--accent-soft); }
  .radio input { width: 20px; height: 20px; margin: 0; accent-color: var(--accent); flex: none; } .r1 { font: 600 15px/20px 'Barlow', sans-serif; } .r2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
</style>
