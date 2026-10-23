<script lang="ts">
  import { jourLong, jourDe } from '../../core/dates.ts';
  import { NOM_COLONNE, PIECES, peutRefuser, piecesCompletes } from '../../core/auto.ts';
  import { fcfa } from '../../core/money.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { dossierDe, vehiculeDe } from '../../screens/auto/etat.ts';
  import { LIBELLE_AVANCER, avancer, basculerPiece, refuserDossier } from '../../screens/auto/actions.ts';

  let { id, fermer }: { id: string; fermer: () => void } = $props();
  const d = $derived(dossierDe(id));
  const veh = $derived(vehiculeDe(d?.vehiculeId));
  let fermeur: HTMLButtonElement | undefined = $state();
  $effect(() => { fermeur?.focus(); });
  let confirmeRefus = $state(false);

  const note = $derived.by(() => {
    if (!d) return '';
    if (d.etape === 'nouvelle') return "Nouvelle demande. Passez-la en étude pour réclamer les pièces au client.";
    if (d.etape === 'etude') return piecesCompletes(d.docs) ? 'Dossier complet, vous pouvez accorder le financement.' : "Cochez les pièces à mesure qu'elles arrivent. L'accord se débloque quand le dossier est complet.";
    if (d.etape === 'accordee') return d.signeLe ? 'Financement accordé et contrat signé. À la remise des clés, confirmez la livraison pour être payé par AssureMe.' : 'Financement accordé. Le client doit encore signer le contrat avant la livraison.';
    if (d.etape === 'livree') return `Livraison confirmée le ${d.livreLe ? jourLong(jourDe(new Date(d.livreLe))) : ''}. Paiement reçu de AssureMe.`;
    return d.motifRefus ?? '';
  });
  function avance() {
    if (!d) return; const r = avancer(d.id);
    if ('erreur' in r) montrer(r.erreur, 'danger'); else montrer(r.ok);
  }
  function refuse() {
    if (!d) return; const e = refuserDossier(d.id);
    if (e) montrer(e, 'danger'); else { montrer('Demande refusée'); fermer(); }
  }
</script>

{#if d}
<div class="voile" role="presentation" onclick={fermer}></div>
<div class="tiroir" role="dialog" aria-modal="true" aria-labelledby="t-nom" tabindex="-1" onkeydown={(e) => e.key === 'Escape' && fermer()}>
  <header>
    <div><h2 id="t-nom">{d.client}</h2><p class="muted">{d.vehiculeTitre}</p></div>
    <button bind:this={fermeur} class="x" onclick={fermer} aria-label="Fermer">×</button>
  </header>
  <p class="col">{NOM_COLONNE[d.etape]} <span class="mono">· {d.numero}</span></p>
  <p class="montant"><b class="mono">{fcfa(d.financement)}</b> FCFA <span class="muted">financés</span></p>
  <dl>
    {#if d.score}<div><dt>AssureScore du client</dt><dd class="mono">{d.score}</dd></div>{/if}
    <div><dt>Prix du véhicule</dt><dd class="mono">{fcfa(d.prix)}</dd></div>
    {#if d.apport}<div><dt>Apport du client</dt><dd class="mono">{fcfa(d.apport)}</dd></div>{/if}
    <div><dt>Mensualité · durée</dt><dd class="mono">{fcfa(d.mensualite)} · {d.duree} mois</dd></div>
    {#if veh}<div><dt>Contrôle garage</dt><dd>{veh.controle ? 'Effectué' : 'À faire'}</dd></div>{/if}
    {#if d.rdv}<div><dt>Remise des clés</dt><dd>{d.rdv.label}</dd></div>{/if}
  </dl>

  {#if d.etape === 'etude'}
    <h3>Pièces du dossier</h3>
    <ul class="pieces">
      {#each PIECES as p, i (p)}
        <li><label class:ok={d.docs[i]}><input type="checkbox" checked={d.docs[i]} onchange={() => basculerPiece(d.id, i)} /><span class="coche" aria-hidden="true">{d.docs[i] ? '✓' : ''}</span>{p}</label></li>
      {/each}
    </ul>
  {/if}

  {#if d.signature}
    <h3>Signature du client</h3>
    <div class="sig"><svg viewBox="0 0 350 140" role="img" aria-label="Signature du client"><path d={d.signature} fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" /></svg><small class="muted">{d.signeLe ? `Signé le ${jourLong(jourDe(new Date(d.signeLe)))}` : ''}</small></div>
  {/if}
  <p class="note">{note}</p>

  <div class="actions">
    {#if LIBELLE_AVANCER[d.etape]}<button class="prim" onclick={avance}>{LIBELLE_AVANCER[d.etape]}</button>{/if}
    {#if peutRefuser(d)}
      {#if confirmeRefus}<button class="danger" onclick={refuse}>Confirmer le refus</button><button class="sec" onclick={() => (confirmeRefus = false)}>Garder</button>
      {:else}<button class="danger" onclick={() => (confirmeRefus = true)}>Refuser</button>{/if}
    {/if}
    <button class="sec" onclick={() => montrer(`Appel vers ${d.client} en cours`)}>Appeler le client</button>
  </div>
</div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(15, 20, 34, 0.4); z-index: 30; }
  .tiroir { position: fixed; z-index: 31; top: 0; right: 0; bottom: 0; width: min(100vw, 420px); overflow-y: auto; padding: 22px; display: flex; flex-direction: column; gap: 12px; background: var(--carte); box-shadow: var(--ombre); animation: entre 0.22s ease-out; }
  @keyframes entre { from { transform: translateX(40px); opacity: 0; } }
  header { display: flex; justify-content: space-between; gap: 12px; } h2 { font-size: 20px; } h3 { font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); font-family: var(--mono); margin-top: 6px; }
  .x { width: 44px; height: 44px; border-radius: 22px; font-size: 24px; line-height: 1; border: 1px solid var(--ligne-forte); flex: none; }
  .col { font: 600 11px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--primaire); } .montant { font-size: 15px; } .montant b { font-size: 30px; }
  dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } dt { color: var(--muted); } dd { font-weight: 600; text-align: right; }
  .pieces { list-style: none; display: flex; flex-direction: column; gap: 8px; } .pieces label { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--ligne); cursor: pointer; position: relative; }
  .pieces label.ok { background: #f5f7ff; border-color: #bac6ff; } .pieces input { position: absolute; opacity: 0; inset: 0; width: 100%; height: 100%; cursor: pointer; } .pieces label:has(input:focus-visible) { outline: 2px solid var(--primaire); outline-offset: 2px; }
  .coche { width: 22px; height: 22px; border-radius: 11px; border: 2px solid #cdd2de; display: grid; place-items: center; color: #fff; font-size: 12px; flex: none; } .ok .coche { background: var(--primaire); border-color: var(--primaire); }
  .sig { padding: 8px; border-radius: 12px; background: var(--carte2); } .sig svg { width: 100%; height: auto; color: var(--texte); }
  .note { font-size: 13.5px; color: var(--doux); line-height: 1.45; }
  .actions { display: flex; flex-direction: column; gap: 8px; margin-top: auto; padding-top: 8px; } .actions button { min-height: 48px; border-radius: 12px; font-weight: 650; }
  .prim { background: #0b0f1a; color: #fff; } .sec { border: 1px solid var(--ligne-forte); } .danger { border: 1px solid #d6453d; color: #b3261e; }
</style>
