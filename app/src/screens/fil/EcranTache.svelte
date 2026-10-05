<script lang="ts">
  import { untrack } from 'svelte';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { COULEUR_SANS_PROJET, profil } from '../../data/requetes.ts';
  import { aujourdhui as jourCourant, maintenantLocal } from '../../data/temps.svelte.ts';
  import { ajouterTache, supprimerOccurrences, type Portee } from '../../data/actions/taches.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { FormulaireTache } from './formulaire-tache.svelte.ts';
  import SectionProjet from './SectionProjet.svelte';
  import SectionQuand from './SectionQuand.svelte';
  import { modifierOccurrence, modifierSerie, modifierSuivantes } from './edition.ts';
  import { jourValide } from './navigation.ts';
  import { heureProposee, resume } from './tache.ts';
  import { hm, puceJour } from './format.ts';

  /** Formulaire « Nouvelle tâche » / « Modifier la tâche » (spec §7, US-09 à US-13). Monté par NouvelleTache.svelte. */
  let { params = {} }: { params?: Record<string, string> } = $props();

  const aujourdhui = $derived(jourCourant());
  const id = untrack(() => params.id);
  const tache = $derived(id ? magasin.trouver('taches', id) : undefined);
  const occId = routeur.params.get('occ');
  const occ = $derived(occId ? magasin.trouver('occurrences', occId) : undefined);
  const f = new FormulaireTache();

  untrack(() => {
    if (id) { const t = magasin.trouver('taches', id); if (t) f.charger(t); return; }
    const p = routeur.params;
    const jour = jourValide(p.get('jour')) ?? jourCourant();
    const heure = Number(p.get('heure'));
    f.nouvelle(jour, Number.isFinite(heure) && p.has('heure') ? heure : heureProposee(jour, jourCourant(), maintenantLocal().minutes, f.duree),
      p.get('projet'), p.get('sans-projet') === '1', profil()?.rappel_defaut_min ?? 10);
  });

  const style = $derived(styleCouleur(couleurRubrique(f.couleur ?? COULEUR_SANS_PROJET, theme.mode)));
  const texteResume = $derived(resume({ titre: f.titre, heure: f.heure, duree: f.duree, regle: f.regle, nbSousProjets: f.actifs.length, avecProjet: f.assoc, rappel: f.rappel }));
  const recurrente = $derived(!!tache && tache.regle.frequence !== 'une_fois');
  const RAPPELS = [{ v: 0, l: 'À l’heure' }, { v: 5, l: '5 min' }, { v: 10, l: '10 min' }, { v: 15, l: '15 min' }];

  let choixPortee = $state<'modifier' | 'supprimer' | null>(null);

  function valide(): boolean {
    if (!f.titre.trim()) { dire('Donne un titre à la tâche'); return false; }
    if (f.assoc && !f.projetId) { dire('Choisis un projet, ou désactive « Projet associé »'); return false; }
    if (f.fin === 'date' && f.rec !== 'une_fois' && f.finDate < f.debut) { dire('La date de fin précède le jour de début'); return false; }
    return true;
  }

  function terminer(message: string, jour = f.debut) {
    dire(message);
    routeur.aller(jour === aujourdhui ? '/' : `/?jour=${jour}`);
  }

  function enregistrer() {
    if (!valide()) return;
    if (!id) { ajouterTache(f.versNouvelle()); terminer(`Ajouté au Fil · ${puceJour(f.debut, aujourdhui).toLowerCase()} à ${hm(f.heure)}`); return; }
    if (recurrente && occ) { choixPortee = 'modifier'; return; }
    modifierSerie(id, f.versNouvelle(), aujourdhui);
    terminer('Tâche modifiée');
  }

  function appliquer(portee: Portee) {
    choixPortee = null;
    if (!id) return;
    if (portee === 'toute') modifierSerie(id, f.versNouvelle(), aujourdhui);
    else if (portee === 'suivantes' && occ) modifierSuivantes(id, occ.jour, f.versNouvelle());
    else if (portee === 'cette' && occ) { modifierOccurrence(occ.id, occ.jour, f.heure, f.duree, f.rappel); terminer('Cette occurrence est modifiée', occ.jour); return; }
    terminer('Tâche modifiée', occ?.jour ?? f.debut);
  }

  function supprimer(portee: Portee) {
    choixPortee = null;
    if (!id) return;
    supprimerOccurrences(id, portee, occ?.id);
    terminer(portee === 'cette' ? 'Occurrence supprimée' : portee === 'suivantes' ? 'Occurrences suivantes supprimées' : 'Tâche supprimée', occ?.jour ?? aujourdhui);
  }
</script>

