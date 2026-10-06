<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import type { NouvelleMetrique } from '../../data/actions/projets.ts';
  import type { ChoixMesure } from './catalogue-metriques.ts';

  /** Création en une ligne d'un projet (nom seul) ou d'un sous-projet (nom + mesures choisies dans le catalogue), sans quitter « Nouvelle tâche ». */
  let { libelle, exemple, mesures = null, oncreer }: {
    libelle: string; exemple: string; mesures?: ChoixMesure[] | null; oncreer: (nom: string, metriques: NouvelleMetrique[]) => void;
  } = $props();

  let ouvert = $state(false);
  let liste = $state(false);
  let nom = $state('');
  let choisies = $state<string[]>(['temps']);

  const retenues = $derived((mesures ?? []).filter((m) => choisies.includes(m.cle)));
  const resume = $derived(retenues.length ? retenues.map((m) => m.nom).join(', ') : 'Choisir les mesures');
  const groupes = $derived([
    { titre: 'Déjà dans tes projets', items: (mesures ?? []).filter((m) => m.groupe === 'projets') },
    { titre: 'Mesures de l’app', items: (mesures ?? []).filter((m) => m.groupe === 'app') }
  ].filter((g) => g.items.length));

  const bascule = (cle: string) => (choisies = choisies.includes(cle) ? choisies.filter((c) => c !== cle) : [...choisies, cle]);
  const pret = $derived(!!nom.trim() && (mesures === null || retenues.length > 0));

  function fermer() { ouvert = false; liste = false; nom = ''; choisies = ['temps']; }
  function creer() {
    if (!pret) return;
    oncreer(nom.trim(), retenues.map((m) => m.metrique));
    fermer();
  }
</script>

{#if !ouvert}
  <button type="button" class="ouvrir" onclick={() => (ouvert = true)}><Icone nom="plus" taille={16} trait={2.4} /> {libelle}</button>
{:else}
  <form class="forme" onsubmit={(e) => { e.preventDefault(); creer(); }}>
    <!-- svelte-ignore a11y_autofocus -->
    <input type="text" bind:value={nom} placeholder={exemple} aria-label={libelle} autocomplete="off" enterkeyhint="done" autofocus />
    {#if mesures}
      <button type="button" class="menu" aria-expanded={liste} aria-haspopup="listbox" onclick={() => (liste = !liste)}>
        <span class="col"><span class="petit muted">Ce que le sous-projet mesure</span><span class="resume">{resume}</span></span>
        <span class="chevron" class:ouvert={liste}><Icone nom="bas" taille={16} trait={2.4} /></span>
      </button>
      {#if liste}
        <div class="options" role="listbox" aria-multiselectable="true" aria-label="Mesures disponibles">
          {#each groupes as g (g.titre)}
            <span class="groupe">{g.titre}</span>
            {#each g.items as m (m.cle)}
              {@const on = choisies.includes(m.cle)}
              <button type="button" role="option" aria-selected={on} class="option" class:on onclick={() => bascule(m.cle)}>
                <span class="case">{#if on}<Icone nom="coche" taille={11} trait={3.6} />{/if}</span>
                <span class="col"><span class="nom">{m.nom}</span><span class="petit muted">{m.detail}</span></span>
              </button>
            {/each}
          {/each}
        </div>
      {/if}
    {/if}
    <div class="actions">
      <button type="button" class="annuler" onclick={fermer}>Annuler</button>
      <button type="submit" class="creer" disabled={!pret}>Créer</button>
    </div>
  </form>
{/if}

<style>
  .ouvrir { width: 100%; min-height: 48px; border: 0; border-top: 1px solid var(--ligne); background: transparent; display: flex; align-items: center; gap: 8px; padding: 0 14px; font-size: 14px; font-weight: 600; color: var(--accent-encre); text-align: left; }
  .forme { display: flex; flex-direction: column; gap: 10px; padding: 12px 14px; border-top: 1px solid var(--ligne); }
  input { width: 100%; min-height: 46px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); padding: 0 12px; font-size: 16px; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; text-align: left; }
  .petit { font-size: 12px; }
  .menu { width: 100%; min-height: 54px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); display: flex; align-items: center; gap: 10px; padding: 6px 12px; }
  .resume { font-size: 14px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .chevron { flex: none; display: flex; transition: transform 0.18s ease; }
  .chevron.ouvert { transform: rotate(180deg); }
  .options { max-height: 300px; overflow-y: auto; overscroll-behavior: contain; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); }
  .groupe { display: block; padding: 10px 12px 4px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .option { width: 100%; min-height: 48px; border: 0; background: transparent; display: flex; align-items: center; gap: 10px; padding: 6px 12px; }
  .option + .option { border-top: 1px solid var(--ligne); }
  .nom { font-size: 14px; font-weight: 600; }
  .case { flex: none; width: 22px; height: 22px; border-radius: 7px; border: 2px solid var(--c); display: flex; align-items: center; justify-content: center; color: var(--c-sur); }
  .option.on .case { background: var(--c); }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .actions button { min-height: 44px; padding: 0 18px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; font-size: 14px; font-weight: 600; }
  .actions .creer { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .actions .creer:disabled { opacity: 0.4; }
</style>
