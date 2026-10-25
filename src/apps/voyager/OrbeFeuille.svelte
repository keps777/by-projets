<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import OrbeContenu from './OrbeContenu.svelte';
  import { overlays, fermerOrbe } from '../../ui/overlays.svelte.ts';

  /** L'orbe du dock en fenêtre : monte du bas SUR la page courante (voile flouté), contenu identique à la page `/orbe`. Choisir une action ferme la fenêtre puis navigue. */
</script>

<Feuille bind:ouvert={overlays.orbe} titre="Tout AfriMove" sous="Chercher ou aller n’importe où" hauteur="haute">
  <OrbeContenu fenetre apres={fermerOrbe} />
</Feuille>
