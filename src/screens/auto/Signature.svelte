<script lang="ts">
  /** Zone de signature au doigt (canvas). `trace` reçoit le tracé en chemin SVG (repère 350 × 140) dès que la signature est assez longue. */
  let { trace = $bindable(''), enregistree = null, nom = '' }: { trace?: string; enregistree?: string | null; nom?: string } = $props();
  const L = 350, H = 140, ECHELLE = 2;
  let canvas: HTMLCanvasElement | undefined = $state();
  let traits: [number, number][][] = [];
  let enCours = false;
  let commence = $state(false);

  const ctx = () => { const c = canvas?.getContext('2d'); if (c) { c.setTransform(ECHELLE, 0, 0, ECHELLE, 0, 0); c.lineWidth = 2.6; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = getComputedStyle(canvas!).color; } return c; };
  const point = (e: PointerEvent): [number, number] => {
    const r = canvas!.getBoundingClientRect(); const k = r.width ? L / r.width : 1;
    return [Math.round((e.clientX - r.left) * k * 10) / 10, Math.round((e.clientY - r.top) * k * 10) / 10];
  };
  const vers = () => traits.map((t) => (t.length === 1 ? `M${t[0][0]} ${t[0][1]} l0.1 0.1` : t.map((p, i) => `${i ? 'L' : 'M'}${p[0]} ${p[1]}`).join(' '))).join(' ');

  function bas(e: PointerEvent) {
    if (!canvas) return;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* sans capture */ }
    enCours = true; commence = true;
    const p = point(e); traits.push([p]);
    const c = ctx(); if (c) { c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo(p[0] + 0.1, p[1] + 0.1); c.stroke(); }
    trace = '';
  }
  function bouge(e: PointerEvent) {
    if (!enCours || !canvas) return;
    const t = traits[traits.length - 1]; const a = t[t.length - 1]; const p = point(e); t.push(p);
    const c = ctx(); if (c) { c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(p[0], p[1]); c.stroke(); }
  }
  function haut() {
    if (!enCours) return; enCours = false;
    trace = traits.some((t) => t.length >= 6) ? vers() : '';
  }
  function effacer() {
    enCours = false; traits = []; commence = false; trace = '';
    const c = canvas?.getContext('2d'); if (c) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas!.width, canvas!.height); }
  }
  function utiliserEnregistree() {
    if (!enregistree) return;
    effacer();
    const c = ctx(); if (c) c.stroke(new Path2D(enregistree));
    commence = true; trace = enregistree;
  }
</script>

<div class="zone">
  <div class="entete">
    <small>Signez avec le doigt</small>
    {#if enregistree}<button class="lien" onclick={utiliserEnregistree}>Utiliser ma signature enregistrée</button>{/if}
  </div>
  <div class="cadre">
    <canvas bind:this={canvas} width={L * ECHELLE} height={H * ECHELLE} aria-label="Zone de signature : dessinez votre signature avec le doigt ou la souris"
      onpointerdown={bas} onpointermove={bouge} onpointerup={haut} onpointercancel={haut}></canvas>
    {#if !commence}<span class="indice" aria-hidden="true">Signez ici</span>{/if}
    <span class="ligne" aria-hidden="true"></span>
  </div>
  <div class="pied"><small>{nom}</small><button class="lien" onclick={effacer} disabled={!commence}>Effacer</button></div>
</div>

<style>
  .zone { display: flex; flex-direction: column; gap: 8px; } .entete, .pied { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  small { color: var(--muted); font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; }
  .lien { min-height: 44px; padding: 0 4px; color: var(--primaire-clair); font-weight: 600; font-size: 13.5px; } .lien:disabled { opacity: 0.4; }
  .cadre { position: relative; aspect-ratio: 5 / 2; border-radius: 18px; background: var(--carte2); border: 1px dashed var(--ligne-forte); overflow: hidden; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; touch-action: none; color: var(--texte); cursor: crosshair; }
  .indice { position: absolute; inset: 0; display: grid; place-items: center; color: var(--faint); font-size: 17px; pointer-events: none; }
  .ligne { position: absolute; left: 6%; right: 6%; bottom: 26%; border-top: 1px solid var(--ligne-forte); pointer-events: none; }
</style>
