<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { ecart, fmt, fmtPct } from '../../core/argent.ts';
  import { departDe, echeanceDe, joursAvant, peutEchanger, plafond } from '../../core/regles.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { carnetDuVol, transactionsDuVol } from '../../domain/carnet.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { compagnieDe, droitDe, offresDuVol, volDe } from '../../domain/marche.ts';
  import Absent from './Absent.svelte';
  import { descriptionGraphique, fenetre, libellePeriode, PERIODES, reperesDates, serieOffre, variation, volumes, type Periode } from './cours.ts';
  import { alerteActive, basculerAlerte } from './etat.ts';
  import { heure, jourCourt, jourHeure, jourSemaine } from './format.ts';
  import Graphique from './Graphique.svelte';
  import { naviguer } from './lien.ts';
  import Pic from './Pic.svelte';
  import Plaque from './Plaque.svelte';

  /** Cours d'un vol : meilleure offre de revente, historique, carnet d'ordres cumulé, dernières transactions. */
  let { id = '' }: { id?: string } = $props();
  const compte = $derived(compteCourant());
  const vol = $derived(volDe(id));
  let periode = $state<Periode>('1S');
  const maj = heure(maintenant());

  const carnet = $derived(carnetDuVol(id));
  const transactions = $derived(transactionsDuVol(id, 500));
  const offres = $derived(offresDuVol(id, !!compte?.pass.actif));
  const meilleure = $derived(carnet.meilleureOffre);
  const depart = $derived(vol ? departDe(vol.jour, vol.heureDepart) : 0);
  const ouvert = $derived(vol ? peutEchanger(depart, maintenant()) : false);
  const pourAcheter = $derived(offres.find((o) => o.type === 'revente' && droitDe(o.droitId ?? '')?.detenteurId !== compte?.id) ?? offres.find((o) => o.type === 'neuf'));

  const complete = $derived(vol ? serieOffre(vol.courbe, meilleure) : undefined);
  const neuf = $derived(vol ? fenetre(vol.courbe, periode) : []);
  const offre = $derived(complete ? fenetre(complete, periode) : undefined);
  const chg = $derived(offre ? variation(offre) : undefined);
  const nomPeriode = $derived(libellePeriode(periode, neuf.length, maintenant()));
  const vols = $derived(volumes(transactions.map((t) => t.quand), neuf.length, maintenant()));
  const description = $derived(descriptionGraphique(offre, neuf, nomPeriode, vols.reduce((a, b) => a + b, 0)));
  const ecartNeuf = $derived(vol && meilleure !== undefined ? ecart(vol.prixNeuf, meilleure) : undefined);
  const alerte = $derived(compte ? alerteActive(compte.id, id) : false);
  const maxCumul = $derived(Math.max(1, ...carnet.offres.map((n) => n.cumul), ...carnet.demandes.map((n) => n.cumul)));
  const asks = $derived([...carnet.offres.slice(0, 6)].reverse()), bids = $derived(carnet.demandes.slice(0, 6));
  const sans = (s: string) => s.replace(/^\+/, '');
  const quand = (ms: number) => (jourCourt(ms) === jourCourt(maintenant()) ? heure(ms) : jourCourt(ms));
</script>

