<script lang="ts">
  import './guichet.css';
  import { maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { billetParId, caisseOuverte, heureLocale, placesLibres, prixDuDepart } from '../../domain/actions.ts';
  import { fcfa } from '../../core/money.ts';
  import { estPointe, libelleErreur } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Lecture from './Lecture.svelte';
  import { dockAgent } from './dock.ts';
  import { annulerDerniereVente, cadenceActive, contexte, departsDeLaGare, nomDepart, statsCadence, vendreCadence } from './actions.ts';
  import { etat } from './etat.ts';

  const ctx = $derived(contexte()), agent = $derived(ctx.agent);
  const caisse = $derived(agent ? caisseOuverte(agent.id) : undefined);
  const departs = $derived(agent?.gareId ? departsDeLaGare(agent.gareId, 4) : []);
  const stats = $derived(agent ? statsCadence(agent.id) : null);
  const dm = new Date(maintenant()), pointe = estPointe(dm.getHours() * 60 + dm.getMinutes());
  let quantite = $state(1), dernier = $state<string>(''), erreur = $state('');
  const dernierDepartId = $derived(dernier ? billetParId(dernier)?.departId : undefined);
  const actif = $derived(cadenceActive());
  const dernierLot = $derived(etat().annulables.at(-1));

  function toucher(departId: string) {
    if (!agent || ctx.lecture) return; erreur = '';
    try { const r = vendreCadence(agent.id, departId, quantite); dernier = r.billets[0].id; montrer(`${r.billets.length} billet${r.billets.length > 1 ? 's' : ''} · ${fcfa(r.paiement.montant)} F`); quantite = 1; }
    catch (e) { erreur = libelleErreur(e); montrer(erreur, 'er'); }
  }
  function annuler() {
    if (!agent || ctx.lecture) return;
    try { const r = annulerDerniereVente(agent.id); if (r) { montrer(`Vente annulée · ${fcfa(r.montant)} F rendus`, 'wa'); dernier = ''; } else montrer('Rien à annuler (délai de 10 min dépassé)', 'wa'); } catch (e) { montrer(libelleErreur(e), 'er'); }
  }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre="Cadence" sous="1 touche = 1 billet · espèces" retourVers="/guichet" dock={dockAgent()}>
  {#snippet droite()}<span class="pl {pointe ? 'hot ac' : ''}" title="Heures de pointe : 5 h 30 – 9 h 30 et 16 h – 19 h 30">{pointe ? 'pointe' : 'hors pointe'}</span>{/snippet}
  {#if ctx.lecture}<Lecture {agent} />{/if}

  {#if !actif}
    <div class="gl col g12"><span class="pl wa">mode désactivé</span><p class="t14">Le patron a désactivé le mode cadence. Vends avec le plan du bus et une place attribuée.</p><a class="b p" href="/vente" onclick={(e) => lien(e, '/vente')}>Vendre avec une place</a></div>
  {:else if !caisse && !ctx.lecture}
    <div class="gl col g12"><span class="pl wa">caisse fermée</span><p class="t14">Ouvre ta caisse avant de vendre en cadence.</p><a class="b p" href="/caisse" onclick={(e) => lien(e, '/caisse')}>Ouvrir la caisse</a></div>
  {:else}
    {#if !pointe}<p class="t12 wac g-note" role="status">Hors des heures de pointe : le mode cadence sert à aller vite quand la file est longue. Pense à attribuer des places le reste du temps.</p>{/if}
    <div class="gl ac row sp">
      <span class="kp"><span class="k">Vendus depuis {heureLocale(stats?.depuis ?? 0)}</span><span class="cnt">{stats?.billets ?? 0}</span></span>
      <span class="col" style="align-items: flex-end"><span class="lab">Encaissé</span><span class="ttl t20">{fcfa(stats?.encaisse ?? 0)} F</span><span class="t12 mut">{(stats?.parMinute ?? 0).toLocaleString('fr-FR')} / min</span></span>
    </div>
    <div class="col g8"><span class="lab" id="lab-qte">Quantité · une touche, puis le bus</span>
      <div class="row g8" role="group" aria-labelledby="lab-qte">{#each [1, 2, 3, 4, 5] as q (q)}<button type="button" class="ch" class:on={quantite === q} aria-pressed={quantite === q} style="flex: 1; justify-content: center" onclick={() => (quantite = q)}>{q}</button>{/each}</div></div>
    <span class="t13 mut">Touche le départ · {quantite > 1 ? `${quantite} billets s’impriment` : 'le billet s’imprime'}</span>
    {#each departs as d (d.id)}
      {@const libres = placesLibres(d)}
      <button type="button" class="bigb" class:on={dernierDepartId === d.id} disabled={libres < quantite || ctx.lecture} aria-label="{d.heure} {nomDepart(d)}, {fcfa(prixDuDepart(d))} F, {libres} libres. {quantite} billet{quantite > 1 ? 's' : ''}" onclick={() => toucher(d.id)}>
        <span class="h">{d.heure}</span><span class="t14 b7">{nomDepart(d)}{d.retardMin ? ` · retard +${d.retardMin} min` : ''}</span><span class="t13">{fcfa(prixDuDepart(d))} F · {libres === 0 ? 'complet' : `${libres} libres`}</span>
      </button>
    {:else}
      <p class="t13 mut">Aucun départ à venir depuis cette gare.</p>
    {/each}
    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    <div class="row g8 wrapf">
      <a class="b s sm grow" class:off={!dernier} aria-disabled={!dernier} href="/cadence/billet?billet={dernier}" onclick={(e) => (dernier ? lien(e, `/cadence/billet?billet=${dernier}`) : e.preventDefault())}>Voir le dernier billet</a>
      <a class="b s sm grow" href="/cadence/quai{dernierDepartId ? `?depart=${dernierDepartId}` : departs[0] ? `?depart=${departs[0].id}` : ''}" onclick={(e) => lien(e, `/cadence/quai${dernierDepartId ? `?depart=${dernierDepartId}` : departs[0] ? `?depart=${departs[0].id}` : ''}`)}>Compter au quai</a>
    </div>
    <button type="button" class="b g" disabled={!dernierLot?.length || ctx.lecture} onclick={annuler}>Annuler la dernière vente</button>
  {/if}
</Mobile>

<style>
  .bigb { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 4px; min-height: 96px; padding: 14px 16px; border-radius: 22px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; }
  .bigb:disabled { opacity: 0.45; cursor: default; }
  .bigb.on { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; box-shadow: 0 20px 40px -16px rgba(124, 108, 255, 0.8); }
  .bigb .h { font: 700 30px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.03em; }
  .bigb:active:not(:disabled) { transform: scale(0.985); }
  .cnt { font: 700 64px/1 'Unbounded Variable', 'Unbounded', sans-serif; letter-spacing: -0.05em; }
  .off { opacity: 0.5; pointer-events: none; }
</style>
