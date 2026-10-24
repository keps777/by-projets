<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { billetsDuDepart, heureLocale, ligneDe, personneCourante, placesLibres } from '../../domain/actions.ts';
  import { codeAffiche } from '../../core/terrain.ts';
  import { basculerRadar, choisirDepart, compteurABord, departDuQuai, departsDeLaGare, enteteQuai, genererBilletsDemo, motifRefus, passagesDuDepart, scanQuai, scansSimulables } from './actions.ts';
  import { hash, libelleDepart } from './commun.ts';
  import { lireTerrain } from './etat.ts';
  import { dockDuRole } from '../_socle/dockRole.ts';
  import { app } from '../../data/store.svelte.ts';
  import Scanner from './Scanner.svelte';

  const agent = $derived(personneCourante());
  const departs = $derived(departsDeLaGare(agent));
  const depart = $derived(departDuQuai(agent));
  const n = $derived(depart ? compteurABord(depart.id) : 0);
  const vendus = $derived(depart ? billetsDuDepart(depart.id).length : 0);
  const radar = $derived(lireTerrain().quai.radar);
  const passages = $derived(depart ? passagesDuDepart(depart.id) : []);
  const refus = $derived(passages.filter((p) => p.statut !== 'ok'));
  const scanOuvert = $derived(param('scan') === '1');
  let choixOuvert = $state(false);
  const sim = $derived(scanOuvert && depart ? scansSimulables(depart.id) : { valides: [], essais: [] });

  /** Points du radar : montés (vert), attendus (cyan), refus récents (ambre), placés de façon stable autour du centre. */
  const blips = $derived.by(() => {
    if (!depart) return [];
    const bs = billetsDuDepart(depart.id), poser = (id: string, c: string) => { const a = hash(id) % 360, r = 50 + (hash(id + 'r') % 72), rad = (a * Math.PI) / 180; return { id: `${c}-${id}`, c, x: Math.round(130 + r * Math.sin(rad)), y: Math.round(130 - r * Math.cos(rad)), delai: `${((a / 360) * 2.4).toFixed(2)}s` }; };
    return [...bs.filter((b) => b.statut === 'scanne').slice(-8).map((b) => poser(b.id, 'ok')), ...bs.filter((b) => b.statut === 'valide').slice(0, 8).map((b) => poser(b.id, '')), ...refus.slice(0, 3).map((p) => poser(p.id, 'wa'))];
  });

  function fermerScan() { aller('/quai', { remplacer: true }); }
  function surScan(contenu: string, via: 'qr' | 'code' | 'liste') {
    if (!agent || !depart) return;
    const p = scanQuai(contenu, agent.id, depart.id, via);
    try { navigator.vibrate?.(p.statut === 'ok' ? 40 : [80, 40, 80]); } catch { /* sans vibreur */ }
    aller(p.statut === 'ok' ? `/quai/ok?passage=${p.id}` : `/quai/refus?passage=${p.id}`);
  }
  const statutDepart = (s: string) => (s === 'embarquement' ? { t: 'embarquement', c: 'ok' } : s === 'parti' ? { t: 'parti', c: 'inf' } : s === 'arrive' ? { t: 'arrivé', c: '' } : { t: 'prévu', c: 'wa' });
  const pointage = (ts: number) => heureLocale(ts);
  const viaTexte = { qr: 'QR scanné', code: 'code saisi', liste: 'scan simulé' } as const;
  function demo() { if (!agent || !depart) return; const bs = genererBilletsDemo(depart.id, agent.id); montrer(bs.length ? `${bs.length} billets de démonstration créés` : 'Plus de place libre sur ce départ', bs.length ? 'ok' : 'wa'); }
</script>

