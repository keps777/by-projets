<script lang="ts">
  // Onglet Fiche (planche SousProjetFiche) : les 7 questions, les métriques (modifiables), les tâches qui alimentent
  // le sous-projet, la période et le statut avec pause, validation, reprise ou suppression (spec §6, US-16, US-20).
  import { cleMetrique, TYPES } from '@core/metriques.ts';
  import { metriquePilote } from '@core/progression.ts';
  import { decrire } from '@core/recurrence.ts';
  import type { Jour, Metrique, TypeMetrique } from '@core/types.ts';
  import type { Fiche, MetriqueLigne, SousProjetLigne } from '@core/lignes.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { metriquesDe, valeursDuSousProjet } from '../../data/requetes.ts';
  import { ajouterMetrique, mettreEnPause, modifierFiche, modifierMetrique, retirerMetrique, rouvrirSousProjet, supprimerSousProjet } from '../../data/actions/projets.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import EditeurMetrique from './EditeurMetrique.svelte';
  import VoletValider from './VoletValider.svelte';
  import { choisirPilote, heuresTache, tachesDuSousProjet } from './donnees.ts';
  import { cibleParDefaut, cleDe, objectifTexte, periodeTexte, type Brouillon } from './vues.ts';
  import { ORDRE_TYPES } from '@core/metriques.ts';

  let { sp, metriques, code, jour }: { sp: SousProjetLigne; metriques: Metrique[]; code: string | null; jour: Jour } = $props();

  const QUESTIONS: { cle: keyof Fiche; q: string; aide: string }[] = [
    { cle: 'quoi', q: 'Quoi ?', aide: 'Ce que je veux accomplir.' },
    { cle: 'pourquoi', q: 'Pourquoi ?', aide: 'La raison qui me tient.' },
    { cle: 'qui', q: 'Qui ?', aide: 'Qui est concerné, à qui je rends compte.' },
    { cle: 'ou', q: 'Où ?', aide: 'Le lieu.' },
    { cle: 'quand', q: 'Quand ?', aide: 'Le moment, la fréquence.' },
    { cle: 'comment', q: 'Comment ?', aide: 'La méthode.' },
    { cle: 'combien', q: 'Combien ?', aide: 'Les objectifs chiffrés.' }
  ];
  const STATUTS: Record<string, { label: string; couleur: string }> = {
    brouillon: { label: 'En pause', couleur: 'var(--alerte)' }, en_cours: { label: 'En cours', couleur: 'var(--bon)' },
    a_valider: { label: 'À valider', couleur: 'var(--alerte)' }, termine: { label: 'Terminé', couleur: 'var(--muted)' }, archive: { label: 'Archivé', couleur: 'var(--muted)' }
  };

  const lignes = $derived(metriquesDe(sp.id));
  const pilote = $derived(metriquePilote(metriques, sp.metrique_pilote_id));
  const taches = $derived(tachesDuSousProjet(sp.id));
  let edition = $state(false);
  let validation = $state(false);
  let suppression = $state(false);

  function enregistrer(cle: keyof Fiche, v: string) { if ((sp.fiche?.[cle] ?? '') !== v) modifierFiche(sp.id, { [cle]: v.trim() }); }

  function changer(l: MetriqueLigne, patch: Partial<Brouillon>) {
    const p: Partial<MetriqueLigne> = { ...patch };
    // Changer l'unité d'un Nombre change ce qu'il compte : la clé suit (spec §2). Renommer ne change jamais la clé.
    if (l.type === 'nombre' && patch.unite != null && patch.unite !== l.unite) {
      const cle = cleMetrique('nombre', patch.unite);
      if (lignes.some((x) => x.id !== l.id && x.cle === cle)) { dire('Une autre métrique compte déjà cette unité.'); return; }
      p.cle = cle;
    }
    modifierMetrique(l.id, p);
  }
  function ajouter(type: TypeMetrique) {
    const base: Brouillon = { type, nom: TYPES[type].nom.replace(' ($)', ''), unite: TYPES[type].uniteAffichee, cible: cibleParDefaut(type), periode_cible: 'jour', sens: 'plus', dans_rapport: false };
    let n = 2;
    while (lignes.some((x) => x.cle === cleDe(base))) base.nom = `${TYPES[type].nom.replace(' ($)', '')} ${n++}`;
    if (lignes.some((x) => x.cle === cleDe(base))) { dire('Ce sous-projet suit déjà une métrique de ce type.'); return; }
    ajouterMetrique(sp.id, { ...base, options: type === 'choix' ? [{ label: 'Complet', valeur: 1 }, { label: 'Partiel', valeur: 0.5 }, { label: 'Aucun', valeur: 0 }] : undefined });
  }
  const typesLibres = $derived(ORDRE_TYPES.filter((t) => !['temps', 'fois', 'distance', 'poids', 'heure', 'pourcentage', 'oui_non', 'note'].includes(t) || !lignes.some((x) => x.type === t)));

  function supprimer() {
    supprimerSousProjet(sp.id);
    dire('Sous-projet supprimé · les saisies du projet restent');
    routeur.aller('/projets', true);
  }
