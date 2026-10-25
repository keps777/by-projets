<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { compagnieDe, departEnMs, heureLocale, ligneDe } from '../../domain/actions.ts';
  import { AXES_CARTE, ecarter, NOM_LIGNE, positionBus, TON_LIGNE, VILLES } from '../../core/carte.ts';
  import { estimer, minutesDepuisMinuit } from '../../core/suivi.ts';
  import { fmtF } from '../../core/tarif.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { busEnRoute, lignesReseau } from './reseau.ts';
  import Relief from './Relief.svelte';
  import { horloge } from './temps.svelte.ts';
  import { nav } from './nav.ts';

  const h = horloge(15_000);
  let filtre = $state(''), choisi = $state<string | null>(null), az = $state(0); // '' = toutes les compagnies
  const bus = $derived(busEnRoute(filtre || undefined));
  const lignes = $derived(lignesReseau(filtre || undefined, h.ms));
  const incidents = $derived(lignes.reduce((s, l) => s + l.incidents, 0));
  const compte = (id: string) => busEnRoute(id).length;
  const detail = $derived(bus.find((d) => d.id === choisi));
  const axesPerturbes = $derived(new Set(lignes.filter((l) => l.etat === 'perturbe').flatMap((l) => [`${l.de}|${l.vers}`, `${l.vers}|${l.de}`])));
  const sous = $derived(`${bus.length} bus en route · ${incidents} incident${incidents > 1 ? 's' : ''}`);
  const marqueurs = $derived((() => {
    const bruts = bus.map((d) => { const l = ligneDe(d), p = positionBus(l.de, l.vers, d.avancement, 1); return p ? { d, l, p, c: compagnieDe(d) } : null; }).filter((m) => m !== null);
    const pos = ecarter(bruts.map((m) => m.p));
    return bruts.map((m, i) => ({ ...m, p: pos[i] }));
  })());
  function info(d: (typeof bus)[number]) {
    const l = ligneDe(d), e = estimer(d.heure, l.dureeMin, d.retardMin, minutesDepuisMinuit(h.ms, d.jour));
    return { l, c: compagnieDe(d), pct: Math.round(d.avancement * 100), arrivee: e.arrivee, ms: departEnMs(d) };
  }
</script>

