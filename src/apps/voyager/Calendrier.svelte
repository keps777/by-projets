<script lang="ts">
  import { aller, retour } from '../../router.svelte.ts';
  import { enDate, jourDe, jourSemaineCourt, jourSemaineLong, moisAnnee, type Jour } from '../../core/dates.ts';
  import { classePrix, departsProches, grilleMois, prixCourt } from '../../core/recherche.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { choisirJour, initRecherche } from './etat.ts';
  import { offresDuJour, prixBasDuJour } from './offres.ts';

  /** Quand ? Calendrier avec le prix le plus bas de chaque jour (calculé sur les départs du monde) et tambour 3D pour l'heure souhaitée. */
  const R = initRecherche();
  const STEP = 15, RAYON = 105, MOIS_MAX = 6;
  const ce = enDate(aujourdhui()), debut = ce.getFullYear() * 12 + ce.getMonth();
  const cible = enDate(R.jour), h0 = R.heureCible ? Number(R.heureCible.slice(0, 2)) : 8;
  let mois = $state(Math.max(0, cible.getFullYear() * 12 + cible.getMonth() - debut)); // décalage en mois depuis aujourd'hui
  let jour = $state<Jour>(R.jour);
  let minute = $state(R.heureCible ? Number(R.heureCible.slice(3, 5)) : 0);
  let rot = $state(-h0 * STEP);
  let drag = $state<{ y: number; r: number } | null>(null);

  const total = $derived(debut + mois), annee = $derived(Math.floor(total / 12)), m0 = $derived(total % 12);
  const grille = $derived(grilleMois(annee, m0));
  const premier = $derived(jourDe(new Date(annee, m0, 1, 12)));
  const auj = aujourdhui();
  const avecPrix = $derived(app.monde.params.tarifs.calendrierBas !== false);
  const cases = $derived(Array.from({ length: grille.jours }, (_, i) => {
    const j = jourDe(new Date(annee, m0, i + 1, 12)), passe = j < auj, px = passe ? null : prixBasDuJour(j, R.de, R.vers);
    return { j, n: i + 1, px, passe };
  }));
  const prix = $derived(cases.flatMap((c) => (c.px === null ? [] : [c.px])));
  const bornes = $derived({ min: prix.length ? Math.min(...prix) : 0, max: prix.length ? Math.max(...prix) : 0 });
  const heure = $derived(((Math.round(-rot / STEP) % 24) + 24) % 24);
  const hh = $derived(String(heure).padStart(2, '0')), mm = $derived(String(minute).padStart(2, '0'));
  const px = $derived(prixBasDuJour(jour, R.de, R.vers));
  const offres = $derived(jour < auj ? [] : offresDuJour(jour, R.de, R.vers));
  const proches = $derived(departsProches(`${hh}:${mm}`, offres.map((o) => o.heure)));
  const heures = $derived(Array.from({ length: 24 }, (_, i) => {
    const rel = (((i * STEP + rot) % 360) + 360) % 360, dist = Math.min(rel, 360 - rel);
    return { i, t: `${String(i).padStart(2, '0')} h`, op: dist > 80 ? '0' : Math.max(0.15, 1 - dist / 80).toFixed(2) };
  }));

  function caler(r: number) { rot = Math.round(r / STEP) * STEP; drag = null; }
  const bas = (e: PointerEvent) => { (e.currentTarget as Element).setPointerCapture(e.pointerId); drag = { y: e.clientY, r: rot }; };
  const bouge = (e: PointerEvent) => { if (drag) rot = drag.r + (e.clientY - drag.y) * 0.6; };
  const haut = () => { if (drag) caler(rot); };
  function touche(e: KeyboardEvent) {
    const pas = e.key === 'ArrowUp' ? 1 : e.key === 'ArrowDown' ? -1 : e.key === 'PageUp' ? 3 : e.key === 'PageDown' ? -3 : 0;
    if (pas) { e.preventDefault(); caler(rot - pas * STEP); }
  }
  const voir = () => { choisirJour(R, jour, `${hh}:${mm}`); aller('/'); };
  const libelleCase = (c: (typeof cases)[number]) => `${jourSemaineLong(c.j)}${c.passe ? ', passé' : c.px === null ? ', aucun départ' : avecPrix ? `, dès ${fmtF(c.px)}` : ''}`;
  const pastille = $derived(px === null ? 'aucun départ' : `dès ${fmtF(px)}`);
