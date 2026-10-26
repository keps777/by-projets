<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt, fmtSigne } from '../../core/argent.ts';
  import { departDe } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { compagnieDe } from '../../domain/marche.ts';
  import { ErreurIntention, recevoirProposition } from '../intentions/actions.ts';
  import { aller } from '../../router.svelte.ts';
  import { reseau } from '../achat/reseau.svelte.ts';
  import Absent from './Absent.svelte';
  import BilletBlanc from './BilletBlanc.svelte';
  import { chances, demandeDe, prixRapides } from './demandes.ts';
  import { fenetreJours, jourComplet, pluriel } from './format.ts';
  import Pic from './Pic.svelte';
  import { recu } from './vente.ts';

  /** Proposer mon billet à un acheteur qui a déjà réservé ses fonds : vente immédiate à son prix, ou proposition plus chère (réponse sous 48 h). */
  let { intentionId = '' }: { intentionId?: string } = $props();
  const compte = $derived(compteCourant());
  const demande = $derived(compte ? demandeDe(compte.id, intentionId) : undefined);
  let droitChoisi = $state<string | undefined>(), prixChoisi = $state<number | undefined>(), erreur = $state(''), envoi = $state(false);
  const billet = $derived(demande?.billets.find((b) => b.droit.id === droitChoisi) ?? demande?.billets[0]);
  const vol = $derived(billet?.vol), droit = $derived(billet?.droit);
  const max = $derived(demande?.max ?? 0), plafond = $derived(vol?.prixNeuf ?? 0);
  const auDessus = $derived(demande?.detail.auDessus ?? false), auto = $derived(demande?.detail.auto ?? false);
  const prix = $derived(Math.min(plafond, Math.max(max, prixChoisi ?? max)));
  const pass = $derived(!!compte?.pass.actif);
  const r = $derived(recu(prix, droit?.prixPaye ?? 0, pass));
  const ch = $derived(chances(prix, max, auto, auDessus));
  const rapides = $derived(prixRapides(max, plafond, auDessus));
  const depart = $derived(vol ? departDe(vol.jour, vol.heureDepart) : 0);
  const app_ville = (code: string): string => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const net = (p: number) => recu(p, 0, pass).net;
  const teinte = $derived(ch.niveau === 'Certaine' ? 'var(--ok)' : ch.niveau === 'Bonnes' ? 'var(--up)' : 'var(--down)');

  function envoyer() {
    erreur = ''; if (!compte || !droit || !demande) return;
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : la proposition demande une connexion.'; return; }
    envoi = true; const iid = demande.intention.id, did = droit.id;
    try {
      const p = recevoirProposition(iid, did, prix);
      if (!p) { erreur = 'L’acheteur ne reçoit pas les propositions au-dessus de son prix maximum.'; envoi = false; return; }
      aller(`/marche-intentions/issue/${iid}`);
    } catch (e) { erreur = e instanceof ErreurIntention ? e.message : 'Impossible d’envoyer la proposition pour l’instant.'; envoi = false; }
  }
</script>

