<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Picto from './Picto.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, droitDe, volDe } from '../../domain/marche.ts';
  import { confirmerTransfert, remettreEnAttente, transfertPar } from './actions.ts';
  import { KG_BAGAGE, dejaAjoutes, numeroVol } from './soute.ts';
  import { taux } from '../../core/regles.ts';
  import { heure, instantJourCourt, jourMois, pluriel, pourcent } from './format.ts';

  /** Bagage transféré — confirmation après achat (planche m3-14). `?t=` : le transfert ; sinon le dernier du compte. */
  const compte = $derived(compteCourant());
  const t = $derived(compte ? transfertPar(param('t'), compte.id) : undefined);
  const droit = $derived(t ? droitDe(t.droitId) : undefined);
  const vol = $derived(t ? volDe(t.volId) : undefined);
  const cie = $derived(vol ? compagnieDe(vol) : undefined);
  const num = $derived(vol ? numeroVol(vol) : '');
  const n = $derived(t?.lignes.length ?? 0);
  const confirme = $derived(!!t?.confirme);
  const inclus = $derived(droit?.bagagesInclus ?? 0);
  const enSoute = $derived(compte && vol ? inclus + dejaAjoutes(compte.id, vol.id) : inclus + n);
  const passager = $derived(compte ? `${compte.prenom} ${compte.nom ? compte.nom[0] + '.' : ''}`.trim() : '');
  let largeur = $state(350);
  const echelle = $derived(Math.min(1, largeur / 350));
  let relance = $state(0); // alterne deux animations pour rejouer le transfert
  const larg = $derived(n >= 3 ? 38 : 52), pas = $derived(n >= 3 ? 44 : 66);
</script>

