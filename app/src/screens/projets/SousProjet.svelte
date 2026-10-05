<script lang="ts">
  // Sous-projet (planches SousProjet, SousProjetNT, SousProjetFiche, SousProjetDocument, SousProjetTemps,
  // SousProjetFinances, JourSousProjet, JourSousProjetNT). Route /projets/sous-projet/:id, onglet via ?onglet=.
  import { moisDe } from '@core/dates.ts';
  import { metriquePilote, progressionDuMois } from '@core/progression.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { enMetrique, metriquesDe, sousProjetsDe, valeursDuSousProjet } from '../../data/requetes.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import OngletSuivi from './OngletSuivi.svelte';
  import OngletFiche from './OngletFiche.svelte';
  import OngletDocument from './OngletDocument.svelte';
  import OngletTemps from './OngletTemps.svelte';
  import SuiviFinances from './SuiviFinances.svelte';
  import { codeDuProjet } from './donnees.ts';
  import { estFinances } from './vues.ts';

  let { params = {} }: { params?: Record<string, string> } = $props();

  type Onglet = 'suivi' | 'fiche' | 'document' | 'temps';
  const ONGLETS: { valeur: Onglet; label: string }[] = [
    { valeur: 'suivi', label: 'Suivi' }, { valeur: 'fiche', label: 'Fiche' }, { valeur: 'document', label: 'Document' }, { valeur: 'temps', label: 'Temps' }
  ];

  const jour = $derived(aujourdhui());
  const mois = $derived(moisDe(jour));
  const sp = $derived(magasin.trouver('sous_projets', params.id));
  const projet = $derived(magasin.trouver('projets', sp?.projet_id));
  const rubrique = $derived(magasin.trouver('rubriques', projet?.rubrique_id));
  const couleur = $derived(couleurRubrique(rubrique?.couleur ?? '#A3A6B1', theme.mode));
  const code = $derived(projet ? codeDuProjet(projet.id) : null);
  const metriques = $derived(sp ? metriquesDe(sp.id).map(enMetrique) : []);
  const finances = $derived(estFinances(metriques));
  const onglet = $derived<Onglet>(((o) => (ONGLETS.some((x) => x.valeur === o) ? (o as Onglet) : 'suivi'))(routeur.params.get('onglet')));

  /** Sous-projets du même projet (puces) : les vivants, plus celui qu'on regarde s'il est terminé. */
  const freres = $derived(projet ? sousProjetsDe(projet.id).filter((s) => s.statut !== 'termine' || s.id === sp?.id).sort((a, b) => a.created_at.localeCompare(b.created_at)) : []);
  const puces = $derived(freres.map((s) => {
    const ms = metriquesDe(s.id).map(enMetrique);
    const p = metriquePilote(ms, s.metrique_pilote_id);
    const pct = p ? progressionDuMois(p, s, valeursDuSousProjet(s), mois, jour).pct : null;
    return { s, pct, court: s.nom.split(/\s+·\s+/)[0] };
  }));

  const choisir = (o: Onglet) => routeur.definir('onglet', o === 'suivi' ? null : o);
  const allerA = (id: string) => routeur.aller(`/projets/sous-projet/${id}${onglet === 'suivi' ? '' : `?onglet=${onglet}`}`, true);
</script>

<EcranPage onglets={false} gap={14}>
  {#if !sp || !projet}
    <div class="tete">
      <button type="button" class="rond" aria-label="Retour aux projets" onclick={() => routeur.retour('/projets')}><Icone nom="retour" taille={18} trait={2.2} /></button>
    </div>
    <p class="muted">{magasin.pret ? 'Ce sous-projet n’existe plus.' : 'Chargement…'}</p>
    <a class="lien" href="/projets">Retour aux projets</a>
  {:else}
    <div class="contenu" style={styleCouleur(couleur)}>
      <div class="tete">
        <button type="button" class="rond" aria-label="Retour aux projets" onclick={() => routeur.retour('/projets')}><Icone nom="retour" taille={18} trait={2.2} /></button>
        <span class="ariane">{rubrique?.nom ?? ''} ›<br />Projet {projet.numero ?? ''} · {projet.nom}</span>
        {#if code || finances}<span class="code mono">{code ?? 'FINANCES'}</span>{/if}
      </div>

      {#if onglet === 'suivi' && !finances}
        <div class="groupe">
          <span class="etiquette">Sous-projets de ce projet · {puces.length}</span>
          <div class="defile-x">
            {#each puces as p (p.s.id)}
              <button type="button" class="puce" class:on={p.s.id === sp.id} aria-pressed={p.s.id === sp.id} onclick={() => allerA(p.s.id)}>
                {p.court} <span class="mono">{p.pct == null ? '—' : `${p.pct} %`}</span>
              </button>
            {/each}
            <a class="puce ajout" href="/projets/nouveau-sous-projet?projet={projet.id}" aria-label="Ajouter un sous-projet"><Icone nom="plus" taille={14} trait={2.6} />Sous-projet</a>
          </div>
        </div>
      {/if}

      {#if onglet !== 'document'}<h1 class="titre">{sp.nom}</h1>{/if}

      <div class="onglets" role="tablist">
        {#each ONGLETS as o (o.valeur)}
          <button type="button" role="tab" aria-selected={o.valeur === onglet} class:actif={o.valeur === onglet} onclick={() => choisir(o.valeur)}>{o.label}</button>
        {/each}
      </div>

      {#key sp.id}
        {#if onglet === 'suivi'}
          {#if finances}<SuiviFinances {sp} {metriques} {mois} {jour} />{:else}<OngletSuivi {sp} {metriques} {mois} {jour} {freres} />{/if}
        {:else if onglet === 'fiche'}
          <OngletFiche {sp} {metriques} {code} {jour} />
        {:else if onglet === 'document'}
          <OngletDocument {sp} {projet} {rubrique} {metriques} {code} {mois} {jour} />
        {:else}
          <OngletTemps {sp} {metriques} {mois} {jour} {freres} />
        {/if}
      {/key}
    </div>
  {/if}
</EcranPage>

<style>
  .contenu { display: flex; flex-direction: column; gap: 14px; }
  .tete { display: flex; align-items: center; gap: 10px; }
  .ariane { font-size: 12px; font-weight: 600; color: var(--c-encre); line-height: 1.35; min-width: 0; }
  .code { margin-left: auto; flex: none; font-size: 11px; padding: 5px 8px; border-radius: 8px; background: var(--c-fond); color: var(--c-encre); }
  .groupe { display: flex; flex-direction: column; gap: 6px; }
  .defile-x { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
  .puce { flex: none; height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 8px; white-space: nowrap; }
  .puce .mono { font-size: 12px; opacity: 0.85; }
  .puce.on { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .puce.ajout { border: 1.5px dashed var(--ligne); color: var(--c-encre); gap: 6px; }
  h1 { font-size: 26px; line-height: 1.12; }
  .onglets { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); background: var(--surface-2); border-radius: 14px; padding: 4px; gap: 2px; }
  .onglets button { height: 38px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); font-size: 13px; }
  .onglets button.actif { background: var(--surface); color: var(--texte); font-weight: 600; }
  .lien { color: var(--accent-encre); font-weight: 600; }
</style>
