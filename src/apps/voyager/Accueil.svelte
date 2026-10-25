<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { jourSemaineCourt, jourCourt } from '../../core/dates.ts';
  import { filtrer, plusProche, trancheDevant, type Genre, type Offre } from '../../core/recherche.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { TAILLES } from '../../core/colis.ts';
  import { TAILLES_COLIS, type TailleColis } from '../../core/prixColis.ts';
  import { duree, indexTranche, parTranche, trier } from '../../core/tranches.ts';
  import { app, aujourdhui, maintenant } from '../../data/store.svelte.ts';
  import { heureLocale, nonLues, personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { ouvrirNotifications } from '../../ui/overlays.svelte.ts';
  import { effacerFiltres, initRecherche } from './etat.ts';
  import { nbReglages } from './filtres.ts';
  import { etiquette, lienArrets, lienConducteur, lienPlace, lienReserverCovoit, nbAnnules, offresDuJour, prixInsecable } from './offres.ts';
  import LigneOffre from './LigneOffre.svelte';
  import Panorama from './Panorama.svelte';
  import EnteteMarque from './EnteteMarque.svelte';
  import BandeauActions from './BandeauActions.svelte';
  import BasculeVue from './BasculeVue.svelte';
  import { lienEnvoiColis, offresColis, phraseColis } from './colisOffres.ts';
  import SelecteurTrajet from './SelecteurTrajet.svelte';
  import FeuilleFiltres from './FeuilleFiltres.svelte';

  const R = initRecherche();
  /** Mode Colis : seuls les départs qui prennent la taille voulue, au prix du colis sur la ligne (le plafond de prix du voyage ne s'y applique pas). */
  const colis = $derived(R.objet === 'colis');
  const departsDuMode = () => (R.objet === 'colis' ? (R.de !== 'Yaoundé' || R.vers !== 'Douala' ? [] : offresColis(offresDuJour(R.jour, R.de, R.vers), R.tailleColis)) : offresDuJour(R.jour, R.de, R.vers));
  const filtresDuMode = () => (R.objet === 'colis' ? { ...R, prixMax: null } : R);
  const base = $derived(departsDuMode());
  const offres = $derived(filtrer(base, filtresDuMode()));
  /** Les relais d'arrivée (Douala) ne servent que Yaoundé → Douala pour l'instant. */
  const colisPossible = $derived(R.de === 'Yaoundé' && R.vers === 'Douala');
  const colonnes = $derived(parTranche(offres).map((t) => ({ ...t, items: trier(t.items, R.tri) })));
  const horsLigne = $derived(app.session.hors_ligne);

  // Au départ : la tranche voulue (calendrier, voix), sinon la première tranche du matin qui a des départs.
  function depart(): { i: number; id: string | null } {
    const cols = parTranche(filtrer(departsDuMode(), filtresDuMode())).map((t) => ({ ...t, items: trier(t.items, R.tri) }));
    const pleines = cols.filter((c) => c.items.length);
    const i = R.heureCible ? indexTranche(R.heureCible) : ((pleines.find((c) => c.index >= 2) ?? pleines[0])?.index ?? 2);
    return { i, id: (R.heureCible ? plusProche(cols[i].items, R.heureCible) : cols[i].items[0])?.id ?? null };
  }
  const d0 = depart();
  let rot = $state(-d0.i * 45);
  let selId = $state<string | null>(d0.id);
  R.heureCible = null; // consommée : l'heure souhaitée n'agit qu'une fois
  let trajetOuvert = $state(false);
  let filtresOuverts = $state(false);
  /** Le trajet (ou le jour) vient d'être appliqué dans la fenêtre : on recentre le panorama sur la tranche voulue. */
  function recentrer() { const d = depart(); rot = -d.i * 45; selId = d.id; } // l'heure souhaitée reste dans la tranche : elle est consommée au prochain montage de l'accueil

  const devant = $derived(trancheDevant(rot));
  const sel = $derived(offres.find((o) => o.id === selId) ?? colonnes[devant].items[0] ?? offres[0] ?? null);
  const selTranche = $derived(sel ? colonnes[indexTranche(sel.heure)] : null);
  const liste = $derived(R.vue === 'liste');
  const nbBus = $derived(base.filter((o) => o.genre === 'bus').length);
  const nbCv = $derived(base.length - nbBus);
  const nbGares = $derived(new Set(base.filter((o) => o.genre === 'bus').map((o) => o.gare)).size);
  const annules = $derived(nbAnnules(R.jour, R.de, R.vers));
  const prenom = $derived(personneCourante()?.prenom ?? '');
  const nbNonLues = $derived(nonLues(personneCourante()?.id));
  const sousSalut = $derived(`${jourSemaineCourt(aujourdhui())} · ${heureLocale(maintenant())}`);
  const quand = $derived(((): string => { const e = (new Date(R.jour + 'T12:00').getTime() - new Date(aujourdhui() + 'T12:00').getTime()) / 86_400_000; return e === 0 ? 'aujourd’hui' : e === 1 ? 'demain' : e === 2 ? 'après-demain' : `le ${jourCourt(R.jour)}`; })());
  const nf = $derived(nbReglages(R));
  const annonce = $derived(`Tranche ${colonnes[devant].h1} – ${colonnes[devant].h2} h : ${colonnes[devant].items.length ? `${colonnes[devant].items.length} départ${colonnes[devant].items.length > 1 ? 's' : ''}, dès ${fmtF(Math.min(...colonnes[devant].items.map((o) => o.prix)))}` : 'aucun départ'}.`);
  const OBJETS: { id: 'personne' | 'colis'; nom: string }[] = [{ id: 'personne', nom: 'Voyage personnel' }, { id: 'colis', nom: 'Colis' }];
  const GENRES: { id: Genre; nom: string }[] = [{ id: 'tout', nom: 'Tout' }, { id: 'bus', nom: 'Bus' }, { id: 'covoit', nom: 'Covoit' }];
  const labelTranche = (c: { h1: string; h2: string }) => `${c.h1} – ${c.h2} h`;
  const go = (e: MouseEvent, href: string) => { e.preventDefault(); aller(href); };
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const resume = $derived(offres.length ? `${pluriel(offres.length, 'départ')} · dès ${fmtF(Math.min(...offres.map((o) => o.prix)))}` : 'aucun départ');

  function versTranche(i: number) { const base0 = -i * 45; rot = base0 + 360 * Math.round((rot - base0) / 360); const it = colonnes[i].items; if (it.length && !it.some((x) => x.id === selId)) selId = it[0].id; }
  function choisirListe(o: Offre) { selId = o.id; }
  const sansFiltres = () => { effacerFiltres(R); R.genre = 'tout'; };
  const sous = (o: Offre) => colis ? phraseColis(o, R.tailleColis, R.vers) : `${o.genre === 'cv' ? `Covoiturage · ${o.cl} · départ ${o.gare}` : `${o.cl} · gare ${o.gare}`} · ${duree(o.dureeMin)} · ${o.complet ? 'complet' : pluriel(o.places, 'place')}`;
</script>

{#snippet entete()}
  <EnteteMarque {prenom} sous={sousSalut} nbDeparts={base.length} nonLues={nbNonLues} pause={trajetOuvert || filtresOuverts} onnotifications={ouvrirNotifications} />
{/snippet}

<Mobile enteteLibre={entete} dock={dockVoyageur('voyager')}>
  <BandeauActions />
  {#if horsLigne}<p class="gl hl t13" role="status" style="padding: 10px 14px">Hors ligne · prix et places de la dernière synchronisation. Réserver demande une connexion.</p>{/if}
  <BasculeVue bind:valeur={R.objet} options={OBJETS} label="Voyage personnel ou colis" />
  <div class="gl hl" style="padding: 10px 12px">
    <div class="row sp">
      <button type="button" class="row g10 grow trajet" aria-haspopup="dialog" onclick={() => (trajetOuvert = true)} aria-label="Changer de trajet : {R.de} vers {R.vers}">
        <span class="bub aq bubv"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11z" /><circle cx="12" cy="10" r="2.2" /></svg></span>
        <span class="col grow"><span class="t15 b7 ell">{R.de} → {R.vers}</span><span class="t12 mut ell">{nbBus} bus · {pluriel(nbCv, 'covoiturage')} · {pluriel(nbGares, 'gare')}</span></span>
      </button>
      <a class="pl ac" href="/calendrier" onclick={(e) => go(e, '/calendrier')} style="text-decoration: none; min-height: 44px" aria-label="Changer la date : {jourSemaineCourt(R.jour)}">{jourSemaineCourt(R.jour)}</a>
    </div>
  </div>
  {#if colis}
    <div class="chips tailles" role="radiogroup" aria-label="Taille du colis">
      {#each TAILLES_COLIS as t (t)}<button type="button" role="radio" aria-checked={R.tailleColis === t} class="ch" class:on={R.tailleColis === t} onclick={() => (R.tailleColis = t as TailleColis)}>{TAILLES[t].nom}</button>{/each}
    </div>
  {/if}
  <div class="row g8">
    <div class="seg3" role="group" aria-label="Type de départ">
      {#each GENRES as g (g.id)}<button type="button" class:on={R.genre === g.id} aria-pressed={R.genre === g.id} onclick={() => (R.genre = g.id)}>{g.nom}</button>{/each}
    </div>
    <button type="button" class="b s sm" aria-haspopup="dialog" onclick={() => (filtresOuverts = true)} style="flex: none">Filtres{nf ? ` · ${nf}` : ''}</button>
  </div>
  <div class="row sp affichage"><span class="t12 mut ell" aria-live="polite">{resume}</span><BasculeVue bind:valeur={R.vue} /></div>

  {#if offres.length === 0}
    <div class="gl vide" role="status">
      <span class="ttl t16">{colis && !colisPossible ? 'Colis : Yaoundé → Douala seulement' : base.length ? 'Aucun départ avec ces réglages' : `Aucun départ ${colis ? `pour un colis ${R.tailleColis} ` : ''}${R.de} → ${R.vers} ${quand}`}</span>
      <span class="t13 mut">{colis && !colisPossible ? 'Les points relais d’arrivée sont à Douala : choisis Yaoundé → Douala pour envoyer un colis.' : base.length ? `${pluriel(base.length, 'départ')} existent ${quand} : élargis le type, le prix ou les horaires.` : annules ? `${pluriel(annules, 'départ')} annulé${annules > 1 ? 's' : ''} ce jour-là. Essaie un autre jour ou une autre ville.` : 'Rien n’est ouvert à la vente ce jour-là. Essaie un autre jour ou une autre ville.'}</span>
      <div class="row g8 wrapf">
        {#if base.length}<button type="button" class="b p sm" onclick={sansFiltres}>Effacer les réglages</button>{/if}
        <a class="b s sm" href="/calendrier" onclick={(e) => go(e, '/calendrier')}>Changer de jour</a>
        <button type="button" class="b s sm" aria-haspopup="dialog" onclick={() => (trajetOuvert = true)}>Autre destination</button>
      </div>
    </div>
  {:else if !liste}
    <Panorama {colonnes} bind:rot bind:selId genre={R.genre} {horsLigne} colis={colis ? R.tailleColis : null} onliste={() => (R.vue = 'liste')} />
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
        <div class="col grow"><span class="lab">Ton choix · {labelTranche(selTranche)}</span><span class="ttl t18 ell">{sel.heure} · {sel.co}</span><span class="t13 mut" class:ell={!colis}>{sous(sel)}</span></div>
        <div class="col" style="align-items: flex-end"><span class="ttl t24 aq">{fmtF(sel.prix)}</span>{#if sel.prix !== sel.prixBase}<span class="t12 mut3">{sel.prix < sel.prixBase ? 'prix bas du jour' : 'forte demande'} · base {fmtF(sel.prixBase)}</span>{/if}</div>
      </div>
      {#if sel.retardMin > 0}<span class="pl wa">Retard annoncé · +{sel.retardMin} min</span>{/if}
      {#if colis}
        <div class="row g8">
          {#if sel.genre === 'bus'}<a class="b s sm" href={lienArrets(sel)} onclick={(e) => go(e, lienArrets(sel))} style="flex: none">Arrêts</a>{/if}
          {#if horsLigne}<button type="button" class="b p" disabled>Hors ligne</button>
          {:else}<a class="b p" href={lienEnvoiColis(sel, R.tailleColis)} onclick={(e) => go(e, lienEnvoiColis(sel, R.tailleColis))}>Envoyer un colis · {prixInsecable(sel.prix)}</a>{/if}
        </div>
      {:else if sel.genre === 'bus'}
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
</Mobile>
<SelecteurTrajet bind:ouvert={trajetOuvert} onappliquer={recentrer} />
<FeuilleFiltres bind:ouvert={filtresOuverts} />

<style>
  :global(.bd) > * { flex: none; }
  .seg3 { display: flex; padding: 4px; border-radius: 18px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); gap: 3px; flex: 1; }
  .seg3 button { flex: 1; min-height: 44px; padding: 0 6px; border: 0; border-radius: 14px; background: transparent; color: #b7c0db; font: 700 13px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; white-space: nowrap; }
  .seg3 .on { background: rgba(255, 255, 255, 0.16); color: #f2f4ff; }
  .trajet { background: none; border: 0; padding: 0; font: inherit; color: inherit; text-align: left; cursor: pointer; min-height: 44px; }
  .trajet:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; border-radius: 12px; }
  .affichage { margin-top: -2px; }
  .tailles .ch { flex: 1; justify-content: center; white-space: nowrap; padding: 0 8px; font-size: 13px; }
  .affichage :global(.bv) { width: 176px; }
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
  @media (max-width: 359px) { .bubv { display: none; } }
  .g10 { gap: 10px; } .t15 { font-size: 15px; }
</style>
