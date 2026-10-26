<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { compteCourant, compteDe } from '../../domain/compte.ts';
    import { dernierTransfert, fraisTransfert, nomCourt, trancheTransferts } from '../../domain/transfert.ts';
  import { compagnieDe, droitDe, volDe } from '../../domain/marche.ts';
  import { echeanceDe } from '../../core/regles.ts';
  import { dureeHM, heureDe, jourSemaine } from '../voyager/format.ts';
  import { va } from '../voyager/lien.ts';
  import Introuvable from './Introuvable.svelte';
  import { apercuRecu, chaineFait } from './vues.ts';

  /** Transfert effectué : le droit est dans le portefeuille du proche (statut « Cédé » pour vous), ce que reçoit le proche, la chaîne de détention mise à jour. */
  let { droitId = '' }: { droitId?: string } = $props();
  trancheTransferts();
  const compte = $derived(compteCourant());
  const droit = $derived(droitId ? droitDe(droitId) : undefined);
  const t = $derived(compte && droitId ? dernierTransfert(droitId, compte.id) : undefined);
  const vers = $derived(t ? compteDe(t.vers) : undefined);
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const depart = $derived(vol ? Date.parse(`${vol.jour}T${vol.heureDepart}`) : 0);
  const echeance = $derived(echeanceDe(depart));
  const nomVers = $derived(vers ? nomCourt(vers) : 'votre proche');
  const frais = fraisTransfert();
  const id = $derived(encodeURIComponent(droitId));
  const apercu = $derived(t && droit ? apercuRecu(app.monde, t, droit, echeance) : undefined);
  const chaine = $derived(droit ? chaineFait(app.monde, droit, depart, echeance) : []);
  const arrivee = $derived(vol ? `${vol.heureArrivee}` : '');
  const trajet = $derived(vol ? `${vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''}` : 'Direct'} · ${dureeHM(vol.dureeMin)}` : '');
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const jourLong = $derived(depart ? jourSemaine(depart, { avecAnnee: true, maj: true }) : '');
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !compte || !droit || !t || !vol || !vers}
  <Introuvable titre="Aucun transfert à afficher" message="Nous ne trouvons pas de transfert fait par vous pour ce droit." />
{:else}
  <Ecran titre="Transfert" face="nuit" sansRetour>
    {#snippet droite()}<a class="fermer" href="/portefeuille" aria-label="Fermer" onclick={(e) => va(e, '/portefeuille')}><Icone nom="fermer" /></a>{/snippet}
    {#if frais > 0}<div class="demo" role="note"><Icone nom="info" taille={18} />MODE DÉMO — aucun paiement réel</div>{/if}
    <div class="col g12" role="status">
      <p class="fait"><Icone nom="ok" taille={18} trait={2.25} />Transfert effectué</p>
      <h1 class="grand">Droit transféré à {nomVers}</h1>
      <p class="chapo">Ce droit est maintenant dans le portefeuille de {nomVers} Pour vous, son statut est « Cédé ».</p>
    </div>

    <article class="billet" aria-label={`Billet ${vol.de} vers ${vol.vers}, ${compagnieDe(vol).nom} vol ${vol.numero.split(' ')[1]}, ${jourLong}, cédé à ${nomVers}`}>
      <div class="haut">
        <div class="bandeau"><span>{compagnieDe(vol).nom} · Vol {vol.numero.split(' ')[1]}</span><span>{jourLong}</span></div>
        <div class="route"><span class="code">{vol.de}</span><span class="fil" aria-hidden="true"><span class="pointille"></span><Icone nom="avion" taille={20} /><span class="pointille"></span></span><span class="code">{vol.vers}</span></div>
        <div class="horaires">
          <span class="col g2"><span class="h">{heureDe(depart)}</span><span class="v">{ville(vol.de)}</span></span>
          <span class="duree">{trajet}</span>
          <span class="col g2 fin"><span class="h">{arrivee}{#if vol.plusJours} <span class="plus">(+{vol.plusJours})</span>{/if}</span><span class="v">{ville(vol.vers)}</span></span>
        </div>
      </div>
      <div class="perfo" aria-hidden="true"><span class="trait"></span><span class="rond-g"></span><span class="rond-d"></span></div>
      <div class="bas">
        <span class="statut"><Icone nom="suivant" taille={14} trait={2} />Cédé</span>
        <div class="refs"><span>Cédé à {nomVers}</span><span class="mono">Registre {droit.ref}</span></div>
      </div>
    </article>

    {#if frais > 0}<p class="frais"><span>Frais de transfert (hypothèse)</span><span class="mono f">{fmt(frais)}</span></p>{/if}

    {#if apercu}
      <section class="col g12" aria-labelledby="notif-h">
        <div class="col g2"><h2 id="notif-h" class="sec-t">Ce que reçoit {nomVers}</h2><p class="t-sec">Aperçu de démo : aucun message réel n’est envoyé.</p></div>
        <div class="msg"><span class="etiq-m">Courriel</span><span class="m1">{apercu.courrielTitre}</span><span class="m2">{apercu.courrielLignes[0]}<br />{apercu.courrielLignes[1]}</span></div>
        <div class="msg"><span class="etiq-m"><Icone nom="cloche" taille={14} />Notification</span><span class="m1">{apercu.notifTitre}</span><span class="m2">{apercu.notifTexte}</span></div>
        <p class="t-sec">Si un message tarde, le droit est déjà dans le portefeuille de {nomVers} : le transfert ne dépend pas de l’envoi.</p>
      </section>
    {/if}

    <section class="col g12" aria-labelledby="ch-h">
      <div class="entete-s"><h2 id="ch-h" class="sec-t">Chaîne de détention</h2><span class="reg">Registre NexG-TT</span></div>
      <ol class="liste-plain chaine">
        {#each chaine as e, i (e.id)}
          <li class={e.kind}>
            <span class="date">{e.date}{#if e.heure}<br />{e.heure}{/if}</span>
            <span class="rail" aria-hidden="true"><span class="pt"></span>{#if i < chaine.length - 1}<span class="ligne" class:plein={e.kind === 'passe'}></span>{/if}</span>
            <span class="txt"><span class="t1">{e.titre}</span><span class="t2">{e.detail}</span></span>
          </li>
        {/each}
      </ol>
    </section>

    {#snippet pied()}
      <a class="btn" href="/portefeuille" onclick={(e) => va(e, '/portefeuille')}><Icone nom="portefeuille" taille={20} trait={2} />Retour au portefeuille</a>
    {/snippet}
  </Ecran>
{/if}

<style>
  .grand { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; text-wrap: balance; }
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .chapo { font: 400 15px/22px 'Barlow', sans-serif; color: var(--ink2); }
  .fait { display: flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ok); }
  .demo { display: flex; align-items: center; gap: 8px; background: rgba(98, 199, 255, 0.12); border: 1px solid rgba(98, 199, 255, 0.4); color: var(--up); border-radius: 12px; padding: 10px 12px; font: 600 13px/18px 'Barlow', sans-serif; }
  .fermer { width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center; background: var(--surface); border: 1px solid var(--line); color: var(--ink); }
  .billet { position: relative; border-radius: 18px; background: #fff; color: #121418; overflow: hidden; }
  .haut { padding: 18px 18px 16px; display: flex; flex-direction: column; gap: 12px; }
  .bandeau { display: flex; align-items: center; justify-content: space-between; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #555c6b; }
  .route { display: flex; align-items: center; gap: 10px; } .code { font: 700 48px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .fil { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; color: #555c6b; } .pointille { flex: 1; border-top: 2px dotted #c9cdd5; }
  .horaires { display: grid; grid-template-columns: 1fr auto 1fr; align-items: start; gap: 8px; }
  .h { font: 600 17px/22px 'IBM Plex Mono', ui-monospace, monospace; } .plus { font: 400 12px/16px 'Barlow', sans-serif; color: #555c6b; } .v { font: 400 13px/18px 'Barlow', sans-serif; color: #555c6b; } .fin { align-items: flex-end; }
  .duree { padding-top: 3px; font: 600 12px/16px 'Barlow', sans-serif; color: #555c6b; text-align: center; }
  .perfo { position: relative; height: 2px; } .trait { position: absolute; left: 16px; right: 16px; top: 0; border-top: 2px dashed #e2e4e9; }
  .rond-g, .rond-d { position: absolute; top: -10px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .rond-g { left: -11px; } .rond-d { right: -11px; }
  .bas { padding: 14px 18px 18px; display: flex; flex-direction: column; gap: 12px; }
  .statut { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 28px; padding: 0 12px; border-radius: 999px; background: #f1f2f4; color: #555c6b; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .refs { display: flex; align-items: center; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 400 12px/16px 'Barlow', sans-serif; color: #555c6b; } .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; }
  .frais { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: -8px; padding: 10px 12px; border-radius: 12px; background: var(--surface2); font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .f { font-weight: 600; font-size: 15px; color: var(--ink); }
  .msg { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .etiq-m { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .m1 { font: 700 15px/21px 'Barlow', sans-serif; } .m2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .entete-s { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; } .reg { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); }
  .chaine { display: flex; flex-direction: column; } .chaine li { display: grid; grid-template-columns: 60px 20px 1fr; gap: 10px; }
  .date { padding-top: 1px; text-align: right; font: 400 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); }
  .rail { display: flex; flex-direction: column; align-items: center; } .pt { width: 12px; height: 12px; margin-top: 3px; border-radius: 999px; background: var(--ink3); flex: none; }
  .ligne { flex: 1; width: 0; margin-top: 4px; border-left: 2px dashed var(--line-strong); } .ligne.plein { border-left-style: solid; border-left-color: var(--ink3); }
  .txt { display: flex; flex-direction: column; gap: 2px; padding-bottom: 18px; min-width: 0; } .chaine li:last-child .txt { padding-bottom: 0; }
  .t1 { font: 600 15px/21px 'Barlow', sans-serif; } .t2 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .nouveau .date { color: var(--ink); } .nouveau .pt { width: 14px; height: 14px; margin-top: 2px; box-sizing: border-box; background: var(--ink); border: 3px solid var(--bg); box-shadow: 0 0 0 2px var(--ink); }
  .echeance .date, .echeance .t1 { color: var(--accent); } .echeance .pt { background: var(--accent); }
  .depart .pt { box-sizing: border-box; background: transparent; border: 2px solid var(--ink3); }
</style>
