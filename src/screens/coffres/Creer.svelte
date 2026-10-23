<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { fcfa, lireMontant } from '../../core/money.ts';
  import { GENRES_COFFRE, gainInterets, moisPourAtteindre } from '../../core/epargne.ts';
  import { MEMBRES_MAX, MEMBRES_MIN, NOM_MAX, MAX_COFFRES, echeance, partDuMembre, validerCoffre } from '../../core/coffres.ts';
  import { moisAnnee } from '../../core/dates.ts';
  import { etatCoffres } from './etat.ts';
  import { creerCoffre } from './actions.ts';
  import { jourPaieMembre, prochaineDatePaie, accentDe } from './affichage.ts';
  import Puces from './Puces.svelte';

  etatCoffres();
  let genre = $state<string | null>('Mariage');
  let nom = $state('Mariage');
  let nomModifie = $state(false);
  let objectifChoix = $state<number | null>(1_000_000);
  let objectifLibre = $state('');
  let mensuelChoix = $state<number | null>(50_000);
  let mensuelLibre = $state('');
  let partage = $state(false);
  let membres = $state(4);
  let tente = $state(false);

  const objectif = $derived(objectifLibre.trim() ? (lireMontant(objectifLibre) ?? NaN) : (objectifChoix ?? NaN));
  const mensuel = $derived(mensuelLibre.trim() ? (lireMontant(mensuelLibre) ?? NaN) : (mensuelChoix ?? NaN));
  const erreurs = $derived(validerCoffre({ nom, objectif, mensuel, partage, membres }));
  const valide = $derived(Object.keys(erreurs).length === 0);
  const nbCoffres = $derived(etatCoffres().coffres.length);
  const plein = $derived(nbCoffres >= MAX_COFFRES);
  const mois = $derived(Number.isFinite(objectif) && Number.isFinite(mensuel) ? moisPourAtteindre(objectif, 0, mensuel) : Infinity);
  const quand = $derived(Number.isFinite(mois) ? echeance(0, objectif, mensuel, prochaineDatePaie()).date : null);
  const accent = $derived(accentDe(genre ?? 'Libre'));

  function choisirGenre(g: string) { if (!nomModifie) nom = g === 'Libre' ? '' : g; }
  function creer() {
    tente = true;
    if (!valide || plein) return;
    const r = creerCoffre(genre ?? 'Libre', { nom, objectif, mensuel, partage, membres });
    if (r.ok) { montrer(r.message); aller(`/coffres?c=${encodeURIComponent(r.id)}`); } else montrer(r.erreur ?? 'Création impossible', 'danger');
  }
</script>

