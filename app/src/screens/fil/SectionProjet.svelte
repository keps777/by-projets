<script lang="ts">
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import { metriquesDe, sousProjetsDe } from '../../data/requetes.ts';
  import type { FormulaireTache } from './formulaire-tache.svelte.ts';
  import { abreger } from './vue-blocs.ts';
  import { formatValeur, nomCourtRubrique } from './format.ts';
  import { pasDe, type MesureForm } from './tache.ts';
  import CreationRapide from './CreationRapide.svelte';
  import { ajouterProjet, creerSousProjetRapide, type MesureRapide } from '../../data/actions/projets.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';

  /** Étapes 1 à 3 de l'ajout d'une tâche : projet associé, sous-projets alimentés, ce que la tâche enregistre (spec §7). */
  let { f }: { f: FormulaireTache } = $props();

  const mode = $derived(theme.mode);
  const nb = (n: number) => `${n || 'Aucun'} sous-projet${n > 1 ? 's' : ''}`;

  function ajuster(m: MesureForm, sens: 1 | -1) {
    const v = f.prevu(m);
    if (v == null) return;
    const pas = pasDe(m.type) || 1;
    f.vals = { ...f.vals, [m.cle]: Math.max(0, Math.round((v + sens * pas) * 100) / 100) };
  }
  const valeur = (m: MesureForm) => {
    const v = f.prevu(m);
    if (v == null) return 'à saisir';
    return formatValeur(m.type, v, abreger(m.unite), m.options);
  };
  function nouveauProjet(nom: string) {
    if (!f.rubriqueId) return;
    f.choisirProjet(ajouterProjet(f.rubriqueId, nom));
  }
  function nouveauSousProjet(nom: string, mesure: MesureRapide) {
    if (f.projetId) creerSousProjetRapide(f.projetId, nom, mesure, aujourdhui());
  }
  const lecteurs = (m: MesureForm) => (m.alimente.length > 1 ? `compte dans ${m.alimente.length} sous-projets` : m.alimente.length ? 'compte dans 1 sous-projet' : 'enregistré sur le bloc');
</script>

