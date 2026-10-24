<script lang="ts">
  import { qrChemin, qrMatrice } from '../core/qr.ts';
  /** QR code réel (encodeur maison, versions 1 à 6), dessiné en SVG. */
  let { texte, taille = 160, fond = '#fff', encre = '#06080F', libelle = 'Code QR' }: { texte: string; taille?: number; fond?: string; encre?: string; libelle?: string } = $props();
  const m = $derived(qrMatrice(texte, 'M'));
  const n = $derived(m.length);
  const d = $derived(qrChemin(m));
</script>

<svg width={taille} height={taille} viewBox="-2 -2 {n + 4} {n + 4}" role="img" aria-label={libelle} shape-rendering="crispEdges"><rect x="-2" y="-2" width={n + 4} height={n + 4} fill={fond} /><path {d} fill={encre} /></svg>
