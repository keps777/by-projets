<script lang="ts">
  import { agreger, entre, parBus, parGare, parLigne, periode, serieJours, tendance, comparer, OBJECTIF_REMPLISSAGE, type CodePeriode } from '../../core/analyses.ts';
  import { ajouterJours } from '../../core/dates.ts';
  import { distanceKm, excesVitesse, profilVitesse, telemetrieBus } from '../../core/telemetrie.ts';
  import { fcfa } from '../../core/money.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import Courbe from './Courbe.svelte';
  import Defile from './Defile.svelte';
  import { ventesDu } from './donnees.ts';
  import { classeSens, classeSensComp, gareParId, libJour, libPct, mCourt, mf, nomGare, nomLigne, pct } from './format.ts';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  let code = $state<CodePeriode>('semaine');
  let compagnie = $state<string>(personneCourante()?.compagnieId ?? 'BX');
  let toutesLesLignes = $state(false);

  const auj = $derived(aujourdhui());
  const per = $derived(periode(code, auj));
  const nbSerie = $derived(code === 'mois' ? 30 : 7);
  const debutSerie = $derived(ajouterJours(auj, -(nbSerie - 1)));
  const debutTout = $derived([per.precDebut, ajouterJours(debutSerie, -nbSerie)].sort()[0]);
  const toutes = $derived(ventesDu(debutTout, auj));
  const filtrees = $derived(compagnie === 'toutes' ? toutes : toutes.filter((v) => v.compagnieId === compagnie));
  const courant = $derived(agreger(entre(filtrees, per.debut, per.fin)));
  const precedent = $derived(agreger(entre(filtrees, per.precDebut, per.precFin)));
  const compRecette = $derived(comparer(courant.recette, precedent.recette));
  const lignesCompagnie = $derived(app.monde.lignes.filter((l) => compagnie === 'toutes' || l.compagnieId === compagnie));
  const busCompagnie = $derived(app.monde.bus.filter((b) => compagnie === 'toutes' || b.compagnieId === compagnie));
  const garesCompagnie = $derived(new Set(lignesCompagnie.map((l) => l.gareDe)));
  const busActifs = $derived(new Set(entre(filtrees, per.debut, per.fin).filter((v) => v.statut !== 'annule').map((v) => v.busId)).size);

  const serieA = $derived(serieJours(filtrees, debutSerie, nbSerie)), serieB = $derived(serieJours(filtrees, ajouterJours(debutSerie, -nbSerie), nbSerie));
  const tend = $derived(tendance(serieA.map((p) => p.recette)));
  const labels = $derived(serieA.map((p) => (code === 'mois' ? String(Number(p.jour.slice(8))) : libJour(p.jour))));

  const dansPeriode = $derived(entre(filtrees, per.debut, per.fin));
  const gares = $derived(parGare(dansPeriode).map((g) => {
    const t = tendance(serieJours(filtrees.filter((v) => v.gareDe === g.cle), debutSerie, nbSerie).map((p) => p.recette));
    return { ...g, nom: nomGare(gareParId(g.cle)), tend: t };
  }));
  const maxGare = $derived(Math.max(1, ...gares.map((g) => g.recette)));
  const pire = $derived(gares.filter((g) => g.tend.sens === 'baisse').sort((a, b) => a.tend.pct - b.tend.pct)[0]);
  const lignes = $derived(parLigne(dansPeriode).map((l) => ({ ...l, ligne: app.monde.lignes.find((x) => x.id === l.cle)! })).filter((l) => l.ligne));
  const lignesAffichees = $derived(toutesLesLignes ? lignes : lignes.slice(0, 6));

  const bus = $derived(parBus(dansPeriode).map((b) => {
    const trajets = dansPeriode.filter((v) => v.busId === b.cle && (v.statut === 'arrive' || v.statut === 'parti'));
    const exces = trajets.reduce((s, v) => s + excesVitesse(profilVitesse(v.departId)), 0), km = trajets.reduce((s, v) => s + distanceKm(v.de, v.vers), 0), t = telemetrieBus(b.cle, auj);
    const signal = exces > 0 ? { txt: `${exces} excès vitesse`, ton: 'er', rang: 0 - exces } : t.entretienJours <= 14 ? { txt: `${t.entretienLibelle.split(' ')[0]} J-${t.entretienJours}`, ton: 'wa', rang: 100 + t.entretienJours } : { txt: 'RAS', ton: 'ok', rang: 1000 };
    return { id: b.cle, immat: app.monde.bus.find((x) => x.id === b.cle)?.immat ?? b.cle, km, signal };
  }).sort((a, b) => a.signal.rang - b.signal.rang).slice(0, 4));
  const dateCourte = (j: string) => libJour(j);
