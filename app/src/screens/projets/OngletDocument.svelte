<script lang="ts">
  // Onglet Document (planche SousProjetDocument) : aperçu vivant de la fiche de suivi, export PDF (impression du
  // navigateur, sur l'appareil) et signature au doigt (spec §6.1, US-20). Le « papier » garde ses couleurs de document
  // imprimé dans les deux modes, comme la maquette.
  import { minJour, ajouterJours, ecartJours } from '@core/dates.ts';
  import { fenetreDuMois, metriquePilote, progressionDuMois } from '@core/progression.ts';
  import { attenduDuJour } from '@core/rapport.ts';
  import { nombre } from '@core/units.ts';
  import type { Jour, Metrique } from '@core/types.ts';
  import type { Projet, Rubrique, SousProjetLigne } from '@core/lignes.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { valeursDuSousProjet } from '../../data/requetes.ts';
  import { validerSousProjet } from '../../data/actions/projets.ts';
  import { enregistrerSignature, lireSignature } from './donnees.ts';
  import { jourChiffres, jourCourt, MOIS_COURTS, parJour, periodeTexte, resumeProgression, textesParJour, valeurTexte } from './vues.ts';

  let { sp, projet, rubrique, metriques, code, mois, jour }: {
    sp: SousProjetLigne; projet: Projet; rubrique: Rubrique | undefined; metriques: Metrique[]; code: string | null; mois: string; jour: Jour;
  } = $props();

  const valeurs = $derived(valeursDuSousProjet(sp));
  const f = $derived(fenetreDuMois(sp, mois));
  const finVue = $derived(f ? minJour(f.fin, jour) : null);
  const pilote = $derived(metriquePilote(metriques, sp.metrique_pilote_id));
  const colonnes = $derived([...(pilote ? [pilote] : []), ...metriques.filter((m) => m.id !== pilote?.id)].slice(0, 4));
  const progs = $derived(new Map(metriques.map((m) => [m.id, progressionDuMois(m, sp, valeurs, mois, jour)])));
  const compte = (m: Metrique) => ['nombre', 'fois', 'oui_non', 'choix'].includes(m.type);
  const cell = (m: Metrique, v: number | undefined) => (v == null ? '' : compte(m) ? nombre(v) : valeurTexte(m, v, true));

  const lignes = $derived.by(() => {
    if (!f || !finVue || finVue < f.debut) return [];
    const parCol = colonnes.map((m) => (m.type === 'reference' ? { t: textesParJour(valeurs, m.cle, f.debut, finVue) } : { p: parJour(valeurs, m, f.debut, finVue) }));
    const res: { j: Jour; obj: string; cells: string[] }[] = [];
    for (let j = finVue; j >= f.debut; j = ajouterJours(j, -1)) {
      const o = pilote ? attenduDuJour(pilote, sp, j) : null;
      res.push({ j, obj: o == null || !pilote ? '' : cell(pilote, o), cells: colonnes.map((m, i) => ('t' in parCol[i] ? parCol[i].t!.get(j) ?? '—' : cell(m, parCol[i].p!.get(j)) || (compte(m) ? '0' : '—'))) });
    }
    return res;
  });
  const aVenir = $derived(f && finVue ? Math.max(0, ecartJours(finVue, f.fin)) : 0);

  // La fiche se remplit seule quand une réponse manque : Quand = la période, Combien = les objectifs du mois.
  const fiche = $derived.by(() => {
    const combien = metriques.filter((m) => m.type !== 'reference' && progs.get(m.id)?.cible != null).map((m) => valeurTexte(m, progs.get(m.id)!.cible, true)).join(' · ');
    const champs: [string, string][] = [
      ['Quoi', sp.fiche?.quoi], ['Pourquoi', sp.fiche?.pourquoi], ['Qui', sp.fiche?.qui], ['Où', sp.fiche?.ou],
      ['Quand', sp.fiche?.quand || periodeTexte(sp.debut, sp.fin)], ['Comment', sp.fiche?.comment], ['Combien', sp.fiche?.combien || combien]
    ].filter((x): x is [string, string] => !!x[1]);
    return champs;
  });
  const totaux = $derived([
    ...metriques.filter((m) => m.type !== 'reference').slice(0, 2).map((m, i) => ({ l: i === 0 ? 'Total' : m.nom, v: resumeProgression(m, { realise: progs.get(m.id)?.realise ?? 0, cible: progs.get(m.id)?.cible ?? null }) })),
    ...(pilote ? [{ l: 'Avancement', v: `${progs.get(pilote.id)?.pct ?? 0} %` }] : [])
  ]);

  let signature = $state<{ image: string; le: string } | null>(null);
  $effect(() => { signature = lireSignature(sp.id); });
  const etat = $derived(signature ? 'signé' : sp.statut === 'termine' ? 'terminé' : 'en cours');
  const mm = $derived(`${MOIS_COURTS[+mois.slice(5, 7) - 1].toUpperCase()} ${mois.slice(0, 4)}`);

  // Signature au doigt
  let signer = $state(false);
  let toile = $state<HTMLCanvasElement | null>(null);
  let trace = false;
  let vide = $state(true);
  function point(e: PointerEvent) { const r = toile!.getBoundingClientRect(); return [(e.clientX - r.left) * (toile!.width / r.width), (e.clientY - r.top) * (toile!.height / r.height)]; }
  function debut(e: PointerEvent) { if (!toile) return; toile.setPointerCapture(e.pointerId); trace = true; const c = toile.getContext('2d')!; const [x, y] = point(e); c.beginPath(); c.moveTo(x, y); }
  function bouge(e: PointerEvent) {
    if (!trace || !toile) return;
    const c = toile.getContext('2d')!;
    c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = getComputedStyle(toile).color;
    const [x, y] = point(e); c.lineTo(x, y); c.stroke(); vide = false;
  }
  function effacer() { toile?.getContext('2d')?.clearRect(0, 0, toile.width, toile.height); vide = true; }
  function confirmer() {
    if (!toile || vide) { dire('Signe dans le cadre.'); return; }
    enregistrerSignature(sp.id, toile.toDataURL('image/png'));
    signature = lireSignature(sp.id);
    if (sp.statut !== 'termine') validerSousProjet(sp.id, sp.bilan);
    signer = false;
    dire('Document signé · le sous-projet rejoint l’Archive');
  }
