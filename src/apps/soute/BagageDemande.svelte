<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from './Picto.svelte';
  import MemeVol from './MemeVol.svelte';
  import Etiquette from './Etiquette.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { peutEchanger } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, departDuVol, volDe } from '../../domain/marche.ts';
  import { KG_BAGAGE, numeroVol, plafondBagage, resoudreDroit } from '../bagages/soute.ts';
  import { heure, instantJourMois, jourCourt, jourMois, pluriel, pourcent } from '../bagages/format.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { reseau } from '../acces/reseau.svelte.ts';
  import { NOMBRE_MAX_DEMANDE, NOMBRE_MIN_DEMANDE, RESERVE_MINUTES, TAUX_AFFICHES, bornesPrix, caler, ecartPlafond, prixMaxSuggere } from './calcul.ts';
  import { demandesOuvertes, echeanceNommage, offresDuVol, refDemande } from './lecture.ts';
  import { ErreurBagage, annulerDemandeBagage, mesDemandes, publierDemandeBagage } from './actions.ts';
  import type { ModeDemande } from './lecture.ts';

  /** Chercher un bagage sur ce vol (face nuit, planche m2-18) : publier une demande (nombre, prix max, alerte, mode) ; mes demandes (annuler). `?droit=` : la réservation. */
  const compte = $derived(compteCourant());
  const droit = $derived(compte ? resoudreDroit(compte.id, param('droit')) : undefined);
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const cie = $derived(vol ? compagnieDe(vol) : undefined);
  const ville = $derived(app.monde.aeroports.find((a) => a.code === vol?.vers)?.ville ?? vol?.vers ?? '');
  const plafond = $derived(vol ? plafondBagage(vol) : 150);
  const bornes = $derived(bornesPrix(plafond));
  const ouvert = $derived(vol ? peutEchanger(departDuVol(vol), maintenant()) : false);
  const offres = $derived(vol && compte ? offresDuVol(vol.id).filter((b) => b.detenteurId !== compte.id).map((b) => b.prix) : []);
  const bids = $derived(vol ? demandesOuvertes(vol.id).map((d) => d.prixMax) : []);
  const mes = $derived(compte && vol ? mesDemandes(compte.id, vol.id) : []);

  let nombre = $state(NOMBRE_MIN_DEMANDE), saisi = $state<number | null>(null), alerte = $state(true), mode = $state<ModeDemande>('prevenir');
  let erreur = $state(''), occupe = $state(false), message = $state('');
  const prixMax = $derived(saisi ?? prixMaxSuggere(offres, bids, plafond));
  const sous = $derived(ecartPlafond(prixMax, plafond));
  const budget = $derived(nombre * prixMax);
  const ref = $derived(droit ? refDemande(droit.id) : '');
  const nom = $derived(droit?.voyageur ? `${droit.voyageur.prenom} ${droit.voyageur.nom[0] ?? ''}.` : compte ? `${compte.prenom} ${compte.nom[0] ?? ''}.` : '');
  const peutPublier = $derived(!!droit && ouvert && reseau.enLigne && !occupe);
  const aideRegle = $derived(`Plafond = prix de la compagnie pour un bagage supplémentaire sur ce vol (${fmt(plafond)}, exemple). Meilleure demande actuelle sur ce vol : ${bids.length ? fmt(Math.max(...bids)) : 'aucune'} · offre la moins chère : ${offres.length ? fmt(Math.min(...offres)) : 'aucune'}.`);
  const num = $derived(vol ? numeroVol(vol) : '');
  const jourMaj = $derived(vol ? jourMois(vol.jour).replace('.', '').toUpperCase() : '');
  const jourVol = $derived(vol ? `${jourCourt(vol.jour).charAt(0).toUpperCase()}${jourCourt(vol.jour).slice(1)} ${vol.jour.slice(0, 4)}` : '');
  const q = $derived(droit ? `?droit=${encodeURIComponent(droit.id)}` : '');

  function publier() {
    if (!compte || !droit || !vol || !peutPublier) return; erreur = ''; message = ''; occupe = true;
    try {
      const r = publierDemandeBagage(compte.id, droit.id, { nombre, prixMax, mode, alerte, ref });
      if (r.achat) { montrer(`${pluriel(r.achat.lignes.length, 'bagage acheté', 'bagages achetés')} pour ${fmt(r.achat.total)}`); aller('/bagages/transfere'); return; }
      montrer('Demande publiée');
      message = r.correspondances ? `Demande publiée : ${pluriel(r.correspondances, 'bagage correspond', 'bagages correspondent')} déjà jusqu’à ${fmt(prixMax)}. Confirmez dans la soute du vol : l’offre vous est réservée ${RESERVE_MINUTES} min (hypothèse).` : `Demande publiée : ${pluriel(nombre, 'bagage')} jusqu’à ${fmt(prixMax)} chacun. Vous serez prévenu dès qu’une offre correspond.`;
      saisi = null; nombre = NOMBRE_MIN_DEMANDE;
    } catch (e) { erreur = e instanceof ErreurBagage ? e.message : 'La publication a échoué. Réessayez.'; } finally { occupe = false; }
  }
  function annuler(id: string) {
    if (!compte) return;
    try { annulerDemandeBagage(compte.id, id); montrer('Demande retirée'); message = ''; } catch (e) { erreur = e instanceof ErreurBagage ? e.message : 'Impossible de retirer la demande.'; }
  }
