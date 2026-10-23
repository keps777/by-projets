<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { jourCourt } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { LIBELLE_PORTAIL, type StatutPortail } from '../../core/sante-portail.ts';
  import type { FactureSante } from '../../screens/sante/etat.ts';
  import { TON, statutDe } from './donnees.ts';

  let { factures, ouvrir, titre = 'Factures', limite = 0 }: { factures: FactureSante[]; ouvrir: (id: string) => void; titre?: string; limite?: number } = $props();
  let q = $state(''); let filtre = $state<'tous' | StatutPortail>('tous');
  const FILTRES: { id: 'tous' | StatutPortail; libelle: string }[] = [{ id: 'tous', libelle: 'Toutes' }, { id: 'payee', libelle: 'Payées' }, { id: 'a_regler', libelle: 'Patient à régler' }, { id: 'en_retard', libelle: 'En retard' }, { id: 'a_valider', libelle: 'À valider' }];
  const vues = $derived.by(() => {
    const t = q.trim().toLowerCase();
    const l = factures.filter((f) => (filtre === 'tous' || statutDe(f) === filtre) && (!t || `${f.numero} ${f.patient} ${f.acte}`.toLowerCase().includes(t)));
    return limite ? l.slice(0, limite) : l;
  });
</script>

<section aria-label={titre}>
  {#if !limite}
    <div class="outils">
      <label class="rech"><Icone nom="oeil" taille={18} /><span class="sr">Rechercher une facture</span><input bind:value={q} placeholder="Patient ou numéro" /></label>
      <div class="chips" role="group" aria-label="Filtrer par statut">{#each FILTRES as c (c.id)}<button class:on={filtre === c.id} aria-pressed={filtre === c.id} onclick={() => (filtre = c.id)}>{c.libelle}</button>{/each}</div>
    </div>
  {/if}
  {#if vues.length === 0}
    <p class="vide">{factures.length === 0 ? "Aucune facture pour l'instant. Vérifiez un patient puis établissez une facture depuis l'accueil." : 'Aucune facture ne correspond.'}</p>
  {:else}
    <ul>
      {#each vues as f (f.id)}
        {@const s = statutDe(f)}
        <li><button onclick={() => ouvrir(f.id)} aria-label="Facture {f.numero}, {f.patient}, {LIBELLE_PORTAIL[s]}">
          <span class="m"><b>{f.numero} · {f.patient}</b><small>{f.acte} · {jourCourt(f.date)}</small></span>
          <span class="mt mono">{fcfa(f.total)} <small>FCFA</small></span>
          <span class="st" style:color={TON[s].fg} style:background={TON[s].bg}>{LIBELLE_PORTAIL[s]}</span></button></li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .outils { display: flex; flex-direction: column; gap: 10px; margin-bottom: 12px; } .rech { display: flex; align-items: center; gap: 8px; min-height: 48px; padding: 0 14px; border-radius: 14px; border: 1px solid var(--ligne-forte); background: var(--carte); color: var(--muted); }
  .rech input { flex: 1; min-width: 0; font-size: 16px; color: var(--texte); outline: none; min-height: 44px; } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .chips { display: flex; flex-wrap: wrap; gap: 8px; } .chips button { min-height: 44px; padding: 0 14px; border-radius: 22px; border: 1px solid var(--ligne-forte); background: var(--carte); font-size: 13.5px; color: var(--doux); } .chips button.on { background: #0b0f1a; color: #fff; border-color: #0b0f1a; }
  ul { list-style: none; } li { border-top: 1px solid var(--ligne); } li button { width: 100%; display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; align-items: center; text-align: left; padding: 10px 0; min-height: 60px; }
  .m { display: flex; flex-direction: column; min-width: 0; } small { color: var(--muted); font-size: 12.5px; } .mt { text-align: right; font-weight: 600; } .st { grid-column: 1 / -1; justify-self: start; padding: 3px 10px; border-radius: 99px; font-size: 12px; font-weight: 600; }
  @media (min-width: 760px) { li button { grid-template-columns: 1fr 140px 150px; } .st { grid-column: auto; justify-self: end; } }
  .vide { color: var(--muted); padding: 16px 0; font-size: 14px; }
</style>
