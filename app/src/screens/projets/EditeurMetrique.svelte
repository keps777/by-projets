<script lang="ts">
  // Carte d'édition d'une métrique (planche NouveauSousProjet, réutilisée par la Fiche) : nom, unité, objectif,
  // période, sens, « dans le rapport ». Les valeurs restent en unité de base ; l'écran montre minutes, dollars, km…
  import { OPTIONS_JEUNE, TYPES, UNITES_RAPIDES } from '@core/metriques.ts';
  import Icone from '../../ui/Icone.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import { PERIODES, champTexte, lireChamp, pasDe, type Brouillon } from './vues.ts';

  let { m, onchange, onretirer, pilote = false, onpilote }: {
    m: Brouillon; onchange: (patch: Partial<Brouillon>) => void; onretirer: () => void; pilote?: boolean; onpilote?: () => void;
  } = $props();

  const info = $derived(TYPES[m.type]);
  const estRef = $derived(m.type === 'reference');
  const uniteLibre = $derived(m.type === 'nombre' || m.type === 'fois');
  const sensLabel = $derived(estRef ? 'Texte libre' : m.type === 'heure' ? (m.sens === 'moins' ? 'Plus tôt = mieux' : 'Plus tard = mieux') : m.sens === 'plus' ? 'Plus = mieux' : 'Moins = mieux');

  // Champ d'objectif : texte local, relu à chaque changement venu de l'extérieur.
  let texte = $state('');
  $effect(() => { texte = champTexte(m.type, m.cible); });

  function pas(signe: 1 | -1) {
    const p = pasDe(m.type, m.cible);
    if (!p) return;
    const base = m.cible ?? 0;
    let v = Math.max(0, Math.round((base + signe * p) * 1000) / 1000);
    if (m.type === 'heure') v = Math.min(1435, v);
    if (m.type === 'note') v = Math.min(10, v);
    if (m.type === 'pourcentage') v = Math.min(100, v);
    onchange({ cible: v });
  }
  function valider() {
    const v = lireChamp(m.type, texte);
    if (texte.trim() && v == null) { texte = champTexte(m.type, m.cible); return; }
    onchange({ cible: v });
  }
  const options = $derived(m.options ?? OPTIONS_JEUNE);
  function changerOption(i: number, t: string) {
    const v = Number(t.replace(',', '.'));
    if (!Number.isFinite(v)) return;
    onchange({ options: options.map((o, j) => (j === i ? { ...o, valeur: v } : o)) });
  }
</script>

<div class="carte metrique">
  <div class="rang">
    <span class="type">{info.nom}</span>
    <input class="nom" value={m.nom} aria-label="Nom de la métrique" onchange={(e) => onchange({ nom: e.currentTarget.value.trim() || m.nom })} />
    <button type="button" class="retirer" aria-label="Retirer {m.nom}" onclick={onretirer}><Icone nom="poubelle" taille={16} trait={2.2} /></button>
  </div>

  {#if !estRef}
    <div class="grille">
      <label class="sous">Unité
        <input class="unite" value={uniteLibre ? m.unite : info.uniteAffichee || m.unite} disabled={!uniteLibre} onchange={(e) => onchange({ unite: e.currentTarget.value.trim() })} />
      </label>
      <div class="sous">Objectif
        <div class="pas">
          <button type="button" aria-label="Diminuer l’objectif" onclick={() => pas(-1)}>−</button>
          <input class="mono valeur" bind:value={texte} onchange={valider} inputmode={m.type === 'heure' ? 'text' : 'decimal'} placeholder="—" aria-label="Objectif de {m.nom}" />
          <button type="button" aria-label="Augmenter l’objectif" onclick={() => pas(1)}>+</button>
        </div>
      </div>
    </div>
    {#if m.type === 'nombre'}
      <div class="defile">
        {#each UNITES_RAPIDES as u (u)}
          <button type="button" class="puce" class:on={u === m.unite} aria-pressed={u === m.unite} onclick={() => onchange({ unite: u })}>{u}</button>
        {/each}
      </div>
    {/if}
    {#if m.type === 'choix'}
      <div class="options">
        <span class="sous">Valeurs</span>
        {#each options as o, i (o.label)}
          <label class="option mono">{o.label} =
            <input value={String(o.valeur).replace('.', ',')} inputmode="decimal" aria-label="Valeur de {o.label}" onchange={(e) => changerOption(i, e.currentTarget.value)} />
          </label>
        {/each}
      </div>
    {/if}
    {#if m.type !== 'heure'}
      <div class="periodes">
        {#each PERIODES as p (p.valeur)}
          <button type="button" class:on={p.valeur === m.periode_cible} aria-pressed={p.valeur === m.periode_cible} onclick={() => onchange({ periode_cible: p.valeur })}>{p.label}</button>
        {/each}
      </div>
    {/if}
  {/if}

  <div class="bas">
    <button type="button" class="sens" disabled={estRef} onclick={() => onchange({ sens: m.sens === 'plus' ? 'moins' : 'plus' })}>{sensLabel}</button>
    {#if onpilote && !estRef}
      <button type="button" class="sens" class:on={pilote} aria-pressed={pilote} onclick={onpilote}>{pilote ? 'Pilote la barre' : 'Piloter la barre'}</button>
    {/if}
    <span class="rapport">
      <Interrupteur actif={m.dans_rapport} label="Dans le rapport" couleur="var(--c)" onchange={(v) => onchange({ dans_rapport: v })} />
      <span>Dans le rapport</span>
    </span>
  </div>
</div>

<style>
  .metrique { border-radius: 20px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .rang { display: flex; align-items: center; gap: 8px; }
  .type { flex: none; font-size: 11px; font-weight: 600; padding: 5px 9px; border-radius: 9px; background: var(--c-fond); color: var(--c-encre); }
  input { height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 10px; font-size: 15px; min-width: 0; }
  input:disabled { color: var(--muted); }
  .nom { flex: 1; font-weight: 600; }
  .retirer { flex: none; width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; color: var(--mauvais); display: flex; align-items: center; justify-content: center; }
  .grille { display: grid; grid-template-columns: 76px minmax(0, 1fr); gap: 8px; align-items: end; }
  .sous { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--muted); }
  .unite { width: 76px; }
  .pas { display: flex; align-items: center; height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); }
  .pas button { flex: none; width: 44px; height: 44px; border: 0; background: transparent; font-size: 20px; }
  .valeur { flex: 1; height: 42px; border: 0; background: transparent; text-align: center; padding: 0; }
  .defile { display: flex; gap: 6px; overflow-x: auto; margin: 0 -14px; padding: 0 14px; }
  .puce { flex: none; height: 40px; padding: 0 12px; border-radius: 20px; border: 1px solid var(--ligne); background: transparent; font-size: 12px; font-weight: 600; }
  .puce.on { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .options { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 12px; }
  .option { display: flex; align-items: center; gap: 4px; font-size: 12px; }
  .option input { width: 56px; height: 40px; text-align: center; font-size: 13px; }
  .periodes { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .periodes button { height: 40px; border-radius: 10px; border: 1px solid var(--ligne); background: transparent; font-size: 12px; font-weight: 600; }
  .periodes button.on { background: var(--inverse); border-color: var(--inverse); color: var(--inverse-texte); }
  .bas { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .sens { height: 40px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--ligne); background: transparent; font-size: 12px; font-weight: 600; }
  .sens:disabled { color: var(--muted); cursor: default; }
  .sens.on { background: var(--c-fond); border-color: var(--c); color: var(--c-encre); }
  .rapport { margin-left: auto; display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 600; min-height: 44px; }
</style>