<div class="section">
  <div class="rang">
    <span class="etiquette">1 · Projet associé</span>
    <Interrupteur actif={f.assoc} label="Associer à un projet" couleur="var(--c)" onchange={(v) => (f.assoc = v)} />
  </div>
  {#if !f.assoc}
    <p class="carte info">Rendez-vous ou réunion : la tâche apparaît dans Le Fil et te rappelle l’heure, sans alimenter aucun sous-projet. Tu pourras l’associer à un projet plus tard.</p>
  {:else}
    <div class="rubriques">
      {#each f.rubriques as r (r.id)}
        <button type="button" class:actif={r.id === f.rubriqueId} aria-pressed={r.id === f.rubriqueId} style={styleCouleur(couleurRubrique(r.couleur, mode))} onclick={() => f.choisirRubrique(r.id)}>{nomCourtRubrique(r.nom)}</button>
      {/each}
    </div>
    <div class="carte liste">
      {#each f.projets as p (p.id)}
        <button type="button" class="projet" class:actif={p.id === f.projetId} aria-pressed={p.id === f.projetId} onclick={() => f.choisirProjet(p.id)}>
          <span class="rond-choix">{#if p.id === f.projetId}<Icone nom="coche" taille={11} trait={3.6} />{/if}</span>
          <span class="col"><span class="nom">{p.nom}</span><span class="muted petit">{nb(sousProjetsDe(p.id).length)}</span></span>
        </button>
      {:else}
        <p class="muted vide">Aucun projet dans cette rubrique.</p>
      {/each}
      {#if f.rubriqueId}<CreationRapide libelle="Nouveau projet" exemple="Nom du projet" oncreer={nouveauProjet} />{/if}
    </div>
  {/if}
</div>

{#if f.assoc && f.projetId}
  <div class="section">
    <span class="etiquette">2 · Sous-projets alimentés</span>
    <div class="carte liste">
      {#each f.sousProjets as s (s.id)}
        <div class="sp">
          <span class="col"><span class="nom">{s.nom}</span><span class="muted petit">Mesure : {metriquesDe(s.id).map((m) => m.nom.toLowerCase()).join(', ') || 'aucune'}</span></span>
          <Interrupteur actif={!f.spOff.includes(s.id)} label="Alimenter {s.nom}" couleur="var(--c)"
            onchange={(v) => (f.spOff = v ? f.spOff.filter((x) => x !== s.id) : [...f.spOff, s.id])} />
        </div>
      {:else}
        <p class="muted vide">Ce projet n’a pas encore de sous-projet : la tâche enregistrera le temps passé.</p>
      {/each}
      <CreationRapide libelle="Nouveau sous-projet" exemple="Nom du sous-projet" avecMesure oncreer={nouveauSousProjet} />
    </div>
  </div>

  <div class="section">
    <span class="etiquette">3 · Ce que cette tâche enregistre</span>
    <div class="carte mesures">
      {#each f.mesures as m (m.cle)}
        {@const v = f.prevu(m)}
        <div class="mesure">
          <span class="col"><span class="nom">{m.cle === 'temps' ? 'Temps' : m.nom}</span><span class="muted petit">{lecteurs(m)}</span></span>
          <span class="pas">
            <button type="button" aria-label="Diminuer {m.nom}" disabled={v == null || m.type === 'choix' || m.type === 'oui_non'} onclick={() => ajuster(m, -1)}>−</button>
            <span class="mono valeur">{valeur(m)}</span>
            <button type="button" aria-label="Augmenter {m.nom}" disabled={v == null || m.type === 'choix' || m.type === 'oui_non'} onclick={() => ajuster(m, 1)}>+</button>
          </span>
        </div>
      {/each}
      <span class="muted petit note">Valeur prévue à chaque occurrence. La saisie réelle se fait ensuite dans le volet du bloc, une seule fois : tous les sous-projets la lisent.</span>
    </div>
  </div>
{/if}

<style>
  .section { display: flex; flex-direction: column; gap: 8px; }
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .nom { font-size: 14px; font-weight: 600; }
  .petit { font-size: 12px; }
  .info { border-radius: 18px; padding: 12px 14px; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .rubriques { display: flex; gap: 6px; overflow-x: auto; margin: -2px -16px; padding: 2px 16px; }
  .rubriques button { position: relative; flex: none; height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .rubriques button.actif { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .liste { border-radius: 20px; overflow: hidden; }
  .projet { width: 100%; border: 0; background: transparent; text-align: left; display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-height: 48px; }
  .projet + .projet, .sp + .sp { border-top: 1px solid var(--ligne); }
  .projet.actif { background: var(--surface-2); }
  .rond-choix { flex: none; width: 22px; height: 22px; border-radius: 11px; border: 2px solid var(--c); display: flex; align-items: center; justify-content: center; color: var(--c-sur); }
  .projet.actif .rond-choix { background: var(--c); }
  .rond-choix { transition: background-color 0.18s ease; }
  /* Hauteurs de la maquette, dont les lignes comptent la marge intérieure en plus (boîte de contenu). */
  .sp { display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-height: 56px; box-sizing: content-box; }
  .vide { padding: 12px 14px; font-size: 13px; line-height: 1.45; }
  .mesures { border-radius: 20px; padding: 4px 14px; }
  .mesure { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px solid var(--ligne); min-height: 56px; box-sizing: content-box; }
  .pas { display: flex; align-items: center; gap: 6px; }
  .pas button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); font-size: 20px; }
  .pas button:disabled { opacity: 0.35; cursor: default; }
  .valeur { min-width: 62px; text-align: center; font-size: 15px; }
  .note { display: block; padding: 10px 0 8px; }
  /* Dessin de la maquette (40 px ou 36 px), zone d'appui portée à 44 px (spec §14). */
  .rubriques button::after { content: ''; position: absolute; inset: -2px 0; }
</style>
