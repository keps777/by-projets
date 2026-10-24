<script lang="ts">
  import './guichet.css';
  import { onMount, tick } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { billetParId, compagnieDe, departEnMs, heureLocale, ligneDe, personne } from '../../domain/actions.ts';
  import { contenuQr } from '../../core/sceau.ts';
  import { fcfa } from '../../core/money.ts';
  import { formaterCode, formaterTel } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Qr from '../../ui/Qr.svelte';
  import { dockAgent } from './dock.ts';
  import { compterImpression, contexte } from './actions.ts';
  import { etat } from './etat.ts';

  const id = param('billet') ?? '';
  const billet = $derived(billetParId(id));
  const paiement = $derived(billet ? app.monde.paiements.find((p) => p.id === billet.paiementId) : undefined);
  const billets = $derived(billet ? app.monde.billets.filter((b) => b.paiementId === billet.paiementId) : []);
  const depart = $derived(billet ? app.monde.departs.find((d) => d.id === billet.departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const agent = $derived(personne(billet?.acheteurId) ?? contexte().agent);
  const gareNom = $derived(app.monde.gares.find((g) => g.id === ligne?.gareDe)?.nom ?? '');
  const copies = $derived(paiement ? (etat().copies[paiement.id] ?? 0) : 0);
  const recu = $derived(paiement ? etat().recus[paiement.id] : undefined);
  const total = $derived(billets.reduce((s, b) => s + b.prix, 0));
  const jj = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${heureLocale(ms)}`; };
  const moyenNom = $derived(paiement?.moyen === 'especes' ? 'espèces' : paiement?.moyen === 'om' ? 'Orange Money' : paiement?.moyen === 'momo' ? 'MoMo' : (paiement?.moyen ?? ''));
  const tel = $derived(billets[0]?.passager.tel ?? '');

  function imprimer() { if (!paiement) return; compterImpression(paiement.id); if (typeof window.print === 'function') window.print(); }
  function sms() { montrer(tel ? `SMS renvoyé au ${formaterTel(tel)}` : 'Aucun numéro : remets le ticket papier', tel ? 'ok' : 'wa'); }
  onMount(async () => { if (param('imprimer') === '1' && paiement && !etat().copies[paiement.id]) { await tick(); imprimer(); } });
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile titre="Ticket imprimé" retourVers="/vente" dock={dockAgent()}>
  {#snippet droite()}{#if billet}<span class="pl {copies > 1 ? 'wa' : 'ok'}">{copies > 1 ? `copie ${copies}` : 'imprimé'}</span>{/if}{/snippet}
  {#if !billet || !depart || !ligne}
    <div class="gl col g8" role="alert"><span class="t16 b7">Billet introuvable</span><p class="t13 mut">Ce ticket n’existe plus ou le lien est incomplet.</p><a class="b p" href="/vente" onclick={(e) => lien(e, '/vente')}>Retour à la vente</a></div>
  {:else if billet.statut === 'attente_paiement'}
    <div class="gl col g8"><span class="pl inf">paiement en attente</span><p class="t13 mut">Le ticket s’imprime quand le passager a validé le paiement.</p><a class="b p" href="/vente?paiement={billet.paiementId}" onclick={(e) => lien(e, `/vente?paiement=${billet.paiementId}`)}>Voir la demande de paiement</a></div>
  {:else}
    <div class="g-papier a-imprimer" aria-label="Ticket, rendu thermique 58 mm">
      {#each billets as b, i (b.id)}
        <article class="g-rcpt">
          <h3>{compagnieDe(depart).nom.toUpperCase()} · AFRIMOVE</h3>
          <div class="c">Gare de {gareNom} · guichet</div><div class="c">{jj(b.creeLe)}</div><hr />
          {#if b.statut === 'annule' || b.statut === 'rembourse'}<div class="annule">BILLET ANNULÉ</div>{/if}
          <div class="l"><span>Agent</span><b>{agent ? `${agent.prenom} ${agent.nom[0]}.` : ''}</b></div>
          <div class="code">{formaterCode(b.code)}</div>
          <div class="l"><span>{ligne.de} → {ligne.vers}</span><b>{departEnMs(depart) !== new Date(`${depart.jour}T${depart.heure}:00`).getTime() ? `${heureLocale(departEnMs(depart))}*` : depart.heure}</b></div>
          <div class="l"><span>Jour</span><b>{depart.jour.split('-').reverse().slice(0, 2).join('/')}</b></div>
          <div class="l"><span>Place</span><b>{b.siege ?? 'libre'} · {ligne.classe}</b></div>
          <div class="l"><span>Passager</span><b>{b.passager.nom}{b.passager.tel ? ` · ${formaterTel(b.passager.tel)}` : ''}</b></div><hr />
          <div class="l"><span>Payé {moyenNom}</span><b>{fcfa(b.prix)} F</b></div>
          {#if i === 0 && recu && paiement?.moyen === 'especes'}<div class="l"><span>Reçu {fcfa(recu.recu)} F</span><b>rendu {fcfa(recu.rendu)} F</b></div>{#if billets.length > 1}<div class="l"><span>Total {billets.length} billets</span><b>{fcfa(total)} F</b></div>{/if}{/if}
          <div class="qr"><Qr texte={contenuQr(b.code, b.sceau)} taille={132} libelle="QR du billet {formaterCode(b.code)}" /></div>
          {#if depart.retardMin > 0}<div class="petit">* retard de {depart.retardMin} min annoncé</div>{/if}
          <div class="petit">Valable sans internet · *123# → 3 pour vérifier</div>
        </article>
      {/each}
    </div>
    <p class="t13 mut g-note" role="status">{tel ? `SMS envoyé au ${formaterTel(tel)} · le billet holographique est aussi dans son app.` : 'Pas de numéro : remets le ticket papier au passager.'}</p>
    <button type="button" class="b s" onclick={imprimer}>{copies ? 'Réimprimer' : 'Imprimer'}</button>
    <div class="row g8"><button type="button" class="b s" onclick={sms}>Renvoyer le SMS</button><a class="b p" href="/vente" onclick={(e) => lien(e, '/vente')}>Vente suivante</a></div>
    <a class="b g" href="/guichet" onclick={(e) => lien(e, '/guichet')}>Retour au guichet</a>
  {/if}
</Mobile>
