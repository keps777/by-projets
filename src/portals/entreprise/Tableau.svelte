<script lang="ts">
  import './portail.css';
  import { jourLong } from '../../core/dates.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import Entete from './Entete.svelte';
  import { lien } from './nav.ts';
  import { ent } from './etat.ts';
  import { simulerValidationDossier } from './actions.ts';
  import { lignes, prochainePaieEntreprise } from './vues.ts';
  import Synthese from './Synthese.svelte';
  import Salaries from './Salaries.svelte';
  import Retenues from './Retenues.svelte';
  import Attestations from './Attestations.svelte';
  import Parametres from './Parametres.svelte';
  import FicheSalarie from './FicheSalarie.svelte';
  import ImportCsv from './ImportCsv.svelte';
  import Invitations from './Invitations.svelte';
  import AttestationVue from './AttestationVue.svelte';

  ent(); // crée la tranche à l'ouverture (démo : entreprise de démonstration ; compte vierge : vide)
  const VUES = [['synthese', 'Tableau de bord'], ['salaries', 'Salariés'], ['retenues', 'Retenues de paie'], ['attestations', 'Attestations'], ['parametres', 'Paramètres']] as const;
  type Vue = (typeof VUES)[number][0];
  const vue: Vue = $derived((VUES.find((v) => v[0] === param('vue'))?.[0] ?? 'synthese') as Vue);
  const allerVue = (v: string) => aller(v === 'synthese' ? '/portail/entreprise' : `/portail/entreprise?vue=${v}`);

  const e = $derived(ent().entreprise);
  const ls = $derived(lignes());
  const prochaine = $derived(prochainePaieEntreprise());
  let ficheId: string | null = $state(null);
  let importOuvert = $state(false);
  let inviteOuvert = $state(false);
  let attestationId: string | null = $state(null);
  const fiche = $derived(ls.find((l) => l.id === ficheId) ?? null);
  let ficheOuverte = $state(false);
  $effect(() => { if (!ficheOuverte) ficheId = null; });
  const ouvrirFiche = (id: string) => { ficheId = id; ficheOuverte = true; };
  const nav = $derived({ ouvrirFiche, importer: () => (importOuvert = true), inviter: () => (inviteOuvert = true), allerVue, voirAttestation: (id: string) => (attestationId = id) });
</script>

<svelte:head><title>Espace employeur · AssureMe</title></svelte:head>
<div class="pe">
  {#snippet actions()}
    {#if e}<button class="btn prim" onclick={() => (inviteOuvert = true)}>Inviter des salariés</button>{/if}
    <a class="btn" href="/portail/entreprise/inscription" use:lien>{e ? 'Modifier le dossier' : 'Inscrire mon entreprise'}</a>
  {/snippet}
  <Entete espace={e ? `Espace employeur · ${e.raisonSociale}` : 'Espace employeur'} droite={actions} />

  {#if !e}
    <section class="carte vide-page" aria-labelledby="t-vide">
      <h1 id="t-vide">Aucune entreprise inscrite</h1>
      <p class="doux">Inscrivez votre entreprise pour inviter vos salariés, suivre les retenues de paie et prendre en charge une part de leur Pass santé.</p>
      <a class="btn prim" href="/portail/entreprise/inscription" use:lien>Inscrire mon entreprise</a>
    </section>
  {:else}
    {#if e.statut === 'envoye'}
      <div class="bandeau" role="status">
        <p><b>Dossier en cours de validation.</b> La part du Pass prise en charge ne s'applique à vos salariés qu'après validation par l'équipe partenaires.</p>
        <button class="btn" onclick={() => { simulerValidationDossier(); montrer('Dossier validé (simulation)'); }}>Simuler la validation (démo)</button>
      </div>
    {/if}
    <nav aria-label="Sections de l'espace employeur" class="onglets">
      {#each VUES as [id, nom] (id)}
        <a href={id === 'synthese' ? '/portail/entreprise' : `/portail/entreprise?vue=${id}`} use:lien aria-current={vue === id ? 'page' : undefined} class:on={vue === id}>{nom}</a>
      {/each}
    </nav>
    <main>
      {#if vue === 'synthese'}<Synthese {nav} {ls} {prochaine} />
      {:else if vue === 'salaries'}<Salaries {nav} {ls} />
      {:else if vue === 'retenues'}<Retenues {ls} />
      {:else if vue === 'attestations'}<Attestations {nav} {ls} />
      {:else}<Parametres />{/if}
    </main>
    <p class="doux pied">{prochaine ? `Prochaine paie : ${jourLong(prochaine)}. ` : ''}Simulation : aucun SMS ni virement réel n'est émis.</p>

    <FicheSalarie bind:ouvert={ficheOuverte} ligne={fiche} {nav} />
    <ImportCsv bind:ouvert={importOuvert} />
    <Invitations bind:ouvert={inviteOuvert} />
    <AttestationVue bind:id={attestationId} />
  {/if}
</div>

<style>
  .vide-page { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; max-width: 560px; margin-top: 24px; padding: 28px; }
  .bandeau { display: flex; gap: 14px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: #fff1e6; border: 1px solid #f3c9a6; color: #5c2a04; border-radius: 14px; padding: 12px 16px; margin-bottom: 12px; }
  .onglets { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1px solid var(--ligne); margin-bottom: 18px; }
  .onglets a { display: inline-flex; align-items: center; min-height: 48px; padding: 0 14px; white-space: nowrap; font-weight: 500; color: var(--muted); border-bottom: 3px solid transparent; margin-bottom: -1px; }
  .onglets a:hover { color: var(--texte); } .onglets a.on { color: var(--primaire); border-bottom-color: var(--primaire); font-weight: 700; }
  main { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .pied { margin-top: 28px; font-size: 13px; }
</style>
