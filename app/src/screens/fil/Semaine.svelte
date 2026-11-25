<script lang="ts">
  import { ajouterJours, lundiDe } from '@core/dates.ts';
  import { aujourdhui as jourCourant, maintenantLocal } from '../../data/temps.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Segment from '../../ui/Segment.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { disposer } from './disposition.ts';
  import { jourValide } from './navigation.ts';
  import { bornesGrille, hmin, joursDeLaSemaine, numeroSemaine, plageSemaine } from './semaine.ts';
  import { blocsDeLaSemaine, placer, propositionsDeLaSemaine } from './remplir.ts';
  import { cap, dateLongue, dureeMin, hm, puceJour } from './format.ts';

  /** Vue Semaine : 7 colonnes, blocs à leur heure (fait, prévu, non fait), ligne de l'heure, « Remplis ma semaine ». */
  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const LETTRES = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
  const ECHELLE = 20 / 60;

  const aujourdhui = $derived(jourCourant());
  const lundi = $derived(lundiDe(jourValide(routeur.params.get('semaine')) ?? aujourdhui));
  const jours = $derived(joursDeLaSemaine(lundi));
  const blocsParJour = $derived(blocsDeLaSemaine(jours));
  const bornes = $derived(bornesGrille(Object.values(blocsParJour).flat()));
  const hauteur = $derived(Math.round((bornes.fin - bornes.debut) * ECHELLE));
  const maintenant = $derived(maintenantLocal().minutes);
  const mode = $derived(theme.mode);
  const reperes = $derived([3, 6, 9, 12, 15, 18, 21].map((h) => h * 60).filter((m) => m > bornes.debut && m < bornes.fin));
  const y = (min: number) => Math.round((min - bornes.debut) * ECHELLE);

  const colonnes = $derived(jours.map((j, i) => {
    const blocs = blocsParJour[j];
    const places = disposer(blocs.map((b) => ({ debut: b.debutMin, fin: b.finMin })));
    return {
      j, l: LETTRES[i], num: +j.slice(8), estAujourdhui: j === aujourdhui, passe: j < aujourdhui,
      pct: (() => { const t = blocs.reduce((m, b) => m + b.finMin - b.debutMin, 0); const f = blocs.filter((b) => b.fait).reduce((m, b) => m + b.finMin - b.debutMin, 0); return t ? Math.round((f / t) * 100) : null; })(),
      blocs: blocs.map((b, k) => {
        const passe = j < aujourdhui || (j === aujourdhui && b.finMin <= maintenant);
        return { id: b.occ.id, titre: b.titre, top: y(b.debutMin), h: Math.max(3, Math.round((b.finMin - b.debutMin) * ECHELLE) - 1), couleur: couleurRubrique(b.couleur, mode), fait: b.fait, manque: passe && !b.fait, ...places[k] };
      })
    };
  }));

  const totaux = $derived.by(() => {
    let prevu = 0, fait = 0;
    for (const j of jours) for (const b of blocsParJour[j]) { prevu += b.finMin - b.debutMin; if (b.fait) fait += b.finMin - b.debutMin; }
    return { prevu, fait };
  });

  const pctSemaine = $derived(totaux.prevu ? Math.round((totaux.fait / totaux.prevu) * 100) : 0);
  /** Les heures de nuit (avant 6 h, après 22 h) sont légèrement assombries dans chaque colonne. */
  const nuitHaut = $derived(Math.max(0, Math.min(hauteur, y(360))));
  const nuitBas = $derived(Math.max(0, Math.min(hauteur, y(1320))));
  const propositions = $derived(propositionsDeLaSemaine(jours, blocsParJour, aujourdhui, maintenant));

  const allerSemaine = (n: number) => { const l = ajouterJours(lundi, 7 * n); routeur.definir('semaine', l === lundiDe(aujourdhui) ? null : l); };
  const jourDeVue = $derived(jours.includes(aujourdhui) ? aujourdhui : lundi);

  function placerTout() {
    const n = propositions.length;
    placer(propositions);
    dire(`${n} créneau${n > 1 ? 'x' : ''} placé${n > 1 ? 's' : ''} dans Le Fil`);
  }
</script>

