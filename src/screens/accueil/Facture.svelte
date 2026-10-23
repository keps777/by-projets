<script lang="ts">
  import { app, maintenant, notifier, totalMensualites } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { heure, jourCourt, jourDe } from '../../core/dates.ts';
  import { MOIS_ETALEMENT, etalementAutorise, pointsFacture } from '../../core/paiement.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Panneau from './Panneau.svelte';
  import { facturesAPayer, factureParId } from './etat.ts';
  import { mensualiteEtalement, plafondSanteRestant, preparerFacture, repartitionFacture, tauxPriseEnCharge } from './actions.ts';

  const f = $derived(factureParId(param('id')) ?? facturesAPayer()[0]);
  const rep = $derived(f ? repartitionFacture(f) : null);
  const taux = $derived(Math.round(tauxPriseEnCharge() * 100));
  let mode = $state<'comptant' | 'etale'>('comptant'), ouvert = $state(-1);
  let tiers = $state(false), signaler = $state(false);
  const sante = $derived(f?.categorie === 'sante');
  const mensualite = $derived(f ? mensualiteEtalement(f) : 0);
  const etalOk = $derived(!!app.compte && !!f && etalementAutorise(totalMensualites(), mensualite, app.compte.salaireNet));
  const manque = $derived(rep ? Math.max(0, rep.patient - app.solde) : 0);
  const aujourdhui = $derived(jourDe(new Date(maintenant())));
  const points = $derived(f ? pointsFacture(f.echeance, aujourdhui) : 0);
  const enRetard = $derived(!!f && aujourdhui > f.echeance);
  const deja = $derived(f && f.statut !== 'a_payer' ? f : undefined);

  function continuer() {
    if (!f || !rep) return;
    if (mode === 'comptant' && manque > 0) { aller(`/?recharger=1&manque=${manque}`); return; }
    preparerFacture(f, mode);
    aller('/pay/confirme');
  }
  function envoyerSignalement() {
    signaler = false;
    notifier({ titre: `Signalement envoyé à ${f?.partenaire ?? 'la clinique'}`, sous: 'Réponse sous 15 min. Rien n\'est débité tant que vous n\'avez pas confirmé.' });
    montrer(`Signalement envoyé à ${f?.partenaire ?? 'la clinique'}`);
  }
  const cta = $derived(!rep ? '' : mode === 'comptant' ? (manque > 0 ? 'Recharger puis payer' : `Confirmer · ${fcfa(rep.patient)} FCFA`) : `Confirmer · ${fcfa(mensualite)} FCFA × ${MOIS_ETALEMENT}`);
</script>

