<script lang="ts">
  // Nouveau sous-projet (planches NouveauSousProjet, NouveauSousProjetFinances) : modèles par rubrique, nom, période,
  // reprise du passé, métriques modifiables, calculs automatiques (spec §4, §6, US-15 à US-17).
  // Paramètres de recherche : ?projet=<id> (projet visé), ?rubrique=<id>.
  import { untrack } from 'svelte';
  import { minJour } from '@core/dates.ts';
  import { OPTIONS_JEUNE, ORDRE_TYPES, TYPES } from '@core/metriques.ts';
  import { modelesDeLaRubrique, type ModeleSousProjet, type RubriqueCle } from '@core/modeles.ts';
  import type { TypeMetrique } from '@core/types.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Volet from '../../ui/Volet.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { projetsDe, rubriques, valeursDuProjet } from '../../data/requetes.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';
  import { creerSousProjet } from '../../data/actions/projets.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import EditeurMetrique from './EditeurMetrique.svelte';
  import {
    calculsProposes, cibleParDefaut, cleDe, MOIS_LONGS, periodePour, periodeTexte, problemesMetriques, resumeReprise, type Brouillon, type ChoixPeriode
  } from './vues.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const NOMS_COURTS: Record<string, string> = { dieu: 'Relation avec Dieu', service: 'Service à Dieu', travail: 'Travail et études', vie: 'Vie personnelle', transversal: 'Transversal' };
  const PERIODES: { valeur: ChoixPeriode; label: string }[] = [
    { valeur: 'semaine', label: 'Semaine' }, { valeur: 'mois', label: 'Ce mois' }, { valeur: 'dates', label: 'Dates' }, { valeur: 'sans_fin', label: 'Sans fin' }
  ];

  const jour = $derived(aujourdhui());
  const rubs = $derived(rubriques());
  const projetVise = untrack(() => magasin.trouver('projets', routeur.params.get('projet')));

  let rubriqueId = $state(untrack(() => projetVise?.rubrique_id ?? routeur.params.get('rubrique') ?? rubriques()[0]?.id ?? ''));
  let modele = $state<number | null>(null);
  let projetId = $state(untrack(() => projetVise?.id ?? ''));
  let nom = $state('');
  let choix = $state<ChoixPeriode>('mois');
  let debut = $state('');
  let fin = $state<string | null>(null);
  let reprise = $state(true);
  let metriques = $state<Brouillon[]>([]);
  let choixProjet = $state(false);

  const rubrique = $derived(rubs.find((r) => r.id === rubriqueId));
  const couleur = $derived(couleurRubrique(rubrique?.couleur ?? '#A3A6B1', theme.mode));
  const modeles = $derived<ModeleSousProjet[]>(rubrique?.cle ? modelesDeLaRubrique(rubrique.cle as RubriqueCle) : []);
  const projets = $derived(rubriqueId ? projetsDe(rubriqueId) : []);
  const projet = $derived(magasin.trouver('projets', projetId));

  /** « Budget du mois » devient « Budget d’octobre ». */
  function nomDuModele(m: ModeleSousProjet): string {
    if (!/du mois$/.test(m.sousProjet)) return m.sousProjet;
    const mois = MOIS_LONGS[+jour.slice(5, 7) - 1];
    return m.sousProjet.replace(/du mois$/, /^[aeiouyh]/.test(mois) ? `d’${mois}` : `de ${mois}`);
  }

  function regler(c: ChoixPeriode) {
    choix = c;
    const p = periodePour(c, jour);
    if (c === 'dates' && debut && fin) return; // on garde des dates déjà choisies
    debut = p.debut; fin = p.fin;
  }

  function charger(i: number | null, garderProjet = false) {
    modele = i;
    const m = i == null ? null : modeles[i];
    if (!m) { nom = ''; metriques = []; regler('mois'); return; }
    nom = nomDuModele(m);
    fin = null; debut = '';
    regler(m.periode);
    metriques = m.metriques.map((x) => ({ type: x.type, nom: x.nom, unite: x.unite, cible: x.cible, periode_cible: x.periode, sens: x.sens, options: x.options ?? null, dans_rapport: x.dansRapport }));
    if (!garderProjet || !projetId) projetId = projets.find((p) => p.nom === m.projet)?.id || projetId || projets[0]?.id || '';
  }

  function choisirRubrique(id: string) {
    if (id === rubriqueId) return;
    rubriqueId = id;
    projetId = projetsDe(id)[0]?.id ?? '';
    charger(modeles.length ? 0 : null);
  }

  // Départ : le modèle qui correspond au projet visé, sinon le premier modèle de la rubrique.
  untrack(() => {
    const i = projetVise ? modeles.findIndex((m) => m.projet === projetVise.nom) : 0;
    if (i >= 0 && modeles.length) charger(i, !!projetVise);
    else { charger(null); if (!projetId) projetId = projets[0]?.id ?? ''; }
  });

  function ajouter(type: TypeMetrique) {
    metriques.push({ type, nom: 'Nouvelle métrique', unite: TYPES[type].uniteAffichee, cible: cibleParDefaut(type), periode_cible: 'jour', sens: 'plus', options: type === 'choix' ? OPTIONS_JEUNE : null, dans_rapport: false });
  }

  const finEffective = $derived(choix === 'sans_fin' ? null : fin);
  const problemes = $derived([
    ...(!projetId ? ['Choisis le projet que ce sous-projet fait avancer.'] : []),
    ...(finEffective && debut && finEffective < debut ? ['La date de fin précède la date de début.'] : []),
    ...problemesMetriques(metriques, finEffective)
  ]);
  const passe = $derived.by(() => {
    if (!projetId || !debut || debut > jour) return null;
    const ms = metriques.map((m, i) => ({ cle: cleDe(m), type: m.type, unite: m.unite, nom: m.nom, options: m.options ?? undefined, id: String(i) }));
    return resumeReprise(valeursDuProjet(projetId), ms, debut, finEffective ? minJour(finEffective, jour) : jour);
  });
  const texteReprise = $derived(!passe ? 'Aucune saisie antérieure sur cette période : le sous-projet commence à zéro.'
    : reprise ? `${passe} Elles seront comptées ici sans être ressaisies.` : 'Les saisies déjà faites ne seront pas comptées dans ce sous-projet.');
  const calculs = $derived(modele != null && modeles[modele]?.calculs.length ? modeles[modele].calculs : calculsProposes(metriques));
  const dansRapport = $derived(metriques.filter((m) => m.dans_rapport).length);

  function creer() {
    if (problemes.length) { dire(problemes[0]); return; }
    const id = creerSousProjet({
      projetId, nom: nom.trim() || (modele != null ? nomDuModele(modeles[modele]) : 'Nouveau sous-projet'), debut, fin: finEffective, reprisePasse: reprise,
      metriques: metriques.map((m) => ({ ...m, options: m.options ?? null }))
    });
    dire('Sous-projet créé');
    routeur.aller(`/projets/sous-projet/${id}`, true);
  }
