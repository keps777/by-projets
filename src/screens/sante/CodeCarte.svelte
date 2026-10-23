<script lang="ts">
  import { codeCarte, secondesRestantesCode } from '../../core/sante.ts';
  import { contenuQr, grouperCode } from '../../core/sante-carte.ts';
  import { qrChemin, qrMatrice } from '../../core/qr.ts';
  import { maintenant } from '../../data/store.svelte.ts';

  /** QR code et code à 6 chiffres de la carte : ils changent toutes les 30 s (même calcul que la vérification du portail). */
  let { numero, taille = 200, compact = false }: { numero: string; taille?: number; compact?: boolean } = $props();
  let now = $state(maintenant());
  $effect(() => { const t = setInterval(() => (now = maintenant()), 1000); return () => clearInterval(t); });
  const code = $derived(codeCarte(numero, now));
  const reste = $derived(secondesRestantesCode(now));
  const matrice = $derived(qrMatrice(contenuQr(numero, code), 'M'));
  const chemin = $derived(qrChemin(matrice));
  const n = $derived(matrice.length);
  const R = 15;
</script>

<div class="cc" class:compact>
  <div class="qr" style:width="{taille}px" style:height="{taille}px">
    <svg viewBox="-2 -2 {n + 4} {n + 4}" role="img" aria-label="QR code de la carte santé à montrer à l'accueil" shape-rendering="crispEdges"><path d={chemin} fill="#0b0f1a" /></svg>
  </div>
  <div class="info">
    <span class="et">CODE DE LA CARTE</span>
    <b class="code mono" aria-label="Code {code.split('').join(' ')}">{grouperCode(code)}</b>
    <span class="reste"><svg width="22" height="22" viewBox="0 0 36 36" aria-hidden="true"><circle cx="18" cy="18" r={R} fill="none" stroke="var(--ligne-forte)" stroke-width="3" /><circle cx="18" cy="18" r={R} fill="none" stroke="var(--bon)" stroke-width="3" stroke-linecap="round" stroke-dasharray={2 * Math.PI * R} stroke-dashoffset={2 * Math.PI * R * (1 - reste / 30)} transform="rotate(-90 18 18)" /></svg>Change dans {reste} s</span>
  </div>
</div>

<style>
  .cc { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .cc.compact { flex-direction: row; gap: 14px; align-items: center; }
  .qr { background: #fff; border-radius: 14px; padding: 8px; flex: none; } .qr svg { width: 100%; height: 100%; display: block; }
  .info { display: flex; flex-direction: column; align-items: center; gap: 4px; } .compact .info { align-items: flex-start; }
  .et { font: 500 10px var(--mono); letter-spacing: 0.12em; color: var(--muted); }
  .code { font-size: 34px; font-weight: 650; letter-spacing: 0.08em; } .compact .code { font-size: 26px; }
  .reste { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--muted); }
</style>
