<script lang="ts">
  import { disposerSieges, jaugeSieges, type Occupant } from '../../core/covoitProfil.ts';
  import type { Carrosserie } from '../../core/covoitTypes.ts';
  /** Le véhicule du conducteur en 3D (CSS) : plaque de carrosserie épaisse, pare-brise, phares, roues, conducteur au volant, places passagers occupées (initiales) ou libres (pointillés lumineux).
   *  Se tourne au doigt ou avec les flèches du clavier. */
  let { carrosserie, couleur = 'Gris', places, occupants, nom = '', plaque = '', note = '' }: { carrosserie: Carrosserie; couleur?: string; places: number; occupants: Occupant[]; nom?: string; plaque?: string; note?: string } = $props();
  /** l, h : taille de la carrosserie en px ; capot et coffre/benne : part de la longueur ; épaisseur : nombre de tranches de 3 px. */
  const TAILLES: Record<Carrosserie, { l: number; h: number; capot: number; arriere: number; benne: boolean; ep: number }> = {
    citadine: { l: 100, h: 184, capot: 0.2, arriere: 0.1, benne: false, ep: 7 }, berline: { l: 106, h: 232, capot: 0.22, arriere: 0.17, benne: false, ep: 7 },
    suv: { l: 118, h: 224, capot: 0.19, arriere: 0.09, benne: false, ep: 10 }, pickup: { l: 116, h: 262, capot: 0.19, arriere: 0.36, benne: true, ep: 9 }
  };
  const COULEURS: Record<string, string> = { Blanc: '#e9edf8', Noir: '#3a4266', Gris: '#97a0ba', Argent: '#cdd3e3', Rouge: '#ff5b6e', Bleu: '#4f80ff', Vert: '#3fc794', Beige: '#dccaa6' };
  const t = $derived(TAILLES[carrosserie]), teinte = $derived(COULEURS[couleur] ?? '#97a0ba');
  const sieges = $derived(disposerSieges(carrosserie, places, occupants));
  const prises = $derived(sieges.filter((s) => s.etat === 'occupe').length);
  const tranches = $derived(Array.from({ length: t.ep }, (_, k) => k));
  const hauteur = $derived(t.ep * 3);
  const cab = $derived({ y0: t.h * (t.capot + 0.02), y1: t.h * (1 - t.arriere - 0.01) });
  let az = $state(-28), prise: { x: number; az0: number } | null = null;
  const borne = (v: number) => Math.max(-75, Math.min(20, v));
  function debut(e: PointerEvent) { prise = { x: e.clientX, az0: az }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function bouge(e: PointerEvent) { if (prise) az = borne(prise.az0 + (e.clientX - prise.x) * 0.45); }
  function touche(e: KeyboardEvent) { if (e.key === 'ArrowLeft') az = borne(az - 8); else if (e.key === 'ArrowRight') az = borne(az + 8); else return; e.preventDefault(); }
  const resume = $derived(`${nom || 'Véhicule'}${plaque ? `, plaque ${plaque}` : ''} : ${prises} place${prises > 1 ? 's' : ''} occupée${prises > 1 ? 's' : ''} sur ${places}`);
</script>

<figure class="cv-v3d" aria-label={resume}>
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <div class="scene" role="group" tabindex="0" aria-label="Véhicule en 3D. Flèches gauche et droite pour le tourner." onpointerdown={debut} onpointermove={bouge} onpointerup={() => (prise = null)} onpointercancel={() => (prise = null)} onkeydown={touche}>
    <div class="halo" aria-hidden="true"></div>
    <div class="monde" style="--az: {az}deg; --teinte: {teinte}; --l: {t.l}px; --h: {t.h}px; --haut: {hauteur}px" aria-hidden="true">
      <div class="anneau"></div>
      <div class="ombre"></div>
      <i class="roue ag"></i><i class="roue ad"></i><i class="roue rg"></i><i class="roue rd"></i>
      {#each tranches as k (k)}<i class="tranche" style="transform: translateZ({k * 3}px)"></i>{/each}
      <div class="plaque" style="transform: translateZ({hauteur}px)">
        <svg viewBox="0 0 {t.l} {t.h}" width={t.l} height={t.h}>
          <defs><linearGradient id="vitre-{carrosserie}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9ff3ff" stop-opacity=".85" /><stop offset="1" stop-color="#6aa8ff" stop-opacity=".25" /></linearGradient></defs>
          <path d="M{t.l * 0.2} {t.h * t.capot} Q{t.l * 0.5} {t.h * (t.capot - 0.035)} {t.l * 0.8} {t.h * t.capot}" class="trait" /><path d="M{t.l * 0.5} 6 V{t.h * t.capot - 8}" class="trait fin" />
          <rect x={t.l * 0.07} y={cab.y0} width={t.l * 0.86} height={cab.y1 - cab.y0} rx="16" class="puits" />
          <path d="M{t.l * 0.1} {cab.y0 + 1} L{t.l * 0.9} {cab.y0 + 1} L{t.l * 0.82} {cab.y0 + t.h * 0.075} L{t.l * 0.18} {cab.y0 + t.h * 0.075}Z" fill="url(#vitre-{carrosserie})" />
          <path d="M{t.l * 0.18} {cab.y1 - t.h * 0.05} L{t.l * 0.82} {cab.y1 - t.h * 0.05} L{t.l * 0.9} {cab.y1 - 1} L{t.l * 0.1} {cab.y1 - 1}Z" fill="url(#vitre-{carrosserie})" opacity=".6" />
          {#if t.benne}<rect x={t.l * 0.09} y={t.h * (1 - t.arriere)} width={t.l * 0.82} height={t.h * t.arriere - 8} rx="8" class="benne" />{#each [0.25, 0.4, 0.55, 0.7, 0.85] as q (q)}<path d="M{t.l * 0.14} {t.h * (1 - t.arriere + q * t.arriere - 0.02)} H{t.l * 0.86}" class="trait fin" />{/each}
          {:else}<path d="M{t.l * 0.2} {t.h * (1 - t.arriere)} Q{t.l * 0.5} {t.h * (1 - t.arriere + 0.03)} {t.l * 0.8} {t.h * (1 - t.arriere)}" class="trait" />{/if}
          <rect x={t.l * 0.1} y="5" width={t.l * 0.22} height="7" rx="3.5" class="phare" /><rect x={t.l * 0.68} y="5" width={t.l * 0.22} height="7" rx="3.5" class="phare" />
          <rect x={t.l * 0.1} y={t.h - 11} width={t.l * 0.2} height="5" rx="2.5" class="feu" /><rect x={t.l * 0.7} y={t.h - 11} width={t.l * 0.2} height="5" rx="2.5" class="feu" />
        </svg>
        {#each sieges as s (s.index)}
          <div class="siege {s.etat}" style="left: {s.x}%; top: {s.y}%">
            <i class="coussin"><b>{s.etat === 'occupe' ? s.initiales : s.etat === 'conducteur' ? 'toi' : s.etat === 'libre' ? '+' : ''}</b></i><i class="dos"></i>{#if s.etat === 'conducteur'}<i class="volant"></i>{/if}
          </div>
        {/each}
      </div>
    </div>
  </div>
  <ul class="sr-seulement">{#each sieges as s (s.index)}<li>{s.role === 'conducteur' ? 'Conducteur' : s.etat === 'occupe' ? `Place occupée par ${s.nom}` : s.etat === 'libre' ? 'Place libre' : 'Place non proposée'}</li>{/each}</ul>
  <figcaption>
    <span class="col"><span class="t14 b7 ell">{nom || 'Mon véhicule'}</span><span class="t12 mut ell">{plaque}{note ? ` · ${note}` : ''}</span></span>
    <span class="jauge" role="img" aria-label="{prises} places occupées sur {places}"><b>{jaugeSieges(places, prises)}</b><span class="cv-pastilles">{#each Array.from({ length: places }, (_, k) => k) as k (k)}<i class:f={k >= prises} class:p={k < prises}></i>{/each}</span></span>
  </figcaption>
</figure>

<style>
  .cv-v3d { margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .scene { position: relative; height: 290px; overflow: hidden; perspective: 1100px; perspective-origin: 50% 25%; touch-action: pan-y; cursor: grab; user-select: none; border-radius: 24px; }
  .scene:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .halo { position: absolute; inset: 0; border-radius: 24px; background: radial-gradient(60% 50% at 50% 66%, rgba(124, 108, 255, 0.4), transparent 72%), radial-gradient(40% 26% at 50% 80%, rgba(61, 224, 255, 0.28), transparent 72%); }
  .monde { position: absolute; left: 50%; top: 50%; width: var(--l); height: var(--h); margin: calc(var(--h) / -2 + 18px) 0 0 calc(var(--l) / -2); transform-style: preserve-3d; transform: scale(1.22) rotateX(55deg) rotateZ(var(--az)); transition: transform 0.2s ease-out; --incl: 55deg; }
  .monde > i, .monde > div { position: absolute; display: block; }
  .ombre { inset: -10px -16px; border-radius: 44px; background: rgba(0, 0, 0, 0.6); filter: blur(14px); transform: translateZ(-4px); }
  .anneau { left: 50%; top: 50%; width: 236px; height: 236px; margin: -118px 0 0 -118px; border-radius: 50%; border: 2px dashed rgba(127, 235, 255, 0.45); transform: translateZ(-3px); animation: tourne 30s linear infinite; }
  .tranche { inset: 0; border-radius: 30px / 38px; background: linear-gradient(180deg, color-mix(in srgb, var(--teinte) 62%, #0a0e1c), color-mix(in srgb, var(--teinte) 40%, #05070d)); }
  .plaque { inset: 0; border-radius: 30px / 38px; background: linear-gradient(170deg, color-mix(in srgb, var(--teinte) 96%, #fff), color-mix(in srgb, var(--teinte) 78%, #000)); box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--teinte) 60%, #fff), 0 0 40px -6px color-mix(in srgb, var(--teinte) 60%, transparent); transform-style: preserve-3d; }
  .plaque svg { position: absolute; inset: 0; display: block; overflow: visible; }
  .plaque :global(.trait) { fill: none; stroke: rgba(10, 14, 28, 0.35); stroke-width: 2; stroke-linecap: round; } .plaque :global(.trait.fin) { stroke-width: 1.2; }
  .plaque :global(.puits) { fill: #0b1124; stroke: rgba(127, 235, 255, 0.55); stroke-width: 1.5; }
  .plaque :global(.benne) { fill: color-mix(in srgb, var(--teinte) 35%, #05070d); stroke: rgba(10, 14, 28, 0.6); stroke-width: 2; }
  .plaque :global(.phare) { fill: #effdff; } .plaque :global(.feu) { fill: #ff5bde; }
  .roue { width: 14px; height: 40px; border-radius: 6px; background: #05070d; border: 2px solid #3d4670; transform: translateZ(10px); }
  .roue.ag { left: -10px; top: 12%; } .roue.ad { right: -10px; top: 12%; } .roue.rg { left: -10px; bottom: 9%; } .roue.rd { right: -10px; bottom: 9%; }
  .siege { position: absolute; width: 34px; height: 36px; margin: -18px 0 0 -17px; transform-style: preserve-3d; }
  .siege i { position: absolute; display: block; }
  .coussin { inset: 0 0 8px; display: grid; place-items: center; border-radius: 10px; background: rgba(255, 255, 255, 0.07); border: 1.5px dashed rgba(127, 235, 255, 0.6); transform: translateZ(2px); }
  .coussin b { font: 800 12px 'Sora Variable', 'Sora', sans-serif; color: #06080f; letter-spacing: -0.02em; }
  .siege.libre .coussin b { color: #7febff; font-size: 18px; font-weight: 600; } .siege.conducteur .coussin b { font-size: 11px; }
  .dos { left: 2px; right: 2px; bottom: 0; height: 9px; border-radius: 4px 4px 8px 8px; background: rgba(127, 235, 255, 0.3); transform: translateZ(6px); }
  .siege.libre .coussin { animation: lueur 2.4s ease-in-out infinite; box-shadow: 0 0 16px -2px rgba(61, 224, 255, 0.8); }
  .siege.occupe .coussin { background: linear-gradient(135deg, #ff7be6, #8b7cff); border: 1.5px solid rgba(255, 255, 255, 0.5); box-shadow: 0 0 18px -2px rgba(255, 91, 222, 0.9); transform: translateZ(6px); } .siege.occupe .dos { background: #c06bff; transform: translateZ(12px); }
  .siege.conducteur .coussin { background: linear-gradient(135deg, #3de0ff, #8b7cff); border: 1.5px solid rgba(255, 255, 255, 0.5); transform: translateZ(6px); } .siege.conducteur .dos { background: #8bf0ff; transform: translateZ(12px); }
  .siege.ferme .coussin { background: rgba(255, 255, 255, 0.03); border: 1.5px solid rgba(255, 255, 255, 0.12); } .siege.ferme .dos { background: rgba(255, 255, 255, 0.08); }
  .volant { left: 3px; right: 3px; top: -10px; height: 11px; border-radius: 50%; border: 3px solid #effdff; transform: translateZ(10px); }
  figcaption { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 0 4px; }
  .jauge { display: inline-flex; align-items: center; gap: 8px; } .jauge b { font: 700 18px 'Unbounded Variable', 'Unbounded', sans-serif; }
  .sr-seulement { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @keyframes lueur { 50% { opacity: 0.55; } } @keyframes tourne { to { transform: translateZ(-3px) rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) { .siege.libre .coussin, .anneau { animation: none; } .monde { transition: none; } }
</style>