<EcranPage gap={14}>
  <div class="tete">
    <div class="col serre">
      <span class="plage">{plageSemaine(lundi)}</span>
      <h1 class="titre">Semaine {numeroSemaine(lundi)}</h1>
    </div>
    <div class="nav">
      <button type="button" class="rond" aria-label="Semaine précédente" onclick={() => allerSemaine(-1)}><Icone nom="retour" taille={16} trait={2.2} /></button>
      <button type="button" class="rond" aria-label="Semaine suivante" onclick={() => allerSemaine(1)}><Icone nom="suivant" taille={16} trait={2.2} /></button>
    </div>
  </div>

  <div class="vues">
    <Segment valeur="semaine" options={[
      { valeur: 'jour', label: 'Jour', href: jourDeVue === aujourdhui ? '/' : `/?jour=${jourDeVue}` },
      { valeur: 'semaine', label: 'Semaine' },
      { valeur: 'mois', label: 'Mois', href: `/mois?mois=${jourDeVue.slice(0, 7)}` }
    ]} />
  </div>

  <div class="resume" aria-label="Bilan de la semaine">
    <div class="r-haut"><span class="r-pct">{pctSemaine}<small> %</small></span><span class="r-txt"><b>{hmin(totaux.fait)}</b> faites sur <b>{hmin(totaux.prevu)}</b> prévues</span></div>
    <span class="r-piste"><span style:width="{pctSemaine}%"></span></span>
  </div>

  <div class="grille">
    <span></span>
    {#each colonnes as c (c.j)}
      <a class="entete-col" href={c.estAujourdhui ? '/' : `/?jour=${c.j}`} aria-label="Ouvrir {dateLongue(c.j)}">
        <span class="lettre">{c.l}</span>
        <span class="num" class:auj={c.estAujourdhui} class:passe={c.passe}>{c.num}</span>
        <span class="jbarre" class:vide={c.pct === null}><span style:width="{c.pct ?? 0}%"></span></span>
      </a>
    {/each}

    <div class="heures" style:height="{hauteur}px">
      {#each reperes as m (m)}<span class="mono" style:top="{y(m) - 6}px">{hm(m).slice(0, 2)}</span>{/each}
    </div>
    {#each colonnes as c (c.j)}
      <a class="colonne" class:auj={c.estAujourdhui} style:height="{hauteur}px" href={c.estAujourdhui ? '/' : `/?jour=${c.j}`} aria-label="{cap(puceJour(c.j, aujourdhui))} : {c.blocs.length} blocs, {c.blocs.filter((b) => b.fait).length} faits">
        {#if nuitHaut > 0}<span class="nuit" style:top="0" style:height="{nuitHaut}px"></span>{/if}
        {#if nuitBas < hauteur}<span class="nuit" style:top="{nuitBas}px" style:height="{hauteur - nuitBas}px"></span>{/if}
        {#each reperes as m (m)}<span class="trait" style:top="{y(m)}px"></span>{/each}
        {#each c.blocs as b (b.id)}
          <span class="bloc" class:fait={b.fait} class:manque={b.manque} title={b.titre}
            style:--c={b.couleur} style:top="{b.top}px" style:height="{b.h}px"
            style:left="calc(2px + (100% - 4px) * {b.col} / {b.cols})" style:width="calc((100% - 4px) / {b.cols} - {b.cols > 1 ? 1 : 0}px)"></span>
        {/each}
        {#if c.estAujourdhui && maintenant >= bornes.debut && maintenant <= bornes.fin}
          <span class="maintenant" style:top="{y(maintenant)}px"></span>
          <span class="point" style:top="{y(maintenant) - 3}px"></span>
        {/if}
      </a>
    {/each}
  </div>

  <div class="legende">
    <span><i class="l-fait"></i>Fait</span>
    <span><i class="l-prevu"></i>Prévu</span>
    <span><i class="l-non"></i>Non fait</span>
    <span class="mono total">{hmin(totaux.fait)} / {hmin(totaux.prevu)}</span>
  </div>

  <div class="remplir">
    <div class="col">
      <span class="fort">Remplis ma semaine</span>
      <span class="doux">
        {#if propositions.length}{propositions.length} créneau{propositions.length > 1 ? 'x' : ''} libre{propositions.length > 1 ? 's' : ''} trouvé{propositions.length > 1 ? 's' : ''} pour ce qui manque
        {:else if jours[6] < aujourdhui}Cette semaine est passée.
        {:else}Ce qui est prévu couvre tes objectifs de temps de la semaine.{/if}
      </span>
    </div>
    {#if propositions.length}
      <div class="props">
        {#each propositions as p (p.spId)}
          <div class="prop"><span>{cap(puceJour(p.jour, aujourdhui))} {hm(p.debut)} · {p.titre}</span><span class="mono doux">{dureeMin(p.duree)}</span></div>
        {/each}
      </div>
      <button type="button" class="placer" onclick={placerTout}>Placer {propositions.length > 1 ? `les ${propositions.length} créneaux` : 'ce créneau'}</button>
    {/if}
  </div>
</EcranPage>

<style>
  /* Marges de la maquette : 18 px en haut, 18 px sur les côtés pour l'en-tête (12 + 6), 12 px pour la grille. */
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -2px 2px 0; }
  .col.serre { gap: 0; }
  .vues { padding: 0 2px; }
  .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .plage { font-size: 13px; font-weight: 600; color: var(--maintenant); }
  h1 { font-size: 28px; }
  .nav { display: flex; gap: 6px; }
  .grille { display: grid; grid-template-columns: 26px repeat(7, minmax(0, 1fr)); gap: 3px; margin: 0 -4px; }
  .entete-col { display: flex; flex-direction: column; align-items: center; gap: 2px; min-height: 44px; }
  .lettre { font-size: 11px; font-weight: 600; color: var(--muted); }
  .num { width: 30px; height: 30px; border-radius: 15px; display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 600; }
  .num.auj { background: var(--jour-aujourdhui); color: var(--jour-aujourdhui-texte); }
  .heures { position: relative; }
  .heures span { position: absolute; right: 3px; font-size: 10px; color: var(--muted); font-variant-numeric: tabular-nums; }
  .colonne { position: relative; display: block; border-radius: 8px; background: color-mix(in srgb, var(--surface-2) 45%, var(--fond)); overflow: hidden; }
  .colonne.auj { background: var(--surface); box-shadow: 0 0 0 1px color-mix(in srgb, var(--maintenant) 55%, transparent), 0 0 18px -4px color-mix(in srgb, var(--maintenant) 45%, transparent); }
  .trait { position: absolute; left: 0; right: 0; height: 1px; background: repeating-linear-gradient(90deg, var(--ligne) 0 4px, transparent 4px 7px); }
  .resume { border-radius: 20px; padding: 14px 16px; background: linear-gradient(135deg, var(--surface), var(--surface-2)); border: 1px solid var(--ligne); display: flex; flex-direction: column; gap: 10px; margin: 0 2px; }
  .r-haut { display: flex; align-items: baseline; gap: 14px; } .r-pct { font-size: 34px; font-weight: 700; letter-spacing: -.02em; line-height: 1; font-variant-numeric: tabular-nums; } .r-pct small { font-size: 16px; font-weight: 600; color: var(--muted); } .r-txt { font-size: 13px; color: var(--muted); } .r-txt b { color: var(--texte); font-weight: 600; font-variant-numeric: tabular-nums; }
  .r-piste { height: 8px; border-radius: 4px; background: var(--piste, rgba(255,255,255,.08)); overflow: hidden; } .r-piste span { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--bon, #4ade80), color-mix(in srgb, var(--bon, #4ade80) 55%, #fff)); }
  .jbarre { width: 22px; height: 3px; border-radius: 2px; background: var(--piste, rgba(255,255,255,.1)); overflow: hidden; } .jbarre span { display: block; height: 100%; background: var(--bon, #4ade80); } .jbarre.vide { opacity: .35; }
  .num.passe:not(.auj) { color: var(--muted); }
  .nuit { position: absolute; left: 0; right: 0; background: rgba(0, 0, 0, .22); }
  .bloc { position: absolute; border-radius: 5px; background: color-mix(in srgb, var(--c) 22%, transparent); box-shadow: inset 2.5px 0 0 var(--c); transition: background-color .3s ease; }
  .bloc.fait { background: linear-gradient(180deg, color-mix(in srgb, var(--c) 86%, #fff), var(--c)); box-shadow: 0 2px 8px color-mix(in srgb, var(--c) 38%, transparent), inset 0 1px 0 rgba(255,255,255,.28); }
  .bloc.manque { background: repeating-linear-gradient(135deg, rgba(255,255,255,.09) 0 3px, transparent 3px 7px); box-shadow: inset 2.5px 0 0 var(--faint); }
  .maintenant { position: absolute; left: 0; right: 0; height: 2px; background: var(--maintenant); }
  .point { position: absolute; left: -1px; width: 7px; height: 7px; border-radius: 4px; background: var(--maintenant); }
  .legende { display: flex; gap: 12px; flex-wrap: wrap; padding: 0 2px; font-size: 11px; color: var(--muted); }
  .legende span { display: flex; align-items: center; gap: 5px; }
  .legende i { width: 12px; height: 12px; border-radius: 3px; }
  .l-fait { background: var(--texte); }
  .l-prevu { background: color-mix(in srgb, var(--texte) 22%, transparent); box-shadow: inset 2.5px 0 0 var(--texte); }
  .l-non { background: repeating-linear-gradient(135deg, var(--faint) 0 2px, transparent 2px 4px); box-shadow: inset 2.5px 0 0 var(--faint); }
  .legende .total { display: none; }
  .remplir { background: var(--carte-fond); color: var(--carte-texte); border: 1px solid var(--ligne); border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .fort { font-size: 16px; font-weight: 600; }
  .doux { font-size: 13px; opacity: 0.75; }
  .props { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  .prop { display: flex; justify-content: space-between; gap: 8px; }
  .placer { height: 46px; border-radius: 14px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 15px; font-weight: 600; }
</style>
