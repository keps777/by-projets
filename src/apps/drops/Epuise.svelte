<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { delaiCourt } from '../../core/regles.ts';
  import { dureeEpuisement, etatDrop, prochainDrop } from '../../domain/drop.ts';
  import { compagnieDe, volDe } from '../../domain/marche.ts';
  import type { Compte, Drop } from '../../domain/types.ts';
  import { jourSemaine } from '../voyager/format.ts';
  import { va } from '../voyager/lien.ts';
  import Prochains from './Prochains.svelte';
  import { alternatives, chronologieEpuise, dureeParti, horodatage, ligneProchain, phraseProchain } from './vues.ts';

  /** Drop épuisé (plus de place) ou terminé (fin atteinte) : même route que le direct. Dit ce qui s'est passé, quand part le prochain, et propose les reventes du même trajet et une alerte. `simule` : aperçu forcé par `?etat=epuise`. */
  let { drop, now, compte, simule = false }: { drop?: Drop; now: number; compte?: Compte; simule?: boolean } = $props();
  const vol = $derived(drop ? volDe(drop.volId) : undefined);
  const epuise = $derived(!!drop && (simule || drop.restantes <= 0));
  const termine = $derived(!!drop && !epuise && etatDrop(drop, now) === 'termine');
  const restantes = $derived(drop ? (epuise ? 0 : drop.restantes) : 0);
  const servi = $derived(!!compte && !!drop && drop.servis.includes(compte.id));
  const demande = $derived(!!compte?.pass.actif && !servi);
  const duree = $derived(drop ? dureeEpuisement(drop) : 0);
  const parti = $derived(dureeParti(duree));
  const ville = $derived(vol ? (app.monde.aeroports.find((a) => a.code === vol.vers)?.ville ?? vol.vers) : '');
  const depart = $derived(vol ? Date.parse(`${vol.jour}T${vol.heureDepart}`) : 0);
  const etapes = $derived(!drop ? [] : epuise ? chronologieEpuise(drop, duree, demande) : [{ heure: horodatage(drop.ouvre), texte: 'Ouverture du drop', fort: false }, { heure: horodatage(drop.fin), texte: `Fin du drop · ${drop.restantes} place${drop.restantes > 1 ? 's' : ''} non attribuée${drop.restantes > 1 ? 's' : ''}`, fort: true }]);
  const prochain = $derived(prochainDrop(now));
  const lp = $derived(prochain ? ligneProchain(prochain, compte?.id) : undefined);
  const alts = $derived(vol ? alternatives(app.monde, vol, compte?.id) : []);
  const maPlace = $derived(compte && drop ? app.monde.droits.find((d) => d.dropId === drop.id && d.detenteurId === compte.id) : undefined);
  const chapoEpuise = $derived(drop ? [`Les ${drop.places} places ont été attribuées dans l’ordre d’arrivée.`, servi ? 'La vôtre en fait partie.' : demande ? 'Votre demande est arrivée une demi-seconde après la dernière.' : '', servi ? '' : 'Aucun montant n’a été débité.'].filter(Boolean).join(' ') : '');
  let liste = $state(false);
  const lienAlerte = $derived(vol ? `/alertes?de=${vol.de}&vers=${vol.vers}` : '/alertes');
</script>

