<script lang="ts">
  // Vue Tableau de la journée : trois colonnes côte à côte (prêt, en cours, terminé). Chaque carte est courte (nom coupé, heure,
  // chrono) ; la toucher ouvre le détail du bloc, comme dans le calendrier. Le chrono de la carte la fait avancer : prêt → en cours,
  // puis « As-tu terminé ? » → terminé. Un glissement vers la droite ou la gauche fait avancer ou reculer la carte d'une colonne.
  import { flip } from 'svelte/animate';
  import type { Jour } from '@core/types.ts';
  import type { BlocVue } from '../../data/requetes.ts';
  import { horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { ecouleOccurrence, remettreAFaire, lancerBloc, reprendreBloc } from '../../data/actions/blocs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { styleTeinte } from './teintes.ts';
  import { chrono, hm } from './format.ts';
  import { COLONNES, arriveeDe, enRetard, gesteDe, repartir, type Geste, type IdColonne } from './tableau.ts';

  let { blocs, jour, aujourdhui, onouvrir, onterminer }: {
    blocs: BlocVue[]; jour: Jour; aujourdhui: Jour; onouvrir: (id: string) => void; onterminer: (id: string) => void;
  } = $props();

  const maintenantMin = $derived(maintenantLocal().minutes);
  const colonnes = $derived(repartir(blocs));
  const total = $derived(COLONNES.reduce((s, c) => s + colonnes[c.id].length, 0));

  function faire(b: BlocVue, g: Geste) {
    if (g === 'lancer') {
      if (b.enPause) reprendreBloc(b.occ.id); else lancerBloc(b.occ.id);
      dire(`« ${b.titre} » lancée`);
    } else if (g === 'terminer') onterminer(b.occ.id);
    else { remettreAFaire(b.occ.id); dire(`« ${b.titre} » remise en prêt`); }
  }

  // ---- glissement d'une carte (souris et doigt) : la capture ne commence qu'après 10 px, pour que le chrono reste cliquable.
  const SEUIL = 56;
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
  const titreColonne = (id: IdColonne | null) => COLONNES.find((c) => c.id === id)?.titre ?? '';
</script>

<div class="tableau" role="region" aria-label="Tableau de la journée">
  <div class="colonnes">
    {#each COLONNES as c (c.id)}
      {@const liste = colonnes[c.id]}
      <section class="colonne {c.id}" aria-label="{c.titre} ({liste.length})">
        <header>
          <span class="point"></span>
          <h2>{c.titre}</h2>
          <span class="mono compte">{liste.length}</span>
        </header>
        {#each liste as b (b.occ.id)}
          {@const g = glisse?.id === b.occ.id ? glisse.dx : 0}
          {@const cible = g ? arriveeDe(c.id, g > 0 ? 1 : -1) : null}
          <div class="rang" style={styleTeinte(b.couleur, theme.mode)} animate:flip={{ duration: 220 }}>
            {#if g && cible}<span class="indice" class:valide={Math.abs(g) >= SEUIL}>{titreColonne(cible)}</span>{/if}
            <div class="carte" class:glisse={g !== 0} style:transform={g ? `translateX(${g}px)` : undefined} role="presentation"
              onpointerdown={(e) => bas(e, b.occ.id)} onpointermove={(e) => bouge(e, b.occ.id, c.id)} onpointerup={(e) => haut(e, b, c.id)} onpointercancel={annule}>
              <button type="button" class="corps" onclick={() => clic(b.occ.id)} aria-label="{b.titre}, {hm(b.debutMin)} à {hm(b.finMin)}">
                <span class="titre-carte">{b.titre}</span>
                <span class="mono sous" class:retard={c.id === 'pret' && enRetard(b, jour, aujourdhui, maintenantMin)}>
                  {#if b.enCours || b.enPause}{chrono(ecouleOccurrence(b.occ, horloge.maintenant))}{:else}{hm(b.debutMin)}{/if}
                </span>
              </button>
              {#if c.id === 'pret'}
                <button type="button" class="chrono lancer" aria-label="Lancer {b.titre}" onclick={() => faire(b, 'lancer')}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
                </button>
              {:else if c.id === 'encours'}
                <button type="button" class="chrono terminer" aria-label="Terminer {b.titre}" onclick={() => faire(b, 'terminer')}>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
                </button>
              {:else}
                <span class="chrono fait" aria-hidden="true"><Icone nom="coche" taille={14} trait={3} /></span>
              {/if}
            </div>
          </div>
        {:else}
          <p class="muted rien">—</p>
        {/each}
      </section>
    {/each}
  </div>
  <p class="muted astuce">{total ? 'Touche une carte pour son détail · ▶ lance · ■ termine · glisse pour avancer ou reculer.' : 'Aucun bloc ce jour-là. Ajoute une tâche avec le bouton +.'}</p>
</div>

<style>
  .tableau { flex: 1; min-height: 0; overflow-y: auto; padding: 10px 10px 16px; display: flex; flex-direction: column; gap: 12px; }
  .colonnes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; align-items: start; }
  .colonne { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding: 8px 5px 10px; border-radius: 16px; background: var(--surface-2); min-height: 120px; }
  header { display: flex; align-items: center; gap: 5px; padding: 0 4px 2px; }
  h2 { font-size: 13px; font-weight: 700; white-space: nowrap; }
  .point { flex: none; width: 8px; height: 8px; border-radius: 4px; background: var(--muted); }
  .encours .point { background: var(--maintenant, #FF5A4D); }
  .termine .point { background: var(--bon, #34D1B6); }
  .compte { margin-left: auto; font-size: 11px; color: var(--muted); }
  .rang { position: relative; border-radius: 12px; }
  .indice { position: absolute; inset: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 700; background: var(--surface); color: var(--muted); border: 1px dashed var(--ligne); }
  .indice.valide { background: var(--c-fond); color: var(--c-encre); border-color: var(--c); }
  .carte { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 6px 6px 6px 8px; border-radius: 12px; border: 1px solid var(--ligne); border-left: 3px solid var(--c); background: var(--surface); touch-action: pan-y; user-select: none; -webkit-user-select: none; transition: transform 0.18s ease; min-height: 78px; }
  .carte.glisse { transition: none; box-shadow: 0 6px 16px rgba(0, 0, 0, 0.3); z-index: 2; }
  .corps { flex: 1; min-width: 0; text-align: left; border: 0; background: transparent; padding: 0; display: flex; flex-direction: column; gap: 3px; color: inherit; font: inherit; min-height: 44px; }
  /* Nom coupé : on reconnaît la tâche d'un coup d'œil, le détail est un toucher plus loin. */
  .titre-carte { font-size: 13px; font-weight: 600; line-height: 1.2; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 3; line-clamp: 3; -webkit-box-orient: vertical; word-break: break-word; }
  .sous { font-size: 11px; color: var(--muted); }
  .sous.retard { color: var(--alerte, #F5B843); font-weight: 600; }
  .chrono { align-self: flex-end; flex: none; width: 44px; height: 40px; margin: -4px -4px -6px 0; border-radius: 16px; border: 0; background: transparent; display: flex; align-items: center; justify-content: center; color: var(--c-encre, var(--texte)); }
  .chrono.lancer, .chrono.terminer { background: var(--c-fond); }
  .chrono.fait { color: var(--bon, #34D1B6); }
  .rien { text-align: center; font-size: 12px; padding: 6px 0; }
  .astuce { text-align: center; font-size: 12px; }
</style>
