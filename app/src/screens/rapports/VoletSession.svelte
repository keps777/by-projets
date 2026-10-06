<script lang="ts">
  // Fin d'une session chronométrée : le temps est déjà noté ; on peut remplir les autres mesures du point, ou valider tel quel.
  import { compterChapitres, formaterPassages, type Passage } from '@core/bible.ts';
  import type { Metrique } from '@core/types.ts';
  import Volet from '../../ui/Volet.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import Puces from '../../ui/Puces.svelte';
  import PassagesLus from '../../ui/PassagesLus.svelte';
  import { champTexte, lireChamp, pasDe } from '../projets/vues.ts';
  import { chrono } from '../fil/format.ts';
  import type { ValeurSession } from './session.ts';

  let { ouvert, titre, secondes, metriques, onvalider, onannuler, onfermer }: {
    ouvert: boolean; titre: string; secondes: number; metriques: Metrique[];
    onvalider: (autres: ValeurSession[], secondes: number) => void; onannuler: () => void; onfermer: () => void;
  } = $props();

  // Le temps est celui du chrono : il n'est pas redemandé.
  const autres = $derived(metriques.filter((m) => m.type !== 'temps'));

  let nums = $state<Record<string, number | null>>({});
  let champs = $state<Record<string, string>>({});
  let textes = $state<Record<string, string>>({});
  let passages = $state<Passage[]>([]);

  // Temps enregistré : celui du chrono au départ, modifiable à la main (heures, minutes, secondes) si le chrono est resté lancé trop longtemps ou arrêté trop tôt.
  let h = $state('0'), m = $state('0'), sec = $state('0');
  const MAX_S = 99 * 3600 + 59 * 60 + 59;
  const lireNb = (t: string) => { const n = parseInt(t.replace(/\D/g, ''), 10); return Number.isFinite(n) ? n : 0; };
  const total = $derived(Math.min(MAX_S, lireNb(h) * 3600 + lireNb(m) * 60 + lireNb(sec)));
  const modifie = $derived(total !== secondes);
  function poser(t: number) {
    const v = Math.max(0, Math.min(MAX_S, Math.round(t)));
    h = String(Math.floor(v / 3600)); m = String(Math.floor((v % 3600) / 60)); sec = String(v % 60);
  }
  /** Normalise à la sortie d'un champ : 90 minutes deviennent 1 h 30. */
  const normaliser = () => poser(total);
  const ajuster = (delta: number) => poser(total + delta);

  // Chaque ouverture repart de zéro ; une séance compte pour une fois (la plus fréquente des réponses attendues).
  $effect(() => {
    if (!ouvert) return;
    const n: Record<string, number | null> = {}, c: Record<string, string> = {};
    for (const m of autres) {
      if (m.type === 'reference') continue;
      n[m.cle] = m.type === 'fois' ? 1 : null;
      c[m.cle] = m.type === 'fois' ? '1' : '';
    }
    nums = n; champs = c; textes = {}; passages = [];
    poser(secondes);
  });

  function regler(m: Metrique, v: number | null) { nums[m.cle] = v; champs[m.cle] = champTexte(m.type, v); }
  function pas(m: Metrique, signe: 1 | -1) {
    let v = Math.max(0, (nums[m.cle] ?? 0) + signe * (pasDe(m.type, nums[m.cle] ?? 0) || 1));
    if (m.type === 'note') v = Math.min(10, v);
    if (m.type === 'pourcentage') v = Math.min(100, v);
    regler(m, v);
  }
  function lire(m: Metrique) { const v = lireChamp(m.type, champs[m.cle] ?? ''); regler(m, v ?? (champs[m.cle]?.trim() ? nums[m.cle] : null)); }

  /** Les passages choisis donnent le nombre de chapitres lus. */
  function changerPassages(ps: Passage[]) {
    passages = ps;
    const chap = autres.find((m) => m.cle === 'nombre:chapitres');
    if (chap) regler(chap, ps.length ? compterChapitres(ps) : null);
  }

  function valider() {
    onvalider(autres.map((m): ValeurSession => m.cle === 'reference:passages'
      ? { cle: m.cle, type: m.type, txt: passages.length ? formaterPassages(passages) : '', detail: passages }
      : { cle: m.cle, type: m.type, num: nums[m.cle], txt: textes[m.cle] }), total);
  }
  const unite = (m: Metrique) => (m.type === 'montant' ? '$' : m.type === 'distance' ? 'km' : m.type === 'poids' ? 'kg' : m.type === 'nombre' ? m.unite : '');
</script>

