<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from './Picto.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { taux, TAUX_COMMISSION, TAUX_COMMISSION_PASS } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import { ErreurBagage, acheterBagages } from './actions.ts';
  import { KG_BAGAGE, MAX_AJOUT, MIN_AJOUT, DIMENSION_MAX_CM, ajoutPossible, choisir, comparerVols, dejaAjoutes, ecartComptoir, numeroVol, offresSoute, partDe, plafondBagage, quantiteValide, resoudreDroit, somme, volsAEssayer } from './soute.ts';
  import { jourMois, pluriel, pourcent } from './format.ts';
  import { reseau } from '../profil/enligne.svelte.ts';

  /** Ajouter des bagages (même vol) — planche m3-13. `?droit=` : la réservation qui reçoit les bagages. Achat simulé. */
  const compte = $derived(compteCourant());
  const droit = $derived(compte ? resoudreDroit(compte.id, param('droit')) : undefined);
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const cie = $derived(vol ? compagnieDe(vol) : undefined);
  const num = $derived(vol ? numeroVol(vol) : '');
  const comptoir = $derived(vol ? plafondBagage(vol) : 0);
  const query = $derived(droit ? `?droit=${encodeURIComponent(droit.id)}` : '');

  /* Essai d'un autre vol : montre pourquoi un bagage ne se transfère que sur le même vol. */
  let essai = $state<number | null>(null);
  const candidats = $derived(droit ? volsAEssayer(droit) : []);
  const autre = $derived(essai !== null ? candidats[essai % Math.max(1, candidats.length)] : undefined);
  const cmp = $derived(vol && autre ? comparerVols({ numero: num, jour: vol.jour }, autre) : undefined);
  const ok = $derived(!autre || !!cmp?.memeVol);
  const essayer = () => { essai = essai === null ? 0 : (essai + 1) % Math.max(1, candidats.length); };

  /* Quantité et offres choisies pour l'acheteur (les moins chères du même vol). */
  const offres = $derived(vol && compte ? offresSoute(vol.id, compte.id) : []);
  const possible = $derived(vol && compte ? ajoutPossible(compte.id, vol.id) : 0);
  const dejaLa = $derived(vol && compte ? dejaAjoutes(compte.id, vol.id) : 0);
  let demande = $state(2);
  const qte = $derived(quantiteValide(demande, possible));
  const choisies = $derived(choisir(offres, qte));
  const total = $derived(somme(choisies));
  const parComptoir = $derived(comptoir * qte);
  const ecart = $derived(ecartComptoir(total, parComptoir));
  const inclus = $derived(droit?.bagagesInclus ?? 0);
  const etiqPassager = $derived(compte ? `${compte.prenom} ${compte.nom ? compte.nom[0] + '.' : ''}`.trim() : '');
  const mot = $derived(qte > 1 ? 'bagages' : 'bagage');

  let envoi = $state(false), erreur = $state('');
  async function acheter() {
    if (!compte || !droit || !ok || qte < MIN_AJOUT || envoi) return;
    if (!reseau.enLigne) { erreur = 'Vous êtes hors ligne : l’achat reprendra dès que la connexion revient.'; return; }
    envoi = true; erreur = '';
    await new Promise((r) => setTimeout(r, 350)); // le « prestataire » répond (démo)
    try { const t = acheterBagages(compte.id, droit.id, qte, 'carte'); aller(`/bagages/transfere?t=${encodeURIComponent(t.id)}`); }
    catch (e) { erreur = e instanceof ErreurBagage ? e.message : 'L’achat n’a pas pu être traité. Réessayez.'; }
    finally { envoi = false; }
  }
  const villeDe = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
</script>

