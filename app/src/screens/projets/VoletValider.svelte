<script lang="ts">
  // Validation d'un sous-projet (spec §6) : récapitulatif réalisé / cible sur toute la période, durée, bilan facultatif.
  import { ecartJours } from '@core/dates.ts';
  import { agreger, valeursEntre } from '@core/metriques.ts';
  import { attenduEntre } from '@core/rapport.ts';
  import type { Jour, Metrique, ValeurSaisie } from '@core/types.ts';
  import type { SousProjetLigne } from '@core/lignes.ts';
  import Volet from '../../ui/Volet.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { validerSousProjet } from '../../data/actions/projets.ts';
  import { periodeTexte, realiseSurCible } from './vues.ts';

  let { ouvert, onfermer, sp, metriques, valeurs, aujourdhui, apres }: {
    ouvert: boolean; onfermer: () => void; sp: SousProjetLigne; metriques: Metrique[]; valeurs: ValeurSaisie[]; aujourdhui: Jour; apres?: () => void;
  } = $props();

  let bilan = $state('');
  $effect(() => { if (ouvert) bilan = sp.bilan ?? ''; });

  const fin = $derived(sp.fin && sp.fin < aujourdhui ? sp.fin : aujourdhui);
  const jours = $derived(Math.max(1, ecartJours(sp.debut, fin) + 1));
  const lignes = $derived(metriques.filter((m) => m.type !== 'reference').map((m) => {
    const realise = agreger(m.type, valeursEntre(valeurs, m.cle, sp.debut, fin));
    const cible = attenduEntre(m, sp, sp.debut, sp.fin ?? fin);
    const pct = cible && realise != null ? Math.round((realise / cible) * 100) : null;
    return { m, texte: realiseSurCible(m, realise, cible), pct };
  }));

  function valider() {
    validerSousProjet(sp.id, bilan.trim() || null);
    dire('Sous-projet terminé · il rejoint l’Archive');
    onfermer();
    apres?.();
  }
</script>

<Volet {ouvert} {onfermer} label="Valider le sous-projet">
  <h2 class="titre">Valider ce sous-projet ?</h2>
  <p class="muted">{sp.nom} · {periodeTexte(sp.debut, sp.fin)} · {jours} jour{jours > 1 ? 's' : ''}</p>
  <div class="carte recap ligne-sep">
    {#each lignes as l (l.m.id)}
      <div class="rang"><span>{l.m.nom}</span><span class="mono">{l.texte}{l.pct != null ? ` · ${l.pct} %` : ''}</span></div>
    {/each}
  </div>
  <label class="champ">Bilan (facultatif)
    <textarea bind:value={bilan} rows="3" placeholder="Ce que Dieu a fait, ce que je retiens…"></textarea>
  </label>
  <Bouton grand plein onclick={valider}>Valider et terminer</Bouton>
  <span class="muted petit">Tu pourras ensuite signer le document. Rien n’est effacé : le sous-projet rejoint l’Archive.</span>
</Volet>

<style>
  h2 { font-size: 22px; }
  .recap { padding: 4px 14px; }
  .rang { display: flex; justify-content: space-between; gap: 10px; padding: 10px 0; font-size: 14px; }
  .rang span:first-child { font-weight: 600; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
  textarea { border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 10px 12px; font-size: 15px; resize: none; }
  .petit { font-size: 12px; text-align: center; }
</style>
