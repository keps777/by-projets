<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { minutesDuJour } from '../../data/horloge.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { personne } from '../../domain/actions.ts';
  import { motosAutour, optionsVille, QUARTIER_PAR_DEFAUT, QUARTIERS, type ModeVille } from '../../core/ville.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { initRecherche } from './etat.ts';

  /** Trajets dans la ville de départ : du quartier choisi jusqu'à la gare du bus (moto, taxi, covoiturage urbain, bus urbain). */
  const heureMaintenant = () => { const m = minutesDuJour(); return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`; };
  const R = initRecherche();
  const ville = $derived(R.de), quartiers = $derived(QUARTIERS[ville] ?? {});
  let choix = $state<string | null>(null);
  const quartier = $derived(choix && quartiers[choix] ? choix : (QUARTIER_PAR_DEFAUT[ville] ?? Object.keys(quartiers)[0] ?? ''));
  const gares = $derived(Object.keys(quartiers[quartier] ?? {}));
  let garePerso = $state<string | null>(null);
  const cible = $derived(garePerso && gares.includes(garePerso) ? garePerso : (gares.includes('Mvan') ? 'Mvan' : gares[0] ?? ''));
  const km = $derived(quartiers[quartier]?.[cible] ?? 0);
  /** Covoiturages urbains encore ouverts aujourd'hui, ceux qui partent de ton quartier d'abord. */
  const covoits = $derived(app.monde.covoits.filter((c) => c.enVille && c.statut === 'ouverte' && c.de === ville && c.jour === aujourdhui() && c.heure >= heureMaintenant())
    .map((c) => ({ id: c.id, conducteur: personne(c.conducteurId)?.prenom ?? 'Conducteur', depart: c.depart, heure: c.heure, places: Math.max(0, c.places - c.reservations.reduce((s, r) => s + r.places, 0)), prix: c.prix }))
    .filter((c) => c.places > 0).sort((a, b) => Number(b.depart === quartier) - Number(a.depart === quartier) || a.heure.localeCompare(b.heure)));
  const motos = $derived(motosAutour(quartier));
  const options = $derived(optionsVille(km, quartier, minutesDuJour(), motos, covoits));
  const ICONES: Record<ModeVille, string> = { moto: 'moto', taxi: 'taxi', covoit: 'groupe', bus: 'bus' };
  const aller_ = (e: MouseEvent, href: string) => { e.preventDefault(); aller(href); };
  const lien = (o: (typeof options)[number]) => `${o.lien}?mode=${o.mode}&de=${encodeURIComponent(quartier)}&vers=${encodeURIComponent(cible)}&prix=${o.prix}`;
</script>

{#snippet entete()}
  <header class="hd">
    <div class="col"><span class="ttl t18">En ville</span><span class="t13 mut">{ville} · {quartier} → {cible}</span></div>
    {#if km}<span class="pl ok"><span class="dot"></span>{motos.nb} motos à {motos.minutes} min</span>{/if}
  </header>
{/snippet}

<Mobile enteteLibre={entete} dock={dockVoyageur('voyager')}>
  <div class="seg2" role="group" aria-label="Type de trajet">
    <a class="b g" href="/" onclick={(e) => aller_(e, '/')} style="flex: 1; min-height: 44px; border-radius: 14px; font-size: 14px">Interurbain</a>
    <button type="button" class="on" aria-pressed="true">En ville</button>
  </div>
  {#if !km}
    <div class="gl vide" role="status">
      <span class="ttl t16">Pas encore de trajets en ville à {ville}</span>
      <span class="t13 mut">Les motos, taxis et bus urbains arrivent bientôt dans cette ville. Pour le moment, tu peux réserver ton bus interurbain.</span>
      <a class="b p sm" href="/" onclick={(e) => aller_(e, '/')}>Voir les départs</a>
    </div>
  {:else}
    <div class="map" role="img" aria-label="Carte en relief du trajet de {quartier} à {cible}">
      <div class="pl3"></div><div class="rd"></div>
      <span class="pin" style="left: 12%; top: 54%"><i></i>{quartier}</span>
      <span class="pin" style="left: 56%; top: 30%"><i style="background: #FF5BDE; box-shadow: 0 0 12px #FF5BDE"></i>{cible} · gare</span>
    </div>
    <div class="row g8 wrapf">
      <label class="t13 mut" for="quartier">Depuis</label>
      <select id="quartier" class="sel" value={quartier} onchange={(e) => { choix = e.currentTarget.value; garePerso = null; }}>{#each Object.keys(quartiers) as q (q)}<option value={q}>{q}</option>{/each}</select>
      {#if gares.length > 1}<label class="t13 mut" for="gare-v">vers la gare</label>
        <select id="gare-v" class="sel" value={cible} onchange={(e) => (garePerso = e.currentTarget.value)}>{#each gares as g (g)}<option value={g}>{g}</option>{/each}</select>{/if}
    </div>
    <div class="row sp"><span class="lab">Comment y aller · {km.toLocaleString('fr-FR')} km</span><a class="t13 aq" href="/filtres" onclick={(e) => aller_(e, '/filtres')} style="text-decoration: none; min-height: 44px; display: inline-flex; align-items: center">Filtrer</a></div>
    {#each options as o, i (o.mode)}
      <a class="opt" class:ac={i === 0} href={lien(o)} onclick={(e) => aller_(e, lien(o))}>
        <span class="bub" class:aq={i === 0}><Icone nom={ICONES[o.mode]} /></span>
        <div class="col grow"><span class="t16 b7">{o.titre}</span><span class="t13 mut">{o.sous}</span></div>
        <div class="col" style="align-items: flex-end"><span class="t16 b7">{fmtF(o.prix)}</span>{#if o.badge}<span class="pl {o.ton}">{o.badge}</span>{/if}</div>
      </a>
    {/each}
    {#if !covoits.length}<p class="t12 mut3">Aucun covoiturage en ville n'est proposé pour l'instant. <a href="/covoit/ville" onclick={(e) => aller_(e, '/covoit/ville')}>Voir ou proposer un trajet</a></p>{/if}
  {/if}
</Mobile>

<style>
  .map { position: relative; height: 200px; border-radius: 22px; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.12); background: #0a0e1c; perspective: 700px; flex: none; }
  .pl3 { position: absolute; left: -20%; right: -20%; top: -10%; bottom: -40%; transform: rotateX(55deg); background-image: linear-gradient(rgba(61, 224, 255, 0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(61, 224, 255, 0.18) 1px, transparent 1px); background-size: 34px 34px; transform-origin: 50% 50%; }
  .rd { position: absolute; left: 10%; top: 62%; width: 80%; height: 6px; border-radius: 3px; background: linear-gradient(90deg, #8b7cff, #3de0ff); transform: rotate(-14deg); box-shadow: 0 0 18px rgba(61, 224, 255, 0.6); }
  .pin { position: absolute; display: flex; align-items: center; gap: 6px; padding: 4px 8px; border-radius: 999px; background: rgba(5, 7, 13, 0.8); border: 1px solid rgba(255, 255, 255, 0.2); font: 600 11px 'Geist Mono', monospace; color: #f2f4ff; }
  .pin i { width: 8px; height: 8px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 12px #3de0ff; }
  .opt { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 20px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); text-decoration: none; color: inherit; min-height: 72px; flex: none; }
  .opt.ac { background: linear-gradient(135deg, rgba(139, 124, 255, 0.22), rgba(61, 224, 255, 0.14)); border-color: rgba(139, 124, 255, 0.45); }
  .sel { min-height: 44px; padding: 0 10px; border-radius: 14px; background: rgba(255, 255, 255, 0.08); border: 1px solid rgba(255, 255, 255, 0.2); color: #f2f4ff; font: 600 14px 'Sora Variable', 'Sora', sans-serif; }
  .sel option { color: #05070d; }
  .vide { display: flex; flex-direction: column; gap: 10px; padding: 20px 16px; }
</style>