<Ecran titre={f?.partenaire ?? 'Facture'} sur={f ? `FACTURE ${f.emis ? jourCourt(jourDe(new Date(f.emis))).toUpperCase() + ' · ' + heure(f.emis) : ''}` : 'Facture'} retourVers="/pay/scan">
  {#snippet droite()}{#if sante}<button type="button" class="tp" onclick={() => (tiers = true)} aria-label="Qu'est-ce que le tiers payant ?"><Pastille ton="bon">Tiers payant</Pastille></button>{/if}{/snippet}

  {#if !f}
    <div class="vide">
      <Icone nom="document" taille={34} />
      <b>Aucune facture à régler</b>
      <p class="muted">Quand un partenaire vous émet une facture, elle apparaît ici et sur votre accueil. Vous pouvez aussi scanner le QR affiché à sa caisse.</p>
      <Bouton href="/pay/scan">Scanner un QR</Bouton>
    </div>
  {:else if rep}
    {#if deja}
      <div class="deja" role="status"><Icone nom="ok" taille={18} trait={2.2} /> {deja.statut === 'etalee' ? 'Facture réglée, étalée sur salaire.' : 'Facture déjà réglée.'}
        {#if deja.ref}<a href="/pay/recu?ref={deja.ref}" onclick={(e) => { e.preventDefault(); aller(`/pay/recu?ref=${deja.ref}`); }}>Voir le reçu</a>{/if}</div>
    {/if}
    <ul class="lignes">
      {#each f.lignes as l, i (l.nom)}
        {@const r = rep.lignes[i]}
        <li>
          <button type="button" class="l" aria-expanded={ouvert === i} onclick={() => (ouvert = ouvert === i ? -1 : i)}>
            <span class="tx"><b>{l.nom}</b><small>{l.sous}</small></span><span class="mono">{fcfa(l.montant)}</span>
          </button>
          {#if ouvert === i}
            <div class="det">
              {#if sante}<div><span>AssureMe ({taux} %)</span><b class="mono">{fcfa(r.assureMe)}</b></div><div><span>Votre part ({100 - taux} %)</span><b class="mono">{fcfa(r.patient)}</b></div>{/if}
              {#if l.note}<p class="muted">{l.note}</p>{/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
    <section class="total" aria-label="Total">
      <div><span>Total facture</span><b class="mono">{fcfa(rep.total)}</b></div>
      {#if sante}<div><span>AssureMe paie la clinique · {taux} %</span><b class="mono">{fcfa(rep.assureMe)}</b></div>{/if}
      <div class="part"><span>Votre part</span><b class="mono">{fcfa(rep.patient)}</b></div>
      {#if rep.plafondDepasse}<p class="alerte">Le plafond santé annuel est atteint : une partie de la facture reste à votre charge ({fcfa(plafondSanteRestant())} de plafond restant).</p>{/if}
    </section>

    {#if !deja}
      <h2 class="mono sous">VOTRE PART, COMMENT ?</h2>
      <div class="modes" role="radiogroup" aria-label="Mode de règlement">
        <button type="button" role="radio" aria-checked={mode === 'comptant'} class="mode" class:on={mode === 'comptant'} onclick={() => (mode = 'comptant')}>
          <span class="rad"></span><span class="tx"><b>Payer maintenant</b><small>Depuis votre solde de {fcfa(app.solde)}</small></span><span class="mono">{fcfa(rep.patient)}</span>
        </button>
        <button type="button" role="radio" aria-checked={mode === 'etale'} class="mode" class:on={mode === 'etale'} disabled={!etalOk} onclick={() => (mode = 'etale')}>
          <span class="rad"></span><span class="tx"><b>Étaler sur {MOIS_ETALEMENT} mois</b><small>{etalOk ? 'Sur salaire · frais 1,5 % par mois' : 'Indisponible : dépasserait 33 % de votre salaire'}</small></span><span class="mono">{fcfa(mensualite)} / mois</span>
        </button>
      </div>
      {#if mode === 'comptant' && manque > 0}<p class="alerte" role="alert">Solde insuffisant : il vous manque {fcfa(manque)} FCFA. Rechargez pour régler maintenant, ou étalez sur salaire.</p>{/if}
      {#if mode === 'comptant'}
        <p class="muted pts">{points ? `+${points} pts AssureScore en payant avant le ${jourCourt(f.echeance)}` : enRetard ? `Échéance du ${jourCourt(f.echeance)} dépassée : pas de points, mais payez dès que possible.` : ''}</p>
      {:else}<p class="muted pts">Total remboursé : {fcfa(mensualite * MOIS_ETALEMENT)} FCFA. La clinique est réglée tout de suite ; les mensualités sont prélevées le {app.compte?.jourPaie ?? 28} de chaque mois.</p>{/if}
      <button type="button" class="signal" onclick={() => (signaler = true)}><span>Une erreur sur la facture ?</span><b>Signaler</b></button>
    {/if}
  {/if}

  {#snippet pied()}
    {#if f && rep && !deja}<Bouton onclick={continuer}><Icone nom="verrou" taille={18} />{cta}</Bouton>{/if}
  {/snippet}
</Ecran>

<Panneau bind:ouverte={tiers} titre="Tiers payant">
  <p>AssureMe paie directement la clinique. Vous ne réglez que votre part, sans avancer le reste.</p>
  <div class="kv"><span>Pris en charge</span><b>{taux} %</b></div>
  <div class="kv"><span>Plafond restant</span><b class="mono">{fcfa(plafondSanteRestant())}</b></div>
  <div class="kv"><span>Réseau</span><b>Partenaire</b></div>
  <Bouton onclick={() => (tiers = false)}>Compris</Bouton>
</Panneau>
<Panneau bind:ouverte={signaler} titre="Signaler une erreur">
  <p>La clinique est prévenue et corrige la facture avant tout paiement. Rien n'est débité tant que vous n'avez pas confirmé.</p>
  <div class="kv"><span>Réponse</span><b>sous 15 min</b></div>
  <div class="pied"><Bouton variante="secondaire" onclick={() => (signaler = false)}>Fermer</Bouton><Bouton onclick={envoyerSignalement}>Envoyer le signalement</Bouton></div>
</Panneau>

<style>
  .mono { white-space: nowrap; }
  .tp { min-height: 44px; display: grid; place-items: center; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 40px 10px; color: var(--muted); } .vide b { color: var(--texte); font-size: 17px; } .vide :global(.b) { margin-top: 8px; }
  .deja { display: flex; align-items: center; gap: 8px; padding: 12px 14px; border-radius: 14px; background: rgba(61, 213, 152, 0.12); border: 1px solid rgba(61, 213, 152, 0.4); color: var(--bon); font-size: 14px; flex-wrap: wrap; } .deja a { margin-left: auto; font-weight: 600; text-decoration: underline; padding: 8px 0; }
  .lignes { list-style: none; background: var(--carte); border: 1px solid var(--ligne); border-radius: 20px; padding: 4px 14px; } .lignes li + li { border-top: 1px solid var(--ligne); }
  .l { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 60px; text-align: left; } .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; } .tx b { font-size: 14.5px; font-weight: 600; } .tx small { color: var(--muted); font-size: 12.5px; }
  .det { padding: 0 0 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; } .det div { display: flex; justify-content: space-between; color: var(--doux); } .det p { font-size: 12.5px; }
  .total { background: var(--carte); border: 1px solid var(--ligne); border-radius: 20px; padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; } .total div { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; color: var(--doux); font-size: 14px; }
  .part { color: var(--texte) !important; font-size: 16px !important; font-weight: 650; padding-top: 8px; border-top: 1px solid var(--ligne); } .part b { font-size: 22px; }
  .sous { font-size: 11px; letter-spacing: 0.12em; color: var(--muted); font-weight: 500; }
  .modes { display: flex; flex-direction: column; gap: 8px; }
  .mode { display: flex; align-items: center; gap: 12px; padding: 14px; min-height: 64px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); text-align: left; } .mode.on { background: var(--primaire-fond); border-color: var(--primaire); } .mode:disabled { opacity: 0.5; }
  .rad { width: 20px; height: 20px; border-radius: 10px; border: 2px solid var(--ligne-forte); flex: none; } .on .rad { border-color: var(--primaire); background: radial-gradient(var(--primaire) 45%, transparent 50%); }
  .alerte { color: var(--danger); font-size: 13.5px; } .pts { font-size: 13px; }
  .signal { display: flex; justify-content: space-between; align-items: center; min-height: 52px; padding: 0 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); font-size: 14px; } .signal b { color: var(--primaire-clair); }
  .kv { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--ligne); font-size: 14.5px; } .kv span { color: var(--muted); }
  .pied { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
</style>
