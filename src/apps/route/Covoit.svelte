<script lang="ts">
  import { personneCourante } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { accueilDe, dockDuRole } from '../_socle/dockRole.ts';
  import './covoit.css';
  import { choisirMode, mesReservations, modeCovoit } from './covoitActions.ts';
  import IconeCv from './IconeCv.svelte';
  import PanneauConducteur from './PanneauConducteur.svelte';
  import PanneauVoyageur from './PanneauVoyageur.svelte';
  import SegmentGlissant from './SegmentGlissant.svelte';

  /** L'application Covoiturage : un sélecteur « Voyageur | Conducteur » (pastille glissante, balayage horizontal, flèches), mémorisé. */
  let { forcer, modeInitial = 'villes' }: { forcer?: 'voyageur' | 'conducteur'; modeInitial?: 'villes' | 'ville' } = $props();
  const moi = personneCourante(), partenaire = moi?.role === 'conducteur';
  let mode = $state<string>(partenaire ? 'conducteur' : (forcer ?? modeCovoit(moi?.id))), sens = $state(1), decalage = $state(0), glisse = $state(false), debut: { x: number; y: number } | null = null;
  if (forcer && !partenaire && moi) choisirMode(forcer, moi.id);
  function change(m: string) { sens = m === 'conducteur' ? 1 : -1; mode = m; if (moi) choisirMode(m as 'voyageur' | 'conducteur', moi.id); decalage = 0; document.querySelector('.bd')?.scrollTo({ top: 0 }); }
  function bas(e: PointerEvent) { if (partenaire || (e.target as HTMLElement).closest('input, select, textarea, [data-noswipe="true"], .chips, .scene, .holo, .feuille, .voile')) return; debut = { x: e.clientX, y: e.clientY }; glisse = false; }
  function bouge(e: PointerEvent) {
    if (!debut) return; const dx = e.clientX - debut.x, dy = e.clientY - debut.y;
    if (!glisse && Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) glisse = true;
    if (glisse) decalage = Math.max(-90, Math.min(90, dx * 0.5));
  }
  function haut(e: PointerEvent) {
    if (!debut) return; const dx = e.clientX - debut.x; debut = null;
    if (glisse && Math.abs(dx) > 70) { const cible = dx < 0 ? 'conducteur' : 'voyageur'; if (cible !== mode) { change(cible); glisse = false; return; } }
    glisse = false; decalage = 0;
  }
  // Le bouton « Je conduis » flotte quand il ne cache rien : sans réservation en tête, ou une fois la page défilée au-delà du billet.
  let defile = $state(false);
  $effect(() => { const bd = document.querySelector('.bd'); if (!bd) return; const f = () => (defile = bd.scrollTop > 420); f(); bd.addEventListener('scroll', f, { passive: true }); return () => bd.removeEventListener('scroll', f); });
  const fab = $derived(mode === 'voyageur' && !partenaire && (defile || mesReservations(moi?.id).length === 0));
  const dock = $derived(partenaire ? dockDuRole(moi?.role, { terrain: 'trajets' }) : dockVoyageur('covoit'));
  function versConducteur() { change('conducteur'); }
</script>

<Mobile {dock} sansRetour={!partenaire} retourVers={partenaire ? accueilDe(moi?.role) : undefined}>
  {#snippet enteteLibre()}
    <header class="hd entete">
      <h1 class="ttl t18">Covoiturage</h1>
      {#if !partenaire}<div class="selecteur"><SegmentGlissant petit bind:valeur={mode} label="Mode du covoiturage" idPrefixe="mode" options={[{ id: 'voyageur', label: 'Voyageur' }, { id: 'conducteur', label: 'Conducteur' }]} onchoisir={change} /></div>{/if}
    </header>
  {/snippet}

  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="piste" onpointerdown={bas} onpointermove={bouge} onpointerup={haut} onpointercancel={haut} role="presentation">
    {#key mode}
      <div class="panneau" class:glisse role="tabpanel" aria-labelledby="mode-{mode}" tabindex="-1" style="--sens: {sens};{decalage ? ` transform: translateX(${decalage}px); opacity: ${1 - Math.abs(decalage) / 260};` : ''}">
        {#if mode === 'conducteur' && moi}<PanneauConducteur moiId={moi.id} ouvrirProfil />{:else}<PanneauVoyageur onconduire={versConducteur} {modeInitial} />{/if}
      </div>
    {/key}
  </div>
  {#if fab}
    <div class="fab-zone"><button type="button" class="fab" onclick={versConducteur}><IconeCv nom="voiture" taille={22} /><span>Je conduis</span></button></div>
  {/if}
</Mobile>

<style>
  .entete { flex-wrap: wrap; row-gap: 8px; } .entete h1 { margin: 0; flex: none; }
  .selecteur { flex: 1 1 200px; max-width: 260px; min-width: 0; margin-left: auto; }
  .piste { touch-action: pan-y; display: flex; flex-direction: column; overflow-x: clip; }
  .panneau { display: flex; flex-direction: column; gap: 12px; animation: entre 0.42s cubic-bezier(0.2, 0.9, 0.3, 1); transition: transform 0.25s; } .panneau.glisse { transition: none; }
  @keyframes entre { from { opacity: 0; transform: translateX(calc(var(--sens) * 56px)); } }
  .fab-zone { position: absolute; right: 16px; bottom: 104px; z-index: 5; pointer-events: none; }
  .fab { pointer-events: auto; display: inline-flex; align-items: center; gap: 8px; min-height: 56px; padding: 0 20px 0 16px; border-radius: 28px; border: 1px solid rgba(255, 255, 255, 0.35); background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; font: 800 15px 'Sora Variable', 'Sora', sans-serif; cursor: pointer; box-shadow: 0 18px 36px -10px rgba(124, 108, 255, 0.9), 0 0 0 6px rgba(139, 124, 255, 0.18); animation: flotte 3.2s ease-in-out infinite; }
  .fab:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
  @keyframes flotte { 50% { transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { .fab { animation: none; } .panneau { animation: none; } }
</style>
