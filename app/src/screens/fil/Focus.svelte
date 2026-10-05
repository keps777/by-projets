<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { compterChapitres, formaterPassages, type Passage } from '@core/bible.ts';
  import { estArrive } from '@core/minuteur.ts';
  import { nombre } from '@core/units.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { ajouterNote, notesDuBloc } from '../../data/actions/notes.ts';
  import { blocsDuJour, metriquesDe, type BlocVue } from '../../data/requetes.ts';
  import { aujourdhui as jourCourant, horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { attendusDe, corrigerValeur, ecouleOccurrence, minuteurDe, saisirBloc, terminerBloc, type ValeurEntree } from '../../data/actions/blocs.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Anneau from '../../ui/Anneau.svelte';
  import PassagesLus from '../../ui/PassagesLus.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Confirmer from './Confirmer.svelte';
  import { basculerMinuteur, codeDuProjet, mesuresDuBloc, occurrenceActive, type MesureBloc } from './vue-blocs.ts';
  import { chrono, dureeMin, formatValeur } from './format.ts';
  import { styleTeinte } from './teintes.ts';

  /** Mode Focus (spec §8) : anneau de temps, Pause, Terminer, passages lus, « Ce que Dieu me dit ». */
  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const aujourdhui = $derived(jourCourant());
  const occId = $derived(routeur.params.get('occ') ?? occurrenceActive()?.id ?? null);
  const b = $derived.by((): BlocVue | null => {
    if (occId) {
      const o = magasin.trouver('occurrences', occId);
      return o ? blocsDuJour(o.jour).find((x) => x.occ.id === occId) ?? null : null;
    }
    const m = maintenantLocal().minutes;
    return blocsDuJour(aujourdhui).find((x) => !x.fait && x.finMin > m) ?? null;
  });

  const style = $derived(b ? styleTeinte(b.couleur, theme.mode) : '');
  const totalS = $derived(b ? (b.finMin - b.debutMin) * 60 : 0);
  const ecoule = $derived(b ? ecouleOccurrence(b.occ, horloge.maintenant) : 0);
  const code = $derived(b ? codeDuProjet(b.projet?.id) : null);
  const dieu = $derived(b?.rubrique?.cle === 'dieu');

  // Passages : pour une tâche qui enregistre des chapitres ou des passages (lecture de la Bible).
  const cles = $derived(b ? new Set([...attendusDe(b.tache.id).map((a) => a.cle), ...b.sousProjets.flatMap((s) => metriquesDe(s.id).map((m) => m.cle))]) : new Set<string>());
  const lecture = $derived(cles.has('reference:passages') || cles.has('nombre:chapitres') || code === 'BR');
  const objectif = $derived.by(() => {
    if (!b) return 0;
    const att = attendusDe(b.tache.id).find((a) => a.cle === 'nombre:chapitres')?.valeur_prevue;
    if (att) return att;
    const m = b.sousProjets.flatMap((s) => metriquesDe(s.id)).find((x) => x.cle === 'nombre:chapitres' && x.periode_cible === 'jour');
    return m?.cible ?? 7;
  });
  const autres = $derived(b && !lecture ? mesuresDuBloc(b).filter((m) => m.type !== 'temps' && m.type !== 'reference' && m.type !== 'choix' && m.type !== 'oui_non') : []);

  // Brouillon gardé sur l'appareil tant que le bloc n'est pas terminé.
  let passages = $state<Passage[]>([]);
  // Notes du Mode Focus : écrites une par une, elles vont dans le Carnet (numérotées, spec §18).
  let brouillonNote = $state('');
  const notesBloc = $derived(b ? notesDuBloc(b.occ.id) : []);
  function noterCarnet() {
    if (!b) return;
    const n = ajouterNote({ texte: brouillonNote, origine: 'focus', occurrenceId: b.occ.id, projetId: b.tache.projet_id, sourceLabel: b.titre });
    if (n) { brouillonNote = ''; try { localStorage.removeItem(cleBrouillon(b.occ.id) + ':note'); } catch { /* stockage indisponible */ } }
  }
  function memoriserNote() { if (b) try { localStorage.setItem(cleBrouillon(b.occ.id) + ':note', brouillonNote); } catch { /* stockage indisponible */ } }
  const cleBrouillon = (id: string) => `luther-life:focus:${id}`;
  let chargePour: string | null = null;
  $effect(() => {
    if (!b || chargePour === b.occ.id) return;
    chargePour = b.occ.id;
    let brouillon: { passages?: Passage[] } = {};
    try { brouillon = JSON.parse(localStorage.getItem(cleBrouillon(b.occ.id)) ?? '{}'); } catch { /* stockage indisponible */ }
    const sv = b.saisie ? magasin.lignes.saisie_valeurs.find((v) => v.saisie_id === b.saisie!.id && v.cle === 'reference:passages') : undefined;
    passages = brouillon.passages ?? (Array.isArray(sv?.detail) ? (sv.detail as Passage[]) : []);
    try { brouillonNote = localStorage.getItem(cleBrouillon(b.occ.id) + ':note') ?? ''; } catch { brouillonNote = ''; }
  });
  function memoriser() {
    if (!b) return;
    try { localStorage.setItem(cleBrouillon(b.occ.id), JSON.stringify({ passages })); } catch { /* stockage indisponible */ }
  }

  const compte = $derived(compterChapitres(passages));
  function changerPassages(ps: Passage[]) { passages = ps; memoriser(); }

  // Fin : à la fin prévue, ou en touchant Terminer.
  let confirme = $state(false);
  const refuses = new SvelteSet<string>();
  $effect(() => {
    if (!b || confirme || refuses.has(b.occ.id) || !b.enCours) return;
    if (estArrive(minuteurDe(b.occ), horloge.maintenant, totalS)) confirme = true;
  });

  function terminer() {
    if (!b) return;
    const sec = b.enCours || b.enPause ? ecoule : totalS;
    terminerBloc(b.occ.id);
    const valeurs: ValeurEntree[] = [];
    if (lecture && passages.length) {
      valeurs.push({ cle: 'reference:passages', txt: formaterPassages(passages), detail: passages });
      valeurs.push({ cle: 'nombre:chapitres', num: compte });
    }
    // Une note laissée dans le champ sans avoir touché « Ajouter » n'est pas perdue.
    noterCarnet();
    // La note de la saisie reprend le texte des notes du Carnet de ce bloc (les tableaux des sous-projets la montrent).
    const texteNotes = notesDuBloc(b.occ.id).map((n) => n.texte).join('\n');
    saisirBloc(b.occ.id, valeurs, { source: 'focus', note: texteNotes || null });
    try { localStorage.removeItem(cleBrouillon(b.occ.id)); localStorage.removeItem(cleBrouillon(b.occ.id) + ':note'); } catch { /* stockage indisponible */ }
    dire(`« ${b.titre} » cochée · ${dureeMin(Math.round(sec / 60))}`);
    routeur.aller('/');
  }
  function continuer() { if (b) refuses.add(b.occ.id); confirme = false; }
  const ajuster = (m: MesureBloc, s: 1 | -1) => b && corrigerValeur(b.occ.id, m.cle, Math.max(0, m.realise + s * m.pas));
</script>

<div class="ecran-focus" {style}>
  <div class="defile">
    <div class="haut">
      <button type="button" class="rond" aria-label="Quitter le mode Focus" onclick={() => routeur.retour('/')}><Icone nom="fermer" taille={18} trait={2.2} /></button>
      <span class="mode">Mode Focus</span>
      {#if code}<span class="code mono">{code}</span>{:else}<span class="vide"></span>{/if}
    </div>

    {#if b}
      <div class="tete">
        <span class="kicker">{b.rubrique?.nom ?? 'Rendez-vous'}{b.sousProjets[0] ? ` · ${b.sousProjets[0].nom}` : b.projet ? ` · ${b.projet.nom}` : ''}</span>
        <h1 class="titre">{b.titre}</h1>
      </div>

      <div class="anneau">
        <Anneau piste="var(--piste-anneau)" pct={totalS ? (ecoule / totalS) * 100 : 0} taille={216} epaisseur={12} couleur="var(--c)">
          <span class="centre-focus">
            <span class="mono temps">{chrono(ecoule)}</span>
            <span class="muted sur">sur {chrono(totalS)}</span>
          </span>
        </Anneau>
      </div>

      <div class="duo">
        <button type="button" class="principal" onclick={() => basculerMinuteur(b.occ.id)}>
          {#if b.enCours}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
          {/if}
          {b.enCours ? 'Pause' : b.enPause ? 'Reprendre' : b.fait ? 'Relancer' : 'Lancer'}
        </button>
        <button type="button" class="secondaire" onclick={() => (confirme = true)}>Terminer</button>
      </div>

      {#if lecture}
        <div class="carte-f">
          <PassagesLus {passages} onchange={changerPassages} {objectif} couleur="var(--c)" />
        </div>
      {:else if autres.length}
        <div class="carte-f">
          {#each autres as m (m.cle)}
            <div class="rang">
              <span class="col"><span class="fort">{m.label}</span><span class="muted petit">{formatValeur(m.type, m.realise, m.unite)}{m.prevu != null ? ` sur ${formatValeur(m.type, m.prevu, m.unite)}` : ''}</span></span>
              <span class="pas">
                <button type="button" aria-label="Diminuer {m.label}" onclick={() => ajuster(m, -1)}>−</button>
                <button type="button" aria-label="Augmenter {m.label}" onclick={() => ajuster(m, 1)}>+</button>
              </span>
            </div>
          {/each}
        </div>
      {/if}

      <section class="carnet" aria-label="Mes notes">
        <div class="carnet-tete"><span class="fort">Mes notes</span><a class="carnet-lien" href="/carnet?jour={b.occ.jour}">Ouvrir le Carnet</a></div>
        {#if notesBloc.length}
          <ol class="carnet-liste">
            {#each notesBloc as n (n.id)}<li><span class="num mono">{n.numero}</span><span class="txt">{n.texte}</span></li>{/each}
          </ol>
        {/if}
        <div class="carnet-ecrire">
          <textarea rows="2" bind:value={brouillonNote} oninput={memoriserNote} placeholder={dieu ? 'Ce que Dieu me dit, ce que je retiens…' : 'Une idée, une décision, un détail à garder…'} aria-label="Écrire une note"></textarea>
          <button type="button" disabled={!brouillonNote.trim()} onclick={noterCarnet}>Ajouter</button>
        </div>
        <span class="muted petit">Chaque note prend le numéro suivant du Carnet.</span>
      </section>

      <p class="verset serif">{dieu ? '« Ta parole est une lampe à mes pieds. »' : '« Tout ce que vous faites, faites-le de bon cœur. »'}</p>
    {:else}
      <div class="tete"><h1 class="titre">Aucun bloc en cours</h1><span class="muted">Lance un bloc depuis Le Fil pour entrer en Focus.</span></div>
    {/if}
  </div>

  <Confirmer ouvert={confirme && !!b} sur="{chrono(ecoule)}{lecture ? ` · ${compte} chapitre${compte > 1 ? 's' : ''}` : ''}" question={lecture ? 'As-tu terminé ta lecture ?' : `As-tu terminé « ${b?.titre ?? ''} » ?`}>
    {#if lecture}<span class="muted resume">{passages.length ? formaterPassages(passages) : 'Aucun passage saisi'}</span>{/if}
    <button type="button" class="oui" onclick={terminer}>Oui, enregistrer et cocher</button>
    <button type="button" class="non" onclick={continuer}>{lecture ? 'Continuer à lire' : 'Continuer'}</button>
  </Confirmer>
</div>

<style>
  .ecran-focus { --c: var(--accent); height: 100dvh; max-width: 480px; margin: 0 auto; background: var(--fond); position: relative; }
  .defile { position: absolute; inset: 0; overflow-y: auto; padding: calc(18px + var(--haut-sûr)) 20px calc(24px + var(--bas-sûr)); display: flex; flex-direction: column; gap: 18px; }
  .haut { display: flex; justify-content: space-between; align-items: center; }
  .haut .rond { border: 0; background: var(--carte-fond); color: var(--carte-texte); }
  .mode { font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--muted); }
  .code { font-size: 11px; padding: 5px 8px; border-radius: 8px; background: var(--c-fond); color: var(--c-encre); }
  .kicker, .temps { transition: color 0.2s ease; }
  .vide { width: 44px; }
  .tete { display: flex; flex-direction: column; gap: 4px; align-items: center; text-align: center; }
  .kicker { font-size: 12px; font-weight: 600; color: var(--c); }
  h1 { font-size: 34px; line-height: normal; }
  /* Comme le rendu de la maquette : anneau de rayon 102 (12 px) dans un cadre de 230 px que la colonne tasse à 211 px ;
     l'anneau déborde donc vers le bas et le chrono se place un peu au-dessus du centre. */
  .anneau { position: relative; align-self: center; width: 230px; height: 211px; flex: none; }
  .anneau > :global(.anneau) { position: absolute; left: 7px; top: 7px; }
  .centre-focus { display: flex; flex-direction: column; align-items: center; gap: 2px; margin-top: -19px; }
  .temps { font-size: 46px; letter-spacing: -0.03em; }
  .sur { font-size: 13px; }
  .duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .principal { height: 50px; border-radius: 16px; border: 0; background: var(--c); color: var(--c-sur); font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .secondaire { height: 50px; border-radius: 16px; border: 1px solid var(--ligne); background: transparent; font-size: 15px; font-weight: 600; }
  .carte-f { background: var(--surface); border: 1px solid var(--ligne); border-radius: 22px; padding: 14px; display: flex; flex-direction: column; gap: 12px; }
  .rang { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  .col { display: flex; flex-direction: column; }
  .fort { font-size: 13px; font-weight: 600; }
  .petit { font-size: 12px; }
  .pas { display: flex; gap: 6px; }
  .pas button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); font-size: 20px; }
  .carnet { display: flex; flex-direction: column; gap: 10px; background: var(--surface); border: 1px solid var(--ligne); border-radius: 20px; padding: 14px; }
  .carnet-tete { display: flex; align-items: center; justify-content: space-between; font-size: 14px; }
  .carnet-lien { font-size: 13px; font-weight: 600; color: var(--accent-encre); text-decoration: underline; text-underline-offset: 3px; min-height: 44px; display: inline-flex; align-items: center; }
  .carnet-liste { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
  .carnet-liste li { display: flex; gap: 10px; align-items: flex-start; animation: entre 0.25s ease both; }
  .carnet-liste .num { flex: none; min-width: 30px; padding: 3px 7px; border-radius: 8px; background: var(--accent-fond); color: var(--accent-encre); font-size: 12px; text-align: center; }
  .carnet-liste .txt { font-size: 15px; line-height: 1.4; white-space: pre-wrap; overflow-wrap: anywhere; }
  .carnet-ecrire { display: flex; gap: 8px; align-items: flex-end; }
  .carnet-ecrire textarea { flex: 1; min-width: 0; font: 16px/1.4 var(--police); background: var(--champ); border: 1px solid var(--ligne); border-radius: 14px; padding: 10px 12px; resize: none; }
  .carnet-ecrire textarea:focus { outline: none; border-color: var(--c); }
  .carnet-ecrire button { flex: none; height: 44px; padding: 0 16px; border-radius: 14px; border: 0; background: var(--c); color: var(--c-sur, var(--accent-texte)); font-size: 14px; font-weight: 600; }
  .carnet-ecrire button:disabled { opacity: 0.35; }
  @keyframes entre { from { opacity: 0; transform: translateY(4px); } }
  .verset { font-size: 19px; line-height: 1.3; color: var(--muted); text-align: center; }
  .resume { font-size: 13px; }
</style>
