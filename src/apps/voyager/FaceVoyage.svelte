<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt as fmtBrut } from '../../core/argent.ts';
  const fmt = (n: number) => nb(fmtBrut(n));
  import { joursAvant } from '../../core/regles.ts';
  import type { Compte } from '../../domain/types.ts';
  import Picto from './Picto.svelte';
  import RadarMini from './RadarMini.svelte';
  import { bagageInutilise, intentionAffichee, prochainVoyage } from './accueil.ts';
  import { dansJours, departDans, heureDe, jourCourt, jourLong, jourSemaine, nb } from './format.ts';
  import { va } from './lien.ts';
  import { reventesDeLaSemaine } from './reventes.ts';

  /** Face Voyager (jour) de l'accueil. Sans compte (`compte` absent) : version réduite, avec l'invitation à créer un compte. */
  let { compte, now }: { compte?: Compte; now: number } = $props();
  const pv = $derived(compte ? prochainVoyage(app.monde, compte.id, now) : undefined);
  const bagage = $derived(compte && pv ? bagageInutilise(app.monde, compte.id, pv.vol.id) : undefined);
  const intention = $derived(compte ? intentionAffichee(app.monde, compte.id) : undefined);
  const reventes = $derived(reventesDeLaSemaine(app.monde, now, compte?.id));
  const nommeA = $derived(pv?.droit.voyageur?.prenom);
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
</script>

