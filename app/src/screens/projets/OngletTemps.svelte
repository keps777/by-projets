<script lang="ts">
  // Onglet Temps (planche SousProjetTemps) : temps donné ce mois, séances à venir, historique des séances.
  import { ajouterJours, jourSemaine, minJour, JOURS_COURTS } from '@core/dates.ts';
  import { fenetreDuMois, metriquePilote, progressionDuMois } from '@core/progression.ts';
  import { dureeLisible, nombre } from '@core/units.ts';
  import type { Jour, Metrique } from '@core/types.ts';
  import type { SousProjetLigne } from '@core/lignes.ts';
  import Icone from '../../ui/Icone.svelte';
  import { metriquesDe, valeursDuSousProjet } from '../../data/requetes.ts';
  import { heuresOccurrence, prochainesOccurrences, saisiesDuProjet } from './donnees.ts';
  import { joursDecroissants, jourCourt, majuscule, nomMois, parJour, uniteCourte, valeurTexte } from './vues.ts';

  let { sp, metriques, mois, jour, freres }: { sp: SousProjetLigne; metriques: Metrique[]; mois: string; jour: Jour; freres: SousProjetLigne[] } = $props();

  const valeurs = $derived(valeursDuSousProjet(sp));
  const f = $derived(fenetreDuMois(sp, mois));
  /** La métrique de temps du sous-projet ; sans elle, on montre quand même le temps saisi sur le projet, sans objectif. */
  const temps = $derived<Metrique>(metriques.find((m) => m.type === 'temps') ?? { id: '', cle: 'temps', type: 'temps', nom: 'Temps', unite: 'min', cible: null, periode: 'jour', sens: 'plus', dansRapport: false });
  const prog = $derived(progressionDuMois(temps, sp, valeurs, mois, jour));
  const total = $derived(f ? [...parJour(valeurs, temps, f.debut, f.fin).values()].reduce((s, x) => s + x, 0) : 0);
  const pilote = $derived(metriquePilote(metriques, sp.metrique_pilote_id));
  const moyenne = $derived.by(() => {
    if (!pilote || pilote.type === 'temps' || !f || !['nombre', 'fois'].includes(pilote.type)) return null;
    const n = [...parJour(valeurs, pilote, f.debut, f.fin).values()].reduce((s, x) => s + x, 0);
    if (!n || !total) return null;
    const s = total / n;
    const label = pilote.type === 'nombre' ? (uniteCourte(pilote.unite) === 'ch.' ? 'chapitre' : pilote.unite.replace(/s$/, '')) : 'fois';
    return `Temps moyen par ${label} : ${Math.floor(s / 60)} min${Math.round(s % 60) ? ` ${Math.round(s % 60)} s` : ''}.`;
  });
  const aussi = $derived(freres.filter((s) => s.id !== sp.id && metriquesDe(s.id).some((m) => m.cle === 'temps')).map((s) => `« ${s.nom} »`));

  const avenir = $derived(prochainesOccurrences(sp.id, jour, 4).map(({ occ, tache }) => ({
    id: occ.id, jour: occ.jour, titre: tache.titre, heures: heuresOccurrence(occ),
    quand: occ.jour === jour ? 'Aujourd’hui' : occ.jour === ajouterJours(jour, 1) ? 'Demain' : `${majuscule(JOURS_COURTS[jourSemaine(occ.jour)])} ${+occ.jour.slice(8)}`
  })));

  const historique = $derived.by(() => {
    if (!f) return [];
    const fin = minJour(f.fin, jour);
    const saisies = saisiesDuProjet(sp.projet_id, f.debut, fin);
    const cles = new Set(metriques.map((m) => m.cle).concat('temps'));
    const parJourS = new Map<Jour, typeof saisies>();
    for (const s of saisies) if (s.valeurs.some((v) => cles.has(v.cle))) { const l = parJourS.get(s.saisie.jour); if (l) l.push(s); else parJourS.set(s.saisie.jour, [s]); }
    const ref = metriques.find((m) => m.type === 'reference');
    return joursDecroissants(f.debut, fin).flatMap((j) => {
      const liste = parJourS.get(j);
      if (!liste) return [{ id: j, jour: j, titre: 'Aucune séance', heures: '—', droite: pilote && pilote.type !== 'temps' ? valeurTexte(pilote, 0, true) : '', min: '0 min' }];
      return liste.map((s) => {
        const v = (cle: string) => s.valeurs.filter((x) => x.cle === cle);
        const texte = ref ? v(ref.cle).map((x) => x.valeur_txt).filter(Boolean).join(' · ') : '';
        const sec = v('temps').reduce((a, x) => a + (x.valeur_num ?? 0), 0);
        const p = pilote && pilote.type !== 'temps' ? v(pilote.cle).reduce((a, x) => a + (x.valeur_num ?? 0), 0) : null;
        const encours = s.occ && (s.occ.etat === 'en_cours' || s.occ.etat === 'pause');
        return {
          id: s.saisie.id, jour: j, titre: texte || s.saisie.note || s.tache?.titre || (s.saisie.source === 'rattrapage' ? 'Rattrapage' : 'Saisie manuelle'),
          heures: s.occ ? heuresOccurrence(s.occ, true) + (encours ? ' · en cours' : '') : 'saisie à la main',
          droite: p != null && pilote ? (pilote.type === 'nombre' ? `${nombre(p)} ${uniteCourte(pilote.unite)}` : valeurTexte(pilote, p, true)) : '',
          min: `${s.saisie.approx ? '~' : ''}${dureeLisible(sec)}`
        };
      });
    });
  });