{#if !id}
  <!-- ancien écran réinstancié brièvement au changement de route -->
{:else if !vol}
  <Absent titre="Vol introuvable" message="Ce vol n’existe pas ou n’est plus coté." lien="/portefeuille" libelleLien="Voir mon portefeuille" retour="/portefeuille" />
{:else}
  {@const cie = compagnieDe(vol)}
  <Ecran titre="Cours du vol" face="nuit" retour="/portefeuille" large>
    {#snippet droite()}
      <button type="button" class="cloche" class:on={alerte} aria-pressed={alerte} aria-label="Alerte de prix sur ce vol" onclick={() => compte && basculerAlerte(compte.id, id)}><Icone nom="cloche" /></button>
    {/snippet}

    <div class="pc-duo"><div class="pc-col">
    <section class="vol carte" aria-label="Vol">
      <div class="trajet" role="img" aria-label="{vol.de} vers {vol.vers}"><Plaque code={vol.de} /><Icone nom="suivant" taille={18} /><Plaque code={vol.vers} /></div>
      <div class="qui"><span class="num">{cie.nom} {vol.numero.split(' ')[1]}</span><span class="date">{jourSemaine(depart)}</span></div>
    </section>

    <section class="prix" aria-labelledby="px-t">
      <p id="px-t" class="t-sur">Meilleure offre de revente</p>
      <p class="gros mono" data-testid="meilleure-offre">{meilleure !== undefined ? fmt(meilleure) : '—'}</p>
      {#if chg}
        <div class="ligne-chg">
          <span class="chg" class:hausse={chg.sens === 'hausse'} class:baisse={chg.sens === 'baisse'}><Pic nom={chg.sens === 'hausse' ? 'hausse' : 'baisse'} taille={16} trait={2.25} />{chg.texte}</span>
          <span class="periode">{nomPeriode}</span><span class="maj">· mis à jour à {maj}</span>
        </div>
      {:else}<p class="t-sec">Aucune annonce de revente pour l’instant. Placez un ordre : il s’exécutera dès qu’un détenteur met son billet en vente à votre prix.</p>{/if}
      {#if alerte}<p class="alerte-ok" role="status"><Icone nom="ok" taille={16} trait={2} />Alerte activée : vous serez prévenu si la meilleure offre change.</p>{:else}<span class="sr" role="status"></span>{/if}
    </section>

    <section class="reperes carte2-grille" aria-label="Repères de prix">
      <div><span class="lib">Prix équivalent neuf</span><span class="val mono">{fmt(vol.prixNeuf)}</span><span class="note">{#if ecartNeuf && ecartNeuf.abs !== 0}Offre {fmtPct(Math.abs(ecartNeuf.pct)).replace('+', '')} {ecartNeuf.abs < 0 ? 'sous' : 'au-dessus du'} le neuf{:else if ecartNeuf}Au niveau du neuf{:else}Prix d’un billet neuf{/if}</span></div>
      <div><span class="lib"><Icone nom="cadenas" taille={14} trait={2} />Plafond de revente</span><span class="val mono">{fmt(plafond(vol.prixNeuf))}</span><span class="note">Règle provisoire</span></div>
    </section>

    <section class="historique" aria-labelledby="ch-t">
      <div class="entete-h"><h2 id="ch-t" class="t-section">Historique</h2>
        <div class="periodes" role="group" aria-label="Période du graphique">{#each PERIODES as p}<button type="button" aria-pressed={periode === p} class:tout={p === 'Tout'} onclick={() => (periode = p)}>{p}</button>{/each}</div></div>
      <Graphique {offre} {neuf} volumes={vols} reperes={reperesDates(neuf.length, maintenant())} {description} hausse={chg?.sens === 'hausse'} maintenant={maintenant()} />
    </section>

    </div><div class="pc-col">
    <section class="carnet carte" aria-labelledby="ob-t">
      <div class="entete-h"><h2 id="ob-t" class="t-section">Carnet d’ordres</h2><span class="t-aide">Billets · cumul</span></div>
      <div class="cote"><p id="asks-t" class="sur vente"><span class="carre"></span>Offres de vente</p>
        {#if asks.length}<ul aria-labelledby="asks-t">{#each asks as n}
          <li class:meilleur={n.prix === carnet.meilleureOffre} class="vente"><span class="barre" style="width: {(n.cumul / maxCumul) * 100}%" aria-hidden="true"></span>
            <span class="p">{fmt(n.prix)}{#if n.prix === carnet.meilleureOffre}<span class="tag">Meilleure</span>{/if}</span><span class="q">×{n.qte}</span><span class="c" title="Cumul">{n.cumul}</span></li>{/each}</ul>
        {:else}<p class="vide t-sec">Aucune offre de vente en ce moment.</p>{/if}</div>
      <div class="ecart"><span class="tirets"></span>{#if carnet.ecart}<span class="t-ecart">Écart <span class="mono">{fmt(carnet.ecart.abs)} · {sans(fmtPct(carnet.ecart.pct))}</span></span>{:else}<span class="t-ecart">Écart <span class="mono">—</span></span>{/if}<span class="tirets"></span></div>
      <div class="cote"><p id="bids-t" class="sur achat"><span class="carre"></span>Demandes d’achat</p>
        {#if bids.length}<ul aria-labelledby="bids-t">{#each bids as n}
          <li class:meilleur={n.prix === carnet.meilleureDemande} class="achat"><span class="barre" style="width: {(n.cumul / maxCumul) * 100}%" aria-hidden="true"></span>
            <span class="p">{fmt(n.prix)}{#if n.prix === carnet.meilleureDemande}<span class="tag">Meilleure</span>{/if}</span><span class="q">×{n.qte}</span><span class="c" title="Cumul">{n.cumul}</span></li>{/each}</ul>
        {:else}<p class="vide t-sec">Aucune demande d’achat en ce moment.</p>{/if}
        <a class="lien-int" href="/marche-intentions" onclick={(e) => naviguer(e, '/marche-intentions')}><Icone nom="ok" taille={16} trait={2} /><span>Voir les intentions d’achat avec fonds réservés</span><Icone nom="suivant" taille={16} trait={2} /></a></div>
      <p class="plafond-note"><Icone nom="cadenas" taille={14} trait={2} />Aucune offre ne peut dépasser le plafond de {fmt(plafond(vol.prixNeuf))}.</p>
    </section>

    <section aria-labelledby="tx-t" class="transactions"><h2 id="tx-t" class="t-section">Dernières transactions</h2>
      {#if transactions.length}
        <table><thead><tr><th scope="col">Heure</th><th scope="col" class="d">Prix</th><th scope="col" class="d">Qté</th><th scope="col" class="d">Var.</th></tr></thead>
          <tbody>{#each transactions.slice(0, 5) as t}<tr><td class="h">{quand(t.quand)}</td><td class="d p">{fmt(t.prix)}</td><td class="d">×{t.qte}</td>
            <td class="d v" class:hausse={(t.variation ?? 0) > 0} class:baisse={(t.variation ?? 0) < 0}>{t.variation === undefined ? '—' : `${t.variation > 0 ? '+' : t.variation < 0 ? '−' : ''}${fmt(Math.abs(t.variation))}`}</td></tr>{/each}</tbody></table>
      {:else}<p class="carte2 t-sec" style="padding: 14px">Aucune transaction sur ce vol pour l’instant.</p>{/if}
    </section>

    </div></div>
    {#if ouvert}<p class="jn"><Icone nom="horloge" taille={18} trait={2} /><span><span class="mono">J-{joursAvant(depart, maintenant())}</span> avant le départ : les échanges s’arrêtent le {jourHeure(echeanceDe(depart))}, à la finalisation nominative.</span></p>
    {:else}<p class="jn" role="alert"><Icone nom="horloge" taille={18} trait={2} /><span>Les échanges sont fermés sur ce vol : l’échéance du {jourHeure(echeanceDe(depart))} est passée.</span></p>{/if}
    <p class="t-aide mentions">Prix indicatifs. Un droit de voyage n’est pas un placement financier. Données de démonstration.</p>

    {#snippet pied()}
      <div class="actions">
        <a class="btn sec" href="/ordre/{id}" aria-disabled={!ouvert} onclick={(e) => (ouvert ? naviguer(e, `/ordre/${id}`) : e.preventDefault())}>Placer un ordre</a>
        {#if pourAcheter}<a class="btn acheter" href="/paiement/{pourAcheter.id}" aria-disabled={!ouvert} onclick={(e) => (ouvert ? naviguer(e, `/paiement/${pourAcheter.id}`) : e.preventDefault())}>Acheter <span class="mono">{fmt(pourAcheter.prix)}</span></a>{/if}
      </div>
    {/snippet}
  </Ecran>
{/if}

<style>
  .cloche { width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center; cursor: pointer; background: var(--surface); color: var(--ink); border: 1px solid var(--line); }
  .cloche.on { background: var(--accent-soft); color: var(--accent); border-color: rgba(255, 210, 63, 0.5); }
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .vol { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px; border-radius: 16px; background: #060708; box-shadow: none; }
  .trajet { display: flex; align-items: center; gap: 8px; color: var(--ink3); } .qui { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; text-align: right; }
  .num { font-size: 14px; font-weight: 600; } .date { font-size: 13px; color: var(--ink2); }
  .prix { display: flex; flex-direction: column; gap: 8px; }
  .gros { margin: 0; font-weight: 600; font-size: clamp(44px, 15vw, 60px); line-height: 1; letter-spacing: -0.03em; white-space: nowrap; }
  .ligne-chg { display: flex; align-items: center; flex-wrap: wrap; gap: 6px 10px; }
  .chg { display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 10px; border-radius: 999px; font: 600 15px/1 'IBM Plex Mono', ui-monospace, monospace; white-space: nowrap; background: var(--surface2); color: var(--ink2); }
  .chg.baisse { background: rgba(255, 158, 94, 0.12); color: var(--down); } .chg.hausse { background: rgba(98, 199, 255, 0.12); color: var(--up); }
  .periode { font-size: 13px; font-weight: 500; color: var(--ink2); } .maj { font-size: 13px; color: var(--ink3); }
  .alerte-ok { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; }
  .carte2-grille { display: grid; grid-template-columns: 1fr 1fr; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .carte2-grille > div { display: flex; flex-direction: column; gap: 4px; padding: 14px 14px 14px 16px; min-width: 0; } .carte2-grille > div + div { border-left: 1px solid var(--line); padding: 14px 16px 14px 14px; }
  .lib { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 500; color: var(--ink2); } .val { font-weight: 600; font-size: 20px; white-space: nowrap; } .note { font-size: 12px; color: var(--ink3); }
  .historique { display: flex; flex-direction: column; gap: 12px; } .entete-h { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px; }
  .t-section { text-transform: uppercase; letter-spacing: 0.04em; }
  .periodes { display: flex; gap: 2px; padding: 2px; border-radius: 12px; background: var(--surface); border: 1px solid var(--line); }
  .periodes button { min-width: 44px; min-height: 44px; padding: 0 8px; border: 0; border-radius: 10px; cursor: pointer; font: 600 14px/1 'IBM Plex Mono', ui-monospace, monospace; background: transparent; color: var(--ink2); }
  .periodes button.tout { font-family: 'Barlow', system-ui, sans-serif; font-weight: 700; } .periodes button[aria-pressed='true'] { background: var(--ink); color: var(--bg); }
  .carnet { display: flex; flex-direction: column; gap: 12px; padding: 18px; }
  .cote { display: flex; flex-direction: column; gap: 2px; } .cote ul { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; font: 15px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .sur { margin: 0 0 4px; display: flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; } .sur.vente { color: var(--down); } .sur.achat { color: var(--up); }
  .carre { width: 8px; height: 8px; border-radius: 2px; background: currentColor; }
  li { position: relative; display: grid; grid-template-columns: 1fr 44px 44px; align-items: center; height: 32px; padding: 0 8px; border-radius: 6px; overflow: hidden; }
  li .barre { position: absolute; right: 0; top: 0; bottom: 0; opacity: 0.18; } li.vente .barre { background: var(--down); } li.achat .barre { background: var(--up); }
  li .p { position: relative; display: flex; align-items: center; gap: 8px; font-weight: 600; } li.vente .p { color: var(--down); } li.achat .p { color: var(--up); }
  li .q, li .c { position: relative; text-align: right; } li .c { color: var(--ink2); } li.vente.meilleur { box-shadow: inset 0 0 0 1px rgba(255, 158, 94, 0.45); } li.achat.meilleur { box-shadow: inset 0 0 0 1px rgba(98, 199, 255, 0.45); }
  .tag { font: 700 10px/1 'Barlow', system-ui, sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink); }
  .vide { padding: 6px 8px; }
  .ecart { display: flex; align-items: center; gap: 10px; padding: 2px 0; } .tirets { flex: 1; border-top: 1px dashed var(--line-strong); } .t-ecart { font-size: 13px; font-weight: 600; color: var(--ink2); white-space: nowrap; } .t-ecart .mono { color: var(--ink); }
  .lien-int { display: flex; align-items: center; gap: 8px; min-height: 44px; margin-top: 4px; padding: 0 8px; border-radius: 10px; background: var(--ok-soft); color: var(--ink); font-size: 13px; font-weight: 600; } .lien-int :global(svg:first-child) { color: var(--ok); } .lien-int :global(svg:last-child) { color: var(--ok); } .lien-int span { flex: 1; }
  .plafond-note { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--ink3); }
  .transactions { display: flex; flex-direction: column; gap: 10px; }
  table { width: 100%; border-collapse: collapse; border-radius: 16px; overflow: hidden; background: #060708; font: 14px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  thead tr { font: 700 11px 'Barlow', system-ui, sans-serif; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ink3); }
  th { padding: 10px 8px 6px; text-align: left; font-weight: 700; } th:first-child, td:first-child { padding-left: 14px; } th:last-child, td:last-child { padding-right: 14px; } th.d, td.d { text-align: right; }
  tbody tr { border-top: 1px solid #1a1c21; } td { padding: 12px 8px; } td.h { color: var(--ink2); } td.p { font-weight: 600; white-space: nowrap; } td.v { font-weight: 600; white-space: nowrap; } td.v.hausse { color: var(--up); } td.v.baisse { color: var(--down); }
  .jn { display: flex; align-items: flex-start; gap: 10px; padding: 10px 12px; border-radius: 12px; background: var(--accent-soft); color: var(--accent); font-size: 13px; font-weight: 600; line-height: 18px; } .jn :global(svg) { margin-top: 0; }
  .mentions { line-height: 17px; font-size: 12px; }
  .actions { display: flex; flex-wrap: wrap; gap: 10px; } .actions .btn { flex: 1 1 130px; min-width: 0; padding: 0 10px; min-height: 52px; border-radius: 14px; text-align: center; } .actions .acheter { flex-grow: 1.25; } .actions .btn.sec { background: var(--surface2); border-color: var(--line-strong); }
</style>
