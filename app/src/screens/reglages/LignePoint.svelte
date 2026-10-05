<script lang="ts">
  // Un point du rapport dans les Réglages : ligne repliée (code, nom, mesures) et édition dépliée.
  import Icone from '../../ui/Icone.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { modifierPoint, retirerPoint } from '../../data/actions/reglages.ts';
  import { projetsDe, rubriques } from '../../data/requetes.ts';
  import type { PointRapportLigne } from '@core/lignes.ts';
  import { categorie, mesuresProposees, objectifLisible, sourceRetenue, type MesureProposee } from './mesures.ts';

  let { point, n, ouvert, exemple, premier, dernier, onbasculer, ondeplacer }: {
    point: PointRapportLigne; n: number; ouvert: boolean; exemple: string; premier: boolean; dernier: boolean;
    onbasculer: () => void; ondeplacer: (sens: -1 | 1) => void;
  } = $props();

  const mesures = $derived(ouvert ? mesuresProposees(point, magasin.lignes) : []);
  const tags = $derived([...new Set((point.mesures ?? []).map((m) => categorie(m.cle)))]);
  const groupes = $derived(ouvert ? rubriques().map((r) => ({ r, projets: projetsDe(r.id) })) : []);
  let confirmer = $state(false);

  function texte(e: Event, champ: 'code' | 'libelle'): void {
    const el = e.currentTarget as HTMLInputElement;
    const v = el.value.trim();
    if (!v) { el.value = point[champ]; return; }
    if (v !== point[champ]) modifierPoint(point.id, { [champ]: v });
  }
  function projet(e: Event): void {
    const v = (e.currentTarget as HTMLSelectElement).value || null;
    modifierPoint(point.id, { projet_id: v, mesures: (point.mesures ?? []).map((m) => ({ ...m, sous_projet_id: null })) });
  }
  function basculerMesure(m: MesureProposee): void {
    const actuelles = point.mesures ?? [];
    modifierPoint(point.id, { mesures: m.on ? actuelles.filter((x) => x.cle !== m.cle) : [...actuelles, { cle: m.cle, sous_projet_id: null }] });
  }
  function source(cle: string, e: Event): void {
    const v = (e.currentTarget as HTMLSelectElement).value || null;
    modifierPoint(point.id, { mesures: (point.mesures ?? []).map((m) => (m.cle === cle ? { ...m, sous_projet_id: v } : m)) });
  }
  function retirer(): void {
    if (!confirmer) { confirmer = true; setTimeout(() => (confirmer = false), 4000); return; }
    retirerPoint(point.id);
  }
</script>

