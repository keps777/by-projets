<script lang="ts">
  // Onglet Suivi (planches SousProjet, SousProjetNT, JourSousProjet) : réalisé du mois, trait « où je devrais être »,
  // retard et rattrapage, graphique du mois, objectif et réalisé de chaque jour, saisie et correction.
  import { jourSemaine, JOURS_LONGS, minJour } from '@core/dates.ts';
  import { TYPES } from '@core/metriques.ts';
  import { doitEtreValide, fenetreDuMois, joursEcoules, metriquePilote, progressionDuMois } from '@core/progression.ts';
  import { attenduDuJour } from '@core/rapport.ts';
  import { rythme } from '@core/calculs.ts';
  import { formatHeure, nombre } from '@core/units.ts';
  import type { Jour, Metrique } from '@core/types.ts';
  import type { SousProjetLigne } from '@core/lignes.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import { metriquesDe, valeursDuSousProjet } from '../../data/requetes.ts';
  import { rouvrirSousProjet } from '../../data/actions/projets.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import GraphiqueMois from './GraphiqueMois.svelte';
  import VoletSaisie from './VoletSaisie.svelte';
  import VoletValider from './VoletValider.svelte';
  import {
    barresDuMois, jourAtteint, jourCourt, joursDecroissants, majuscule, nomMois, parJour, textesParJour, uniteCourte, valeurTexte, type BarreJour
  } from './vues.ts';

  let { sp, metriques, mois, jour, freres }: { sp: SousProjetLigne; metriques: Metrique[]; mois: string; jour: Jour; freres: SousProjetLigne[] } = $props();

  const valeurs = $derived(valeursDuSousProjet(sp));
  const pilote = $derived(metriquePilote(metriques, sp.metrique_pilote_id));
  const prog = $derived(pilote ? progressionDuMois(pilote, sp, valeurs, mois, jour) : null);
  const f = $derived(fenetreDuMois(sp, mois));
  const finVue = $derived(f ? minJour(f.fin, jour) : null);
  const compte = $derived(!!pilote && ['nombre', 'fois', 'oui_non', 'choix'].includes(pilote.type));
  const somme = $derived(!!pilote && TYPES[pilote.type].agregation === 'somme');
  const objJour = $derived(pilote ? attenduDuJour(pilote, sp, jour) : null);
  const parJ = $derived(pilote && f ? parJour(valeurs, pilote, f.debut, f.fin) : new Map<Jour, number>());
  const atteint = (v: number | undefined) => !!pilote && jourAtteint(pilote, v, objJour);
  const barres = $derived(barresDuMois(mois, parJ, jour, sp.debut, sp.fin, (v) => atteint(v)));

  /** Valeur courte du pilote : « 23 » pour un compte, « 2 h 30 » pour un temps. */
  const court = (v: number | null | undefined) => (!pilote ? '' : v == null ? '—' : compte ? nombre(v) : valeurTexte(pilote, v, true));
  const arrondi = (v: number) => (compte ? Math.round(v) : v);

  const ligneRetard = $derived.by(() => {
    if (!pilote || !prog || !f) return null;
    if (prog.etat === 'a_venir') return { a: `Commence le ${jourCourt(f.debut)}.`, retard: '', b: '' };
    if (pilote.type === 'heure') return { a: `${prog.realise} jour${(prog.realise ?? 0) > 1 ? 's' : ''} sur ${joursEcoules(f, jour)} à l’heure.`, retard: '', b: '' };
    if (!somme) return { a: `Aujourd’hui : ${valeurTexte(pilote, prog.realise)} · cible ${valeurTexte(pilote, prog.cible)}.`, retard: '', b: '' };
    const att = arrondi(prog.attendu ?? 0);
    const debut = `${valeurTexte(pilote, att)} ${pilote.sens === 'moins' ? 'prévus' : 'attendus'} au ${jourCourt(jour)} · `;
    if (pilote.sens === 'moins') {
      const depasse = (prog.realise ?? 0) > (prog.cible ?? 0);
      if (depasse) return { a: debut, retard: `dépassé de ${valeurTexte(pilote, (prog.realise ?? 0) - (prog.cible ?? 0), true)}`, b: '.' };
      return (prog.realise ?? 0) > (prog.attendu ?? 0) ? { a: debut, retard: 'au-dessus du trait', b: ', ralentis un peu.' } : { a: debut + 'sous le trait, c’est bien.', retard: '', b: '' };
    }
    const retard = arrondi(prog.retard);
    if (retard > 0 && prog.parJourPourRattraper != null) {
      return { a: debut, retard: `${compte ? nombre(retard) : valeurTexte(pilote, retard, true)} de retard`, b: `, à rattraper à ${valeurTexte(pilote, prog.parJourPourRattraper, true)} par jour` };
    }
    if (retard > 0) return { a: debut, retard: `${compte ? nombre(retard) : valeurTexte(pilote, retard, true)} de retard`, b: '.' };
    return { a: debut + ((prog.realise ?? 0) > (prog.attendu ?? 0) + 0.5 ? `${court((prog.realise ?? 0) - (prog.attendu ?? 0))} d’avance.` : 'tu es dans les temps.'), retard: '', b: '' };
  });

  // Trois chiffres : rythme, jours atteints, temps donné (ou jours restants).
  const stats = $derived.by(() => {
    if (!pilote || !prog || !f) return [];
    const ecoules = joursEcoules(f, jour);
    const passes = finVue ? joursDecroissants(f.debut, finVue).filter((j) => j < jour) : [];
    const res: { v: string; l: string }[] = [];
    if (somme) {
      const r = rythme(prog.realise ?? 0, ecoules) ?? 0;
      res.push({ v: compte ? nombre(r) : valeurTexte(pilote, r, true), l: `${compte && pilote.type === 'nombre' ? uniteCourte(pilote.unite) + ' ' : ''}par jour` });
    } else if (pilote.type === 'heure') {
      const vs = [...parJ.values()];
      res.push({ v: vs.length ? formatHeure(vs.reduce((s, x) => s + x, 0) / vs.length) : '—', l: 'heure moyenne' });
    } else res.push({ v: valeurTexte(pilote, prog.realise, true), l: 'valeur actuelle' });
    res.push({ v: `${passes.filter((j) => atteint(parJ.get(j))).length} / ${passes.length}`, l: 'jours atteints' });
    const temps = metriques.find((m) => m.type === 'temps' && m.id !== pilote.id);
    if (temps && f) {
      const total = [...parJour(valeurs, temps, f.debut, f.fin).values()].reduce((s, x) => s + x, 0);
      res.push({ v: valeurTexte(temps, total), l: temps.nom.toLowerCase() });
    } else res.push({ v: String(prog.joursRestants), l: `jour${prog.joursRestants > 1 ? 's' : ''} restant${prog.joursRestants > 1 ? 's' : ''}` });
    return res;
  });

  const partages = $derived(pilote ? freres.filter((s) => s.id !== sp.id && metriquesDe(s.id).some((m) => m.cle === pilote.cle)) : []);
  const aValider = $derived((sp.statut === 'en_cours' || sp.statut === 'a_valider') && ((!!sp.fin && jour > sp.fin) || (!!pilote && doitEtreValide(pilote, sp, valeurs, jour))));

  // Tableau jour par jour
  const autres = $derived(metriques.filter((m) => m.id !== pilote?.id));
  const refs = $derived(autres.filter((m) => m.type === 'reference'));
  const nums = $derived(autres.filter((m) => m.type !== 'reference'));
  const enTeteAutres = $derived(autres.map((m) => m.nom.split(/\s+/)[0].toLowerCase()).join(' · '));
  const lignes = $derived.by(() => {
    if (!pilote || !f || !finVue) return [];
    const textes = refs.map((m) => textesParJour(valeurs, m.cle, f.debut, finVue));
    const autresParJour = nums.map((m) => ({ m, p: parJour(valeurs, m, f.debut, finVue) }));
    return joursDecroissants(f.debut, finVue).map((j) => {
      const v = parJ.get(j);
      const obj = attenduDuJour(pilote, sp, j);
      const ok = atteint(v);
      const delta = compte && obj != null && v != null ? Math.round(v - obj) : 0;
      const t = textes.map((x) => x.get(j)).filter(Boolean).join(' · ');
      const n = autresParJour.map(({ m, p }) => (p.has(j) ? valeurTexte(m, p.get(j), true) : null)).filter(Boolean).join(' · ');
      return {
        j, tag: j === jour ? 'aujourd’hui' : JOURS_LONGS[jourSemaine(j)], obj: obj == null ? '—' : court(obj),
        v: court(v ?? (somme ? 0 : null)), etat: ok ? 'bon' : !v && j < jour ? 'zero' : 'neutre',
        delta: delta === 0 ? '' : delta > 0 ? `+${delta}` : `−${-delta}`, haut: t || n || '—', bas: t ? n : ''
      };
    });
  });

  let saisieJour = $state<Jour | null>(null);
  let validation = $state(false);
  const decrire = (b: BarreJour) => `${jourCourt(b.jour)} · ${b.etat === 'avenir' ? 'à venir' : court(b.valeur ?? 0)}`;
