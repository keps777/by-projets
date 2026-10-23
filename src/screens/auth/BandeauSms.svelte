<script lang="ts">
  import { masquerSms, sms } from './memoire.svelte.ts';
  /** Notification de démonstration : le SMS n'est pas réellement envoyé, son contenu s'affiche ici. */
</script>

{#if sms.visible}
  <aside class="sms" role="status" aria-live="polite" aria-label="SMS de démonstration">
    <span class="ic" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z" /></svg></span>
    <div class="m"><small>MESSAGES · À L'INSTANT · SIMULATION</small><b>{sms.texte}</b></div>
    <button type="button" aria-label="Masquer le SMS de démonstration" onclick={masquerSms}>×</button>
  </aside>
{/if}

<style>
  .sms { position: fixed; z-index: 70; top: calc(env(safe-area-inset-top) + 10px); left: 50%; transform: translateX(-50%); width: min(calc(100% - 24px), 436px); display: flex; align-items: center; gap: 12px; padding: 12px 8px 12px 14px; border-radius: 18px; background: rgba(30, 38, 56, 0.96); backdrop-filter: blur(14px); border: 1px solid var(--ligne-forte); box-shadow: var(--ombre); animation: descend 0.35s cubic-bezier(0.2, 0.8, 0.2, 1); }
  .ic { width: 36px; height: 36px; border-radius: 10px; background: var(--bon); color: #07090f; display: grid; place-items: center; flex: none; }
  .m { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; } small { font: 500 9.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); } b { font-weight: 550; font-size: 13.5px; line-height: 1.35; }
  button { width: 44px; height: 44px; font-size: 24px; color: var(--muted); flex: none; }
  @keyframes descend { from { transform: translate(-50%, -120%); opacity: 0; } }
</style>