</script>

{#snippet pied()}
  <div class="barre-pied">
  <p class="ligne-bas"><span>{pluriel(nombre, 'bagage')} · budget max <span class="mono clair">{fmt(budget)}</span></span><span>{mode === 'auto' ? 'Achat automatique' : 'Confirmation manuelle'}</span></p>
  <button type="button" class="btn" aria-disabled={peutPublier ? undefined : 'true'} onclick={publier}><Picto nom="loupe" taille={20} />Publier ma demande à <span class="mono">{fmt(prixMax)}</span></button>
  </div>
{/snippet}

<Ecran titre="Chercher un bagage sur ce vol" face="nuit" retour={vol ? `/soute/${vol.id}` : '/portefeuille'} pied={compte && droit && vol && cie && ouvert ? pied : undefined}>
  {#if !compte || !droit || !vol || !cie}
    <section class="vide carte" aria-live="polite">
      <span class="rond" aria-hidden="true"><Picto nom="valise" taille={26} /></span>
      <h2 class="t-section">Aucun voyage à venir</h2>
      <p class="t-sec">Vous pouvez chercher un bagage dès que vous détenez un droit de voyage sur un vol.</p>
      <button type="button" class="btn sec" onclick={() => aller('/portefeuille')}>Voir mon portefeuille</button>
    </section>
  {:else}
    <MemeVol vol="{vol.numero} · {jourMois(vol.jour)} {vol.heureDepart}" />
    <div class="vol-carte"><span class="trajet">{vol.de} → {vol.vers}</span><span class="detail">{jourVol}<br />{cie.nom} {vol.numero} · {vol.heureDepart}</span><span class="qui"><span class="q1">Voyageur</span><span class="mono">{nom}</span></span></div>

    {#if !ouvert}
      <p class="alerte" role="alert"><Picto nom="alerte" taille={20} /><span><strong>L’échéance de nommage est passée.</strong> Plus aucune demande de bagage ne peut être publiée sur ce vol.</span></p>
    {/if}

    {#if mes.length}
      <section class="mes carte2" aria-labelledby="mes-h">
        <h2 id="mes-h" class="t-h">Mes demandes sur ce vol</h2>
        <ul>
          {#each mes as d (d.id)}
            <li><span class="d1"><span class="mono clair">{pluriel(d.nombre, 'bagage')}</span> jusqu’à <span class="mono clair">{fmt(d.prixMax)}</span></span><span class="d2">{d.ref ? `${d.ref} · ` : ''}{d.mode === 'auto' ? 'Achat automatique' : 'Vous confirmez'}</span>
              <button type="button" class="btn sec sm" aria-label="Annuler la demande de {pluriel(d.nombre, 'bagage')} jusqu’à {fmt(d.prixMax)}" onclick={() => annuler(d.id)}><Picto nom="croix" taille={16} />Annuler</button></li>
          {/each}
        </ul>
      </section>
    {/if}

    {#if ouvert}
      <section class="nombre" aria-labelledby="qty-h">
        <div><h2 id="qty-h" class="n1">Nombre de bagages</h2><p class="t-sec">{KG_BAGAGE} kg chacun · de {NOMBRE_MIN_DEMANDE} à {NOMBRE_MAX_DEMANDE} par demande</p></div>
        <div class="pas" role="group" aria-labelledby="qty-h">
          <button type="button" aria-label="Un bagage de moins" aria-disabled={nombre <= NOMBRE_MIN_DEMANDE ? 'true' : undefined} onclick={() => (nombre = Math.max(NOMBRE_MIN_DEMANDE, nombre - 1))}><Picto nom="moins" taille={20} trait={2.25} /></button>
          <span class="mono val" aria-live="polite">{nombre}</span>
          <button type="button" aria-label="Un bagage de plus" aria-disabled={nombre >= NOMBRE_MAX_DEMANDE ? 'true' : undefined} onclick={() => (nombre = Math.min(NOMBRE_MAX_DEMANDE, nombre + 1))}><Picto nom="plus" taille={20} trait={2.25} /></button>
        </div>
      </section>

      <div class="prix-bloc">
        <label id="pm-l" for="prixmax" class="sur">Prix max par bagage</label>
        <p class="gros mono" aria-hidden="true">{fmt(prixMax)}</p>
        {#if sous.auPlafond}<p class="plaf"><Picto nom="cadenas" taille={14} />Au plafond : égal au prix compagnie</p>
        {:else}<p class="t-sec"><span class="mono clair">−{fmt(sous.sous)}</span> sous le prix compagnie d’un bagage supplémentaire ({fmt(plafond)})</p>{/if}
        <input id="prixmax" type="range" min={bornes.min} max={bornes.max} step={bornes.pas} value={prixMax} aria-valuetext={fmt(prixMax)} aria-describedby="prix-regle" oninput={(e) => { saisi = caler(Number(e.currentTarget.value), plafond); erreur = ''; }} />
        <div class="bornes mono" aria-hidden="true"><span>{bornes.min}&nbsp;$</span><span>Plafond {fmt(plafond)}</span></div>
        <p id="prix-regle" class="regle">{aideRegle}</p>
      </div>

      <label class="alerte-ligne" for="alerte">
        <Picto nom="cloche" taille={22} trait={1.75} />
        <span class="al"><span class="a1">Me prévenir dès qu’un bagage correspond</span><span class="a2">{alerte ? `Notification à chaque bagage proposé à ${fmt(prixMax)} ou moins` : 'Désactivé : consultez la soute du vol vous-même'}</span></span>
        <span class="inter"><input id="alerte" type="checkbox" role="switch" bind:checked={alerte} /><span class="bouton" aria-hidden="true"></span></span>
      </label>

      <section class="apercu" aria-labelledby="apercu-h">
        <div class="titre-ligne"><h2 id="apercu-h" class="t-h">Votre demande</h2><span class="aide">Bagage attendu · aperçu</span></div>
        <Etiquette demande titre="Demande · bagage attendu" reference={ref} iata={vol.vers} {ville} trajet="{vol.de} → {vol.vers}" ligne="{vol.numero} · {jourMaj}" bas="NXG {num} {vol.jour.slice(8)}{vol.jour.slice(5, 7)} D{nombre}"
          aria="Aperçu de la demande : {pluriel(nombre, 'bagage')} de {KG_BAGAGE} kg sur le vol {vol.numero} du {jourMois(vol.jour)}, {vol.de} vers {ville} {vol.vers}, prix maximal {fmt(prixMax)} par bagage">
          {#snippet pastilles()}<span class="kg mono">{nombre} × {KG_BAGAGE} KG</span><span class="max mono">≤ {fmt(prixMax)} / bagage</span>{/snippet}
        </Etiquette>
        <p class="t-sec">Budget maximal : <span class="mono clair">{fmt(budget)}</span> ({nombre} × {fmt(prixMax)}). Rien n’est prélevé tant qu’aucun bagage n’est trouvé.</p>
      </section>

      <section class="suite" aria-labelledby="next-h">
        <h2 id="next-h" class="t-h">Ce qui se passe ensuite</h2>
        <ol>
          <li><span class="n">1</span><span class="tx"><span class="s1">Les passagers du vol sont notifiés</span><span class="s2">Seuls les passagers de {vol.numero} du {jourMois(vol.jour)} qui ont un bagage inutilisé reçoivent votre demande, sans votre nom.</span></span></li>
          <li><span class="n">2</span><span class="tx"><span class="s1">Dès qu’une offre ≤ {fmt(prixMax)} apparaît</span>
            <span role="radiogroup" aria-label="Que faire quand une offre correspond" class="modes">
              <label class="mode" class:on={mode === 'prevenir'} for="mode-notify"><input id="mode-notify" type="radio" name="mode" value="prevenir" bind:group={mode} /><span class="mt"><span class="m1">Vous êtes prévenu, vous confirmez</span><span class="m2">L’offre vous est réservée {RESERVE_MINUTES} min (hypothèse)</span></span></label>
              <label class="mode" class:on={mode === 'auto'} for="mode-auto"><input id="mode-auto" type="radio" name="mode" value="auto" bind:group={mode} /><span class="mt"><span class="m1">Achat automatique</span><span class="m2">La moins chère ≤ {fmt(prixMax)} est achetée pour vous</span></span></label>
            </span></span></li>
          <li><span class="n">3</span><span class="tx"><span class="s1">Le bagage est ajouté à votre réservation</span><span class="s2">À votre nom ({nom}), sur {droit.ref}, après confirmation de la compagnie. Le vendeur perd ce bagage.</span></span></li>
        </ol>
        <p class="regle">Commission NexG-TT&nbsp;: {pourcent(TAUX_AFFICHES.pass)} (Pass) · {pourcent(TAUX_AFFICHES.sansPass)} sans Pass — hypothèse. Prix plafonné au prix compagnie, règle provisoire.</p>
      </section>

      <p class="echeance"><Picto nom="horloge" taille={18} /><span>Demande active jusqu’au <span class="mono">{instantJourMois(echeanceNommage(vol))} {heure(echeanceNommage(vol))}</span>, à l’échéance de nommage (à valider). Vous pouvez la retirer à tout moment.</span></p>

      {#if !reseau.enLigne}<p class="alerte" role="alert"><Picto nom="alerte" taille={20} /><span>Vous êtes hors ligne : la publication attend le retour du réseau.</span></p>{/if}
      <div aria-live="polite">
        {#if erreur}<p class="alerte" role="alert"><Picto nom="alerte" taille={20} /><span>{erreur}</span></p>{/if}
        {#if message}<p class="succes" role="status"><Picto nom="ok" taille={18} trait={2.25} /><span>{message} <a href="/soute/{vol.id}" onclick={(e) => { e.preventDefault(); aller(`/soute/${vol.id}`); }}>Voir la soute du vol</a></span></p>{/if}
      </div>
    {/if}
    <p class="aide centre">Sous réserve d’accord avec la compagnie. Démo — aucun paiement réel. Données fictives.</p>
  {/if}
</Ecran>

<style>
  .barre-pied { display: flex; flex-direction: column; gap: 8px; margin: -12px -20px calc(-12px - env(safe-area-inset-bottom)); padding: 12px 20px calc(12px + env(safe-area-inset-bottom)); background: var(--bg); border-top: 1px solid var(--line); }
  .clair { color: var(--ink); } .mono { font-weight: 600; font-variant-numeric: tabular-nums; } .centre { text-align: center; } .aide { font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: .12em; text-transform: uppercase; color: var(--ink2); } .t-h { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: .04em; text-transform: uppercase; }
  .vide { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 12px; padding: 28px 20px; } .rond { width: 56px; height: 56px; border-radius: 999px; display: grid; place-items: center; background: var(--surface2); color: var(--ink2); }
  .vol-carte { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 14px; background: #fff; color: #121418; }
  .trajet { font: 700 clamp(21px, 6.7vw, 26px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: .02em; white-space: nowrap; } .detail { flex: 1; min-width: 0; font: 400 12px/16px 'Barlow', sans-serif; color: #555C6B; }
  .qui { display: flex; flex-direction: column; align-items: flex-end; } .q1 { font: 600 11px/16px 'Barlow', sans-serif; color: #555C6B; } .qui .mono { font-size: 14px; }
  .alerte { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--err-soft); color: var(--err); font: 600 13px/18px 'Barlow', sans-serif; } .alerte > :global(svg), .succes > :global(svg), .echeance > :global(svg) { flex: none; margin-top: 1px; }
  .succes { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--ok-soft); color: var(--ok); font: 600 13px/18px 'Barlow', sans-serif; } .succes a { color: var(--accent); text-decoration: underline; }
  .mes { display: flex; flex-direction: column; gap: 10px; padding: 14px 16px; } .mes ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; } .mes li { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 2px 10px; padding: 8px 0; border-top: 1px solid var(--line); } .mes li:first-child { border-top: 0; }
  .d1 { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .d2 { grid-column: 1; font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); } .mes li :global(.btn) { grid-column: 2; grid-row: 1 / span 2; }
  .nombre { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .n1 { font: 700 15px/20px 'Barlow', sans-serif; }
  .pas { display: flex; align-items: center; gap: 6px; flex: none; } .pas button { width: 44px; height: 44px; margin: 0; padding: 0; border-radius: 12px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--ink); display: grid; place-items: center; cursor: pointer; } .pas button[aria-disabled='true'] { color: var(--ink3); cursor: not-allowed; }
  .val { min-width: 36px; text-align: center; font-size: 24px; }
  .prix-bloc { display: flex; flex-direction: column; gap: 8px; padding: 18px; border-radius: 20px; background: #060708; border: 1px solid var(--line); }
  .gros { font-weight: 600; font-size: clamp(44px, min(16.4vw, 7.6dvh), 64px); line-height: 1.06; letter-spacing: -.02em; white-space: nowrap; } .plaf { display: flex; align-items: center; gap: 6px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--signal); }
  input[type='range'] { width: 100%; height: 44px; margin: 4px 0 0; accent-color: var(--signal); cursor: pointer; } .bornes { display: flex; justify-content: space-between; font-size: 12px; font-weight: 400; color: var(--ink3); }
  .regle { margin-top: 4px; padding-top: 10px; border-top: 1px solid #1A1C21; font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
  .alerte-ligne { display: flex; align-items: center; gap: 12px; min-height: 60px; padding: 10px 14px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); cursor: pointer; color: var(--ink2); }
  .al { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .a1 { font: 600 14px/18px 'Barlow', sans-serif; color: var(--ink); } .a2 { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); }
  .inter { position: relative; width: 52px; height: 32px; flex: none; } .inter input { appearance: none; -webkit-appearance: none; display: block; margin: 0; width: 52px; height: 32px; border-radius: 999px; background: var(--surface3); border: 1px solid var(--line-strong); cursor: pointer; } .inter input:checked { background: var(--signal); border-color: var(--signal); }
  .inter .bouton { position: absolute; top: 4px; left: 4px; width: 24px; height: 24px; border-radius: 999px; background: var(--ink2); pointer-events: none; transition: left .15s; } .inter input:checked + .bouton { left: 24px; background: #0D0E11; }
  .apercu { display: flex; flex-direction: column; gap: 10px; } .titre-ligne { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .kg { display: inline-flex; align-items: center; height: 30px; padding: 0 10px; border-radius: 6px; border: 2px dashed var(--ink3); font-size: 16px; color: var(--ink); } .max { display: inline-flex; align-items: center; height: 30px; padding: 0 10px; border-radius: 6px; background: rgba(98, 199, 255, .12); color: var(--up); font-size: 14px; white-space: nowrap; }
  .suite { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); } .suite ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 14px; } .suite li { display: flex; align-items: flex-start; gap: 12px; }
  .n { width: 32px; height: 32px; flex: none; border-radius: 999px; background: var(--surface3); display: grid; place-items: center; font: 600 14px/1 'IBM Plex Mono', monospace; } .tx { display: flex; flex-direction: column; gap: 2px; padding-top: 5px; min-width: 0; flex: 1; }
  .s1 { font: 600 15px/20px 'Barlow', sans-serif; } .s2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .modes { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; }
  .mode { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 6px 12px; border-radius: 12px; background: var(--surface2); border: 1px solid var(--line-strong); cursor: pointer; } .mode.on { border: 2px solid var(--signal); padding: 5px 11px; }
  .mode input { width: 20px; height: 20px; margin: 0; accent-color: var(--signal); flex: none; cursor: pointer; } .mt { display: flex; flex-direction: column; gap: 1px; } .m1 { font: 600 14px/18px 'Barlow', sans-serif; } .m2 { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); }
  .echeance { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: rgba(255, 210, 63, .12); color: var(--signal); font: 600 13px/18px 'Barlow', sans-serif; }
  .ligne-bas { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink2); } .ligne-bas > span:last-child { text-align: right; }
</style>