<Ecran titre="Ajouter des bagages" face="jour" retour={droit ? `/bagages${query}` : '/'}>
  <h1 class="sr">Ajouter des bagages</h1>
  {#if !compte || !droit || !vol || !cie}
    <section class="vide carte"><h2 class="t-section">Aucune réservation</h2><p class="t-sec">Les bagages s’ajoutent à une réservation : détenez d’abord un droit de voyage.</p><button type="button" class="btn" onclick={() => aller('/rechercher')}>Rechercher un vol</button></section>
  {:else}
    <div class="demo" role="note"><Picto nom="info" taille={16} />MODE DÉMO — aucun paiement réel</div>

    <section class="vol" class:faux={!ok} aria-labelledby="vol-t">
      <div class="ent"><h2 id="vol-t" class="sur">Votre vol</h2>
        {#if ok}<span class="ch vert"><Picto nom="ok" taille={14} trait={2.25} />Même vol</span>{:else}<span class="ch rouge"><Picto nom="croix" taille={14} trait={2.25} />Vol différent</span>{/if}</div>
      <div class="ligne">
        <span class="avion" aria-hidden="true"><Picto nom="avion" taille={24} trait={1.75} /></span>
        <span class="corps"><span class="mono num">{autre ? autre.code : cie.code} {autre ? autre.numero : num} · {jourMois(autre ? autre.jour : vol.jour)}</span>
          <span class="t-sec">{autre ? autre.compagnie : cie.nom} · {autre ? autre.de : vol.de} → {autre ? autre.vers : vol.vers} · {autre ? autre.heure : vol.heureDepart} · {etiqPassager}, {pluriel(1, 'passager')}</span></span>
      </div>
      {#if ok}<button type="button" class="btn-ligne" onclick={essayer}><Picto nom="echange" taille={20} />Essayer avec un autre vol</button>{/if}
    </section>

    {#if !ok && cmp && autre}
      <section class="erreur-vol" role="alert" aria-labelledby="err-t">
        <div class="ent-err"><span class="ico-err" aria-hidden="true"><Picto nom="alerte" taille={24} /></span>
          <div class="col g4"><h2 id="err-t" class="t-err">Vol différent</h2><p class="p15">Un bagage ne se transfère que sur le même vol (même numéro, même date).</p></div></div>
        <table class="tab"><caption>Comparaison</caption>
          <thead><tr><th scope="col"><span class="sr">Critère</span></th><th scope="col">Soute</th><th scope="col">Votre vol</th></tr></thead>
          <tbody>
            <tr><th scope="row">Numéro</th><td class="mono">{cmp.numero.soute}</td><td><span class="cp" class:bad={!cmp.numero.identique}><span class="mono">{cmp.numero.autre}</span>{#if cmp.numero.identique}<Picto nom="ok" taille={16} trait={2.25} />identique{:else}<Picto nom="croix" taille={16} trait={2.25} />différent{/if}</span></td></tr>
            <tr><th scope="row">Date</th><td class="mono">{jourMois(cmp.date.soute)}</td><td><span class="cp" class:bad={!cmp.date.identique}><span class="mono">{jourMois(cmp.date.autre)}</span>{#if cmp.date.identique}<Picto nom="ok" taille={16} trait={2.25} />identique{:else}<Picto nom="croix" taille={16} trait={2.25} />différente{/if}</span></td></tr>
          </tbody></table>
        <p class="aide">Les bagages de la soute du vol {num} du {jourMois(vol.jour)} ne peuvent pas être ajoutés à cette réservation, même chez {cie.nom}.</p>
        <div class="col g8">
          <button type="button" class="b-sombre" onclick={() => (essai = null)}><Picto nom="retour" taille={18} />Revenir à mon vol {cie.code} {num} · {jourMois(vol.jour)}</button>
          <button type="button" class="b-lien" onclick={essayer}><Picto nom="echange" taille={18} />Essayer encore un autre vol</button>
        </div>
      </section>
    {:else}
      <section class="carte qte" aria-labelledby="qty-t">
        <div class="col g4"><h2 id="qty-t" class="t-bloc">Bagages à ajouter</h2><p class="t-sec">{etiqPassager} · {pluriel(inclus, 'bagage')} déjà inclus{inclus > 1 ? 's' : ''} dans votre tarif</p></div>
        {#if possible === 0}
          <p class="vide-offres" role="status"><Picto nom="info" taille={18} />{dejaLa >= MAX_AJOUT ? `Cette réservation compte déjà ${MAX_AJOUT} bagages ajoutés : c’est le maximum.` : 'Aucun bagage disponible sur ce vol pour l’instant. Publiez une demande ci-dessous.'}</p>
        {:else}
          <div class="compteur">
            <button type="button" class="pm moins" aria-label="Retirer un bagage" disabled={qte <= MIN_AJOUT} onclick={() => (demande = qte - 1)}><Picto nom="moins" taille={22} trait={1.75} /></button>
            <p class="centre-q" aria-live="polite"><span class="mono grand-n">{qte}</span><span class="noun">{mot} en plus</span></p>
            <button type="button" class="pm plus" aria-label="Ajouter un bagage" disabled={qte >= possible} onclick={() => (demande = qte + 1)}><Picto nom="plus" taille={22} trait={1.75} /></button>
          </div>
          <div class="valises" role="img" aria-label="{pluriel(inclus, 'bagage')} inclus et {qte} {mot} ajouté{qte > 1 ? 's' : ''}, soit {pluriel(inclus + dejaLa + qte, 'bagage')} en soute">
            {#each Array.from({ length: inclus + dejaLa + qte }) as _, i (i)}<span class="valise" aria-hidden="true"><span class="poignee"></span><span class="corps-v" class:ajout={i >= inclus + dejaLa}>{i >= inclus + dejaLa ? '+' : ''}</span></span>{/each}
          </div>
          <p class="bilan">{inclus + dejaLa} inclus + {qte} ajouté{qte > 1 ? 's' : ''} = {pluriel(inclus + dejaLa + qte, 'bagage')} en soute</p>
        {/if}
        <p class="regle-d">De {MIN_AJOUT} à {MAX_AJOUT} bagages par réservation (règle de démo).</p>
      </section>

      <section class="col g12" aria-labelledby="pick-t">
        <div class="col g4"><h2 id="pick-t" class="t-bloc">Les moins chères, prises pour vous</h2><p class="t-sec">Offres de passagers du vol {num}, choisies automatiquement par prix croissant.</p></div>
        {#if choisies.length}
          <ul class="tags" style:grid-template-columns="repeat({Math.max(choisies.length, 2)}, minmax(0, 1fr))">
            {#each choisies as o, i (o.id)}
              <li class="tg"><div class="om"><div class="tgc"><span class="cdg">{vol.vers}</span><span class="mono ref">{cie.code} {num}<br />{jourMois(vol.jour).replace('.', '').toUpperCase()}</span><span class="barres" aria-hidden="true"></span><span class="mono tprix">{fmt(o.prix)}</span><span class="toffre">Offre {i + 1} · {o.kg} kg</span></div></div><span class="fic" aria-hidden="true"></span><span class="oeil" aria-hidden="true"></span></li>
            {/each}
          </ul>
        {/if}
        <div class="echelle">
          <p class="sur">Soute du vol {num} · {pluriel(offres.length, 'offre')}</p>
          {#if offres.length}<ul class="pastilles">{#each offres as o, i (o.id)}<li class="pp" class:on={i < qte}>{#if i < qte}<Picto nom="ok" taille={14} trait={2.25} />{/if}{fmt(o.prix)}{#if i < qte}<span class="sr">, choisie</span>{/if}</li>{/each}</ul>{/if}
          <p class="t-sec">Coché = pris pour vous. Prix fixés par les passagers, plafonnés au prix compagnie (règle à valider).</p>
          <a class="lien" href="/bagages/demande{query}" onclick={(e) => { e.preventDefault(); aller(`/bagages/demande${query}`); }}>Aucune offre à votre prix ? Publier une demande<Picto nom="suivant" taille={16} /></a>
        </div>
      </section>

      {#if qte > 0}
        <section class="ticket" aria-labelledby="tot-t">
          <div class="haut"><h2 id="tot-t" class="sur">Récapitulatif</h2>
            {#each choisies as o, i (o.id)}<div class="lg"><span>Bagage {i + 1} · passager du vol {num} · {o.kg} kg</span><span class="mono pr">{fmt(o.prix)}</span></div>{/each}
            <p class="aide2">Commission NexG-TT&nbsp;: {pourcent(TAUX_COMMISSION_PASS)} (Pass) · {pourcent(TAUX_COMMISSION)} sans Pass — hypothèse, modalités à valider.</p></div>
          <div class="perf" aria-hidden="true"><span class="tiret"></span><span class="e g"></span><span class="e d"></span></div>
          <div class="bas">
            <div class="tot"><span class="col g2"><span class="lt">Total</span><span class="mono grandtot">{fmt(total)}</span></span><span class="col dr"><span class="lt2">Prix compagnie, exemple</span><span class="mono ccomp">{qte} × {fmt(comptoir)} = {fmt(parComptoir)}</span></span></div>
            <div class="bars" aria-hidden="true"><span class="p1"><span class="f gris" style:width="100%"></span></span><span class="p1"><span class="f" style:width="{partDe(total, parComptoir)}%"></span></span></div>
            <p class="eg"><Picto nom="tendance" taille={18} /><span><span class="mono gap">{ecart.libelle}</span> vs prix compagnie, exemple. Selon le marché, aucune économie garantie.</span></p>
          </div>
        </section>
      {/if}

      <section class="col g12" aria-labelledby="rules-t">
        <h2 id="rules-t" class="t-bloc">Contraintes</h2>
        <ul class="contraintes">
          <li><span class="ci mono" aria-hidden="true">kg</span><span class="ct"><span class="c1">{KG_BAGAGE} kg maximum par bagage</span><span class="c2">Selon la compagnie</span></span></li>
          <li><span class="ci" aria-hidden="true"><Picto nom="regle" taille={20} trait={1.75} /></span><span class="ct"><span class="c1">{DIMENSION_MAX_CM} cm maximum</span><span class="c2">Longueur + largeur + hauteur, selon la compagnie</span></span></li>
          <li><span class="ci" aria-hidden="true"><Picto nom="bouclier" taille={20} trait={1.75} /></span><span class="ct"><span class="c1">Transfert confirmé par la compagnie</span><span class="c2">Le vendeur perd ce bagage, vous l’ajoutez à votre réservation</span></span></li>
          <li><span class="ci jaune" aria-hidden="true"><Picto nom="horloge" taille={20} trait={1.75} /></span><span class="ct"><span class="c1">Jusqu’à l’échéance de nommage</span><span class="c2">Règle à valider</span></span></li>
        </ul>
        <p class="reserve" role="note"><span class="h">[H]</span><span><strong>Sous réserve d’accord avec la compagnie.</strong> Aucun accord n’existe à ce jour.</span></p>
      </section>
    {/if}
  {/if}

  {#snippet pied()}
    {#if droit}
      {#if erreur}<p class="alerte" role="alert"><Picto nom="alerte" taille={16} />{erreur}</p>{/if}
      {#if ok && qte > 0}
        <button type="button" class="btn" disabled={envoi} onclick={acheter}>{envoi ? 'Traitement…' : 'Acheter'} {envoi ? '' : `${qte} ${mot} · `}<span class="mono">{envoi ? '' : fmt(total)}</span></button>
      {:else}
        <button type="button" class="btn sec" aria-disabled="true" onclick={(e) => e.preventDefault()}><Picto nom="cadenas" taille={18} />{ok ? 'Aucun bagage à acheter' : 'Achat impossible sur ce vol'}</button>
      {/if}
    {/if}
  {/snippet}
</Ecran>

<style>
  .demo { display: flex; align-items: center; gap: 8px; background: rgba(26, 100, 200, 0.1); border: 1px solid rgba(26, 100, 200, 0.4); color: #124c9c; border-radius: 12px; padding: 10px 12px; font: 600 13px/18px 'Barlow', sans-serif; margin-bottom: -8px; }
  .vol { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 20px; background: #fff; border: 2px solid #d3dce6; } .vol.faux { border-color: #b02c27; }
  .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .sur { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; }
  .ch { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; } .ch.vert { background: rgba(9, 106, 73, 0.1); color: #096a49; } .ch.rouge { background: rgba(176, 44, 39, 0.1); color: #b02c27; }
  .ligne { display: flex; align-items: center; gap: 12px; } .avion { flex: none; width: 48px; height: 48px; border-radius: 14px; background: #0b1b2e; color: #fff; display: grid; place-items: center; }
  .corps { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; } .num { font: 600 clamp(17px, 5.4vw, 20px)/24px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .btn-ligne { align-self: flex-start; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 12px; background: #fff; border: 1px solid #b9c5d3; color: #1a64c8; font: 700 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .erreur-vol { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: #fff; border: 2px solid #b02c27; animation: nx-shake 420ms ease-out 1; }
  .ent-err { display: flex; align-items: flex-start; gap: 12px; } .ico-err { flex: none; width: 48px; height: 48px; border-radius: 14px; background: rgba(176, 44, 39, 0.1); color: #b02c27; display: grid; place-items: center; }
  .t-err { margin: 0; font: 700 28px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; color: #b02c27; } .p15 { margin: 0; font: 400 15px/21px 'Barlow', sans-serif; }
  .tab { width: 100%; border-collapse: collapse; font-size: 14px; } .tab caption { text-align: left; padding-bottom: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #3e4f66; }
  .tab th, .tab td { text-align: left; padding: 10px 6px 10px 0; border-bottom: 1px solid #d3dce6; font-weight: 600; } .tab thead th { font: 600 13px/18px 'Barlow', sans-serif; color: #3e4f66; padding: 8px 6px 8px 0; } .tab tbody tr:last-child th, .tab tbody tr:last-child td { border-bottom: 0; }
  .cp { display: inline-flex; align-items: center; gap: 6px; color: #096a49; font-weight: 600; flex-wrap: wrap; } .cp.bad { color: #b02c27; }
  .aide { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; }
  .b-sombre { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; padding: 6px 12px; border-radius: 14px; background: #0b1b2e; color: #fff; border: 0; font: 700 15px/1.2 'Barlow', sans-serif; cursor: pointer; text-align: center; }
  .b-lien { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; border-radius: 12px; background: transparent; color: #1a64c8; border: 0; font: 700 15px/1 'Barlow', sans-serif; cursor: pointer; }
  .qte { display: flex; flex-direction: column; gap: 14px; padding: 18px; }
  .t-bloc { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .compteur { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .pm { flex: none; width: 56px; height: 56px; border-radius: 14px; display: grid; place-items: center; cursor: pointer; border: 1px solid #b9c5d3; } .pm.moins { background: #fff; color: #0b1b2e; } .pm.plus { background: #0b1b2e; border-color: #0b1b2e; color: #fff; }
  .pm:disabled { background: #e3eaf2; color: #5a6a80; border-color: #b9c5d3; cursor: not-allowed; }
  .centre-q { margin: 0; display: flex; flex-direction: column; align-items: center; } .grand-n { font: 600 48px/52px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .noun { font: 600 14px/18px 'Barlow', sans-serif; color: #3e4f66; }
  .valises { display: flex; justify-content: center; align-items: flex-end; flex-wrap: wrap; gap: 8px; min-height: 48px; }
  .valise { position: relative; width: 32px; height: 46px; display: flex; align-items: flex-end; } .poignee { position: absolute; left: 10px; top: 2px; width: 12px; height: 9px; box-sizing: border-box; border: 2px solid #0b1b2e; border-bottom: 0; border-radius: 4px 4px 0 0; }
  .corps-v { width: 32px; height: 36px; box-sizing: border-box; border-radius: 7px; border: 2px solid #0b1b2e; background: #e3eaf2; display: flex; align-items: center; justify-content: center; font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; color: #0b1b2e; } .corps-v.ajout { background: #ffd23f; }
  .bilan { margin: 0; text-align: center; font: 600 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .regle-d { margin: 0; text-align: center; font: 400 13px/18px 'Barlow', sans-serif; color: #5a6a80; }
  .vide-offres { margin: 0; display: flex; align-items: flex-start; gap: 8px; padding: 12px; border-radius: 12px; background: var(--bg); font: 500 14px/20px 'Barlow', sans-serif; color: #3e4f66; }
  .tags { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .tg { position: relative; padding-top: 18px; animation: nx-drop 520ms cubic-bezier(0.3, 0.7, 0.3, 1) 1 both; min-width: 0; } .om { filter: drop-shadow(0 8px 12px rgba(11, 27, 46, 0.14)); }
  .tgc { display: flex; flex-direction: column; align-items: center; gap: 5px; padding: 28px 8px 12px; border-radius: 12px; background: #ffd23f; color: #0b1b2e; clip-path: polygon(24% 0, 76% 0, 100% 13%, 100% 100%, 0 100%, 0 13%); }
  .cdg { font: 700 36px/0.85 'Barlow Condensed', 'Arial Narrow', sans-serif; } .ref { font: 600 12px/15px 'IBM Plex Mono', ui-monospace, monospace; text-align: center; }
  .barres { align-self: stretch; height: 16px; border-radius: 2px; background: repeating-linear-gradient(90deg, rgba(11, 27, 46, 0.3) 0 2px, transparent 2px 4px, rgba(11, 27, 46, 0.3) 4px 6px, transparent 6px 9px); }
  .tprix { font: 600 20px/24px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .toffre { font: 600 12px/16px 'Barlow', sans-serif; text-align: center; }
  .fic { position: absolute; left: 50%; top: 0; width: 10px; height: 32px; margin-left: -5px; box-sizing: border-box; border: 2px solid #0b1b2e; border-bottom: 0; border-radius: 5px 5px 0 0; } .oeil { position: absolute; left: 50%; top: 26px; width: 14px; height: 14px; margin-left: -7px; box-sizing: border-box; border-radius: 999px; background: var(--bg); border: 3px solid #0b1b2e; }
  @keyframes nx-drop { 0% { transform: translateY(-14px) rotate(-6deg); opacity: 0; } 70% { transform: translateY(2px) rotate(1deg); opacity: 1; } 100% { transform: translateY(0) rotate(0); opacity: 1; } }
  .echelle { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 16px; background: #fff; border: 1px solid #d3dce6; }
  .pastilles { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; } .pp { display: inline-flex; align-items: center; gap: 4px; height: 30px; padding: 0 10px; box-sizing: border-box; border-radius: 999px; background: #fff; color: #3e4f66; border: 1px solid #b9c5d3; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .pp.on { background: #0b1b2e; color: #fff; border-color: #0b1b2e; }
  .lien { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; align-self: flex-start; font: 600 14px/18px 'Barlow', sans-serif; color: #1a64c8; text-decoration: none; }
  .ticket { position: relative; background: #fff; color: #0b1b2e; border-radius: 18px; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); }
  .haut { padding: 16px 18px 12px; display: flex; flex-direction: column; gap: 8px; } .lg { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; font: 400 14px/20px 'Barlow', sans-serif; } .pr { font: 600 14px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; white-space: nowrap; } .aide2 { margin: 0; font: 400 13px/18px 'Barlow', sans-serif; color: #5a6a80; }
  .perf { position: relative; height: 22px; } .tiret { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed #d3dce6; } .e { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .e.g { left: -11px; } .e.d { right: -11px; }
  .bas { padding: 4px 18px 18px; display: flex; flex-direction: column; gap: 12px; } .tot { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; } .lt { font: 600 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .grandtot { font: 600 clamp(32px, 10.5vw, 40px)/44px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .dr { align-items: flex-end; text-align: right; gap: 2px; } .lt2 { font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .ccomp { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .bars { display: flex; flex-direction: column; gap: 6px; } .p1 { display: block; height: 8px; border-radius: 999px; background: #e3eaf2; overflow: hidden; } .f { display: block; height: 100%; border-radius: 999px; background: #1a64c8; transition: width 300ms ease; } .f.gris { background: #5a6a80; }
  .eg { margin: 0; display: flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 12px; border-radius: 10px; background: var(--bg); font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .eg :global(svg) { color: #a84a0e; } .gap { font-weight: 600; color: #a84a0e; font-variant-numeric: tabular-nums; }
  .contraintes { list-style: none; margin: 0; padding: 0 16px; border-radius: 20px; background: #fff; border: 1px solid #d3dce6; } .contraintes li { display: flex; align-items: center; gap: 12px; padding: 12px 0; } .contraintes li + li { border-top: 1px solid #d3dce6; }
  .ci { flex: none; width: 40px; height: 40px; border-radius: 12px; background: var(--bg); display: grid; place-items: center; font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; } .ci.jaune { background: rgba(255, 210, 63, 0.3); color: #5c4600; }
  .ct { display: flex; flex-direction: column; gap: 1px; min-width: 0; } .c1 { font: 600 15px/20px 'Barlow', sans-serif; } .c2 { font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; }
  .reserve { margin: 0; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #e3eaf2; font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .reserve .h { flex: none; display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; background: #0b1b2e; color: #fff; font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; } .reserve strong { color: #0b1b2e; }
  .alerte { margin: 0; display: flex; align-items: center; gap: 6px; font: 500 13px/18px 'Barlow', sans-serif; color: #b02c27; background: #fff; border-radius: 10px; padding: 6px 8px; }
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .g2 { gap: 2px; }
</style>