<main class="face" data-motion>
  <section class="hello">
    <p class="salut">{compte ? `Bonjour ${compte.prenom}` : 'Bienvenue'} · {jourLong(now)}</p>
    <h1 class="grand">Le monde, à partir de <span class="bleu">Montréal</span></h1>
  </section>

  {#if !compte}
    <section class="carte invite" aria-labelledby="inv-titre">
      <h2 id="inv-titre" class="t-section">Créez votre compte en une minute</h2>
      <p class="t-sec">Pour acheter, détenir et revendre vos billets : l’espace « Mes actifs » s’ouvre avec votre compte.</p>
      <a class="btn" href="/inscription" onclick={(e) => va(e, '/inscription')}>Créer un compte</a>
      <a class="btn sec" href="/connexion" onclick={(e) => va(e, '/connexion')}>J’ai déjà un compte</a>
    </section>
  {/if}

  {#if pv}
    <a class="billet" href="/voyage/{pv.droit.id}" onclick={(e) => va(e, `/voyage/${pv.droit.id}`)}>
      <div class="haut">
        <div class="ligne"><span class="t-sur">Prochain voyage</span><span class="puce info">{dansJours(joursAvant(pv.departMs, now))}</span></div>
        <div class="trajet"><span class="code">{pv.vol.de}</span><span class="pointille" aria-hidden="true"></span><span class="avion"><Icone nom="avion" taille={22} /></span><span class="pointille" aria-hidden="true"></span><span class="code">{pv.vol.vers}</span></div>
        <div class="heures"><span>{pv.deVille} · <span class="mono">{pv.vol.heureDepart}</span></span><span>{pv.versVille} · <span class="mono">{pv.vol.heureArrivee}{pv.vol.plusJours > 0 ? ` +${pv.vol.plusJours}` : ''}</span></span></div>
        <span class="quand">{jourSemaine(pv.departMs, { avecAnnee: true, maj: true })} · {pv.numeroAffiche} · {pv.trajet}</span>
      </div>
      <div class="perfore"></div>
      <div class="bas">
        {#if pv.droit.statut === 'nomme'}<span class="statut ok"><Icone nom="ok" taille={16} trait={2} />Voyageur nommé{nommeA ? ` : ${nommeA}` : ''}</span>
        {:else}<span class="statut"><Icone nom="horloge" taille={16} trait={2} />Nommer le voyageur avant le {jourCourt(pv.echeanceMs)}</span>{/if}
        <span class="rond" aria-hidden="true"><Picto nom="fleche" /></span>
      </div>
    </a>
  {:else if compte}
    <section class="carte vide" aria-labelledby="pv-vide">
      <span class="t-sur">Prochain voyage</span>
      <h2 id="pv-vide" class="t-section">Aucun voyage pour l’instant</h2>
      <p class="t-sec">Votre prochain droit de voyage apparaîtra ici dès son achat.</p>
    </section>
  {/if}

  {#if bagage && pv}
    <a class="bande serre" href="/bagages" onclick={(e) => va(e, '/bagages')}>
      <span class="etiquette" aria-hidden="true"><span class="corps">{pv.vol.vers}<span class="oeillet"></span></span></span>
      <span class="texte"><span class="t1">Votre 2e bagage est inutilisé</span><span class="t2">D’autres passagers du vol {pv.vol.numero.split(' ')[1]} en cherchent.</span></span>
      <span class="rond petit" aria-hidden="true"><Picto nom="fleche" /></span>
    </a>
  {/if}
  {#if intention}
    <a class="bande serre" href="/intentions" onclick={(e) => va(e, '/intentions')}>
      <span class="pastille" aria-hidden="true"><Picto nom="etiquette" trait={1.75} /></span>
      <span class="texte"><span class="t1">Votre intention {intention.intention.de} → {intention.intention.vers} · max <span class="num">{fmt(intention.intention.budget)}</span></span>
        <span class="t2"><span class="num ok">{intention.recues}</span> proposition{intention.recues > 1 ? 's' : ''} reçue{intention.recues > 1 ? 's' : ''}{intention.fondsReserves ? ' · fonds réservés' : ''}</span></span>
      <span class="rond petit" aria-hidden="true"><Picto nom="fleche" /></span>
    </a>
  {/if}

  <a class="ou" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>
    <Icone nom="chercher" taille={22} trait={2} />
    <span class="texte"><span class="q">Où partir ?</span><span class="s">{ville(compte?.aeroport ?? 'YUL')} ({compte?.aeroport ?? 'YUL'}) · dates flexibles · neuf et revente</span></span>
    <span class="go" aria-hidden="true"><Picto nom="fleche" taille={20} /></span>
  </a>

  <a class="radar" href="/radar" onclick={(e) => va(e, '/radar')}>
    <span class="entete"><span class="t-sur">Radar des destinations</span><span class="titre">Explorer depuis Montréal</span></span>
    <RadarMini monde={app.monde} {now} compteId={compte?.id} />
    <span class="pied-radar"><span class="grow">10 destinations sur le radar, placées selon la direction et la durée de vol</span><span class="rond noir" aria-hidden="true"><Picto nom="fleche" taille={20} /></span></span>
  </a>

  {#if reventes.length}
    <section class="reventes" aria-labelledby="lm-titre">
      <div class="col g4"><h2 id="lm-titre" class="titre-section">Ces billets cherchent un voyageur</h2><p class="intro">Leurs détenteurs ne partent plus. Départs cette semaine, en revente.</p></div>
      <div class="defile" role="group" aria-label="Billets en revente cette semaine">
        {#each reventes as r (r.droitId)}
          <a class="mini" href="/revente" onclick={(e) => va(e, '/revente')}>
            <span class="puce signal">{departDans(r.joursAvantDepart)}</span>
            <span class="col g2"><span class="ville">{r.ville}</span><span class="route">YUL → {r.code} · {jourSemaine(r.departMs)} · {r.heureDepart}</span></span>
            <span class="tiret"></span>
            <span class="prix-ligne"><span class="col g2"><span class="prix">{fmt(r.prix)}</span><span class="equiv">Neuf équivalent : {fmt(r.prixEquivalent)}</span></span><span class="puce info">Revente</span></span>
            <span class="route">À nommer avant {jourSemaine(r.echeanceMs)} {heureDe(r.echeanceMs)}</span>
          </a>
        {/each}
      </div>
      <p class="note">Prix fixés par les détenteurs, dans le plafond de revente (règle à confirmer).</p>
    </section>
  {/if}
</main>

<style>
  .face { contain: inline-size; display: flex; flex-direction: column; gap: clamp(14px, 3dvh, 22px); animation: nx-dawn 450ms cubic-bezier(.2, .7, .2, 1) backwards; }
  .hello { display: flex; flex-direction: column; gap: 6px; }
  .salut { font-size: 15px; line-height: 20px; color: var(--ink2); }
  .grand { font: 600 clamp(40px, 6.4dvh, 50px) / 0.92 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: -0.005em; color: var(--ink); text-wrap: balance; }
  .bleu { color: var(--accent); }
  a { color: var(--ink); text-decoration: none; }
  .num { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-weight: 600; font-variant-numeric: tabular-nums; }
  .num.ok { color: var(--ok); }
  .col { display: flex; flex-direction: column; } .g2 { gap: 2px; } .g4 { gap: 4px; }
  .grow { flex: 1; min-width: 0; }
  .invite { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
  .vide { display: flex; flex-direction: column; gap: 6px; padding: 16px 18px; }

  /* Prochain voyage : le billet */
  .billet { display: block; position: relative; border-radius: 18px; background: var(--surface); box-shadow: var(--ombre); }
  .haut { padding: 16px 18px 18px; display: flex; flex-direction: column; gap: clamp(6px, 1.4dvh, 10px); }
  .ligne { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .trajet { display: flex; align-items: center; gap: 10px; }
  .code { font: 700 clamp(38px, 6.4dvh, 46px) / 1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .pointille { flex: 1; border-top: 2px dotted var(--line-strong); min-width: 8px; }
  .avion { color: var(--accent); display: flex; }
  .heures { display: flex; justify-content: space-between; gap: 12px; font-size: 13px; line-height: 18px; color: var(--ink2); }
  .heures .mono { font-weight: 500; color: var(--ink); }
  .quand { font-size: 14px; line-height: 20px; font-weight: 600; }
  .bas { padding: 14px 18px 16px; display: flex; align-items: center; gap: 10px; }
  .statut { flex: 1; display: inline-flex; align-items: center; gap: 8px; min-height: 36px; padding: 6px 12px; border-radius: 999px; background: var(--signal-soft); color: var(--signal-ink); font-size: 13px; line-height: 17px; font-weight: 700; }
  .statut.ok { background: var(--ok-soft); color: var(--ok); }
  .rond { width: 36px; height: 36px; flex: none; border-radius: 999px; background: var(--surface2); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .rond.noir { width: 44px; height: 44px; background: #0B1B2E; color: #fff; }

  /* Bandes : bagage inutilisé, intention d'achat */
  .bande { display: flex; align-items: center; gap: 12px; min-height: 64px; padding: 10px 12px 10px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .bande.serre { margin-top: -10px; }
  .texte { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .t1 { font-size: 15px; font-weight: 700; line-height: 20px; } .t2 { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .pastille { flex: none; width: 34px; height: 34px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); display: flex; align-items: center; justify-content: center; }
  .etiquette { position: relative; flex: none; width: 34px; height: 44px; margin-top: 4px; }
  .corps { position: absolute; inset: 0; padding-bottom: 5px; display: flex; align-items: flex-end; justify-content: center; border-radius: 6px; background: #0B1B2E; color: #fff; font: 700 13px/1 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; clip-path: polygon(9px 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%, 0 9px); }
  .oeillet { position: absolute; top: 6px; left: calc(50% - 4px); width: 8px; height: 8px; border-radius: 999px; background: var(--signal); }

  /* Où partir ? */
  .ou { display: flex; align-items: center; gap: 12px; min-height: 68px; padding: 10px 10px 10px 16px; border-radius: 16px; background: #0B1B2E; color: #fff; }
  .ou:hover { color: #fff; }
  .ou .q { font-weight: 600; font-size: 16px; line-height: 22px; } .ou .s { font-size: 13px; line-height: 18px; color: #C9D3DF; }
  .go { width: 44px; height: 44px; flex: none; border-radius: 12px; background: var(--signal); color: #0B1B2E; display: flex; align-items: center; justify-content: center; }

  /* Radar */
  .radar { display: flex; flex-direction: column; gap: 10px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .radar .entete { display: flex; flex-direction: column; gap: 2px; }
  .titre { font: 600 28px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; }
  .pied-radar { display: flex; align-items: center; gap: 12px; font-size: 14px; line-height: 20px; color: var(--ink2); }

  /* Reventes de la semaine */
  .reventes { display: flex; flex-direction: column; gap: 10px; }
  .titre-section { font: 600 28px/30px 'Barlow Condensed', 'Arial Narrow', sans-serif; color: var(--ink); }
  .intro { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .defile { display: flex; gap: 12px; overflow-x: auto; margin: 0 -20px; padding: 4px 20px 14px; scroll-snap-type: x mandatory; scroll-padding-inline: 20px; }
  .mini { flex: none; width: 232px; scroll-snap-align: start; display: flex; flex-direction: column; gap: 10px; padding: 16px; border-radius: 18px; background: var(--surface); box-shadow: var(--ombre); }
  .mini .puce { align-self: flex-start; }
  .ville { font: 600 40px/40px 'Barlow Condensed', 'Arial Narrow', sans-serif; } .route { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .tiret { border-top: 2px dashed var(--surface2); }
  .prix-ligne { display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; }
  .prix { font: 600 24px/28px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .equiv { font-size: 12px; line-height: 16px; color: var(--ink2); }
  .note { font-size: 13px; line-height: 18px; color: var(--ink3); }
  a:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
  @media (prefers-reduced-motion: reduce) { .face { animation: nx-fondu 250ms ease backwards !important; animation-duration: 250ms !important; } .defile { scroll-snap-type: none; } }
  @keyframes nx-fondu { from { opacity: 0; } to { opacity: 1; } }
</style>