</script>

{#snippet entete()}
  <header class="hd">
    <a class="ib" href="/destination" aria-label="Retour" onclick={(e) => { e.preventDefault(); retour('/destination'); }}><Icone nom="retour" /></a>
    <div class="col grow"><span class="ttl t18">Quand ?</span><span class="t13 mut ell">{R.de} → {R.vers}</span></div>
    <span class="pl ac" aria-live="polite">{pastille}</span>
  </header>
{/snippet}

<Mobile enteteLibre={entete} dock={dockVoyageur('voyager')}>
  <div class="gl" style="padding: 12px">
    <div class="row sp" style="margin-bottom: 6px">
      <button class="ib mo" type="button" onclick={() => (mois = Math.max(0, mois - 1))} disabled={mois === 0} aria-label="Mois précédent"><Icone nom="retour" /></button>
      <span class="ttl t16" aria-live="polite">{moisAnnee(premier).replace(/^./, (c) => c.toUpperCase())}</span>
      <button class="ib mo" type="button" onclick={() => (mois = Math.min(MOIS_MAX, mois + 1))} disabled={mois >= MOIS_MAX} aria-label="Mois suivant"><Icone nom="suivant" /></button>
    </div>
    <div class="cal" role="group" aria-label="Choisir le jour">
      {#each ['lu', 'ma', 'me', 'je', 've', 'sa', 'di'] as w (w)}<span class="wd" aria-hidden="true">{w}</span>{/each}
      {#each Array(grille.decalage) as _, i (i)}<span class="dc blank" aria-hidden="true"></span>{/each}
      {#each cases as c (c.j)}
        {@const classe = c.px !== null && avecPrix ? classePrix(c.px, bornes.min, bornes.max) : ''}
        <button type="button" class="dc" class:on={c.j === jour} class:lo={classe === 'bas'} class:hi={classe === 'fort'} disabled={c.passe || c.px === null} aria-pressed={c.j === jour} aria-current={c.j === auj ? 'date' : undefined}
          aria-label={libelleCase(c)} onclick={() => (jour = c.j)}><b>{c.n}</b><small>{c.px !== null && avecPrix ? prixCourt(c.px) : ''}</small></button>
      {/each}
    </div>
    {#if avecPrix}<div class="row g8 t12 mut3 wrapf" style="margin-top: 6px"><span class="okc">● prix bas</span><span class="wac">● prix fort</span><span>· le prix affiché est le moins cher du jour</span></div>
    {:else}<p class="t12 mut3" style="margin-top: 6px">Les jours grisés n’ont aucun départ à vendre.</p>{/if}
  </div>
  <div class="row sp"><span class="lab" id="lib-tambour">Heure de départ souhaitée</span><span class="t12 mut3">tourne le tambour</span></div>
  <div class="drumw">
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <div class="drum" role="spinbutton" tabindex="0" aria-labelledby="lib-tambour" aria-valuemin="0" aria-valuemax="23" aria-valuenow={heure} aria-valuetext="{hh} heures" onkeydown={touche}
      onpointerdown={bas} onpointermove={bouge} onpointerup={haut} onpointercancel={haut}>
      <div class="dr" class:nt={drag} style="transform: rotateX({rot}deg)" aria-hidden="true">
        {#each heures as h (h.i)}<div class="hr" style="transform: rotateX({h.i * STEP}deg) translateZ({RAYON}px); opacity: {h.op}">{h.t}</div>{/each}
      </div>
    </div>
    <div class="ud"><button type="button" onclick={() => caler(rot - STEP)} aria-label="Heure suivante"><span class="haut"><Icone nom="retour" /></span></button><button type="button" onclick={() => caler(rot + STEP)} aria-label="Heure précédente"><span class="bas"><Icone nom="retour" /></span></button></div>
    <div class="mins" role="group" aria-label="Minutes">
      {#each [0, 15, 30, 45] as v (v)}<button type="button" class:on={minute === v} aria-pressed={minute === v} onclick={() => (minute = v)}>:{String(v).padStart(2, '0')}</button>{/each}
    </div>
  </div>
  <div class="sheet" style="margin-top: 4px">
    <div class="row sp">
      <div class="col"><span class="lab">Ton départ</span><span class="ttl t20">{jourSemaineCourt(jour)} · {hh}:{mm}</span><span class="t13 mut" aria-live="polite">{offres.length ? `Départs proches : ${proches.join(', ')}` : 'Aucun départ à vendre ce jour-là'}</span></div>
      <span class="ttl t20 aq">{px === null ? '—' : fmtF(px)}</span>
    </div>
    <button type="button" class="b p" onclick={voir}>Voir les départs en 3D</button>
  </div>
</Mobile>

<style>
  .cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; }
  .wd { font: 600 11px 'Geist Mono', monospace; color: #8e99bb; text-align: center; padding: 4px 0; text-transform: uppercase; }
  .dc { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; min-height: 48px; border-radius: 12px; border: 1px solid transparent; background: rgba(255, 255, 255, 0.04); color: #f2f4ff; cursor: pointer; padding: 2px 0; font: inherit; }
  .dc b { font: 700 14px 'Sora Variable', 'Sora', sans-serif; } .dc small { font: 600 10px 'Geist Mono', monospace; color: #8e99bb; min-height: 12px; }
  .dc.lo small { color: #4ade80; } .dc.hi small { color: #ffc24b; }
  .dc:disabled { opacity: 0.35; cursor: not-allowed; }
  .dc.on { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; box-shadow: 0 10px 24px -10px rgba(124, 108, 255, 0.8); } .dc.on small { color: #06080f; }
  .dc.blank { visibility: hidden; }
  .dc[aria-current='date'] { border-color: rgba(127, 235, 255, 0.6); }
  .mo { width: 44px; height: 44px; } .mo:disabled { opacity: 0.35; cursor: not-allowed; }
  .drumw { display: flex; align-items: center; gap: 10px; flex: none; }
  .drum { position: relative; flex: 1; height: 190px; perspective: 700px; overflow: hidden; border-radius: 22px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); touch-action: none; cursor: grab; user-select: none; }
  .drum:focus-visible { outline: 2px solid #7febff; }
  .drum:before { content: ''; position: absolute; left: 12px; right: 12px; top: 50%; height: 50px; margin-top: -25px; border-radius: 14px; background: linear-gradient(135deg, rgba(139, 124, 255, 0.3), rgba(61, 224, 255, 0.2)); border: 1px solid rgba(139, 124, 255, 0.5); pointer-events: none; z-index: 2; }
  .dr { position: absolute; left: 0; right: 0; top: 50%; height: 0; transform-style: preserve-3d; transition: transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .dr.nt { transition: none; }
  .hr { position: absolute; left: 0; right: 0; top: -22px; height: 44px; display: grid; place-items: center; font: 700 26px 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.03em; backface-visibility: hidden; }
  .mins { display: flex; flex-direction: column; gap: 4px; }
  .mins button { min-width: 60px; min-height: 44px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #b7c0db; font: 700 14px 'Geist Mono', monospace; cursor: pointer; }
  .mins .on { background: #3de0ff; color: #06080f; border-color: transparent; }
  .ud { display: flex; flex-direction: column; gap: 6px; }
  .ud button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; display: grid; place-items: center; }
  .haut { display: grid; transform: rotate(90deg); } .bas { display: grid; transform: rotate(-90deg); }
</style>
