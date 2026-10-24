<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aujourdhui } from '../../data/store.svelte.ts';
  import { ajouterJours, jourCourt, jourLong } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { limiteRemboursement, pourcentPaye, TAILLES_BUS } from '../../core/reglement.ts';
  import { cagnotte, JOURS_AVANT_VOYAGE_MIN } from './etat.ts';
  import { ajouterParticipantDemo, choisirTaille, maPart, messageCagnotte, nbPayes, partagerCagnotte, partCagnotte, recommencerCagnotte, renommerCagnotte, taillePossible, totalCagnotte, verifierCagnotte } from './actions.ts';

  /** Bus entier : une cagnotte partagée, chacun paie sa part ; bus plein = réservé, sinon remboursement à J-2. */
  const c = cagnotte();
  const total = $derived(totalCagnotte(c)), part = $derived(partCagnotte(c)), payes = $derived(nbPayes(c));
  const pct = $derived(pourcentPaye(payes, c.taille));
  const collecte = $derived(payes * part);
  const moi = $derived(maPart(c));
  const clos = $derived(c.statut === 'complete' || c.statut === 'remboursee');
  const minJour = $derived(ajouterJours(aujourdhui(), JOURS_AVANT_VOYAGE_MIN));
  let apercu = $state(''), motif = $state(c.motif), jour = $state(c.jour);
  const cellules = $derived(Array.from({ length: 30 }, (_, i) => i < Math.round(pct * 0.3)));
  const visibles = $derived(c.participants.slice(0, 4));

  onMount(() => { verifierCagnotte(); });
  function enregistrer() {
    const j = jour && jour < minJour ? minJour : jour; jour = j; renommerCagnotte(motif, j); motif = c.motif;
  }
  function partager() {
    enregistrer(); apercu = partagerCagnotte();
    try { void navigator.clipboard?.writeText(c.lien); } catch { /* presse-papiers indisponible */ }
    montrer('Lien de la cagnotte envoyé sur WhatsApp (simulé)');
  }
  function ajouter() { if (!ajouterParticipantDemo()) montrer('Le bus est déjà plein', 'wa'); }
  const nav = (ev: Event, v: string) => { ev.preventDefault(); aller(v); };
</script>

