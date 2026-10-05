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
      j, l: LETTRES[i], num: +j.slice(8), estAujourdhui: j === aujourdhui,
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
    <div class="col">
      <span class="plage">{plageSemaine(lundi)}</span>
      <h1 class="titre">Semaine {numeroSemaine(lundi)}</h1>
    </div>
    <div class="nav">
      <button type="button" class="rond" aria-label="Semaine précédente" onclick={() => allerSemaine(-1)}><Icone nom="retour" taille={16} trait={2.2} /></button>
      <button type="button" class="rond" aria-label="Semaine suivante" onclick={() => allerSemaine(1)}><Icone nom="suivant" taille={16} trait={2.2} /></button>
    </div>
  </div>

  <div>
    <Segment valeur="semaine" options={[
      { valeur: 'jour', label: 'Jour', href: jourDeVue === aujourdhui ? '/' : `/?jour=${jourDeVue}` },
      { valeur: 'semaine', label: 'Semaine' },
      { valeur: 'mois', label: 'Mois', href: `/mois?mois=${jourDeVue.slice(0, 7)}` }
    ]} />
  </div>

  <div class="grille">
    <span></span>
    {#each colonnes as c (c.j)}
      <a class="entete-col" href={c.estAujourdhui ? '/' : `/?jour=${c.j}`} aria-label="Ouvrir {dateLongue(c.j)}">
        <span class="lettre">{c.l}</span>
        <span class="num" class:auj={c.estAujourdhui}>{c.num}</span>
      </a>
    {/each}

    <div class="heures" style:height="{hauteur}px">
      {#each reperes as m (m)}<span class="mono" style:top="{y(m) - 6}px">{hm(m).slice(0, 2)}</span>{/each}
    </div>
    {#each colonnes as c (c.j)}
      <a class="colonne" class:auj={c.estAujourdhui} style:height="{hauteur}px" href={c.estAujourdhui ? '/' : `/?jour=${c.j}`} aria-label="{cap(puceJour(c.j, aujourdhui))} : {c.blocs.length} blocs, {c.blocs.filter((b) => b.fait).length} faits">
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
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
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
  .heures span { position: absolute; right: 2px; font-size: 9px; color: var(--faint); }
  .colonne { position: relative; display: block; border-radius: 8px; background: color-mix(in srgb, var(--surface-2) 45%, var(--fond)); overflow: hidden; }
  .colonne.auj { background: var(--surface); }
  .trait { position: absolute; left: 0; right: 0; height: 1px; background: var(--ligne); }
  .bloc { position: absolute; border-radius: 4px; border: 1.5px solid var(--c); background: transparent; }
  .bloc.fait { background: var(--c); }
  .bloc.manque { border-color: var(--faint); }
  .maintenant { position: absolute; left: 0; right: 0; height: 2px; background: var(--maintenant); }
  .point { position: absolute; left: -1px; width: 7px; height: 7px; border-radius: 4px; background: var(--maintenant); }
  .legende { display: flex; gap: 12px; flex-wrap: wrap; font-size: 11px; color: var(--muted); }
  .legende span { display: flex; align-items: center; gap: 5px; }
  .legende i { width: 12px; height: 12px; border-radius: 3px; }
  .l-fait { background: var(--texte); }
  .l-prevu { border: 1.5px solid var(--texte); }
  .l-non { background: var(--faint); opacity: 0.4; }
  .legende .total { margin-left: auto; }
  .remplir { background: var(--carte-fond); color: var(--carte-texte); border: 1px solid var(--ligne); border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 10px; }
  .fort { font-size: 16px; font-weight: 600; }
  .doux { font-size: 13px; opacity: 0.75; }
  .props { display: flex; flex-direction: column; gap: 6px; font-size: 13px; }
  .prop { display: flex; justify-content: space-between; gap: 8px; }
  .placer { height: 46px; border-radius: 14px; border: 0; background: var(--carte-texte); color: var(--carte-fond); font-size: 15px; font-weight: 600; }
</style>
