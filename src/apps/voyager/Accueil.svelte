<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { jourSemaineCourt, jourCourt } from '../../core/dates.ts';
  import { filtrer, nbFiltres, plusProche, TRIS, trancheDevant, type Genre, type Offre } from '../../core/recherche.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { duree, indexTranche, parTranche, trier } from '../../core/tranches.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { effacerFiltres, initRecherche } from './etat.ts';
  import { etiquette, lienArrets, lienConducteur, lienPlace, lienReserverCovoit, nbAnnules, offresDuJour, prixInsecable } from './offres.ts';
  import LigneOffre from './LigneOffre.svelte';
  import Panorama from './Panorama.svelte';

  const R = initRecherche();
  const base = $derived(offresDuJour(R.jour, R.de, R.vers));
  const offres = $derived(filtrer(base, R));
  const colonnes = $derived(parTranche(offres).map((t) => ({ ...t, items: trier(t.items, R.tri) })));
  const horsLigne = $derived(app.session.hors_ligne);

  // Au départ : la tranche voulue (calendrier, voix), sinon la première tranche du matin qui a des départs.
  function depart(): { i: number; id: string | null } {
    const cols = parTranche(filtrer(offresDuJour(R.jour, R.de, R.vers), R)).map((t) => ({ ...t, items: trier(t.items, R.tri) }));
    const pleines = cols.filter((c) => c.items.length);
    const i = R.heureCible ? indexTranche(R.heureCible) : ((pleines.find((c) => c.index >= 2) ?? pleines[0])?.index ?? 2);
    return { i, id: (R.heureCible ? plusProche(cols[i].items, R.heureCible) : cols[i].items[0])?.id ?? null };
  }
  const d0 = depart();
  let rot = $state(-d0.i * 45);
  let selId = $state<string | null>(d0.id);
  R.heureCible = null; // consommée : l'heure souhaitée n'agit qu'une fois

  const devant = $derived(trancheDevant(rot));
  const sel = $derived(offres.find((o) => o.id === selId) ?? colonnes[devant].items[0] ?? offres[0] ?? null);
  const selTranche = $derived(sel ? colonnes[indexTranche(sel.heure)] : null);
  const liste = $derived(R.vue === 'liste');
  const nbBus = $derived(base.filter((o) => o.genre === 'bus').length);
  const nbCv = $derived(base.length - nbBus);
  const nbGares = $derived(new Set(base.filter((o) => o.genre === 'bus').map((o) => o.gare)).size);
  const annules = $derived(nbAnnules(R.jour, R.de, R.vers));
  const prenom = $derived(personneCourante()?.prenom ?? '');
  const quand = $derived(((): string => { const e = (new Date(R.jour + 'T12:00').getTime() - new Date(aujourdhui() + 'T12:00').getTime()) / 86_400_000; return e === 0 ? 'aujourd’hui' : e === 1 ? 'demain' : e === 2 ? 'après-demain' : `le ${jourCourt(R.jour)}`; })());
  const nf = $derived(nbFiltres(R));
  const annonce = $derived(`Tranche ${colonnes[devant].h1} – ${colonnes[devant].h2} h : ${colonnes[devant].items.length ? `${colonnes[devant].items.length} départ${colonnes[devant].items.length > 1 ? 's' : ''}, dès ${fmtF(Math.min(...colonnes[devant].items.map((o) => o.prix)))}` : 'aucun départ'}.`);
  const GENRES: { id: Genre; nom: string }[] = [{ id: 'tout', nom: 'Tout' }, { id: 'bus', nom: 'Bus' }, { id: 'covoit', nom: 'Covoit' }];
  const labelTranche = (c: { h1: string; h2: string }) => `${c.h1} – ${c.h2} h`;
  const go = (e: MouseEvent, href: string) => { e.preventDefault(); aller(href); };
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;

  function versTranche(i: number) { const base0 = -i * 45; rot = base0 + 360 * Math.round((rot - base0) / 360); const it = colonnes[i].items; if (it.length && !it.some((x) => x.id === selId)) selId = it[0].id; }
  function choisirListe(o: Offre) { selId = o.id; }
  const sansFiltres = () => { effacerFiltres(R); R.genre = 'tout'; };
  const sous = (o: Offre) => `${o.genre === 'cv' ? `Covoiturage · ${o.cl} · départ ${o.gare}` : `${o.cl} · gare ${o.gare}`} · ${duree(o.dureeMin)} · ${o.complet ? 'complet' : pluriel(o.places, 'place')}`;