<div class="point" class:ouvert class:inactif={!point.actif}>
  <button type="button" class="ligne" aria-expanded={ouvert} onclick={onbasculer}>
    <span class="poignee"><Icone nom="poignee" taille={14} trait={2.4} /></span>
    <span class="code mono">{n}. {point.code}</span>
    <span class="noms">
      <span class="nom">{point.libelle}</span>
      <span class="tags">{#each tags as t (t)}<span>{t}</span>{/each}{#if !point.actif}<span>Masqué</span>{/if}</span>
    </span>
    <span class="chevron" class:tourne={ouvert}><Icone nom="suivant" taille={16} trait={2.2} /></span>
  </button>

  {#if ouvert}
    <div class="edition">
      <div class="champs">
        <label>Code<input class="mono" value={point.code} onchange={(e) => texte(e, 'code')} autocapitalize="characters" /></label>
        <label>Nom<input value={point.libelle} onchange={(e) => texte(e, 'libelle')} /></label>
      </div>
      <label class="rangee">
        <span class="muted">Projet lié</span>
        <select value={point.projet_id ?? ''} onchange={projet}>
          <option value="">Aucun : toutes les saisies</option>
          {#each groupes as g (g.r.id)}
            <optgroup label={g.r.nom}>{#each g.projets as pr (pr.id)}<option value={pr.id}>{pr.nom}</option>{/each}</optgroup>
          {/each}
        </select>
      </label>
      <div class="rangee">
        <span class="muted">Dans le rapport</span>
        <Interrupteur actif={point.actif} label="Inclure {point.code} dans le rapport" onchange={(v) => modifierPoint(point.id, { actif: v })} />
      </div>

      <span class="etiquette sous">Ce qu’on mesure</span>
      {#each mesures as m (m.cle)}
        {@const src = sourceRetenue(m)}
        {@const obj = src ? objectifLisible(src.metrique) : null}
        <div class="mesure">
          <Interrupteur actif={m.on} label={m.label} onchange={() => basculerMesure(m)} />
          <span class="mtexte">
            <span class="mnom">{m.label}</span>
            <span class="muted maide">{src ? `objectif de « ${src.sp.nom} »` : m.aide}</span>
            {#if m.on && m.sources.length > 1}
              <select class="source" aria-label="Sous-projet qui fournit l’objectif" value={m.sousProjetId ?? ''} onchange={(e) => source(m.cle, e)}>
                <option value="">Le plus récent</option>
                {#each m.sources as s (s.sp.id)}<option value={s.sp.id}>{s.sp.nom}</option>{/each}
              </select>
            {/if}
          </span>
          {#if obj}<span class="obj mono" class:eteint={!m.on}>{obj}</span>{/if}
        </div>
      {/each}

      <div class="pied">
        <span class="mono muted exemple">Exemple : {exemple || '—'}</span>
        <span class="ordre">
          <button type="button" class="rond petit" aria-label="Monter" disabled={premier} onclick={() => ondeplacer(-1)}><span class="haut"><Icone nom="bas" taille={16} /></span></button>
          <button type="button" class="rond petit" aria-label="Descendre" disabled={dernier} onclick={() => ondeplacer(1)}><Icone nom="bas" taille={16} /></button>
        </span>
        <button type="button" class="retirer" onclick={retirer}>{confirmer ? 'Confirmer' : 'Retirer'}</button>
      </div>
    </div>
  {/if}
</div>

<style>
  .point { border-bottom: 1px solid var(--ligne); }
  .ouvert { background: var(--surface-2); }
  .ligne { width: 100%; border: 0; background: transparent; text-align: left; display: flex; align-items: center; gap: 10px; padding: 10px 12px; min-height: 52px; }
  .poignee { color: var(--faint); display: flex; }
  .code { flex: none; width: 84px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .noms { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .nom { font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .inactif .nom, .inactif .code { opacity: 0.55; }
  .tags { display: flex; gap: 4px; flex-wrap: wrap; }
  .tags span { font-size: 10px; font-weight: 600; padding: 2px 6px; border-radius: 6px; background: var(--surface-2); color: var(--muted); }
  .ouvert .tags span { background: var(--surface); }
  .chevron { color: var(--muted); display: flex; transition: transform 0.2s; }
  .chevron.tourne { transform: rotate(90deg); }
  .edition { padding: 4px 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .champs { display: grid; grid-template-columns: 90px minmax(0, 1fr); gap: 8px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted); }
  input, select { height: 44px; min-width: 0; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); font-size: 14px; padding: 0 10px; }
  .rangee { flex-direction: row; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 13px; min-height: 44px; }
  .rangee select { max-width: 62%; font-weight: 600; }
  .sous { font-size: 11px; margin-top: 2px; }
  .mesure { display: flex; align-items: center; gap: 10px; min-height: 44px; }
  .mtexte { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .mnom { font-size: 14px; font-weight: 600; }
  .maide { font-size: 12px; }
  .source { margin-top: 6px; height: 40px; font-size: 13px; }
  .obj { flex: none; font-size: 12px; padding: 6px 8px; border-radius: 10px; border: 1px solid var(--ligne); }
  .obj.eteint { opacity: 0.45; }
  .pied { display: flex; align-items: center; gap: 8px; }
  .exemple { flex: 1; min-width: 0; font-size: 12px; overflow-wrap: anywhere; }
  .ordre { display: flex; gap: 4px; }
  .rond.petit:disabled { opacity: 0.35; }
  .haut { display: flex; transform: rotate(180deg); }
  .retirer { flex: none; height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; color: var(--mauvais); font-size: 13px; font-weight: 600; }
</style>
