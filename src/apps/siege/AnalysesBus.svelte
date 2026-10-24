<script lang="ts">
  import { agreger, entre, parBus } from '../../core/analyses.ts';
  import { ajouterJours, jourCourt, jourLong } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { distanceKm, excesVitesse, LIMITE_VITESSE, profilVitesse, telemetrieBus } from '../../core/telemetrie.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import Courbe from './Courbe.svelte';
  import Defile from './Defile.svelte';
  import { chauffeurDe, ventesDu } from './donnees.ts';
  import { etatSiege, lireSiege } from './etat.ts';
  import { mf, pct } from './format.ts';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  const auj = $derived(aujourdhui());
  const toutes = $derived(ventesDu(ajouterJours(auj, -29), auj));
  const trajetsDe = (busId: string) => toutes.filter((x) => x.busId === busId && (x.statut === 'parti' || x.statut === 'arrive'));
  const excesDe = (busId: string) => trajetsDe(busId).reduce((s, x) => s + excesVitesse(profilVitesse(x.departId)), 0);
  /** Par défaut : le bus de la compagnie qui a le plus d'excès de vitesse sur 30 jours. */
  const parDefaut = $derived([...app.monde.bus.filter((b) => b.compagnieId === 'BX')].sort((a, b) => excesDe(b.id) - excesDe(a.id))[0] ?? app.monde.bus[0]);
  const bus = $derived(app.monde.bus.find((b) => b.id === param('bus')) ?? parDefaut);
  const trajets = $derived(trajetsDe(bus.id).sort((a, b) => (b.jour + b.heure).localeCompare(a.jour + a.heure)));
  const a30 = $derived(agreger(toutes.filter((x) => x.busId === bus.id)));
  const tele = $derived(telemetrieBus(bus.id, auj));
  const flotte = $derived(app.monde.bus.filter((b) => b.compagnieId === bus.compagnieId));
  const classement = $derived(parBus(toutes.filter((x) => flotte.some((b) => b.id === x.busId))).findIndex((b) => b.cle === bus.id) + 1);
  const moyenneL = $derived(flotte.reduce((s, b) => s + telemetrieBus(b.id, auj).litresAux100, 0) / Math.max(1, flotte.length));
  const ecartL = $derived(Math.round((tele.litresAux100 - moyenneL) * 10) / 10);
  const km = $derived(trajets.reduce((s, x) => s + distanceKm(x.de, x.vers), 0));
  const exces = $derived(excesDe(bus.id));
  const liaisons = $derived([...new Set(toutes.filter((x) => x.busId === bus.id).map((x) => [x.de, x.vers].sort().join(' ↔ ')))].join(' · ') || '—');
  const chauffeur = $derived(trajets[0] ? chauffeurDe(trajets[0].departId, bus.compagnieId, bus.id) : chauffeurDe('', bus.compagnieId, bus.id));
  const dernier = $derived(trajets[0]);
  const profil = $derived(dernier ? profilVitesse(dernier.departId) : []);
  const dist = $derived(dernier ? distanceKm(dernier.de, dernier.vers) : 0);
  const alertes = $derived(profil.map((p, i) => (p.v > LIMITE_VITESSE ? i : -1)).filter((i) => i >= 0));
  const cellules = $derived(Array.from({ length: 30 }, (_, i) => i < Math.round(a30.taux * 30)));
  const planifie = $derived(lireSiege().entretiens[bus.id]);
  const moyennePassagers = $derived(a30.departs ? Math.round(a30.billets / a30.departs) : 0);
  const classe = $derived(app.monde.bus.find((b) => b.id === bus.id)?.classe ?? '');
  function planifier() {
    const e = etatSiege();
    if (e.entretiens[bus.id]) delete e.entretiens[bus.id]; else e.entretiens[bus.id] = ajouterJours(auj, Math.max(1, tele.entretienJours - 2));
  }
  const compagnie = (id: string) => app.monde.compagnies.find((c) => c.id === id)?.nom ?? id;
</script>