<Volet {ouvert} {onfermer} label="Fin de la session">
  <div class="tete">
    <span class="etiquette">Session terminée</span>
    <h2 class="titre">{titre}</h2>
    <div class="temps-edit" role="group" aria-label="Temps enregistré">
      <label><input class="mono" inputmode="numeric" bind:value={h} onfocus={(e) => e.currentTarget.select()} onblur={normaliser} aria-label="Heures" /><span>h</span></label>
      <span class="deux-points" aria-hidden="true">:</span>
      <label><input class="mono" inputmode="numeric" bind:value={m} onfocus={(e) => e.currentTarget.select()} onblur={normaliser} aria-label="Minutes" /><span>min</span></label>
      <span class="deux-points" aria-hidden="true">:</span>
      <label><input class="mono" inputmode="numeric" bind:value={sec} onfocus={(e) => e.currentTarget.select()} onblur={normaliser} aria-label="Secondes" /><span>s</span></label>
    </div>
    <div class="ajustements">
      <button type="button" onclick={() => ajuster(-300)} disabled={total < 300}>−5 min</button>
      <button type="button" onclick={() => ajuster(-60)} disabled={total < 60}>−1 min</button>
      <button type="button" onclick={() => ajuster(60)}>+1 min</button>
      <button type="button" onclick={() => ajuster(300)}>+5 min</button>
    </div>
    <span class="muted petit">
      {#if modifie}Chrono : {chrono(secondes)} · <button type="button" class="lien-petit" onclick={() => poser(secondes)}>Remettre le temps du chrono</button>
      {:else}Touche un chiffre pour corriger le temps. Il s’ajoute au total du jour ; tu peux remplir le reste, ou valider tel quel.{/if}
    </span>
  </div>

  {#each autres as m (m.id)}
    <div class="champ">
      {#if m.type === 'reference' && m.cle === 'reference:passages'}
        <PassagesLus {passages} onchange={changerPassages} />
      {:else if m.type === 'reference'}
        <label class="libelle">{m.nom}
          <input class="texte" bind:value={textes[m.cle]} placeholder="Ce que j’ai lu, vu, retenu…" aria-label={m.nom} />
        </label>
      {:else if m.type === 'oui_non'}
        <span class="ligne"><span class="libelle">{m.nom}</span><Interrupteur actif={!!nums[m.cle]} label={m.nom} couleur="var(--c)" onchange={(v) => regler(m, v ? 1 : 0)} /></span>
      {:else if m.type === 'choix'}
        <span class="libelle">{m.nom}</span>
        <Puces options={(m.options ?? []).map((o) => ({ valeur: o.valeur, label: o.label }))} valeur={nums[m.cle] ?? null} couleur="var(--c)" texte="var(--c-sur)" onchoisir={(v) => regler(m, v)} />
      {:else if m.type === 'heure'}
        <!-- L'heure n'a pas de sens pour une session : ignorée. -->
      {:else}
        <span class="libelle">{m.nom}</span>
        <div class="pas">
          <button type="button" aria-label="Moins {m.nom}" onclick={() => pas(m, -1)}>−</button>
          <input class="mono" bind:value={champs[m.cle]} onchange={() => lire(m)} inputmode="decimal" placeholder="0" aria-label={m.nom} />
          <span class="muted unite">{unite(m)}</span>
          <button type="button" aria-label="Plus {m.nom}" onclick={() => pas(m, 1)}>+</button>
        </div>
      {/if}
    </div>
  {/each}

  <Bouton grand plein onclick={valider}>Valider la session</Bouton>
  <div class="bas">
    <button type="button" class="lien" onclick={onfermer}>Plus tard</button>
    <button type="button" class="lien danger" onclick={onannuler}>Annuler la session</button>
  </div>
</Volet>

<style>
  .tete { display: flex; flex-direction: column; gap: 4px; }
  h2 { font-size: 22px; }
  .temps-edit { display: flex; align-items: flex-end; gap: 6px; margin: 4px 0 2px; }
  .temps-edit label { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; min-width: 0; }
  .temps-edit input { width: 100%; height: 64px; text-align: center; font-size: 34px; letter-spacing: -0.02em; color: var(--c, var(--accent)); background: var(--champ); border: 1px solid var(--ligne); border-radius: 16px; padding: 0; }
  .temps-edit input:focus { outline: none; border-color: var(--c, var(--accent)); }
  .temps-edit label span { font-size: 12px; color: var(--muted); font-weight: 600; }
  .deux-points { font-size: 30px; color: var(--faint); padding-bottom: 28px; }
  .ajustements { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .ajustements button { min-height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 13px; font-weight: 600; }
  .ajustements button:disabled { opacity: 0.35; }
  .lien-petit { border: 0; background: none; padding: 0; min-height: 32px; color: var(--c-encre, var(--accent-encre)); font-size: 13px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; }
  .petit { font-size: 13px; }
  .champ { display: flex; flex-direction: column; gap: 6px; }
  .libelle { font-size: 13px; font-weight: 600; display: flex; flex-direction: column; gap: 6px; }
  .ligne { display: flex; justify-content: space-between; align-items: center; min-height: 44px; }
  .texte { min-height: 46px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 12px; font-size: 16px; font-weight: 500; }
  .pas { display: flex; align-items: center; height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); }
  .pas button { flex: none; width: 48px; height: 48px; border: 0; background: transparent; font-size: 22px; }
  .pas input { flex: 1; min-width: 0; height: 46px; border: 0; background: transparent; text-align: right; font-size: 17px; padding: 0 6px; }
  .unite { flex: 1; font-size: 13px; font-weight: 500; }
  .bas { display: flex; justify-content: space-between; }
  .lien { min-height: 44px; border: 0; background: none; color: var(--muted); font-size: 14px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; padding: 0 4px; }
  .lien.danger { color: var(--mauvais); }
</style>
