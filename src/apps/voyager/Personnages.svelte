<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { connecter, personneCourante } from '../../domain/actions.ts';
  import { ACCUEIL, NOM_ROLE, TOUS_ROLES } from '../../domain/acces.ts';

  /** Carrousel de tous les personnages du monde simulé (voyageur, conducteur, agent de gare, chauffeur, patron, point relais…) : un geste pour changer de rôle.
   *  Visible seulement dans l'édition « agence » (voir `core/edition.ts`). `apres` : appelé avant la navigation (ferme la fenêtre de l'orbe). */
  let { apres }: { apres?: () => void } = $props();
  const moi = $derived(personneCourante());
  /** Une personne représentative par rôle : la voyageuse de démonstration pour « voyageur », sinon la première personne active qui a un code PIN. */
  const cartes = $derived(TOUS_ROLES.map((role) => {
    const gens = app.monde.personnes.filter((p) => p.role === role && p.actif && (role === 'voyageur' ? p.id === 'p-aicha' : p.pin));
    return gens[0] ? { role, p: gens[0] } : null;
  }).filter((c): c is NonNullable<typeof c> => !!c));
  function aller_(id: string, role: keyof typeof ACCUEIL) { apres?.(); connecter(id); aller(ACCUEIL[role]); }
</script>

<div class="car" role="list" aria-label="Changer de personnage">
  {#each cartes as c (c.role)}
    <button type="button" class="pers" class:moi={moi?.role === c.role} role="listitem" aria-current={moi?.role === c.role ? 'true' : undefined} onclick={() => aller_(c.p.id, c.role)}>
      <span class="av">{c.p.prenom[0]}{c.p.nom[0]}</span>
      <span class="r">{NOM_ROLE[c.role]}</span>
      <span class="n">{c.p.prenom}</span>
    </button>
  {/each}
  <a class="pers parc" href="/parcours" role="listitem" onclick={(e) => { e.preventDefault(); apres?.(); aller('/parcours'); }}>
    <span class="av">▶</span><span class="r">Tous les parcours</span><span class="n">démo guidée</span>
  </a>
</div>

<style>
  .car { display: flex; width: 100%; min-width: 0; max-width: 100%; contain: inline-size; gap: 10px; overflow-x: auto; scroll-snap-type: x mandatory; padding: 4px 2px 10px; margin: 0 -2px; scrollbar-width: none; }
  .car::-webkit-scrollbar { display: none; }
  .pers { flex: none; scroll-snap-align: start; width: 116px; min-height: 132px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 10px 8px; border-radius: 20px; border: 1px solid rgba(255, 91, 222, 0.3); background: linear-gradient(160deg, rgba(255, 91, 222, 0.14), rgba(139, 124, 255, 0.1)); color: #f2f4ff; text-decoration: none; text-align: center; cursor: pointer; font: inherit; }
  .pers.moi { border-color: #3de0ff; box-shadow: 0 0 0 2px rgba(61, 224, 255, 0.35), 0 12px 24px -12px rgba(61, 224, 255, 0.6); background: linear-gradient(160deg, rgba(61, 224, 255, 0.2), rgba(139, 124, 255, 0.14)); }
  .pers:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
  .av { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; background: conic-gradient(from 200deg, #8b7cff, #3de0ff, #ff5bde, #8b7cff); color: #06080f; font: 700 16px 'Sora Variable', 'Sora', sans-serif; }
  .r { font: 700 12.5px/1.2 'Sora Variable', 'Sora', sans-serif; }
  .n { font-size: 12px; color: #b7c0db; }
</style>
