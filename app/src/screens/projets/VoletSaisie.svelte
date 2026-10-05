<script lang="ts">
  // « Saisir un autre jour » et correction d'une journée depuis un sous-projet (spec §8, sources manuel et rattrapage).
  // Chaque champ montre le total de la journée ; le modifier ajuste la saisie manuelle de ce jour, sans toucher aux blocs.
  import { agreger, TYPES } from '@core/metriques.ts';
  import { attenduDuJour } from '@core/rapport.ts';
  import { formatHeure, parseHeure } from '@core/units.ts';
  import type { Jour, Metrique } from '@core/types.ts';
  import Volet from '../../ui/Volet.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import Puces from '../../ui/Puces.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { contenuDuJour, idSaisieManuelle, saisirJour } from './donnees.ts';
  import { champTexte, jourCourt, lireChamp, pasDe, valeurTexte } from './vues.ts';

  let { ouvert, onfermer, projetId, metriques, jour, aujourdhui, periode }: {
    ouvert: boolean; onfermer: () => void; projetId: string; metriques: Metrique[]; jour: Jour; aujourdhui: Jour; periode: { debut: Jour; fin: Jour | null };
  } = $props();

  let j = $state('');
  let nums = $state<Record<string, number | null>>({});
  let champs = $state<Record<string, string>>({});
  let textes = $state<Record<string, string>>({});
  let autresTextes = $state<Record<string, string>>({});
  let note = $state('');

  $effect(() => { if (ouvert) j = jour; });

  // Recharge le contenu de la journée choisie.
  $effect(() => {
    if (!ouvert || !j) return;
    const c = contenuDuJour(projetId, j);
    const n: Record<string, number | null> = {}, ch: Record<string, string> = {}, t: Record<string, string> = {}, at: Record<string, string> = {};
    for (const m of metriques) {
      const e = c.get(m.cle);
      if (m.type === 'reference') { t[m.cle] = e?.manuelTxt ?? ''; at[m.cle] = e?.textes.join(' · ') ?? ''; continue; }
      const somme = TYPES[m.type].agregation === 'somme';
      const tous = [...(e?.nums ?? []), ...(e?.manuel != null ? [e.manuel] : [])];
      const v = !e ? null : somme ? tous.reduce((s, x) => s + x, 0) : e.manuel ?? agreger(m.type, tous.map((valeur) => ({ cle: m.cle, jour: j, valeur })));
      n[m.cle] = v;
      ch[m.cle] = champTexte(m.type, v);
    }
    nums = n; champs = ch; textes = t; autresTextes = at;
    note = magasin.trouver('saisies', idSaisieManuelle(projetId, j))?.note ?? '';
  });

  function regler(m: Metrique, v: number | null) { nums[m.cle] = v; champs[m.cle] = champTexte(m.type, v); }
  function pas(m: Metrique, signe: 1 | -1) {
    let v = Math.max(0, (nums[m.cle] ?? 0) + signe * (pasDe(m.type, nums[m.cle] ?? 0) || 1));
    if (m.type === 'note') v = Math.min(10, v);
    if (m.type === 'pourcentage') v = Math.min(100, v);
    regler(m, v);
  }
  function lire(m: Metrique) { const v = lireChamp(m.type, champs[m.cle] ?? ''); regler(m, v ?? (champs[m.cle]?.trim() ? nums[m.cle] : null)); }

  const horsPeriode = $derived(!!j && (j < periode.debut || (periode.fin != null && j > periode.fin)));

  function enregistrer() {
    if (!j || j > aujourdhui) { dire('Choisis un jour passé ou aujourd’hui.'); return; }
    saisirJour(projetId, j, metriques.map((m) => ({ cle: m.cle, type: m.type, num: nums[m.cle], txt: textes[m.cle] })), aujourdhui, note);
    dire(j === aujourdhui ? 'Saisie enregistrée' : `Saisie du ${jourCourt(j)} enregistrée`);
    onfermer();
  }
