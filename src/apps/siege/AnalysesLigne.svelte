<script lang="ts">
  import { agreger, comparer, concurrence, entre, margeBus, remplissageHeure, serieJours, simulerPrix, tendance } from '../../core/analyses.ts';
  import { ajouterJours } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import Defile from './Defile.svelte';
  import { chauffeurDe, nomCourt, ventesDu } from './donnees.ts';
  import { classeSens, classeSensComp, libJour, libPct, nomLigne, pct } from './format.ts';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  const compagnieDuPatron = app.monde.personnes.find((p) => p.id === app.session.personneId)?.compagnieId ?? 'BX';
  const ligne = $derived(app.monde.lignes.find((l) => l.id === param('ligne')) ?? app.monde.lignes.find((l) => l.id === 'l-BX-bafoussam') ?? app.monde.lignes.find((l) => l.compagnieId === compagnieDuPatron) ?? app.monde.lignes[0]);
  const auj = $derived(aujourdhui());
  const toutes = $derived(ventesDu(ajouterJours(auj, -34), auj));
  const v = $derived(toutes.filter((x) => x.ligneId === ligne.id));
  const sept = $derived(entre(v, ajouterJours(auj, -6), auj)), septAvant = $derived(entre(v, ajouterJours(auj, -13), ajouterJours(auj, -7)));
  const a7 = $derived(agreger(sept)), a7p = $derived(agreger(septAvant)), a28 = $derived(agreger(entre(v, ajouterJours(auj, -27), auj)));
  const comp = $derived(comparer(a7.recette, a7p.recette));
  const tend = $derived(tendance(serieJours(v, ajouterJours(auj, -6), 7).map((p) => p.recette)));
  const conc = $derived(concurrence(app.monde.lignes, ligne));
  const parDepart = $derived(a7.departs ? a7.recette / a7.departs : 0);
  const marge = $derived(margeBus(parDepart, ligne.dureeMin));
  const chaleur = $derived(remplissageHeure(entre(v, ajouterJours(auj, -27), auj)));
  const heures = ['05', '06', '07', '08', '09', '10', '11', '12', '14', '16', '18', '20'], jours = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  const cases = $derived(chaleur.flatMap((r, d) => r.map((x, h) => ({ d, h, x }))).filter((c) => c.x !== null));
  const meilleur = $derived(cases.reduce((m, c) => (c.x! > (m?.x ?? -1) ? c : m), null as (typeof cases)[number] | null)), plusFaible = $derived(cases.reduce((m, c) => (c.x! < (m?.x ?? 2) ? c : m), null as (typeof cases)[number] | null));
  const resumeChaleur = $derived(meilleur && plusFaible ? `Meilleur créneau : ${jours[meilleur.d]} ${heures[meilleur.h]} h, ${pct(meilleur.x!)}. Plus faible : ${jours[plusFaible.d]} ${heures[plusFaible.h]} h, ${pct(plusFaible.x!)}.` : 'Aucun départ sur la période.');
  const nbBus = $derived(new Set(v.map((x) => x.busId)).size);
  const duree = $derived(`${Math.floor(ligne.dureeMin / 60)} h${ligne.dureeMin % 60 ? ` ${String(ligne.dureeMin % 60).padStart(2, '0')}` : ''}`);

  let px = $state<number | null>(null);
  const prixSim = $derived(px ?? ligne.prix);
  const sim = $derived(simulerPrix({ prix: ligne.prix, taux: a28.taux || 0.6, capacite: a28.departs ? a28.capacite / a28.departs : 50 }, prixSim));
  const departs = $derived([...sept].sort((a, b) => (b.jour + b.heure).localeCompare(a.jour + a.heure)));
  const compagnie = (id: string) => app.monde.compagnies.find((c) => c.id === id);
  const immat = (id: string) => app.monde.bus.find((b) => b.id === id)?.immat ?? id;
  function changer(e: Event) { aller(`/siege/analyses/ligne?ligne=${(e.currentTarget as HTMLSelectElement).value}`); px = null; }
</script>