</script>

<span class="vivant muted"><span class="point"></span>Document vivant · se remplit à chaque saisie</span>

<article class="papier" aria-label="Aperçu du document">
  <div class="entete">
    <span class="serif titre-doc">Fiche de suivi</span>
    <span class="mono meta">LUTHER LIFE{code ? ` · ${code}` : ''} · {mm}</span>
  </div>
  <div class="mono meta">{rubrique?.nom ?? ''} · Projet {projet.numero ?? ''} · {periodeTexte(sp.debut, sp.fin)} · {etat}</div>
  <div class="serif sous-titre">{projet.nom} · {sp.nom}</div>
  {#if fiche.length}
    <div class="fiche">
      {#each fiche as [q, r] (q)}<b>{q}</b><span>{r}</span>{/each}
    </div>
  {/if}
  {#if colonnes.length}
    <div class="table" style:--cols="38px 34px {colonnes.map((m) => (m.type === 'reference' ? 'minmax(0, 1.6fr)' : 'minmax(0, 1fr)')).join(' ')}">
      <div class="rang tete mono"><span>Date</span><span>Obj.</span>{#each colonnes as m (m.id)}<span class="coupe">{m.nom.split(/\s+/)[0]}</span>{/each}</div>
      {#each lignes as l (l.j)}
        <div class="rang" class:aujourdhui={l.j === jour}><span class="mono">{jourChiffres(l.j)}</span><span>{l.obj}</span>{#each l.cells as c, i (i)}<span class="coupe">{c}</span>{/each}</div>
      {/each}
      {#if aVenir}<span class="muted-doc">… {aVenir} jour{aVenir > 1 ? 's' : ''} à venir</span>{/if}
    </div>
    <div class="totaux">
      {#each totaux as t (t.l)}<span><b>{t.l}</b><br />{t.v}</span>{/each}
    </div>
  {/if}
  {#if sp.bilan}<div><b>Bilan</b><br />{sp.bilan}</div>{/if}
  <div class="signatures">
    <div class="sig">
      {#if signature}<img src={signature.image} alt="Signature" /><span>Signé le {jourCourt(signature.le.slice(0, 10))} {signature.le.slice(0, 4)}</span>
      {:else}<div class="ligne-sig"></div><span>Signature, le ____ / ____ / {jour.slice(0, 4)}</span>{/if}
    </div>
    <div class="sig"><div class="ligne-sig"></div><span>Seconde personne (facultatif)</span></div>
  </div>
</article>

<div class="actions">
  <div class="deux">
    <Bouton variante="secondaire" grand onclick={() => window.print()}>Exporter en PDF</Bouton>
    <Bouton grand onclick={() => { signer = true; vide = true; }}>{signature ? 'Signer à nouveau' : 'Signer au doigt'}</Bouton>
  </div>
  <span class="muted note">Une fois signé, le sous-projet rejoint l’<a href="/archive">Archive</a>.</span>
</div>

<Volet ouvert={signer} onfermer={() => (signer = false)} label="Signer au doigt">
  <h2 class="titre">Signer au doigt</h2>
  <canvas bind:this={toile} width="680" height="300" class="toile" aria-label="Zone de signature" onpointerdown={debut} onpointermove={bouge} onpointerup={() => (trace = false)} onpointercancel={() => (trace = false)}></canvas>
  <span class="muted note">Signé le {jourCourt(jour)} {jour.slice(0, 4)}. La signature reste sur cet appareil et s’ajoute au document.</span>
  <div class="deux">
    <Bouton variante="secondaire" onclick={effacer}>Effacer</Bouton>
    <Bouton onclick={confirmer}>Signer</Bouton>
  </div>
</Volet>

<style>
  .vivant { display: flex; align-items: center; gap: 6px; font-size: 12px; }
  .point { width: 7px; height: 7px; border-radius: 4px; background: var(--bon); }
  /* Le papier : couleurs d'un document imprimé, identiques de nuit comme de jour (c'est l'aperçu du PDF). */
  .papier, .toile {
    --papier: #ffffff; --encre: #16171b; --encre-2: #5e6068; --filet: #e3e1db; --pointille: #9a9ca3;
  }
  .papier { background: var(--papier); color: var(--encre); border-radius: 6px; box-shadow: var(--ombre); padding: 22px 20px; display: flex; flex-direction: column; gap: 10px; font-size: 11px; line-height: 1.4; }
  .entete { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; border-bottom: 2px solid var(--encre); padding-bottom: 6px; }
  .titre-doc { font-size: 20px; font-style: normal; }
  .meta { font-size: 9px; color: var(--encre-2); text-transform: uppercase; }
  .sous-titre { font-size: 17px; line-height: 1.2; font-style: normal; }
  .fiche { display: grid; grid-template-columns: 58px 1fr; gap: 3px 8px; }
  .table { display: flex; flex-direction: column; }
  .rang { display: grid; grid-template-columns: var(--cols); gap: 4px; padding: 3px 0; border-bottom: 1px solid var(--filet); }
  .rang.tete { font-size: 9px; color: var(--encre-2); border-top: 1px solid var(--encre); border-bottom: 1px solid var(--encre); padding: 4px 0; }
  .rang.aujourdhui { background: color-mix(in srgb, var(--c) 10%, var(--papier)); }
  .rang .mono { font-size: 9px; }
  .coupe { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .muted-doc { color: var(--encre-2); padding-top: 4px; }
  .totaux { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; border: 1px solid var(--encre); padding: 6px 8px; }
  .signatures { margin-top: 8px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
  .sig { display: flex; flex-direction: column; gap: 4px; }
  .sig img { height: 34px; object-fit: contain; object-position: left bottom; border-bottom: 1px dashed var(--pointille); }
  .ligne-sig { height: 34px; border-bottom: 1px dashed var(--pointille); }
  .actions { position: sticky; bottom: -24px; margin: 0 -16px -24px; padding: 12px 16px 18px; background: var(--fond); display: flex; flex-direction: column; gap: 8px; }
  .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .note { font-size: 12px; text-align: center; }
  .note a { color: var(--c-encre); text-decoration: underline; }
  h2 { font-size: 22px; }
  .toile { width: 100%; aspect-ratio: 680 / 300; border-radius: 14px; background: var(--papier); color: var(--encre); touch-action: none; border: 1px solid var(--ligne); }

  @media print {
    :global(body *) { visibility: hidden; }
    .papier, .papier :global(*) { visibility: visible; }
    .papier { position: absolute; left: 0; top: 0; width: 100%; box-shadow: none; border-radius: 0; font-size: 12px; }
  }
</style>
