<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aujourdhui } from '../../data/horloge.ts';
  import { param } from '../../router.svelte.ts';
  import { chercher, comptesParJour, LIBELLE_FILTRE, LIBELLE_TRI, villesDesOffres, type Filtre, type Tri } from '../../core/covoitRecherche.ts';
  import { QUARTIERS } from '../../core/covoitPrix.ts';
  import { ajouterJours, jourSemaineCourt } from '../../core/dates.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import Icone from '../../ui/Icone.svelte';
  import { infoOffre, offresEnVille, offresEntreVilles, villesDuMonde } from './covoitActions.ts';
  import CarteTrajet from './CarteTrajet.svelte';
  import FicheConducteur from './FicheConducteur.svelte';
  import IconeCv from './IconeCv.svelte';
  import ListeChoix from './ListeChoix.svelte';
  import Relief from './Relief.svelte';
  import SegmentGlissant from './SegmentGlissant.svelte';
  import { horloge } from './temps.svelte.ts';

  /** Réserver un covoiturage : bascule Entre villes / Dans la ville, barre de recherche (sélecteurs en fenêtre), filtres rapides, tri, cartes des conducteurs. */
  let { modeInitial = 'villes', onconduire }: { modeInitial?: 'villes' | 'ville'; onconduire: () => void } = $props();
  const h = horloge(30_000), moi = $derived(personneCourante());
  let sous = $state<string>(modeInitial);
  let de = $state(param('de') ?? 'Yaoundé'), vers = $state(param('vers') ?? 'Douala'), jour = $state(param('jour') ?? '');
  let ville = $state(personneCourante()?.ville === 'Douala' ? 'Douala' : 'Yaoundé'), qDe = $state(''), qVers = $state('');
  let filtres = $state<Filtre[]>([]), tri = $state<Tri>('heure'), limite = $state(8), az = $state(0);
  let fiche = $state<string | null>(param('covoit')), ficheOuverte = $state(!!param('covoit'));
  let pickDe = $state(false), pickVers = $state(false), pickJour = $state(false), pickQDe = $state(false), pickQVers = $state(false);
  const enVille = $derived(sous === 'ville');

  const pool = $derived(enVille ? offresEnVille() : offresEntreVilles());
  const dansVille = $derived(pool.filter((o) => (QUARTIERS[ville] ?? []).includes(o.de)));
  const critere = $derived(enVille ? { de: qDe, vers: qVers, jour } : { de, vers, jour });
  const resultats = $derived(chercher(enVille ? dansVille : pool, { ...critere, filtres, tri }, (o) => infoOffre(o, h.ms), h.ms));
  const vus = $derived(resultats.slice(0, limite));
  const comptes = $derived(comptesParJour(enVille ? dansVille : pool, { de: critere.de, vers: critere.vers }, h.ms));
  const jours = $derived(Array.from({ length: 7 }, (_, i) => ajouterJours(aujourdhui(), i)));
  const nomJour = (j: string) => (j === aujourdhui() ? 'Aujourd’hui' : j === ajouterJours(aujourdhui(), 1) ? 'Demain' : jourSemaineCourt(j));
  const filtresDispos = $derived<Filtre[]>(['tot', 'pas_cher', 'places', 'verifies', 'non_fumeur', ...(pool.some((o) => infoOffre(o, h.ms).femmes) ? (['femmes'] as Filtre[]) : [])]);
  const basculer = (f: Filtre) => { filtres = filtres.includes(f) ? filtres.filter((x) => x !== f) : [...filtres, f]; limite = 8; };
  const reservee = (id: string) => !!moi && !!app.monde.covoits.find((o) => o.id === id)?.reservations.some((r) => r.voyageurId === moi.id);
  function voir(id: string) { fiche = id; ficheOuverte = true; }
  function echanger() { if (enVille) [qDe, qVers] = [qVers, qDe]; else [de, vers] = [vers, de]; }
  const villesDe = $derived(villesDesOffres(offresEntreVilles(), 'de', h.ms)), villesVers = $derived(villesDesOffres(offresEntreVilles(), 'vers', h.ms));
  const optsVille = (liste: { nom: string; n: number }[]) => [...new Set([...liste.map((v) => v.nom), ...villesDuMonde()])].map((nom) => ({ id: nom, label: nom, detail: `${liste.find((v) => v.nom === nom)?.n ?? 0} trajet${(liste.find((v) => v.nom === nom)?.n ?? 0) > 1 ? 's' : ''}` }));
  const optsQuartier = $derived((QUARTIERS[ville] ?? []).map((q) => ({ id: q, label: q, detail: `${dansVille.filter((o) => o.de === q).length} départ(s)` })));
  const optsJours = $derived(jours.map((j) => ({ id: j, label: `${nomJour(j)}${nomJour(j).includes('.') ? '' : ` · ${jourSemaineCourt(j)}`}`, detail: comptes[j] ? `${comptes[j]} trajet${comptes[j] > 1 ? 's' : ''}` : 'aucun trajet' })));
  const libJour = $derived(jour ? `${nomJour(jour)}${nomJour(jour).includes('.') ? '' : ` · ${jourSemaineCourt(jour)}`}` : 'Tous les jours');
  const POS = [{ x: 120, y: 95 }, { x: 235, y: 110 }, { x: 280, y: 70 }, { x: 175, y: 70 }, { x: 70, y: 135 }];
  const enTete = (i: number) => tri === 'heure' && (i === 0 || vus[i].jour !== vus[i - 1].jour);
  const dans = (o: (typeof resultats)[number]) => Math.max(0, Math.round((new Date(`${o.jour}T${o.heure}:00`).getTime() - h.ms) / 60_000));
