<script lang="ts">
  import { jourCourt, jourLong, moisAnnee, type Jour } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { libellePart } from '../../core/entreprise.ts';
  import { ent } from './etat.ts';
  import { echeances, statistiques, type LigneSalarie } from './vues.ts';
  import type { Nav } from './types.ts';
  import Statut from './Statut.svelte';

  let { ls, nav, prochaine }: { ls: LigneSalarie[]; nav: Nav; prochaine: Jour | null } = $props();
  const e = $derived(ent().entreprise);
  const st = $derived(statistiques(ls));
  const ech = $derived(echeances(3));
  const suivi = $derived(prochaine ? ent().suivi[prochaine] : undefined);
  const apercu = $derived(ls.slice(0, 6));
  const vide = $derived(ls.length === 0);
  const deMois = (j: Jour) => { const m = moisAnnee(j); return /^[aeiouéèêh]/i.test(m) ? `d'${m}` : `de ${m}`; };
</script>

{#if e && prochaine}
  <div class="titre">
    <div><h1>Paie {deMois(prochaine)}</h1><p class="doux">{vide ? 'Aucune retenue pour le moment : ajoutez vos salariés.' : `Fichier de retenues ${suivi === 'reverse' ? 'reversé à AssureMe' : suivi === 'integre' ? 'intégré à la paie' : 'prêt'} · à intégrer avant le ${jourLong(ech[0].fichierAvant)}.`}</p></div>
    <button class="btn" onclick={() => nav.importer()}>Importer un CSV</button>
  </div>

  <section class="kpis" aria-label="Indicateurs">
    <button class="carte kpi" onclick={() => nav.allerVue('salaries')}><span class="et">Salariés inscrits</span><b class="mono">{st.inscrits}<small> / {e.effectif}</small></b><span class="doux">{st.invites} invitation{st.invites > 1 ? 's' : ''} en attente</span></button>
    <button class="carte kpi" onclick={() => nav.allerVue('retenues')}><span class="et">Retenues du mois</span><b class="mono">{fcfa(st.totalRetenues)}</b><span class="doux">FCFA, à reverser sous 2 jours ouvrés</span></button>
    <button class="carte kpi" onclick={() => nav.allerVue('parametres')}><span class="et">Coût mensuel employeur</span><b class="mono">{fcfa(st.coutEmployeur)}</b><span class="doux">FCFA · part du Pass : {libellePart(e.part)}</span></button>
    <button class="carte kpi" onclick={() => nav.allerVue('salaries')}><span class="et">Au plafond de 33 %</span><b class="mono">{st.plafonnes}</b><span class="doux">Limités par AssureMe, sans action de votre part</span></button>
  </section>

  {#if st.aValider || st.plafonnes}
    <section class="carte alertes" aria-label="À traiter">
      <h2>À traiter</h2>
      <ul>
        {#if st.aValider}<li><span class="puce primaire">Nouveau</span> {st.aValider} nouvelle{st.aValider > 1 ? 's' : ''} inscription{st.aValider > 1 ? 's' : ''} : validez la retenue pour l'inclure dans le fichier. <button class="btn lien" onclick={() => nav.allerVue('salaries')}>Voir les salariés</button></li>{/if}
        {#if st.plafonnes}<li><span class="puce alerte">Plafonné</span> {st.plafonnes} salarié{st.plafonnes > 1 ? 's' : ''} au plafond de 33 % : le fichier est déjà limité. <button class="btn lien" onclick={() => nav.allerVue('retenues')}>Voir le fichier</button></li>{/if}
      </ul>
    </section>
  {/if}

  <div class="deux">
    <section class="carte" aria-labelledby="h-sal">
      <div class="entete-section"><h2 id="h-sal">Retenues par salarié</h2><button class="btn lien" onclick={() => nav.allerVue('salaries')}>Voir tous les salariés ({ls.length})</button></div>
      {#if vide}
        <div class="vide"><p>Aucun salarié pour l'instant.</p><div class="boutons"><button class="btn prim" onclick={() => nav.importer()}>Importer un CSV</button><button class="btn" onclick={() => nav.inviter()}>Inviter par SMS</button></div></div>
      {:else}
        <ul class="liste">
          {#each apercu as l (l.id)}
            <li><button class="ligne" onclick={() => nav.ouvrirFiche(l.id)}>
              <span class="m"><b>{l.nom}</b><small class="doux">{l.matricule} · {l.services}</small></span>
              <span class="mono">{l.statut === 'invite' ? '—' : fcfa(l.retenue.total)}</span><Statut statut={l.affiche} />
            </button></li>
          {/each}
        </ul>
      {/if}
    </section>
    <section class="carte" aria-labelledby="h-cal">
      <h2 id="h-cal">Prochaines paies</h2>
      <ol class="cal">
        {#each ech as x, i (x.paie)}
          <li class:cur={i === 0}><b>{jourLong(x.paie)}</b><span class="doux">Fichier avant le {jourCourt(x.fichierAvant)} · reversement le {jourCourt(x.reversement)}</span></li>
        {/each}
      </ol>
      <button class="btn lien" onclick={() => nav.allerVue('retenues')}>Calendrier et fichier de retenues</button>
    </section>
  </div>
{/if}

<style>
  .titre { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .kpis { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); }
  .kpi { display: flex; flex-direction: column; gap: 6px; text-align: left; min-height: 120px; }
  .kpi:hover { border-color: var(--primaire); }
  .et { font: 500 11px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--muted); }
  .kpi b { font-size: 28px; font-weight: 700; } .kpi small { font-size: 15px; color: var(--muted); font-weight: 500; }
  .alertes ul { list-style: none; display: flex; flex-direction: column; gap: 8px; margin-top: 10px; } .alertes li { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  .deux { display: grid; gap: 18px; grid-template-columns: 1fr; align-items: start; } @media (min-width: 900px) { .deux { grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); } }
  .entete-section { display: flex; justify-content: space-between; align-items: center; gap: 8px; flex-wrap: wrap; }
  .liste { list-style: none; margin-top: 6px; }
  .ligne { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; width: 100%; min-height: 56px; padding: 8px 4px; text-align: left; border-bottom: 1px solid var(--ligne); }
  .liste li:last-child .ligne { border: 0; } .ligne:hover { background: var(--carte2); }
  .m { display: flex; flex-direction: column; min-width: 0; } .m small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vide { text-align: center; padding: 28px 8px; display: flex; flex-direction: column; gap: 14px; align-items: center; } .boutons { display: flex; gap: 10px; flex-wrap: wrap; justify-content: center; }
  .cal { list-style: none; display: flex; flex-direction: column; gap: 10px; margin: 12px 0; } .cal li { display: flex; flex-direction: column; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--ligne); font-size: 14px; }
  .cal li.cur { border-color: var(--primaire); background: var(--primaire-fond); }
</style>
