<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import { aller, routeur, resoudre, type Route } from '../../router.svelte.ts';
  import { RESERVEES } from './reservees.ts';
  /** Page d'attente d'un écran réservé du verso : titre et onglet viennent de la liste des réservées. */
  const modeles: Route[] = RESERVEES.map(([chemin, titre]) => ({ chemin, titre, composant: () => Promise.reject(new Error('modèle')) }));
  const trouve = $derived(resoudre(modeles, routeur.chemin)?.route);
  const onglet = $derived(RESERVEES.find(([c]) => c === trouve?.chemin)?.[2] ?? 'portefeuille');
</script>
<Ecran titre={trouve?.titre ?? 'Bientôt'} face="nuit" {onglet}>
  <div class="carte col g12"><span class="puce signal">Bientôt</span><p class="t-section">{trouve?.titre}</p><p class="t-sec">Cet écran du verso (Mes actifs) arrive avec la prochaine phase.</p>
    <button type="button" class="btn sec" onclick={() => aller('/')}>Retour à l’accueil</button></div>
</Ecran>
