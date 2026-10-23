<script lang="ts">
  /** Écran sobre affiché pendant le chargement paresseux d'une route (jamais l'écran précédent). */
  let { portail = false }: { portail?: boolean } = $props();
</script>

<div class="sq" class:portail role="status" aria-busy="true" aria-label="Chargement">
  <div class="haut"><i class="rond"></i><i class="barre titre"></i><i class="rond"></i></div>
  <i class="barre grand"></i>
  <i class="barre"></i>
  <i class="barre court"></i>
  <span class="sr">Chargement…</span>
</div>

<style>
  .sq { padding: calc(env(safe-area-inset-top) + 14px) 16px 24px; display: flex; flex-direction: column; gap: 14px; }
  .sq.portail { padding: 28px 24px; }
  .haut { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 8px; }
  i { display: block; background: var(--carte2); animation: pouls 1.4s ease-in-out infinite; }
  .rond { width: 40px; height: 40px; border-radius: 20px; flex: none; }
  .barre { height: 18px; border-radius: 9px; } .titre { width: 40%; } .grand { height: 110px; border-radius: 20px; } .court { width: 60%; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  @keyframes pouls { 50% { opacity: 0.55; } }
  @media (prefers-reduced-motion: reduce) { i { animation: none; } }
</style>
