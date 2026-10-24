<script lang="ts">
  import './guichet.css';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { caisseOuverte, ligneDe } from '../../domain/actions.ts';
  import { fcfa } from '../../core/money.ts';
  import { formaterCode, formaterTel, libelleErreur } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Lecture from './Lecture.svelte';
  import { dockAgent } from './dock.ts';
  import { contexte, lireBillet, rembourserAuGuichet } from './actions.ts';

  const ctx = $derived(contexte()), agent = $derived(ctx.agent);
  const caisse = $derived(agent ? caisseOuverte(agent.id) : undefined);
  let saisie = $state(''), cherche = $state(''), erreur = $state(''), fait = $state<{ rembourse: number; frais: number; especes: boolean } | null>(null);
  const lu = $derived(cherche.trim() ? lireBillet(cherche) : null);
  const statutTexte: Record<string, string> = { valide: 'valide', scanne: 'déjà utilisé (scanné)', annule: 'annulé', rembourse: 'remboursé', expire: 'expiré', attente_paiement: 'paiement en attente' };
  function chercher(e: Event) { e.preventDefault(); cherche = saisie; erreur = ''; fait = null; }
  function rembourser() {
    if (!agent || !lu || ctx.lecture) return; erreur = '';
    try { fait = rembourserAuGuichet(agent.id, lu.billet.id); montrer(fait.especes ? `${fcfa(fait.rembourse)} F rendus en espèces` : `${fcfa(fait.rembourse)} F renvoyés sur le compte`); }
    catch (e) { erreur = e instanceof Error && !/^[a-z_]+$/.test(e.message) ? e.message : libelleErreur(e); }
  }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const peut = $derived(!!lu && (lu.billet.statut === 'valide' ? lu.apercu.possible : lu.dejaAccorde));
</script>

<Mobile titre="Rembourser un billet" sous="déduit de la caisse si payé en espèces" retourVers="/guichet" dock={dockAgent()}>
  {#if ctx.lecture}<Lecture {agent} />{/if}
  <form class="row g8" onsubmit={chercher}>
    <label class="fld grow"><span class="lab">Code du billet</span><input class="inp" bind:value={saisie} placeholder="AM-7F3K-22" autocapitalize="characters" autocomplete="off" spellcheck="false" /></label>
    <button type="submit" class="b p" style="flex: none; width: auto; align-self: flex-end">Chercher</button>
  </form>

  {#if fait}
    <div class="gl ac col g8" role="status"><span class="pl ok">remboursé</span><span class="ttl t20">{fcfa(fait.rembourse)} F</span>
      <span class="t14">{fait.especes ? 'À rendre en espèces au passager : la somme est déduite de ta caisse.' : 'Renvoyés sur le compte MoMo / OM du passager.'}{fait.frais ? ` Frais d’annulation retenus : ${fcfa(fait.frais)} F.` : ''}</span></div>
    <button type="button" class="b p" onclick={() => { fait = null; cherche = saisie = ''; }}>Autre remboursement</button>
  {:else if cherche.trim() && !lu}
    <div class="gl col g4" role="alert"><span class="pl er">introuvable</span><span class="t14">Aucun billet avec ce code. Vérifie les caractères (pas de 0, O, 1, I).</span></div>
  {:else if lu}
    {@const b = lu.billet}
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow mut t13">Billet</span><b class="mono">{formaterCode(b.code)}</b></div>
      <div class="li"><span class="grow mut t13">Trajet</span><b>{ligneDe(lu.depart).de} → {ligneDe(lu.depart).vers} · {lu.depart.heure}{ligneDe(lu.depart).classe === 'VIP' ? ' VIP' : ''}</b></div>
      <div class="li"><span class="grow mut t13">Passager</span><b>{b.passager.nom}{b.passager.tel ? ` · ${formaterTel(b.passager.tel)}` : ''}</b></div>
      <div class="li"><span class="grow mut t13">Payé</span><b>{fcfa(b.prix)} F · {lu.moyen === 'especes' ? 'espèces' : lu.moyen === 'om' ? 'Orange Money' : lu.moyen === 'momo' ? 'MoMo' : (lu.moyen ?? '')}</b></div>
      <div class="li"><span class="grow mut t13">État</span><span class="pl {b.statut === 'valide' ? 'ok' : 'wa'}">{statutTexte[b.statut] ?? b.statut}</span></div>
    </div>
    {#if b.statut === 'valide'}
      <div class="gl col g4" class:ac={lu.apercu.possible}>
        <span class="t14 b7">{lu.apercu.possible ? `Rendre ${fcfa(lu.apercu.rembourse)} F` : 'Remboursement impossible'}</span>
        <span class="t13 mut">{lu.apercu.raison}{lu.apercu.possible ? ` (${fcfa(lu.apercu.frais)} F retenus)` : ''}</span>
      </div>
    {:else if lu.dejaAccorde}
      <div class="gl ac col g4"><span class="t14 b7">Rendre {fcfa(b.prix)} F en espèces</span><span class="t13 mut">Remboursement intégral déjà accordé (départ annulé par la compagnie) : il reste à le payer au guichet.</span></div>
    {:else}
      <div class="gl col g4"><span class="t14 b7">Rien à rembourser</span><span class="t13 mut">{b.statut === 'scanne' ? 'Le billet a déjà servi.' : b.statut === 'rembourse' ? 'Ce billet est déjà remboursé.' : 'Ce billet n’est pas remboursable.'}</span></div>
    {/if}
    {#if peut && lu.especes && !caisse && !ctx.lecture}<span class="t13 erc" role="alert">Ouvre ta caisse : la somme rendue en espèces en sort. <a href="/caisse" onclick={(e) => lien(e, '/caisse')}>Ouvrir la caisse</a></span>{/if}
    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    <button type="button" class="b p" disabled={!peut || ctx.lecture || (lu.especes && !caisse)} onclick={rembourser}>{peut ? (lu.especes ? 'Rembourser en espèces' : 'Rembourser sur le compte') : 'Non remboursable'}</button>
  {:else}
    <p class="t13 mut">Tape le code du billet (ou le contenu de son QR) pour voir ce qui peut être remboursé. Un départ annulé est remboursé en entier ; sinon 10 % de frais jusqu’à 2 h avant le départ.</p>
  {/if}
</Mobile>
