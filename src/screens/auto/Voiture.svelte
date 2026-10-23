<script lang="ts">
  /** Photo stylisée d'un véhicule (SVG), de profil. La couleur de carrosserie vient de la fiche. */
  let { type = 'voiture', couleur = '#C9CFDC', titre = '' }: { type?: 'voiture' | 'moto'; couleur?: string; titre?: string } = $props();
  const id = `g${Math.random().toString(36).slice(2, 8)}`;
</script>

<svg viewBox="0 0 240 130" role="img" aria-label={titre || (type === 'moto' ? 'Moto' : 'Voiture')} preserveAspectRatio="xMidYMid meet">
  <defs>
    <linearGradient id="{id}c" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0.38" /><stop offset="0.55" stop-color="#fff" stop-opacity="0" /><stop offset="1" stop-color="#000" stop-opacity="0.28" /></linearGradient>
    <radialGradient id="{id}s" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#000" stop-opacity="0.45" /><stop offset="1" stop-color="#000" stop-opacity="0" /></radialGradient>
  </defs>
  <ellipse cx="120" cy="112" rx="104" ry="8" fill="url(#{id}s)" />
  {#if type === 'moto'}
    <g stroke-linecap="round" stroke-linejoin="round">
      <circle cx="58" cy="88" r="22" fill="#10141f" stroke="#2a3148" stroke-width="3" /><circle cx="58" cy="88" r="9" fill="#8b94a9" />
      <circle cx="186" cy="88" r="22" fill="#10141f" stroke="#2a3148" stroke-width="3" /><circle cx="186" cy="88" r="9" fill="#8b94a9" />
      <path d="M58 88 L92 60 L146 60 L186 88" fill="none" stroke="#3a4156" stroke-width="6" />
      <path d="M150 62 L160 36 L178 34 M160 40 L186 88" fill="none" stroke="#3a4156" stroke-width="5" />
      <rect x="86" y="70" width="52" height="22" rx="6" fill="#222a3d" />
      <path d="M96 56 Q100 40 122 42 L148 46 Q154 56 146 62 L100 62 Z" fill={couleur} /><path d="M96 56 Q100 40 122 42 L148 46 Q154 56 146 62 L100 62 Z" fill="url(#{id}c)" />
      <path d="M62 54 Q80 48 98 54 L98 62 L66 62 Q58 62 62 54 Z" fill="#0f1422" />
      <circle cx="174" cy="42" r="6" fill="#ffe9a8" />
    </g>
  {:else}
    <g stroke-linejoin="round">
      <path d="M16 90 L16 70 Q16 60 30 58 L62 52 L86 30 Q91 25 100 25 L150 25 Q160 25 167 32 L190 54 L214 60 Q226 63 226 74 L226 90 Z" fill={couleur} />
      <path d="M16 90 L16 70 Q16 60 30 58 L62 52 L86 30 Q91 25 100 25 L150 25 Q160 25 167 32 L190 54 L214 60 Q226 63 226 74 L226 90 Z" fill="url(#{id}c)" />
      <path d="M92 33 L124 33 L124 53 L72 53 Z M130 33 L150 33 Q155 33 159 37 L177 53 L130 53 Z" fill="#0f1a2e" fill-opacity="0.78" />
      <rect x="123" y="33" width="7" height="20" fill={couleur} /><rect x="16" y="82" width="210" height="8" fill="#000" fill-opacity="0.18" />
      <path d="M216 66 L226 70 L226 76 L214 76 Z" fill="#ffe9a8" /><rect x="16" y="68" width="8" height="8" rx="2" fill="#ff7272" />
      <circle cx="64" cy="90" r="22" fill="#0b0e17" /><circle cx="64" cy="90" r="17" fill="#1b2133" stroke="#2f3750" stroke-width="2" /><circle cx="64" cy="90" r="7" fill="#aab2c6" />
      <circle cx="176" cy="90" r="22" fill="#0b0e17" /><circle cx="176" cy="90" r="17" fill="#1b2133" stroke="#2f3750" stroke-width="2" /><circle cx="176" cy="90" r="7" fill="#aab2c6" />
    </g>
  {/if}
</svg>

<style>
  svg { display: block; width: 100%; height: auto; }
</style>
