<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { trancheDevant, type Genre, type Offre } from '../../core/recherche.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { duree, type Tranche } from '../../core/tranches.ts';
  import { etiquette, lienPlace, lienReserverCovoit, prixInsecable } from './offres.ts';
  import LigneOffre from './LigneOffre.svelte';
  import { lienEnvoiColis } from './colisOffres.ts';
  import type { TailleColis } from '../../core/prixColis.ts';

  /** Panorama 3D : les 8 tranches de 3 h forment un anneau qui tourne (glisser au doigt ou à la souris, flèches du clavier) ; la tranche en face s'ouvre. */
  let { colonnes, rot = $bindable(), selId = $bindable(), genre, horsLigne = false, onliste, colis = null }: {
    colonnes: Tranche<Offre>[]; rot: number; selId: string | null; genre: Genre; horsLigne?: boolean; onliste: () => void; /** Mode Colis : taille cherchée ; les boutons mènent à l'envoi d'un colis. */ colis?: TailleColis | null;
  } = $props();
  const TH = 45, R = 350, LIGNES_MAX = 3;
  let drag = $state<{ x: number; r: number } | null>(null);
  let deplace = false;
  let glisse = $state(false);
  const devant = $derived(trancheDevant(rot, colonnes.length));

  function caler(r: number) {
    const rr = Math.round(r / TH) * TH, f = trancheDevant(rr, colonnes.length), it = colonnes[f]?.items ?? [];
    rot = rr; drag = null;
    if (it.length && !it.some((x) => x.id === selId)) selId = it[0].id;
  }
  /** Tourne vers une tranche par le chemin le plus court. */
  function vers(i: number) { const base = -i * TH; caler(base + 360 * Math.round((rot - base) / 360)); }
  const cliquable = (e: Event) => !(e.target as Element).closest('a');
  function bas(e: PointerEvent) { if (!cliquable(e)) return; deplace = false; drag = { x: e.clientX, r: rot }; }
  function bouge(e: PointerEvent) {
    if (!drag) return;
    const dx = e.clientX - drag.x;
    if (!deplace && Math.abs(dx) > 8) { deplace = true; glisse = true; try { (e.currentTarget as Element).setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ } }
    if (deplace) rot = drag.r + dx * 0.45;
  }
  function haut() { if (!drag) return; glisse = false; if (deplace) { caler(rot); setTimeout(() => (deplace = false), 60); } else drag = null; }
  function touche(e: KeyboardEvent) {
    if (e.key === 'ArrowRight') { e.preventDefault(); caler(rot - TH); } else if (e.key === 'ArrowLeft') { e.preventDefault(); caler(rot + TH); }
    else if (e.key === 'Home') { e.preventDefault(); vers(0); } else if (e.key === 'End') { e.preventDefault(); vers(colonnes.length - 1); }
  }
  const choisir = (i: number, o: Offre) => { if (deplace) return; if (i === devant) selId = o.id; else vers(i); };
  const aller_ = (e: MouseEvent, href: string) => { e.preventDefault(); aller(href); };
  const nom = (n: number) => genre === 'bus' ? 'bus' : genre === 'covoit' ? 'covoiturage' : 'départ';
  const resume = (items: Offre[]) => { const nb = items.filter((x) => x.genre === 'bus').length, nc = items.length - nb; return items.length === 0 ? 'aucun départ' : (nb ? `${nb} bus` : '') + (nb && nc ? ' + ' : '') + (nc ? `${nc} covoit` : ''); };
  const sous1 = (o: Offre) => `${o.genre === 'cv' ? `${o.cl} · départ ${o.gare}` : `Gare ${o.gare}`} · ${duree(o.dureeMin)} · ${o.complet ? 'complet' : `${o.places} place${o.places > 1 ? 's' : ''}`}`;
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="pano" class:glisse role="group" aria-roledescription="panorama" tabindex="0" onkeydown={touche}
  aria-label="Départs par tranche de 3 heures · glisse à gauche ou à droite pour tourner, ou utilise les flèches du clavier"
  onpointerdown={bas} onpointermove={bouge} onpointerup={haut} onpointercancel={haut}>
  <div class="ring" style="transform: translateZ(-{R}px) rotateY({rot}deg); transition: {drag ? 'none' : 'transform .45s cubic-bezier(.2,.8,.2,1)'}">
    {#each colonnes as c (c.index)}
      {@const a = c.index * TH}
      {@const rel = (((a + rot) % 360) + 360) % 360}
      {@const dist = Math.min(rel, 360 - rel)}
      {@const facing = dist <= 50}
      {@const isF = c.index === devant}
      {@const n = c.items.length}
      {@const fs = c.items.find((x) => x.id === selId) ?? c.items[0]}
      {@const prixMin = n ? Math.min(...c.items.map((x) => x.prix)) : 0}
      <article class="colm" class:front={isF} aria-hidden={isF ? undefined : 'true'}
        style="transform: rotateY({a}deg) translateZ({R}px); opacity: {facing ? (1 - dist / 115).toFixed(2) : 0}; pointer-events: {facing ? 'auto' : 'none'}">
        <button type="button" class="chc" tabindex={isF ? undefined : -1} onclick={() => { if (deplace) return; if (isF) onliste(); else vers(c.index); }}
          aria-label="{c.h1} – {c.h2} h{n ? `, ${n} départ${n > 1 ? 's' : ''}` : ', aucun départ'}{isF ? ', voir la liste' : ', tourner vers cette tranche'}">
          <span class="hh">{c.h1}<small> – {c.h2} h</small></span>
          <span class="col" style="align-items: flex-end"><span class="t12 b7 aq">{resume(c.items)}</span><span class="t12 mut">{n ? `dès ${fmtF(prixMin)}` : ''}</span></span>
        </button>
        {#if n === 0}
          <div class="empty">Aucun {nom(0)} entre {c.h1} h et {c.h2} h · glisse pour la tranche suivante</div>
        {:else if n === 1}
          {@const o = c.items[0]}
          {@const et = etiquette(o, c.items)}
          {@const cv = o.genre === 'cv'}
          <div class="one" class:cv>
            <div class="row sp"><span class="lg" class:cv style="background: {o.col}" aria-hidden="true">{o.ab}</span><span class="pl {cv ? 'wa' : 'ac'}">{cv ? 'Covoiturage' : o.vip ? 'Bus VIP' : 'Bus classique'}</span></div>
            <span class="tm">{o.heure}</span>
            <span class="co ell">{o.co}</span>
            <span class="t13 mut">{sous1(o)}</span>
            <div class="row sp" style="margin-top: 4px"><span class="px">{fmtF(o.prix)}</span><span class="bd2 {et.ton}">{et.texte}</span></div>
            <div class="seats" aria-hidden="true"><i style="width: {Math.round((100 * o.places) / o.cap)}%"></i></div>
            {#if o.complet}<button type="button" class="b p cta" disabled tabindex={isF ? undefined : -1}>Complet</button>
            {:else if horsLigne}<button type="button" class="b p cta" disabled tabindex={isF ? undefined : -1}>Hors ligne</button>
            {:else if colis}<a class="b p cta" href={lienEnvoiColis(o, colis)} tabindex={isF ? undefined : -1} onclick={(e) => aller_(e, lienEnvoiColis(o, colis))}>Envoyer un colis</a>
            {:else if cv}<a class="b p cta" href={lienReserverCovoit(o)} tabindex={isF ? undefined : -1} onclick={(e) => aller_(e, lienReserverCovoit(o))}>Réserver une place</a>
            {:else}<a class="b p cta" href={lienPlace(o)} tabindex={isF ? undefined : -1} onclick={(e) => aller_(e, lienPlace(o))}>Choisir ma place</a>{/if}
          </div>
        {:else}
          {#each c.items.slice(0, LIGNES_MAX) as o (o.id)}
            <LigneOffre {o} colonne actif={o.id === fs.id} etiquette={etiquette(o, c.items)} focalisable={isF} onclick={() => choisir(c.index, o)} />
          {/each}
          {#if n > LIGNES_MAX}<button type="button" class="more" tabindex={isF ? undefined : -1} onclick={() => { if (!deplace) onliste(); }}>+ {n - LIGNES_MAX} autre{n - LIGNES_MAX > 1 ? 's' : ''} départ{n - LIGNES_MAX > 1 ? 's' : ''} · voir la liste</button>{/if}
          <div class="row g8 foot">
            {#if fs.complet}<button type="button" class="b p" disabled tabindex={isF ? undefined : -1}>Complet</button>
            {:else if horsLigne}<button type="button" class="b p" disabled tabindex={isF ? undefined : -1}>Hors ligne</button>
            {:else if colis}<a class="b p" href={lienEnvoiColis(fs, colis)} tabindex={isF ? undefined : -1} aria-label="Envoyer un colis, départ {fs.heure} {fs.co}, {fmtF(fs.prix)}" onclick={(e) => aller_(e, lienEnvoiColis(fs, colis))}>Envoyer un colis · {prixInsecable(fs.prix)}</a>
            {:else if fs.genre === 'bus'}<a class="b p" href={lienPlace(fs)} tabindex={isF ? undefined : -1} aria-label="Choisir ma place, départ {fs.heure} {fs.co}, {fmtF(fs.prix)}" onclick={(e) => aller_(e, lienPlace(fs))}>Choisir ma place · {prixInsecable(fs.prix)}</a>
            {:else}<a class="b p" href={lienReserverCovoit(fs)} tabindex={isF ? undefined : -1} aria-label="Réserver, covoiturage {fs.heure} {fs.co}, {fmtF(fs.prix)}" onclick={(e) => aller_(e, lienReserverCovoit(fs))}>Réserver · {prixInsecable(fs.prix)}</a>{/if}
          </div>
        {/if}
      </article>
    {/each}
  </div>
</div>

<style>
  .pano { flex: none; position: relative; height: 390px; perspective: 1000px; perspective-origin: 50% 30%; margin: 0 -16px; touch-action: pan-y; cursor: grab; overflow: hidden; outline-offset: -3px; border-radius: 12px; }
  .pano.glisse { cursor: grabbing; }
  .pano:focus-visible { outline: 2px solid #7febff; }
  .ring { position: absolute; left: 50%; top: 6px; width: 262px; height: 378px; margin-left: -131px; transform-style: preserve-3d; }
  .colm { position: absolute; inset: 0; padding: 10px 9px 9px; border-radius: 26px; border: 1px solid rgba(255, 255, 255, 0.22); background: linear-gradient(160deg, rgba(255, 255, 255, 0.15), rgba(255, 255, 255, 0.04)); display: flex; flex-direction: column; gap: 6px; box-shadow: 0 30px 60px -30px rgba(0, 0, 0, 0.9), inset 0 1px 0 rgba(255, 255, 255, 0.18); user-select: none; transition: opacity 0.3s; }
  .colm.front { border-color: rgba(139, 124, 255, 0.7); box-shadow: 0 40px 70px -30px rgba(124, 108, 255, 0.75), inset 0 1px 0 rgba(255, 255, 255, 0.22); }
  .chc { display: flex; align-items: flex-end; justify-content: space-between; gap: 6px; padding: 0 4px 2px; border: 0; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; min-height: 44px; flex: none; }
  .hh { font: 700 26px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.04em; white-space: nowrap; }
  .hh small { font-size: 14px; color: #b7c0db; letter-spacing: 0; }
  .lg { flex: none; width: 30px; height: 30px; border-radius: 10px; display: grid; place-items: center; font: 800 10px 'Sora Variable', 'Sora', sans-serif; color: #06080f; }
  .lg.cv { border-radius: 50%; font-size: 11px; }
  .bd2 { font: 600 10px 'Geist Mono', monospace; color: #a1accb; white-space: nowrap; }
  .bd2.ok { color: #7cf0a6; } .bd2.wa { color: #ffc24b; } .bd2.inf { color: #7fb8ff; } .bd2.cv { color: #ff9bea; } .bd2.er { color: #ff6b6b; }
  .more { min-height: 44px; margin: -10px 0; display: flex; align-items: center; justify-content: center; border: 0; background: transparent; color: #7febff; font: 600 12px 'Sora Variable', 'Sora', sans-serif; text-align: center; cursor: pointer; flex: none; text-decoration: underline; }
  .foot { margin-top: auto; flex: none; }
  .foot .b { min-height: 46px; font-size: 14px; flex: 1; white-space: nowrap; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .one { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; padding: 12px 12px 10px; border-radius: 20px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(5, 7, 13, 0.5); }
  .one > * { flex: none; }
  .one.cv { border-style: dashed; border-color: rgba(255, 91, 222, 0.5); background: rgba(255, 91, 222, 0.08); }
  .one .lg { width: 52px; height: 52px; border-radius: 16px; font-size: 15px; } .one .lg.cv { border-radius: 50%; }
  .tm { font: 700 42px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.05em; white-space: nowrap; }
  .co { font: 700 16px/1.2 'Sora Variable', 'Sora', sans-serif; }
  .px { font: 700 26px/1 'Unbounded Variable', 'Unbounded', sans-serif; color: #7febff; letter-spacing: -0.03em; white-space: nowrap; }
  .seats { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.1); overflow: hidden; }
  .seats i { display: block; height: 100%; background: linear-gradient(90deg, #8b7cff, #3de0ff); }
  .cta { margin-top: auto; min-height: 46px; white-space: nowrap; }
  .empty { flex: 1; display: grid; place-items: center; text-align: center; color: #a1accb; font-size: 13px; padding: 10px; border-radius: 20px; border: 1px dashed rgba(255, 255, 255, 0.14); }
</style>
