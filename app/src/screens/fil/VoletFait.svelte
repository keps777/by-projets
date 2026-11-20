<script lang="ts">
  import { magasin } from '../../data/magasin.svelte.ts';
  import { projetsDe, rubriques, sousProjetsDe } from '../../data/requetes.ts';
  import { ajouterFait } from '../../data/actions/fait.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import Volet from '../../ui/Volet.svelte';
  import { cap, dateLongue, dureeMin, hm } from './format.ts';
  import { optionsDuree, projetEnCours } from './tache.ts';

  /** « Ce que j'ai fait » : note après coup une activité déjà faite. Elle se pose dans la colonne « Fait » du jour (spec §7, nov. 2026). */
  let { ouvert, jour, debutMin, onfermer }: { ouvert: boolean; jour: string; debutMin: number; onfermer: () => void } = $props();

  const HEURES = Array.from({ length: 24 }, (_, i) => i);
  const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5);
  let titre = $state('');
  let projetId = $state('');
  let debut = $state(0);
  let duree = $state(45);

  // Chaque ouverture repart de l'heure touchée.
  let precedent = false;
  $effect(() => {
    if (ouvert && !precedent) { titre = ''; projetId = ''; debut = Math.min(debutMin, 1440 - duree); }
    precedent = ouvert;
  });

  /** Projets en cours, rangés par rubrique. */
  const groupes = $derived(rubriques()
    .map((r) => ({ rubrique: r.nom, projets: projetsDe(r.id).filter((p) => projetEnCours(p.statut, sousProjetsDe(p.id).map((s) => s.statut))) }))
    .filter((g) => g.projets.length));
  const durees = $derived(optionsDuree(duree));
  const minutes = $derived(debut % 5 ? [...MINUTES, debut % 60].sort((a, b) => a - b) : MINUTES);
  const borner = (m: number) => Math.max(0, Math.min(1440 - duree, m));
  const lire = (e: Event) => (e.currentTarget as HTMLSelectElement).value;

  function ajouter() {
    if (!titre.trim()) { dire('Dis ce que tu as fait'); return; }
    const projet = projetId ? magasin.trouver('projets', projetId) : undefined;
    if (!ajouterFait({ titre, projetId: projet?.id ?? null, jour, debutMin: debut, dureeMin: duree })) { dire('Impossible d’ajouter ce bloc'); return; }
    dire(`Ajouté à Fait · ${hm(debut)}–${hm(debut + duree)}`);
    onfermer();
  }
</script>

<Volet {ouvert} {onfermer} label="Ce que j’ai fait">
  <form class="fait" onsubmit={(e) => { e.preventDefault(); ajouter(); }}>
    <h2 class="titre">Ce que j’ai fait</h2>
    <p class="muted petit">{cap(dateLongue(jour))} · se pose dans la colonne Fait.</p>
    <label class="champ">Quoi ?
      <!-- svelte-ignore a11y_autofocus -->
      <input type="text" bind:value={titre} placeholder="Ex. Prière du matin" aria-label="Ce que j’ai fait" autocomplete="off" enterkeyhint="done" autofocus />
    </label>
    <label class="rang">Projet
      <select aria-label="Projet" bind:value={projetId}>
        <option value="">Sans projet</option>
        {#each groupes as g (g.rubrique)}
          <optgroup label={g.rubrique}>{#each g.projets as p (p.id)}<option value={p.id}>{p.nom}</option>{/each}</optgroup>
        {/each}
      </select>
    </label>
    <div class="rang">Début
      <span class="paire">
        <select aria-label="Heure de début du fait" value={Math.floor(debut / 60)} onchange={(e) => (debut = borner(+lire(e) * 60 + (debut % 60)))}>
          {#each HEURES as h (h)}<option value={h}>{String(h).padStart(2, '0')} h</option>{/each}
        </select>
        <select aria-label="Minutes de début du fait" value={debut % 60} onchange={(e) => (debut = borner(Math.floor(debut / 60) * 60 + +lire(e)))}>
          {#each minutes as n (n)}<option value={n}>{String(n).padStart(2, '0')}</option>{/each}
        </select>
      </span>
    </div>
    <label class="rang">Durée
      <select aria-label="Durée du fait" value={duree} onchange={(e) => { duree = +lire(e); debut = Math.min(debut, 1440 - duree); }}>
        {#each durees as d (d)}<option value={d}>{dureeMin(d)}</option>{/each}
      </select>
    </label>
    <p class="muted petit fin-heure">{hm(debut)} – {hm(debut + duree)}</p>
    <button type="submit" class="valider">Ajouter à Fait</button>
  </form>
</Volet>

<style>
  .fait { display: flex; flex-direction: column; gap: 10px; }
  .titre { font-size: 22px; }
  .petit { font-size: 12px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; font-weight: 600; color: var(--muted); }
  .champ input { height: 52px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); font-size: 18px; padding: 0 14px; }
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 48px; font-size: 14px; font-weight: 600; }
  .paire { display: flex; gap: 6px; }
  select { height: 44px; min-width: 0; max-width: 100%; border-radius: 12px; border: 1px solid var(--ligne); background: var(--surface-2); color: var(--texte); font-size: 16px; font-weight: 600; padding: 0 10px; }
  .rang > select { flex: 1; max-width: 230px; }
  .fin-heure { text-align: right; margin-top: -8px; }
  .valider { height: 54px; border-radius: 18px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 16px; font-weight: 600; margin-top: 4px; }
</style>
