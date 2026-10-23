<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller, param, retour } from '../../router.svelte.ts';
  import { apresEchec, apresSucces, essaisRestants, estVerrouille, secondesAvantDeverrou, verifierHash } from '../../core/auth.ts';
  import { fcfa } from '../../core/money.ts';
  import { dateRecu } from '../../core/recu-paiement.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import PaveCode from './PaveCode.svelte';
  import Pict from './Pict.svelte';
  import { lirePaiements } from './etat.ts';
  import { executerPaiement, noterRecu, recuParRef, type RefusPaiement } from './actions.ts';

  const ref = $derived(param('ref'));
  const recu = $derived(recuParRef(ref));
  const b = $derived(lirePaiements().enCours);
  let erreur = $state(''), occupe = $state(false), cle = $state(0), refus = $state<{ raison: RefusPaiement; message: string; manque?: number } | null>(null), bio = $state(false);
  const verrou = $derived(app.auth.verrou);
  const bloque = $derived(estVerrouille(verrou, maintenant()));

  // Sans paiement préparé ni reçu à afficher, rien à faire ici.
  $effect(() => { if (!recu && !b && !refus) aller('/', { remplacer: true }); });

  function finir() {
    const r = executerPaiement();
    if (!r.ok) { refus = { raison: r.raison, message: r.message, manque: r.manque }; return; }
    aller(`/pay/confirme?ref=${r.recu.ref}`, { remplacer: true });
  }
  async function saisi(code: string) {
    if (occupe) return;
    occupe = true; erreur = '';
    try {
      const { hash, sel } = app.auth;
      // Un compte sans code enregistré (démo brute) ne peut rien vérifier : le geste de confirmation suffit.
      const bon = hash && sel ? await verifierHash(code, sel, hash) : true;
      if (bon) { app.auth.verrou = apresSucces(); finir(); }
      else {
        app.auth.verrou = apresEchec(app.auth.verrou, maintenant());
        const n = essaisRestants(app.auth.verrou);
        erreur = estVerrouille(app.auth.verrou, maintenant()) ? 'Trop d’essais. Paiement bloqué 15 minutes.' : `Code incorrect. ${n} essai${n > 1 ? 's' : ''} restant${n > 1 ? 's' : ''}.`;
        cle++;
      }
    } finally { occupe = false; }
  }
  function biometrie() {
    if (occupe) return;
    occupe = true; bio = true; erreur = '';
    setTimeout(() => { bio = false; occupe = false; finir(); }, 800);
  }

  // ------------------------------------------------------------ succès
  const MESSAGES = ['', 'Merci, nous allons nous améliorer', 'Merci pour votre avis', 'Merci pour votre avis', 'Merci, bon rétablissement', 'Merci, 5 étoiles transmises'];
  function noter(n: number) { if (recu) { noterRecu(recu.ref, n); montrer(MESSAGES[n]); } }
  async function copier() {
    try { await navigator.clipboard.writeText(recu!.ref); montrer(`Référence ${recu!.ref} copiée`); } catch { montrer('Copie impossible', 'danger'); }
  }
  const titre = $derived(!recu ? '' : recu.mode === 'envoi' ? `Envoyé à ${recu.partenaire}.` : recu.categorie === 'sante' && recu.mode !== 'libre' ? 'Payé. La clinique est réglée.' : `Payé. ${recu.partenaire} est réglé.`);
  const mensualiteTxt = $derived(recu?.mode === 'etale' ? `${fcfa(recu.mensualite ?? 0)} / mois × ${recu.mois}` : '');
</script>

