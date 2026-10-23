<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { ARTICLES_EQUIPEMENT, DUREE_EQUIPEMENT, controlerEquipement, mensualiteEquipement, totalEquipement } from '../../core/avance-loyer.ts';
  import { jourLong } from '../../core/dates.ts';
  import { commanderEquipement } from './actions.ts';
  import { entreeSimulation, logement } from './etat.ts';

  let { ouverte = $bindable(false) }: { ouverte?: boolean } = $props();
  const l = logement();
  let choix = $state<string[]>([]);
  let erreur = $state('');
  const taux = $derived(entreeSimulation(l.sim).taux);
  const mensuel = (prix: number) => mensualiteEquipement(prix, taux);
  const total = $derived(mensuel(totalEquipement(choix)));
  const verif = $derived.by(() => {
    const e = entreeSimulation(l.sim);
    return controlerEquipement({ salaire: e.salaire, mensualitesExistantes: e.mensualitesExistantes, loyerPreleve: l.bail?.prelevement ? l.bail.loyer : 0, nouvelle: total });
  });
  const bascule = (id: string) => { choix = choix.includes(id) ? choix.filter((x) => x !== id) : [...choix, id]; erreur = ''; };
  function commander() {
    const r = commanderEquipement(choix);
    if (!r.ok) { erreur = r.message; return; }
    ouverte = false;
    montrer(l.bail?.equipement ? `Commande envoyée · livraison le ${jourLong(l.bail.equipement.livraison)}` : 'Commande envoyée');
  }
</script>

<Feuille bind:ouverte titre="Équiper le logement">
  <p class="muted">Payé au magasin partenaire, remboursé sur {DUREE_EQUIPEMENT} mois à {(taux * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % par mois.</p>
  <div class="articles" role="group" aria-label="Articles">
    {#each ARTICLES_EQUIPEMENT as a (a.id)}
      {@const on = choix.includes(a.id)}
      <button type="button" role="checkbox" aria-checked={on} class:on onclick={() => bascule(a.id)}>
        <span class="case" aria-hidden="true">{on ? '✓' : ''}</span>
        <span class="nom"><b>{a.nom}</b><small class="muted mono">{fcfa(a.prix)} FCFA</small></span>
        <span class="mono m">{fcfa(mensuel(a.prix))} / mois</span>
      </button>
    {/each}
  </div>
  <div class="total"><span class="muted">Ajouté à votre prélèvement</span><b class="mono">+ {fcfa(total)} / mois</b></div>
  {#if choix.length && !verif.ok}<p class="err" role="alert">Vos prélèvements monteraient à {verif.pct} % du salaire, au-dessus de 33 %. Retirez un article.</p>{/if}
  {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
  <Bouton desactive={!choix.length || !verif.ok} onclick={commander}>{choix.length ? 'Commander' : 'Choisissez un article'}</Bouton>
  <Bouton variante="discret" onclick={() => (ouverte = false)}>Fermer</Bouton>
</Feuille>

<style>
  .articles { display: flex; flex-direction: column; gap: 8px; }
  button[role='checkbox'] { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 10px 14px; text-align: left; border-radius: 16px; background: var(--carte2); border: 1px solid var(--ligne); }
  button.on { background: var(--primaire-fond); border-color: var(--primaire); }
  .case { width: 24px; height: 24px; border-radius: 12px; border: 2px solid var(--faint); display: grid; place-items: center; flex: none; font-size: 13px; color: #fff; } .on .case { background: var(--primaire); border-color: var(--primaire); }
  .nom { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .nom small { font-size: 12px; } .m { font-size: 13px; color: var(--doux); white-space: nowrap; }
  .total { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; } .total b { font-size: 18px; } .err { color: var(--danger); font-size: 13px; }
</style>
