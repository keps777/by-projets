<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { ajouterMois, jourCourt, jourDe, jourLong, moisAnnee } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import Carte from '../../ui/Carte.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import { creditDe } from './actions.ts';
  import type { Plan } from './etat.ts';

  let { plan }: { plan: Plan } = $props();
  let ouverte = $state(false);
  const credit = $derived(creditDe(plan));
  const payees = $derived(credit?.payees ?? (plan.statut === 'termine' ? plan.duree : 0));
  const total = $derived(plan.mensualite * plan.duree);
  const rembourse = $derived(Math.min(total, payees * plan.mensualite));
  const jour = $derived(plan.jourPrelevement);
  /** Échéancier : les mensualités déjà payées remontent depuis la prochaine échéance du crédit. */
  const echeances = $derived.by(() => {
    const prochaine = credit?.prochaine;
    return Array.from({ length: plan.duree }, (_, i) => {
      const n = i + 1;
      const jourN = prochaine ? ajouterMois(prochaine, n - payees - 1, jour) : plan.rentree;
      return { n, jour: jourN, etat: n <= payees ? 'payee' : n === payees + 1 && plan.statut === 'actif' ? 'prochaine' : 'avenir' } as const;
    });
  });
  const fin = $derived(echeances[echeances.length - 1]?.jour);
  const avantDebut = $derived(credit ? payees === 0 && credit.prochaine > jourDe(new Date(maintenant())) : false);
  const annee = $derived(Number(plan.rentree.slice(0, 4)));
</script>

<Carte accent={plan.statut === 'termine' ? 'var(--bon)' : 'var(--primaire)'}>
  <div class="tete">
    <div><small class="mono">{plan.libelle.toUpperCase()}</small><h2>{plan.statut === 'termine' ? 'Scolarité soldée' : avantDebut ? `Écoles payées le ${jourLong(plan.accord)}` : `Payée à l’école le ${jourLong(plan.accord)}`}</h2></div>
    <Pastille ton={plan.statut === 'termine' ? 'bon' : 'primaire'}>{plan.statut === 'termine' ? 'Soldée' : 'En cours'}</Pastille>
  </div>
  <div class="chiffres">
    <div><small>Remboursé</small><b class="mono">{fcfa(rembourse)}</b><span class="muted"> / {fcfa(total)}</span></div>
    <div class="d"><small>Mensualité</small><b class="mono">{fcfa(plan.mensualite)}</b></div>
  </div>
  <Jauge pct={total ? (rembourse / total) * 100 : 0} couleur="var(--bon)" />
  <p class="muted pied">{payees} / {plan.duree} mensualités{fin ? ` · fin en ${moisAnnee(fin)}` : ''}{plan.tauxLancement ? ' · taux de lancement 0 %' : ''}</p>
  <Bouton variante="secondaire" onclick={() => (ouverte = true)}>Voir le plan de remboursement</Bouton>
</Carte>

<Feuille bind:ouverte titre="Plan de remboursement" sous={`Rentrée ${annee}`}>
  <p class="muted">AssureMe a payé l’école {plan.coffre ? `(avec ${fcfa(plan.coffre)} du coffre Rentrée) ` : ''}le {jourLong(plan.accord)}. Vous remboursez {plan.duree} mensualités sur salaire, le {jour}, à {plan.tauxLancement ? '0 % (taux de lancement)' : `${(plan.taux * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} % par mois`}.</p>
  <ul class="liste" aria-label="Échéancier">
    {#each echeances as e (e.n)}
      <li class={e.etat}><span class="mono">{e.n} / {plan.duree}</span><span>{jourCourt(e.jour)} {e.jour.slice(0, 4)}</span><b class="mono">{fcfa(plan.mensualite)}</b><Pastille ton={e.etat === 'payee' ? 'bon' : e.etat === 'prochaine' ? 'primaire' : 'neutre'}>{e.etat === 'payee' ? 'Payée' : e.etat === 'prochaine' ? 'Prochaine' : 'À venir'}</Pastille></li>
    {/each}
  </ul>
  {#if credit && credit.statut === 'actif' && app.solde < plan.mensualite && credit.payees < credit.duree && !avantDebut}<p class="alerte" role="status">Votre solde est inférieur à la mensualité : si rien n’est rechargé, elle sera reportée d’un mois, sans pénalité.</p>{/if}
  <Bouton variante="secondaire" onclick={() => (ouverte = false)}>Fermer</Bouton>
</Feuille>

<style>
  .tete { display: flex; justify-content: space-between; gap: 8px; align-items: flex-start; } small { font: 500 10.5px var(--mono); letter-spacing: 0.1em; color: var(--muted); text-transform: uppercase; }
  h2 { font-size: 18px; margin-top: 4px; } .chiffres { display: flex; justify-content: space-between; align-items: flex-end; margin: 14px 0 10px; gap: 12px; } .chiffres small { display: block; }
  .chiffres b { font-size: 22px; font-weight: 600; } .d { text-align: right; } .pied { font-size: 12.5px; margin: 10px 0 12px; }
  .liste { list-style: none; display: flex; flex-direction: column; } li { display: grid; grid-template-columns: 52px 1fr auto auto; align-items: center; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--ligne); font-size: 13.5px; }
  li.avenir { opacity: 0.7; } .alerte { color: var(--alerte); font-size: 13px; }
</style>