{#if recu}
  <main class="ok">
    <a class="fermer" href="/" aria-label="Fermer" onclick={(e) => { e.preventDefault(); aller('/'); }}><Icone nom="fermer" taille={18} trait={2.2} /></a>
    <div class="coche" aria-hidden="true"><Icone nom="ok" taille={40} trait={2.6} /></div>
    <h1>{recu.mode === 'etale' ? 'Facture réglée, étalée sur salaire.' : titre}</h1>
    <p class="muted">{recu.mode === 'etale' ? `${recu.partenaire} est réglée. Vous remboursez ${mensualiteTxt} sur votre salaire, sans rien avancer.` : recu.categorie === 'sante' && recu.mode === 'comptant' ? 'Vous pouvez passer en consultation. Rien à présenter à la caisse.' : 'Le reçu est disponible ci-dessous.'}</p>

    <section class="flux" aria-label="Détail du paiement">
      {#if recu.priseEnCharge > 0}<div><span>AssureMe → {recu.partenaire}</span><b class="mono">{fcfa(recu.priseEnCharge)}</b></div>{/if}
      <div><span>{recu.mode === 'etale' ? `Vous → ${recu.partenaire}, sur salaire` : recu.mode === 'envoi' ? `Vous → ${recu.partenaire}` : `Vous → ${recu.partenaire}, depuis le solde`}</span><b class="mono">{fcfa(recu.paye)}</b></div>
      <div class="solde"><span>Nouveau solde</span><b class="mono">{fcfa(recu.soldeApres)} <small>FCFA</small></b></div>
    </section>

    {#if recu.points > 0}
      <a class="score" href="/score" onclick={(e) => { e.preventDefault(); aller('/score'); }}><span>AssureScore</span><b class="mono">+{recu.points} · {recu.scoreApres}</b><Icone nom="suivant" taille={16} /></a>
    {/if}
    <button type="button" class="ref mono" onclick={copier}><span>RÉF. {recu.ref} · {dateRecu(recu.ts)}</span><b>COPIER</b></button>

    {#if recu.categorie === 'sante' && recu.mode !== 'envoi'}
      <section class="note" aria-label="Noter l'accueil">
        <p class="muted">{recu.note ? 'Merci pour votre note' : "Comment était l'accueil ?"}</p>
        <div role="group" aria-label="Note de 1 à 5">
          {#each [1, 2, 3, 4, 5] as n (n)}<button type="button" aria-label="{n} étoile{n > 1 ? 's' : ''}" aria-pressed={n <= recu.note} class:on={n <= recu.note} onclick={() => noter(n)}><Pict nom="etoile" taille={28} plein={n <= recu.note} /></button>{/each}
        </div>
      </section>
    {/if}
    <div class="boutons">
      <Bouton href="/pay/recu?ref={recu.ref}">Voir le reçu</Bouton>
      <Bouton href="/" variante="secondaire">Retour à l'accueil</Bouton>
    </div>
  </main>
{:else if refus}
  <main class="ok">
    <div class="coche ko" aria-hidden="true"><Icone nom="attention" taille={38} trait={2.2} /></div>
    <h1>{refus.raison === 'solde' ? 'Solde insuffisant' : 'Paiement non effectué'}</h1>
    <p class="muted" role="alert">{refus.message} Rien n'a été débité.</p>
    <div class="boutons">
      {#if refus.raison === 'solde'}<Bouton href="/?recharger=1&manque={refus.manque ?? 0}">Recharger mon solde</Bouton>{/if}
      <Bouton variante="secondaire" onclick={() => { refus = null; retour('/pay/scan'); }}>Revenir en arrière</Bouton>
    </div>
  </main>
{:else if b}
  <main class="conf">
    <header><button type="button" class="rond" onclick={() => retour('/pay/facture')} aria-label="Retour"><Icone nom="retour" taille={18} trait={2.2} /></button><h1>Confirmer le paiement</h1><span></span></header>
    <section class="recap" aria-label="Récapitulatif">
      <span class="ini">{b.ini}</span>
      <div><b>{b.partenaire}</b><small>{b.type === 'envoi' ? 'Envoi entre membres' : b.mode === 'etale' ? `Étalé sur 3 mois` : 'Depuis votre solde'}</small></div>
      <b class="mono montant">{b.mode === 'etale' ? 'Sur salaire' : fcfa(b.montant)}</b>
    </section>
    {#if bloque}
      <p class="bloque" role="alert">Trop d’essais. Réessayez dans {Math.ceil(secondesAvantDeverrou(verrou, maintenant()) / 60)} min.</p>
    {:else}
      <h2>Entrez votre code à 6 chiffres</h2>
      <PaveCode onsaisi={saisi} {erreur} desactive={occupe} {cle} />
      {#if app.auth.biometrie}
        <button type="button" class="bio" onclick={biometrie} disabled={occupe}><Pict nom="face" taille={22} />{bio ? 'Vérification…' : 'Confirmer avec Face ID'}</button>
      {/if}
    {/if}
    <p class="muted pied">Rien n'est débité avant votre confirmation.</p>
  </main>
{/if}

<style>
  .mono { white-space: nowrap; }
  main { min-height: 100dvh; padding: calc(env(safe-area-inset-top) + 16px) 20px 28px; display: flex; flex-direction: column; gap: 14px; }
  .ok { align-items: center; text-align: center; padding-top: 70px; position: relative; } .ok h1 { font-size: 24px; letter-spacing: -0.02em; } .ok .muted { font-size: 14.5px; max-width: 320px; }
  .fermer { position: absolute; top: calc(env(safe-area-inset-top) + 12px); left: 16px; width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; }
  .coche { width: 84px; height: 84px; border-radius: 42px; background: rgba(61, 213, 152, 0.14); border: 2px solid var(--bon); color: var(--bon); display: grid; place-items: center; box-shadow: 0 0 60px -10px var(--bon); } .coche.ko { background: rgba(255, 114, 114, 0.12); border-color: var(--danger); color: var(--danger); box-shadow: none; }
  .flux { width: 100%; background: var(--carte); border: 1px solid var(--ligne); border-radius: 20px; padding: 6px 16px; text-align: left; } .flux div { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding: 12px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; color: var(--doux); } .flux div:last-child { border: 0; }
  .flux .solde { color: var(--texte); } .flux .solde b { font-size: 24px; } .flux small { font-size: 12px; color: var(--muted); }
  .score { width: 100%; display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 0 16px; border-radius: 16px; background: var(--primaire-fond); border: 1px solid var(--primaire); } .score span { flex: 1; text-align: left; font-weight: 600; } .score b { color: var(--bon); }
  .ref { width: 100%; min-height: 48px; display: flex; justify-content: space-between; align-items: center; gap: 8px; padding: 0 14px; border-radius: 12px; background: var(--carte); border: 1px dashed var(--ligne-forte); font-size: 10.5px; letter-spacing: 0.05em; color: var(--muted); text-align: left; } .ref b { color: var(--primaire-clair); }
  .note div { display: flex; justify-content: center; gap: 2px; } .note button { width: 44px; height: 44px; display: grid; place-items: center; color: #3a4566; } .note button.on { color: var(--alerte); }
  .boutons { width: 100%; display: flex; flex-direction: column; gap: 10px; margin-top: 4px; }
  .conf header { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; } .conf h1 { text-align: center; font-size: 17px; font-weight: 650; }
  .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; }
  .recap { display: flex; align-items: center; gap: 12px; padding: 14px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); } .recap div { flex: 1; display: flex; flex-direction: column; } .recap small { color: var(--muted); font-size: 12.5px; }
  .ini { width: 42px; height: 42px; border-radius: 12px; background: var(--carte2); display: grid; place-items: center; font: 600 12px var(--mono); } .montant { font-size: 17px; }
  h2 { text-align: center; font-size: 16px; font-weight: 550; margin-top: 10px; }
  .bio { align-self: center; min-height: 48px; padding: 0 20px; border-radius: 24px; background: var(--carte2); border: 1px solid var(--ligne-forte); display: flex; align-items: center; gap: 8px; font-weight: 550; } .bio:disabled { opacity: 0.5; }
  .bloque { text-align: center; color: var(--danger); padding: 30px 10px; } .pied { text-align: center; font-size: 12.5px; margin-top: auto; }
</style>
