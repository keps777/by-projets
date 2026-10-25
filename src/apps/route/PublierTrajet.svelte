<script lang="ts">
  import { aujourdhui } from '../../data/horloge.ts';
  import { conseilPrix, conseilPrixVille, distanceKm, distanceVilleKm, MESSAGE_VERDICT, positionsJauge, QUARTIERS, repartition, verdictPrix, villeDuQuartier } from '../../core/covoitPrix.ts';
  import { ajouterJours, jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import type { OffreCovoit } from '../../domain/types.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { joursDePublication, PRIX_VILLE, profilDe, publierTrajets, villesDuMonde } from './covoitActions.ts';
  import IconeCv from './IconeCv.svelte';
  import SegmentGlissant from './SegmentGlissant.svelte';

  /** Ajouter un trajet en 3 étapes (fenêtre haute) : trajet, jour et heure, prix avec aide au prix et commission affichée. Le véhicule est celui du profil conducteur. */
  let { ouvert = $bindable(false), conducteurId, onpublie }: { ouvert?: boolean; conducteurId: string; onpublie?: (o: OffreCovoit[]) => void } = $props();
  const profil = $derived(profilDe(conducteurId)), maxPlaces = $derived(Math.min(4, profil?.vehicule.places ?? 3));
  const villes = $derived(villesDuMonde().length ? villesDuMonde() : ['Yaoundé', 'Douala']);
  const JOURS_TXT = $derived(Array.from({ length: 7 }, (_, i) => ajouterJours(aujourdhui(), i)));
  const HEURES = ['06:00', '07:30', '12:00', '16:30', '18:00'];
  let etape = $state(0), type = $state('villes'), de = $state('Yaoundé'), vers = $state('Douala'), point = $state(''), ville = $state('Yaoundé'), qde = $state('Bastos'), qvers = $state('Essos');
  let jour = $state(ajouterJours(aujourdhui(), 1)), heure = $state('07:30'), places = $state(3), recurrent = $state(false), prix = $state(4500), prixTouche = $state(false);
  let femmes = $state(false), bagages = $state(true), arrets = $state(false), fumeur = $state(false), erreur = $state(''), creees = $state<OffreCovoit[] | null>(null);
  const enVille = $derived(type === 'ville');
  const km = $derived(enVille ? distanceVilleKm(qde, qvers) : distanceKm(de, vers));
  const conseil = $derived(enVille ? conseilPrixVille(km) : conseilPrix(km));
  const lim = $derived(enVille ? PRIX_VILLE : { min: conseil.min, max: conseil.max });
  $effect(() => { if (ouvert) { etape = 0; erreur = ''; creees = null; jour = ajouterJours(aujourdhui(), 1); places = Math.min(3, maxPlaces); prixTouche = false; recurrent = false; } });
  $effect(() => { const c = conseil.conseille; if (!prixTouche) prix = c; });
  $effect(() => { if (places > maxPlaces) places = maxPlaces; });
  $effect(() => { const q = QUARTIERS[ville] ?? []; if (!q.includes(qde)) qde = q[0]; if (!q.includes(qvers) || qvers === qde) qvers = q.find((x) => x !== qde) ?? q[0]; });
  const verdict = $derived(verdictPrix(prix, conseil)), jauge = $derived(positionsJauge(prix, conseil)), rep = $derived(repartition(prix, places));
  const serie = $derived(joursDePublication(jour, recurrent));
  const titres = ['Trajet', 'Quand', 'Prix'];
  const pasPrix = (d: number) => { prixTouche = true; prix = Math.max(lim.min, Math.min(lim.max, prix + d * conseil.pas)); };
  function suivant() {
    erreur = '';
    if (etape === 0) { if (!enVille && de === vers) { erreur = 'Le départ et l’arrivée doivent être différents.'; return; } if (enVille && qde === qvers) { erreur = 'Choisis deux quartiers différents.'; return; } }
    if (etape === 1 && !/^([01]\d|2[0-3]):[0-5]\d$/.test(heure)) { erreur = 'Heure invalide (format 07:30).'; return; }
    etape += 1;
  }
  function publier() {
    erreur = '';
    try {
      const o = publierTrajets({ enVille, de: enVille ? qde : de, vers: enVille ? qvers : vers, point: enVille ? qde : point, jour, heure, places, prix, recurrent }, conducteurId, { femmes, bagages, arrets, fumeur, clim: profil?.clim });
      creees = o; montrer(o.length > 1 ? `${o.length} trajets publiés (lundi au vendredi)` : `Trajet publié : ${o[0].de} → ${o[0].vers} · ${jourSemaineCourt(o[0].jour)} ${o[0].heure}`); onpublie?.(o);
    } catch (e) { erreur = e instanceof Error ? e.message : 'Publication impossible.'; }
  }
</script>

<Feuille bind:ouvert titre="Ajouter un trajet" sous={creees ? 'C’est en ligne !' : `Étape ${etape + 1} sur 3 · ${titres[etape]}`} hauteur="haute">
  {#if creees}
    <div class="succes" role="status"><span class="ok-rond" aria-hidden="true"><IconeCv nom="valide" taille={34} trait={2.6} /></span><span class="ttl t20">{creees.length > 1 ? `${creees.length} trajets publiés` : 'Trajet publié'}</span>
      <span class="t14 mut">{creees[0].de} → {creees[0].vers} · {creees.length > 1 ? 'du lundi au vendredi' : `${jourSemaineCourt(creees[0].jour)} ${creees[0].heure}`}. Tu reçois une notification à chaque réservation.</span></div>
  {:else}
    <ol class="etapes" aria-label="Étapes">{#each titres as t, k (t)}<li class:on={k === etape} class:fait={k < etape} aria-current={k === etape ? 'step' : undefined}><span>{k < etape ? '✓' : k + 1}</span>{t}</li>{/each}</ol>

    {#if etape === 0}
      <SegmentGlissant bind:valeur={type} label="Type de trajet" idPrefixe="pub" options={[{ id: 'villes', label: 'Entre villes' }, { id: 'ville', label: 'Dans la ville' }]} />
      {#if !enVille}
        <div class="duo"><label class="fld"><span class="lab">Ville de départ</span><select class="inp" bind:value={de}>{#each villes as v (v)}<option>{v}</option>{/each}</select></label>
          <label class="fld"><span class="lab">Ville d’arrivée</span><select class="inp" bind:value={vers}>{#each villes as v (v)}<option>{v}</option>{/each}</select></label></div>
        <label class="fld"><span class="lab">Point de départ (quartier)</span><input class="inp" placeholder="ex. Mvan, Bastos, gare routière" maxlength="40" bind:value={point} /></label>
      {:else}
        <label class="fld"><span class="lab">Ville</span><select class="inp" bind:value={ville}>{#each Object.keys(QUARTIERS) as v (v)}<option>{v}</option>{/each}</select></label>
        <div class="duo"><label class="fld"><span class="lab">Quartier de départ</span><select class="inp" bind:value={qde}>{#each QUARTIERS[ville] ?? [] as q (q)}<option>{q}</option>{/each}</select></label>
          <label class="fld"><span class="lab">Quartier d’arrivée</span><select class="inp" bind:value={qvers}>{#each QUARTIERS[ville] ?? [] as q (q)}<option>{q}</option>{/each}</select></label></div>
      {/if}
      <div class="cv-verre row g12"><span class="bub aq"><IconeCv nom="voiture" taille={20} /></span><span class="col grow"><span class="t14 b7">{profil ? `${profil.vehicule.marque} ${profil.vehicule.modele}` : 'Mon véhicule'}</span><span class="t12 mut">{profil?.vehicule.couleur} · {profil?.vehicule.plaque} · {maxPlaces} place{maxPlaces > 1 ? 's' : ''} passagers</span></span></div>
      <span class="cv-note">≈ {km} km · le véhicule vient de ton profil conducteur.</span>
    {:else if etape === 1}
      <div class="col g8"><span class="lab" id="jour-lab">Jour</span>
        <div class="jours" role="group" aria-labelledby="jour-lab">{#each JOURS_TXT as j (j)}<button type="button" class="ch" class:on={jour === j} aria-pressed={jour === j} onclick={() => (jour = j)}>{jourSemaineCourt(j)}</button>{/each}</div></div>
      <label class="fld"><span class="lab">Heure de départ</span><input class="inp" type="time" bind:value={heure} aria-label="Heure de départ" /></label>
      <div class="chips" role="group" aria-label="Heures rapides">{#each HEURES as hh (hh)}<button type="button" class="ch" class:on={heure === hh} aria-pressed={heure === hh} onclick={() => (heure = hh)}>{hh}</button>{/each}</div>
      <div class="cv-verre row sp"><span class="col"><span class="lab">Places proposées</span><span class="t12 mut">max {maxPlaces} avec ton véhicule</span></span>
        <span class="pas"><button type="button" aria-label="Moins de places" disabled={places <= 1} onclick={() => (places -= 1)}>−</button><b aria-live="polite">{places}</b><button type="button" aria-label="Plus de places" disabled={places >= maxPlaces} onclick={() => (places += 1)}>+</button></span></div>
      <div class="cv-verre row g12"><span class="col grow"><span class="t14 b7" id="rec-lab">Trajet récurrent (lun-ven)</span><span class="t12 mut">{recurrent ? `${serie.length} départs publiés d’un coup` : 'Publie le même trajet chaque jour de semaine'}</span></span>
        <button type="button" class="sw" class:on={recurrent} role="switch" aria-checked={recurrent} aria-labelledby="rec-lab" onclick={() => (recurrent = !recurrent)}></button></div>
    {:else}
      <div class="cv-verre vi col g8">
        <span class="row sp"><span class="lab">Prix par place</span><span class="cv-badge {verdict === 'juste' ? 'ok' : 'wa'}">{verdict === 'juste' ? 'prix conseillé' : verdict === 'bas' ? 'bas' : 'élevé'}</span></span>
        <div class="row sp"><button type="button" class="rond" aria-label="Baisser le prix" onclick={() => pasPrix(-1)}>−</button><span class="big" aria-live="polite">{fmtF(prix)}</span><button type="button" class="rond" aria-label="Augmenter le prix" onclick={() => pasPrix(1)}>+</button></div>
        <div class="jauge" role="img" aria-label="Fourchette conseillée de {conseil.bas} à {conseil.haut} F"><i class="zone" style="left: {jauge.debut}%; width: {jauge.fin - jauge.debut}%"></i><i class="cur" style="left: {jauge.curseur}%"></i></div>
        <span class="row sp t12 mut"><span>{fmtF(lim.min)}</span><span class="aq b7">Conseillé : {fmtF(conseil.bas)} – {fmtF(conseil.haut)}</span><span>{fmtF(lim.max)}</span></span>
        <span class="t13 mut">{MESSAGE_VERDICT[verdict]}</span>
      </div>
      <div class="cv-verre col g8" aria-label="Ce que tu gagnes">
        <span class="row sp t14"><span>Prix payé par un voyageur</span><b>{fmtF(prix)}</b></span>
        <span class="row sp t14"><span>Commission AfriMove ({rep.pourcent} %)</span><b class="erc">− {fmtF(prix - rep.parPlace)}</b></span>
        <span class="row sp t16"><span class="b7">Tu reçois par place</span><b class="okc">{fmtF(rep.parPlace)}</b></span>
        <span class="t12 mut3">Si tes {places} places partent : {fmtF(rep.net)} nets{recurrent ? ` par trajet, ${serie.length} trajets` : ''} · versés sur MoMo à l’arrivée.</span>
      </div>
      <div class="cv-verre col" style="gap: 0">
        {#each [['Femmes uniquement', femmes, () => (femmes = !femmes)], ['Bagages acceptés', bagages, () => (bagages = !bagages)], ['Arrêts en route', arrets, () => (arrets = !arrets)], ['Fumeur toléré', fumeur, () => (fumeur = !fumeur)]] as [nom, val, bas], k (nom)}
          <div class="li"><span class="grow t14 b6" id="opt{k}">{nom}</span><button type="button" class="sw" class:on={val as boolean} role="switch" aria-checked={val as boolean} aria-labelledby="opt{k}" onclick={bas as () => void}></button></div>
        {/each}
      </div>
    {/if}
    {#if erreur}<div class="cv-err" role="alert">{erreur}</div>{/if}
  {/if}
  {#snippet pied()}
    {#if creees}<button type="button" class="cv-bouton p" onclick={() => (ouvert = false)}>Voir mes trajets</button><button type="button" class="cv-bouton" onclick={() => { creees = null; etape = 0; }}>Publier un autre trajet</button>
    {:else}
      <div class="cv-grille" style="grid-template-columns: {etape ? '1fr 2fr' : '1fr'}">
        {#if etape}<button type="button" class="cv-bouton" onclick={() => { etape -= 1; erreur = ''; }}>Retour</button>{/if}
        {#if etape < 2}<button type="button" class="cv-bouton p" onclick={suivant}>Continuer</button>{:else}<button type="button" class="cv-bouton p" onclick={publier}>Publier le trajet</button>{/if}
      </div>
    {/if}
  {/snippet}
</Feuille>

<style>
  .etapes { list-style: none; display: flex; gap: 6px; padding: 0; margin: 0; } .etapes li { flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; min-height: 36px; border-radius: 12px; font: 600 12px 'Geist Mono', monospace; color: #a1accb; background: rgba(255, 255, 255, 0.05); }
  .etapes li span { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.12); font-size: 11px; } .etapes li.on { color: #fff; background: rgba(139, 124, 255, 0.28); } .etapes li.on span { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; } .etapes li.fait span { background: #4ade80; color: #06080f; }
  .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; } select.inp, input.inp { appearance: none; min-height: 50px; } select.inp option { color: #06080f; }
  .jours { display: flex; flex-wrap: wrap; gap: 8px; }
  .pas { display: inline-flex; align-items: center; gap: 4px; } .pas b { min-width: 34px; text-align: center; font: 700 22px 'Unbounded Variable', 'Unbounded', sans-serif; }
  .pas button, .rond { width: 46px; height: 46px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.08); color: #f2f4ff; font: 700 22px 'Sora Variable', sans-serif; cursor: pointer; } .pas button:disabled { opacity: 0.4; cursor: not-allowed; }
  .jauge { position: relative; height: 10px; border-radius: 5px; background: rgba(255, 255, 255, 0.1); margin: 6px 0 2px; } .jauge .zone { position: absolute; top: 0; bottom: 0; border-radius: 5px; background: linear-gradient(90deg, #8b7cff, #3de0ff); opacity: 0.7; }
  .jauge .cur { position: absolute; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: #f2f4ff; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5); transition: left 0.3s; }
  .succes { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 30px 10px; } .ok-rond { width: 84px; height: 84px; border-radius: 50%; display: grid; place-items: center; background: linear-gradient(135deg, #4ade80, #3de0ff); color: #06080f; box-shadow: 0 20px 40px -16px rgba(74, 222, 128, 0.7); }
</style>
