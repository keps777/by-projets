<script lang="ts">
  import { tick } from 'svelte';
  import { deplacer } from '../../core/selectionBillet.ts';
  import { lieuLibre, lieuxFrequents, suggerer, surligner, type Lieu } from '../../core/lieux.ts';

  /** Champ « Je pars de » avec autocomplétion : dès les premières lettres, des lieux de la ville (quartiers, gares, marchés, hôpitaux…) classés par préfixe puis par sous-chaîne.
   *  On choisit une proposition (toucher, flèches + Entrée) ou on valide sa saisie avec Entrée. Sans saisie, quelques quartiers connus en un geste. */
  let { ville, lieu = $bindable(null), valeur = $bindable(''), onchoisir, id = 'lieu' }: { ville: string; lieu?: Lieu | null; valeur?: string; onchoisir?: (l: Lieu) => void; id?: string } = $props();
  let ouvert = $state(false), actif = $state(-1), champ = $state<HTMLInputElement | undefined>();
  const propositions = $derived(valeur.trim() && !lieu ? suggerer(valeur, { ville, limite: 6 }) : []);
  /** Dernière ligne : valider la saisie telle quelle quand il y a peu ou pas de propositions (lieu saisi à la main). */
  const libre = $derived(valeur.trim().length >= 2 && !lieu && propositions.length <= 2 && !propositions.some((p) => p.nom.toLowerCase() === valeur.trim().toLowerCase()));
  const nbLignes = $derived(propositions.length + (libre ? 1 : 0));
  const frequents = $derived(lieuxFrequents(ville, 6));
  const TYPE: Record<Lieu['type'], string> = { quartier: 'Quartier', gare: 'Gare', marché: 'Marché', hôpital: 'Hôpital', repère: 'Repère' };

  function choisir(l: Lieu) { lieu = l; valeur = l.nom; ouvert = false; actif = -1; onchoisir?.(l); }
  const choisirLigne = (i: number) => { if (i >= 0 && i < propositions.length) choisir(propositions[i]); else if (libre && i === propositions.length) choisir(lieuLibre(valeur, ville)); };
  function saisie() { lieu = null; ouvert = true; actif = -1; }
  async function touche(e: KeyboardEvent) {
    if (e.key === 'Escape') { if (ouvert) { e.stopPropagation(); ouvert = false; actif = -1; } return; }
    if (e.key === 'Enter') { e.preventDefault(); if (lieu) return; if (actif >= 0) choisirLigne(actif); else if (propositions.length) choisir(propositions[0]); else if (libre) choisir(lieuLibre(valeur, ville)); return; }
    const n = deplacer(actif, e.key, nbLignes); if (n === null || e.key === 'Home' || e.key === 'End') return;
    e.preventDefault(); ouvert = true; actif = n; await tick(); document.getElementById(`${id}-o${n}`)?.scrollIntoView({ block: 'nearest' });
  }
  function effacer() { lieu = null; valeur = ''; ouvert = false; actif = -1; champ?.focus(); }
</script>

<div class="champ">
  <label class="lab" for="{id}-in">Je pars de</label>
  <div class="in">
    <input bind:this={champ} id="{id}-in" class="inp" type="text" role="combobox" autocomplete="off" autocapitalize="words" spellcheck="false" placeholder="Quartier, marché, hôpital…" aria-autocomplete="list" aria-expanded={ouvert && nbLignes > 0}
      aria-controls="{id}-liste" aria-activedescendant={ouvert && actif >= 0 ? `${id}-o${actif}` : undefined} bind:value={valeur} oninput={saisie} onfocus={() => { if (!lieu && valeur.trim()) ouvert = true; }} onkeydown={touche} onblur={() => setTimeout(() => (ouvert = false), 120)} />
    {#if valeur}<button type="button" class="x" aria-label="Effacer le lieu" onclick={effacer}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>{/if}
  </div>
  {#if ouvert && nbLignes > 0}
    <ul id="{id}-liste" class="liste" role="listbox" aria-label="Lieux proposés" data-testid="propositions-lieu">
      {#each propositions as p, i (p.nom)}
        {@const [av, mi, ap] = surligner(p.nom, valeur)}
        <li role="presentation"><button type="button" id="{id}-o{i}" role="option" tabindex="-1" aria-selected={i === actif} class:act={i === actif} onmousedown={(e) => e.preventDefault()} onclick={() => choisir(p)} onpointermove={() => (actif = i)}>
          <span class="col grow" style="min-width: 0"><span class="t14 ell">{av}<b>{mi}</b>{ap}</span><span class="t12 mut">{TYPE[p.type]} · {p.ville}</span></span></button></li>
      {/each}
      {#if libre}
        <li role="presentation"><button type="button" id="{id}-o{propositions.length}" role="option" tabindex="-1" aria-selected={actif === propositions.length} class:act={actif === propositions.length} onmousedown={(e) => e.preventDefault()} onclick={() => choisirLigne(propositions.length)} onpointermove={() => (actif = propositions.length)}>
          <span class="col grow"><span class="t14">Utiliser « {valeur.trim()} »</span><span class="t12 mut">Lieu saisi à la main · position approximative</span></span></button></li>
      {/if}
    </ul>
  {:else if !valeur.trim()}
    <div class="chips" role="group" aria-label="Lieux fréquents">{#each frequents as f (f.nom)}<button type="button" class="ch" onclick={() => choisir(f)}>{f.nom}</button>{/each}</div>
  {:else if ouvert && !lieu}
    <span class="t12 mut" role="status">Aucun lieu trouvé : continue à taper.</span>
  {/if}
</div>

<style>
  .champ { flex: none; display: flex; flex-direction: column; gap: 6px; }
  .in { position: relative; } .in .inp { padding-right: 46px; }
  .x { position: absolute; right: 4px; top: 50%; margin-top: -22px; width: 44px; height: 44px; display: grid; place-items: center; border: 0; background: transparent; color: #a1accb; cursor: pointer; }
  .liste { list-style: none; margin: 0; padding: 4px; display: flex; flex-direction: column; gap: 2px; border-radius: 18px; background: rgba(12, 16, 34, 0.96); border: 1px solid rgba(255, 255, 255, 0.18); animation: entre 0.2s ease; }
  .liste button { display: flex; align-items: center; gap: 10px; width: 100%; min-height: 52px; padding: 6px 12px; border-radius: 14px; border: 0; background: transparent; color: inherit; font: inherit; text-align: left; cursor: pointer; }
  .liste button.act { background: rgba(139, 124, 255, 0.22); }
  .liste b { color: #7febff; font-weight: 700; }
  .chips { flex-wrap: wrap; overflow: visible; }
  @keyframes entre { from { opacity: 0; transform: translateY(-4px); } }
  @media (prefers-reduced-motion: reduce) { .liste { animation: none; } }
</style>
