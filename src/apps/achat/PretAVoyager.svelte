<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import { droitDuCompte, pnrDe } from './actions.ts';
  import { dateFinalisation, etapesChaine } from './chaine.ts';
  import { chronologie, statutVoyage } from './chrono.ts';
  import { dureeVol, heure, jourMoisAnnee, jourMoisSiAnnee } from './dates.ts';
  import Introuvable from './Introuvable.svelte';
  import { naviguer } from './lien.ts';
  import Pic from './Pic.svelte';
  import { bagagesDuDroit, basculerWallet, dansLeWallet, KG_BAGAGE, noteBagages } from './preparation.ts';
  import { nomEnCapitales } from './voyageur.ts';

  /** Prêt à voyager : la carte d'embarquement « Nommé — prêt », sans code (seule la compagnie en émet un), la chaîne de détention finalisée et l'ajout simulé au portefeuille du téléphone. */
  let { droitId = '' }: { droitId?: string } = $props();
  const t0 = maintenant();
  const compte = $derived(compteCourant());
  const droit = $derived(droitDuCompte(droitId, compte?.id));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const ch = $derived(vol ? chronologie(vol, t0) : undefined);
  const statut = $derived(droit ? statutVoyage(droit) : 'autre');
  const nomme = $derived(statut === 'nomme' || statut === 'parti');
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const bagages = $derived(droit ? bagagesDuDroit(app.monde.bagages, droit) : undefined);
  const etapes = $derived(droit ? etapesChaine(droit, app.monde, t0) : []);
  const quandNomme = $derived(droit ? dateFinalisation(droit, t0) : t0);
  const ajoute = $derived(droit ? dansLeWallet(droit.id) : false);
  const direct = $derived(vol ? (vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''}` : 'Direct') : '');
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !droit || !vol || !ch || !compte}
  <Introuvable titre="Droit introuvable" message="Ce droit de voyage n’est pas dans votre portefeuille." lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/portefeuille" />
{:else if !nomme || !droit.voyageur}
  <Ecran titre="Prêt à voyager" face="jour" retour="/voyage/{droit.id}">
    <div class="carte col g12"><span class="puce signal"><Icone nom="horloge" taille={14} trait={2} />À nommer</span><p class="t-section">Le voyageur n’est pas encore nommé</p>
      <p class="t-sec">La carte d’embarquement apparaît ici une fois le voyageur transmis à {compagnieDe(vol).nom}.</p>
      {#if ch.ouvert}<a class="btn" href="/nommer/{droit.id}" onclick={(e) => naviguer(e, `/nommer/${droit.id}`)}>Nommer le voyageur</a>{/if}
      <a class="btn sec" href="/voyage/{droit.id}" onclick={(e) => naviguer(e, `/voyage/${droit.id}`)}>Voir mon voyage</a></div>
  </Ecran>
{:else}
  <Ecran titre="Prêt à voyager" face="jour" retour="/portefeuille">
    <p class="transmis" role="status"><Icone nom="ok" taille={18} trait={2.25} />Nom transmis à {compagnieDe(vol).nom} le {jourMoisAnnee(quandNomme)} (démo)</p>

    <article class="carte-b" aria-labelledby="bp-h">
      <div class="haut">
        <span class="statut"><Icone nom="ok" taille={14} trait={2.5} />Nommé — prêt à voyager</span>
        <div class="col g2"><span class="etiq">Voyageur</span><h2 id="bp-h" class="nomv">{nomEnCapitales(droit.voyageur)}</h2></div>
        <div class="trajet"><span class="code">{vol.de}</span><span class="fil" aria-hidden="true"><span class="pointille"></span><Icone nom="avion" taille={20} /><span class="pointille"></span></span><span class="code">{vol.vers}</span></div>
        <div class="horaires">
          <span class="col g2"><span class="mono h">{vol.heureDepart}</span><span class="t-sec">{ville(vol.de)}</span></span>
          <span class="dur">{direct} · {dureeVol(vol.dureeMin)}</span>
          <span class="col g2 fin"><span class="mono h">{vol.heureArrivee}{#if vol.plusJours} <span class="plus">(+{vol.plusJours})</span>{/if}</span><span class="t-sec">{ville(vol.vers)}</span></span>
        </div>
      </div>
      <div class="perfore sep" aria-hidden="true"></div>
      <dl class="infos">
        <div><dt>Vol</dt><dd class="mono">{compagnieDe(vol).nom} {vol.numero.split(' ')[1]}</dd></div>
        <div><dt>Date</dt><dd class="mono">{jourMoisAnnee(ch.depart)}</dd></div>
        <div><dt>Siège</dt><dd class="siege">{droit.siege ?? 'À choisir auprès de la compagnie'}</dd></div>
        <div><dt>Réf. compagnie</dt><dd class="mono ref">{pnrDe(droit)} <span class="fict">(fictive)</span></dd></div>
        <div class="large"><dt>Bagages</dt><dd class="bag"><span class="mono">{bagages?.libres ?? droit.bagagesInclus} × {KG_BAGAGE} kg</span>{#if bagages && noteBagages(bagages)}<span class="t-sec">{noteBagages(bagages)}</span>{/if}</dd></div>
      </dl>
      <div class="bas">
        <div class="aucun"><span class="scan" aria-hidden="true"><Pic nom="scan" taille={30} /></span>
          <span class="col g3"><span class="a1">Carte d’embarquement émise par {compagnieDe(vol).nom} à l’enregistrement</span><span class="t-sec">Aucun code ici&nbsp;: seule la compagnie l’émet.</span></span></div>
        <div class="pied-b"><span class="ferme"><Icone nom="cadenas" taille={16} trait={2} />Ce billet ne peut plus être revendu.</span><span class="mono ref-nxg">{droit.ref}</span></div>
      </div>
    </article>

    <div class="col g8">
      <button type="button" class="btn sec" aria-pressed={ajoute ? 'true' : 'false'} onclick={() => basculerWallet(droit.id)}>
        {#if ajoute}<span class="vert"><Icone nom="ok" taille={20} trait={2.25} /></span>Ajouté au portefeuille du téléphone{:else}<Icone nom="portefeuille" taille={20} />Ajouter au portefeuille du téléphone{/if}</button>
      {#if ajoute}<p class="note" role="status">Démo&nbsp;: aucun ajout réel n’a été effectué.</p>{/if}
    </div>

    <section class="chaine" aria-labelledby="ch-h">
      <div class="ligne"><h2 id="ch-h" class="t-h2">Chaîne de détention</h2><span class="finalisee">Finalisée</span></div>
      <ol class="liste-plain etapes">
        {#each etapes as e (e.id)}
          <li class="et"><span class="dt" class:vert={e.finale}>{e.date}</span>
            <span class="axe" aria-hidden="true">{#if e.finale}<span class="pt ok"><Icone nom="ok" taille={10} trait={3.5} /></span><span class="tr pointille"></span>{:else}<span class="pt"></span><span class="tr"></span>{/if}</span>
            <span class="col g2 corps"><span class="t1" class:vert={e.finale}>{e.titre}</span><span class="t-sec">{e.detail}</span></span></li>
        {/each}
        <li class="et"><span class="dt">Selon {compagnieDe(vol).nom}</span><span class="axe" aria-hidden="true"><span class="pt creux"></span><span class="tr pointille"></span></span>
          <span class="col g2 corps"><span class="t1">Enregistrement en ligne</span><span class="t-sec">Choix du siège et carte d’embarquement, chez la compagnie.</span></span></li>
        <li class="et dernier"><span class="dt mono">{jourMoisSiAnnee(ch.depart, t0)}<br />{heure(ch.depart)}</span><span class="axe" aria-hidden="true"><span class="pt creux"></span></span>
          <span class="col g2 corps"><span class="t1">Départ {vol.de} → {vol.vers}</span><span class="t-sec">{compagnieDe(vol).nom} {vol.numero.split(' ')[1]} · {ville(vol.de)} → {ville(vol.vers)}</span></span></li>
      </ol>
    </section>

    <a class="retour-p" href="/portefeuille" onclick={(e) => naviguer(e, '/portefeuille')}>Retour au portefeuille<Icone nom="suivant" taille={18} trait={2} /></a>
  </Ecran>
{/if}

<style>
  .transmis { display: flex; align-items: center; gap: 8px; font: 600 14px/20px 'Barlow', sans-serif; color: var(--ok); }
  .carte-b { position: relative; border-radius: 20px; background: var(--surface); box-shadow: var(--ombre); }
  .haut { padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 14px; }
  .statut { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 28px; padding: 4px 12px; border-radius: 999px; background: var(--ok-soft); color: var(--ok); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .g2 { gap: 2px; } .g3 { gap: 3px; }
  .etiq { font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .nomv { font: 700 32px/34px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; overflow-wrap: anywhere; }
  .trajet { display: flex; align-items: center; gap: 10px; }
  .code { font: 700 48px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .fil { flex: 1; display: flex; align-items: center; gap: 6px; color: var(--accent); min-width: 0; } .pointille { flex: 1; border-top: 2px dotted var(--line-strong); }
  .horaires { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 8px; }
  .h { font-weight: 600; font-size: 17px; font-variant-numeric: tabular-nums; } .plus { font: 400 12px/1 'Barlow', sans-serif; color: var(--ink2); }
  .dur { padding-top: 3px; font: 600 12px/16px 'Barlow', sans-serif; color: var(--ink2); text-align: center; } .fin { align-items: flex-end; }
  .sep { margin: 0 16px; border-top-color: var(--line); } .sep::before { left: -27px; } .sep::after { right: -27px; }
  .infos { margin: 0; padding: 16px 18px; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px 16px; }
  .infos > div { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  dt { font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink2); }
  dd { margin: 0; font-weight: 600; font-size: 16px; overflow-wrap: anywhere; } dd.mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .siege { font: 600 14px/18px 'Barlow', sans-serif; } .ref { letter-spacing: 0.06em; } .fict { font: 500 12px/1 'Barlow', sans-serif; letter-spacing: 0; color: var(--ink2); }
  .infos .large { grid-column: 1 / -1; padding-top: 12px; border-top: 1px solid var(--surface2); }
  .bag { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; } .bag .mono { font-weight: 600; font-size: 16px; font-variant-numeric: tabular-nums; }
  .bas { padding: 0 18px 18px; display: flex; flex-direction: column; gap: 12px; }
  .aucun { display: flex; align-items: center; gap: 14px; padding: 14px; border-radius: 14px; border: 2px dashed var(--line-strong); background: var(--bg); }
  .scan { width: 56px; height: 56px; flex: none; border-radius: 10px; background: var(--surface2); color: var(--ink2); display: flex; align-items: center; justify-content: center; }
  .a1 { font: 700 14px/19px 'Barlow', sans-serif; }
  .pied-b { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .ferme { display: inline-flex; align-items: center; gap: 6px; } .ref-nxg { font-size: 12px; }
  .vert { color: var(--ok); display: inline-flex; } .note { text-align: center; font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .chaine { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .ligne { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .t-h2 { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .finalisee { font: 600 13px/18px 'Barlow', sans-serif; color: var(--ok); }
  .etapes { display: flex; flex-direction: column; }
  .et { display: grid; grid-template-columns: 62px 20px 1fr; gap: 10px; }
  .dt { padding-top: 1px; text-align: right; font: 400 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); } .dt.vert { color: var(--ok); }
  .axe { display: flex; flex-direction: column; align-items: center; }
  .pt { width: 12px; height: 12px; margin-top: 3px; border-radius: 999px; background: var(--ink2); }
  .pt.ok { width: 16px; height: 16px; margin-top: 1px; background: var(--ok); color: #fff; display: flex; align-items: center; justify-content: center; }
  .pt.creux { box-sizing: border-box; background: transparent; border: 2px solid var(--ink3); }
  .tr { flex: 1; width: 2px; margin-top: 4px; background: var(--ink2); } .tr.pointille { width: 0; background: none; border-left: 2px dashed var(--line-strong); }
  .corps { padding-bottom: 18px; min-width: 0; } .dernier .corps { padding-bottom: 0; }
  .t1 { font: 600 15px/20px 'Barlow', sans-serif; } .t1.vert { color: var(--ok); }
  .retour-p { display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 44px; font: 600 15px/20px 'Barlow', sans-serif; }
</style>