</script>

<EcranPage onglets={false} gap={18}>
  <div class="contenu" style={styleCouleur(couleur)}>
    <div class="tete">
      <button type="button" class="rond" aria-label="Fermer" onclick={() => routeur.retour('/projets')}><Icone nom="fermer" taille={18} trait={2.2} /></button>
      <h1 class="titre">Nouveau sous-projet</h1>
    </div>

    <section class="groupe">
      <span class="etiquette">Partir d’un modèle · {(rubrique?.cle && NOMS_COURTS[rubrique.cle]) || rubrique?.nom || ''}</span>
      <div class="defile-x">
        {#each rubs as r (r.id)}
          <button type="button" class="puce" class:on={r.id === rubriqueId} aria-pressed={r.id === rubriqueId} style={styleCouleur(couleurRubrique(r.couleur, theme.mode))} onclick={() => choisirRubrique(r.id)}>{(r.cle && NOMS_COURTS[r.cle]) || r.nom}</button>
        {/each}
      </div>
      <div class="modeles">
        {#each modeles as m, i (m.nom)}
          <button type="button" class="modele" class:on={modele === i} aria-pressed={modele === i} onclick={() => charger(i)}>
            <span class="rang"><span class="gras">{m.nom}</span><span class="muted mini">{m.metriques.length} métrique{m.metriques.length > 1 ? 's' : ''}</span></span>
            <span class="muted petit">{m.metriques.map((x) => x.nom).join(' · ')}</span>
          </button>
        {/each}
        <button type="button" class="zero" class:on={modele === null} aria-pressed={modele === null} onclick={() => charger(null, true)}>Partir de zéro</button>
      </div>
    </section>

    <section class="groupe serre">
      <span class="etiquette">Identité</span>
      <label class="champ">Nom du sous-projet
        <input class="grand-champ" bind:value={nom} placeholder="Ex. 7 chapitres par jour" />
      </label>
      <button type="button" class="ligne-projet" onclick={() => (choixProjet = true)}>
        <span class="muted">Projet</span><span class="gras coupe">{projet ? projet.nom : 'Choisir'}</span>
      </button>
      <div class="periodes">
        {#each PERIODES as p (p.valeur)}
          <button type="button" class:on={p.valeur === choix} aria-pressed={p.valeur === choix} onclick={() => regler(p.valeur)}>{p.label}</button>
        {/each}
      </div>
      {#if choix === 'dates' || choix === 'sans_fin'}
        <div class="dates">
          <label class="champ">Début<input type="date" bind:value={debut} /></label>
          {#if choix === 'dates'}<label class="champ">Fin<input type="date" bind:value={fin} min={debut} /></label>{/if}
        </div>
      {/if}
      <span class="muted petit">{debut ? periodeTexte(debut, finEffective) : ''}</span>
    </section>

    <div class="carte reprise">
      <div class="rang">
        <span class="gras">Reprendre les saisies existantes</span>
        <Interrupteur actif={reprise} label="Reprendre les saisies existantes" couleur="var(--c)" onchange={(v) => (reprise = v)} />
      </div>
      <span class="muted petit">{texteReprise}</span>
    </div>

    <section class="groupe serre">
      <div class="rang"><span class="etiquette">Métriques · {metriques.length}</span><span class="muted petit">tout est modifiable</span></div>
      {#each metriques as m, i (i)}
        <EditeurMetrique {m} onchange={(p) => (metriques[i] = { ...metriques[i], ...p })} onretirer={() => metriques.splice(i, 1)} />
      {/each}
      <div class="ajout">
        <span class="muted petit">Ajouter une métrique</span>
        <div class="palette">
          {#each ORDRE_TYPES as t (t)}
            <button type="button" onclick={() => ajouter(t)}><Icone nom="plus" taille={12} trait={2.8} />{TYPES[t].nom}</button>
          {/each}
        </div>
      </div>
      {#if calculs.length}
        <div class="calculs">
          <span class="etiquette">Calculs automatiques</span>
          {#each calculs as c (c)}<span class="mono">{c}</span>{/each}
        </div>
      {/if}
    </section>
  </div>

  {#snippet pied()}
    <div class="pied-contenu">
      {#each problemes.slice(0, 2) as p (p)}<span class="probleme">{p}</span>{/each}
      <span class="muted resume">{nom.trim() || 'Sans nom'} · {metriques.length} métrique{metriques.length > 1 ? 's' : ''} · {dansRapport} dans le rapport</span>
      <Bouton grand plein desactive={problemes.length > 0} onclick={creer}>Créer le sous-projet</Bouton>
    </div>
  {/snippet}
</EcranPage>

<Volet ouvert={choixProjet} onfermer={() => (choixProjet = false)} label="Choisir le projet">
  <h2 class="titre">Quel projet fait-il avancer ?</h2>
  <div class="carte liste">
    {#each projets as p (p.id)}
      <button type="button" class="choix-projet" class:on={p.id === projetId} aria-pressed={p.id === projetId} onclick={() => { projetId = p.id; choixProjet = false; }}>
        <span class="mono muted">{p.numero ?? ''}</span><span class="gras">{p.nom}</span>{#if p.id === projetId}<Icone nom="coche" taille={18} />{/if}
      </button>
    {:else}
      <p class="muted petit vide">Aucun projet dans cette rubrique. Ajoute-en un depuis Projets › Modifier.</p>
    {/each}
  </div>
</Volet>

<style>
  .contenu { display: flex; flex-direction: column; gap: 18px; }
  /* En-tête de la maquette : 16 px du haut, 12 px avant le premier groupe. */
  .tete { display: flex; align-items: center; gap: 10px; margin: -4px 0 -6px; }
  h1 { font-size: 20px; line-height: normal; }
  .petit { font-size: 12px; line-height: 1.45; }
  .mini { flex: none; font-size: 11px; }
  .gras { font-size: 14px; font-weight: 600; }
  .coupe { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
  .groupe { display: flex; flex-direction: column; gap: 8px; }
  .groupe.serre { gap: 10px; }
  .rang { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .defile-x { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
  .puce { flex: none; height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .puce.on { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .modeles { display: flex; flex-direction: column; gap: 6px; }
  .modele { width: 100%; border: 1px solid var(--ligne); background: transparent; text-align: left; border-radius: 18px; padding: 10px 14px; min-height: 56px; display: flex; flex-direction: column; gap: 6px; }
  .modele.on { background: var(--c-fond); border-color: var(--c); }
  .modele .petit { line-height: normal; }
  .zero { min-height: 48px; border-radius: 18px; border: 1.5px dashed var(--ligne); background: transparent; font-size: 14px; font-weight: 600; }
  .zero.on { border-color: var(--c); border-style: solid; background: var(--c-fond); }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); flex: 1; min-width: 0; }
  .champ input { height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); padding: 0 14px; font-size: 16px; min-width: 0; }
  .champ .grand-champ { height: 50px; font-size: 17px; font-weight: 600; }
  .ligne-projet { display: flex; justify-content: space-between; align-items: center; gap: 10px; background: var(--surface); border: 1px solid var(--ligne); border-radius: 14px; padding: 10px 14px; min-height: 70px; font-size: 13px; text-align: left; }
  .periodes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .periodes button { height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; font-size: 12px; font-weight: 600; }
  .periodes button.on { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .dates { display: flex; gap: 8px; }
  .reprise { border-radius: 20px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; }
  .reprise .rang { align-items: center; }
  .ajout { display: flex; flex-direction: column; gap: 6px; }
  .palette { display: flex; flex-wrap: wrap; gap: 6px; }
  .palette button { height: 44px; padding: 0 12px; border-radius: 22px; border: 1.5px dashed var(--ligne); background: transparent; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .calculs { background: var(--surface-2); border-radius: 18px; padding: 12px 14px; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
  .probleme { font-size: 12px; color: var(--mauvais); }
  .pied-contenu { display: flex; flex-direction: column; gap: 8px; padding-bottom: 4px; }
  .resume { font-size: 12px; line-height: 1.4; }
  h2 { font-size: 22px; }
  .liste { border-radius: 20px; overflow: hidden; }
  .choix-projet { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 14px; border: 0; border-bottom: 1px solid var(--ligne); background: transparent; text-align: left; }
  .choix-projet .gras { flex: 1; }
  .choix-projet.on { background: var(--surface-2); }
  .vide { padding: 12px 14px; }
</style>