</script>

<Volet {ouvert} {onfermer} label="Saisir un jour">
  <div class="tete">
    <h2 class="titre">{j === aujourdhui ? 'Saisir aujourd’hui' : 'Saisir un autre jour'}</h2>
    <input type="date" class="date" bind:value={j} max={aujourdhui} aria-label="Jour de la saisie" />
  </div>
  {#if horsPeriode}<p class="muted petit">Ce jour est hors de la période du sous-projet : la saisie compte pour le projet, pas pour cette barre.</p>{/if}

  {#each metriques as m (m.id)}
    {@const prevu = attenduDuJour(m, periode, j)}
    <div class="champ">
      <span class="libelle"><span>{m.nom}</span>{#if prevu != null && m.type !== 'reference'}<span class="muted mono petit">prévu {valeurTexte(m, prevu, true)}</span>{/if}</span>
      {#if m.type === 'reference'}
        <input class="texte" bind:value={textes[m.cle]} placeholder="Ex. Matthieu 8–10" aria-label={m.nom} />
        {#if autresTextes[m.cle]}<span class="muted petit">Déjà noté dans les blocs : {autresTextes[m.cle]}</span>{/if}
      {:else if m.type === 'oui_non'}
        <span class="ligne"><span class="muted">{nums[m.cle] ? 'Oui' : 'Non'}</span><Interrupteur actif={!!nums[m.cle]} label={m.nom} couleur="var(--c)" onchange={(v) => regler(m, v ? 1 : 0)} /></span>
      {:else if m.type === 'choix'}
        <Puces options={(m.options ?? []).map((o) => ({ valeur: o.valeur, label: o.label }))} valeur={nums[m.cle] ?? null} couleur="var(--c)" texte="var(--c-sur)" onchoisir={(v) => regler(m, v)} />
      {:else if m.type === 'heure'}
        <input class="texte mono" type="time" value={nums[m.cle] != null ? formatHeure(nums[m.cle]!) : ''} aria-label={m.nom} onchange={(e) => regler(m, parseHeure(e.currentTarget.value))} />
      {:else}
        <div class="pas">
          <button type="button" aria-label="Moins" onclick={() => pas(m, -1)}>−</button>
          <input class="mono" bind:value={champs[m.cle]} onchange={() => lire(m)} inputmode="decimal" placeholder="0" aria-label={m.nom} />
          <span class="muted unite">{m.type === 'temps' ? 'min' : m.type === 'montant' ? '$' : m.type === 'distance' ? 'km' : m.type === 'poids' ? 'kg' : m.type === 'nombre' ? m.unite : ''}</span>
          <button type="button" aria-label="Plus" onclick={() => pas(m, 1)}>+</button>
        </div>
      {/if}
    </div>
  {/each}

  <label class="champ">Note
    <textarea bind:value={note} rows="2" placeholder="Ce que je retiens de ce jour"></textarea>
  </label>
  <Bouton grand plein onclick={enregistrer}>Enregistrer</Bouton>
</Volet>

<style>
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  h2 { font-size: 22px; }
  .date { height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 10px; font-size: 15px; }
  .petit { font-size: 12px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
  .libelle { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .ligne { display: flex; justify-content: space-between; align-items: center; min-height: 44px; }
  .texte, textarea { min-height: 46px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 12px; font-size: 15px; font-weight: 500; }
  textarea { padding: 10px 12px; resize: none; }
  .pas { display: flex; align-items: center; height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); }
  .pas button { flex: none; width: 48px; height: 48px; border: 0; background: transparent; font-size: 22px; }
  .pas input { flex: 1; min-width: 0; height: 46px; border: 0; background: transparent; text-align: right; font-size: 17px; padding: 0 6px; }
  .unite { flex: 1; font-size: 13px; font-weight: 500; }
</style>