<Ecran titre="Drops" face="nuit" onglet="drops" sansRetour>
  <section class="col g8" aria-labelledby="miss-title">
    <div class="rang"><span class="puce"><Icone nom="fermer" taille={14} trait={2} />{drop ? (epuise ? 'Complet' : 'Terminé') : 'Aucun drop'}</span>{#if drop}<span class="kicker">Drop N° {drop.n}</span>{/if}</div>
    {#if !drop}
      <h2 id="miss-title" class="titre">Aucun drop en direct</h2>
      <p class="chapo">Aucun drop n’est ouvert pour le moment. Activez une alerte pour ne pas manquer le prochain.</p>
    {:else if epuise}
      <h2 id="miss-title" class="titre">Parti en <span class="mono">{parti.valeur}</span> {parti.unite}</h2>
      <p class="chapo">{chapoEpuise}</p>
      {#if servi && maPlace}<a class="lien" href={`/confirmation/${encodeURIComponent(maPlace.id)}`} onclick={(e) => va(e, `/confirmation/${encodeURIComponent(maPlace.id)}`)}>Voir ma place<Icone nom="suivant" taille={16} /></a>{/if}
    {:else}
      <h2 id="miss-title" class="titre">Drop terminé</h2>
      <p class="chapo">Le drop est fermé : les places non attribuées ne sont plus disponibles. Aucun montant n’a été débité.</p>
    {/if}
  </section>

  {#if drop && vol}
    <section class="deroule" aria-label={`Déroulé du drop N° ${drop.n}`}>
      <div class="tete">
        <span class="lettres" aria-hidden="true">{#each [...vol.vers] as c, i (i)}<span class="l">{c}</span>{/each}</span>
        <span class="col grow"><span class="r1">{vol.de} → {vol.vers} · {ville}</span><span class="r2">{jourSemaine(depart, { avecAnnee: true })} · {compagnieDe(vol).nom} · {fmt(drop.prixMembre)}</span></span>
      </div>
      <div class="places">
        <div class="rang2"><span class="sur">Places</span><span class="n"><span class="mono">{restantes}</span> restante{restantes > 1 ? 's' : ''} sur {drop.places}</span></div>
        <div class="jauge" aria-hidden="true">{#each Array(drop.places) as _, i (i)}<span class:vide={i >= drop.places - restantes}></span>{/each}</div>
      </div>
      <ol class="liste-plain etapes">{#each etapes as e (e.heure + e.texte)}<li><span class="h" class:fort={e.fort}>{e.heure}</span><span class="t" class:fort={e.fort}>{e.texte}</span></li>{/each}</ol>
    </section>
  {/if}

  {#if prochain && lp}
    <section class="prochain" aria-labelledby="next-title2">
      <span class="ico" aria-hidden="true"><Icone nom="horloge" taille={22} /></span>
      <span class="col g2 grow"><span id="next-title2" class="p1">Prochain drop dans</span><span class="p2">{delaiCourt(prochain.ouvre - now)}</span><span class="p3">{phraseProchain(lp)}</span></span>
      <button type="button" class="voir" aria-expanded={liste} aria-controls="prochains-liste" aria-label={liste ? 'Masquer les prochains drops' : 'Voir les prochains drops'} onclick={() => (liste = !liste)}><span class:ouvert={liste} style="display:flex"><Icone nom="suivant" taille={20} /></span></button>
    </section>
    {#if liste}<div id="prochains-liste"><Prochains {compte} {now} /></div>{/if}
  {/if}

  {#if vol}
    <section class="col g12" aria-labelledby="alt-title">
      <div class="col g4"><h2 id="alt-title" class="sec-t">Disponible en revente</h2>
        {#if alts.length}<p class="t-sec">Même trajet, cédé par d’autres détenteurs. Prix équivalent d’un billet neuf : {fmt(vol.prixNeuf)}.</p>{:else}<p class="t-sec">Aucune revente en cours sur {vol.de} → {vol.vers} pour l’instant : une alerte vous prévient dès qu’un détenteur met son billet en vente.</p>{/if}</div>
      {#each alts as a (a.droitId)}
        <a class="billet" href={`/offre/${encodeURIComponent(a.offreId)}`} onclick={(e) => va(e, `/offre/${encodeURIComponent(a.offreId)}`)}>
          <span class="haut">
            <span class="route"><span class="code">{a.de}</span><span class="fil" aria-hidden="true"><span class="pt"></span><Icone nom="avion" taille={18} /><span class="pt"></span></span><span class="code">{a.vers}</span></span>
            <span class="infos"><span>{jourSemaine(Date.parse(`${a.jour}T${a.heure}`), { avecAnnee: true })} · {a.heure}</span><span>{a.compagnie} · {a.escales}</span></span>
          </span>
          <span class="perfo" aria-hidden="true"><span class="rg"></span><span class="rd"></span></span>
          <span class="bas">
            <span class="col g4"><span class="chip" class:meme={a.memeVol}>{a.etiquette}</span><span class="src">Revente · cédé par un détenteur</span></span>
            <span class="col fin"><span class="prix">{fmt(a.prix)}</span><span class="src">Prix équivalent {fmt(a.prixEquivalent)}</span></span>
          </span>
        </a>
      {/each}
      {#if alts.length}<p class="note">Prix fixés par les détenteurs, dans la limite du plafond de revente. Prix indicatifs.</p>{/if}
    </section>
  {/if}

  {#snippet pied()}
    <a class="btn" href={lienAlerte} onclick={(e) => va(e, lienAlerte)}><Icone nom="cloche" taille={20} />{vol ? `Créer une alerte ${vol.de} → ${vol.vers}` : 'Créer une alerte'}</a>
  {/snippet}
</Ecran>

<style>
  .rang { display: flex; align-items: center; gap: 10px; } .kicker { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .titre { font: 600 clamp(38px, 6.4dvh, 46px) / 0.96 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; }
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .titre .mono { font-weight: 600; font-size: 0.92em; letter-spacing: 0; }
  .chapo { font: 400 15px/22px 'Barlow', sans-serif; color: var(--ink2); }
  .lien { display: inline-flex; align-items: center; gap: 4px; align-self: flex-start; min-height: 44px; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .deroule { border-radius: 16px; background: #060708; border: 1px solid var(--line); overflow: hidden; }
  .tete { display: flex; align-items: center; gap: 12px; padding: 14px; } .lettres { display: flex; gap: 3px; }
  .l { width: 22px; height: 30px; display: flex; align-items: center; justify-content: center; border-radius: 4px; background: #1c1f25; box-shadow: inset 0 -15px 0 #15171b; font: 600 17px/1 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); }
  .r1 { font: 600 15px/20px 'Barlow', sans-serif; } .r2 { font: 400 12px/16px 'Barlow', sans-serif; color: var(--ink3); }
  .places { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px 14px; border-top: 1px solid #1a1c21; }
  .rang2 { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .sur { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); } .n { font: 600 14px/20px 'Barlow', sans-serif; }
  .jauge { display: flex; gap: 6px; } .jauge span { flex: 1; height: 10px; box-sizing: border-box; border-radius: 3px; background: #262a33; } .jauge span.vide { background: transparent; border: 1px solid var(--line-strong); }
  .etapes { padding: 4px 0; border-top: 1px solid #1a1c21; } .etapes li { display: grid; grid-template-columns: 104px 1fr; gap: 12px; align-items: center; min-height: 36px; padding: 0 14px; }
  .h { font: 500 13px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; color: var(--ink3); } .t { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .h.fort { color: var(--ink); font-weight: 600; } .t.fort { color: var(--ink); font-weight: 600; }
  .prochain { display: flex; align-items: center; gap: 14px; padding: 16px 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .ico { width: 44px; height: 44px; flex: none; border-radius: 12px; background: var(--surface2); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .p1 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .p2 { font: 600 26px/30px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .p3 { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink3); }
  .voir { width: 44px; height: 44px; flex: none; border-radius: 12px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; } .ouvert { transform: rotate(90deg); }
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .billet { display: block; position: relative; border-radius: 18px; background: #fff; color: #121418; text-decoration: none; overflow: hidden; }
  .haut { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px 14px; } .route { display: flex; align-items: center; gap: 10px; }
  .code { font: 700 34px/34px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; } .fil { flex: 1; min-width: 0; display: flex; align-items: center; gap: 6px; color: #555c6b; } .pt { flex: 1; border-top: 2px dotted #c9cdd5; }
  .infos { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font: 400 13px/18px 'Barlow', sans-serif; color: #555c6b; }
  .perfo { display: block; position: relative; margin: 0 18px; border-top: 2px dashed #e2e4e9; } .rg, .rd { position: absolute; top: -12px; width: 22px; height: 22px; border-radius: 999px; background: var(--bg); } .rg { left: -29px; } .rd { right: -29px; }
  .bas { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px 16px; }
  .chip { align-self: flex-start; display: inline-flex; align-items: center; min-height: 24px; padding: 0 10px; border-radius: 999px; background: #f1f2f4; color: #555c6b; font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; } .chip.meme { background: #121418; color: #f3f4f6; }
  .src { font: 400 12px/16px 'Barlow', sans-serif; color: #555c6b; } .fin { align-items: flex-end; text-align: right; } .prix { font: 600 26px/30px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .note { font: 400 12px/17px 'Barlow', sans-serif; color: var(--ink3); }
</style>
