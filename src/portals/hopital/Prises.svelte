<script lang="ts">
  import Bouton from '../../ui/Bouton.svelte';
  import { jourCourt } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { LIBELLE_PORTAIL } from '../../core/sante-portail.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { supprimerBrouillon, validerBrouillon } from '../../screens/sante/actions.ts';
  import { aujourdhui, type FactureSante } from '../../screens/sante/etat.ts';
  import { TON, statutDe } from './donnees.ts';

  let { factures, ouvrir, nouvelle }: { factures: FactureSante[]; ouvrir: (id: string) => void; nouvelle: () => void } = $props();
  const liste = $derived(factures.filter((f) => f.statut === 'brouillon' || f.date === aujourdhui()));
  function valider(id: string) { const r = validerBrouillon(id); montrer(r.ok ? 'Prise en charge validée' : r.erreur, r.ok ? 'bon' : 'danger'); }
</script>

<div class="entete"><h2>Prises en charge du jour</h2><Bouton plein={false} onclick={nouvelle}>Nouvelle prise en charge</Bouton></div>
{#if liste.length === 0}
  <p class="vide">Rien aujourd'hui. Les brouillons et les factures validées ce jour apparaissent ici.</p>
{:else}
  <ul>
    {#each liste as f (f.id)}
      {@const s = statutDe(f)}
      <li>
        <button class="l" onclick={() => ouvrir(f.id)}><b>{f.patient}</b><small>{f.acte}{f.medecin ? ` · ${f.medecin}` : ''} · {jourCourt(f.date)}</small><small>AssureMe {fcfa(f.assureMe)} · patient {fcfa(f.partPatient)}</small></button>
        <span class="st" style:color={TON[s].fg} style:background={TON[s].bg}>{f.statut === 'brouillon' ? 'À valider' : 'Validée'}{f.statut === 'brouillon' ? '' : ` · ${LIBELLE_PORTAIL[s].toLowerCase()}`}</span>
        {#if f.statut === 'brouillon'}<span class="a"><button class="v" onclick={() => valider(f.id)}>Valider</button><button class="x" onclick={() => { supprimerBrouillon(f.id); montrer('Brouillon supprimé'); }}>Supprimer</button></span>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .entete { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; } h2 { font-size: 18px; } .vide { color: var(--muted); padding: 16px 0; }
  ul { list-style: none; background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; } li { display: flex; flex-wrap: wrap; gap: 8px 12px; align-items: center; padding: 10px 14px; border-top: 1px solid var(--ligne); } li:first-child { border: 0; }
  .l { flex: 1; min-width: 200px; display: flex; flex-direction: column; text-align: left; min-height: 48px; justify-content: center; } small { color: var(--muted); font-size: 12.5px; }
  .st { padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; } .a { display: flex; gap: 6px; } .a button { min-height: 44px; padding: 0 16px; border-radius: 12px; font-weight: 650; }
  .v { background: var(--primaire); color: #fff; } .x { border: 1px solid var(--ligne-forte); color: #b3261e; }
</style>