</script>

<Siege actif="analyses">
  <div class="top">
    <div class="col"><h1 class="ttl">Analyses</h1><span class="t13 mut">{garesCompagnie.size} gares · {lignesCompagnie.length} lignes · {busCompagnie.length} bus · données des caisses et des scans</span></div>
    <div class="row g8 wrapf">
      <label class="sr" for="filtre-compagnie">Compagnie</label>
      <select id="filtre-compagnie" class="in" style="width: auto" bind:value={compagnie}><option value="toutes">Toutes les compagnies</option>{#each app.monde.compagnies as c (c.id)}<option value={c.id}>{c.nom}</option>{/each}</select>
      <div class="seg2" role="group" aria-label="Période">{#each [['jour', 'Jour'], ['semaine', 'Semaine'], ['mois', 'Mois']] as [c, n] (c)}<button type="button" class:on={code === c} aria-pressed={code === c} onclick={() => (code = c as CodePeriode)}>{n}</button>{/each}</div>
      <Lien href="/siege/comptable" class="b s sm">Exporter</Lien>
    </div>
  </div>

  <div class="kpis">
    <div class="gl ac"><span class="lab">Recette</span><span class="ttl t24">{mf(courant.recette)}</span><span class="t12 {classeSensComp(compRecette.sens)}">{libPct(compRecette.pct)} {per.comparaison}</span></div>
    <div class="gl"><span class="lab">Billets</span><span class="ttl t24">{fcfa(courant.billets)}</span><span class="t12 mut">{busActifs} bus</span></div>
    <div class="gl"><span class="lab">Remplissage</span><span class="ttl t24">{pct(courant.taux)}</span><span class="t12 {classeSens(courant.taux, OBJECTIF_REMPLISSAGE)}">objectif 85 %</span></div>
    <div class="gl"><span class="lab">Départs à l’heure</span><span class="ttl t24">{pct(courant.auHeure)}</span><span class="t12 wac">{courant.retards} retards ≥ 15 min · {courant.annules} annulés</span></div>
  </div>
  <p class="tag-demo" role="note">Démonstration : {fcfa(courant.recetteReelle)} F de ventes réelles saisies dans l’application ; le reste est reconstitué à partir des sièges déjà pris sur chaque départ.</p>

  <div class="c21">
    <div class="gl">
      <div class="row sp wrapf"><span class="t15 b7">Recette par jour</span><span class="row g12 t12 mut"><span class="aq">● cette période</span><span>┄ précédente</span><span class={classeSensComp(tend.sens)}>tendance : {tend.sens === 'hausse' ? '↗' : tend.sens === 'baisse' ? '↘' : '→'} {libPct(tend.pct)}{tend.joursDeBaisse >= 2 ? ` · ${tend.joursDeBaisse} jours de baisse` : ''}</span></span></div>
      <Courbe titre="Recette par jour" description="Recette quotidienne des {nbSerie} derniers jours, comparée aux {nbSerie} jours précédents." {labels} pasLabels={code === 'mois' ? 5 : 1}
        series={[{ nom: 'cette période', valeurs: serieA.map((p) => p.recette), aire: true }, { nom: 'précédente', valeurs: serieB.map((p) => p.recette), tirets: true }]} format={(n) => fcfa(n)} unite=" F" />
    </div>
    <div class="gl">
      <span class="t15 b7">Par gare</span>
      {#if gares.length === 0}<p class="vide-etat">Aucun départ sur cette période.</p>{/if}
      <div class="col g12" style="margin-top: 10px">
        {#each gares as g (g.cle)}
          <div class="col g4"><div class="row sp t13"><span>{g.nom}</span><b class={g.tend.sens === 'baisse' ? 'erc' : ''}>{fcfa(g.recette)}</b></div><div class="bar" aria-hidden="true"><i class={g.tend.sens === 'baisse' ? 'er' : ''} style="width: {Math.round((g.recette / maxGare) * 100)}%"></i></div></div>
        {/each}
      </div>
      <Lien href={pire ? `/assistant/reponse?gare=${pire.cle}` : '/assistant'} class="b s sm" style="margin-top: 14px">{pire ? `Pourquoi ${pire.nom.split(' ').at(-1)} baisse ?` : 'Demander à l’assistant'}</Lien>
    </div>
  </div>

  <div class="c2">
    <div class="gl">
      <div class="row sp"><span class="t15 b7">Lignes</span><span class="t12 mut">cliquer pour le détail</span></div>
      <Defile label="Tableau des lignes"><table class="tbl" style="margin-top: 8px"><thead><tr><th scope="col">Ligne</th><th scope="col" class="r" title="Nombre de bus partis">Bus</th><th scope="col" class="r">Rempl.</th><th scope="col" class="r">Recette</th></tr></thead><tbody>
        {#each lignesAffichees as l (l.cle)}<tr class="rowlink"><td><Lien href="/siege/analyses/ligne?ligne={l.cle}" class="lien"><span class="cell">{nomLigne(l.ligne)}<span class="t12 mut3">&nbsp;{l.ligne.classe === 'VIP' ? 'VIP' : ''}{compagnie === 'toutes' ? ` ${l.ligne.compagnieId}` : ''}</span></span></Lien></td><td class="r">{l.departs}</td><td class="r {classeSens(l.taux, 0.85, 0.7)}">{pct(l.taux)}</td><td class="r mono">{mCourt(l.recette)}</td></tr>{:else}<tr><td colspan="4" class="vide-etat">Aucune ligne pour ce filtre.</td></tr>{/each}
      </tbody></table></Defile>
      {#if lignes.length > 6}<button type="button" class="b g sm" style="margin-top: 6px" onclick={() => (toutesLesLignes = !toutesLesLignes)}>{toutesLesLignes ? 'Voir les 6 premières' : `Voir les ${lignes.length} lignes`}</button>{/if}
    </div>
    <div class="gl">
      <div class="row sp"><span class="t15 b7">Bus à surveiller</span><Lien href="/siege/analyses/bus" class="t12 aq"><span class="cell">tous les bus</span></Lien></div>
      <Defile label="Tableau des bus à surveiller"><table class="tbl" style="margin-top: 8px"><thead><tr><th scope="col">Bus</th><th scope="col">Signal</th><th scope="col" class="r">Km</th></tr></thead><tbody>
        {#each bus as b (b.id)}<tr class="rowlink"><td><Lien href="/siege/analyses/bus?bus={b.id}" class="lien"><span class="cell">{b.immat}</span></Lien></td><td><span class="pl {b.signal.ton}">{b.signal.txt}</span></td><td class="r mono">{fcfa(b.km)}</td></tr>{:else}<tr><td colspan="3" class="vide-etat">Aucun bus parti sur cette période.</td></tr>{/each}
      </tbody></table></Defile>
      <p class="t12 mut3" style="margin-top: 6px">Signaux simulés (vitesse, entretien) à partir des départs de la période, du {dateCourte(per.debut)} au {dateCourte(per.fin)}.</p>
    </div>
  </div>
</Siege>
