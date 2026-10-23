<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { lireNote } from '../../core/bulletin.ts';
  import { ecole, type Ecole } from '../../screens/ecole/etat.ts';
  import { encaisse, elevesAM, famillesAvecPlan } from './actions.ts';
  import type { VaVers } from './types.ts';

  let { ec, va }: { ec: Ecole; va: VaVers } = $props();
  const e = $derived(ecole());
  const niveaux = $derived(Object.entries(ec.niveauxPct));
  let niveau = $state('');
  const aSaisir = $derived(e.evaluations.filter((v) => v.ecoleId === ec.id && !v.publie).map((v) => ({ v, manque: (e.classes[ec.id]?.[v.classe] ?? []).filter((n) => lireNote(v.notes[n]).etat === 'vide').length })).filter((x) => x.manque > 0));
  const familles = $derived(famillesAvecPlan(ec.id));
  const aInviter = $derived(Math.max(0, ec.familles - ec.connectees));
  const note = $derived(niveau ? `Niveau ${niveau} : ${ec.niveauxPct[niveau]} % des frais payés. ${ec.niveauxPct[niveau] < 85 ? 'Ce niveau est sous les 85 %, pensez à relancer les familles.' : 'Pas de relance nécessaire.'}` : 'Touchez un niveau pour voir les familles à relancer.');
</script>

<div class="grille3">
  <button class="kpi" onclick={() => va('frais')}><small>Encaissé via AssureMe</small><b>{fcfa(encaisse(ec))}</b><span>FCFA pour {elevesAM(ec)} élèves</span></button>
  <button class="kpi" onclick={() => va('frais')}><small>Reste à encaisser (hors AssureMe)</small><b>{fcfa(ec.resteBase)}</b><span>{aInviter ? 'Invitez ces familles' : 'Toutes les familles sont connectées'}</span></button>
  <button class="kpi" onclick={() => va('messages')}><small>Parents connectés</small><b>{ec.connectees}</b><span>sur {ec.familles} familles</span></button>
</div>

<section class="carte" aria-label="À faire cette semaine">
  <h2>À faire cette semaine</h2>
  <ul class="todo">
    {#each aSaisir.slice(0, 3) as x (x.v.id)}
      <li><button onclick={() => va('notes', { classe: x.v.classe })}><b>{x.manque} note{x.manque > 1 ? 's' : ''} à saisir en {x.v.classe}</b><span class="muted">{x.v.matiere} · {x.v.intitule}</span></button></li>
    {/each}
    {#if aInviter && !ec.invitees}<li><button onclick={() => va('frais')}><b>Inviter les familles non connectées</b><span class="muted">{aInviter} familles sur {ec.familles}</span></button></li>{/if}
    <li><button onclick={() => va('frais')}><b>{familles.length} famille{familles.length > 1 ? 's' : ''} avec un plan AssureMe</b><span class="muted">Voir les paiements reçus</span></button></li>
    {#if !aSaisir.length && (ec.invitees || !aInviter) && !familles.length}<li class="muted">Rien à faire pour le moment.</li>{/if}
  </ul>
</section>

<section class="carte" aria-label="Frais payés par niveau">
  <h2>Frais payés par niveau</h2>
  {#each niveaux as [n, pct] (n)}
    <button class="niv" class:sel={niveau === n} aria-pressed={niveau === n} onclick={() => (niveau = niveau === n ? '' : n)}>
      <span>{n}</span><div class="barre" class:warn={pct < 85}><span style:width="{pct}%"></span></div><b>{pct} %</b>
    </button>
  {/each}
  <p class="muted" role="status">{note}</p>
</section>

<style>
  .todo { list-style: none; display: flex; flex-direction: column; } .todo li { border-bottom: 1px solid var(--ligne); } .todo li:last-child { border: 0; }
  .todo button { width: 100%; text-align: left; min-height: 56px; padding: 8px 4px; display: flex; flex-direction: column; justify-content: center; gap: 2px; } .todo button:hover { background: var(--carte2); }
  .niv { display: grid; grid-template-columns: 48px 1fr 56px; gap: 12px; align-items: center; min-height: 44px; border-radius: 10px; padding: 0 6px; text-align: left; } .niv.sel { background: #ebeeff; } .niv b { text-align: right; font-variant-numeric: tabular-nums; }
</style>
