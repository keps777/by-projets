<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { heureLocale } from '../../domain/actions.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { DUREE_RESERVATION_MS } from '../../data/constantes.ts';
  import { fcfa } from '../../core/money.ts';
  import { chrono, formaterTel, OPERATEURS, refusAutomatique } from '../../core/reglement.ts';
  import { etat } from './etat.ts';
  import { abandonnerBrouillon, billetsDuPaiement, confirmerPaiement, paiementDe, refuserPaiement } from './actions.ts';

  /** Attente de la confirmation sur le téléphone (MoMo, Orange Money, banque, Face ID, proche) : compte à rebours de la réservation, boutons de démonstration. */
  const e = etat();
  const b = $derived(e.brouillon);
  const paiement = $derived(paiementDe(b));
  const op = $derived(b ? OPERATEURS[b.moyen] : OPERATEURS.momo);
  const demande = $derived(b?.qui === 'demande');
  const montant = $derived(paiement?.montant ?? b?.montant ?? 0);
  const expireLe = $derived(paiement?.expireLe ?? b?.expireLe ?? 0);
  const debut = $derived(paiement?.ts ?? (b?.expireLe ? b.expireLe - DUREE_RESERVATION_MS : 0));

  let tic = $state(maintenant());
  let phase = $state<'envoi' | 'attente' | 'ok'>('envoi');
  let sortie = $state<{ dest: string; libelle: string } | null>(null);
  const reste = $derived(Math.max(0, expireLe - tic));
  const part = $derived(Math.max(0, Math.min(100, Math.round((reste / DUREE_RESERVATION_MS) * 100))));
  const payeur = $derived(demande ? (b?.proche?.nom ?? 'Ton proche') : 'toi');
  const titre = $derived(phase === 'ok' ? 'Paiement confirmé' : demande ? `On attend ${b?.proche?.nom ?? 'ton proche'}` : b?.moyen === 'carte' ? 'Valide avec ta banque' : b?.moyen === 'visage' ? 'Face ID en cours' : `On attend ${op.court}`);
  const sousTitre = $derived(phase === 'ok' ? (b?.nature === 'billet' ? `${demande ? b?.proche?.nom : op.operateur} a validé · ton billet est signé.` : `${op.operateur} a validé.`)
    : phase === 'envoi' ? 'Envoi de la demande…' : demande ? `${b?.proche?.nom} a reçu le lien. Ta place est gardée.` : b?.moyen === 'visage' ? 'Visage reconnu : la validation part toute seule.' : `La fenêtre ${op.operateur} arrive d’une seconde à l’autre.`);

  function aller_(dest: string) { if (e.brouillon) e.brouillon = null; aller(dest); }
  function vers(ok: boolean) {
    if (!b) return;
    if (!ok) { aller('/paiement/refus'); return; }
    const id = paiement ? billetsDuPaiement(paiement.id)[0]?.id : undefined;
    sortie = b.nature === 'colis' ? { dest: `/colis/suivi?colis=${b.colisId}`, libelle: 'Suivre mon colis' } : b.nature === 'billet' ? { dest: `/pass?billet=${id ?? ''}`, libelle: 'Voir mon billet' } : b.nature === 'covoit' ? { dest: '/covoit', libelle: 'Voir mon trajet' } : { dest: '/groupe', libelle: 'Revenir à la cagnotte' };
    phase = 'ok';
    setTimeout(() => { if (sortie && location.pathname === '/paiement/attente') aller_(sortie.dest); }, 1800);
  }
  function confirmer() {
    if (!b || phase === 'ok') return;
    const r = confirmerPaiement(b);
    if (r.ok) vers(true); else { refuserPaiement(b, 'Réservation expirée'); vers(false); }
  }
  function refuser(motif = 'Solde insuffisant') { if (!b || phase === 'ok') return; refuserPaiement(b, motif); vers(false); }
  function abandonner() { abandonnerBrouillon(); montrer('Réservation annulée, places libérées', 'wa'); aller('/'); }

  onMount(() => {
    const cur = e.brouillon;
    if (!cur) return;
    const p = paiementDe(cur);
    if (p && p.statut === 'ok') { vers(true); return; }
    if (p && p.statut !== 'attente') { aller('/paiement/refus'); return; }
    const chrono_ = setInterval(() => {
      tic = maintenant(); const c = e.brouillon; if (!c || phase === 'ok') return;
      const fin = paiementDe(c)?.expireLe ?? c.expireLe;
      if (fin > 0 && tic >= fin) { refuserPaiement(c, 'Réservation expirée'); aller('/paiement/refus'); }
    }, 1000);
    const minuteurs: ReturnType<typeof setTimeout>[] = [];
    const apres = (ms: number, f: () => void) => { minuteurs.push(setTimeout(f, ms)); };
    apres(1200, () => {
      phase = 'attente';
      const c = e.brouillon, auto = c ? refusAutomatique(c.tel) : null;
      if (auto && c && c.moyen !== 'carte') { apres(1200, () => refuser(auto)); return; }
      if (c?.moyen === 'visage' && c.qui === 'moi') apres(1500, confirmer);
    });
    return () => { clearInterval(chrono_); minuteurs.forEach(clearTimeout); };
  });
  const etapes = $derived([
    { n: '✓', cls: 'ok', t: demande ? `Demande envoyée à ${b?.proche?.nom}` : b?.moyen === 'carte' ? 'Paiement transmis à ta banque' : `Demande envoyée à ${op.operateur}`, s: `${formaterTel(b?.tel ?? '')} · ${heureLocale(debut || maintenant())}` },
    { n: '2', cls: phase === 'ok' ? 'ok' : 'cur', t: demande ? `${b?.proche?.nom} paie depuis son téléphone` : b?.moyen === 'carte' ? 'Valide avec la banque (3-D Secure)' : b?.moyen === 'visage' ? 'Face ID a validé' : 'Valide sur ton téléphone',
      s: demande ? 'Elle touche le lien ou compose *123# → 5, puis tape son code.' : b?.moyen === 'carte' ? 'Une page de ta banque demande un code reçu par SMS.' : b?.moyen === 'visage' ? 'Rien à taper : ton visage a confirmé le paiement.' : `Une fenêtre ${op.operateur} s’ouvre : tape ton code. Rien à faire si tu as confirmé par le visage.` },
    { n: '3', cls: phase === 'ok' ? 'cur' : '', t: b?.nature === 'colis' ? 'Colis payé, prêt à déposer' : b?.nature === 'billet' ? 'Billet holographique prêt' : b?.nature === 'covoit' ? 'Place de covoiturage confirmée' : 'Part versée à la cagnotte', s: b?.nature === 'billet' ? 'Signé hors ligne, envoyé aussi par SMS et WhatsApp.' : 'Tu reçois une notification dès que c’est validé.' }
  ]);
