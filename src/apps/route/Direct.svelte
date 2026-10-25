<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { annoncerRetard, compagnieDe, departEnMs, gare, departParId, heureLocale, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { distanceKm, prochainArret, quaiDe } from '../../core/arrets.ts';
  import { hhmm, minutes } from '../../core/retard.ts';
  import { pointSurRoute, TRACE_ROUTE } from '../../core/carte.ts';
  import { delai, estimer, minutesDepuisMinuit, phaseTrajet, vitesseKmh } from '../../core/suivi.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { arretsDuDepart, billetASuivre, leverRetard } from './actions.ts';
  import SelecteurBillet from '../reglement/SelecteurBillet.svelte';
  import { billetChoisi, billetsEnCours, itemsDe, memoriserBillet } from '../reglement/selection.ts';
  import CourseContenu from './CourseContenu.svelte';
  import PartageContenu from '../reglement/PartageContenu.svelte';
  import LitigeContenu from '../entree/LitigeContenu.svelte';
  import Relief from './Relief.svelte';
  import { horloge } from './temps.svelte.ts';
  import { nav } from './nav.ts';

  /** `enFeuille` : le contenu s'affiche dans la grande fenêtre ouverte depuis « Billets » (sans page, sans dock, sans fenêtres imbriquées). */
  let { enFeuille = false, billetId }: { enFeuille?: boolean; billetId?: string } = $props();
  const h = horloge(10_000);
  let decalage = $state(0), az = $state(0); // minutes de simulation « Simuler l’avance »
  const moi = $derived(personneCourante());
  /** Le bus suivi : celui choisi dans le sélecteur « Ton bus » (le même que sur la page Billets), sinon le prochain billet à suivre. */
  const enCours = $derived(moi ? billetsEnCours(moi.id) : []);
  const billet = $derived((moi ? billetChoisi(moi.id, billetId ?? param('billet')) : undefined) ?? (moi ? billetASuivre(moi.id, h.ms) : undefined));
  const items = $derived(moi ? itemsDe(billet && !enCours.includes(billet) ? [billet, ...enCours] : enCours, moi.id) : []);
  $effect(() => { const id = billetId ?? param('billet'); if (id && enCours.some((b) => b.id === id)) memoriserBillet(id); });
  function choisirDansMenu(id: string) { memoriserBillet(id); decalage = 0; if (!enFeuille && param('billet')) aller(`/direct?billet=${id}`, { remplacer: true }); }
  let fenetre = $state<'' | 'course' | 'partage' | 'probleme'>('');
  const ouverte = (f: typeof fenetre) => fenetre === f, ferme = (f: typeof fenetre) => (v: boolean) => { if (!v && fenetre === f) fenetre = ''; };
  const fermer = () => (fenetre = '');
  const d = $derived(billet ? departParId(billet.departId) : undefined);
  const ligne = $derived(d ? ligneDe(d) : undefined);
  const maint = $derived(h.ms + decalage * 60_000);
  const arrets = $derived(d ? arretsDuDepart(d) : []);
  const nowMin = $derived(d ? minutesDepuisMinuit(maint, d.jour) : 0);
  const est = $derived(d && ligne ? estimer(d.heure, ligne.dureeMin, d.retardMin, nowMin) : undefined);
  const minAvant = $derived(d ? Math.round((departEnMs(d) - maint) / 60_000) : 0);
  const phase = $derived(est ? phaseTrajet(minAvant, est) : 'avant');
  const avancement = $derived(phase === 'arrive' ? 1 : phase !== 'route' ? 0 : decalage === 0 && d ? d.avancement : (est?.avancement ?? 0));
  const bus = $derived(pointSurRoute(avancement));
  const prochain = $derived(prochainArret(arrets, nowMin));
  const km = $derived(ligne ? distanceKm(ligne.de, ligne.vers) : 0);
  const vitesse = $derived(ligne ? vitesseKmh(phase, avancement, km, ligne.dureeMin) : 0);
  const curIdx = $derived(arrets.findIndex((a) => a.min > nowMin));
  const prevu = $derived(d && ligne ? hhmm(minutes(d.heure) + ligne.dureeMin) : '');
  const sousVitesse = $derived(phase === 'route' ? (prochain && prochain.arret.type === 'etape' ? `km/h · ${prochain.arret.nom} dans ${delai(prochain.dansMin)}` : `km/h · arrivée dans ${delai(est?.resteMin ?? 0)}`) : phase === 'arrive' ? 'km/h · à l’arrêt' : phase === 'embarquement' ? 'km/h · embarquement en cours' : `km/h · départ dans ${delai(minAvant)}`);
  const sousArrivee = $derived(phase === 'arrive' ? 'arrivé · bon séjour !' : d && d.retardMin > 0 ? `prévu ${prevu} · retard +${d.retardMin} min` : `prévu ${prevu} · à l’heure`);
  const pos = $derived(`Le bus a fait ${Math.round(avancement * 100)} % du trajet.`);

  function avancer() {
    if (!d) return;
    const suite = arrets.find((a) => a.min > nowMin);
    if (suite) decalage += suite.min - nowMin; else decalage = 0;
  }
  function annoncer() { if (d && moi) { annoncerRetard(d.id, 45, moi.id); montrer('Retard de 45 min annoncé'); } }
  function lever() { if (d && moi) { leverRetard(d.id, moi.id); montrer('Le bus repart à l’heure'); } }
</script>

{#snippet corps()}
  {#if !billet || !d || !ligne || !est}
    <div class="center">
      <div class="ill" aria-hidden="true"><Icone nom="direct" taille={64} trait={1.6} /></div>
      <span class="ttl t20">Aucun bus à suivre</span>
      <span class="t14 mut">Dès que tu as un billet valide, ton bus apparaît ici en direct : position, arrivée estimée, retards.</span>
    </div>
    <a class="b p" href="/" use:nav>Voir les départs</a>
    <a class="b s" href="/reseau" use:nav>Voir tout le réseau en direct</a>
  {:else}
    {#if items.length}<SelecteurBillet {items} valeur={billet.id} onchoisir={choisirDansMenu} etiquette="Bus suivi" id="sel-direct" />{/if}
    <Relief label="Carte en relief : le bus avance. {pos}" bind:az hauteur={270} echelle={0.95}>
      <div class="rl-colline" style="left: 20px; top: 20px; width: 150px; height: 90px"></div>
      <div class="rl-colline" style="left: 190px; top: 110px; width: 170px; height: 100px"></div>
      <svg class="rl-plat" viewBox="0 0 360 240" aria-hidden="true">
        <path d={TRACE_ROUTE} fill="none" stroke="rgba(255,255,255,.16)" stroke-width="10" stroke-linecap="round" />
        <path d={TRACE_ROUTE} fill="none" stroke="#3DE0FF" stroke-width="4" stroke-linecap="round" pathLength="100" stroke-dasharray="{avancement * 100} 200" />
        {#each arrets as a (a.id)}{@const p = pointSurRoute(a.fraction)}<circle cx={p.x} cy={p.y} r="4.5" fill={a.min <= nowMin ? '#4ADE80' : '#05070D'} stroke={a.min <= nowMin ? '#4ADE80' : 'rgba(255,255,255,.55)'} stroke-width="2.5" />{/each}
      </svg>
      <span class="tag rl-pied" style="left: 90px; top: 226px">{ligne.de} · {arrets[0].nom.split(' · ')[1]}</span>
      <span class="tag rl-pied" style="left: 292px; top: 22px">{ligne.vers} · {arrets[arrets.length - 1].nom.split(' · ')[1]}</span>
      <div class="bus rl-pied" style="left: {bus.x}px; top: {bus.y}px" role="img" aria-label="Position du bus"><span class="orb"><Icone nom="bus" taille={26} trait={2.2} /></span></div>
    </Relief>
    <span class="sr" role="status">{pos}</span>

    {#if d.retardMin > 0}
      <a class="gl alerte row g12" href="/direct/retard" use:nav>
        <span class="bub wac"><Icone nom="alerte" taille={20} /></span>
        <span class="col grow"><span class="t14 b7">Retard annoncé : +{d.retardMin} min</span><span class="t12 mut">Nouveau départ {heureLocale(departEnMs(d))} · voir mes options</span></span>
        <Icone nom="suivant" taille={18} />
      </a>
    {/if}

    <div class="row g8">
      <div class="gl ac grow col g4"><span class="lab">Arrivée estimée</span><span class="big" class:wac={d.retardMin > 0}>{est.arrivee}</span><span class="t12 mut">{sousArrivee}</span></div>
      <div class="gl grow col g4" style="flex: 0.8"><span class="lab">Vitesse</span><span class="ttl t24">{vitesse}</span><span class="t12 mut">{sousVitesse}</span></div>
    </div>
    <div class="row g8">
      <div class="gl grow kp"><span class="k">Quai</span><span class="v">{quaiDe(d.id)}</span></div>
      <div class="gl grow kp"><span class="k">Siège</span><span class="v">{billet.siege ?? 'libre'}</span></div>
      <div class="gl grow kp" style="flex: 1.7"><span class="k">Billet</span><span class="v mono" style="font-size: 13px; line-height: 1.9">{billet.code}</span></div>
    </div>
    {#if decalage > 0}
      <div class="toast" role="status"><span class="t13 grow">Simulation : +{delai(decalage)} par rapport à maintenant.</span><button type="button" class="b g sm" onclick={() => (decalage = 0)}>Revenir au direct</button></div>
    {/if}
    <div class="row g8 wrapf">
      <button type="button" class="b s sm grow" onclick={avancer}>Simuler l’avance</button>
      <a class="b s sm grow" href="/direct/ilot" use:nav>Voir l’îlot</a>
      {#if !enFeuille}<button type="button" class="b s sm grow" aria-haspopup="dialog" onclick={() => (fenetre = 'partage')}>Partager</button>{/if}
    </div>
    {#if !enFeuille}<button type="button" class="b s" aria-haspopup="dialog" onclick={() => (fenetre = 'course')}><Icone nom="moto" taille={20} />Moto-taxi vers la gare</button>{/if}

    <span class="lab">Étapes</span>
    <div class="gl">
      <ol class="tl">
        {#each arrets as a, i (a.id)}
          <li class="st" class:ok={curIdx === -1 || i < curIdx} class:cur={i === curIdx} aria-current={i === curIdx ? 'step' : undefined}><span>{a.nom}</span><span class="mono t13">{a.heure}</span></li>
        {/each}
      </ol>
    </div>

    <div class="gl demo col g8">
      <span class="lab">Démonstration</span>
      <span class="t13 mut">Fais vivre le monde simulé : la compagnie annonce un retard, tous les voyageurs du départ sont prévenus.</span>
      {#if d.retardMin > 0}<button type="button" class="b s sm" onclick={lever}>Retirer le retard</button>
      {:else}<button type="button" class="b s sm" onclick={annoncer} disabled={phase === 'arrive'}>Annoncer un retard de 45 min</button>{/if}
    </div>
    {#if !enFeuille}<button type="button" class="b g" aria-haspopup="dialog" onclick={() => (fenetre = 'probleme')}>Un souci à bord ? Signaler</button>{/if}
  {/if}
{/snippet}

{#if enFeuille}
  <div class="col g12 direct-feuille">{@render corps()}</div>
{:else}
<Mobile titre="Ton bus" sous={ligne && d ? `${compagnieDe(d).nom} · ${ligne.de} → ${ligne.vers}` : 'Suivi en direct'} sansRetour dock={dockVoyageur('billets')}>
  {#snippet droite()}
    {#if d && d.retardMin > 0}<a class="pl wa" href="/direct/retard" use:nav><span class="dot"></span>+{d.retardMin} min</a>
    {:else if d}<span class="pl ok"><span class="dot"></span>à l’heure</span>{/if}
  {/snippet}
  {@render corps()}
</Mobile>
{/if}

{#if !enFeuille}
<Feuille bind:ouvert={() => ouverte('course'), ferme('course')} titre="Moto-taxi vers la gare" sous={d && ligne ? `Vers la gare de ${gare(ligne.gareDe)?.nom ?? ''} · bus de ${d.heure}` : 'Moto ou taxi, au choix'} hauteur="haute"><CourseContenu departId={d?.id} onfermer={fermer} /></Feuille>
<Feuille bind:ouvert={() => ouverte('partage'), ferme('partage')} titre="Partager mon billet" sous="Le code part, le billet reste à son nom" hauteur="haute">{#if billet}<PartageContenu billetId={billet.id} onfermer={fermer} />{/if}</Feuille>
<Feuille bind:ouvert={() => ouverte('probleme'), ferme('probleme')} titre="Signaler un problème" sous="Réponse sous 2 h" hauteur="haute"><LitigeContenu billetId={billet?.id} onfermer={fermer} /></Feuille>
{/if}

<style>
  .tag { padding: 4px 8px; border-radius: 999px; background: rgba(5, 7, 13, 0.85); border: 1px solid rgba(255, 255, 255, 0.2); font: 600 11px 'Geist Mono', monospace; white-space: nowrap; margin-top: -6px; }
  .bus { width: 90px; height: 90px; display: grid; place-items: center; margin-top: 18px; }
  .orb { width: 54px; height: 54px; border-radius: 50%; display: grid; place-items: center; color: #06080f; background: conic-gradient(from 200deg, #8b7cff, #3de0ff, #ff5bde, #8b7cff); box-shadow: 0 0 0 8px rgba(61, 224, 255, 0.15), 0 14px 22px -10px rgba(61, 224, 255, 0.8); }
  .bus::after { content: ''; position: absolute; inset: 14px; border-radius: 50%; border: 2px solid rgba(61, 224, 255, 0.5); animation: ping 1.8s infinite; }
  @keyframes ping { to { transform: scale(1.5); opacity: 0; } }
  .alerte { border-color: rgba(255, 194, 75, 0.5); text-decoration: none; color: inherit; min-height: 64px; }
  .tl { list-style: none; position: relative; padding-left: 26px; display: flex; flex-direction: column; }
  .tl::before { content: ''; position: absolute; left: 9px; top: 10px; bottom: 10px; width: 2px; background: rgba(255, 255, 255, 0.12); }
  .st { position: relative; display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 44px; color: #b7c0db; }
  .st::before { content: ''; position: absolute; left: -22px; top: 50%; width: 12px; height: 12px; margin-top: -6px; border-radius: 50%; background: rgba(255, 255, 255, 0.2); border: 2px solid #05070d; }
  .st.ok { color: #a1accb; } .st.ok::before { background: #4ade80; }
  .st.cur { color: #f2f4ff; font-weight: 700; } .st.cur::before { background: #3de0ff; box-shadow: 0 0 14px #3de0ff; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