<Ecran titre="Transfert de bagages" face="jour" sansRetour>
  <h1 class="sr">Transfert de bagages</h1>
  {#if !t || !vol || !cie || !droit}
    <section class="carte vide"><h2 class="t-section">Aucun transfert récent</h2><p class="t-sec">Quand vous achetez des bagages sur la soute d’un vol, le suivi du transfert apparaît ici.</p><button type="button" class="btn" onclick={() => aller('/bagages')}>Mes bagages</button></section>
  {:else}
    <div class="demo" role="note"><Picto nom="info" taille={16} />MODE DÉMO — aucun paiement réel</div>

    <section class="hero" aria-labelledby="hero-t">
      <div class="cadre" bind:clientWidth={largeur} style:height="{212 * echelle}px">
      {#key relance}
        <div class="scene" style:transform="scale({echelle})" role="img" aria-label="{pluriel(n, 'étiquette')} de bagage passe{n > 1 ? 'nt' : ''} des passagers vendeurs du vol {num} à la réservation de {passager}, sur le même vol {num}.">
          <div class="cote vend" aria-hidden="true"><span class="rond"><Picto nom="personne" taille={20} trait={1.75} /></span><span class="sur">Vendeurs</span><span class="nm">Passagers du vol {num}</span>
            {#each Array.from({ length: n }) as _, i (i)}<span class="slot" style:left="{14 + i * pas}px" style:width="{larg}px"></span>{/each}</div>
          <span class="fl" aria-hidden="true"><Picto nom="fleche" taille={20} trait={2} /></span><span class="mono no" aria-hidden="true">{num}</span>
          <div class="cote ach" aria-hidden="true"><span class="rond sombre"><Picto nom="groupe" taille={20} trait={1.75} /></span><span class="sur">{passager}</span><span class="nm">Vol {num} · {pluriel(1, 'passager')}</span>
            {#each Array.from({ length: n }) as _, i (i)}<span class="slot" style:left="{13 + i * pas}px" style:width="{larg}px"></span>{/each}</div>
          {#each Array.from({ length: n }) as _, i (i)}
            <span class="etq" class:b={relance % 2 === 1} style:left="{218 + i * pas}px" style:width="{larg}px" style:animation-delay="{250 + i * 170}ms" aria-hidden="true">
              <span class="etq-c"><span class="cd">{vol.vers}</span><span class="br"></span><span class="mono nn">{num}</span></span><span class="trou"></span>
            </span>
          {/each}
        </div>
      {/key}
      </div>
      <button type="button" class="rejouer" onclick={() => relance++}><Picto nom="rejouer" taille={18} />Revoir le transfert</button>
      {#if !confirme}<h2 id="hero-t" class="h2">Vos {pluriel(n, 'bagage')} change{n > 1 ? 'nt' : ''} de mains.</h2>{:else}<h2 id="hero-t" class="h2">{pluriel(n, 'bagage')} ajouté{n > 1 ? 's' : ''} à votre réservation.</h2>{/if}
      <p class="p15">Même vol, même date&nbsp;: <span class="mono fort">{cie.code} {num} · {jourMois(vol.jour)}</span> · {vol.de} → {vol.vers} · {vol.heureDepart}</p>
    </section>

    <section class="col g12" aria-labelledby="track-t">
      <h2 id="track-t" class="t-bloc">Suivi du transfert</h2>
      <ol class="suivi">
        <li><span class="trait vert"></span><span class="pt ok" aria-hidden="true"><Picto nom="ok" taille={16} trait={2.25} /></span>
          <div class="col g2 pad"><span class="etape vert">Étape 1 · terminée</span><span class="ti">Paiement reçu (démo)</span><span class="t-sec">{instantJourCourt(t.quand)} · {heure(t.quand)} · aucun paiement réel</span></div></li>
        <li><span class="trait" class:vert={confirme}></span><span class="pt ok" aria-hidden="true"><Picto nom="ok" taille={16} trait={2.25} /></span>
          <div class="col g2 pad"><span class="etape vert">Étape 2 · terminée</span><span class="ti">Transfert demandé à {cie.nom}</span><span class="t-sec">{pluriel(n, 'franchise')} retirée{n > 1 ? 's' : ''} des réservations vendeuses, à ajouter à la vôtre</span></div></li>
        <li><span class="pt" class:ok={confirme} class:cours={!confirme} aria-hidden="true">{#if confirme}<Picto nom="ok" taille={16} trait={2.25} />{:else}<Picto nom="horloge" taille={16} trait={2} />{/if}</span>
          <div class="col g6 pad" aria-live="polite">
            {#if !confirme}
              <span class="etape cours-t">Étape 3 · en cours</span><span class="ti">Bagage ajouté à votre réservation</span>
              <span class="badge cours"><span class="pulse" aria-hidden="true"></span>En attente de confirmation de la compagnie</span>
              <button type="button" class="b-demo" onclick={() => compte && confirmerTransfert(t.id, compte.id)}><Picto nom="etincelle" taille={18} />Simuler la confirmation<span class="tag-demo">Démo</span></button>
            {:else}
              <span class="etape vert">Étape 3 · terminée</span><span class="ti">Bagage ajouté à votre réservation</span>
              <span class="badge vert"><Picto nom="ok" taille={14} trait={2.25} />Confirmé par la compagnie (démo)</span>
              <span class="t-sec">{enSoute} bagages en soute pour {passager} sur le vol {num}.</span>
              <button type="button" class="b-texte" onclick={() => compte && remettreEnAttente(t.id, compte.id)}>Revenir à l’état en attente (démo)</button>
            {/if}
          </div></li>
      </ol>
    </section>

    <section class="ticket" aria-labelledby="sum-t">
      <div class="haut">
        <div class="ent"><h2 id="sum-t" class="sur">Récapitulatif</h2><span class="mono ref">{t.ref}</span></div>
        <p class="lot">{n} {n > 1 ? 'bagages' : 'bagage'} × {KG_BAGAGE}&nbsp;kg</p>
        <dl class="dl">
          <div><dt>Vol</dt><dd>{cie.code} {num} · {vol.de} → {vol.vers} · {jourMois(vol.jour)}</dd></div>
          <div><dt>Réservation</dt><dd>{passager} · {inclus} inclus + {n}</dd></div>
          {#each t.lignes as l, i (l.bagageId)}<div><dt>Bagage {i + 1} · passager du vol {num}</dt><dd class="mono pr">{fmt(l.prix)}</dd></div>{/each}
        </dl>
      </div>
      <div class="perf" aria-hidden="true"><span class="tiret"></span><span class="e g"></span><span class="e d"></span></div>
      <div class="bas"><span class="col g2"><span class="lt">Total payé (démo)</span><span class="mono tot">{fmt(t.total)}</span></span><span class="comm">Commission&nbsp;: hypothèse {pourcent(taux(compte?.pass.actif ?? false))}</span></div>
    </section>

    <p class="reserve" role="note"><span class="h">[H]</span><span><strong>Sous réserve d’accord avec la compagnie.</strong> Si la compagnie refuse le transfert, le paiement serait remboursé&nbsp;: modalités à valider. Chacun enregistre ses propres bagages&nbsp;: on vend un droit de bagage, jamais le transport du bagage d’autrui.</span></p>
  {/if}

  {#snippet droite()}
    <button type="button" class="fermer" aria-label="Fermer" onclick={() => aller('/')}><Picto nom="croix" taille={22} trait={1.75} /></button>
  {/snippet}
  {#snippet pied()}
    {#if t}<button type="button" class="btn" onclick={() => aller(droit ? `/voyage/${droit.id}` : '/')}>Retour à mon voyage</button>{/if}
  {/snippet}
</Ecran>

<style>
  .demo { display: flex; align-items: center; gap: 8px; background: rgba(26, 100, 200, 0.1); border: 1px solid rgba(26, 100, 200, 0.4); color: #124c9c; border-radius: 12px; padding: 10px 12px; font: 600 13px/18px 'Barlow', sans-serif; margin-bottom: -8px; }
  .vide { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; }
  .hero { display: flex; flex-direction: column; gap: 10px; }
  .cadre { width: 100%; max-width: 350px; margin-inline: auto; contain: inline-size; overflow: hidden; }
  .scene { position: relative; height: 212px; width: 350px; transform-origin: 0 0; }
  .cote { position: absolute; top: 0; width: 146px; height: 212px; box-sizing: border-box; padding: 12px; border-radius: 18px; background: #fff; border: 1px solid #d3dce6; display: flex; flex-direction: column; gap: 4px; }
  .vend { left: 0; } .ach { left: 204px; border: 2px solid #0b1b2e; box-shadow: 0 12px 28px rgba(11, 27, 46, 0.12); }
  .rond { width: 36px; height: 36px; border-radius: 999px; background: #e3eaf2; color: #3e4f66; display: grid; place-items: center; } .rond.sombre { background: #0b1b2e; color: #fff; }
  .sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: #3e4f66; } .nm { font: 600 14px/17px 'Barlow', sans-serif; }
  .slot { position: absolute; top: 124px; height: 74px; box-sizing: border-box; border-radius: 8px; border: 2px dashed #b9c5d3; }
  .ach .slot { top: 123px; }
  .fl { position: absolute; left: 157px; top: 46px; width: 36px; height: 36px; border-radius: 999px; background: #0b1b2e; color: #fff; display: grid; place-items: center; } .no { position: absolute; left: 152px; top: 92px; width: 46px; text-align: center; font: 600 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: #3e4f66; }
  .etq { position: absolute; top: 124px; height: 74px; z-index: 2; transform-origin: 50% 0; animation: nx-slide-a 820ms cubic-bezier(0.45, 0, 0.25, 1) 1 both; } .etq.b { animation-name: nx-slide-b; }
  .etq-c { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; gap: 3px; padding: 0 4px 8px; box-sizing: border-box; border-radius: 8px; background: #ffd23f; color: #0b1b2e; clip-path: polygon(24% 0, 76% 0, 100% 16%, 100% 100%, 0 100%, 0 16%); box-shadow: inset 0 0 0 1px rgba(11, 27, 46, 0.18); }
  .cd { font: 700 22px/0.9 'Barlow Condensed', 'Arial Narrow', sans-serif; } .br { align-self: stretch; height: 10px; background: repeating-linear-gradient(90deg, rgba(11, 27, 46, 0.32) 0 2px, transparent 2px 4px, rgba(11, 27, 46, 0.32) 4px 5px, transparent 5px 7px); } .nn { font: 600 11px/14px 'IBM Plex Mono', ui-monospace, monospace; }
  .trou { position: absolute; left: 50%; top: 7px; width: 10px; height: 10px; margin-left: -5px; box-sizing: border-box; border-radius: 999px; background: #fff; border: 2px solid #0b1b2e; }
  @keyframes nx-slide-a { 0% { transform: translate(-204px, 0) rotate(-7deg); } 50% { transform: translate(-102px, -38px) rotate(9deg); } 82% { transform: translate(-6px, 3px) rotate(-2deg); } 100% { transform: translate(0, 0) rotate(0deg); } }
  @keyframes nx-slide-b { 0% { transform: translate(-204px, 0) rotate(-7deg); } 50% { transform: translate(-102px, -38px) rotate(9deg); } 82% { transform: translate(-6px, 3px) rotate(-2deg); } 100% { transform: translate(0, 0) rotate(0deg); } }
  .rejouer { align-self: center; display: flex; align-items: center; gap: 8px; min-height: 44px; padding: 0 14px; border-radius: 12px; background: transparent; border: 0; color: #1a64c8; font: 700 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .h2 { margin: 0; font: 700 clamp(32px, 10.2vw, 40px)/0.95 'Barlow Condensed', 'Arial Narrow', sans-serif; text-wrap: balance; } .p15 { margin: 0; font: 400 15px/21px 'Barlow', sans-serif; color: #3e4f66; } .fort { font-weight: 600; color: #0b1b2e; }
  .t-bloc { margin: 0; font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .suivi { list-style: none; margin: 0; padding: 18px 16px 2px; border-radius: 20px; background: #fff; border: 1px solid #d3dce6; display: flex; flex-direction: column; }
  .suivi li { position: relative; display: grid; grid-template-columns: 26px 1fr; column-gap: 14px; padding-bottom: 18px; } .pad { padding-top: 2px; min-width: 0; }
  .trait { position: absolute; left: 12px; top: 26px; bottom: 0; border-left: 2px dashed #b9c5d3; } .trait.vert { border-left: 2px solid #096a49; }
  .pt { width: 26px; height: 26px; box-sizing: border-box; border-radius: 999px; display: grid; place-items: center; } .pt.ok { background: #096a49; color: #fff; } .pt.cours { background: #ffd23f; border: 2px solid #0b1b2e; color: #0b1b2e; }
  .etape { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; } .etape.vert { color: #096a49; } .etape.cours-t { color: #5c4600; } .ti { font: 600 16px/22px 'Barlow', sans-serif; }
  .badge { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 26px; padding: 3px 10px; box-sizing: border-box; border-radius: 999px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.04em; } .badge.cours { background: rgba(255, 210, 63, 0.3); color: #5c4600; } .badge.vert { background: rgba(9, 106, 73, 0.1); color: #096a49; }
  .pulse { width: 7px; height: 7px; flex: none; border-radius: 999px; background: #5c4600; animation: nx-pulse 1.4s ease-in-out infinite; }
  .b-demo { align-self: flex-start; display: flex; align-items: center; gap: 8px; min-height: 44px; margin-top: 4px; padding: 0 14px; border-radius: 12px; background: #fff; border: 1px solid #b9c5d3; color: #0b1b2e; font: 700 14px/1 'Barlow', sans-serif; cursor: pointer; }
  .tag-demo { display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; background: #e3eaf2; color: #3e4f66; font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .b-texte { align-self: flex-start; min-height: 44px; padding: 0; background: transparent; border: 0; color: #1a64c8; font: 600 14px/1 'Barlow', sans-serif; cursor: pointer; text-align: left; }
  .ticket { position: relative; background: #fff; color: #0b1b2e; border-radius: 18px; box-shadow: 0 1px 0 #d3dce6, 0 12px 32px rgba(11, 27, 46, 0.1); }
  .haut { padding: 16px 18px 12px; display: flex; flex-direction: column; gap: 10px; } .ent { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .ref { font: 600 13px/18px 'IBM Plex Mono', ui-monospace, monospace; color: #3e4f66; }
  .lot { margin: 0; font: 700 30px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; } .dl { margin: 0; display: flex; flex-direction: column; gap: 8px; font: 400 14px/20px 'Barlow', sans-serif; } .dl div { display: flex; justify-content: space-between; gap: 8px; } .dl dt { color: #3e4f66; } .dl dd { margin: 0; font-weight: 600; text-align: right; } .pr { font: 600 14px/20px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .perf { position: relative; height: 22px; } .tiret { position: absolute; left: 18px; right: 18px; top: 10px; border-top: 2px dashed #d3dce6; } .e { position: absolute; top: 0; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .e.g { left: -11px; } .e.d { right: -11px; }
  .bas { padding: 4px 18px 18px; display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; flex-wrap: wrap; } .lt { font: 600 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .tot { font: 600 clamp(30px, 9.4vw, 36px)/40px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .comm { font: 400 13px/18px 'Barlow', sans-serif; color: #5a6a80; text-align: right; }
  .reserve { margin: 0; display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: #e3eaf2; font: 400 13px/18px 'Barlow', sans-serif; color: #3e4f66; } .reserve .h { flex: none; display: inline-flex; align-items: center; height: 24px; padding: 0 8px; border-radius: 999px; background: #0b1b2e; color: #fff; font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; } .reserve strong { color: #0b1b2e; }
  .fermer { width: 44px; height: 44px; box-sizing: border-box; border-radius: 999px; background: #fff; border: 1px solid #d3dce6; display: grid; place-items: center; color: #0b1b2e; cursor: pointer; }
  .g2 { gap: 2px; } .g6 { gap: 6px; }
</style>
