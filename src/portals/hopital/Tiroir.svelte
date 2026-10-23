<script lang="ts">
  import { jourLong, quand } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { CATEGORIES } from '../../core/sante-facture.ts';
  import { LIBELLE_PORTAIL } from '../../core/sante-portail.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { supprimerBrouillon, validerBrouillon } from '../../screens/sante/actions.ts';
  import type { FactureSante } from '../../screens/sante/etat.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { TON, statutDe } from './donnees.ts';

  let { facture, fermer }: { facture: FactureSante; fermer: () => void } = $props();
  const s = $derived(statutDe(facture));
  let btn: HTMLButtonElement | undefined = $state();
  $effect(() => { btn?.focus(); });
  const note = $derived({
    a_valider: "Brouillon : validez la facture pour que le patient la voie dans son application.",
    a_regler: `Le patient la voit dans son application et doit régler sa part avant le ${jourLong(facture.echeance)}.`,
    en_retard: `Échéance dépassée le ${jourLong(facture.echeance)}. La part AssureMe est déjà acquise à la clinique ; le patient reste invité à régler la sienne.`,
    payee: facture.paiement?.mode === 'etale' ? `Le patient a étalé sa part sur ${facture.paiement.mois} mois avec AssureMe : la clinique n'a plus rien à attendre.` : `Part du patient réglée ${facture.paiement ? quand(facture.paiement.ts, maintenant()).toLowerCase() : ''}.`
  }[s]);
  function valider() { const r = validerBrouillon(facture.id); montrer(r.ok ? 'Facture validée' : r.erreur, r.ok ? 'bon' : 'danger'); if (r.ok) fermer(); }
  function supprimer() { supprimerBrouillon(facture.id); montrer('Brouillon supprimé'); fermer(); }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && fermer()} />
<div class="voile" role="presentation" onclick={fermer}></div>
<div class="tiroir" role="dialog" aria-modal="true" aria-label="Facture {facture.numero}">
  <header><div><b>{facture.numero}</b><small>{facture.patient} · {facture.acte} · {jourLong(facture.date)}</small></div><button bind:this={btn} onclick={fermer} aria-label="Fermer">×</button></header>
  <span class="st" style:color={TON[s].fg} style:background={TON[s].bg}>{LIBELLE_PORTAIL[s]}</span>
  <div class="montant"><b class="mono">{fcfa(facture.total)}</b> FCFA</div>
  <dl><div><dt>Part AssureMe ({facture.total ? Math.round((facture.assureMe / facture.total) * 100) : 0} %)</dt><dd class="mono">{fcfa(facture.assureMe)}</dd></div><div><dt>Part patient</dt><dd class="mono">{fcfa(facture.partPatient)}</dd></div><div><dt>Médecin</dt><dd>{facture.medecin || '—'}</dd></div><div><dt>Échéance patient</dt><dd>{jourLong(facture.echeance)}</dd></div></dl>
  <h3>Détail</h3>
  <ul>{#each facture.lignes as l, i (i)}<li><span><b>{l.nom}</b><small>{CATEGORIES[l.categorie].libelle}{l.sous ? ` · ${l.sous}` : ''}</small></span><span class="mono">{fcfa(l.montant)}</span></li>{/each}</ul>
  <p class="note">{note}</p>
  {#if facture.statut === 'brouillon'}<div class="act"><button class="p" onclick={valider}>Valider la facture</button><button class="s" onclick={supprimer}>Supprimer le brouillon</button></div>{/if}
</div>

<style>
  .voile { position: fixed; inset: 0; background: rgba(11, 15, 26, 0.4); z-index: 40; }
  .tiroir { position: fixed; top: 0; right: 0; bottom: 0; width: min(100%, 440px); background: var(--carte); z-index: 41; padding: 20px; overflow-y: auto; box-shadow: var(--ombre); display: flex; flex-direction: column; gap: 12px; animation: entre 0.22s; }
  header { display: flex; justify-content: space-between; gap: 10px; } header div { display: flex; flex-direction: column; } header button { width: 44px; height: 44px; font-size: 26px; border-radius: 22px; }
  small { color: var(--muted); font-size: 12.5px; } .st { align-self: flex-start; padding: 3px 12px; border-radius: 99px; font-size: 12.5px; font-weight: 600; } .montant { font-size: 15px; color: var(--muted); } .montant b { font-size: 32px; color: var(--texte); }
  dl div { display: flex; justify-content: space-between; gap: 10px; padding: 9px 0; border-bottom: 1px solid var(--ligne); } dt { color: var(--muted); } dd { font-weight: 600; text-align: right; }
  h3 { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); } ul { list-style: none; } li { display: flex; justify-content: space-between; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--ligne); } li span:first-child { display: flex; flex-direction: column; }
  .note { font-size: 13.5px; color: var(--doux); } .act { display: flex; flex-direction: column; gap: 8px; } .act button { min-height: 48px; border-radius: 14px; font-weight: 650; } .p { background: var(--primaire); color: #fff; } .s { border: 1px solid var(--ligne-forte); color: #b3261e; }
  @keyframes entre { from { transform: translateX(30px); opacity: 0; } }
</style>
