<script lang="ts">
  import { MOTIFS_PROBLEME } from '../../core/covoitRegles.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { signalerCovoit } from './covoitActions.ts';

  /** Signaler un problème sur un covoiturage (en fenêtre) : motif + précisions, envoyé à l'équipe AfriMove. */
  let { ouvert = $bindable(false), offreId, auteurId, motifs = MOTIFS_PROBLEME }: { ouvert?: boolean; offreId: string | null; auteurId: string | null; motifs?: readonly string[] } = $props();
  let motif = $state(''), texte = $state(''), erreur = $state('');
  $effect(() => { if (ouvert) { motif = ''; texte = ''; erreur = ''; } });
  function envoyer() {
    if (!offreId || !auteurId) return; erreur = '';
    try { const id = signalerCovoit(offreId, auteurId, motif, texte); montrer(`Signalement ${id} envoyé`); ouvert = false; } catch { erreur = 'Choisis ce qui s’est passé.'; }
  }
</script>

<Feuille bind:ouvert titre="Signaler un problème" sous="L’équipe AfriMove te répond sous 2 h">
  <div class="col g8" role="radiogroup" aria-label="Que s’est-il passé ?">
    {#each motifs as m (m)}<button type="button" role="radio" aria-checked={motif === m} class="cv-ligne" aria-current={motif === m ? 'true' : undefined} onclick={() => (motif = m)}><span class="t14 b7 grow">{m}</span>{#if motif === m}<span class="aq">●</span>{/if}</button>{/each}
  </div>
  <label class="fld"><span class="lab">Précisions (facultatif)</span><textarea class="inp" rows="3" maxlength="300" placeholder="Raconte en deux mots…" bind:value={texte} style="padding: 12px 14px; min-height: 88px"></textarea></label>
  {#if erreur}<div class="cv-err" role="alert">{erreur}</div>{/if}
  {#snippet pied()}<button type="button" class="cv-bouton p" onclick={envoyer}>Envoyer le signalement</button>{/snippet}
</Feuille>