<svelte:window onkeydown={(e) => (e.key === 'Escape') && (choixOuvert = false)} />
<Mobile titre={depart ? enteteQuai(depart) : 'Quai'} sous={agent ? `${agent.prenom} · ${depart ? (depart.statut === 'embarquement' ? 'embarquement' : depart.statut === 'parti' ? 'bus parti' : 'embarquement pas encore ouvert') : 'aucun départ'}` : ''} sansRetour dock={dockDuRole(app.session.role, { guichet: 'quai', terrain: 'quai' })}>
  {#snippet droite()}{#if depart}<span class="pl ok"><span class="dot"></span>{n} / {depart.capacite}</span>{/if}{/snippet}
  {#if !depart}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="bus" taille={56} /></div><span class="ttl t20">Aucun départ aujourd’hui</span><span class="t14 mut">Il n’y a pas de départ au programme de ta gare pour la journée.</span></div>
  {:else}
    <div class="row sp g8">
      <div class="col grow"><span class="lab">Départ à embarquer</span><span class="t14 b7">{depart.heure}{depart.retardMin > 0 ? ` (+${depart.retardMin} min)` : ''} · {ligneDe(depart).de} → {ligneDe(depart).vers}</span></div>
      <button type="button" class="b s sm" style="flex: none" onclick={() => (choixOuvert = true)}>Changer</button>
    </div>
    <button type="button" class="radar" class:off={!radar} onclick={() => basculerRadar()} aria-pressed={radar} aria-label={radar ? 'Radar actif · touche pour mettre en pause' : 'Radar en pause · touche pour reprendre'}>
      <span class="sweep"></span>
      {#each blips as b (b.id)}<span class="blip {b.c}" style="left: {b.x}px; top: {b.y}px; animation-delay: {b.delai}"></span>{/each}
      <span class="c"><span class="ttl t30">{n}</span><span class="t12 mut">montés</span></span>
    </button>
    <span class="t13 mut c">{radar ? 'Vert : montés · bleu : attendus · ambre : refus. Scanne chaque billet, ou saisis son code.' : 'Radar en pause · scan manuel seulement.'}</span>
    <span class="t13 mut c" aria-live="polite">{vendus} billets vendus · {placesLibres(depart)} places libres</span>
    <div class="row g8">
      <a class="b p grow" href="/quai?scan=1" onclick={(e) => { e.preventDefault(); aller('/quai?scan=1'); }}>Scanner un billet</a>
      <a class="b s grow" href="/cadence/quai" onclick={(e) => { e.preventDefault(); aller('/cadence/quai'); }}>Compter à la main</a>
    </div>
    <div class="row sp"><span class="lab">Derniers passages</span>
      {#if refus.length}<a class="t13 aq" href="/quai/refus?passage={refus[0].id}" onclick={(e) => { e.preventDefault(); aller(`/quai/refus?passage=${refus[0].id}`); }}>{refus.length} refus</a>{/if}</div>
    {#if passages.length}
      <div class="gl col" style="gap: 0">
        {#each passages.slice(0, 6) as p (p.id)}
          {@const b = p.billetId ? billetsDuDepart(p.departId).find((x) => x.id === p.billetId) ?? null : null}
          <a class="sc" href={p.statut === 'ok' ? `/quai/ok?passage=${p.id}` : `/quai/refus?passage=${p.id}`} onclick={(e) => { e.preventDefault(); aller(p.statut === 'ok' ? `/quai/ok?passage=${p.id}` : `/quai/refus?passage=${p.id}`); }}>
            <span class="pl {p.statut === 'ok' ? 'ok' : 'er'}">{p.statut === 'ok' ? 'ok' : 'refus'}</span>
            <span class="col grow"><span class="t14 b7 ell">{p.statut === 'ok' ? (b?.passager.nom || 'Sans nom') : motifRefus(p.statut).replace(/^./, (c) => c.toUpperCase())}{b?.siege ? ` · ${b.siege}` : ''}</span><span class="t12 mut ell">{viaTexte[p.via]} · {pointage(p.ts)}</span></span>
            <span class="mono t12">{codeAffiche(p.code)}</span>
          </a>
        {/each}
      </div>
    {:else}
      <div class="gl col g8 c"><span class="t14 b7">Aucun passage pour l’instant</span><span class="t13 mut">Scanne le premier billet : il apparaîtra ici et sur le radar.</span>
        {#if vendus === 0}<button type="button" class="b s sm" style="align-self: center" onclick={demo}>Créer des billets de démonstration</button>{/if}</div>
    {/if}
  {/if}
</Mobile>

{#if scanOuvert && depart}
  <Scanner onscan={surScan} onfermer={fermerScan} valides={sim.valides} essais={sim.essais} />
{/if}
{#if choixOuvert}
  <div class="voile" role="presentation" onclick={() => (choixOuvert = false)}></div>
  <div class="sheet choix" role="dialog" aria-modal="true" aria-label="Départs de la gare">
    <span class="grab"></span><span class="ttl t18">Départs de la gare</span>
    <div class="col g6 liste">
      {#each departs as d (d.id)}
        {@const s = statutDepart(d.statut)}
        <button type="button" class="bn" class:ac={d.id === depart?.id} onclick={() => { choisirDepart(d.id); choixOuvert = false; }}>
          <span class="col grow"><span class="t14 b7">{libelleDepart(d)}{d.retardMin > 0 ? ` · +${d.retardMin} min` : ''}</span><span class="t12 mut">{billetsDuDepart(d.id).length} billets · {compteurABord(d.id)} montés</span></span><span class="pl {s.c}">{s.t}</span>
        </button>
      {:else}<span class="t14 mut">Aucun départ aujourd’hui.</span>{/each}
    </div>
  </div>
{/if}

<style>
  .radar { position: relative; flex: none; width: 260px; height: 260px; margin: 0 auto; padding: 0; border-radius: 50%; background: radial-gradient(circle, rgba(61, 224, 255, 0.12), rgba(5, 7, 13, 0.2) 70%); border: 1px solid rgba(61, 224, 255, 0.35); overflow: hidden; cursor: pointer; color: inherit; }
  .radar:before, .radar:after { content: ''; position: absolute; border-radius: 50%; border: 1px solid rgba(61, 224, 255, 0.25); }
  .radar:before { inset: 40px; } .radar:after { inset: 85px; }
  .radar:focus-visible { outline: 3px solid #3de0ff; outline-offset: 4px; }
  .sweep { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from 0deg, rgba(61, 224, 255, 0.55), transparent 70deg, transparent); animation: sw 2.4s linear infinite; }
  @keyframes sw { to { transform: rotate(360deg); } }
  .radar.off .sweep { animation: none; opacity: 0.2; }
  .blip { position: absolute; width: 14px; height: 14px; margin: -7px 0 0 -7px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 14px #3de0ff; animation: blip 2.4s linear infinite; }
  .blip.ok { background: #4ade80; box-shadow: 0 0 14px #4ade80; } .blip.wa { background: #ffc24b; box-shadow: 0 0 14px #ffc24b; }
  .radar.off .blip { animation: none; opacity: 0.6; }
  @keyframes blip { 0% { transform: scale(1.7); opacity: 1; } 25% { transform: scale(1); opacity: 1; } 100% { transform: scale(0.9); opacity: 0.5; } }
  .radar .c { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: flex; flex-direction: column; align-items: center; }
  .sc { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-decoration: none; color: inherit; min-height: 48px; }
  .sc:last-child { border: 0; }
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 40; }
  .choix { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); max-height: 80dvh; z-index: 41; margin: 0; }
  .liste { overflow-y: auto; max-height: 56dvh; }
</style>