</script>

<Mobile titre={titre} retourVers="/paiement">
  {#snippet droite()}{#if phase !== 'ok'}<span class="pl wa" role="timer" aria-label="Temps restant"><span class="dot"></span>{chrono(reste)}</span>{:else}<span class="pl ok">confirmé</span>{/if}{/snippet}

  {#if !b || (!paiement && b.nature !== 'groupe')}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="horloge" taille={56} /></span>
      <span class="ttl t20">Aucun paiement en cours</span>
      <span class="t14 mut" style="max-width: 30ch">Rien n’attend de confirmation pour l’instant.</span>
      <a class="b p" href="/pass" onclick={(ev) => { ev.preventDefault(); aller('/pass'); }}>Mes billets</a></div>
  {:else}
    <div class="center" style="flex: none; padding: 6px 0" aria-live="polite">
      <span class="ringp big" class:fini={phase === 'ok'} style="--p: {phase === 'ok' ? 100 : part}%"><span class="col c"><span class="ttl t24">{fcfa(montant)}</span><span class="t12 mut">F CFA</span></span></span>
      <span class="t16 b7">{titre}</span>
      <span class="t14 mut" style="max-width: 30ch">{sousTitre}</span>
    </div>
    <div class="gl col g12">
      {#each etapes as s (s.t)}
        <div class="step"><span class="n {s.cls}" aria-hidden="true">{s.n}</span><div class="col"><span class="t15 b7">{s.t}</span><span class="t13 mut">{s.s}</span></div></div>
      {/each}
    </div>
    {#if phase !== 'ok' && !demande && op.ussd}
      <div class="toast"><span class="bub aq"><Icone nom="horloge" /></span><span class="t13 grow">Pas de fenêtre ? Compose <b class="mono">{op.ussd}</b> puis « Approuver ».</span></div>
    {/if}
    <div class="col g8" style="margin-top: auto">
      {#if phase === 'ok' && sortie}
        <button type="button" class="b p" onclick={() => aller_(sortie!.dest)}>{sortie.libelle}</button>
      {:else}
        <button type="button" class="b s" onclick={confirmer} disabled={phase === 'envoi'}>Simuler la validation {demande ? `de ${payeur}` : op.operateur} (démo)</button>
        <button type="button" class="b s" onclick={() => refuser()} disabled={phase === 'envoi'}>Simuler un refus (démo)</button>
        <button type="button" class="b g" onclick={() => refuser(`Pas de réponse de ${demande ? b.proche?.nom : op.operateur}`)}>Ça ne marche pas</button>
        <button type="button" class="b g" onclick={abandonner}>Annuler et libérer les places</button>
      {/if}
    </div>
  {/if}
</Mobile>

<style>
  .step { display: flex; gap: 12px; align-items: flex-start; }
  .n { flex: none; width: 30px; height: 30px; border-radius: 50%; display: grid; place-items: center; font: 700 13px 'Geist Mono', monospace; background: rgba(255, 255, 255, 0.1); color: #b7c0db; }
  .n.ok { background: #4ade80; color: #06080f; } .n.cur { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; animation: pulse 1.6s infinite; }
  .ringp.big { width: 150px; height: 150px; } .ringp.big::before { inset: 12px; }
  .ringp.fini { background: conic-gradient(#4ade80 100%, rgba(255, 255, 255, 0.1) 0); }
  .t15 { font-size: 15px; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
