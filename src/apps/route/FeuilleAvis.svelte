<script lang="ts">
  import { TAGS_AVIS_CONDUCTEUR, TAGS_AVIS_PASSAGER } from '../../core/covoitRegles.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { personne } from '../../domain/actions.ts';
  import { noterTrajet } from './covoitActions.ts';
  import Etoiles from './Etoiles.svelte';

  /** Avis de fin de trajet (en fenêtre) : étoiles, mots-clés et commentaire ; met à jour la note de la personne notée. */
  let { ouvert = $bindable(false), offreId, deId, pourId, role }: { ouvert?: boolean; offreId: string | null; deId: string | null; pourId: string | null; role: 'conducteur' | 'passager' } = $props();
  let note = $state(0), tags = $state<string[]>([]), texte = $state(''), erreur = $state('');
  $effect(() => { if (ouvert) { note = 0; tags = []; texte = ''; erreur = ''; } });
  const cible = $derived(personne(pourId)), propositions = $derived(role === 'conducteur' ? TAGS_AVIS_CONDUCTEUR : TAGS_AVIS_PASSAGER);
  const basculer = (t: string) => (tags = tags.includes(t) ? tags.filter((x) => x !== t) : [...tags, t]);
  function envoyer() {
    if (!offreId || !deId || !pourId) return; erreur = '';
    if (!note) { erreur = 'Choisis une note de 1 à 5 étoiles.'; return; }
    try { const r = noterTrajet({ offreId, deId, pourId, note, tags, texte }); montrer(`Merci ! Note de ${cible?.prenom ?? 'cette personne'} : ${String(r.note).replace('.', ',')} ★`); ouvert = false; }
    catch (e) { erreur = e instanceof Error && e.message === 'deja_note' ? 'Tu as déjà donné ton avis.' : 'Avis impossible pour le moment.'; }
  }
</script>

<Feuille bind:ouvert titre={role === 'conducteur' ? `Comment était ${cible?.prenom ?? 'ton conducteur'} ?` : `Comment était ${cible?.prenom ?? 'ce passager'} ?`} sous="Ton avis aide toute la communauté">
  <Etoiles bind:valeur={note} label="Note de {cible?.prenom ?? ''}" />
  <div class="chips" style="flex-wrap: wrap; overflow: visible" role="group" aria-label="Points forts">{#each propositions as t (t)}<button type="button" class="ch" class:on={tags.includes(t)} aria-pressed={tags.includes(t)} onclick={() => basculer(t)}>{t}</button>{/each}</div>
  <label class="fld"><span class="lab">Un mot de plus (facultatif)</span><textarea class="inp" rows="2" maxlength="200" bind:value={texte} style="padding: 12px 14px; min-height: 72px"></textarea></label>
  {#if erreur}<div class="cv-err" role="alert">{erreur}</div>{/if}
  {#snippet pied()}<button type="button" class="cv-bouton p" onclick={envoyer}>Envoyer mon avis</button>{/snippet}
</Feuille>
