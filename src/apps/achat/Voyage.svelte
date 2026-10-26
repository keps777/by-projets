<script lang="ts">
  import { onMount } from 'svelte';
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app, jourDe, maintenant } from '../../data/store.svelte.ts';
  import { compteCourant, compteDe } from '../../domain/compte.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import { droitDuCompte } from './actions.ts';
  import { chronologie, compteARebours, libelleJ, statutVoyage } from './chrono.ts';
  import { decalageMinutes, heureAilleurs, heureArriveeAMontreal, jourAilleurs, libelleDecalage, nomAeroport, paysAvecPreposition, phraseDecalage } from './destination.ts';
  import { dureeVol, heure, instantDuJour, jourCourt, jourMoisHeure, moisLong, nomCourt } from './dates.ts';
  import Introuvable from './Introuvable.svelte';
  import { naviguer } from './lien.ts';
  import Pic from './Pic.svelte';
  import { bagagesDuDroit, basculerCoche, cochesDe, detailBagages, progression, titreBagages, TOTAL_PREPARATION, type CleCoche } from './preparation.ts';
  import { nomEnCapitales } from './voyageur.ts';

  /** Mon voyage — J-63 : compte à rebours, route, échéance de nommage, préparation (nommer, passeport, enregistrement, bagages), destination. */
  let { droitId = '' }: { droitId?: string } = $props();
  let tick = $state(maintenant());
  onMount(() => { const t = setInterval(() => (tick = maintenant()), 1000); return () => clearInterval(t); });

  const compte = $derived(compteCourant());
  const droit = $derived(droitDuCompte(droitId, compte?.id));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const ch = $derived(vol ? chronologie(vol, tick) : undefined);
  const statut = $derived(droit ? statutVoyage(droit) : 'autre');
  const nomme = $derived(statut === 'nomme' || statut === 'parti');
  const aNommer = $derived(statut === 'a_nommer');
  const depart = $derived(vol ? app.monde.aeroports.find((a) => a.code === vol.de) : undefined);
  const dest = $derived(vol ? app.monde.aeroports.find((a) => a.code === vol.vers) : undefined);
  const villeDepart = $derived(depart?.ville ?? vol?.de ?? ''), villeDest = $derived(dest?.ville ?? vol?.vers ?? '');
  const coches = $derived(droit ? cochesDe(droit.id) : {});
  const fait = $derived(progression(nomme, coches));
  const resumeBagages = $derived(droit ? bagagesDuDroit(app.monde.bagages, droit) : undefined);
  const arrivee = $derived(vol ? instantDuJour(vol.jour, vol.heureArrivee, vol.plusJours) : 0);
  const decalVol = $derived(vol ? decalageMinutes(vol.vers, vol.jour) : 0);
  const decalMaintenant = $derived(vol ? decalageMinutes(vol.vers, jourDe(tick)) : 0);
  const ailleurs = $derived(heureAilleurs(tick, decalMaintenant)), ici = $derived(heureAilleurs(tick, 0));
  const direct = $derived(vol ? (vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''} · ${vol.escales.join(', ')}` : 'Direct') : '');
  const numeroVol = $derived(vol ? vol.numero.split(' ')[1] : '');
  const detenteur = $derived(droit ? compteDe(droit.detenteurId) : undefined);
  const peutRevendre = $derived(aNommer && !!ch?.ouvert);
  const cases: { cle: CleCoche; titre: () => string; detail: () => string }[] = [
    { cle: 'passeport', titre: () => 'Passeport valide', detail: () => `Vérifiez les exigences d’entrée ${paysAvecPreposition(dest?.pays ?? '')} (validité, documents) auprès des autorités — à vérifier.` },
    { cle: 'checkin', titre: () => 'Enregistrement chez la compagnie', detail: () => `En ligne auprès d’${compagnieDe(vol!).nom}, une fois le voyageur nommé. Horaires selon la compagnie.` }
  ];
</script>

{#if !droitId}
  <!-- ancien écran réinstancié brièvement au changement de route : rien à montrer -->
{:else if !droit || !vol || !ch}
  <Introuvable titre="Voyage introuvable" message="Ce droit de voyage n’est pas dans votre portefeuille." lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/" />
{:else}
  <Ecran titre="Mon voyage" face="jour">
    <section class="hero" aria-labelledby="hero-t">
      <div class="ligne"><h2 id="hero-t" class="sur">{villeDepart} → {villeDest}</h2>
        {#if nomme}<span class="puce ready"><Icone nom="ok" taille={14} trait={2.5} />Nommé — prêt</span>{:else}<span class="puce signal">À nommer</span>{/if}</div>
      <div class="jour">
        <p class="grosJ" aria-label={ch.joursDepart > 0 ? `Départ dans ${ch.joursDepart} jours` : 'Jour du départ'}>{libelleJ(ch.joursDepart)}</p>
        <p class="date"><span class="d1">{jourCourt(ch.depart)}</span><span class="d2">{new Date(ch.depart).getFullYear()} · {compagnieDe(vol).nom} {numeroVol}</span></p>
      </div>
      <div class="compte"><span class="pt" aria-hidden="true"></span><span class="lib">Décollage dans</span><span class="mono val" role="timer" aria-live="off">{compteARebours(ch.depart, tick)}</span></div>
      <div class="arc">
        <div class="col g4"><span class="code">{vol.de}</span><span class="mono h">{vol.heureDepart}</span></div>
        <div class="courbe"><svg viewBox="0 0 174 56" preserveAspectRatio="none" aria-hidden="true" width="100%" height="56">
          <path d="M4 50 Q 87 -6 170 50" fill="none" stroke="var(--accent)" stroke-width="2" stroke-dasharray="4 5" stroke-linecap="round" />
          <circle cx="4" cy="50" r="4" fill="var(--ink)" /><circle cx="170" cy="50" r="4" fill="var(--accent)" />
        </svg>
        <span class="avion" aria-hidden="true"><Icone nom="avion" taille={24} /></span></div>
        <div class="col g4 fin"><span class="code">{vol.vers}</span><span class="mono h">{vol.heureArrivee}{vol.plusJours ? ` (+${vol.plusJours})` : ''}</span></div>
      </div>
      <p class="t-sec">{direct} · {dureeVol(vol.dureeMin)} · droit de voyage {droit.ref}</p>
    </section>

    <section aria-labelledby="route-t" class="col g12">
      <h2 id="route-t" class="t-h2">La route jusqu’à {villeDest}</h2>
      <ol class="route liste-plain">
        <li class="pas">
          <span class="trait pointille" style="top: 26px"></span>
          <span class="nd nd-now" aria-hidden="true"></span>
          <div class="tx"><span class="date-b">Aujourd’hui · {jourCourt(tick)}</span><span class="t1">Vous détenez ce billet</span><span class="t-sec">Détenteur : {detenteur ? nomCourt(detenteur.prenom, detenteur.nom) : '—'} · <a class="lien" href="/droit/{droit.id}" onclick={(e) => naviguer(e, `/droit/${droit.id}`)}>Chaîne de détention</a></span></div>
        </li>
        <li class="pas">
          <span class="trait pointille" style="top: 0"></span>
          <span class="nd nd-icone" class:ferme={!peutRevendre} aria-hidden="true"><Icone nom="echange" taille={14} trait={2.25} /></span>
          {#if peutRevendre}
            <div class="encart"><span class="t0">Jusqu’à J-1, le billet peut encore changer de mains</span><span class="t-sec">Revendre, transférer ou échanger reste possible pendant {ch.joursEcheance > 0 ? `${ch.joursEcheance} jour${ch.joursEcheance > 1 ? 's' : ''}` : 'quelques heures'}.</span></div>
          {:else}
            <div class="encart ferme"><span class="t0">{nomme ? 'Revente et transfert fermés' : 'Les échanges sont fermés'}</span><span class="t-sec">{nomme ? `Le billet est nominatif : toute modification relève des règles d’${compagnieDe(vol).nom}.` : 'L’échéance est passée : plus aucune transaction n’est possible sur ce billet.'}</span></div>
          {/if}
        </li>
        <li class="pas">
          <span class="trait plein" style="top: 26px"></span>
          <span class="nd" class:jaune={aNommer && ch.ouvert} class:vert={nomme} aria-hidden="true">{#if nomme}<Icone nom="ok" taille={14} trait={2.5} />{:else}<Icone nom="horloge" taille={14} trait={2.25} />{/if}</span>
          <div class="tx"><span class="date-b" class:jaune={aNommer}>{jourCourt(ch.echeance)} · {heure(ch.echeance)}</span>
            <span class="rang"><span class="t1">{nomme ? 'Voyageur nommé' : 'Nommer le voyageur'}</span><span class="puce signal mini">Échéance J-1</span></span>
            <span class="t-sec">{nomme && droit.voyageur ? `${nomEnCapitales(droit.voyageur)}, transmis à ${compagnieDe(vol).nom}.` : 'L’identité du voyageur est transmise à la compagnie ; le billet devient nominatif. Ensuite, plus aucune transaction.'}</span></div>
        </li>
        <li class="pas">
          <span class="trait plein" style="top: 26px"></span>
          <span class="nd" aria-hidden="true"><Icone nom="piece" taille={14} trait={2.25} /></span>
          <div class="tx"><span class="date-b gris">Après la finalisation</span><span class="t1">Enregistrement en ligne auprès de la compagnie</span><span class="t-sec">Ouverture et modalités selon {compagnieDe(vol).nom} — à vérifier.</span></div>
        </li>
        <li class="pas">
          <span class="trait plein" style="top: 26px"></span>
          <span class="nd plein" aria-hidden="true"><Icone nom="avion" taille={14} trait={2} /></span>
          <div class="tx"><span class="date-b gris">{jourCourt(ch.depart)} · {heure(ch.depart)}</span><span class="t1">Décollage · {vol.de}</span><span class="t-sec">{nomAeroport(vol.de, villeDepart)} · {compagnieDe(vol).nom} {numeroVol} · {direct.toLowerCase()}</span></div>
        </li>
        <li class="pas dernier">
          <span class="nd plein" aria-hidden="true"><Pic nom="lieu" taille={14} trait={2} /></span>
          <div class="tx"><span class="date-b gris">{jourCourt(arrivee)} · {vol.heureArrivee}, heure de {villeDest}</span><span class="t1">Arrivée · {vol.vers}</span><span class="t-sec">{nomAeroport(vol.vers, villeDest)}</span></div>
        </li>
      </ol>
    </section>

    <section aria-labelledby="prep-t" class="col g12">
      <div class="entete-prep"><h2 id="prep-t" class="t-h2">À préparer</h2><span class="mono prets">Prêt : {fait} / {TOTAL_PREPARATION}</span></div>
      <div class="barre" role="progressbar" aria-label="Préparation du voyage" aria-valuemin="0" aria-valuemax={TOTAL_PREPARATION} aria-valuenow={fait} aria-valuetext="{fait} étapes sur {TOTAL_PREPARATION}"><div class="rempli" style="width: {fait * 25}%"></div></div>
      <ul class="liste liste-plain">
        <li class="rang-liste">
          <span class="pastille" class:ok={nomme} aria-hidden="true">{#if nomme}<Icone nom="ok" taille={14} trait={2.5} />{:else}<Icone nom="horloge" taille={14} trait={2.25} />{/if}</span>
          <span class="tx grow"><span class="t1 pt15" class:barre-txt={nomme}>Nommer le voyageur</span>
            <span class="t-sec">{nomme && droit.voyageur ? `${nomEnCapitales(droit.voyageur)} · transmis à ${compagnieDe(vol).nom}` : `Avant le ${jourMoisHeure(ch.echeance)} · coché une fois le voyageur nommé`}</span></span>
          {#if aNommer && ch.ouvert}<a class="btn-jaune" href="/nommer/{droit.id}" aria-label="Nommer le voyageur" onclick={(e) => naviguer(e, `/nommer/${droit.id}`)}>Nommer</a>
          {:else if nomme}<a class="btn-lien" href="/pret-a-voyager/{droit.id}" aria-label="Voir la carte d’embarquement" onclick={(e) => naviguer(e, `/pret-a-voyager/${droit.id}`)}>Voir</a>{/if}
        </li>
        {#each cases as c (c.cle)}
          <li><label class="case"><input type="checkbox" checked={!!coches[c.cle]} onchange={() => basculerCoche(droit.id, c.cle)} />
            <span class="tx"><span class="t1 pt15" class:barre-txt={coches[c.cle]}>{c.titre()}</span><span class="t-sec">{c.detail()}</span></span></label></li>
        {/each}
        <li>
          <label class="case"><input type="checkbox" checked={!!coches.bagages} onchange={() => basculerCoche(droit.id, 'bagages')} />
            <span class="tx"><span class="t1 pt15" class:barre-txt={coches.bagages}>{resumeBagages ? titreBagages(resumeBagages) : 'Bagages'}</span><span class="t-sec">{resumeBagages ? detailBagages(resumeBagages) : ''}</span></span></label>
          <div class="sous-bag">
            <a class="lien-bag" href="/bagages" onclick={(e) => naviguer(e, '/bagages')}><Icone nom="sac" taille={18} /><span class="grow">Gérer mes bagages</span><Icone nom="suivant" taille={18} trait={2} /></a>
            <p class="t-sec">Besoin d’un bagage de plus&nbsp;? Les passagers du vol {numeroVol} en proposent.</p>
          </div>
        </li>
      </ul>
    </section>

    {#if dest}
      <section class="dest" aria-labelledby="dest-t">
        <div class="ligne"><span class="sur-sombre">À destination</span><span class="mono decal">{libelleDecalage(decalVol)}</span></div>
        <h2 id="dest-t" class="ville">{villeDest}</h2>
        <div class="horloges">
          <div class="horloge"><span class="h1">Heure locale à {villeDest}</span><span class="mono hh" role="timer" aria-live="off">{ailleurs.hms}</span><span class="h3">{jourAilleurs(ailleurs.jour)}</span></div>
          <div class="horloge"><span class="h1">À {villeDepart}</span><span class="mono hh" role="timer" aria-live="off">{ici.hms}</span><span class="h3">{jourAilleurs(ici.jour)}</span></div>
        </div>
        <p class="h4">{phraseDecalage(villeDest, decalVol, moisLong(ch.depart))} Arrivée {vol.heureArrivee} à {villeDest}, soit {heureArriveeAMontreal(vol.heureArrivee, decalVol)} à {villeDepart}.</p>
      </section>
    {/if}

    <section class="col g8">
      {#if peutRevendre}
        <a class="btn sec revendre" href="/revendre/{droit.id}" onclick={(e) => naviguer(e, `/revendre/${droit.id}`)}><span class="lune" aria-hidden="true"><Icone nom="lune" taille={16} trait={2} /></span>Plans changés&nbsp;? Revendre ce billet</a>
        <p class="note">Ouvre le verso · revente possible jusqu’au {jourMoisHeure(ch.echeance)}.</p>
        <a class="btn texte" href="/transferer/{droit.id}" onclick={(e) => naviguer(e, `/transferer/${droit.id}`)}><Pic nom="proches" taille={18} />Transférer à un proche</a>
      {:else if nomme}
        <a class="btn sec" href="/pret-a-voyager/{droit.id}" onclick={(e) => naviguer(e, `/pret-a-voyager/${droit.id}`)}><Icone nom="piece" taille={20} />Voir ma carte d’embarquement</a>
        <p class="note">Revente et transfert sont fermés : le billet est nominatif.</p>
      {:else}
        <p class="note">Plus aucune transaction n’est possible sur ce billet.</p>
      {/if}
    </section>
  </Ecran>
{/if}

<style>
  .sur { margin: 0; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .t-h2 { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .hero { display: flex; flex-direction: column; gap: 14px; padding: 18px 18px 16px; border-radius: 24px; background: var(--surface); box-shadow: var(--ombre); }
  .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .jour { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .grosJ { font: 700 clamp(84px, 29vw, 120px) / 0.82 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.01em; white-space: nowrap; }
  .date { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; padding-bottom: 4px; text-align: right; min-width: 0; }
  .d1 { font: 700 15px/20px 'Barlow', sans-serif; } .d2 { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .compte { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 12px; border-radius: 12px; background: var(--bg); }
  .pt { width: 8px; height: 8px; flex: none; border-radius: 999px; background: var(--accent); animation: nx-pulse 1.4s ease-in-out infinite; }
  .lib { font: 600 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .val { margin-left: auto; font-weight: 600; font-size: 16px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .arc { position: relative; display: grid; grid-template-columns: auto 1fr auto; align-items: end; column-gap: 8px; }
  .arc .code { font: 700 34px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; }
  .arc .h { font-size: 13px; color: var(--ink2); } .fin { align-items: flex-end; }
  .courbe { position: relative; min-width: 0; }
  .avion { position: absolute; left: 50%; top: 10px; transform: translateX(-50%); width: 28px; height: 28px; border-radius: 999px; background: var(--surface); color: var(--accent); display: grid; place-items: center; }
  .route { padding: 18px 16px 0; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); display: flex; flex-direction: column; }
  .pas { position: relative; display: grid; grid-template-columns: 26px 1fr; column-gap: 14px; padding-bottom: 16px; }
  .pas.dernier { padding-bottom: 18px; }
  .trait { position: absolute; left: 12px; bottom: 0; border-left: 2px solid var(--ink); }
  .trait.pointille { border-left: 2px dashed var(--accent); }
  .nd { width: 26px; height: 26px; box-sizing: border-box; border-radius: 999px; background: var(--surface); border: 2px solid var(--ink); color: var(--ink); display: flex; align-items: center; justify-content: center; }
  .nd-now { border: 7px solid var(--ink); box-shadow: 0 0 0 4px rgba(26, 100, 200, 0.15); }
  .nd-icone { margin-top: 12px; border-color: var(--accent); color: var(--accent); position: relative; }
  .nd-icone.ferme { border-color: var(--ink3); color: var(--ink3); }
  .nd.jaune { background: var(--signal); } .nd.vert { background: var(--ok); border-color: var(--ok); color: #fff; }
  .nd.plein { background: var(--ink); color: var(--surface); }
  .tx { display: flex; flex-direction: column; gap: 2px; padding-top: 2px; min-width: 0; }
  .date-b { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); }
  .date-b.jaune { color: var(--signal-ink); } .date-b.gris { color: var(--ink2); }
  .t1 { font: 600 16px/22px 'Barlow', sans-serif; } .t1.pt15 { font-size: 15px; line-height: 20px; }
  .encart { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 14px; background: var(--accent-soft); }
  .encart.ferme { background: var(--surface2); }
  .t0 { font: 700 15px/20px 'Barlow', sans-serif; }
  .rang { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .mini { min-height: 24px; font-size: 11px; padding: 0 9px; }
  .lien { color: var(--accent); font-weight: 600; text-decoration: underline; text-underline-offset: 2px; }
  .entete-prep { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
  .prets { font-weight: 600; font-size: 13px; font-variant-numeric: tabular-nums; color: var(--ink2); }
  .barre { height: 6px; border-radius: 999px; background: var(--surface2); overflow: hidden; }
  .rempli { height: 100%; border-radius: 999px; background: var(--ok); transition: width 300ms ease; }
  .liste { border-radius: 20px; background: var(--surface); border: 1px solid var(--line); overflow: hidden; }
  .liste > li:not(:last-child) { border-bottom: 1px solid var(--line); }
  .rang-liste { display: flex; align-items: center; gap: 12px; padding: 12px 14px; }
  .pastille { width: 22px; height: 22px; flex: none; border-radius: 999px; background: var(--signal-soft); color: var(--signal-ink); display: flex; align-items: center; justify-content: center; }
  .pastille.ok { background: var(--ok-soft); color: var(--ok); }
  .btn-jaune { flex: none; display: flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 14px; border-radius: 12px; background: var(--signal); color: #0b1b2e; font: 700 14px/1 'Barlow', sans-serif; text-decoration: none; }
  .btn-lien { flex: none; display: flex; align-items: center; min-height: 44px; padding: 0 8px; font: 700 14px/1 'Barlow', sans-serif; }
  .case { display: flex; align-items: flex-start; gap: 12px; min-height: 44px; padding: 14px; cursor: pointer; }
  .case input { flex: none; width: 22px; height: 22px; margin: 0; accent-color: var(--ink); cursor: pointer; }
  .barre-txt { text-decoration: line-through; color: var(--ink3); }
  .sous-bag { display: flex; flex-direction: column; gap: 8px; padding: 0 14px 14px 48px; }
  .lien-bag { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font: 600 14px/20px 'Barlow', sans-serif; }
  .dest { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: #0b1b2e; color: #fff; }
  .sur-sombre { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #c9d3df; }
  .decal { display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: rgba(255, 255, 255, 0.12); font-size: 13px; font-weight: 600; }
  .ville { font: 700 56px/0.9 'Barlow Condensed', 'Arial Narrow', sans-serif; overflow-wrap: anywhere; }
  .horloges { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .horloge { display: flex; flex-direction: column; gap: 2px; padding: 12px; border-radius: 14px; background: rgba(255, 255, 255, 0.08); min-width: 0; }
  .h1 { font: 600 12px/16px 'Barlow', sans-serif; color: #c9d3df; } .h3 { font: 400 12px/16px 'Barlow', sans-serif; color: #c9d3df; }
  .hh { font-weight: 600; font-size: 22px; line-height: 28px; font-variant-numeric: tabular-nums; }
  .h4 { font: 400 13px/18px 'Barlow', sans-serif; color: #c9d3df; }
  .revendre { gap: 10px; }
  .lune { width: 28px; height: 28px; flex: none; border-radius: 999px; background: #0b1b2e; color: var(--signal); display: flex; align-items: center; justify-content: center; }
  .note { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); text-align: center; }
</style>