<Siege actif="analyses">
  <div class="top">
    <div class="row g12"><Lien href="/siege/analyses" class="ib" aria-label="Retour aux analyses"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Lien>
      <div class="col"><h1 class="ttl">{bus.immat} · {classe} {bus.capacite} places</h1><span class="t13 mut">{liaisons} · chauffeur {chauffeur?.prenom ?? 'à affecter'} · {tele.annee} · {fcfa(tele.kmTotal)} km · {compagnie(bus.compagnieId)}</span></div></div>
    <div class="row g8 wrapf">
      <label class="sr" for="choix-bus">Choisir un bus</label>
      <select id="choix-bus" class="in" style="width: auto" value={bus.id} onchange={(e) => aller(`/siege/analyses/bus?bus=${e.currentTarget.value}`)}>{#each app.monde.bus as b (b.id)}<option value={b.id}>{b.immat} · {compagnie(b.compagnieId)}</option>{/each}</select>
      <span class="pl {exces ? 'er' : 'ok'}">{#if exces}<span class="dot"></span>{/if}{exces ? `${exces} excès de vitesse` : 'aucun excès'}</span>
      {#if chauffeur}<Lien href="/patron/personne?personne={chauffeur.id}" class="b s sm">Parler à {chauffeur.prenom}</Lien>{/if}
    </div>
  </div>

  <div class="kpis">
    <div class="gl"><span class="lab">Recette 30 j</span><span class="ttl t24">{mf(a30.recette)}</span><span class="t12 {classement === 1 ? 'okc' : 'mut'}">{classement ? (classement === 1 ? '1er' : `${classement}e`) : '—'} de la flotte ({flotte.length} bus)</span></div>
    <div class="gl"><span class="lab">Km 30 j</span><span class="ttl t24">{fcfa(km)}</span><span class="t12 mut">{trajets.length} trajets</span></div>
    <div class="gl"><span class="lab">Carburant</span><span class="ttl t24">{tele.litresAux100.toLocaleString('fr-FR')} L / 100</span><span class="t12 {ecartL > 0 ? 'wac' : 'okc'}">{ecartL > 0 ? '+' : ecartL < 0 ? '−' : ''}{Math.abs(ecartL).toLocaleString('fr-FR')} L vs flotte</span></div>
    <div class="gl"><span class="lab">Prochain entretien</span><span class="ttl t24">J-{tele.entretienJours}</span><span class="t12 mut">{tele.entretienLibelle}</span></div>
  </div>
  <p class="tag-demo" role="note">Kilométrage, carburant, vitesses et entretien : télémétrie simulée de démonstration. Recettes et trajets : calculés sur les départs du bus.</p>

  <div class="c12">
    <div class="gl">
      <span class="t15 b7">Remplissage moyen</span>
      <div class="bus3" role="img" aria-label="Bus en 3D : {pct(a30.taux)} rempli en moyenne"><div class="bx" aria-hidden="true">{#each cellules as f, i (i)}<i class:f></i>{/each}</div></div>
      <div class="row sp"><span class="ttl t20">{pct(a30.taux)}</span><span class="t12 mut">{moyennePassagers} / {bus.capacite} en moyenne</span></div>
    </div>
    <div class="gl">
      <div class="row sp wrapf"><span class="t15 b7">Vitesse · {dernier ? `trajet du ${jourCourt(dernier.jour)} ${dernier.heure}` : 'aucun trajet'}</span><span class="t12 mut">limite {LIMITE_VITESSE} km/h</span></div>
      {#if dernier}
        <Courbe titre="Vitesse du trajet {dernier.de} → {dernier.vers} du {jourCourt(dernier.jour)}" description="Vitesse en km/h le long du trajet ; la limite est de {LIMITE_VITESSE} km/h et {alertes.length} point{alertes.length > 1 ? 's' : ''} la dépasse{alertes.length > 1 ? 'nt' : ''}."
          labels={profil.map((p) => `${Math.round(p.f * dist)} km`)} pasLabels={3} series={[{ nom: 'Vitesse', valeurs: profil.map((p) => p.v) }]} seuil={{ valeur: LIMITE_VITESSE, libelle: `limite ${LIMITE_VITESSE} km/h` }} {alertes} unite=" km/h" />
      {:else}<p class="vide-etat">Ce bus n’a pas encore effectué de trajet sur les 30 derniers jours.</p>{/if}
    </div>
  </div>

  <div class="c2">
    <div class="gl">
      <span class="t15 b7">Entretien</span>
      <div class="col" style="gap: 0; margin-top: 6px">
        <div class="li"><span class="pl wa">J-{tele.entretienJours}</span><span class="grow t13">{tele.entretienLibelle[0].toUpperCase() + tele.entretienLibelle.slice(1)} · garage Ndjoya{planifie ? ` · prévu ${jourCourt(planifie)}` : ''}</span><button class="b g sm xs" type="button" aria-pressed={!!planifie} onclick={planifier}>{planifie ? `Planifié ${jourCourt(planifie)}` : 'Planifier'}</button></div>
        {#each tele.controles as c (c.libelle)}<div class="li"><span class="pl ok">ok</span><span class="grow t13">{c.libelle} {c.jour > auj ? jourLong(c.jour) : jourCourt(c.jour)}</span></div>{/each}
      </div>
    </div>
    <div class="gl">
      <span class="t15 b7">Derniers trajets</span>
      <Defile label="Derniers trajets du bus"><table class="tbl" style="margin-top: 6px"><thead><tr><th scope="col">Date</th><th scope="col">Trajet</th><th scope="col" class="r">Billets</th><th scope="col" class="r">Recette</th><th scope="col">À l’heure</th></tr></thead><tbody>
        {#each trajets.slice(0, 5) as t (t.departId)}<tr><td>{jourCourt(t.jour)}</td><td>{t.de} → {t.vers} {t.heure}</td><td class="r">{t.billets}</td><td class="r mono">{fcfa(t.recette)}</td><td><span class="pl {t.retardMin >= 15 ? 'wa' : 'ok'}">{t.retardMin >= 15 ? `+${t.retardMin} min` : 'oui'}</span></td></tr>{:else}<tr><td colspan="5" class="vide-etat">Aucun trajet récent.</td></tr>{/each}
      </tbody></table></Defile>
    </div>
  </div>
</Siege>
