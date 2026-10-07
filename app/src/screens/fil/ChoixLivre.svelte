<script lang="ts">
  import { cleDuLivre } from '@core/lignes.ts';
  import Icone from '../../ui/Icone.svelte';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { valeursDuProjet } from '../../data/requetes.ts';
  import { catalogueDeLivres, proposerLivres, type LivreCatalogue } from '../../data/catalogue-livres.ts';
  import type { FormulaireTache } from './formulaire-tache.svelte.ts';

  /** « Livre lu » d'une tâche dont le projet suit des livres (LLC → point CL) : un livre en cours, ou un nouveau avec ses pages. */
  let { f }: { f: FormulaireTache } = $props();

  const catalogue = $derived(catalogueDeLivres(magasin.lignes.points_rapport));
  const propositions = $derived(f.livreNouveau && f.pointLivres ? proposerLivres(f.livreNouveau.titre, catalogue, f.pointLivres.livres ?? [], f.livreNouveau.titre.trim() ? 5 : 8) : []);
  const lues = (id: string) => (valeursDuProjet(f.projetId ?? '').filter((v) => v.cle === cleDuLivre(id)).reduce((s, v) => s + v.valeur, 0));
  const etat = (l: { id: string; total: number | null; depart: number }) => `${(l.depart || 0) + lues(l.id)}${l.total ? `/${l.total}` : ''} p lues`;

  const choisir = (id: string | null) => { f.livreNouveau = null; f.livreId = id; };
  const nouveau = () => { f.livreId = null; f.livreNouveau = { titre: '', auteur: '', total: '', depart: '' }; };
  function proposition(l: LivreCatalogue) {
    if (f.livreNouveau) f.livreNouveau = { ...f.livreNouveau, titre: l.titre, auteur: l.auteur, total: l.total ? String(l.total) : f.livreNouveau.total };
  }
</script>

<div class="section" role="group" aria-label="Livre lu">
  <span class="etiquette">Livre lu</span>
  <div class="carte liste">
    {#each f.livresEnCours as l (l.id)}
      {@const on = !f.livreNouveau && f.livreId === l.id}
      <button type="button" class="ligne" class:actif={on} aria-pressed={on} onclick={() => choisir(l.id)}>
        <span class="rond-choix">{#if on}<Icone nom="coche" taille={11} trait={3.6} />{/if}</span>
        <span class="col"><span class="nom">{l.titre}{l.auteur ? ` (${l.auteur})` : ''}</span><span class="muted petit">{etat(l)}</span></span>
      </button>
    {/each}
    <button type="button" class="ligne" class:actif={!f.livre} aria-pressed={!f.livre} onclick={() => choisir(null)}>
      <span class="rond-choix">{#if !f.livre}<Icone nom="coche" taille={11} trait={3.6} />{/if}</span>
      <span class="col"><span class="nom">Aucun livre</span><span class="muted petit">La tâche ne rapporte pas de pages à un livre.</span></span>
    </button>
    {#if !f.livreNouveau}
      <button type="button" class="nouveau-lien" onclick={nouveau}><Icone nom="plus" taille={16} trait={2.4} /> Nouveau livre</button>
    {:else}
      <div class="forme">
        <!-- svelte-ignore a11y_autofocus -->
        <input type="text" bind:value={f.livreNouveau.titre} placeholder="Titre du livre" aria-label="Titre du livre" autocomplete="off" autofocus />
        {#if propositions.length}
          <div class="propositions" role="group" aria-label="Livres proposés">
            {#each propositions as l (l.titre)}
              <button type="button" class="prop" onclick={() => proposition(l)}>{l.titre}{l.auteur ? ` · ${l.auteur}` : ''}{l.total ? ` · ${l.total} p` : ''}</button>
            {/each}
          </div>
        {/if}
        <input type="text" bind:value={f.livreNouveau.auteur} placeholder="Auteur ou initiales (ZTF)" aria-label="Auteur du livre" autocomplete="off" />
        <span class="deux">
          <input class="mono" bind:value={f.livreNouveau.total} inputmode="numeric" placeholder="Pages au total" aria-label="Pages au total" />
          <input class="mono" bind:value={f.livreNouveau.depart} inputmode="numeric" placeholder="Déjà lues" aria-label="Pages déjà lues" />
        </span>
        <button type="button" class="annuler" onclick={() => (f.livreNouveau = null)}>Annuler le nouveau livre</button>
      </div>
    {/if}
  </div>
</div>

<style>
  .section { display: flex; flex-direction: column; gap: 8px; }
  .liste { border-radius: 20px; overflow: hidden; }
  .ligne { width: 100%; border: 0; background: transparent; text-align: left; display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-height: 52px; }
  .ligne + .ligne, .nouveau-lien, .forme { border-top: 1px solid var(--ligne); }
  .ligne.actif { background: var(--surface-2); }
  .rond-choix { flex: none; width: 22px; height: 22px; border-radius: 11px; border: 2px solid var(--c); display: flex; align-items: center; justify-content: center; color: var(--c-sur); transition: background-color 0.18s ease; }
  .ligne.actif .rond-choix { background: var(--c); }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .nom { font-size: 14px; font-weight: 600; }
  .petit { font-size: 12px; }
  .nouveau-lien { width: 100%; min-height: 48px; border-left: 0; border-right: 0; border-bottom: 0; background: transparent; display: flex; align-items: center; gap: 8px; padding: 0 14px; font-size: 14px; font-weight: 600; color: var(--accent-encre); text-align: left; }
  .forme { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; }
  .forme input { width: 100%; min-height: 46px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); padding: 0 12px; font-size: 16px; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .propositions { display: flex; flex-direction: column; gap: 2px; max-height: 190px; overflow-y: auto; overscroll-behavior: contain; border-radius: 12px; border: 1px solid var(--ligne); padding: 2px; }
  .prop { min-height: 44px; border: 0; border-radius: 10px; background: transparent; text-align: left; padding: 0 10px; font-size: 14px; font-weight: 600; color: var(--accent-encre); }
  .annuler { min-height: 44px; border: 0; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; }
</style>
