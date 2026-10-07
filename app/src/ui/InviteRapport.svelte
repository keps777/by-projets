<script lang="ts">
  import Volet from './Volet.svelte';
  import Bouton from './Bouton.svelte';
  import { invitation } from '../screens/rapports/invitation.svelte.ts';
  import { profil } from '../data/requetes.ts';
  import { HEURE_RAPPORT_DEFAUT } from '@core/defauts.ts';

  const heure = $derived(profil()?.heure_rapport ?? HEURE_RAPPORT_DEFAUT);
</script>

<Volet ouvert={invitation.visible} onfermer={() => invitation.plusTard()} label="Envoyer le rapport du jour">
  <div class="invite">
    <span class="kicker">Rapport du jour · {heure}</span>
    <h2 class="titre">Envoyer ton rapport ?</h2>
    <p class="muted">Ta journée est prête à être relue. Tu peux la corriger, puis l’envoyer.</p>
    <Bouton grand plein onclick={() => invitation.ouvrir()}>Relire et envoyer</Bouton>
    <div class="duo">
      <Bouton variante="secondaire" onclick={() => invitation.plusTard()}>Dans 15 min</Bouton>
      <Bouton variante="discret" onclick={() => invitation.pasCeSoir()}>Pas ce soir</Bouton>
    </div>
    <a class="heure" href="/reglages#notifications">Changer l’heure du rapport</a>
  </div>
</Volet>

<style>
  .invite { display: flex; flex-direction: column; gap: 12px; }
  .kicker { font-size: 12px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent-encre); }
  .titre { font-size: 24px; }
  p { margin: 0; font-size: 15px; line-height: 1.45; }
  .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .heure { text-align: center; font-size: 13px; color: var(--accent-encre); font-weight: 600; padding: 8px 0 2px; }
</style>
