<script lang="ts">
  // Vue Tableau de la journée : prêtes, à faire, en cours, terminées. Glisser une carte vers la droite la fait avancer
  // (lancer, puis terminer), vers la gauche reculer (remise « à faire ») ; chaque carte a aussi ses boutons.
  import { flip } from 'svelte/animate';
  import type { Jour } from '@core/types.ts';
  import type { BlocVue } from '../../data/requetes.ts';
  import { horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { ecouleOccurrence, remettreAFaire, terminerBloc, lancerBloc, reprendreBloc } from '../../data/actions/blocs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { styleTeinte } from './teintes.ts';
  import { basculerMinuteur } from './vue-blocs.ts';
  import { chrono, dureeMin, hm } from './format.ts';
  import { COLONNES, arriveeDe, gesteDe, repartir, type Geste, type IdColonne } from './tableau.ts';

  let { blocs, jour, aujourdhui, onouvrir, onterminer }: {
    blocs: BlocVue[]; jour: Jour; aujourdhui: Jour; onouvrir: (id: string) => void; onterminer: (id: string) => void;
  } = $props();

  const maintenantMin = $derived(maintenantLocal().minutes);
  const colonnes = $derived(repartir(blocs, jour, aujourdhui, maintenantMin));
  const total = $derived(COLONNES.reduce((s, c) => s + colonnes[c.id].length, 0));
  const duree = (l: BlocVue[]) => l.reduce((s, b) => s + (b.finMin - b.debutMin), 0);
  const cibleRemise = (b: BlocVue): IdColonne => (jour < aujourdhui || (jour === aujourdhui && b.debutMin <= maintenantMin) ? 'afaire' : 'pretes');

  function faire(b: BlocVue, g: Geste) {
    if (g === 'lancer') {
      if (b.enPause) reprendreBloc(b.occ.id); else lancerBloc(b.occ.id);
      dire(`« ${b.titre} » lancée`);
    } else if (g === 'terminer') onterminer(b.occ.id);
    else { remettreAFaire(b.occ.id); dire(`« ${b.titre} » remise à faire`); }
  }
  function marquerFait(b: BlocVue) { terminerBloc(b.occ.id); dire(`« ${b.titre} » cochée`); }

  // ---- glissement d'une carte (souris et doigt) : la capture ne commence qu'après 10 px, pour que les boutons restent cliquables.
  const SEUIL = 84;
  let depart: { id: string; x: number; y: number; capture: boolean } | null = null;
  let glisse = $state<{ id: string; dx: number } | null>(null);
  let aGlisse = false;

  function bas(e: PointerEvent, id: string) { if (e.button > 0) return; depart = { id, x: e.clientX, y: e.clientY, capture: false }; }
  function bouge(e: PointerEvent, id: string, col: IdColonne) {
    if (!depart || depart.id !== id) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
    if (!depart.capture) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.3) { depart.capture = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
      else if (Math.abs(dy) > 10) { depart = null; return; }
      else return;
    }
    // Du côté où rien ne se passe, la carte résiste.
    glisse = { id, dx: gesteDe(col, dx > 0 ? 1 : -1) ? dx : dx * 0.18 };
  }
  function haut(e: PointerEvent, b: BlocVue, col: IdColonne) {
    const d = depart, g = glisse;
    depart = null; glisse = null;
    if (!d || !d.capture) return;
    aGlisse = true; setTimeout(() => (aGlisse = false), 0);
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch { /* déjà relâché */ }
    if (!g || Math.abs(g.dx) < SEUIL) return;
    const geste = gesteDe(col, g.dx > 0 ? 1 : -1);
    if (geste) faire(b, geste);
  }
  function annule() { depart = null; glisse = null; }
  const clic = (id: string) => { if (!aGlisse) onouvrir(id); };

  const indice = (col: IdColonne, dx: number) => {
    const a = arriveeDe(col, dx > 0 ? 1 : -1);
    return a === 'encours' ? 'En cours' : a === 'terminees' ? 'Terminer' : a === 'afaire_ou_pretes' ? 'Remettre à faire' : '';
  };
</script>