{#snippet pied()}
  <span class="muted resume">{texteResume}</span>
  <button type="button" class="valider" onclick={enregistrer}>{id ? 'Enregistrer' : 'Ajouter au Fil'}</button>
{/snippet}

<div class="formulaire" {style}>
  {#if id && !tache}
    <EcranPage onglets={false}>
      <div class="tete"><a class="rond" href="/" aria-label="Fermer"><Icone nom="fermer" taille={18} trait={2.2} /></a><span class="titre">Tâche introuvable</span></div>
      <p class="muted">Cette tâche a peut-être été supprimée.</p>
    </EcranPage>
  {:else}
    <EcranPage onglets={false} gap={18} {pied}>
      <div class="tete">
        <button type="button" class="rond" aria-label="Fermer" onclick={() => routeur.retour('/')}><Icone nom="fermer" taille={18} trait={2.2} /></button>
        <span class="titre">{id ? 'Modifier la tâche' : 'Nouvelle tâche'}</span>
        {#if id}<button type="button" class="supprimer" aria-label="Supprimer la tâche" onclick={() => (recurrente && occ ? (choixPortee = 'supprimer') : supprimer('toute'))}><Icone nom="poubelle" taille={18} /></button>{/if}
      </div>

      <label class="quoi">Quoi ?
        <input class="titre" bind:value={f.titre} aria-label="Titre de la tâche" placeholder="Ex. Rencontre avec Christopher" />
      </label>

      <SectionProjet {f} />
      <SectionQuand {f} numero={f.assoc ? 4 : 2} {aujourdhui} tacheId={id} />

      <div class="section">
        <span class="etiquette">{f.assoc ? 5 : 3} · Rappel</span>
        <div class="carte rappel">
          <div class="rappels">
            {#each RAPPELS as r (r.v)}
              <button type="button" class:actif={f.rappel === r.v} aria-pressed={f.rappel === r.v} onclick={() => (f.rappel = f.rappel === r.v ? null : r.v)}>{r.l}</button>
            {/each}
          </div>
          <span class="muted petit">{f.rappel == null ? 'Aucun rappel pour cette tâche. Touche un délai pour en ajouter un.' : 'Notification sur ton iPhone : la toucher ouvre l’écran Action rapide (Lancer, Reporter).'}</span>
        </div>
      </div>
    </EcranPage>
  {/if}
</div>

<Volet ouvert={choixPortee !== null} onfermer={() => (choixPortee = null)} label={choixPortee === 'supprimer' ? 'Supprimer' : 'Modifier'}>
  <div class="portee">
    <h2 class="titre">{choixPortee === 'supprimer' ? 'Supprimer une tâche qui se répète' : 'Modifier une tâche qui se répète'}</h2>
    {#if occ}
      <button type="button" onclick={() => (choixPortee === 'supprimer' ? supprimer('cette') : appliquer('cette'))}>
        <span class="t">Cette occurrence</span><span class="muted s">{puceJour(occ.jour, aujourdhui)}{choixPortee === 'modifier' ? ' · seuls l’heure, la durée et le rappel changent' : ''}</span>
      </button>
      <button type="button" onclick={() => (choixPortee === 'supprimer' ? supprimer('suivantes') : appliquer('suivantes'))}>
        <span class="t">Celle-ci et les suivantes</span><span class="muted s">Le passé reste tel quel</span>
      </button>
    {/if}
    <button type="button" class:danger={choixPortee === 'supprimer'} onclick={() => (choixPortee === 'supprimer' ? supprimer('toute') : appliquer('toute'))}>
      <span class="t">Toute la série</span><span class="muted s">{choixPortee === 'supprimer' ? 'Les blocs déjà faits sont gardés' : 'Les occurrences à venir sont recalculées, avec leurs rappels'}</span>
    </button>
  </div>
</Volet>

<style>
  .formulaire { display: contents; }
  /* En-tête fixe comme la maquette (le « top » négatif annule la marge intérieure de la zone qui défile) (16 px en haut, 8 px dessous, puis 4 px avant « Quoi ? ») : il reste en place quand le formulaire défile. */
  .tete { display: flex; align-items: center; gap: 10px; position: sticky; top: calc(-20px - var(--haut-sûr)); z-index: 5; background: var(--fond);
    margin: calc(-20px - var(--haut-sûr)) -16px -14px; padding: calc(16px + var(--haut-sûr)) 16px 8px; }
  /* Pied de la maquette : 18 px sous le bouton (plus la zone sûre de l'iPhone). */
  .formulaire :global(.pied) { padding-bottom: calc(18px + var(--bas-sûr)); }
  .tete .titre { font-size: 20px; flex: 1; }
  .supprimer { width: 44px; height: 44px; border-radius: 22px; border: 1px solid var(--ligne); background: var(--surface); color: var(--mauvais); display: flex; align-items: center; justify-content: center; }
  .quoi { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .quoi input { height: 56px; border-radius: 16px; border: 1px solid var(--ligne); background: var(--surface); font-size: 22px; letter-spacing: -0.01em; padding: 0 14px; color: var(--texte); transition: border-color 0.18s ease; }
  .quoi input:focus { outline: none; border-color: var(--c); }
  .section { display: flex; flex-direction: column; gap: 8px; }
  .rappel { border-radius: 20px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .rappels { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .rappels button { height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; font-size: 12px; font-weight: 600; }
  .rappels button.actif { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .petit { font-size: 12px; }
  .resume { font-size: 12px; line-height: 1.4; }
  .valider { height: 54px; border-radius: 18px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 16px; font-weight: 600; }
  .portee { display: flex; flex-direction: column; gap: 8px; }
  .portee h2 { font-size: 22px; margin-bottom: 4px; }
  .portee button { min-height: 56px; border-radius: 16px; border: 1px solid var(--ligne); background: var(--surface); text-align: left; padding: 10px 14px; display: flex; flex-direction: column; gap: 2px; }
  .portee button.danger .t { color: var(--mauvais); }
  .portee .t { font-size: 15px; font-weight: 600; }
  .portee .s { font-size: 12px; }
</style>