</script>

{#if sp.statut === 'brouillon'}
  <div class="bandeau">
    <span>En pause · ce sous-projet sort des moyennes jusqu’à sa reprise.</span>
    <Bouton variante="secondaire" onclick={() => rouvrirSousProjet(sp.id)}>Reprendre</Bouton>
  </div>
{:else if sp.statut === 'termine'}
  <div class="bandeau">
    <span>Terminé{sp.termine_le ? ` le ${jourCourt(sp.termine_le.slice(0, 10))}` : ''}. Il est dans l’Archive.</span>
    <Bouton variante="secondaire" onclick={() => routeur.definir('onglet', 'document')}>Signer</Bouton>
  </div>
{:else if aValider}
  <div class="bandeau valider">
    <span><strong>Valider ce sous-projet ?</strong><br />La période est finie ou la cible est atteinte. Rien ne se termine en silence.</span>
    <Bouton onclick={() => (validation = true)}>Valider</Bouton>
  </div>
{/if}

{#if !pilote || !prog || prog.etat === 'a_definir'}
  <div class="carte bloc">
    <span class="etiquette">{nomMois(mois)}</span>
    <span class="titre grand">Objectif à définir</span>
    <span class="muted petit">Fixe un objectif chiffré à une métrique pour voir la barre du mois et le trait « où je devrais être ».</span>
    <Bouton variante="secondaire" onclick={() => routeur.definir('onglet', 'fiche')}>Régler les métriques</Bouton>
  </div>
{:else}
  <div class="carte bloc">
    <div class="haut">
      <div class="col">
        <span class="etiquette">{nomMois(mois)}</span>
        <span class="titre grand">{pilote.type === 'heure' ? nombre(prog.realise ?? 0) : court(prog.realise)} <span class="sur">/ {pilote.type === 'heure' ? `${joursEcoules(f!, jour)} j` : valeurTexte(pilote, prog.cible, true)}</span></span>
      </div>
      <span class="titre pct">{prog.pct ?? 0} %</span>
    </div>
    <span class="piste"><span class="rempli" class:mauvais={pilote.sens === 'moins' && (prog.ratio ?? 0) > 1} style:width="{prog.pct ?? 0}%"></span>{#if prog.traitPct != null}<span class="trait" style:left="{prog.traitPct}%"></span>{/if}</span>
    {#if ligneRetard}<span class="muted texte-retard">{ligneRetard.a}{#if ligneRetard.retard}<span class="retard">{ligneRetard.retard}</span>{/if}{ligneRetard.b}</span>{/if}
    <GraphiqueMois {barres} objectif={somme || pilote.type !== 'heure' ? objJour : null} libelleObjectif={objJour != null ? court(objJour) : ''} {decrire} />
  </div>

  <div class="stats">
    {#each stats as s (s.l)}
      <div class="carte stat"><span class="titre">{s.v}</span><span class="muted">{s.l}</span></div>
    {/each}
  </div>

  {#if partages.length}
    <div class="info">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="9" cy="12" r="5" /><circle cx="15" cy="12" r="5" /></svg>
      <span>Même saisie, {partages.length + 1 === 2 ? 'deux' : partages.length + 1} objectifs : « {pilote.nom.toLowerCase()} » compte dans {partages.length + 1 === 2 ? 'les deux' : `les ${partages.length + 1}`} sous-projets, sans double saisie.</span>
    </div>
  {/if}

  <div class="carte tableau">
    <div class="rangee entete"><span>Date</span><span>Obj.</span><span>Fait</span><span class="coupe">{majuscule(enTeteAutres) || 'Note'}</span></div>
    {#each lignes as l (l.j)}
      <button type="button" class="rangee" class:aujourdhui={l.j === jour} aria-label="Corriger le {jourCourt(l.j)}" onclick={() => (saisieJour = l.j)}>
        <span class="col"><span class="date">{jourCourt(l.j)}</span><span class="muted tag">{l.tag}</span></span>
        <span class="mono muted">{l.obj}</span>
        <span class="fait"><span class="pastille mono {l.etat}">{l.v}</span><span class="mono delta" class:plus={l.delta.startsWith('+')}>{l.delta}</span></span>
        <span class="col min"><span class="coupe">{l.haut}</span>{#if l.bas}<span class="mono muted tag">{l.bas}</span>{/if}</span>
      </button>
    {/each}
    <button type="button" class="ajouter" onclick={() => (saisieJour = jour)}>+ Saisir un autre jour</button>
  </div>
{/if}

<VoletSaisie ouvert={saisieJour != null} onfermer={() => (saisieJour = null)} projetId={sp.projet_id} {metriques} jour={saisieJour ?? jour} aujourdhui={jour} periode={sp} />
<VoletValider ouvert={validation} onfermer={() => (validation = false)} {sp} {metriques} {valeurs} aujourdhui={jour} />

<style>
  .petit { font-size: 12px; }
  .bloc { border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .haut { display: flex; align-items: flex-end; justify-content: space-between; gap: 10px; }
  .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .grand { font-size: 34px; line-height: 1; }
  .sur { font-size: 18px; color: var(--muted); }
  .pct { font-size: 26px; color: var(--c); }
  .piste { position: relative; display: block; height: 12px; border-radius: 6px; background: var(--piste); }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 6px; background: var(--c); }
  .rempli.mauvais { background: var(--mauvais); }
  .trait { position: absolute; top: -4px; bottom: -4px; width: 2px; margin-left: -1px; background: var(--texte); opacity: 0.6; }
  .texte-retard { font-size: 13px; }
  .retard { color: var(--alerte); font-weight: 600; }

  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .stat { border-radius: 16px; padding: 10px 12px; display: flex; flex-direction: column; }
  .stat .titre { font-size: 20px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .stat .muted { font-size: 11px; }

  .info, .bandeau { display: flex; gap: 10px; align-items: flex-start; background: var(--c-fond); color: var(--c-encre); border-radius: 16px; padding: 12px 14px; font-size: 13px; line-height: 1.4; }
  .info svg { flex: none; margin-top: 1px; }
  .bandeau { align-items: center; justify-content: space-between; background: var(--surface-2); color: var(--texte); }
  .bandeau.valider { background: var(--c-fond); color: var(--c-encre); }

  .tableau { border-radius: 22px; overflow: hidden; }
  .rangee { width: 100%; display: grid; grid-template-columns: 58px 44px 72px minmax(0, 1fr); gap: 8px; padding: 10px 14px; align-items: center; border: 0; border-bottom: 1px solid var(--ligne); background: transparent; text-align: left; min-height: 44px; font-size: 13px; }
  .rangee.aujourdhui { background: color-mix(in srgb, var(--c) 10%, transparent); }
  .entete { font-size: 11px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--muted); min-height: 0; }
  .date { font-weight: 600; }
  .tag { font-size: 10px; }
  .fait { display: flex; align-items: center; gap: 4px; }
  .pastille { min-width: 28px; height: 28px; padding: 0 6px; border-radius: 9px; background: var(--c-fond); color: var(--c-encre); display: flex; align-items: center; justify-content: center; font-size: 13px; white-space: nowrap; }
  .pastille.bon { background: var(--bon-fond); color: var(--bon); }
  .pastille.zero { background: var(--mauvais-fond); color: var(--mauvais); }
  .delta { font-size: 11px; color: var(--muted); }
  .delta.plus { color: var(--bon); }
  .min { min-width: 0; }
  .coupe { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ajouter { width: 100%; border: 0; background: transparent; color: var(--c-encre); font-size: 14px; font-weight: 600; min-height: 50px; }
</style>
