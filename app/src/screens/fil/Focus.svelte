<script lang="ts">
  import { SvelteSet } from 'svelte/reactivity';
  import { LIVRES, compterChapitres, formaterPassage, formaterPassages, validerPassage, type ErreurPassage, type Passage } from '@core/bible.ts';
  import { estArrive } from '@core/minuteur.ts';
  import { nombre } from '@core/units.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { blocsDuJour, metriquesDe, type BlocVue } from '../../data/requetes.ts';
  import { aujourdhui as jourCourant, horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { attendusDe, corrigerValeur, ecouleOccurrence, minuteurDe, saisirBloc, terminerBloc, type ValeurEntree } from '../../data/actions/blocs.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Anneau from '../../ui/Anneau.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Confirmer from './Confirmer.svelte';
  import { basculerMinuteur, codeDuProjet, mesuresDuBloc, occurrenceActive, type MesureBloc } from './vue-blocs.ts';
  import { chrono, dureeMin, formatValeur } from './format.ts';

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

  const style = $derived(b ? styleCouleur(couleurRubrique(b.couleur, theme.mode)) : '');
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
  let note = $state('');
  let livre = $state(''), de = $state(''), a = $state('');
  const cleBrouillon = (id: string) => `luther-life:focus:${id}`;
  let chargePour: string | null = null;
  $effect(() => {
    if (!b || chargePour === b.occ.id) return;
    chargePour = b.occ.id;
    let brouillon: { passages?: Passage[]; note?: string } = {};
    try { brouillon = JSON.parse(localStorage.getItem(cleBrouillon(b.occ.id)) ?? '{}'); } catch { /* stockage indisponible */ }
    const sv = b.saisie ? magasin.lignes.saisie_valeurs.find((v) => v.saisie_id === b.saisie!.id && v.cle === 'reference:passages') : undefined;
    passages = brouillon.passages ?? (Array.isArray(sv?.detail) ? (sv.detail as Passage[]) : []);
    note = brouillon.note ?? b.saisie?.note ?? '';
  });
  function memoriser() {
    if (!b) return;
    try { localStorage.setItem(cleBrouillon(b.occ.id), JSON.stringify({ passages, note })); } catch { /* stockage indisponible */ }
  }

  const compte = $derived(compterChapitres(passages));
  const ERREURS: Record<ErreurPassage, string> = { livre_inconnu: 'Livre inconnu', chapitre_invalide: 'Chapitre hors du livre', ordre_inverse: 'Le chapitre de fin précède le début' };
  function ajouterPassage() {
    const d = parseInt(de, 10), f = parseInt(a || de, 10);
    const r = validerPassage(livre, d, f);
    if (!r.ok) { dire(ERREURS[r.erreur]); return; }
    passages = [...passages, r.passage];
    livre = ''; de = ''; a = '';
    memoriser();
  }
  function retirer(i: number) { passages = passages.filter((_, j) => j !== i); memoriser(); }

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
    saisirBloc(b.occ.id, valeurs, { source: 'focus', note: note.trim() || null });
    try { localStorage.removeItem(cleBrouillon(b.occ.id)); } catch { /* stockage indisponible */ }
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
        <Anneau pct={totalS ? (ecoule / totalS) * 100 : 0} taille={230} epaisseur={12} couleur="var(--c)">
          <span class="mono temps">{chrono(ecoule)}</span>
          <span class="muted sur">sur {chrono(totalS)}</span>
        </Anneau>
      </div>

      <div class="duo">
        <button type="button" class="principal" onclick={() => basculerMinuteur(b.occ.id)}>
          {#if b.enCours}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
          {/if}
          {b.enCours ? 'Pause' : b.enPause ? 'Reprendre' : 'Lancer'}
        </button>
        <button type="button" class="secondaire" onclick={() => (confirme = true)}>Terminer</button>
      </div>

      {#if lecture}
        <div class="carte-f">
          <div class="rang"><span class="fort">Passages lus</span><span class="mono compte" class:bon={compte >= objectif}>{compte} / {nombre(objectif)} ch.</span></div>
          <span class="piste"><span class:bon={compte >= objectif} style:width="{Math.min(100, (compte / Math.max(1, objectif)) * 100)}%"></span></span>
          {#if passages.length}
            <div class="puces">
              {#each passages as p, i (i)}
                <span class="puce">{formaterPassage(p)} <span class="leger">· {p.a - p.de + 1} ch.</span>
                  <button type="button" aria-label="Retirer {formaterPassage(p)}" onclick={() => retirer(i)}><Icone nom="fermer" taille={12} trait={2.6} /></button>
                </span>
              {/each}
            </div>
          {/if}
          <div class="formulaire">
            <label>Livre<input list="livres-focus" bind:value={livre} placeholder="Luc" autocomplete="off" /></label>
            <label>Du ch.<input inputmode="numeric" bind:value={de} placeholder="22" class="ch" /></label>
            <label>Au ch.<input inputmode="numeric" bind:value={a} placeholder={de || '22'} class="ch" onkeydown={(e) => e.key === 'Enter' && ajouterPassage()} /></label>
            <button type="button" class="ajouter" aria-label="Ajouter le passage" onclick={ajouterPassage}><Icone nom="plus" taille={18} trait={2.4} /></button>
          </div>
          <datalist id="livres-focus">{#each LIVRES as l (l.nom)}<option value={l.nom}></option>{/each}</datalist>
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

      <label class="note">{dieu ? 'Ce que Dieu me dit' : 'Note'}
        <textarea rows="3" bind:value={note} onchange={memoriser}></textarea>
      </label>

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
  .vide { width: 44px; }
  .tete { display: flex; flex-direction: column; gap: 4px; align-items: center; text-align: center; }
  .kicker { font-size: 12px; font-weight: 600; color: var(--c); }
  h1 { font-size: 34px; }
  .anneau { align-self: center; }
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
  .compte { font-size: 13px; color: var(--c); }
  .compte.bon { color: var(--bon); }
  .piste { height: 8px; border-radius: 4px; background: var(--piste); overflow: hidden; }
  .piste span { display: block; height: 8px; border-radius: 4px; background: var(--c); transition: width 0.3s ease; }
  .piste span.bon { background: var(--bon); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; }
  .puce { display: inline-flex; align-items: center; gap: 4px; height: 36px; padding: 0 4px 0 12px; border-radius: 18px; background: var(--c-fond); color: var(--c-encre); font-size: 13px; font-weight: 600; }
  .puce .leger { font-weight: 400; opacity: 0.8; }
  .puce button { width: 28px; height: 28px; border-radius: 14px; border: 0; background: transparent; color: inherit; display: flex; align-items: center; justify-content: center; }
  .formulaire { display: grid; grid-template-columns: minmax(0, 1fr) 56px 56px 50px; gap: 6px; align-items: end; }
  .formulaire label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted); }
  .formulaire input { height: 44px; min-width: 0; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); font-size: 15px; padding: 0 10px; }
  .formulaire input.ch { width: 56px; padding: 0 8px; text-align: center; }
  .ajouter { height: 44px; border-radius: 12px; border: 0; background: var(--inverse); color: var(--inverse-texte); display: flex; align-items: center; justify-content: center; }
  .pas { display: flex; gap: 6px; }
  .pas button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface-2); font-size: 20px; }
  .note { display: flex; flex-direction: column; gap: 8px; font-size: 13px; font-weight: 600; }
  .note textarea { font: 15px/1.4 var(--police); background: var(--surface); border: 1px solid var(--ligne); border-radius: 16px; padding: 12px 14px; resize: none; }
  .verset { font-size: 19px; line-height: 1.3; color: var(--muted); text-align: center; }
  .resume { font-size: 13px; }
</style>
