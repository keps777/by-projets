<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt } from '../../core/argent.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, totalAPayer, volDe } from '../../domain/marche.ts';
  import { droitDuCompte } from './actions.ts';
  import { chronologie, statutVoyage } from './chrono.ts';
  import { heure, jourComplet, jourMoisAHeure, jourMoisHeure } from './dates.ts';
  import { ecran } from './ecranPc.svelte.ts';
  import { reseau } from './reseau.svelte.ts';
  import Introuvable from './Introuvable.svelte';
  import { naviguer } from './lien.ts';

  /** Confirmation d'achat : le droit de voyage est détenu ; ce qu'il reste à faire (garder, nommer, compagnie). */
  let { droitId = '' }: { droitId?: string } = $props();
  const compte = $derived(compteCourant());
  const droit = $derived(droitDuCompte(droitId, compte?.id));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const ch = $derived(vol ? chronologie(vol, maintenant()) : undefined);
  const nomme = $derived(droit ? statutVoyage(droit) !== 'a_nommer' : false);
  const arrivee = $derived(vol ? `${vol.heureArrivee}${vol.plusJours ? ` (+${vol.plusJours})` : ''}` : '');
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !droit || !vol || !ch}
  <Introuvable titre="Droit introuvable" message="Ce droit de voyage n’est pas dans votre portefeuille." lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/" />
{:else}
  {#snippet pied()}
    <a class="btn" href="/portefeuille" onclick={(e) => naviguer(e, '/portefeuille')}><Icone nom="portefeuille" taille={20} />Voir mon portefeuille</a>
    {#if !nomme && ch.ouvert}<a class="btn sec" href="/nommer/{droit.id}" onclick={(e) => naviguer(e, `/nommer/${droit.id}`)}><Icone nom="piece" taille={20} />Nommer le voyageur maintenant</a>
    {:else}<a class="btn sec" href="/voyage/{droit.id}" onclick={(e) => naviguer(e, `/voyage/${droit.id}`)}><Icone nom="avion" taille={20} />Voir mon voyage</a>{/if}
  {/snippet}

  {#snippet suite()}
    <section class="suite" aria-labelledby="act-t">
      <h2 id="act-t" class="t-h2">Et ensuite</h2>
      <p class="suite-p">Votre droit de voyage est dans votre portefeuille. L’échéance pour nommer le voyageur est le {jourMoisAHeure(ch.echeance)}.</p>
      <a class="btn" href="/portefeuille" onclick={(e) => naviguer(e, '/portefeuille')}>Voir mon portefeuille<Icone nom="portefeuille" taille={20} /></a>
      {#if !nomme && ch.ouvert}
        {#if reseau.enLigne}<a class="btn sec" href="/nommer/{droit.id}" onclick={(e) => naviguer(e, `/nommer/${droit.id}`)}><Icone nom="piece" taille={20} />Nommer le voyageur maintenant</a>
        {:else}<span class="btn sec" role="link" aria-disabled="true" aria-describedby="msg-hors-ligne"><Icone nom="piece" taille={20} />Nommer le voyageur maintenant</span>{/if}
        <a class="lien-suite" href="/voyage/{droit.id}" onclick={(e) => naviguer(e, `/voyage/${droit.id}`)}>Voir mon prochain voyage<Icone nom="suivant" taille={18} trait={2} /></a>
      {:else}
        <a class="btn sec" href="/voyage/{droit.id}" onclick={(e) => naviguer(e, `/voyage/${droit.id}`)}><Icone nom="avion" taille={20} />Voir mon voyage</a>
      {/if}
    </section>
  {/snippet}

  <Ecran titre={ecran.pc ? undefined : 'Confirmation'} face="jour" retour="/" onglet={ecran.pc ? 'rechercher' : undefined} large pied={ecran.pc ? undefined : pied}>
    {#if ecran.pc}
      {#if !reseau.enLigne}<div class="hors" id="msg-hors-ligne" role="status"><Icone nom="hors_ligne" taille={22} /><span class="al-t"><strong>Hors ligne</strong><span>Cette confirmation reste affichée. Nommer le voyageur demande le réseau.</span></span></div>{/if}
      <div class="demo" role="note"><Icone nom="info" taille={18} trait={2} />MODE DÉMO — aucun paiement réel</div>
    {/if}
    <section class="hero" class:pcx={ecran.pc} aria-labelledby="conf-t">
      <span class="halo" aria-hidden="true"><span class="coche"><Icone nom="ok" taille={ecran.pc ? 28 : 44} trait={2.5} /></span></span>
      <div class="ht"><h1 id="conf-t" class="t-conf">Vous détenez ce droit de voyage</h1>
      <p class="sous" role="status">Paiement de démonstration accepté — aucun débit réel.</p></div>
    </section>

    <div class="grille" class:pcx={ecran.pc}><div class="gauche">
    <section class="billet" class:pcx={ecran.pc} aria-label="Votre billet {vol.de} → {vol.vers}">
      <div class="haut">
        {#if ecran.pc}<span class="etiq-t">Votre billet</span>{/if}
        <div class="trajet"><span class="code">{vol.de}</span>
          <span class="fil" aria-hidden="true"><span class="pointille"></span><Icone nom="avion" taille={18} /><span class="pointille"></span></span>
          <span class="code">{vol.vers}</span></div>
        <span class="t-sec">{jourComplet(ch.depart)} · {heure(ch.depart)} → {arrivee} · {compagnieDe(vol).nom} {vol.numero.split(' ')[1]} · {vol.cabine}</span>
      </div>
      <div class="perfore" aria-hidden="true"></div>
      <div class="bas">
        {#if nomme}<span class="puce ready"><Icone nom="ok" taille={14} trait={2} />Voyageur nommé</span>
        {:else}<span class="puce signal"><Icone nom="horloge" taille={14} trait={2} />À nommer avant le {jourMoisHeure(ch.echeance)}</span>{/if}
        <div class="refs">
          <div class="col g4"><span class="etiq">Référence</span><span class="mono ref">{droit.ref}</span></div>
          <div class="col g4 fin"><span class="etiq">Payé (démo)</span><span class="mono prix">{fmt(totalAPayer(droit.prixPaye))}</span></div>
        </div>
      </div>
    </section>

    <section aria-labelledby="suite-t" class="col g12 maintenant" class:pcx={ecran.pc}>
      <h2 id="suite-t" class="t-h2">Et maintenant</h2>
      <ol class="etapes liste-plain">
        <li><span class="num" class:on={!ecran.pc} aria-hidden="true">1</span><span class="tx"><span class="t1">Gardez-le, revendez-le ou transférez-le</span><span class="t-sec">Depuis votre portefeuille, jusqu’au {jourMoisHeure(ch.echeance)}.</span></span></li>
        <li><span class="num" class:on={ecran.pc} aria-hidden="true">2</span><span class="tx"><span class="t1">Nommez le voyageur au plus tard à J-1</span><span class="t-sec">Vous ou un proche.{ecran.pc ? ' À l’échéance, sans action de votre part, le détenteur est nommé voyageur par défaut.' : ''}</span></span></li>
        <li><span class="num" aria-hidden="true">3</span><span class="tx"><span class="t1">La compagnie émet le billet nominatif</span><span class="t-sec">Il apparaît dans votre portefeuille, prêt à voyager.</span></span></li>
      </ol>
    </section>

    </div>
    {#if ecran.pc}{@render suite()}{/if}
    </div>
  </Ecran>
{/if}

<style>
  .hero { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
  .halo { width: 112px; height: 112px; border-radius: 999px; border: 1px solid rgba(9, 106, 73, 0.3); display: flex; align-items: center; justify-content: center; }
  .coche { width: 88px; height: 88px; border-radius: 999px; background: var(--ok-soft); border: 2px solid var(--ok); color: var(--ok); display: flex; align-items: center; justify-content: center; }
  @media (max-height: 760px) { .halo { width: 88px; height: 88px; } .coche { width: 68px; height: 68px; } .hero { gap: 8px; } .t-conf { font-size: 30px; line-height: 32px; } }
  .t-conf { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; }
  .sous { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .billet { position: relative; background: var(--surface); border-radius: 18px; box-shadow: var(--ombre); }
  .haut { padding: 14px 18px 12px; display: flex; flex-direction: column; gap: 8px; }
  .trajet { display: flex; align-items: center; gap: 10px; }
  .code { font: 700 40px/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .fil { flex: 1; display: flex; align-items: center; gap: 6px; color: var(--accent); min-width: 0; }
  .pointille { flex: 1; border-top: 2px dotted var(--line-strong); }
  .billet .perfore { margin: 0 18px; border-top-color: var(--line); top: 0; }
  .billet .perfore::before { left: -29px; } .billet .perfore::after { right: -29px; }
  .bas { padding: 14px 18px 16px; display: flex; flex-direction: column; gap: 12px; }
  .bas .puce { align-self: flex-start; white-space: normal; min-height: 26px; padding-block: 4px; }
  .refs { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: end; }
  .fin { align-items: flex-end; }
  .etiq { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .ref { font-weight: 600; font-size: 18px; letter-spacing: 0.04em; }
  .prix { font-weight: 600; font-size: 18px; font-variant-numeric: tabular-nums; }
  .t-h2 { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .etapes { display: flex; flex-direction: column; }
  .etapes li { position: relative; display: grid; grid-template-columns: 32px 1fr; gap: 14px; padding-bottom: 18px; }
  .etapes li:not(:last-child)::before { content: ''; position: absolute; left: 15px; top: 36px; bottom: 2px; border-left: 2px solid var(--line); }
  .etapes li:last-child { padding-bottom: 0; }
  .num { width: 32px; height: 32px; border-radius: 999px; background: var(--surface2); color: var(--ink); display: flex; align-items: center; justify-content: center; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; }
  .num.on { background: #0b1b2e; color: #fff; }
  .tx { display: flex; flex-direction: column; gap: 2px; padding-top: 5px; }
  .t1 { font: 600 15px/20px 'Barlow', sans-serif; }
  /* PC (≥ 900 px) : planche WebConfirmation — titre à gauche, billet horizontal, « Et maintenant » à gauche, « Et ensuite » à droite. */
  .ht { display: contents; }
  .demo { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 16px; border-radius: 12px; background: rgba(26, 100, 200, 0.1); color: var(--accent-2); font: 700 13px/18px 'Barlow', sans-serif; letter-spacing: 0.04em; }
  .hors { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 12px 16px; border-radius: 14px; background: var(--surface2); border: 1px solid var(--line-strong); }
  .al-t { display: flex; flex-direction: column; gap: 2px; flex: 1 1 280px; min-width: 0; } .al-t strong { font: 700 15px/20px 'Barlow', sans-serif; } .al-t span { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .grille, .gauche { display: contents; }
  .grille.pcx { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 24px; align-items: start; }
  .grille.pcx .gauche { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .hero.pcx { flex-direction: row; flex-wrap: wrap; align-items: center; gap: 12px 20px; text-align: left; }
  .hero.pcx .ht { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
  .hero.pcx .halo { width: 56px; height: 56px; flex: none; border: 0; background: rgba(11, 122, 85, 0.1); }
  .hero.pcx .coche { width: 56px; height: 56px; border: 0; background: none; }
  .hero.pcx .t-conf { font-size: 44px; line-height: 44px; }
  .hero.pcx .sous { font: 600 13px/18px 'Barlow', sans-serif; }
  .billet.pcx { display: flex; align-items: stretch; box-shadow: 0 1px 0 var(--line), 0 12px 32px rgba(11, 27, 46, 0.1); border-radius: 18px; }
  .billet.pcx .haut { flex: 1 1 auto; min-width: 0; padding: 20px 24px; gap: 14px; }
  .billet.pcx .code { font-size: 64px; line-height: 64px; }
  .billet.pcx .trajet { gap: 12px; }
  .billet.pcx .haut .t-sec { font: 600 15px/22px 'Barlow', sans-serif; color: var(--ink); }
  .billet.pcx .perfore { flex: none; width: 0; height: auto; margin: 22px 0; border-top: 0; border-left: 2px dashed var(--line); }
  .billet.pcx .perfore::before { left: -12px; right: auto; top: -33px; } .billet.pcx .perfore::after { left: -12px; right: auto; top: auto; bottom: -33px; }
  .billet.pcx .bas { flex: 0 0 290px; box-sizing: border-box; padding: 20px 22px; justify-content: center; gap: 14px; }
  .billet.pcx .bas .puce { align-self: stretch; padding: 8px 12px; border-radius: 14px; font: 700 13px/18px 'Barlow', sans-serif; letter-spacing: 0; text-transform: none; }
  .billet.pcx .bas .puce.signal { background: rgba(255, 210, 63, 0.3); color: #5c4600; }
  .billet.pcx .refs { display: flex; flex-direction: column; gap: 8px; }
  .billet.pcx .refs > div { flex-direction: row; align-items: baseline; justify-content: space-between; gap: 12px; }
  .billet.pcx .etiq { font: 400 13px/18px 'Barlow', sans-serif; letter-spacing: 0; text-transform: none; }
  .billet.pcx .ref, .billet.pcx .prix { font-size: 14px; letter-spacing: 0; }
  .etiq-t { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .maintenant.pcx { gap: 16px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .maintenant.pcx .t-h2 { font-size: 24px; line-height: 28px; }
  .maintenant.pcx .etapes li { display: flex; align-items: flex-start; padding-bottom: 14px; }
  .maintenant.pcx .etapes li:last-child { padding-bottom: 0; }
  .maintenant.pcx .etapes li:not(:last-child)::before { left: 13px; top: 30px; bottom: -14px; border-left: 2px dashed var(--line); }
  .maintenant.pcx .num { flex: none; width: 28px; height: 28px; }
  .maintenant.pcx .tx { padding-top: 0; } .maintenant.pcx .t1 { font-weight: 700; font-size: 16px; }
  .maintenant.pcx .tx .t-sec { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .suite { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .suite-p { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .suite .btn { min-height: 52px; } .suite .btn.sec { font-size: 15px; }
  .suite .btn[aria-disabled='true'] { background: var(--surface2); color: var(--ink2); border-color: var(--line-strong); opacity: 1; cursor: not-allowed; }
  .lien-suite { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; color: var(--accent); font: 700 15px/1 'Barlow', sans-serif; }
</style>