<Ecran titre="Nouveau coffre" sur="30 secondes · versement sur salaire" retourVers="/coffres">
  <Champ etiquette="Nom du coffre" placeholder="Ex. Mariage de Paul" bind:valeur={nom} oninput={() => { nomModifie = true; nom = nom.slice(0, NOM_MAX); }} erreur={(tente || nomModifie) ? (erreurs.nom ?? '') : ''} />

  <section aria-labelledby="t-genre"><h3 id="t-genre">Pour quoi ?</h3>
    <Puces nom="Genre de coffre" options={GENRES_COFFRE.map((g) => ({ valeur: g as string, label: g }))} bind:valeur={genre} onchoix={choisirGenre} /></section>

  <section aria-labelledby="t-obj"><h3 id="t-obj">Objectif</h3>
    <Puces nom="Objectif" options={[200_000, 500_000, 1_000_000, 2_000_000].map((v) => ({ valeur: v, label: v >= 1_000_000 ? `${v / 1_000_000} M` : `${v / 1000} k` }))} bind:valeur={objectifChoix} onchoix={() => (objectifLibre = '')} />
    <Champ placeholder="Autre objectif" inputmode="numeric" suffixe="FCFA" bind:valeur={objectifLibre} erreur={objectifLibre.trim() ? (erreurs.objectif ?? '') : ''} /></section>

  <section aria-labelledby="t-men"><h3 id="t-men">Chaque mois, le {jourPaieMembre()}</h3>
    <Puces nom="Versement mensuel" options={[10_000, 25_000, 50_000, 100_000].map((v) => ({ valeur: v, label: `${v / 1000} k` }))} bind:valeur={mensuelChoix} onchoix={() => (mensuelLibre = '')} />
    <Champ placeholder="Autre versement" inputmode="numeric" suffixe="FCFA" bind:valeur={mensuelLibre} erreur={(mensuelLibre.trim() || (tente && !erreurs.objectif)) ? (erreurs.mensuel ?? '') : ''} /></section>

  <div class="apercu" style:--accent={accent.accent} style:--glow={accent.glow} aria-live="polite">
    <span class="mono kind">COFFRE {(nom.trim() || 'SANS NOM').toUpperCase()}</span>
    {#if Number.isFinite(mois) && valide}
      <p class="mois"><b class="mono">{mois}</b> mois pour atteindre {fcfa(objectif)}</p>
      <p class="det"><span>Atteint en {quand ? moisAnnee(quand) : '—'}</span><span class="bon mono">+{fcfa(gainInterets(objectif, mois))} d'intérêts</span></p>
    {:else}<p class="det">Choisissez un objectif et un versement valides pour voir la date d'atteinte.</p>{/if}
  </div>

  <div class="partage">
    <button type="button" role="switch" aria-checked={partage} onclick={() => (partage = !partage)} aria-label="Coffre partagé avec la famille">
      <span class="txt"><b>Coffre partagé avec la famille</b>
        <small>{partage ? `${membres} membres · chacun verse ${fcfa(partDuMembre(Number.isFinite(mensuel) ? mensuel : 0, true, membres))} le ${jourPaieMembre()}` : 'Invitez conjoint, frères, sœurs : tout le monde voit la jauge'}</small></span>
      <span class="inter" class:on={partage}><i></i></span>
    </button>
    {#if partage}
      <div class="pas" role="group" aria-label="Nombre de membres">
        <button type="button" aria-label="Un membre de moins" onclick={() => (membres = Math.max(MEMBRES_MIN, membres - 1))} disabled={membres <= MEMBRES_MIN}><Icone nom="retour" taille={16} trait={2.4} /></button>
        <span class="mono"><b>{membres}</b> membres</span>
        <button type="button" aria-label="Un membre de plus" onclick={() => (membres = Math.min(MEMBRES_MAX, membres + 1))} disabled={membres >= MEMBRES_MAX}><Icone nom="suivant" taille={16} trait={2.4} /></button>
      </div>
    {/if}
  </div>

  {#if plein}<p class="err" role="alert">Vous avez déjà {MAX_COFFRES} coffres : c'est le maximum.</p>{/if}
  {#if tente && !valide}<p class="err" role="alert">{erreurs.nom ?? erreurs.objectif ?? erreurs.mensuel ?? erreurs.membres}</p>{/if}
  <Bouton onclick={creer} desactive={plein || (!valide && tente)}>Créer le coffre {nom.trim()}<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  <div class="espace"></div>
</Ecran>

<style>
  h3 { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; } section { display: flex; flex-direction: column; gap: 10px; } section h3 { margin: 0; }
  .apercu { border-radius: 20px; padding: 16px 18px; border: 1px solid color-mix(in srgb, var(--accent) 45%, transparent); background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--carte)), var(--carte) 70%); display: flex; flex-direction: column; gap: 6px; }
  .kind { font-size: 10px; letter-spacing: 0.12em; color: var(--pale); overflow-wrap: anywhere; } .mois { font-size: 15px; } .mois b { font-size: 26px; font-weight: 500; margin-right: 4px; }
  .det { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; font-size: 13px; color: var(--doux); } .bon { color: var(--bon); }
  .partage { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 4px 14px; }
  .partage > button { width: 100%; min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 14px; text-align: left; }
  .txt { display: flex; flex-direction: column; gap: 2px; } .txt small { color: var(--muted); font-size: 12.5px; }
  .inter { width: 46px; height: 28px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne-forte); position: relative; flex: none; transition: background 0.2s; } .inter i { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 10px; background: #fff; transition: left 0.2s; }
  .inter.on { background: var(--primaire); border-color: var(--primaire); } .inter.on i { left: 21px; }
  .pas { display: flex; align-items: center; justify-content: space-between; padding: 6px 0 12px; border-top: 1px solid var(--ligne); } .pas button { width: 44px; height: 44px; border-radius: 14px; background: var(--carte2); display: grid; place-items: center; } .pas button:disabled { opacity: 0.4; } .pas b { font-weight: 600; }
  .espace { height: 86px; }
  .err { color: var(--danger); font-size: 13px; text-align: center; }
</style>
