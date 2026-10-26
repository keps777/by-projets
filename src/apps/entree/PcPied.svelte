<script lang="ts"></script>
<!-- Pied PC (≥ 900 px) des écrans d'entrée qui ont leur propre cadre : bandeau « Mode démo » et mentions. Invisible sur mobile. -->
<footer class="nx pc-pied" data-face="jour"><span class="puce info">Mode démo</span><span class="t-aide">Compagnies (Aérolys, Nordelle), agences, détenteurs, prix et références inventés. Aucun paiement réel. Un droit de voyage est une inscription au registre interne de NexG-TT, pas un placement financier.</span></footer>

<style>
  .pc-pied { display: none; }
  @media (min-width: 900px) { .pc-pied { grid-area: bas; display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 16px max(32px, calc((100% - 1120px) / 2)) 24px; border-top: 1px solid var(--line); } }
</style>
