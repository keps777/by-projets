<script lang="ts">
  import { aujourdhui as jourCourant } from '../../data/temps.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { construireIndex } from './index-recherche.ts';
  import { FILTRES, filtrer, grouper, jetons, lireRecents, memoriserRecent, type Filtre } from './recherche.ts';

  /** Recherche : projets, sous-projets, tâches, saisies et notes, rapports ; filtres ; récentes ; insensible aux accents. */
  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const aujourdhui = $derived(jourCourant());
  const mode = $derived(theme.mode);
  let q = $state(routeur.params.get('q') ?? '');
  const filtre = $derived((FILTRES.find((f) => f.valeur === routeur.params.get('f'))?.valeur ?? 'tout') as Filtre);
  let recents = $state(lireRecents());

  const index = $derived(construireIndex(aujourdhui, (c) => couleurRubrique(c, mode)));
  const resultats = $derived(filtrer(index, q, filtre));
  const groupes = $derived(grouper(resultats));
  const vide = $derived(jetons(q).length === 0);

  function saisir(v: string) { q = v; routeur.definir('q', v.trim() ? v : null); }
  function retenir() { if (!vide) recents = memoriserRecent(q); }
</script>

<div class="ecran-recherche">
  <div class="haut">
    <div class="barre">
      <button type="button" class="rond" aria-label="Retour au Fil" onclick={() => routeur.retour('/')}><Icone nom="retour" taille={18} trait={2.2} /></button>
      <label class="champ">
        <Icone nom="recherche" taille={16} trait={2.2} />
        <!-- svelte-ignore a11y_autofocus -->
        <input type="search" value={q} oninput={(e) => saisir(e.currentTarget.value)} onkeydown={(e) => e.key === 'Enter' && retenir()}
          aria-label="Rechercher" placeholder="Projet, tâche, note, rapport…" autocomplete="off" autofocus={!q} />
        {#if q}<button type="button" class="effacer" aria-label="Effacer" onclick={() => saisir('')}><Icone nom="fermer" taille={14} trait={2.4} /></button>{/if}
      </label>
    </div>
    <div class="filtres">
      {#each FILTRES as f (f.valeur)}
        <button type="button" class:actif={f.valeur === filtre} aria-pressed={f.valeur === filtre} onclick={() => routeur.definir('f', f.valeur === 'tout' ? null : f.valeur)}>{f.label}</button>
      {/each}
    </div>
  </div>

  <div class="resultats">
    {#if vide}
      {#if recents.length}
        <div class="bloc-recents">
          <span class="etiquette">Recherches récentes</span>
          <div class="recents">
            {#each recents as r (r)}<button type="button" onclick={() => saisir(r)}>{r}</button>{/each}
          </div>
        </div>
      {:else}
        <p class="muted aide">Cherche un projet, un sous-projet, une tâche, une note ou un rapport. Les accents ne comptent pas : « priere » trouve « Prière ».</p>
      {/if}
    {:else if !resultats.length}
      <p class="muted aide">Aucun résultat pour « {q} ».</p>
    {/if}

    {#each groupes as g (g.type)}
      <section>
        <span class="etiquette">{g.titre} · {g.total}</span>
        <div class="liste">
          {#each g.items as it, i (i)}
            <a href={it.href} onclick={retenir}>
              <span class="pastille" style:background={it.couleur}></span>
              <span class="textes"><span class="t">{it.titre}</span><span class="s">{it.sous}</span></span>
              <Icone nom="suivant" taille={14} trait={2.2} />
            </a>
          {/each}
        </div>
      </section>
    {/each}
  </div>
</div>

<style>
  .ecran-recherche { height: 100dvh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; background: var(--fond); }
  .haut { padding: calc(16px + var(--haut-sûr)) 16px 8px; display: flex; flex-direction: column; gap: 12px; flex: none; }
  .barre { display: flex; align-items: center; gap: 10px; }
  .champ { flex: 1; display: flex; align-items: center; gap: 8px; height: 48px; border-radius: 16px; background: var(--surface); border: 1px solid var(--ligne); padding: 0 6px 0 12px; color: var(--muted); }
  .champ input { flex: 1; min-width: 0; border: 0; background: transparent; font-size: 16px; outline: none; appearance: none; }
  .champ input::-webkit-search-cancel-button { display: none; }
  .effacer { width: 36px; height: 36px; border-radius: 18px; border: 0; background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; }
  .filtres { display: flex; gap: 6px; overflow-x: auto; margin: 0 -16px; padding: 0 16px; }
  .filtres button { flex: none; height: 40px; padding: 0 14px; border-radius: 20px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .filtres button.actif { background: var(--inverse); border-color: var(--inverse); color: var(--inverse-texte); }
  .resultats { flex: 1; min-height: 0; overflow-y: auto; padding: 4px 16px calc(24px + var(--bas-sûr)); display: flex; flex-direction: column; gap: 14px; }
  .bloc-recents, section { display: flex; flex-direction: column; gap: 10px; }
  section { gap: 6px; }
  .recents { display: flex; flex-wrap: wrap; gap: 6px; }
  .recents button { height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--ligne); background: var(--surface); font-size: 14px; }
  .aide { font-size: 14px; line-height: 1.45; }
  .liste { background: var(--surface); border: 1px solid var(--ligne); border-radius: 20px; overflow: hidden; }
  .liste a { display: flex; align-items: center; gap: 10px; padding: 10px 14px; min-height: 56px; color: var(--muted); }
  .liste a + a { border-top: 1px solid var(--ligne); }
  .pastille { flex: none; width: 8px; height: 32px; border-radius: 4px; }
  .textes { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .t { font-size: 14px; font-weight: 600; color: var(--texte); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .s { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
