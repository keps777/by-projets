<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Ligne from '../../ui/Ligne.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Etiquette from '../_services/Etiquette.svelte';
  import Vide from '../_services/Vide.svelte';
  import { horloge } from '../_services/horloge.svelte.ts';
  import { modes, net, type ModeEncaissement } from '../../core/commerce.ts';
  import { motifQr } from '../../core/recu.ts';
  import { NOM_NIVEAU } from '../../core/services.ts';
  import { fcfa } from '../../core/money.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { quand } from '../../core/dates.ts';
  import { encaisser, fermerQr, genererQr, niveau, ouvrirCaisse, synchroniser } from './actions.ts';
  import { appuyer, montantDe, verifierMontant } from './calcul.ts';
  import { etat, type Encaissement } from './etat.ts';

  const e = etat();
  const h = horloge(1000);
  synchroniser();
  const n = $derived(montantDe(e.saisie));
  const liste = $derived(modes(n));
  const touches = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '000', '0', '⌫'];

  let ouverte = $state(false);
  let paye = $state<Encaissement | null>(null);
  let nomCommerce = $state(''); let erreurNom = $state('');
  const secs = $derived(e.qr ? Math.max(0, Math.floor((e.qr.expire - h.t) / 1000)) : 0);
  const horlogeTxt = $derived(secs > 0 ? `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}` : 'Expiré');
  const grille = $derived(e.qr ? motifQr(e.qr.graine) : []);
  const chemin = $derived(grille.flatMap((l, y) => l.map((on, x) => (on ? `M${x} ${y}h1v1h-1z` : ''))).join(''));
  const modeQr = $derived(e.qr ? liste.find((m) => m.id === e.qr!.mode)! : null);

  function choisirMode(m: ModeEncaissement) { e.mode = m; }
  function afficher() {
    const r = genererQr(); if (!r.ok) { montrer(r.erreur, 'danger'); return; }
    paye = null; ouverte = true;
  }
  function regenerer() { const r = genererQr(); if (r.ok) montrer('Nouveau QR généré'); }
  function simuler() {
    const r = encaisser();
    if (!r.ok) { montrer(r.erreur, 'danger'); return; }
    paye = r.encaissement; montrer(`Paiement reçu · ${fcfa(r.encaissement.montant)} FCFA`);
  }
  function nouveau() { e.saisie = ''; paye = null; ouverte = false; }
  $effect(() => { if (!ouverte && e.qr) fermerQr(); });
  function ouvrir() { const r = ouvrirCaisse(nomCommerce); if (!r.ok) erreurNom = r.erreur; }
  const recentes = $derived(e.encaissements.slice(0, 4));
</script>

