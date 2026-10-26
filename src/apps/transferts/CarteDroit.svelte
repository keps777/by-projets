<script lang="ts">
  import type { ResumeDroit } from './vues.ts';
  /** Mini-billet blanc du droit : trajet, jour, vol et heure, statut. Reste blanc sur la face nuit, comme sur la maquette. */
  let { resume, titreStatut = 'Statut' }: { resume: ResumeDroit; titreStatut?: string } = $props();
</script>
<div class="carte-droit">
  <span class="trajet">{resume.trajet}</span>
  <span class="quand">{resume.jour}<br />{resume.ligne}</span>
  <span class="statut"><span class="s1">{titreStatut}</span><span class="s2">{resume.statut}</span></span>
</div>
<style>
  .carte-droit { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: #fff; color: #121418; min-width: 0; }
  .trajet { font: 700 26px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; white-space: nowrap; }
  .quand { flex: 1; min-width: 0; font: 400 12px/16px 'Barlow', sans-serif; color: #555c6b; }
  .statut { display: flex; flex-direction: column; align-items: flex-end; } .s1 { font: 600 11px/14px 'Barlow', sans-serif; color: #555c6b; } .s2 { font: 700 15px/20px 'Barlow', sans-serif; }
  @media (max-width: 340px) { .trajet { font-size: 22px; } }
</style>
