<script lang="ts">
  import { ecole, type Ecole } from '../../screens/ecole/etat.ts';
  import { app } from '../../data/store.svelte.ts';
  import { famillesAvecPlan } from './actions.ts';
  import Modale from './Modale.svelte';
  import type { VaVers } from './types.ts';

  let { ec, va }: { ec: Ecole; va: VaVers } = $props();
  const e = $derived(ecole());
  const classes = $derived(Object.keys(e.classes[ec.id] ?? {}));
  let q = $state(''); let filtre = $state('Toutes'); let fiche = $state<{ nom: string; classe: string } | null>(null);
  const avecPlan = $derived(new Set(famillesAvecPlan(ec.id).map((f) => f.eleve)));
  const liste = $derived(classes.filter((c) => filtre === 'Toutes' || filtre === c).flatMap((c) => e.classes[ec.id][c].map((nom) => ({ nom, classe: c }))).filter((x) => !q.trim() || x.nom.toLowerCase().includes(q.trim().toLowerCase())));
  const ini = (nom: string) => nom.split(' ').map((p) => p[0]).join('').slice(0, 2);
  const enfant = $derived(fiche ? e.enfants.find((x) => x.ecoleId === ec.id && x.eleve === fiche!.nom) : undefined);
  let ouverte = $state(false);
  $effect(() => { ouverte = !!fiche; });
  $effect(() => { if (!ouverte) fiche = null; });
</script>

<section class="carte" aria-label="Élèves et classes">
  <h2>Élèves et classes</h2>
  <label class="et">Rechercher un élève<input type="text" placeholder="Rechercher" bind:value={q} /></label>
  <div class="puces" role="radiogroup" aria-label="Classe">{#each ['Toutes', ...classes] as c (c)}<button role="radio" aria-checked={filtre === c} class="puce" class:on={filtre === c} onclick={() => (filtre = c)}>{c}</button>{/each}</div>
  <ul>
    {#each liste as x (x.classe + x.nom)}
      <li><button onclick={() => (fiche = x)}><span class="ini">{ini(x.nom)}</span><span class="n"><b>{x.nom}</b><span class="muted">{x.classe}</span></span><span class="tag" class:ok={avecPlan.has(x.nom)}>{avecPlan.has(x.nom) ? 'Plan AssureMe' : 'À jour'}</span></button></li>
    {:else}<li class="muted">Aucun élève ne correspond.</li>{/each}
  </ul>
</section>

<Modale bind:ouverte titre={fiche?.nom ?? ''}>
  {#if fiche}
    <p class="muted">Classe {fiche.classe} · {ec.nom}</p>
    <p><span class="tag" class:ok={avecPlan.has(fiche.nom)}>{avecPlan.has(fiche.nom) ? 'Plan AssureMe' : 'À jour'}</span></p>
    <div><small class="muted">PARENT RÉFÉRENT</small><p>{enfant && app.compte ? `Famille ${app.compte.nom} · ${app.compte.telephone || 'téléphone non renseigné'}` : 'Non renseigné dans l’app'}</p></div>
    <div class="bt">
      <button class="btn sec" onclick={() => { const f = fiche!; va('notes', { classe: f.classe }); }}>Voir les notes</button>
      <button class="btn" onclick={() => { const f = fiche!; va('messages', { cible: { eleve: f.nom, libelle: `Parents de ${f.nom}` } }); }}>Écrire aux parents</button>
    </div>
  {/if}
</Modale>

<style>
  ul { list-style: none; } li { border-bottom: 1px solid var(--ligne); } li button { width: 100%; display: grid; grid-template-columns: 40px 1fr auto; gap: 12px; align-items: center; min-height: 56px; text-align: left; padding: 6px 4px; } li button:hover { background: var(--carte2); }
  .ini { width: 40px; height: 40px; border-radius: 20px; background: #ebeeff; color: #3050ff; display: grid; place-items: center; font-size: 13px; font-weight: 700; } .n { display: flex; flex-direction: column; } .bt { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