<Mobile titre="Le réseau" sous={sous} retourVers="/" dock={dockVoyageur('voyager')}>
  {#snippet droite()}<span class="pl ok"><span class="dot"></span>live</span>{/snippet}

  <Relief label="Carte du réseau en relief : {bus.length} bus en route. Glisse pour tourner." bind:az hauteur={270} echelle={1.3} incl={52}>
    <svg class="rl-plat" viewBox="0 0 360 240" aria-hidden="true">
      {#each AXES_CARTE as [a, b] (a + b)}
        {@const pert = axesPerturbes.has(`${a}|${b}`)}
        <line x1={VILLES[a].x} y1={VILLES[a].y} x2={VILLES[b].x} y2={VILLES[b].y} stroke={pert ? 'rgba(255,194,75,.75)' : 'rgba(61,224,255,.55)'} stroke-width="3" stroke-linecap="round" stroke-dasharray={pert ? '6 6' : undefined} />
      {/each}
    </svg>
    {#each marqueurs as m (m.d.id)}
      <button type="button" class="mb rl-pied" class:sel={choisi === m.d.id} style="left: {m.p.x}px; top: {m.p.y}px; --c: {m.c.couleur}" aria-label="{m.c.nom}, {m.l.de} vers {m.l.vers}, départ {m.d.heure}, {Math.round(m.d.avancement * 100)} % du trajet" aria-pressed={choisi === m.d.id} onclick={() => (choisi = choisi === m.d.id ? null : m.d.id)}>
        <Icone nom="bus" taille={14} trait={2.4} />
      </button>
    {/each}
    {#each Object.entries(VILLES) as [nom, p] (nom)}
      <span class="nd rl-pied" style="left: {p.x}px; top: {p.y}px"><i></i>{nom}</span>
    {/each}
  </Relief>

  <div class="chips" role="group" aria-label="Filtrer par compagnie">
    <button type="button" class="ch" class:on={filtre === ''} aria-pressed={filtre === ''} onclick={() => { filtre = ''; choisi = null; }}>Toutes</button>
    {#each app.monde.compagnies as c (c.id)}
      <button type="button" class="ch" class:on={filtre === c.id} aria-pressed={filtre === c.id} onclick={() => { filtre = c.id; choisi = null; }}><span class="pt" style="background: {c.couleur}"></span>{c.abrev}<span class="mut3 mono t12">{compte(c.id)}</span></button>
    {/each}
  </div>

  {#if detail}
    {@const i = info(detail)}
    <div class="gl ac col g8" role="status">
      <div class="row sp"><span class="t14 b7">{i.c.nom} · {i.l.de} → {i.l.vers}</span><span class="pl {detail.retardMin > 0 ? 'wa' : 'ok'}">{detail.retardMin > 0 ? `+${detail.retardMin} min` : 'à l’heure'}</span></div>
      <div class="bar" aria-hidden="true"><i style="width: {i.pct}%"></i></div>
      <div class="row sp t12 mut"><span>parti à {heureLocale(i.ms)} · {i.pct} %</span><span>arrivée {i.arrivee}</span></div>
      <a class="b s sm" href="/arret?depart={detail.id}" use:nav>Monter en route sur ce bus</a>
    </div>
  {:else if bus.length === 0}
    <div class="gl row g12"><span class="bub aq"><Icone nom="horloge" taille={20} /></span><span class="col grow"><span class="t14 b7">Aucun bus en route{filtre ? ' pour cette compagnie' : ''}</span><span class="t12 mut">Les bus apparaissent sur la carte dès leur départ.</span></span></div>
  {:else}
    <span class="t12 mut3 c">Touche un bus sur la carte pour le suivre.</span>
  {/if}

  {#if bus.length > 0}
    <details class="gl">
      <summary class="t14 b7 sum">Tous les bus en route ({bus.length})</summary>
      <div class="col">
        {#each bus as d (d.id)}
          {@const i = info(d)}
          <button type="button" class="li lst" aria-pressed={choisi === d.id} onclick={() => (choisi = choisi === d.id ? null : d.id)}>
            <span class="pt" style="background: {i.c.couleur}"></span>
            <span class="col grow"><span class="t13 b7 ell">{i.c.abrev} · {i.l.de} → {i.l.vers}</span><span class="t12 mut">départ {d.heure} · {i.pct} % · arrivée {i.arrivee}</span></span>
            {#if d.retardMin > 0}<span class="pl wa">+{d.retardMin}</span>{/if}
          </button>
        {/each}
      </div>
    </details>
  {/if}

  <div class="gl col" style="gap: 0">
    {#each lignes as l (l.cle)}
      <a class="ln" href="/" use:nav>
        <div class="row sp"><span class="t15 b7">{l.de} → {l.vers}</span><span class="t14 b7">dès {fmtF(l.prixMin)}</span></div>
        <div class="row sp g8"><span class="row g8 wrapf"><span class="pl {TON_LIGNE[l.etat]}"><span class="dot"></span>{NOM_LIGNE[l.etat]}</span><span class="t12 mut">{l.enRoute ? `${l.enRoute} en route · ` : ''}{l.aujourdhui} bus · {l.compagnies.join(' ') || '—'}</span></span><span class="t12 mut3" style="white-space: nowrap">{l.prochain}</span></div>
      </a>
    {:else}
      <div class="ln"><span class="t14 mut">Aucune ligne{filtre ? ' pour cette compagnie' : ''} aujourd’hui.</span></div>
    {/each}
  </div>

  {#if incidents > 0}
    <div class="toast"><span class="bub wac"><Icone nom="alerte" taille={18} /></span><span class="t13 grow">{incidents} départ{incidents > 1 ? 's' : ''} retardé{incidents > 1 ? 's' : ''} ou annulé{incidents > 1 ? 's' : ''} aujourd’hui. Les voyageurs concernés sont prévenus, remboursement automatique en cas d’annulation.</span></div>
  {/if}
</Mobile>

<style>
  .chips { flex: none; }
  .nd { display: flex; flex-direction: column-reverse; align-items: center; gap: 3px; font: 600 10px 'Geist Mono', monospace; color: #b7c0db; pointer-events: none; text-shadow: 0 1px 6px #000; padding-bottom: 2px; }
  .nd i { width: 12px; height: 12px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 12px #3de0ff; }
  .mb { width: 30px; height: 30px; margin-top: -2px; border-radius: 50%; border: 2px solid var(--c, #3de0ff); background: rgba(5, 7, 13, 0.9); color: var(--c, #3de0ff); display: grid; place-items: center; cursor: pointer; padding: 0; }
  .mb.sel { background: var(--c, #3de0ff); color: #06080f; border-color: #fff; }
  .pt { flex: none; width: 8px; height: 8px; border-radius: 50%; }
  .sum { min-height: 44px; display: flex; align-items: center; cursor: pointer; }
  .lst { width: 100%; background: transparent; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .lst[aria-pressed='true'] { background: rgba(61, 224, 255, 0.1); }
  .ln { display: flex; flex-direction: column; gap: 6px; padding: 12px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-decoration: none; color: inherit; min-height: 60px; }
  .ln:last-child { border: 0; }
  .t15 { font-size: 15px; }
</style>
