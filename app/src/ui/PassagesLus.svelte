<script lang="ts">
  // Passages de la Bible lus, choisis dans des menus déroulants : livre, du chapitre, au chapitre (spec §8).
  import { LIVRES, NB_LIVRES_AT, compterChapitres, formaterPassage, type Passage } from '@core/bible.ts';
  import Icone from './Icone.svelte';

  let { passages, onchange, objectif = null, couleur = 'var(--c, var(--accent))' }: {
    passages: Passage[]; onchange: (p: Passage[]) => void;
    /** Chapitres visés (affiche « 3 / 7 ch. ») ; null = pas d'objectif. */
    objectif?: number | null; couleur?: string;
  } = $props();

  const CLE = 'luther-life:dernier-livre';
  const dernier = () => { try { return localStorage.getItem(CLE); } catch { return null; } };
  const livreInitial = LIVRES.find((l) => l.nom === dernier())?.nom ?? 'Matthieu';

  let livre = $state(livreInitial);
  let de = $state(1);
  let a = $state(1);
  const info = $derived(LIVRES.find((l) => l.nom === livre) ?? LIVRES[0]);
  const chapitres = $derived(Array.from({ length: info.chapitres }, (_, i) => i + 1));
  const chapitresFin = $derived(chapitres.filter((c) => c >= de));
  const compte = $derived(compterChapitres(passages));

  function changerLivre(nom: string) { livre = nom; de = 1; a = 1; }
  function changerDe(n: number) { de = n; if (a < n) a = n; }

  function ajouter() {
    const p: Passage = { livre: info.nom, de, a: Math.max(de, a) };
    onchange([...passages, p]);
    try { localStorage.setItem(CLE, info.nom); } catch { /* stockage indisponible */ }
    // Le suivant est déjà prêt : le chapitre qui vient après celui qu'on vient d'ajouter.
    const prochain = Math.min(info.chapitres, p.a + 1);
    de = prochain; a = prochain;
  }
  const retirer = (i: number) => onchange(passages.filter((_, j) => j !== i));
</script>

<div class="passages" style:--couleur={couleur}>
  <div class="rang tete">
    <span class="fort">Passages lus</span>
    <span class="mono compte" class:bon={objectif != null && compte >= objectif}>{compte}{objectif != null ? ` / ${objectif}` : ''} ch.</span>
  </div>

  {#if passages.length}
    <div class="puces">
      {#each passages as p, i (i + formaterPassage(p))}
        <span class="puce">{formaterPassage(p)} <span class="leger">· {p.a - p.de + 1} ch.</span>
          <button type="button" aria-label="Retirer {formaterPassage(p)}" onclick={() => retirer(i)}><Icone nom="fermer" taille={12} trait={2.6} /></button>
        </span>
      {/each}
    </div>
  {/if}

  <div class="choix">
    <label class="champ livre">Livre
      <select aria-label="Livre de la Bible" value={livre} onchange={(e) => changerLivre(e.currentTarget.value)}>
        <optgroup label="Ancien Testament">
          {#each LIVRES.slice(0, NB_LIVRES_AT) as l (l.nom)}<option value={l.nom}>{l.nom}</option>{/each}
        </optgroup>
        <optgroup label="Nouveau Testament">
          {#each LIVRES.slice(NB_LIVRES_AT) as l (l.nom)}<option value={l.nom}>{l.nom}</option>{/each}
        </optgroup>
      </select>
    </label>
    <div class="ligne">
      <label class="champ">Du chapitre
        <select aria-label="Du chapitre" value={de} onchange={(e) => changerDe(+e.currentTarget.value)}>
          {#each chapitres as c (c)}<option value={c}>{c}</option>{/each}
        </select>
      </label>
      <label class="champ">Au chapitre
        <select aria-label="Au chapitre" value={a} onchange={(e) => (a = +e.currentTarget.value)}>
          {#each chapitresFin as c (c)}<option value={c}>{c}</option>{/each}
        </select>
      </label>
      <button type="button" class="ajouter" aria-label="Ajouter le passage {info.nom} {de === a ? de : `${de}–${a}`}" onclick={ajouter}><Icone nom="plus" taille={18} trait={2.4} />Ajouter</button>
    </div>
    <button type="button" class="entier" onclick={() => { de = 1; a = info.chapitres; }}>Livre entier ({info.chapitres} ch.)</button>
  </div>
</div>

<style>
  .passages { display: flex; flex-direction: column; gap: 10px; }
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 10px; }
  .fort { font-size: 14px; font-weight: 600; }
  .compte { font-size: 13px; color: var(--muted); }
  .compte.bon { color: var(--bon); }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; }
  .puce { display: inline-flex; align-items: center; gap: 4px; min-height: 34px; padding: 0 4px 0 12px; border-radius: 17px; background: var(--c-fond, var(--accent-fond)); color: var(--c-encre, var(--accent-encre)); font-size: 13px; font-weight: 600; }
  .puce .leger { font-weight: 500; opacity: 0.8; }
  .puce button { position: relative; width: 28px; height: 28px; border: 0; border-radius: 14px; background: transparent; color: inherit; display: inline-flex; align-items: center; justify-content: center; }
  .puce button::after { content: ''; position: absolute; inset: -8px; }
  .choix { display: flex; flex-direction: column; gap: 8px; }
  .champ { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: var(--muted); min-width: 0; flex: 1; }
  .ligne { display: flex; gap: 8px; align-items: flex-end; }
  select { width: 100%; height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); color: var(--texte); font-size: 16px; font-weight: 500; padding: 0 12px; min-width: 0; }
  select:focus { outline: none; border-color: var(--couleur); }
  .ajouter { flex: none; height: 48px; padding: 0 14px; border-radius: 14px; border: 0; background: var(--couleur); color: var(--c-sur, var(--accent-texte)); font-size: 14px; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; }
  .entier { align-self: flex-start; min-height: 44px; border: 0; background: none; color: var(--c-encre, var(--accent-encre)); font-size: 13px; font-weight: 600; text-decoration: underline; text-underline-offset: 3px; padding: 0; }
</style>
