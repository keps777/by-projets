<script lang="ts">
  import { appreciation, lireNote, noteFr, synthese } from '../../core/bulletin.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ecole, type Ecole } from '../../screens/ecole/etat.ts';
  import { ajouterEvaluation, envoyerBulletin, evalsDe, matieresDe, notesSaisies, publierEvaluation, saisirNote } from './actions.ts';
  import { evaluationsDe } from '../../screens/ecole/actions.ts';
  import Modale from './Modale.svelte';

  let { ec, classeInitiale }: { ec: Ecole; classeInitiale?: string } = $props();
  const e = $derived(ecole());
  const classes = $derived(Object.keys(e.classes[ec.id] ?? {}));
  let seg = $state(0);
  // svelte-ignore state_referenced_locally
  let classe = $state(classeInitiale && (e.classes[ec.id] ?? {})[classeInitiale] ? classeInitiale : Object.keys(e.classes[ec.id] ?? {})[0] ?? '');
  const matieres = $derived(matieresDe(ec.id, classe));
  let matiere = $state('');
  const matiereOk = $derived(matieres.includes(matiere) ? matiere : matieres[0] ?? '');
  const evals = $derived(evalsDe(ec.id, classe, matiereOk));
  let evalId = $state('');
  const ev = $derived(evals.find((x) => x.id === evalId) ?? evals[evals.length - 1]);
  const eleves = $derived(e.classes[ec.id]?.[classe] ?? []);
  const saisies = $derived(ev ? notesSaisies(ev, eleves) : 0);
  const manque = $derived(eleves.length - saisies);
  let confirmer = $state(false); let nouvelle = $state(''); let erreur = $state('');

  function publier() {
    if (!ev) return;
    const r = publierEvaluation(ev.id); confirmer = false;
    if (r.ok) montrer('Notes publiées aux familles'); else montrer(r.erreur, 'danger');
  }
  function ajouter() {
    const r = ajouterEvaluation(ec.id, classe, matiereOk, nouvelle);
    if (r.ok) { evalId = r.id ?? ''; nouvelle = ''; erreur = ''; } else erreur = r.erreur;
  }
  const bulletins = $derived(eleves.map((nom) => ({ nom, s: synthese(evaluationsDe(ec.id, classe), nom, eleves), envoye: e.bulletinsEnvoyes[`${ec.id}|${nom}`] })));
  function envoyer(nom: string) { const r = envoyerBulletin(ec.id, nom); if (r.ok) montrer(`Bulletin envoyé aux parents de ${nom.split(' ').slice(1).join(' ') || nom}`); else montrer(r.erreur, 'danger'); }
</script>