</script>

<div class="carte fiche">
  {#each QUESTIONS as f (f.cle)}
    <label class="question">
      <span class="q">{f.q}</span>
      <textarea rows="2" value={sp.fiche?.[f.cle] ?? ''} placeholder={f.aide} aria-label={f.q} onchange={(e) => enregistrer(f.cle, e.currentTarget.value)}></textarea>
    </label>
  {/each}
</div>

<section class="groupe">
  <div class="rang">
    <span class="etiquette">Métriques suivies</span>
    <button type="button" class="lien" onclick={() => (edition = !edition)}>{edition ? 'Terminé' : 'Modifier'}</button>
  </div>
  {#if edition}
    {#each lignes as l (l.id)}
      <EditeurMetrique m={l} pilote={pilote?.id === l.id} onpilote={() => choisirPilote(sp.id, l.id)} onchange={(p) => changer(l, p)}
        onretirer={() => { retirerMetrique(l.id); dire(`« ${l.nom} » retirée · les saisies restent`); }} />
    {/each}
    <div class="ajout">
      <span class="muted petit">Ajouter une métrique</span>
      <div class="palette">
        {#each typesLibres as t (t)}
          <button type="button" onclick={() => ajouter(t)}><Icone nom="plus" taille={12} trait={2.8} />{TYPES[t].nom}</button>
        {/each}
      </div>
    </div>
  {:else}
    <div class="carte liste">
      {#each metriques as m (m.id)}
        <div class="metrique">
          <span class="type">{m.type === 'reference' ? 'Texte' : TYPES[m.type].nom.replace(' ($)', '')}</span>
          <span class="col"><span class="gras">{m.nom}{#if pilote?.id === m.id}<span class="pilote">pilote</span>{/if}</span><span class="muted petit">{objectifTexte(m)}</span></span>
          <span class="mono rapport" class:hors={!m.dansRapport}>{m.dansRapport ? code ?? 'rapport' : '—'}</span>
        </div>
      {:else}
        <p class="muted petit vide">Aucune métrique. Touche « Modifier » pour en ajouter.</p>
      {/each}
    </div>
  {/if}
</section>

<section class="groupe">
  <span class="etiquette">Tâches qui l’alimentent</span>
  <div class="carte liste">
    {#each taches as t (t.id)}
      <a class="metrique" href="/tache/{t.id}">
        <span class="barre"></span>
        <span class="col"><span class="gras">{t.titre}</span><span class="mono muted petit">{decrire(t.regle)} · {heuresTache(t)}</span></span>
      </a>
    {:else}
      <p class="muted petit vide">Aucune tâche ne nourrit encore ce sous-projet.</p>
    {/each}
    <a class="ajouter" href="/tache/nouvelle?projet={sp.projet_id}&sous_projet={sp.id}"><Icone nom="plus" taille={14} trait={2.6} />Ajouter une tâche</a>
  </div>
</section>

<div class="carte statut">
  <div class="rang"><span class="muted">Période</span><span class="gras">{periodeTexte(sp.debut, sp.fin)}</span></div>
  <div class="rang"><span class="muted">Statut</span><span class="gras" style:color={STATUTS[sp.statut]?.couleur}>{STATUTS[sp.statut]?.label ?? sp.statut}</span></div>
  <div class="rang"><span class="muted">Reprise du passé</span><span class="gras">{sp.reprise_passe ? 'Oui' : 'Non'}</span></div>
  <div class="deux">
    {#if sp.statut === 'termine' || sp.statut === 'archive'}
      <button type="button" class="action" onclick={() => { rouvrirSousProjet(sp.id); dire('Sous-projet rouvert'); }}>Rouvrir</button>
      <button type="button" class="action plein" onclick={() => routeur.definir('onglet', 'document')}>Voir le document</button>
    {:else}
      {#if sp.statut === 'brouillon'}
        <button type="button" class="action" onclick={() => { rouvrirSousProjet(sp.id); dire('Sous-projet repris'); }}>Reprendre</button>
      {:else}
        <button type="button" class="action" onclick={() => { mettreEnPause(sp.id); dire('En pause · il sort des moyennes'); }}>Mettre en pause</button>
      {/if}
      <button type="button" class="action plein" onclick={() => (validation = true)}>Terminer et archiver</button>
    {/if}
  </div>
  <Bouton variante="discret" onclick={() => (suppression = true)}>Supprimer ce sous-projet</Bouton>
</div>

<VoletValider ouvert={validation} onfermer={() => (validation = false)} {sp} {metriques} valeurs={valeursDuSousProjet(sp)} aujourdhui={jour} />

<Volet ouvert={suppression} onfermer={() => (suppression = false)} label="Supprimer le sous-projet">
  <h2 class="titre">Supprimer « {sp.nom} » ?</h2>
  <p class="muted">Le sous-projet et ses métriques disparaissent. Les saisies appartiennent au projet : elles restent et nourrissent ses autres sous-projets.</p>
  <div class="deux">
    <Bouton variante="secondaire" onclick={() => (suppression = false)}>Annuler</Bouton>
    <Bouton variante="danger" onclick={supprimer}>Supprimer</Bouton>
  </div>
</Volet>

<style>
  .petit { font-size: 12px; }
  .gras { font-weight: 600; }
  .fiche { border-radius: 22px; padding: 6px 14px; }
  .question { display: flex; flex-direction: column; gap: 4px; padding: 10px 0; border-bottom: 1px solid var(--ligne); }
  .q { font-size: 12px; font-weight: 600; letter-spacing: 0.04em; color: var(--c-encre); }
  textarea { font: 16px/1.4 var(--police); background: transparent; border: 0; padding: 0; resize: none; outline: none; field-sizing: content; min-height: 2.8em; }
  textarea::placeholder { color: var(--faint); }
  .groupe { display: flex; flex-direction: column; gap: 8px; }
  .rang { display: flex; justify-content: space-between; align-items: center; gap: 10px; font-size: 14px; }
  .lien { min-height: 44px; border: 0; background: transparent; color: var(--c-encre); font-size: 13px; font-weight: 600; padding: 0; }
  .liste { border-radius: 20px; overflow: hidden; }
  .metrique { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-bottom: 1px solid var(--ligne); min-height: 81px; font-size: 14px; }
  .type { flex: none; font-size: 11px; font-weight: 600; padding: 5px 9px; border-radius: 9px; background: var(--c-fond); color: var(--c-encre); min-width: 56px; text-align: center; }
  .col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .pilote { margin-left: 6px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--c-encre); }
  .rapport { flex: none; font-size: 11px; color: var(--c-encre); }
  .rapport.hors { color: var(--muted); }
  .barre { flex: none; width: 8px; height: 32px; border-radius: 4px; background: var(--c); }
  .vide { padding: 12px 14px; }
  .ajouter { color: var(--c-encre); font-size: 14px; font-weight: 600; min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .ajout { display: flex; flex-direction: column; gap: 6px; }
  .palette { display: flex; flex-wrap: wrap; gap: 6px; }
  .palette button { height: 44px; padding: 0 12px; border-radius: 22px; border: 1.5px dashed var(--ligne); background: transparent; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .statut { border-radius: 20px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .action { height: 46px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; font-size: 14px; font-weight: 600; padding: 0 8px; }
  .action.plein { border: 0; background: var(--inverse); color: var(--inverse-texte); }
  .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  h2 { font-size: 22px; }
</style>