</script>

<section class="cv-sec" id="cv-recherche" aria-label="Réserver un covoiturage">
  <span class="cv-titre">Réserver un covoiturage</span>
  <SegmentGlissant bind:valeur={sous} label="Type de covoiturage" idPrefixe="type" options={[{ id: 'villes', label: 'Entre villes' }, { id: 'ville', label: 'Dans la ville' }]} onchoisir={() => { limite = 8; filtres = []; }} />

  <div class="cv-verre barre" role="search" aria-label="Rechercher un trajet">
    {#if enVille}
      <div class="chips" role="group" aria-label="Ville">{#each ['Yaoundé', 'Douala'] as v (v)}<button type="button" class="ch" class:on={ville === v} aria-pressed={ville === v} onclick={() => { ville = v; qDe = ''; qVers = ''; }}>{v}</button>{/each}</div>
      <div class="champs">
        <button type="button" class="cv-champ" onclick={() => (pickQDe = true)}><i class="cv-pt"></i><span class="col grow"><span class="l">Départ</span><span class="v" class:aucun={!qDe}>{qDe || 'Partout'}</span></span></button>
        <button type="button" class="cv-champ" onclick={() => (pickQVers = true)}><i class="cv-pt fin"></i><span class="col grow"><span class="l">Arrivée</span><span class="v" class:aucun={!qVers}>{qVers || 'Partout'}</span></span></button>
        <button type="button" class="echange" aria-label="Inverser départ et arrivée" onclick={echanger}><IconeCv nom="echange" taille={18} /></button>
      </div>
    {:else}
      <div class="champs">
        <button type="button" class="cv-champ" onclick={() => (pickDe = true)}><i class="cv-pt"></i><span class="col grow"><span class="l">Départ</span><span class="v" class:aucun={!de}>{de || 'Partout'}</span></span></button>
        <button type="button" class="cv-champ" onclick={() => (pickVers = true)}><i class="cv-pt fin"></i><span class="col grow"><span class="l">Arrivée</span><span class="v" class:aucun={!vers}>{vers || 'Partout'}</span></span></button>
        <button type="button" class="echange" aria-label="Inverser départ et arrivée" onclick={echanger}><IconeCv nom="echange" taille={18} /></button>
      </div>
    {/if}
    <button type="button" class="cv-champ" onclick={() => (pickJour = true)}><span class="aq"><IconeCv nom="calendrier" taille={20} /></span><span class="col grow"><span class="l">Quand</span><span class="v">{libJour}</span></span><span class="t12 mut">modifier</span></button>
  </div>

  {#if enVille && vus.length}
    <Relief label="Carte en relief : les conducteurs autour de toi. Glisse pour tourner." bind:az hauteur={190} echelle={1.0} incl={52}>
      {#each vus.slice(0, 5) as o, i (o.id)}
        <button type="button" class="pin rl-pied" style="left: {POS[i % POS.length].x}px; top: {POS[i % POS.length].y}px" aria-label="{personne(o.conducteurId)?.prenom}, part dans {dans(o)} min, {o.depart}" onclick={() => voir(o.id)}><span class="orbe">{personne(o.conducteurId)?.prenom[0]}</span></button>
      {/each}
      <span class="rl-pied" style="left: 180px; top: 165px"><span class="orbe pt"></span></span>
    </Relief>
  {/if}

  <div class="chips" role="group" aria-label="Filtres rapides">
    {#each filtresDispos as f (f)}<button type="button" class="ch" class:on={filtres.includes(f)} aria-pressed={filtres.includes(f)} onclick={() => basculer(f)}>{LIBELLE_FILTRE[f]}</button>{/each}
  </div>
  <div class="row sp">
    <span class="t13 mut" role="status" aria-live="polite">{resultats.length} trajet{resultats.length > 1 ? 's' : ''}{enVille ? ` à ${ville}` : ''}</span>
    <label class="tri"><span class="sr">Trier par</span><select class="sel" bind:value={tri} aria-label="Trier par">{#each Object.entries(LIBELLE_TRI) as [k, l] (k)}<option value={k}>{l}</option>{/each}</select></label>
  </div>

  {#each vus as o, i (o.id)}
    {#if enTete(i)}<span class="lab jour">{nomJour(o.jour)}{nomJour(o.jour).includes('.') ? '' : ` · ${jourSemaineCourt(o.jour)}`}</span>{/if}
    <CarteTrajet offre={o} reservee={reservee(o.id)} afficherJour={!jour && tri !== 'heure'} onvoir={voir} />
  {:else}
    <div class="vide">
      <div class="ill" aria-hidden="true"><Icone nom="groupe" taille={56} trait={1.6} /></div>
      <span class="ttl t20">Aucun trajet : publie le tien !</span>
      <span class="t14 mut">{filtres.length ? 'Aucun conducteur ne correspond à ces filtres.' : `Personne ne propose ${enVille ? 'ce trajet en ville' : `${de || 'ce départ'} → ${vers || 'cette arrivée'}`} ${jour ? 'ce jour-là' : 'pour l’instant'}. Tu as une voiture ? Remplis-la et partage les frais.`}</span>
      <div class="cv-grille" style="width: 100%">
        <button type="button" class="cv-bouton p" onclick={onconduire}><IconeCv nom="voiture" taille={18} />Je conduis</button>
        {#if filtres.length}<button type="button" class="cv-bouton" onclick={() => (filtres = [])}>Retirer les filtres</button>{:else if jour}<button type="button" class="cv-bouton" onclick={() => (jour = '')}>Tous les jours</button>{/if}
      </div>
    </div>
  {/each}
  {#if resultats.length > vus.length}<button type="button" class="cv-bouton" onclick={() => (limite += 8)}>Voir {Math.min(8, resultats.length - vus.length)} trajet{resultats.length - vus.length > 1 ? 's' : ''} de plus</button>{/if}
  <div class="toast"><span class="bub aq"><Icone nom="info" taille={18} /></span><span class="t13 grow">Conducteurs vérifiés (identité, permis, visage). Paiement bloqué jusqu’à l’arrivée.</span></div>
</section>

<ListeChoix bind:ouvert={pickDe} titre="Ville de départ" sous="D’où pars-tu ?" options={optsVille(villesDe)} valeur={de} toutes="Partout" recherche onchoisir={(v) => (de = v)} />
<ListeChoix bind:ouvert={pickVers} titre="Ville d’arrivée" sous="Où vas-tu ?" options={optsVille(villesVers)} valeur={vers} toutes="Partout" recherche onchoisir={(v) => (vers = v)} />
<ListeChoix bind:ouvert={pickQDe} titre="Quartier de départ" sous={ville} options={optsQuartier} valeur={qDe} toutes="Partout" onchoisir={(v) => (qDe = v)} />
<ListeChoix bind:ouvert={pickQVers} titre="Quartier d’arrivée" sous={ville} options={(QUARTIERS[ville] ?? []).map((q) => ({ id: q, label: q }))} valeur={qVers} toutes="Partout" onchoisir={(v) => (qVers = v)} />
<ListeChoix bind:ouvert={pickJour} titre="Quand pars-tu ?" sous="Les 7 prochains jours" options={optsJours} valeur={jour} toutes="Tous les jours" onchoisir={(v) => (jour = v)} />
<FicheConducteur bind:ouvert={ficheOuverte} offreId={fiche} />

<style>
  .barre { display: flex; flex-direction: column; gap: 8px; padding: 10px; }
  .champs { position: relative; display: flex; flex-direction: column; gap: 8px; }
  .echange { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; border: 1px solid rgba(255, 255, 255, 0.25); background: rgba(12, 16, 32, 0.92); color: #7febff; display: grid; place-items: center; cursor: pointer; box-shadow: 0 8px 20px -8px rgba(0, 0, 0, 0.8); }
  .echange:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .champs :global(.cv-champ) { padding-right: 64px; }
  .lab.jour { padding-top: 4px; }
  .tri .sel { min-height: 44px; padding: 0 12px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.16); background: rgba(255, 255, 255, 0.07); color: #f2f4ff; font: 600 13px 'Sora Variable', 'Sora', sans-serif; }
  .tri .sel option { color: #06080f; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 18px 6px; }
  .pin { padding: 10px; margin-top: 8px; background: transparent; border: 0; cursor: pointer; }
  .orbe { width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; font: 700 14px 'Sora Variable', 'Sora', sans-serif; color: #06080f; background: linear-gradient(135deg, #8b7cff, #3de0ff); box-shadow: 0 0 0 6px rgba(61, 224, 255, 0.15); }
  .orbe.pt { width: 20px; height: 20px; background: #ff5bde; box-shadow: 0 0 0 8px rgba(255, 91, 222, 0.2); }
  .chips { flex: none; }
</style>
