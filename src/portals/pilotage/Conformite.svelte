<script lang="ts">
  import { basculerConformite } from './actions.ts';
  import type { EtatPilotage } from './etat.ts';
  let { e }: { e: EtatPilotage } = $props();
  const POINTS: [string, string][] = [
    ["Agrément COBAC du partenaire de crédit", 'Crédits scolaires, auto et logement'], ["Agrément CIMA de l'assureur", 'Assurance santé et auto'],
    ['Contrat avec les opérateurs de paiement mobile', 'Orange Money, MTN MoMo'], ["Vérification d'identité des membres", "Pièce d'identité et selfie à l'inscription"],
    ['Protection des données personnelles', 'Registre des traitements et consentements']
  ];
  const faits = $derived(e.conformite.filter(Boolean).length);
</script>

<section class="carte" aria-labelledby="h-co">
  <div class="tete"><h2 id="h-co">Conformité</h2><span class="doux" role="status">{faits} point{faits > 1 ? 's' : ''} sur 5 validé{faits > 1 ? 's' : ''}</span></div>
  <div class="barre" role="progressbar" aria-valuenow={faits} aria-valuemin="0" aria-valuemax="5" aria-label="Points de conformité validés"><span style:width="{faits * 20}%"></span></div>
  <div class="liste">{#each POINTS as p, i (p[0])}
    <button class="point" class:fait={e.conformite[i]} role="checkbox" aria-checked={e.conformite[i]} onclick={() => basculerConformite(i)}>
      <span class="pastille" aria-hidden="true">{e.conformite[i] ? '✓' : ''}</span>
      <span class="txt"><strong>{p[0]}</strong><span class="doux">{e.conformite[i] ? 'Validé' : 'À valider'} · {p[1]}</span></span></button>{/each}</div>
</section>

<style>
  .tete { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; flex-wrap: wrap; }
  .barre { height: 10px; border-radius: 5px; background: #eff1f6; } .barre span { display: block; height: 10px; border-radius: 5px; background: var(--primaire); transition: width 0.3s; }
  .point { display: flex; align-items: center; gap: 12px; padding: 14px 16px; min-height: 56px; border-radius: 14px; border: 1px solid #e2e5ee; background: #fff; text-align: left; width: 100%; }
  .point.fait { border-color: #bac6ff; background: #f5f7ff; } .pastille { width: 24px; height: 24px; border-radius: 12px; background: #8b94a9; color: #fff; display: grid; place-items: center; flex: none; font-size: 14px; }
  .fait .pastille { background: var(--primaire); } .txt { display: flex; flex-direction: column; gap: 2px; font-size: 14px; } .txt strong { font-size: 15px; }
</style>
