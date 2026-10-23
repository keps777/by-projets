<script lang="ts">
  import { jourCourt, nomMois } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { releveCsv, statsClinique } from '../../core/sante-portail.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aujourdhui, type FactureSante } from '../../screens/sante/etat.ts';

  let { factures, ouvrir }: { factures: FactureSante[]; ouvrir: (id: string) => void } = $props();
  const valides = $derived(factures.filter((f) => f.statut !== 'brouillon'));
  const stats = $derived(statsClinique(valides, maintenant()));
  /** Relevé téléchargé en CSV, généré dans le navigateur (aucun envoi). */
  function exporter() {
    const blob = new Blob(['﻿' + releveCsv(valides, aujourdhui())], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `releve-clinique-${aujourdhui()}.csv`; a.click(); URL.revokeObjectURL(url);
    montrer('Relevé des paiements exporté');
  }
</script>

<div class="entete"><h2>Paiements reçus</h2><button class="exp" onclick={exporter} disabled={valides.length === 0}>Exporter le relevé (CSV)</button></div>
<div class="kpis">
  <div><span>Payé par AssureMe en {nomMois(aujourdhui())}</span><b class="mono">{fcfa(stats.versee)}</b></div>
  <div><span>Part patient encaissée</span><b class="mono">{fcfa(stats.encaissee)}</b></div>
  <div><span>Part patient à encaisser</span><b class="mono">{fcfa(stats.aEncaisser)}</b></div>
  <div><span>Délai moyen de règlement patient</span><b>{stats.delaiMoyenJours === null ? '—' : `${stats.delaiMoyenJours} jour${stats.delaiMoyenJours > 1 ? 's' : ''}`}</b></div>
</div>
<p class="muted compte">Les paiements arrivent sur le compte de la clinique ou son numéro marchand Mobile Money. Versement AssureMe à la validation de la facture (tiers payant).</p>
{#if valides.length === 0}
  <p class="vide">Aucun paiement pour l'instant.</p>
{:else}
  <div class="tab"><table>
    <thead><tr><th>Facture</th><th>Date</th><th class="n">Part AssureMe versée</th><th class="n">Part patient</th><th>Règlement patient</th></tr></thead>
    <tbody>{#each valides as f (f.id)}
      <tr><td><button onclick={() => ouvrir(f.id)}>{f.numero} · {f.patient}</button></td><td>{jourCourt(f.date)}</td><td class="n mono">{fcfa(f.assureMe)}</td><td class="n mono">{fcfa(f.partPatient)}</td>
        <td>{f.statut === 'a_regler' ? 'En attente' : f.paiement?.mode === 'etale' ? `Étalé (${f.paiement.mois} mois), avancé par AssureMe` : 'Reçu'}</td></tr>
    {/each}</tbody></table></div>
{/if}

<style>
  .entete { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; } h2 { font-size: 18px; }
  .exp { min-height: 44px; padding: 0 16px; border-radius: 14px; border: 1px solid var(--ligne-forte); background: var(--carte); font-weight: 600; } .exp:disabled { opacity: 0.5; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; } .kpis div { background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
  .kpis span { font-size: 12.5px; color: var(--muted); } .kpis b { font-size: 22px; } .compte { font-size: 12.5px; margin: 12px 0; } .vide { color: var(--muted); padding: 16px 0; }
  .tab { overflow-x: auto; background: var(--carte); border: 1px solid var(--ligne); border-radius: 14px; } table { width: 100%; border-collapse: collapse; font-size: 14px; min-width: 620px; }
  th { text-align: left; color: var(--muted); font-weight: 500; font-size: 12px; padding: 10px 12px; } td { padding: 4px 12px; border-top: 1px solid var(--ligne); } .n { text-align: right; }
  td button { min-height: 44px; text-align: left; color: var(--primaire); font-weight: 600; }
</style>
