<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from '../bagages/Picto.svelte';
  import { aller } from '../../router.svelte.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { compteCourant, compteDe } from '../../domain/compte.ts';
  import { compagnieDe, droitDe, volDe } from '../../domain/marche.ts';
  import { accepterProposition, actualiser, contreProposer, refuserProposition } from './actions.ts';
  import { villeDe } from './compat.ts';
  import { ENGAGEMENT_H, PAS_PRIX, contreDe, detailDe, intentionDe, ordinal, propositionDe, rangDetenteur, valideJusqua } from './modele.ts';
  import { ecartNeuf, ecartProposition, ouvertes } from './vues.ts';
  import { fenetre, horloge, horlogeAria, jourLong } from './temps.ts';

  /** Une proposition reçue (planche m3-26) : accepter, refuser ou contre-proposer. Au-dessus du prix max, la proposition est facultative. */
  let { id, pid }: { id: string; pid: string } = $props();
  const compte = $derived(compteCourant());
  const i = $derived(intentionDe(id));
  const p = $derived(i ? propositionDe(i, pid) : undefined);
  const droit = $derived(p ? droitDe(p.droitId) : undefined);
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const cie = $derived(vol ? compagnieDe(vol) : undefined);
  const vendeur = $derived(p ? compteDe(p.vendeurId) : undefined);
  const d = $derived(i ? detailDe(i) : undefined);
  const e = $derived(i && p ? ecartProposition(p.prix, i.budget) : undefined);
  const contre = $derived(p ? contreDe(p.id) : undefined);
  const autres = $derived(i && p ? ouvertes(i).filter((x) => x.id !== p.id).length : 0);

  let maintenantMs = $state(maintenant());
  const restant = $derived(p ? valideJusqua(p) - maintenantMs : 0);
  const ouverte = $derived(!!i && i.statut === 'publiee' && p?.statut === 'recue' && restant > 0);
  const refusee = $derived(p?.statut === 'refusee'), expiree = $derived(p?.statut === 'expiree' || (p?.statut === 'recue' && restant <= 0));
  onMount(() => {
    const t = setInterval(() => { maintenantMs = maintenant(); }, 1000); if (compte) actualiser(compte.id);
    return () => clearInterval(t);
  });

  let contreOuverte = $state(false), choix = $state<number | null>(null), envoyee = $state(false), erreur = $state(''), envoi = $state(false);
  const milieu = $derived(i && p ? i.budget + Math.floor((p.prix - i.budget) / 2 / PAS_PRIX) * PAS_PRIX : 0);
  const valeurContre = $derived(choix ?? contre?.prix ?? milieu);
  const peutContre = $derived(!!i && !!p && p.prix > i.budget);
  const echelle = $derived(vol ? vol.prixNeuf : 1);
  const pct = (v: number) => `${Math.min(100, Math.max(0, (v / echelle) * 100)).toFixed(1)}%`;

  function accepter() {
    if (!compte || !ouverte || envoi) return; envoi = true; erreur = '';
    try { accepterProposition(compte.id, id, pid); aller(`/intentions/${id}/accord`); }
    catch (x) { erreur = x instanceof Error ? x.message : 'L’accord n’a pas pu être conclu. Réessayez.'; }
    finally { envoi = false; }
  }
  function refuser() {
    if (!compte || !ouverte) return; erreur = '';
    try { refuserProposition(compte.id, id, pid); contreOuverte = false; } catch (x) { erreur = x instanceof Error ? x.message : 'Impossible de refuser cette proposition.'; }
  }
  function envoyerContre() {
    if (!compte) return; erreur = '';
    try { contreProposer(compte.id, id, pid, valeurContre); envoyee = true; contreOuverte = false; } catch (x) { erreur = x instanceof Error ? x.message : 'La contre-proposition n’a pas pu être envoyée.'; }
  }
  const sousContre = $derived(i && p ? (p.prix - valeurContre > 0 ? `−${p.prix - valeurContre} $ vs proposition` : 'au prix proposé') : '');