<div class="tableau" role="region" aria-label="Tableau de la journée">
  {#if !total}
    <p class="muted vide">Aucun bloc ce jour-là. Ajoute une tâche avec le bouton +.</p>
  {/if}
  {#each COLONNES as c (c.id)}
    {@const liste = colonnes[c.id]}
    <section class="colonne {c.id}" aria-label="{c.titre} ({liste.length})">
      <header>
        <span class="point"></span>
        <h2>{c.titre}</h2>
        <span class="mono compte">{liste.length}</span>
        {#if liste.length}<span class="muted petit duree">{dureeMin(duree(liste))}</span>{/if}
      </header>
      {#each liste as b (b.occ.id)}
        {@const g = glisse?.id === b.occ.id ? glisse.dx : 0}
        <div class="rang" style={styleTeinte(b.couleur, theme.mode)} animate:flip={{ duration: 220 }}>
          {#if g}<span class="indice" class:droite={g > 0} class:valide={Math.abs(g) >= SEUIL}>{indice(c.id, g)}</span>{/if}
          <div class="carte" class:glisse={g !== 0} style:transform={g ? `translateX(${g}px)` : undefined} role="presentation"
            onpointerdown={(e) => bas(e, b.occ.id)} onpointermove={(e) => bouge(e, b.occ.id, c.id)} onpointerup={(e) => haut(e, b, c.id)} onpointercancel={annule}>
            <button type="button" class="corps" onclick={() => clic(b.occ.id)} aria-label="{b.titre}, {hm(b.debutMin)} à {hm(b.finMin)}">
              <span class="titre-carte">{b.titre}</span>
              <span class="muted petit sous">{b.projet?.nom ?? 'Sans projet'} · {hm(b.debutMin)}–{hm(b.finMin)}{#if b.enCours || b.enPause} · <span class="mono">{chrono(ecouleOccurrence(b.occ, horloge.maintenant))}</span>{b.enPause ? ' (pause)' : ''}{/if}</span>
            </button>
            <span class="boutons">
              {#if c.id === 'pretes' || c.id === 'afaire'}
                <button type="button" class="b lancer" aria-label="Lancer {b.titre}" onclick={() => faire(b, 'lancer')}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
                </button>
                <button type="button" class="b" aria-label="Marquer {b.titre} comme fait" onclick={() => marquerFait(b)}><Icone nom="coche" taille={15} trait={2.6} /></button>
              {:else if c.id === 'encours'}
                <button type="button" class="b" aria-label="{b.enPause ? 'Reprendre' : 'Mettre en pause'} {b.titre}" onclick={() => basculerMinuteur(b.occ.id)}>
                  {#if b.enPause}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
                  {:else}
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
                  {/if}
                </button>
                <button type="button" class="b lancer" aria-label="Terminer {b.titre}" onclick={() => faire(b, 'terminer')}><Icone nom="coche" taille={15} trait={2.6} /></button>
              {:else}
                <button type="button" class="b" aria-label="Rouvrir {b.titre}" onclick={() => faire(b, 'remettre')}>↺</button>
              {/if}
            </span>
          </div>
        </div>
      {:else}
        <p class="muted petit rien">Rien ici.</p>
      {/each}
    </section>
  {/each}
  <p class="muted petit astuce">Glisse une carte vers la droite pour la faire avancer, vers la gauche pour la remettre à faire.</p>
</div>

<style>
  .tableau { flex: 1; min-height: 0; overflow-y: auto; padding: 8px 14px 18px 18px; display: grid; gap: 14px; align-content: start; }
  @media (min-width: 720px) { .tableau { grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: start; } .astuce, .vide { grid-column: 1 / -1; } }
  .colonne { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  header { display: flex; align-items: baseline; gap: 8px; }
  h2 { font-size: 15px; font-weight: 700; }
  .point { align-self: center; width: 9px; height: 9px; border-radius: 5px; background: var(--muted); }
  .pretes .point { background: var(--faint, var(--muted)); }
  .afaire .point { background: var(--alerte, #F5B843); }
  .encours .point { background: var(--maintenant, #FF5A4D); }
  .terminees .point { background: var(--bon, #34D1B6); }
  .compte { font-size: 12px; color: var(--muted); }
  .duree { margin-left: auto; font-size: 12px; }
  .petit { font-size: 12px; }
  .rang { position: relative; border-radius: 16px; }
  .indice { position: absolute; inset: 0; border-radius: 16px; display: flex; align-items: center; padding: 0 16px; font-size: 13px; font-weight: 600; background: var(--surface-2); color: var(--muted); }
  .indice.droite { justify-content: flex-start; }
  .indice:not(.droite) { justify-content: flex-end; }
  .indice.valide { background: var(--c-fond); color: var(--c-encre); }
  .carte { position: relative; display: flex; align-items: center; gap: 6px; padding: 6px 6px 6px 12px; min-height: 64px; border-radius: 16px; border: 1px solid var(--ligne); border-left: 4px solid var(--c); background: var(--surface); touch-action: pan-y; user-select: none; -webkit-user-select: none; transition: transform 0.18s ease; }
  .carte.glisse { transition: none; box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25); }
  .corps { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; padding: 6px 0; display: flex; flex-direction: column; gap: 2px; min-height: 44px; color: inherit; font: inherit; }
  .titre-carte { font-size: 15px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .sous { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .boutons { flex: none; display: flex; gap: 2px; }
  .b { width: 44px; height: 44px; border-radius: 22px; border: 0; background: transparent; color: var(--texte); display: flex; align-items: center; justify-content: center; font-size: 18px; }
  .b.lancer { background: var(--c-fond); color: var(--c-encre); }
  .rien, .vide { padding: 4px 2px; }
  .astuce { text-align: center; }
</style>