<Mobile titre="Bus entier" sous={`${c.motif} · ${jourCourt(c.jour)}`} retourVers="/">
  {#snippet droite()}<span class="pl {c.statut === 'complete' ? 'ok' : c.statut === 'remboursee' ? 'er' : 'ac'}">{c.statut === 'complete' ? 'réservé' : c.statut === 'remboursee' ? 'remboursée' : c.statut === 'ouverte' ? 'ouverte' : 'brouillon'}</span>{/snippet}

  {#if !clos}
    <div class="gl col g8">
      <div class="fld"><label class="t13 mut" for="g-motif">Occasion</label><input id="g-motif" class="inp" bind:value={motif} onchange={enregistrer} maxlength="40" /></div>
      <div class="fld"><label class="t13 mut" for="g-jour">Date du voyage</label><input id="g-jour" class="inp" type="date" bind:value={jour} min={minJour} onchange={enregistrer} aria-describedby="g-aide" /><span id="g-aide" class="t12 mut3">Au moins {JOURS_AVANT_VOYAGE_MIN} jours à l’avance : remboursement automatique le {jourLong(limiteRemboursement(jour || c.jour))} si le bus n’est pas plein.</span></div>
    </div>
  {/if}

  <div class="seg2" role="group" aria-label="Taille du bus">
    {#each TAILLES_BUS as t (t)}<button type="button" class:on={c.taille === t} aria-pressed={c.taille === t} disabled={c.taille !== t && !taillePossible(c, t)} onclick={() => choisirTaille(t)}>{t} pl.</button>{/each}
  </div>
  {#if payes > 0 && !clos}<span class="t12 mut3 c">Taille verrouillée dès le premier paiement.</span>{/if}

  <div class="gl">
    <div class="bus3" role="img" aria-label="Remplissage du bus : {pct} %"><div class="bx">{#each cellules as f, i (i)}<i class:f></i>{/each}</div></div>
    <div class="row sp">
      <span class="col"><span class="lab">Bus {c.taille} places</span><span class="ttl t20">{fmtF(total)}</span><span class="t12 mut">{fmtF(part)} par personne si complet · clim, 1 chauffeur relais</span></span>
      <span class="ringp" style="--p: {pct}%" role="img" aria-label="{pct} % payé"><span class="t13 b7">{pct} %</span></span>
    </div>
  </div>

  <div class="gl ac">
    <div class="row sp"><span class="t15 b7">Cagnotte</span><span class="mono t13">{fmtF(collecte)} / {fmtF(total)}</span></div>
    <div class="bar" style="margin: 8px 0" role="progressbar" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100" aria-label="Part de la cagnotte payée"><i style="width: {pct}%"></i></div>
    <div class="row sp">
      <span class="avs" aria-label="{c.participants.length} participant{c.participants.length > 1 ? 's' : ''}, {payes} ont payé">{#each visibles as p, i (p.id)}<span class="av" class:hot={i % 2 === 1} class:vide={!p.paye} title="{p.nom}{p.paye ? '' : ' (n’a pas encore payé)'}">{p.nom[0]}</span>{/each}{#if c.participants.length > 4}<span class="av">+{c.participants.length - 4}</span>{/if}</span>
      {#if !clos}<button class="b s sm" type="button" onclick={ajouter}>+ un participant (démo)</button>{/if}
    </div>
    <span class="t12 mut3" style="display: block; margin-top: 8px">{payes} part{payes > 1 ? 's' : ''} payée{payes > 1 ? 's' : ''} sur {c.taille}.</span>
  </div>

  {#if c.statut === 'complete'}
    <div class="toast" role="status"><span class="bub" style="color: #4ADE80"><Icone nom="ok" /></span><span class="t13 grow">Cagnotte pleine : le bus de {c.taille} places est réservé pour le {jourLong(c.jour)}. Chaque participant reçoit son billet.</span></div>
  {:else if c.statut === 'remboursee'}
    <div class="toast" role="status"><span class="bub" style="color: #FF6B6B"><Icone nom="alerte" /></span><span class="t13 grow">Le bus n’était pas plein à J-2 : {fmtF(c.rembourse ?? 0)} remboursés aux participants.</span></div>
  {:else if c.statut === 'ouverte'}
    <div class="toast"><span class="bub aq"><Icone nom="horloge" /></span><span class="t13 grow">Pas plein le {jourLong(limiteRemboursement(c.jour))} (J-2) ? Tout le monde est remboursé automatiquement.</span></div>
  {/if}

  {#if apercu}
    <span class="lab">Message WhatsApp envoyé</span>
    <div class="msg" aria-live="polite">{apercu}</div>
  {:else if c.statut === 'brouillon'}
    <span class="lab">Aperçu du message</span>
    <div class="msg">{messageCagnotte(c)}</div>
  {/if}

  <span class="lab">Comment ça marche</span>
  <div class="gl col" style="gap: 0">
    <div class="li"><span class="bub aq">1</span><span class="grow t14">Tu crées la cagnotte, le lien part sur WhatsApp.</span></div>
    <div class="li"><span class="bub aq">2</span><span class="grow t14">Chacun paie sa part en MoMo ou OM, même sans l’app (*123#).</span></div>
    <div class="li"><span class="bub aq">3</span><span class="grow t14">À 100 %, le bus est réservé. Sinon, tout le monde est remboursé à J-2.</span></div>
  </div>

  <div class="col g8" style="margin-top: auto">
    {#if c.statut === 'remboursee'}
      <button type="button" class="b p" onclick={() => { recommencerCagnotte(); apercu = ''; motif = c.motif; jour = c.jour; }}>Créer une nouvelle cagnotte</button>
    {:else if c.statut === 'complete'}
      <a class="b p" href="/pass" onclick={(ev) => nav(ev, '/pass')}>Voir mes billets</a>
    {:else}
      <button type="button" class="b p" onclick={partager}>Partager le lien de la cagnotte</button>
      {#if moi?.paye}<button type="button" class="b s" disabled>Ta part est payée · {fmtF(part)}</button>
      {:else}<a class="b s" href="/paiement?groupe=1" onclick={(ev) => nav(ev, '/paiement?groupe=1')}>Payer ma part · {fmtF(part)}</a>{/if}
    {/if}
  </div>
</Mobile>

<style>
  .avs { display: flex; }
  .avs .av { width: 34px; height: 34px; font-size: 12px; border: 2px solid #05070d; margin-left: -8px; } .avs .av:first-child { margin-left: 0; }
  .avs .av.vide { opacity: 0.45; }
  .bus3 { position: relative; height: 120px; perspective: 700px; }
  .bx { position: absolute; left: 50%; top: 14px; width: 220px; height: 80px; margin-left: -110px; border-radius: 26px 26px 18px 18px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(255, 255, 255, 0.05)); border: 1px solid rgba(255, 255, 255, 0.25); transform: rotateX(35deg) rotateZ(-6deg); display: grid; grid-template-columns: repeat(10, 1fr); gap: 4px; padding: 12px 16px; }
  .bx i { border-radius: 3px; background: rgba(255, 255, 255, 0.14); } .bx i.f { background: #3de0ff; box-shadow: 0 0 8px #3de0ff; }
  .msg { padding: 12px 14px; border-radius: 18px 18px 18px 4px; background: rgba(37, 211, 102, 0.14); border: 1px solid rgba(37, 211, 102, 0.35); font-size: 14px; }
  .seg2 button:disabled { opacity: 0.4; cursor: not-allowed; }
  .b:disabled { opacity: 0.55; cursor: default; }
  .t15 { font-size: 15px; }
  .inp[type='date'] { color-scheme: dark; }
</style>