</script>

<Ecran titre="Proposition reçue" face="jour" retour="/intentions">
  <h1 class="sr">Proposition reçue</h1>
  {#if !i || !p || !vol || !cie || !e || !d}
    <section class="carte vide"><h2 class="t-section">Proposition introuvable</h2><p class="t-sec">Cette proposition n’existe plus ou n’appartient pas à votre compte.</p><button type="button" class="btn" onclick={() => aller('/intentions')}>Mes intentions</button></section>
  {:else}
    {#if refusee}
      <div class="statut" role="status"><Picto nom="croix" taille={20} /><span><strong>Proposition refusée.</strong> Le vendeur en est informé. Votre intention reste active avec {autres === 0 ? 'aucune autre proposition' : autres === 1 ? '1 autre proposition' : `${autres} autres propositions`}.</span></div>
    {:else if p.statut === 'acceptee'}
      <div class="statut ok" role="status"><Picto nom="ok" taille={20} /><span><strong>Proposition acceptée.</strong> <a href="/intentions/{id}/accord" onclick={(ev) => { ev.preventDefault(); aller(`/intentions/${id}/accord`); }}>Voir l’accord</a></span></div>
    {:else if expiree}
      <div class="statut" role="status"><Picto nom="horloge" taille={20} /><span><strong>Proposition expirée.</strong> Le vendeur ne s’engage plus sur ce prix ; votre intention reste active.</span></div>
    {:else if i.statut !== 'publiee'}
      <div class="statut" role="status"><Picto nom="info" taille={20} /><span><strong>Cette intention n’est plus active.</strong> La proposition ne peut plus être acceptée.</span></div>
    {/if}

    <section class="billet" style:opacity={refusee || expiree ? 0.6 : 1} aria-label="Billet proposé, {cie.nom} {vol.numero.split(' ')[1]}, {villeDe(vol.de)} {vol.de} vers {villeDe(vol.vers)} {vol.vers}, {jourLong(vol.jour)}">
      <div class="b-haut">
        <div class="ent"><span class="sur">{cie.nom} · Vol {vol.numero.split(' ')[1]}</span><span class="chip">{vol.cabine}</span></div>
        <div class="codes"><span class="code">{vol.de}</span><span class="liaison" aria-hidden="true"><span class="pts"></span><Picto nom="avion" taille={20} trait={1.75} /><span class="pts"></span></span><span class="code">{vol.vers}</span></div>
        <div class="horaires">
          <div class="col g1"><span class="mono h">{vol.heureDepart}</span><span class="t-sec">{villeDe(vol.de)}</span></div>
          <span class="duree">{Math.floor(vol.dureeMin / 60)} h {String(vol.dureeMin % 60).padStart(2, '0')} · {vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''}` : 'direct'}</span>
          <div class="col g1 fin"><span class="arr"><span class="mono h">{vol.heureArrivee}</span>{#if vol.plusJours}<span class="mono plus">+{vol.plusJours}</span>{/if}</span><span class="t-sec">{villeDe(vol.vers)}</span></div>
        </div>
        <div class="jour"><Picto nom="calendrier" taille={18} trait={1.75} />{jourLong(vol.jour)} · {vol.jour >= d.du && vol.jour <= d.au ? `dans votre fenêtre ${fenetre(d.du, d.au).replace(/ \d{4}$/, '')}` : 'hors de votre fenêtre'}</div>
      </div>
      <div class="perf" aria-hidden="true"><span class="tiret"></span><span class="e g"></span><span class="e d"></span></div>
      <div class="b-bas"><span class="sur">Proposition du vendeur</span>
        <div class="prix-l"><span class="mono prix">{fmt(p.prix)}</span><span class="ecart-chip mono">{e.court}</span></div></div>
    </section>

    {#if ouverte}
      <section class="valide" aria-labelledby="valid-title">
        <div class="ent"><h2 id="valid-title" class="vt"><Picto nom="horloge" taille={18} />Proposition valide encore</h2><span role="timer" class="mono compte" aria-label={horlogeAria(restant)}>{horloge(restant)}</span></div>
        <div class="jauge" aria-hidden="true"><span style:width="{Math.min(100, (restant / (ENGAGEMENT_H * 3_600_000)) * 100).toFixed(1)}%"></span></div>
        <p class="aide">Le vendeur s’est engagé {ENGAGEMENT_H}&nbsp;h. Passé ce délai, la proposition disparaît ; votre intention reste active.</p>
      </section>
    {/if}

    <section class="cmp" aria-labelledby="cmp-title">
      <h2 id="cmp-title" class="sur">Où se place cette proposition</h2>
      <div class="regle" aria-hidden="true"><span class="rail"></span><span class="bleu" style:width={pct(i.budget)}></span>{#if p.prix > i.budget}<span class="ecart" style:left={pct(i.budget)} style:width={pct(p.prix - i.budget)}></span>{/if}<span class="rep" style:left={pct(i.budget)}></span><span class="bouton" style:left={pct(p.prix)}></span><span class="rep fin"></span></div>
      <dl class="dl">
        <div><dt>Votre prix max</dt><dd class="mono">{fmt(i.budget)}</dd></div>
        <div><dt>Proposition</dt><dd class="mono fort">{fmt(p.prix)}</dd></div>
        <div><dt>Écart</dt><dd class="mono fort" class:orange={e.sens === 'dessus'}>{e.sens === 'egal' ? '= votre prix' : `${e.libelle} (${e.pct})`}</dd></div>
        <div class="sep"><dt>Neuf équivalent aujourd’hui</dt><dd class="mono"><span>{fmt(vol.prixNeuf)}</span> <span class="vert">{ecartNeuf(p.prix, vol)}</span></dd></div>
      </dl>
      {#if e.sens === 'dessus'}<p class="jaune"><Picto nom="info" taille={18} />Si vous acceptez au-dessus de votre prix max, la différence (<span class="mono fort">{fmt(e.abs)}</span>) est débitée en plus des fonds réservés.</p>{/if}
    </section>

    <section class="vendeur" aria-labelledby="seller-title">
      <h2 id="seller-title" class="sur">Vendeur</h2>
      <div class="row g12"><span class="bouclier" aria-hidden="true"><Picto nom="bouclierOk" taille={22} trait={1.75} /></span>
        <span class="col g2"><span class="v1">Détenteur vérifié · « {(vendeur?.prenom ?? 'M').charAt(0).toUpperCase()}. »</span><span class="t-sec">{ordinal(droit ? rangDetenteur(droit) : 1)} détenteur de ce billet · identité vérifiée par NexG-TT</span></span></div>
      <p class="aide">Le billet est revendable et dans le plafond de revente. À l’accord, le droit passe à votre nom dans le registre ; la commission est à la charge du vendeur.</p>
    </section>

    {#if contreOuverte && ouverte}
      <section class="contre" aria-labelledby="counter-title">
        <h2 id="counter-title" class="t-bloc">Contre-proposer</h2>
        <div class="grosprix" aria-live="polite"><span class="mono montant">{fmt(valeurContre)}</span><span class="vs">{sousContre}</span></div>
        <div class="col g2"><label for="counter-range" class="leg">Entre votre prix max et la proposition (pas de {PAS_PRIX}&nbsp;$)</label>
          <input id="counter-range" type="range" min={i.budget} max={p.prix} step={PAS_PRIX} value={valeurContre} aria-valuetext={fmt(valeurContre)} oninput={(ev) => (choix = Number((ev.currentTarget as HTMLInputElement).value))} onchange={(ev) => (choix = Number((ev.currentTarget as HTMLInputElement).value))} />
          <div class="bornes mono" aria-hidden="true"><span>{fmt(i.budget)} · votre max</span><span>{fmt(p.prix)} · proposition</span></div></div>
        <button type="button" class="b-sombre" onclick={envoyerContre}>Envoyer <span class="mono">{fmt(valeurContre)}</span></button>
        <p class="aide">Le vendeur aura {ENGAGEMENT_H}&nbsp;h pour accepter ou refuser. En attendant, cette proposition à {fmt(p.prix)} reste acceptable.</p>
      </section>
    {/if}
    {#if (envoyee || contre) && !contreOuverte && !refusee}
      <div class="statut ok" role="status"><Picto nom="ok" taille={20} trait={2} /><span><strong>Contre-proposition de <span class="mono">{fmt(contre?.prix ?? valeurContre)}</span> envoyée.</strong> <span class="gris">Le vendeur a {ENGAGEMENT_H}&nbsp;h pour répondre. Vous pouvez toujours accepter {fmt(p.prix)} d’ici là.</span></span></div>
    {/if}
    {#if erreur}<p class="err" role="alert"><Picto nom="alerte" taille={16} />{erreur}</p>{/if}
    {#if ouverte}<button type="button" class="refuser" onclick={refuser}><Picto nom="croix" taille={18} />Refuser cette proposition</button>{/if}
  {/if}

  {#snippet pied()}
    {#if i && p && vol}
      {#if ouverte}
        <button type="button" class="btn" disabled={envoi} onclick={accepter}>{envoi ? 'Conclusion de l’accord…' : 'Accepter'} {#if !envoi}<span class="mono">{fmt(p.prix)}</span> (démo){/if}</button>
        {#if peutContre}<button type="button" class="btn sec" aria-expanded={contreOuverte} aria-controls="counter-title" onclick={() => { contreOuverte = !contreOuverte; if (contreOuverte) envoyee = false; }}><Picto nom="echange" taille={20} />{contre || envoyee ? 'Modifier ma contre-proposition' : contreOuverte ? 'Annuler la contre-proposition' : 'Contre-proposer'}</button>{/if}
      {:else}
        <button type="button" class="btn sec" onclick={() => aller('/intentions')}>Retour aux propositions</button>
      {/if}
    {/if}
  {/snippet}
</Ecran>

<style>
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .statut { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #fff; border: 1px solid #d3dce6; font: 400 14px/20px 'Barlow', sans-serif; color: #3e4f66; } .statut strong { color: #0b1b2e; font-weight: 600; } .statut :global(svg) { margin-top: 1px; }
  .statut.ok { background: rgba(11, 122, 85, 0.1); border-color: rgba(11, 122, 85, 0.35); color: #0b1b2e; } .statut.ok :global(svg) { color: #0b7a55; } .gris { color: #3e4f66; }
  .sur { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; }
  .billet { position: relative; background: #fff; color: #0b1b2e; border-radius: 18px; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); }
  .b-haut { padding: 16px 18px 14px; display: flex; flex-direction: column; gap: 12px; } .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .chip { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: #e3eaf2; color: #3e4f66; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .codes { display: flex; align-items: center; gap: 10px; } .code { font: 700 clamp(38px, 12.3vw, 48px)/48px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .liaison { flex: 1; display: flex; align-items: center; gap: 6px; color: #1a64c8; } .pts { flex: 1; border-top: 2px dotted #b9c5d3; }
  .horaires { display: grid; grid-template-columns: 1fr auto 1fr; align-items: end; gap: 8px; } .col.g1 { gap: 1px; } .col.g2 { gap: 2px; } .col.fin { align-items: flex-end; } .h { font: 600 18px/24px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .duree { font: 500 13px/18px 'Barlow', sans-serif; color: #3e4f66; text-align: center; } .arr { display: flex; align-items: flex-start; gap: 2px; } .plus { font: 600 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #3e4f66; }
  .jour { display: flex; align-items: center; gap: 8px; min-height: 40px; padding: 6px 12px; border-radius: 10px; background: #eef3f8; font: 600 14px/20px 'Barlow', sans-serif; } .jour :global(svg) { flex: none; }
  .perf { position: relative; height: 22px; } .tiret { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed #d3dce6; } .e { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .e.g { left: -11px; } .e.d { right: -11px; }
  .b-bas { padding: 4px 18px 18px; display: flex; flex-direction: column; gap: 6px; } .prix-l { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; } .prix { font: 600 34px/40px 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap; font-variant-numeric: tabular-nums; }
  .ecart-chip { display: inline-flex; align-items: center; height: 28px; padding: 0 10px; border-radius: 999px; background: #e3eaf2; color: #3e4f66; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap; }
  .valide { display: flex; flex-direction: column; gap: 8px; padding: 14px 16px; border-radius: 16px; background: #fff; border: 1px solid #d3dce6; } .vt { margin: 0; display: flex; align-items: center; gap: 8px; font: 600 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .compte { font: 600 18px/24px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .jauge { height: 6px; border-radius: 3px; background: #e3eaf2; overflow: hidden; } .jauge span { display: block; height: 100%; border-radius: 3px; background: #0b1b2e; } .aide { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: #5e6e84; }
  .cmp { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #fff; border: 1px solid #d3dce6; }
  .regle { position: relative; height: 34px; } .rail { position: absolute; left: 0; right: 0; top: 14px; height: 6px; border-radius: 3px; background: #e3eaf2; } .bleu { position: absolute; left: 0; top: 14px; height: 6px; background: #1a64c8; } .ecart { position: absolute; top: 14px; height: 6px; background: #b4520f; }
  .rep { position: absolute; top: 9px; width: 2px; height: 16px; background: #0b1b2e; margin-left: -1px; } .rep.fin { right: 0; left: auto; margin: 0; } .bouton { position: absolute; top: 6px; width: 22px; height: 22px; box-sizing: border-box; margin-left: -11px; border-radius: 999px; background: #fff; border: 3px solid #b4520f; }
  .dl { margin: 0; display: flex; flex-direction: column; gap: 8px; } .dl div { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .dl div.sep { padding-top: 8px; border-top: 1px solid #d3dce6; } .dl dt { font: 400 15px/20px 'Barlow', sans-serif; color: #3e4f66; } .dl dd { margin: 0; font: 500 15px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; text-align: right; }
  .fort { font-weight: 600; } .orange { color: #b4520f; } .vert { color: #0b7a55; font-weight: 600; }
  .jaune { margin: 0; display: flex; align-items: flex-start; gap: 8px; padding: 10px 12px; border-radius: 12px; background: rgba(255, 210, 63, 0.3); color: #5c4600; font: 500 13px/18px 'Barlow', sans-serif; } .jaune :global(svg) { flex: none; margin-top: 1px; }
  .vendeur { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #fff; border: 1px solid #d3dce6; } .bouclier { flex: none; width: 44px; height: 44px; border-radius: 999px; background: rgba(11, 122, 85, 0.1); color: #0b7a55; display: grid; place-items: center; } .v1 { font: 600 16px/22px 'Barlow', sans-serif; } .g12 { gap: 12px; }
  .contre { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: #fff; border: 2px solid #1a64c8; } .t-bloc { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .grosprix { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 10px; } .montant { font: 600 clamp(32px, 10.2vw, 40px)/44px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .vs { font: 500 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .leg { font: 500 13px/18px 'Barlow', sans-serif; color: #3e4f66; }
  input[type='range'] { width: 100%; height: 44px; margin: 0; accent-color: #1a64c8; cursor: pointer; } .bornes { display: flex; justify-content: space-between; gap: 8px; font: 400 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: #5e6e84; }
  .b-sombre { display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; border-radius: 14px; background: #0b1b2e; color: #fff; border: 0; font: 700 16px/1 'Barlow', sans-serif; cursor: pointer; }
  .refuser { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 0 8px; border: 0; background: transparent; color: #c2362f; font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; }
  .err { margin: 0; display: flex; align-items: center; gap: 6px; font: 500 13px/18px 'Barlow', sans-serif; color: #c2362f; }
</style>
