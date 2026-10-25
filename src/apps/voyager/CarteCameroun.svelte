<script lang="ts">
  import { onMount } from 'svelte';
  import { ajuster, arcProjete, chemin, contourProjete, dalle, HAUTEUR, ombreArc, placerEtiquettes, projeterLL, projeterPlan, VILLES_CARTE, VUE_REPOS, BORNES, type LonLat, type Pt, type Vue } from '../../core/cameroun.ts';
  import { animationsFigees, mouvementReduit, type PointVille } from './trajet.ts';

  /** La carte du Cameroun en relief : silhouette extrudée en perspective, dalle de verre quadrillée, villes en points lumineux, étoile au départ, arc « pont » qui se trace vers l'arrivée.
   *  Tout est dessiné en SVG par la projection de `core/cameroun.ts` (aucune image, aucune bibliothèque) ; se penche au doigt (glisser) et revient doucement. */
  let { points, de, vers, onville }: { points: PointVille[]; de: string; vers: string | null; onville: (nom: string) => void } = $props();
  const W = 370, HH = 330, REPOS_I = 54, fige = animationsFigees(), reduit = mouvementReduit();
  const ll = (n: string): LonLat | null => { const v = VILLES_CARTE.find((x) => x.nom === n); return v ? [v.lon, v.lat] : null; };

  // Cadre fixe : la dalle, à plat et en relief, entre dans le dessin avec une réserve pour l'inclinaison.
  const coins = dalle(), cadre = ajuster({ ...VUE_REPOS, inclinaison: REPOS_I }, coins.flatMap((p) => [{ ...p, z: -0.3 }, { ...p, z: HAUTEUR + 1.0 }]), W, HH, 14);
  let lacet = $state(0), inclinaison = $state(fige || reduit ? REPOS_I : 76);
  const vue = $derived<Vue>({ ...cadre, lacet, inclinaison });

  const sol = $derived(coins.map((p) => projeterPlan(p, 0, vue)));
  const tranche = $derived([-0.3, -0.2, -0.1].map((z, i) => ({ d: chemin(coins.map((p) => projeterPlan(p, z, vue))), fill: ['#0a0d22', '#0e1330', '#121840'][i] })));
  const grille = $derived.by(() => {
    const x0 = BORNES.lonMin - 0.55, x1 = BORNES.lonMax + 0.55, y0 = BORNES.latMin - 0.55, y1 = BORNES.latMax + 0.55, seg: string[] = [], f = (p: Pt) => `${Math.round(p.x * 10) / 10} ${Math.round(p.y * 10) / 10}`;
    for (let lon = Math.ceil(x0); lon <= x1; lon++) seg.push(`M${f(projeterLL([lon, y0], 0, vue))}L${f(projeterLL([lon, y1], 0, vue))}`);
    for (let lat = Math.ceil(y0); lat <= y1; lat++) seg.push(`M${f(projeterLL([x0, lat], 0, vue))}L${f(projeterLL([x1, lat], 0, vue))}`);
    return seg.join('');
  });
  const ombre = $derived(chemin(CONTOUR_DECALE.map((p) => projeterLL(p, 0, vue))));
  const couches = $derived(Array.from({ length: 8 }, (_, i) => { const t = i / 7; return { d: chemin(contourProjete(HAUTEUR * t, vue)), fill: `rgb(${Math.round(24 + 44 * t)} ${Math.round(28 + 34 * t)} ${Math.round(78 + 70 * t)})` }; }));
  const dessus = $derived(chemin(contourProjete(HAUTEUR, vue)));
  const reliefs = $derived(RELIEFS.map((r) => { const c = projeterLL([r.lon, r.lat], HAUTEUR, vue), rx = r.r * vue.echelle * c.k; return { cx: c.x, cy: c.y, rx, ry: rx * Math.cos((vue.inclinaison * Math.PI) / 180) * 1.05 + rx * 0.12, c: r.c, a: r.a }; }));

  const villes = $derived(points.map((p) => ({ ...p, ...projeterLL([p.lon, p.lat], HAUTEUR + 0.03, vue) })).sort((a, b) => a.y - b.y));
  // Les étiquettes se placent une fois, sur la vue de repos (elles ne sautent pas de côté quand on penche la carte) : départ d'abord, villes allumées ensuite, villes grisées en dernier.
  const reposVue: Vue = { ...cadre, lacet: 0, inclinaison: REPOS_I };
  const cotes = $derived(placerEtiquettes(points.map((p) => {
    const c = projeterLL([p.lon, p.lat], HAUTEUR + 0.03, reposVue), n = p.nom.length * 6.7 + 16;
    return { id: p.nom, x: c.x, y: c.y, l: p.etat === 'depart' ? Math.max(n, 70) : n, h: p.etat === 'depart' ? 32 : 20, pref: p.cote, rang: p.etat === 'depart' ? 0 : p.etat === 'grisee' ? 2 : 1 };
  }), { w: W, h: HH }, 9, 10));
  const A = $derived(ll(de)), B = $derived(vers ? ll(vers) : null);
  const arc = $derived(A && B ? arcProjete(A, B, vue) : null);
  const dArc = $derived(arc ? chemin(arc, false) : ''), dOmbreArc = $derived(A && B ? chemin(ombreArc(A, B, vue), false) : '');
  const milieu = $derived(arc ? { p: arc[Math.floor(arc.length * 0.6)], q: arc[Math.floor(arc.length * 0.6) + 1] } : null);
  const clef = $derived(`${de}>${vers}`);

  // ---- se penche au doigt (glisser), revient doucement ; une arrivée en douceur à l'ouverture
  let anim = 0, depart: { x: number; y: number; l: number; i: number; id: number } | null = null, glisse = false;
  const ease = (t: number) => 1 - Math.pow(1 - t, 3);
  function versPose(l: number, i: number, ms: number) {
    cancelAnimationFrame(anim);
    if (fige || reduit) { lacet = l; inclinaison = i; return; }
    const l0 = lacet, i0 = inclinaison, t0 = performance.now();
    const pas = (t: number) => { const k = Math.min(1, (t - t0) / ms), e = ease(k); lacet = l0 + (l - l0) * e; inclinaison = i0 + (i - i0) * e; if (k < 1) anim = requestAnimationFrame(pas); };
    anim = requestAnimationFrame(pas);
  }
  onMount(() => { if (!fige && !reduit) versPose(0, REPOS_I, 1100); return () => cancelAnimationFrame(anim); });
  const bas = (e: PointerEvent) => { depart = { x: e.clientX, y: e.clientY, l: lacet, i: inclinaison, id: e.pointerId }; glisse = false; cancelAnimationFrame(anim); };
  function bouge(e: PointerEvent) {
    if (!depart || e.pointerId !== depart.id) return;
    const dx = e.clientX - depart.x, dy = e.clientY - depart.y;
    if (!glisse && Math.hypot(dx, dy) > 6) { glisse = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
    if (!glisse) return;
    lacet = Math.max(-16, Math.min(16, depart.l + dx * 0.22));
    if (e.pointerType === 'mouse') inclinaison = Math.max(40, Math.min(66, depart.i - dy * 0.14));
  }
  function haut() { if (!depart) return; depart = null; if (glisse) versPose(0, REPOS_I, 650); }
  const clic = (e: MouseEvent) => { if (glisse) { e.stopPropagation(); e.preventDefault(); glisse = false; } };
  const pc = (x: number, y: number) => ({ left: `${(x / W) * 100}%`, top: `${(y / HH) * 100}%` });
</script>

<script lang="ts" module>
  import { CONTOUR } from '../../core/cameroun.ts';
  /** Contour décalé vers le sud-est : l'ombre portée du relief sur la dalle. */
  const CONTOUR_DECALE = CONTOUR.map(([lon, lat]) => [lon + 0.16, lat - 0.2] as const);
  /** Reliefs (fausses collines lumineuses sur le dessus) : monts du Sud-Ouest, hautes terres de l'Ouest, Adamaoua, monts Mandara, forêt du Sud. */
  const RELIEFS = [
    { lon: 9.17, lat: 4.2, r: 0.5, c: '#d9ccff', a: 0.55 }, { lon: 10.35, lat: 5.7, r: 1.0, c: '#b3a8ff', a: 0.4 }, { lon: 12.6, lat: 7.0, r: 1.8, c: '#9fb4ff', a: 0.3 },
    { lon: 13.9, lat: 10.6, r: 0.8, c: '#c7bcff', a: 0.4 }, { lon: 12.2, lat: 3.2, r: 1.5, c: '#4fe0c4', a: 0.2 }
  ];
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="carte" class:fige role="group" aria-label="Carte du Cameroun en relief. Glisse pour l’incliner." onpointerdown={bas} onpointermove={bouge} onpointerup={haut} onpointercancel={haut} onclickcapture={clic}>
  <svg viewBox="0 0 {W} {HH}" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id="cm-sol" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1b2150" /><stop offset="1" stop-color="#0c1130" /></linearGradient>
      <linearGradient id="cm-haut" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#4b4fb8" /><stop offset="0.55" stop-color="#363a95" /><stop offset="1" stop-color="#262c78" /></linearGradient>
      <linearGradient id="cm-reflet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.34" /><stop offset="0.32" stop-color="#fff" stop-opacity="0.04" /><stop offset="0.6" stop-color="#fff" stop-opacity="0" /><stop offset="1" stop-color="#7febff" stop-opacity="0.16" /></linearGradient>
      <linearGradient id="cm-bord" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7febff" /><stop offset="1" stop-color="#b3a8ff" /></linearGradient>
      <linearGradient id="cm-arc" gradientUnits="userSpaceOnUse" x1={arc ? arc[0].x : 0} y1={arc ? arc[0].y : 0} x2={arc ? arc[arc.length - 1].x : 1} y2={arc ? arc[arc.length - 1].y : 1}><stop offset="0" stop-color="#ffd36b" /><stop offset="0.45" stop-color="#3de0ff" /><stop offset="1" stop-color="#ff5bde" /></linearGradient>
      <radialGradient id="cm-lueur" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#7c6cff" stop-opacity="0.5" /><stop offset="1" stop-color="#7c6cff" stop-opacity="0" /></radialGradient>
      <filter id="cm-flou" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="4" /></filter><filter id="cm-flou2" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="2.6" /></filter>
      <clipPath id="cm-clip"><path d={dessus} /></clipPath>
    </defs>
    {#each tranche as t, i (i)}<path d={t.d} fill={t.fill} stroke={t.fill} stroke-width="1" stroke-linejoin="round" />{/each}
    <path d={chemin(sol)} fill="url(#cm-sol)" stroke="rgba(127,235,255,.35)" stroke-width="1" stroke-linejoin="round" />
    <ellipse cx={W / 2} cy={HH * 0.55} rx="150" ry="120" fill="url(#cm-lueur)" />
    <path d={grille} fill="none" stroke="rgba(127,235,255,.2)" stroke-width="0.7" />
    <path d={ombre} fill="#02030a" opacity="0.65" filter="url(#cm-flou)" />
    {#each couches as c, i (i)}<path d={c.d} fill={c.fill} stroke={c.fill} stroke-width="0.8" stroke-linejoin="round" />{/each}
    <path d={dessus} fill="url(#cm-haut)" />
    <g clip-path="url(#cm-clip)">
      {#each reliefs as r, i (i)}<ellipse cx={r.cx} cy={r.cy} rx={r.rx} ry={r.ry} fill={r.c} opacity={r.a} filter="url(#cm-flou)" />{/each}
      <path d={dessus} fill="url(#cm-reflet)" />
    </g>
    <path d={dessus} fill="none" stroke="url(#cm-bord)" stroke-width="1.4" stroke-linejoin="round" />

    {#if arc && A && B}
      {#key clef}
        <g class="pont">
          <path d={dOmbreArc} fill="none" stroke="#000" stroke-opacity="0.38" stroke-width="3" stroke-dasharray="2 5" stroke-linecap="round" />
          <path class="trace halo" d={dArc} pathLength="1" fill="none" stroke="url(#cm-arc)" stroke-width="10" stroke-linecap="round" filter="url(#cm-flou2)" />
          <path class="trace" d={dArc} pathLength="1" fill="none" stroke="url(#cm-arc)" stroke-width="4" stroke-linecap="round" />
          <path class="flux" d={dArc} pathLength="1" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" />
          {#if fige && milieu}
            <g transform="translate({milieu.p.x} {milieu.p.y}) rotate({(Math.atan2(milieu.q.y - milieu.p.y, milieu.q.x - milieu.p.x) * 180) / Math.PI})"><circle r="7" fill="#fff" opacity="0.35" /><path d="M-5 -4.5L5 0L-5 4.5Z" fill="#fff" /></g>
          {:else if !reduit}
            <g class="voyageur"><circle r="8" fill="#fff" opacity="0.3" /><circle r="4" fill="#fff" /><path d="M-4.5 -4.5L5.5 0L-4.5 4.5Z" fill="#06080f" /><animateMotion dur="2.4s" begin="0.9s" repeatCount="indefinite" rotate="auto" path={dArc} /></g>
          {/if}
        </g>
      {/key}
    {/if}
  </svg>
  {#each villes as v (v.nom)}
    <button type="button" class="vp {v.etat} c-{cotes[v.nom] ?? 'sans'}" style:left={pc(v.x, v.y).left} style:top={pc(v.x, v.y).top} data-ville={v.nom} data-etat={v.etat} tabindex="-1" aria-hidden="true" onclick={() => onville(v.nom)}>
      {#if v.etat === 'depart'}
        <span class="etoile"><i class="anneau"></i><svg viewBox="0 0 24 24" width="30" height="30"><path d="M12 1.8l2.9 6.6 7.2.7-5.4 4.8 1.6 7-6.3-3.7-6.3 3.7 1.6-7L1.9 9.1l7.2-.7z" fill="#ffc24b" stroke="#fff3cf" stroke-width="1.2" stroke-linejoin="round" /></svg></span>
        <span class="nom">{v.nom}<small>tu es ici</small></span>
      {:else}
        <span class="pt">{#if v.etat !== 'grisee'}<i class="anneau"></i>{/if}</span><span class="nom">{v.nom}</span>
      {/if}
    </button>
  {/each}
</div>

<style>
  /* pleine largeur de la fenêtre (elle met 14 px de marge de chaque côté) */
  .carte { position: relative; width: calc(100% + 28px); margin: 0 -14px; aspect-ratio: 370 / 330; touch-action: pan-y; user-select: none; -webkit-user-select: none; flex: none; }
  svg { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .vp { position: absolute; width: 40px; height: 40px; margin: -20px 0 0 -20px; padding: 0; border: 0; background: transparent; color: #f2f4ff; cursor: pointer; font: 600 11px/1.1 'Geist Mono', monospace; }
  .pt { position: absolute; left: 50%; top: 50%; width: 11px; height: 11px; margin: -5.5px 0 0 -5.5px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 10px 2px rgba(61, 224, 255, 0.9), 0 0 0 2px rgba(5, 7, 13, 0.7); }
  .etoile { position: absolute; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; filter: drop-shadow(0 0 8px rgba(255, 194, 75, 0.95)); animation: bat 1.8s ease-in-out infinite; }
  .etoile svg { position: relative; display: block; }
  .anneau { position: absolute; inset: -4px; border-radius: 50%; border: 2px solid currentColor; opacity: 0; animation: anneau 1.9s ease-out infinite; pointer-events: none; }
  .depart .anneau { color: #ffc24b; inset: 0; } .desservie .anneau { color: #3de0ff; inset: -2px; } .choisie .anneau { color: #ff5bde; inset: -2px; animation-duration: 1.2s; }
  .nom { position: absolute; padding: 3px 7px; border-radius: 999px; background: rgba(5, 7, 13, 0.74); border: 1px solid rgba(255, 255, 255, 0.2); white-space: nowrap; pointer-events: none; text-shadow: 0 1px 2px #000; }
  .nom small { display: block; font-size: 9px; font-weight: 600; color: #ffd98a; letter-spacing: 0.04em; }
  .c-d .nom { left: calc(50% + 10px); top: 50%; transform: translateY(-50%); } .c-g .nom { right: calc(50% + 10px); top: 50%; transform: translateY(-50%); }
  .c-h .nom { bottom: calc(50% + 10px); left: 50%; transform: translateX(-50%); } .c-b .nom { top: calc(50% + 10px); left: 50%; transform: translateX(-50%); }
  .depart .nom { background: rgba(60, 40, 5, 0.82); border-color: rgba(255, 194, 75, 0.7); }
  .c-sans .nom { display: none; }
  .c-hg .nom { right: calc(50% + 5px); bottom: calc(50% + 8px); } .c-hd .nom { left: calc(50% + 5px); bottom: calc(50% + 8px); } .c-bg .nom { right: calc(50% + 5px); top: calc(50% + 8px); } .c-bd .nom { left: calc(50% + 5px); top: calc(50% + 8px); }
  .depart.c-d .nom, .depart.c-g .nom { transform: translateY(-50%); } .depart.c-d .nom { left: calc(50% + 16px); } .depart.c-g .nom { right: calc(50% + 16px); }
  .choisie .pt { background: #ff5bde; width: 14px; height: 14px; margin: -7px 0 0 -7px; box-shadow: 0 0 16px 4px rgba(255, 91, 222, 0.95), 0 0 0 2px rgba(5, 7, 13, 0.7); }
  .choisie .nom { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; text-shadow: none; }
  .grisee .pt { width: 7px; height: 7px; margin: -3.5px 0 0 -3.5px; background: #7f89a8; box-shadow: 0 0 0 2px rgba(5, 7, 13, 0.6); }
  .grisee .nom { color: #a1accb; background: rgba(5, 7, 13, 0.5); border: 1px dashed rgba(255, 255, 255, 0.22); font-weight: 500; }
  .trace { stroke-dasharray: 1; stroke-dashoffset: 1; animation: trace 0.95s cubic-bezier(0.3, 0.7, 0.2, 1) forwards; }
  .trace.halo { opacity: 0.55; }
  .flux { stroke-dasharray: 0.03 0.06; opacity: 0; animation: apparait 0.3s 0.9s forwards, flux 1.2s linear infinite; }
  .voyageur { opacity: 0; animation: apparait 0.2s 0.9s forwards; filter: drop-shadow(0 0 6px #fff); }
  .fige .anneau, .fige .etoile, .fige .flux { animation: none; } .fige .anneau { opacity: 0.55; transform: scale(1.5); } .fige .flux { opacity: 1; }
  @keyframes trace { to { stroke-dashoffset: 0; } }
  @keyframes flux { to { stroke-dashoffset: -0.09; } }
  @keyframes apparait { to { opacity: 1; } }
  @keyframes anneau { from { transform: scale(0.5); opacity: 0.9; } to { transform: scale(2.3); opacity: 0; } }
  @keyframes bat { 50% { transform: scale(1.14); } }
  @media (prefers-reduced-motion: reduce) { .trace { stroke-dashoffset: 0; animation: none; } .flux { opacity: 1; animation: none; } .anneau, .etoile { animation: none; } .anneau { opacity: 0.5; } }
</style>