</script>

{#snippet entete()}
  <header class="hd">
    <div class="row g10" style="min-width: 0">
      <svg width="38" height="38" viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" rx="22" fill="#0A0E1C" /><circle cx="36" cy="36" r="22" fill="none" stroke="#8B7CFF" stroke-width="3" stroke-dasharray="6 5" /><path d="M36 20 L48 50 L41 50 L36 36 L31 50 L24 50 Z" fill="#3DE0FF" /><circle cx="55" cy="22" r="4" fill="#FF5BDE" /></svg>
      <div class="col"><span class="ttl t16">AfriMove</span><span class="t13 mut ell">Salut {prenom}</span></div>
    </div>
    <span class="pl ok" style="flex: none"><span class="dot"></span>{base.length} départ{base.length > 1 ? 's' : ''}<span class="long">&nbsp;{quand}</span></span>
  </header>
{/snippet}

<Mobile enteteLibre={entete} dock={dockVoyageur('voyager')}>
  {#if horsLigne}<p class="gl hl t13" role="status" style="padding: 10px 14px">Hors ligne · prix et places de la dernière synchronisation. Réserver demande une connexion.</p>{/if}
  <div class="gl hl" style="padding: 10px 12px">
    <div class="row sp">
      <a class="row g10 grow" href="/destination" onclick={(e) => go(e, '/destination')} style="text-decoration: none; color: inherit; min-height: 44px" aria-label="Changer de destination : {R.de} vers {R.vers}">
        <span class="bub aq bubv"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg></span>
        <span class="col grow"><span class="t15 b7 ell">{R.de} → {R.vers}</span><span class="t12 mut ell">{nbBus} bus · {pluriel(nbCv, 'covoiturage')} · {pluriel(nbGares, 'gare')}</span></span>
      </a>
      <a class="pl ac" href="/calendrier" onclick={(e) => go(e, '/calendrier')} style="text-decoration: none; min-height: 44px" aria-label="Changer la date : {jourSemaineCourt(R.jour)}">{jourSemaineCourt(R.jour)}</a>
    </div>
  </div>
  <div class="row g8">
    <div class="seg3" role="group" aria-label="Type de départ">
      {#each GENRES as g (g.id)}<button type="button" class:on={R.genre === g.id} aria-pressed={R.genre === g.id} onclick={() => (R.genre = g.id)}>{g.nom}</button>{/each}
    </div>
    <a class="b s sm" href="/filtres" onclick={(e) => go(e, '/filtres')} style="flex: none">Filtres{nf ? ` · ${nf}` : ''}</a>
  </div>
  <div class="chips" role="group" aria-label="Trier dans une tranche et changer d’affichage">
    {#each TRIS as t (t.id)}<button type="button" class="sortc" class:on={R.tri === t.id} aria-pressed={R.tri === t.id} onclick={() => (R.tri = t.id)}>{t.nom}</button>{/each}
    <button type="button" class="sortc vw" class:on={liste} aria-pressed={liste} onclick={() => (R.vue = liste ? '3d' : 'liste')}>{liste ? '3D' : 'Liste'}</button>
  </div>

  {#if offres.length === 0}
    <div class="gl vide" role="status">
      <span class="ttl t16">{base.length ? 'Aucun départ avec ces réglages' : `Aucun départ ${R.de} → ${R.vers} ${quand}`}</span>
      <span class="t13 mut">{base.length ? `${pluriel(base.length, 'départ')} existent ${quand} : élargis le type, le prix ou les horaires.` : annules ? `${pluriel(annules, 'départ')} annulé${annules > 1 ? 's' : ''} ce jour-là. Essaie un autre jour ou une autre ville.` : 'Rien n’est ouvert à la vente ce jour-là. Essaie un autre jour ou une autre ville.'}</span>
      <div class="row g8 wrapf">
        {#if base.length}<button type="button" class="b p sm" onclick={sansFiltres}>Effacer les réglages</button>{/if}
        <a class="b s sm" href="/calendrier" onclick={(e) => go(e, '/calendrier')}>Changer de jour</a>
        <a class="b s sm" href="/destination" onclick={(e) => go(e, '/destination')}>Autre destination</a>
      </div>
    </div>
  {:else if !liste}
    <Panorama {colonnes} bind:rot bind:selId genre={R.genre} {horsLigne} onliste={() => (R.vue = 'liste')} />
    <div class="ribbon" role="group" aria-label="Tranches de 3 heures">
      {#each colonnes as c (c.index)}
        <button type="button" class="tick" class:on={c.index === devant} aria-current={c.index === devant ? 'true' : undefined} onclick={() => versTranche(c.index)}
          aria-label="{labelTranche(c)}, {c.items.length > 1 ? `${c.items.length} départs` : `${c.items.length} départ`}"><b>{c.items.length || '·'}</b><i></i>{c.h1.replace(/^0/, '')}h</button>
      {/each}
    </div>
  {:else}
    <div class="col lst" style="gap: 6px">
      {#each colonnes.filter((c) => c.items.length) as c (c.index)}
        <div class="lh"><span>{labelTranche(c)}</span><span>{pluriel(c.items.length, 'départ')} · dès {fmtF(Math.min(...c.items.map((o) => o.prix)))}</span></div>
        {#each c.items as o (o.id)}<LigneOffre {o} actif={o.id === sel?.id} etiquette={etiquette(o, c.items)} onclick={() => choisirListe(o)} />{/each}
      {/each}
    </div>
  {/if}
  <p class="sr" role="status" aria-live="polite">{liste || !offres.length ? '' : annonce}</p>

  {#if sel && selTranche}
    <div class="sel" class:cv={sel.genre === 'cv'} class:colle={liste} aria-live="polite">
      <div class="row sp">
        <div class="col grow"><span class="lab">Ton choix · {labelTranche(selTranche)}</span><span class="ttl t18 ell">{sel.heure} · {sel.co}</span><span class="t13 mut ell">{sous(sel)}</span></div>
        <div class="col" style="align-items: flex-end"><span class="ttl t24 aq">{fmtF(sel.prix)}</span>{#if sel.prix !== sel.prixBase}<span class="t12 mut3">{sel.prix < sel.prixBase ? 'prix bas du jour' : 'forte demande'} · base {fmtF(sel.prixBase)}</span>{/if}</div>
      </div>
      {#if sel.retardMin > 0}<span class="pl wa">Retard annoncé · +{sel.retardMin} min</span>{/if}
      {#if sel.genre === 'bus'}
        <div class="row g8">
          <a class="b s sm" href={lienArrets(sel)} onclick={(e) => go(e, lienArrets(sel))} style="flex: none">Arrêts</a>
          {#if sel.complet}<button type="button" class="b p" disabled>Complet</button>
          {:else if horsLigne}<button type="button" class="b p" disabled>Hors ligne</button>
          {:else}<a class="b p" href={lienPlace(sel)} onclick={(e) => go(e, lienPlace(sel))}>Choisir ma place · {prixInsecable(sel.prix)}</a>{/if}
        </div>
      {:else}
        <div class="row g8">
          <a class="b s sm" href={lienConducteur(sel)} onclick={(e) => go(e, lienConducteur(sel))} style="flex: none">Conducteur</a>
          {#if sel.complet}<button type="button" class="b p" disabled>Complet</button>
          {:else if horsLigne}<button type="button" class="b p" disabled>Hors ligne</button>
          {:else}<a class="b p" href={lienReserverCovoit(sel)} onclick={(e) => go(e, lienReserverCovoit(sel))}>Réserver · {prixInsecable(sel.prix)}</a>{/if}
        </div>
      {/if}
    </div>
  {/if}
  <div class="chips">
    <a class="b s sm" href="/voix" onclick={(e) => go(e, '/voix')}>Dire où je vais</a>
    <a class="b s sm" href="/ville" onclick={(e) => go(e, '/ville')}>En ville</a>
    <a class="b s sm" href="/covoit/conduire" onclick={(e) => go(e, '/covoit/conduire')}>Je conduis</a>
    <a class="b s sm" href="/reseau" onclick={(e) => go(e, '/reseau')}>Réseau</a>
  </div>
</Mobile>

<style>
  :global(.bd) > * { flex: none; }
  .seg3 { display: flex; padding: 4px; border-radius: 18px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); gap: 3px; flex: 1; }
  .seg3 button { flex: 1; min-height: 44px; padding: 0 6px; border: 0; border-radius: 14px; background: transparent; color: #b7c0db; font: 700 13px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; white-space: nowrap; }
  .seg3 .on { background: rgba(255, 255, 255, 0.16); color: #f2f4ff; }
  .sortc { flex: none; min-height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #b7c0db; font: 600 13px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; white-space: nowrap; }
  .sortc.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.35), rgba(61, 224, 255, 0.25)); border-color: #8b7cff; color: #f2f4ff; }
  .sortc.vw { margin-left: auto; border-style: dashed; }
  .ribbon { display: flex; justify-content: space-between; align-items: flex-end; padding: 0 2px; position: relative; }
  .ribbon:before { content: ''; position: absolute; left: 12px; right: 12px; bottom: 19px; height: 2px; background: linear-gradient(90deg, rgba(255, 255, 255, 0.08), rgba(61, 224, 255, 0.5), rgba(255, 255, 255, 0.08)); }
  .tick { display: flex; flex-direction: column; align-items: center; gap: 5px; font: 600 11px 'Geist Mono', monospace; color: #a1accb; border: 0; background: transparent; cursor: pointer; padding: 0; flex: 1 1 0; min-width: 0; max-width: 46px; min-height: 44px; justify-content: flex-end; position: relative; }
  .tick b { font: 700 10px 'Geist Mono', monospace; color: #a1accb; }
  .tick.on b { color: #7febff; }
  .tick i { width: 10px; height: 10px; border-radius: 50%; background: rgba(255, 255, 255, 0.25); border: 2px solid transparent; }
  .tick.on { color: #7febff; }
  .tick.on i { background: #3de0ff; box-shadow: 0 0 14px #3de0ff; width: 14px; height: 14px; }
  .lh { font: 600 12px 'Geist Mono', monospace; letter-spacing: 0.1em; color: #a1accb; padding: 10px 2px 2px; display: flex; justify-content: space-between; gap: 8px; }
  .sel { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-radius: 22px; background: rgba(10, 14, 28, 0.9); border: 1px solid rgba(139, 124, 255, 0.45); }
  .sel.cv { border-color: rgba(255, 91, 222, 0.55); }
  .sel.colle { position: sticky; bottom: -14px; z-index: 5; backdrop-filter: blur(14px); }
  .sel .b.p { font-size: 15px; padding: 0 10px; }
  .sel .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .vide { display: flex; flex-direction: column; gap: 10px; padding: 20px 16px; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  @media (max-width: 359px) { .long, .bubv { display: none; } }
  .g10 { gap: 10px; } .t15 { font-size: 15px; }
</style>
