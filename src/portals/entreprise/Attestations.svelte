<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { emettreAttestation } from './actions.ts';
  import { ent } from './etat.ts';
  import type { Nav } from './types.ts';
  import type { LigneSalarie } from './vues.ts';

  let { ls, nav }: { ls: LigneSalarie[]; nav: Nav } = $props();
  const inscrits = $derived(ls.filter((l) => l.statut !== 'invite'));
  const delivrees = $derived(ent().attestations);
  const jour = (ts: number) => new Date(ts).toLocaleDateString('fr-FR');
  function delivrer(id: string) {
    const r = emettreAttestation(id);
    if (!r.ok) { montrer(r.erreur, 'danger'); return; }
    montrer(`Attestation ${r.attestation.numero} délivrée`); nav.voirAttestation(r.attestation.id);
  }
</script>

<div><h1>Attestations de salaire</h1><p class="doux">À délivrer à vos salariés pour leurs dossiers de crédit, de caution de loyer ou d'avance. Le salaire net doit être renseigné.</p></div>

<section aria-labelledby="h-s">
  <h2 id="h-s">Salariés inscrits</h2>
  {#if inscrits.length === 0}
    <div class="carte vide"><p><b>Aucun salarié inscrit.</b></p><p class="doux">Les attestations sont disponibles dès qu'un salarié a rejoint l'entreprise sur AssureMe.</p></div>
  {:else}
    <div class="tableau"><table>
      <caption class="sr">Salariés inscrits et attestations de salaire</caption>
      <thead><tr><th scope="col">Salarié</th><th scope="col" class="num">Salaire net mensuel</th><th scope="col"><span class="sr">Action</span></th></tr></thead>
      <tbody>
        {#each inscrits as l (l.id)}
          <tr><td><b>{l.nom}</b> <span class="doux mono">{l.matricule}</span></td>
            <td class="num mono">{l.salaire > 0 ? `${fcfa(l.salaire)} FCFA` : 'À renseigner'}</td>
            <td class="act">{#if l.salaire > 0}<button class="btn" onclick={() => delivrer(l.id)} aria-label="Délivrer une attestation de salaire à {l.nom}">Délivrer une attestation</button>{:else}<button class="btn" onclick={() => nav.ouvrirFiche(l.id)} aria-label="Renseigner le salaire de {l.nom}">Renseigner le salaire</button>{/if}</td></tr>
        {/each}
      </tbody>
    </table></div>
  {/if}
</section>

<section aria-labelledby="h-d">
  <h2 id="h-d">Attestations délivrées ({delivrees.length})</h2>
  {#if delivrees.length === 0}
    <p class="doux">Aucune attestation délivrée pour l'instant.</p>
  {:else}
    <div class="tableau"><table>
      <caption class="sr">Attestations délivrées</caption>
      <thead><tr><th scope="col">Numéro</th><th scope="col">Salarié</th><th scope="col" class="num">Salaire net</th><th scope="col">Date</th><th scope="col"><span class="sr">Action</span></th></tr></thead>
      <tbody>{#each delivrees as a (a.id)}<tr><td class="mono">{a.numero}</td><td>{a.salarie}</td><td class="num mono">{fcfa(a.salaire)}</td><td>{jour(a.ts)}</td><td class="act"><button class="btn" onclick={() => nav.voirAttestation(a.id)} aria-label="Ouvrir l'attestation {a.numero}">Ouvrir</button></td></tr>{/each}</tbody>
    </table></div>
  {/if}
</section>

<style>
  section > h2 { margin-bottom: 10px; } .vide { text-align: center; padding: 28px; } .act { text-align: right; }
</style>