<Ecran titre="Encaisser" sur={e.nom ? `${e.nom} · AssureMe Business` : 'AssureMe Business'}>
  {#snippet droite()}<Pastille ton="primaire">{NOM_NIVEAU[niveau()]}</Pastille>{/snippet}

  {#if !e.nom}
    <Vide icone="commerce" titre="Ouvrez votre caisse AssureMe" texte="Encaissez vos clients par QR, payez-vous le jour même et débloquez des avances de stock.">
      <Champ bind:valeur={nomCommerce} etiquette="Nom de votre commerce" placeholder="Pharmacie, boutique, atelier…" erreur={erreurNom} />
      <Bouton onclick={ouvrir}>Ouvrir la caisse</Bouton>
    </Vide>
  {:else}
    <section class="montant" aria-labelledby="mt">
      <Etiquette id="mt">Montant à encaisser</Etiquette>
      <output class="mono grand" class:vide={n === 0} aria-live="polite">{n ? fcfa(n) : '0'}</output><span class="mono muted">FCFA</span>
      <div class="recu"><span>Vous recevez aujourd'hui</span><b class="mono">{fcfa(net(n))} · frais 1 %</b></div>
    </section>

    <div class="clavier" role="group" aria-label="Clavier du montant">
      {#each touches as t (t)}
        <button type="button" class:eff={t === '⌫'} class:tr={t === '000'} aria-label={t === '⌫' ? 'Effacer' : `Touche ${t}`} onclick={() => (e.saisie = appuyer(e.saisie, t))}>{t}</button>
      {/each}
    </div>

    <section class="bloc" aria-labelledby="ch">
      <div class="entete"><Etiquette id="ch">Le client choisit</Etiquette><small class="bon mono">VOUS ÊTES PAYÉ LE JOUR MÊME</small></div>
      <div class="modes" role="radiogroup" aria-label="Mode de paiement du client">
        {#each liste as m (m.id)}
          <button type="button" role="radio" aria-checked={e.mode === m.id} class:on={e.mode === m.id} onclick={() => choisirMode(m.id)}>
            <small class="mono">{m.court}</small>
            <b class="mono">{n ? `${fcfa(m.valeur)}${m.fois > 1 ? ` ×${m.fois}` : ''}` : '—'}</b>
          </button>
        {/each}
      </div>
      <p class="muted petit">{liste.find((m) => m.id === e.mode)?.titre}{e.mode === 'salaire' ? ' · retenu par l\'employeur sur 6 mois' : e.mode === 'trois' ? ' · une mensualité par mois' : ''}</p>
    </section>

    {#if recentes.length}
      <section class="bloc" aria-labelledby="rv">
        <Etiquette id="rv">Dernières ventes AssureMe</Etiquette>
        {#each recentes as v (v.id)}
          <Ligne ini="EN" titre={`Client ${v.code}`} sous={`${quand(v.ts, maintenant())}${v.retenue ? ` · ${fcfa(v.retenue)} retenus (stock)` : ''}`} valeur={`+${fcfa(v.net - v.retenue)}`} ton="bon" />
        {/each}
      </section>
    {/if}
  {/if}

  {#snippet pied()}
    {#if e.nom}
      <div class="pied">
        <Bouton variante="secondaire" href="/commerce/stock" plein={false}>Stock et tréso</Bouton>
        {#if n > 0 && !verifierMontant(n)}<Bouton onclick={afficher}><Icone nom="scan" taille={18} />Afficher le QR</Bouton>
        {:else}<Bouton desactive>{n > 0 ? verifierMontant(n) : 'Entrez un montant'}</Bouton>{/if}
      </div>
    {/if}
  {/snippet}
</Ecran>

<Feuille bind:ouverte titre={paye ? 'Encaissé' : 'Paiement du client'}>
  {#if paye}
    <div class="ok" role="status">
      <span class="coche"><Icone nom="ok" taille={28} trait={3} /></span>
      <b class="mono grand2">{fcfa(paye.montant)} FCFA</b>
      <p>{liste.find((m) => m.id === paye!.mode)?.titre} · {fcfa(paye.net - paye.retenue)} versés sur votre compte AssureMe maintenant.</p>
      {#if paye.retenue}<p class="muted petit">Dont {fcfa(paye.retenue)} retenus pour rembourser votre avance de stock.</p>{/if}
      <Bouton onclick={nouveau}>Nouvel encaissement</Bouton>
    </div>
  {:else if e.qr}
    <div class="qr">
      <small class="mono muted">LE CLIENT SCANNE · {modeQr?.court}</small>
      <b class="mono grand2">{fcfa(e.qr.montant)} FCFA</b>
      <span class="chrono mono" class:fin={secs === 0} role="timer" aria-label="Temps restant">{horlogeTxt}</span>
      <svg viewBox="-1 -1 23 23" role="img" aria-label={`QR de paiement de ${fcfa(e.qr.montant)} FCFA`} style:opacity={secs > 0 ? 1 : 0.15} shape-rendering="crispEdges"><rect x="-1" y="-1" width="23" height="23" fill="#fff" /><path d={chemin} fill="#07090f" /></svg>
      <p class="code">Ou code client : <b class="mono">{e.qr.code}</b></p>
      <p class="muted petit">{secs > 0 ? 'Le client ouvre AssureMe ou son Pass et scanne, ou saisit le code. Valable 5 minutes.' : 'Ce QR a expiré. Générez-en un nouveau.'}</p>
      <div class="duo">
        <Bouton variante="secondaire" onclick={regenerer}>Nouveau QR</Bouton>
        <Bouton onclick={simuler} desactive={secs === 0}>Simuler le client</Bouton>
      </div>
    </div>
  {/if}
</Feuille>

<style>
  .montant { display: flex; flex-direction: column; align-items: center; gap: 4px; padding: 6px 0; text-align: center; }
  .grand { font-size: 52px; font-weight: 500; letter-spacing: -0.03em; line-height: 1.05; } .vide { color: var(--faint); }
  .recu { display: flex; gap: 8px; align-items: baseline; margin-top: 6px; font-size: 13px; color: var(--muted); flex-wrap: wrap; justify-content: center; } .recu b { color: var(--bon); font-weight: 500; }
  .clavier { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .clavier button { min-height: 56px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); font: 500 22px var(--mono); }
  .clavier button:active { background: var(--carte2); } .eff { color: var(--alerte); } .tr { background: var(--carte2); font-size: 18px; }
  .bloc { display: flex; flex-direction: column; gap: 8px; } .entete { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; flex-wrap: wrap; }
  .bon { color: var(--bon); font-size: 10px; letter-spacing: 0.08em; }
  .modes { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .modes button { min-height: 62px; border-radius: 16px; background: var(--carte2); border: 1px solid var(--ligne); display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 3px; padding: 6px; }
  .modes button.on { background: var(--primaire-fond); border-color: var(--primaire); } .modes small { font-size: 10px; letter-spacing: 0.08em; color: var(--muted); } .modes b { font-size: 13px; font-weight: 500; }
  .petit { font-size: 12.5px; } .pied { display: flex; gap: 10px; } .pied :global(a) { flex: none; } .pied :global(button) { flex: 1; }
  .qr, .ok { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; }
  .grand2 { font-size: 30px; font-weight: 500; } .chrono { padding: 4px 12px; border-radius: 99px; background: var(--primaire-fond); color: var(--pale); font-size: 13px; } .chrono.fin { background: rgba(255, 114, 114, 0.18); color: var(--danger); }
  svg { width: 220px; height: 220px; border-radius: 14px; background: #fff; } .code { font-size: 14px; } .duo { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; }
  .coche { width: 64px; height: 64px; border-radius: 32px; background: var(--bon); color: #07090f; display: grid; place-items: center; }
</style>