{#if !intentionId}
  <!-- ancien écran réinstancié brièvement -->
{:else if !demande || !billet || !vol || !droit}
  <Absent titre="Intention indisponible" message="Cette intention n’est plus active, ou aucun de vos billets en vente ne correspond à son trajet et à sa fenêtre." details={['Mettez un droit en vente depuis votre portefeuille, puis revenez au tableau des intentions.']} lien="/marche-intentions" libelleLien="Retour aux intentions" retour="/marche-intentions" autre="/portefeuille" libelleAutre="Voir mon portefeuille" />
{:else}
  {@const cie = compagnieDe(vol)}
  {@const d = demande}
  <Ecran titre="Proposer mon billet" face="nuit" retour="/marche-intentions">
    <section class="intention" aria-label="Intention de l’acheteur {d.initiale}">
      <div class="tete"><span>Ce que cherche l’acheteur {d.initiale}</span><span class="mono ref">{d.intention.id}</span></div>
      <div class="route"><span class="code">{d.intention.de}</span><span class="fil" aria-hidden="true"><span class="pt"></span><Icone nom="avion" taille={20} /><span class="pt"></span></span><span class="code">{d.intention.vers}</span></div>
      <div class="bas"><span class="col"><span class="mono fen">{d.fenetre}</span><span>{d.detail.voyageurs} {pluriel(d.detail.voyageurs, 'voyageur')} · {d.detail.aller === 'retour' ? 'aller-retour' : 'aller simple'} · Montréal → {d.ville}</span></span>
        <span class="max"><span class="t-sur">Prix max</span><span class="mono m" data-testid="prix-max">{fmt(max)}</span></span></div>
      <div class="puces"><span class="puce ready"><Icone nom="ok" taille={13} trait={2.5} />Fonds réservés</span><span class="puce"><Icone nom="horloge" taille={13} />expire dans {d.joursRestants} j</span>
        {#if auto}<span class="puce signal"><Pic nom="eclair" taille={13} />accepte automatiquement ≤ {fmt(max)}</span>{/if}</div>
    </section>

    <section aria-labelledby="bil-h"><div class="ligne-t"><h2 id="bil-h" class="t-section">Votre billet compatible</h2><span class="dans"><Icone nom="ok" taille={14} trait={2.5} />Dans la fenêtre</span></div>
      {#if d.billets.length > 1}<div class="choix" role="radiogroup" aria-label="Choisir le billet à proposer">{#each d.billets as b}<label class:sel={b.droit.id === droit.id}><input type="radio" name="billet" value={b.droit.id} checked={b.droit.id === droit.id} onchange={() => (droitChoisi = b.droit.id)} />{b.vol.de} → {b.vol.vers} · {jourComplet(departDe(b.vol.jour, b.vol.heureDepart))} · {fmt(b.prix)}</label>{/each}</div>{/if}
      <BilletBlanc de={vol.de} vers={vol.vers} entete={[`${cie.nom} · ${vol.escales.length ? `${vol.escales.length} escale` : 'direct'}`, jourComplet(depart)]} depart={vol.heureDepart} arrivee={vol.heureArrivee} ville={app_ville(vol.de)} villeVers={app_ville(vol.vers)} duree="{vol.escales.length ? '' : 'Direct · '}{Math.floor(vol.dureeMin / 60)} h {String(vol.dureeMin % 60).padStart(2, '0')}" label="Billet {vol.de} vers {vol.vers}, {cie.nom}, payé {fmt(droit.prixPaye)}">
        {#snippet bas()}<div class="pied-b"><span class="pastille">En vente</span><span class="c"><span class="s">Payé ({droit.origine === 'drop' ? 'Drop' : droit.origine === 'revente' ? 'Revente' : 'Neuf'})</span><span class="mono v">{fmt(droit.prixPaye)}</span></span><span class="c dr"><span class="s">Prix équivalent</span><span class="mono v">{fmt(vol.prixNeuf)}</span></span></div>{/snippet}</BilletBlanc></section>

    <section aria-labelledby="px-h" class="prix"><h2 id="px-h" class="t-section">Votre prix</h2>
      <div role="group" aria-label="Choisir un prix" class="cartes">
        <button type="button" class="hero" class:sel={prix === rapides[0]} aria-pressed={prix === rapides[0]} onclick={() => (prixChoisi = rapides[0])}>
          <span class="g"><span class="titre">Accepter {fmt(rapides[0] ?? max)}</span><span class="sub">{auto ? 'vente immédiate' : 'à valider par l’acheteur'}</span><span class="chip"><Icone nom="ok" taille={12} trait={2.5} />fonds déjà réservés</span></span>
          <span class="dr"><span class="mono grand">{fmt(rapides[0] ?? max)}</span><span class="net">net {fmt(net(rapides[0] ?? max))}</span></span></button>
        {#if rapides.length > 1}<div class="deux">{#each rapides.slice(1) as p}<button type="button" class="petit" class:sel={prix === p} aria-pressed={prix === p} onclick={() => (prixChoisi = p)}><span class="a">Proposer</span><span class="mono grand">{fmt(p)}</span><span class="net">net {fmt(net(p))} · réponse sous 48 h</span></button>{/each}</div>{/if}
      </div>
      {#if auDessus && plafond > max}<div class="autre"><div class="ligne-a"><label for="prix-r" class="t-sur">Ou un autre prix</label><span class="mono pv" data-testid="prix-choisi">{fmt(prix)}</span></div>
        <input id="prix-r" type="range" min={max} max={plafond} step="10" value={prix} oninput={(e) => (prixChoisi = Number((e.currentTarget as HTMLInputElement).value))} aria-valuetext={fmt(prix)} aria-describedby="regle" />
        <div class="bornes" aria-hidden="true"><span>{fmt(max)} = son prix</span><span>Plafond {fmt(plafond)}</span></div><p id="regle" class="regle">Plafond = prix équivalent d’un billet neuf sur ce vol. Règle provisoire, à valider.</p></div>
      {:else if !auDessus}<p class="regle">L’acheteur ne reçoit que les propositions à son prix maximum ou en dessous.</p>{/if}
    </section>

    <section class="calcul carte" aria-labelledby="calc-h"><h2 id="calc-h" class="t-section">À ce prix</h2>
      <dl><div><dt>{ch.immediate ? 'Prix accepté' : 'Prix proposé'}</dt><dd class="mono">{fmt(prix)}</dd></div>
        <div class="deux-l"><dt>Commission NexG-TT (hypothèse)<span class="mono sous">10 % membre Pass · 12,5 % sans Pass</span></dt><dd class="mono">−{fmt(r.commission)}</dd></div>
        <div class="net-l"><dt>Net reçu sur votre solde</dt><dd class="mono" data-testid="net">{fmt(r.net)}</dd></div>
        <div class="ecart-l"><dt>Écart par rapport au prix payé ({fmt(droit.prixPaye)})</dt><dd class="mono" class:hausse={r.sens === 'hausse'} class:baisse={r.sens === 'baisse'}>{fmtSigne(r.diff)}</dd></div></dl>
      <div class="chances"><div class="lig"><span class="t-sec fort">Chances d’acceptation</span><span class="niv" style="color: {teinte}" data-testid="chances">{ch.niveau}</span></div>
        <div class="barres" role="img" aria-label="Chances d’acceptation : {ch.niveau.toLowerCase()}, {ch.barres} sur 3">{#each [1, 2, 3] as i}<span style="background: {ch.barres >= i ? teinte : 'var(--line)'}"></span>{/each}</div><p class="regle">{ch.pourquoi}</p></div>
    </section>

    <p class="avis"><Icone nom="info" taille={18} trait={2} /><span>À l’accord, ce droit est cédé à l’acheteur. L’annonce en cours sur le marché (le cas échéant) est retirée. L’acheteur nomme ensuite le voyageur avant l’échéance.</span></p>
    {#if erreur}<p class="erreur" role="alert"><Icone nom="alerte" taille={18} trait={2} /><span>{erreur}</span></p>{/if}
    <p class="t-aide centre">Montants fictifs. Un droit de voyage n’est pas un placement financier.</p>

    {#snippet pied()}
      <p class="resume"><span>Net reçu <span class="mono clair">{fmt(r.net)}</span></span><span>Chances : {ch.niveau.toLowerCase()}</span></p>
      <button type="button" class="btn pleine" onclick={envoyer} disabled={envoi}>{#if ch.immediate}<Pic nom="eclair" taille={20} trait={2.25} />Vendre maintenant à {fmt(prix)}{:else}<Pic nom="fleche" taille={20} trait={2.25} />Envoyer ma proposition à {fmt(prix)}{/if}</button>
    {/snippet}
  </Ecran>
{/if}


<style>
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .clair { color: var(--ink); } .centre { text-align: center; } .t-section { text-transform: uppercase; letter-spacing: 0.04em; } .t-sur { font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink3); }
  .intention { display: flex; flex-direction: column; gap: 12px; padding: 16px 18px; border-radius: 18px; border: 2px dashed var(--line-strong); } .tete { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); } .ref { font-size: 12px; letter-spacing: 0; text-transform: none; color: var(--ink3); font-weight: 500; }
  .route { display: flex; align-items: center; gap: 10px; } .code { font: 700 clamp(34px, 11vw, 44px)/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .fil { flex: 1; display: flex; align-items: center; gap: 6px; color: var(--ink3); } .pt { flex: 1; border-top: 2px dotted var(--line-strong); }
  .bas { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; } .col { display: flex; flex-direction: column; gap: 2px; font-size: 13px; color: var(--ink2); min-width: 0; } .fen { color: var(--ink); font-weight: 500; } .max { display: flex; flex-direction: column; align-items: flex-end; } .m { font-weight: 600; font-size: clamp(24px, 7.7vw, 30px); line-height: 32px; white-space: nowrap; }
  .puces { display: flex; flex-wrap: wrap; gap: 6px; padding-top: 10px; border-top: 1px dashed var(--line); } .puce { text-transform: none; letter-spacing: 0; font-weight: 600; } .puce.ready { text-transform: uppercase; letter-spacing: 0.06em; font-weight: 700; } .puce.signal { white-space: normal; }
  .ligne-t { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; } .dans { display: inline-flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 700; color: var(--ok); }
  .choix { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; } .choix label { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--line); font-size: 14px; cursor: pointer; } .choix label.sel { border-color: var(--accent); background: var(--accent-soft); } .choix input { accent-color: var(--accent); width: 20px; height: 20px; }
  .pied-b { display: grid; grid-template-columns: auto 1fr 1fr; align-items: center; gap: 12px; } .pastille { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: #f1f2f4; color: #555c6b; font: 700 12px 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; } .c { display: flex; flex-direction: column; } .c.dr { align-items: flex-end; text-align: right; } .s { font-size: 11px; font-weight: 600; color: #555c6b; } .v { font-weight: 600; font-size: 15px; }
  .prix { display: flex; flex-direction: column; gap: 12px; } .cartes { display: flex; flex-direction: column; gap: 8px; } .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  button.hero { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 14px; min-height: 76px; padding: 12px 16px; border-radius: 16px; cursor: pointer; text-align: left; background: var(--accent-soft); color: var(--ink); border: 2px solid var(--accent); } button.hero.sel { background: var(--accent); color: var(--on-signal); }
  .g { display: flex; flex-direction: column; gap: 3px; min-width: 0; } .titre { font-size: 16px; font-weight: 700; } .sub { font-size: 13px; font-weight: 600; } .chip { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; height: 22px; padding: 0 8px; border-radius: 999px; font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; background: rgba(255, 210, 63, 0.16); color: var(--accent); } .hero.sel .chip { background: var(--on-signal); }
  .dr { display: flex; flex-direction: column; align-items: flex-end; } .grand { font-weight: 600; font-size: clamp(22px, 6.7vw, 26px); line-height: 28px; white-space: nowrap; } .net { font-size: 12px; font-weight: 600; color: var(--ink3); } .hero.sel .net { color: var(--on-signal); }
  button.petit { display: flex; flex-direction: column; align-items: flex-start; gap: 4px; min-height: 76px; padding: 12px 14px; border-radius: 16px; cursor: pointer; text-align: left; background: var(--surface); color: var(--ink); border: 2px solid var(--line); min-width: 0; } button.petit.sel { background: var(--surface2); border-color: var(--ink); } .a { font-size: 14px; font-weight: 700; } button.petit .net { color: var(--ink3); } button.petit.sel .net { color: var(--ink); }
  .autre { display: flex; flex-direction: column; gap: 6px; padding: 14px 18px 12px; border-radius: 16px; background: #060708; border: 1px solid var(--line); } .ligne-a { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .pv { font-weight: 600; font-size: 22px; white-space: nowrap; } .t-sur { color: var(--ink2); }
  input[type='range'] { width: 100%; height: 44px; margin: 0; accent-color: var(--accent); cursor: pointer; } .bornes { display: flex; justify-content: space-between; gap: 8px; font: 12px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); } .regle { font-size: 12px; line-height: 17px; color: var(--ink3); }
  .calcul { display: flex; flex-direction: column; gap: 12px; padding: 18px; } dl { margin: 0; display: flex; flex-direction: column; } dl > div { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; border-bottom: 1px solid var(--line); } dl > div:last-child { border-bottom: 0; min-height: 44px; } dt { font-size: 14px; color: var(--ink2); } dd { margin: 0; font-weight: 600; font-size: 15px; }
  .deux-l { min-height: 48px !important; } .deux-l dt { display: flex; flex-direction: column; } .sous { font-size: 12px; color: var(--ink3); } .net-l { min-height: 56px !important; } .net-l dt { font-size: 16px; font-weight: 700; color: var(--ink); } .net-l dd { font-size: clamp(22px, 7vw, 28px); } .ecart-l dd { font-size: 16px; } .ecart-l dd.hausse { color: var(--up); } .ecart-l dd.baisse { color: var(--down); }
  .chances { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 14px; background: var(--surface2); } .lig { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .fort { font-weight: 600; } .niv { font-size: 14px; font-weight: 700; } .barres { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; } .barres span { height: 6px; border-radius: 3px; }
  .avis { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; line-height: 18px; } .avis :global(svg) { margin-top: 0; }
  .erreur { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--err-soft); color: var(--err); font-size: 14px; font-weight: 600; }
  .resume { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; color: var(--ink2); } .btn.pleine { width: 100%; height: 52px; border-radius: 14px; }
</style>