{#if !classes.length}
  <section class="carte"><p class="muted">Aucune liste de classe n’est encore importée pour cet établissement.</p></section>
{:else}
  <div class="segs" role="tablist" aria-label="Notes et bulletins">
    {#each ['Saisie des notes', 'Bulletins'] as l, i (l)}<button role="tab" aria-selected={seg === i} class="puce" class:on={seg === i} onclick={() => (seg = i)}>{l}</button>{/each}
  </div>

  <section class="carte" aria-label={seg === 0 ? 'Saisie des notes' : 'Bulletins du trimestre 1'}>
    <h2>{seg === 0 ? 'Saisie des notes' : 'Bulletins du trimestre 1'}</h2>
    <div class="filtres">
      <label class="et">Classe<select class="champ" bind:value={classe} onchange={() => { matiere = ''; evalId = ''; }}>{#each classes as c (c)}<option>{c}</option>{/each}</select></label>
      {#if seg === 0}
        <label class="et">Matière<select class="champ" value={matiereOk} onchange={(x) => { matiere = x.currentTarget.value; evalId = ''; }}>{#each matieres as m (m)}<option>{m}</option>{/each}</select></label>
        <label class="et">Évaluation<select class="champ" value={ev?.id ?? ''} onchange={(x) => (evalId = x.currentTarget.value)}>{#each evals as v (v.id)}<option value={v.id}>{v.intitule}{v.publie ? ' · publiée' : ''}</option>{/each}</select></label>
      {/if}
    </div>

    {#if seg === 0}
      {#if ev}
        <div class="defile"><table>
          <thead><tr><th>Élève</th><th>Note sur 20</th><th>Appréciation</th></tr></thead>
          <tbody>
            {#each eleves as nom (nom)}
              {@const lu = lireNote(ev.notes[nom])}
              <tr><td>{nom}</td>
                <td><input type="text" inputmode="decimal" placeholder="—" aria-label={`Note de ${nom}`} class:invalide={lu.etat === 'invalide'} aria-invalid={lu.etat === 'invalide'} value={ev.notes[nom] ?? ''} oninput={(x) => saisirNote(ev.id, nom, x.currentTarget.value)} style="max-width:120px" /></td>
                <td class:err={lu.etat === 'invalide'}>{appreciation(ev.notes[nom])}</td></tr>
            {/each}
          </tbody>
        </table></div>
        <p class="muted" role="status">{saisies} note{saisies > 1 ? 's' : ''} sur {eleves.length} saisie{saisies > 1 ? 's' : ''}{ev.publie ? ' · publiée aux parents (les corrections sont visibles tout de suite)' : ''}</p>
        <button class="btn noir" disabled={ev.publie} onclick={() => (confirmer = true)}>{ev.publie ? 'Publié aux parents ✓' : 'Publier aux parents'}</button>
      {:else}<p class="muted">Aucune évaluation pour cette matière.</p>{/if}
      <form class="ajout" onsubmit={(x) => { x.preventDefault(); ajouter(); }}>
        <label class="et">Nouvelle évaluation<input type="text" placeholder="Ex. Devoir 3 · 24 oct." maxlength="40" bind:value={nouvelle} /></label>
        <button class="btn sec" type="submit" disabled={!matiereOk}>Ajouter</button>
      </form>
      {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    {:else}
      <ul class="bull">
        {#each bulletins as b (b.nom)}
          <li><div><b>{b.nom}</b><span class="muted">Trimestre 1 · {classe} · {b.s.moyenne === null ? 'pas de note' : `moyenne ${noteFr(b.s.moyenne)} · rang ${b.s.rang}/${b.s.effectif}`}</span></div>
            <div class="bt"><button class="btn sec" onclick={() => window.print()} disabled={b.s.moyenne === null}>Bulletin PDF</button>
              <button class="btn" disabled={!!b.envoye || b.s.moyenne === null} onclick={() => envoyer(b.nom)}>{b.envoye ? 'Envoyé ✓' : 'Envoyer aux parents'}</button></div></li>
        {/each}
      </ul>
    {/if}
  </section>

  <Modale bind:ouverte={confirmer} titre="Publier aux parents ?">
    <p>{classe} · {matiereOk} · {ev?.intitule} seront visibles par les familles dans l’app.{manque > 0 ? ` Il manque encore ${manque} note${manque > 1 ? 's' : ''} : ces élèves seront signalés « en attente ».` : ''}</p>
    <div class="bt"><button class="btn sec" onclick={() => (confirmer = false)}>Annuler</button><button class="btn" onclick={publier}>Publier</button></div>
  </Modale>
{/if}

<style>
  .segs { display: flex; gap: 8px; } .filtres { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; } .ajout { display: flex; gap: 12px; align-items: flex-end; flex-wrap: wrap; } .ajout label { flex: 1; min-width: 200px; }
  .bull { list-style: none; display: flex; flex-direction: column; } .bull li { display: flex; justify-content: space-between; gap: 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--ligne); flex-wrap: wrap; } .bull li > div:first-child { display: flex; flex-direction: column; }
  .bt { display: flex; gap: 8px; flex-wrap: wrap; }
</style>
