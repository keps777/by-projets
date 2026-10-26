<script lang="ts">
  import { toast } from './toast.svelte.ts';
</script>
<div class="hote" aria-live="polite" role="status">{#if toast.message}<div class="toast {toast.ton}">{toast.message}</div>{/if}</div>
<style>
  .hote { position: fixed; left: 50%; bottom: 96px; transform: translateX(-50%); z-index: 90; width: min(92vw, 420px); pointer-events: none; }
  .toast { padding: 12px 16px; border-radius: 14px; background: #1D2027; color: #F3F4F6; border: 1px solid #3A3F4B; font: 600 14px/18px 'Barlow', sans-serif; box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35); animation: ent 0.2s; }
  .toast.er { border-color: #FF7B7B; } .toast.wa { border-color: #FFD23F; }
  @keyframes ent { from { opacity: 0; transform: translateY(8px); } }
</style>
