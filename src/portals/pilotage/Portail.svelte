<script lang="ts">
  import './portail.css';
  import { calculer, csvPilotage, depasseSeuil, ETIQUETTE_SIMULEE, NB_PERIODES, PRODUITS, periodeDe, type FiltreProduit } from '../../core/pilotage.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { aller as allerA } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller, choisirPeriode, choisirProduit } from './actions.ts';
  import { BASE } from './base.ts';
  import { lirePilotage, pilotage, type Panneau } from './etat.ts';
  import { lireEntree, sourcesPresentes } from './lecture.ts';
  import { grand, maj, pourcent } from './format.ts';
  import Activite from './Activite.svelte';
  import Conformite from './Conformite.svelte';
  import Ensemble from './Ensemble.svelte';
  import Partenaires from './Partenaires.svelte';
  import Risque from './Risque.svelte';
  import Tresorerie from './Tresorerie.svelte';

  pilotage(); // crée la tranche « pilotage » une fois, à l'initialisation (jamais depuis un $derived)

  const NAV: { id: Panneau; libelle: string }[] = [
    { id: 'ensemble', libelle: "Vue d'ensemble" }, { id: 'risque', libelle: 'Risque et recouvrement' }, { id: 'activite', libelle: 'Santé, épargne et paie' },
    { id: 'tresorerie', libelle: 'Trésorerie' }, { id: 'partenaires', libelle: 'Partenaires' }, { id: 'conformite', libelle: 'Conformité' }
  ];
  const e = $derived(lirePilotage());
  const filtre = $derived({ periode: e.periode, produit: e.produit });
  const ind = $derived(calculer(lireEntree(), BASE, filtre, maintenant()));
  const sources = $derived(sourcesPresentes());
  const periodes = $derived(Array.from({ length: NB_PERIODES }, (_, i) => periodeDe(maintenant(), i)));
  const titre = $derived(NAV.find((n) => n.id === e.panneau)?.libelle ?? '');
  const alerteRetard = $derived(depasseSeuil(ind.retards.taux, e.seuil));
  const nomProduit = $derived(e.produit === 'tous' ? '' : PRODUITS.find((p) => p.cle === e.produit)?.libelle ?? '');

  function exporter() {
    const blob = new Blob([csvPilotage(ind)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `pilotage-assureme-${ind.periode.cle}.csv`; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000); montrer('Rapport de pilotage exporté (CSV)');
  }
</script>

<div class="pil">
  <aside>
    <div class="marque">
      <svg aria-hidden="true" width="32" height="32" viewBox="0 0 40 40"><rect width="40" height="40" rx="10" fill="#fff" /><path d="M11.5 29L20 11L28.5 29" stroke="#0B0F1A" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round" fill="none" /><rect x="13" y="21.6" width="18" height="3.6" rx="1.8" fill="#3050FF" /></svg>
      <span class="nom">Assure<b>Me</b></span><span class="badge">Pilotage</span>
    </div>
    <nav aria-label="Menu pilotage">{#each NAV as n (n.id)}<button class:on={e.panneau === n.id} aria-current={e.panneau === n.id ? 'page' : undefined} onclick={() => aller(n.id)}>{n.libelle}</button>{/each}</nav>
    <div class="vide"></div>
    <a href="/" class="sortie" onclick={(ev) => { ev.preventDefault(); allerA('/'); }}>Ouvrir l'application membre</a>
  </aside>

  <main>
    <div class="entete">
      <div><h1>{titre} · {maj(ind.periode.libelle)}</h1><p class="doux">Pour l'équipe AssureMe et le partenaire financier agréé.</p></div>
      <div class="filtres">
        <div class="groupe" role="group" aria-label="Période">
          <span class="doux">Période</span>
          {#each periodes as p, i (p.cle)}<button class="puce" aria-pressed={e.periode === i} onclick={() => choisirPeriode(i)}>{maj(p.libelle.split(' ')[0])}</button>{/each}
        </div>
        <label class="groupe"><span class="doux">Produit</span>
          <select value={e.produit} onchange={(ev) => choisirProduit(ev.currentTarget.value as FiltreProduit)} aria-label="Filtrer par produit">
            <option value="tous">Tous les produits</option>{#each PRODUITS as p (p.cle)}<option value={p.cle}>{p.libelle}</option>{/each}
          </select></label>
        <button class="btn" onclick={exporter}>Exporter en CSV</button>
      </div>
    </div>

    <p class="note sim"><span class="etiquette">{ETIQUETTE_SIMULEE}</span> Les chiffres d'échelle (milliers de membres) sont simulés. {ind.compteLocal ? "Le vrai compte local de cet appareil s'y ajoute, en lecture seule." : "Aucun compte local sur cet appareil : seule la population simulée est affichée."}</p>

    <div class="tuiles">
      <button class="tuile" onclick={() => aller('tresorerie')}><span class="k">Encours total{nomProduit ? ` · ${nomProduit}` : ''}</span><span class="v">{grand(ind.encours.total)}</span><span class="s">FCFA{ind.encours.local > 0 ? ` · dont compte local ${grand(ind.encours.local)}` : ''}</span></button>
      <div class="tuile"><span class="k">Membres actifs</span><span class="v">{ind.membres.total.toLocaleString('fr-FR')}</span><span class="s">dont 64 % via un employeur{ind.membres.local ? ' · compte local inclus' : ''}</span></div>
      <button class="tuile" onclick={() => aller('partenaires')}><span class="k">Partenaires</span><span class="v">{ind.partenaires.total}</span><span class="s">{ind.partenaires.detail}</span></button>
      <button class="tuile" onclick={() => aller('risque')}><span class="k">Retards de plus de 30 jours</span><span class="v" class:alerte={alerteRetard}>{pourcent(ind.retards.taux)}</span><span class="s lien">Seuil interne : {pourcent(e.seuil)}{alerteRetard ? ' · dépassé' : ''}</span></button>
    </div>

    {#if e.panneau === 'ensemble'}<Ensemble {ind} {e} {sources} />
    {:else if e.panneau === 'risque'}<Risque {ind} {e} />
    {:else if e.panneau === 'activite'}<Activite {ind} />
    {:else if e.panneau === 'tresorerie'}<Tresorerie {ind} {e} />
    {:else if e.panneau === 'partenaires'}<Partenaires {e} />
    {:else}<Conformite {e} />{/if}
  </main>
</div>

<style>
  .marque { display: flex; align-items: center; gap: 10px; padding: 0 8px; } .nom { font-size: 22px; font-weight: 500; letter-spacing: -0.02em; } .nom b { font-weight: 600; color: #7c93ff; }
  .badge { font-size: 11px; font-weight: 700; color: #0b0f1a; background: #ff7a2f; padding: 2px 8px; border-radius: 8px; }
  nav { display: flex; flex-direction: column; gap: 2px; } nav button { min-height: 44px; padding: 0 12px; border-radius: 10px; color: #d3d8e4; font-size: 14px; text-align: left; }
  nav button.on { background: #161c2b; color: #fff; font-weight: 700; } nav button:hover:not(.on) { background: rgba(255, 255, 255, 0.06); }
  .vide { flex: 1; } .sortie { display: flex; align-items: center; min-height: 44px; padding: 0 12px; border-radius: 10px; color: #a9b2c7; font-size: 14px; } .sortie:hover { color: #fff; }
  .entete { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; } .entete p { margin-top: 4px; font-size: 15px; }
  .filtres { display: flex; flex-wrap: wrap; gap: 10px 16px; align-items: center; } .groupe { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; } .groupe > span { font-size: 13px; margin-right: 4px; }
  .v.alerte { color: #c0392b; }
  @media (max-width: 899px) { aside { padding: 14px 16px; gap: 10px; } nav { flex-direction: row; overflow-x: auto; } nav button { white-space: nowrap; } .vide { display: none; } }
</style>
