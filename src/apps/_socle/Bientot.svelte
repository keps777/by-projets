<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { aller, routeur, ROUTES, resoudre } from '../../router.svelte.ts';
  /** Page d'attente des écrans des phases suivantes. */
  const route = $derived(resoudre(ROUTES, routeur.chemin)?.route);
  const onglet = $derived(routeur.chemin.startsWith('/drops') ? 'drops' : routeur.chemin.startsWith('/compte') || routeur.chemin.startsWith('/pass') || routeur.chemin.startsWith('/aide') || routeur.chemin.startsWith('/notifications') || routeur.chemin.startsWith('/alertes') ? 'compte' : 'portefeuille');
</script>
<Ecran titre={route?.titre ?? 'Bientôt'} face="nuit" {onglet}>
  <div class="carte col g12"><span class="puce signal">Bientôt</span><p class="t-section">{route?.titre}</p><p class="t-sec">Cet écran du verso (Mes actifs) arrive avec la prochaine phase.</p>
    <button type="button" class="btn sec" onclick={() => aller('/')}>Retour à l’accueil</button></div>
</Ecran>