<Siege actif="analyses">
  <div class="top">
    <div class="row g12"><Lien href="/siege/analyses" class="ib" aria-label="Retour aux analyses"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Lien>
      <div class="col"><h1 class="ttl">{nomLigne(ligne)}</h1><span class="t13 mut">{ligne.horaires.length} départs / jour · {nbBus} bus · {fcfa(ligne.prix)} F {ligne.classe.toLowerCase()} · {duree}{ligne.actif ? '' : ' · suspendue'}</span></div></div>
    <div class="row g8 wrapf">
      <label class="sr" for="choix-ligne">Choisir une ligne</label>
      <select id="choix-ligne" class="in" style="width: auto; max-width: 260px" value={ligne.id} onchange={changer}>{#each app.monde.lignes.filter((l) => l.compagnieId === ligne.compagnieId) as l (l.id)}<option value={l.id}>{nomLigne(l)} · {l.classe}</option>{/each}</select>
      <Lien href="/siege/config/ligne?ligne={ligne.id}" class="b s sm">Modifier la ligne</Lien><Lien href="/assistant/reponse?ligne={ligne.id}" class="b p sm">Demander à l’assistant</Lien>
    </div>
  </div>

  <div class="kpis">
    <div class="gl"><span class="lab">Recette 7 j</span><span class="ttl t24">{fcfa(a7.recette)} F</span><span class="t12 {classeSensComp(comp.sens)}">{libPct(comp.pct)}{tend.joursDeBaisse >= 2 ? ` · ${tend.joursDeBaisse} jours de baisse` : ''}</span></div>
    <div class="gl"><span class="lab">Remplissage</span><span class="ttl t24">{pct(a7.taux)}</span><span class="t12 {a7.taux < a7p.taux ? 'erc' : 'mut'}">{pct(a7p.taux)} il y a 7 jours</span></div>
    <div class="gl"><span class="lab">Concurrence</span><span class="ttl t24">{conc ? `${fcfa(conc.prix)} F` : '—'}</span><span class="t12 {conc && conc.prix < ligne.prix ? 'wac' : 'mut'}">{conc ? `${compagnie(conc.compagnieId)?.nom ?? conc.compagnieId} · ${conc.heure}` : 'aucune autre compagnie sur cette liaison'}</span></div>
    <div class="gl"><span class="lab">Marge / bus</span><span class="ttl t24 {marge < 0 ? 'erc' : ''}">{marge < 0 ? '−' : ''}{fcfa(Math.abs(marge) / 1000)} k F</span><span class="t12 mut">carburant + péages estimés</span></div>
  </div>

  <div class="c21">
    <div class="gl">
      <div class="row sp wrapf"><span class="t15 b7">Remplissage par heure et par jour</span><span class="t12 mut">plus c’est clair, plus c’est plein · 4 dernières semaines</span></div>
      <div class="hm" style="margin-top: 10px" role="img" aria-label="Carte de chaleur du remplissage par heure et par jour. {resumeChaleur}">
        {#each jours as j, d (j)}<i class="lb" aria-hidden="true">{j}</i>{#each heures as _, h (h)}{@const x = chaleur[d][h]}<i class:vide={x === null} style="--a: {x === null ? 0 : Math.max(0.08, Math.min(1, x)).toFixed(2)}" title="{j} {heures[h]} h · {x === null ? 'pas de départ' : pct(x)}"></i>{/each}{/each}
        <i class="lb" aria-hidden="true"></i>{#each heures as h (h)}<i class="lb" aria-hidden="true">{h}</i>{/each}
      </div>
      <details class="alt"><summary>Voir les valeurs en tableau</summary>
        <Defile label="Remplissage par jour et par heure" ><table class="tbl"><caption class="sr">Remplissage moyen par jour et par tranche horaire</caption><thead><tr><th scope="col">Jour</th>{#each heures as h (h)}<th scope="col" class="r">{h} h</th>{/each}</tr></thead>
          <tbody>{#each jours as j, d (j)}<tr><th scope="row">{j}</th>{#each heures as _, h (h)}<td class="r mono">{chaleur[d][h] === null ? '·' : pct(chaleur[d][h]!)}</td>{/each}</tr>{/each}</tbody></table></Defile>
      </details>
    </div>
    <div class="gl">
      <span class="t15 b7">Simulateur de prix</span>
      <div class="col g8" style="margin-top: 10px">
        <div class="row sp"><span class="t13 mut" id="lib-px">Prix de la ligne</span><span class="ttl t20" aria-live="polite" aria-labelledby="lib-px">{fcfa(prixSim)} F</span></div>
        <div class="row g8"><button class="b s sm grow" type="button" disabled={prixSim <= 1000} onclick={() => (px = Math.max(1000, prixSim - 500))}>− 500</button><button class="b s sm grow" type="button" disabled={prixSim >= 30000} onclick={() => (px = Math.min(30000, prixSim + 500))}>+ 500</button></div>
        <div class="row sp"><span class="t13 mut">Remplissage attendu</span><b class={classeSens(sim.taux, 0.8, 0.6)}>{pct(sim.taux)}</b></div>
        <div class="row sp"><span class="t13 mut">Recette / bus attendue</span><b>{fcfa(sim.recetteBus)} F</b></div>
        <div class="bar" role="img" aria-label="Remplissage attendu {pct(sim.taux)}"><i style="width: {Math.round(sim.taux * 100)}%"></i></div>
        <Lien href="/siege/config/ligne?ligne={ligne.id}&prix={prixSim}" class="b p sm {prixSim === ligne.prix ? 'off' : ''}" aria-disabled={prixSim === ligne.prix}>Appliquer {fcfa(prixSim)} F</Lien>
        <p class="t12 mut3">Hypothèse : 500 F en moins = 12 points de remplissage en plus (bornes 20–98 %).</p>
      </div>
    </div>
  </div>

  <div class="gl">
    <div class="row sp wrapf"><span class="t15 b7">Départs de la semaine</span><span class="t12 mut">clic sur un bus pour son détail</span></div>
    <Defile label="Départs de la semaine" ><table class="tbl" style="margin-top: 8px"><thead><tr><th scope="col">Jour</th><th scope="col">Heure</th><th scope="col">Bus</th><th scope="col">Chauffeur</th><th scope="col" class="r">Billets</th><th scope="col" class="r">Recette</th><th scope="col">Statut</th></tr></thead><tbody>
      {#each departs as d (d.departId)}<tr class="rowlink"><td>{libJour(d.jour)}</td><td class="mono">{d.heure}</td><td><Lien href="/siege/analyses/bus?bus={d.busId}" class="lien"><span class="cell">{immat(d.busId)}</span></Lien></td><td>{nomCourt(chauffeurDe(d.departId, d.compagnieId, d.busId))}</td>
        <td class="r">{d.billets} / {d.capacite}</td><td class="r mono">{fcfa(d.recette)}</td>
        <td>{#if d.statut === 'annule'}<span class="pl er">annulé</span>{:else}<span class="pl {d.taux >= 0.75 ? 'ok' : d.taux >= 0.5 ? 'wa' : 'er'}">{pct(d.taux)}</span>{#if d.retardMin > 0}<span class="pl wa" style="margin-left: 4px">+{d.retardMin} min</span>{/if}{/if}</td></tr>
      {:else}<tr><td colspan="7" class="vide-etat">Aucun départ cette semaine.</td></tr>{/each}
    </tbody></table></Defile>
  </div>
</Siege>