</script>

<div class="carte bloc">
  <div class="haut">
    <div class="col">
      <span class="etiquette">Temps donné en {nomMois(mois).toLowerCase()}</span>
      <span class="titre grand">{dureeLisible(total)}{#if prog.cible != null}{' '}<span class="sur">/ {dureeLisible(prog.cible)}</span>{/if}</span>
    </div>
    {#if prog.pct != null}<span class="titre pct">{prog.pct} %</span>{/if}
  </div>
  {#if prog.cible != null}
    <span class="piste"><span class="rempli" style:width="{prog.pct ?? 0}%"></span>{#if prog.traitPct != null}<span class="trait" style:left="{prog.traitPct}%"></span>{/if}</span>
  {/if}
  {#if moyenne || aussi.length}
    <span class="muted petit">{moyenne ?? ''}{#if aussi.length}{moyenne ? ' ' : ''}Il alimente aussi {aussi.join(', ')}.{/if}</span>
  {:else if prog.cible == null}
    <span class="muted petit">Aucun objectif de temps : ajoute une métrique Temps dans la Fiche pour suivre une cible.</span>
  {/if}
</div>

<section class="groupe">
  <span class="etiquette">À venir</span>
  <div class="carte liste">
    {#each avenir as n (n.id)}
      <div class="rangee">
        <span class="muted petit quand">{n.quand}</span>
        <span class="col"><span class="gras">{n.titre}</span><span class="mono muted petit">{n.heures}</span></span>
        <a class="reporter" href="/?jour={n.jour}&occ={n.id}&reporter=1">Reporter</a>
      </div>
    {:else}
      <p class="muted petit vide">Aucune séance prévue. Ajoute une tâche qui nourrit ce sous-projet.</p>
    {/each}
    <a class="ajouter" href="/tache/nouvelle?projet={sp.projet_id}&sous_projet={sp.id}"><Icone nom="plus" taille={14} trait={2.6} />Ajouter une tâche</a>
  </div>
</section>

<section class="groupe">
  <span class="etiquette">Historique des séances</span>
  <div class="carte liste">
    {#each historique as p (p.id)}
      <div class="rangee histo">
        <span class="muted petit">{jourCourt(p.jour)}</span>
        <span class="col min"><span class="gras coupe">{p.titre}</span><span class="mono muted petit">{p.heures}</span></span>
        <span class="droite"><span class="mono">{p.droite}</span><span class="mono muted petit">{p.min}</span></span>
      </div>
    {:else}
      <p class="muted petit vide">Aucune séance ce mois-ci.</p>
    {/each}
  </div>
</section>

<style>
  .petit { font-size: 12px; }
  .gras { font-weight: 600; font-size: 14px; }
  .bloc { border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .haut { display: flex; justify-content: space-between; align-items: flex-end; gap: 10px; }
  .col { flex: 1; display: flex; flex-direction: column; gap: 2px; }
  .min { min-width: 0; }
  .grand { font-size: 34px; line-height: 1; }
  .sur { font-size: 18px; color: var(--muted); }
  .pct { font-size: 22px; line-height: normal; color: var(--c); }
  .piste { position: relative; display: block; height: 10px; border-radius: 5px; background: var(--piste); }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 5px; background: var(--c); animation: remplit 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; transition: width 0.4s ease; }
  @keyframes remplit { from { width: 0; } }
  .trait { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--texte); opacity: 0.6; }
  .groupe { display: flex; flex-direction: column; gap: 8px; }
  .liste { border-radius: 20px; overflow: hidden; }
  /* 56 px de contenu + marges + filet (boîte de contenu dans la maquette). */
  .rangee { display: flex; align-items: center; gap: 10px; padding: 10px 14px; border-bottom: 1px solid var(--ligne); min-height: 77px; }
  .quand { flex: none; width: 56px; }
  .reporter { flex: none; height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--ligne); font-size: 13px; font-weight: 600; display: flex; align-items: center; }
  .histo { display: grid; grid-template-columns: 52px minmax(0, 1fr) auto; }
  .droite { display: flex; flex-direction: column; align-items: flex-end; font-size: 13px; }
  .coupe { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vide { padding: 12px 14px; }
  .ajouter { color: var(--c-encre); font-size: 14px; font-weight: 600; min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 6px; }
</style>
