<script lang="ts">
  import { initiales, nomVehicule, placesRestantes } from '../../core/covoit.ts';
  import { avisDemo } from '../../core/covoitDemo.ts';
  import { heureArrivee, texteDuree } from '../../core/covoitPrix.ts';
  import { lienTel, lienWhatsApp, noteTexte } from '../../core/covoitRegles.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { avisRecus, dureeOffre, infoOffre, nbAvisDe, optionsOffre, preparerPaiement, profilDe, trajetsFaits } from './covoitActions.ts';
  import IconeCv from './IconeCv.svelte';

  /** Fiche d'un conducteur et de son trajet, en fenêtre : profil, avis, véhicule, itinéraire, règles, points de rencontre, puis la réservation. */
  let { ouvert = $bindable(false), offreId }: { ouvert?: boolean; offreId: string | null } = $props();
  const o = $derived(offreId ? app.monde.covoits.find((x) => x.id === offreId) : undefined), c = $derived(personne(o?.conducteurId)), moi = $derived(personneCourante());
  const pr = $derived(profilDe(o?.conducteurId)), info = $derived(o ? infoOffre(o) : undefined), opts = $derived(o ? optionsOffre(o.id, o.conducteurId) : undefined);
  const libres = $derived(o ? placesRestantes(o) : 0), reservee = $derived(!!o && !!moi && o.reservations.some((r) => r.voyageurId === moi.id));
  const monTrajet = $derived(!!o && o.conducteurId === moi?.id);
  const duree = $derived(o ? dureeOffre(o) : 0), arrivee = $derived(o ? heureArrivee(o.heure, duree) : { heure: '', lendemain: false });
  const avis = $derived(o ? [...avisRecus(o.conducteurId).map((a) => ({ auteur: personne(a.deId)?.prenom ?? 'Voyageur', note: a.note, texte: a.texte || a.tags.join(', '), quand: 'récemment' })), ...avisDemo(o.conducteurId, 3)].slice(0, 4) : []);
  let places = $state(1), erreur = $state('');
  $effect(() => { if (ouvert) { places = 1; erreur = ''; } });
  const n = $derived(Math.max(1, Math.min(places, libres || 1)));
  const plaque = $derived(pr ? (reservee || monTrajet ? pr.vehicule.plaque : pr.vehicule.plaque.replace(/\d{3,4}/, '•••')) : '');
  const rencontres = $derived(o ? (o.enVille ? [o.depart, `Devant ${o.depart}, côté route principale`] : [o.depart, `Gare routière de ${o.de}`, `Station-service de sortie de ${o.de}`]) : []);
  function reserver() {
    if (!o || !moi) return; erreur = '';
    try { const url = preparerPaiement(o.id, n, moi.id); ouvert = false; aller(url); } catch (e) { erreur = e instanceof Error && e.message === 'complet' ? 'Ce trajet est complet.' : 'Réservation impossible pour le moment.'; }
  }
  const msg = $derived(o && c ? `Bonjour ${c.prenom}, je voudrais réserver ${o.de} → ${o.vers} le ${jourSemaineCourt(o.jour)} à ${o.heure} (AfriMove).` : '');
  const depuis = $derived(pr ? `${['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'][Number(pr.depuis.slice(5)) - 1] ?? ''} ${pr.depuis.slice(0, 4)}` : '');
</script>

<Feuille bind:ouvert titre={c ? `${c.prenom} ${c.nom}` : 'Conducteur'} sous={o ? `${o.de} → ${o.vers} · ${jourSemaineCourt(o.jour)} ${o.heure}` : ''} hauteur="haute">
  {#if o && c}
    <div class="row g12">
      <span class="av grand" class:hot={(c.note ?? 0) >= 4.9}>{initiales(c.prenom, c.nom)}</span>
      <span class="col grow"><span class="row g8"><span class="cv-etoile t16"><IconeCv nom="etoile" taille={16} />{noteTexte(c.note)}</span><span class="t13 mut">{nbAvisDe(o.conducteurId)} avis</span></span>
        <span class="t13 mut">{trajetsFaits(o.conducteurId)} trajets · membre depuis {depuis}</span></span>
    </div>
    <div class="row g6 wrapf">
      {#if info?.verifie}<span class="cv-badge ok"><IconeCv nom="bouclier" taille={12} />profil vérifié</span>{:else}<span class="cv-badge wa">en vérification</span>{/if}
      {#if pr?.telVerifie}<span class="cv-badge ok"><IconeCv nom="tel" taille={12} />téléphone vérifié</span>{/if}<span class="cv-badge ac">{trajetsFaits(o.conducteurId)} trajets</span>
    </div>
    {#if pr?.bio}<p class="cv-note">« {pr.bio} »</p>{/if}

    <section class="cv-verre vi col g8" aria-label="Itinéraire">
      <span class="cv-titre">Itinéraire</span>
      <div class="iti"><span class="t"><i class="cv-pt"></i><i class="ligne"></i><i class="cv-pt fin"></i></span>
        <span class="col g12"><span class="col"><span class="t15 b7">{o.heure} · {o.enVille ? o.depart : o.de}</span><span class="t12 mut">Point de départ : {o.depart}</span></span>
          <span class="col"><span class="t15 b7">{arrivee.heure} · {o.vers}{arrivee.lendemain ? ' (+1 jour)' : ''}</span><span class="t12 mut">≈ {texteDuree(duree)} de route</span></span></span></div>
    </section>

    <section class="cv-verre col g8" aria-label="Véhicule">
      <span class="cv-titre">Véhicule</span>
      <div class="row sp"><span class="col"><span class="t15 b7">{pr ? `${pr.vehicule.marque} ${pr.vehicule.modele}` : nomVehicule(o.vehicule)}</span><span class="t12 mut">{pr?.vehicule.couleur ?? ''} · {o.places} place{o.places > 1 ? 's' : ''} proposée{o.places > 1 ? 's' : ''}</span></span>
        {#if plaque}<span class="plaque mono">{plaque}</span>{/if}</div>
      {#if !reservee && !monTrajet}<span class="t12 mut3">La plaque complète s’affiche après ta réservation.</span>{/if}
    </section>

    <section class="cv-verre col g8" aria-label="Règles du trajet">
      <span class="cv-titre">Règles du trajet</span>
      <ul class="regles">
        <li class:non={info?.fumeur}><IconeCv nom="fumee" taille={16} />{info?.fumeur ? 'Fumeur toléré' : 'Non-fumeur'}</li>
        <li class:non={opts?.clim === false}><IconeCv nom="clim" taille={16} />{opts?.clim === false ? 'Pas de climatisation' : 'Climatisation'}</li>
        <li class:non={opts?.bagages === false}><IconeCv nom="sac" taille={16} />{opts?.bagages === false ? 'Pas de gros bagages' : 'Bagages acceptés'}</li>
        <li><IconeCv nom="utilisateur" taille={16} />{info?.femmes ? 'Passagères uniquement' : 'Tous voyageurs'}</li>
        {#if opts?.arrets}<li><IconeCv nom="position" taille={16} />Arrêts en route possibles</li>{/if}
      </ul>
    </section>

    <section class="cv-verre col g8" aria-label="Points de rencontre">
      <span class="cv-titre">Points de rencontre</span>
      {#each rencontres as p, k (p)}<span class="row g8 t14"><IconeCv nom="position" taille={16} /><span class="grow">{p}</span>{#if k === 0}<span class="cv-badge ac">principal</span>{/if}</span>{/each}
    </section>

    <section class="col g8" aria-label="Avis">
      <span class="cv-titre">Avis des voyageurs</span>
      {#each avis as a (a.auteur + a.texte)}<div class="cv-verre avis"><span class="row sp"><span class="t14 b7">{a.auteur}</span><span class="cv-etoile"><IconeCv nom="etoile" taille={13} />{a.note}</span></span><span class="t13 mut">{a.texte}</span><span class="t12 mut3">{a.quand}</span></div>{/each}
    </section>

    <div class="cv-grille">
      <a class="cv-bouton" href={lienTel(c.tel)}><IconeCv nom="tel" taille={18} />Appeler</a>
      <a class="cv-bouton" href={lienWhatsApp(msg, c.tel)} target="_blank" rel="noopener"><IconeCv nom="whatsapp" taille={18} />Écrire</a>
    </div>
  {/if}
  {#snippet pied()}
    {#if o}
      {#if erreur}<div class="cv-err" role="alert">{erreur}</div>{/if}
      {#if monTrajet}<span class="cv-note c">C’est ton propre trajet.</span>
      {:else if reservee}<button type="button" class="cv-bouton" onclick={() => (ouvert = false)}>Déjà réservé · fermer</button>
      {:else if libres === 0 || o.statut !== 'ouverte'}<button type="button" class="cv-bouton" disabled>Complet</button>
      {:else}
        <div class="row g12 sp">
          <span class="col"><span class="t12 mut">Places</span><span class="pas"><button type="button" aria-label="Une place de moins" disabled={n <= 1} onclick={() => (places = n - 1)}>−</button><b aria-live="polite">{n}</b><button type="button" aria-label="Une place de plus" disabled={n >= libres} onclick={() => (places = n + 1)}>+</button></span></span>
          <span class="col" style="align-items: flex-end"><span class="t12 mut">{n} × {fmtF(o.prix)}</span><span class="t12 mut3">paiement MoMo / OM</span></span>
        </div>
        <button type="button" class="cv-bouton p" onclick={reserver}>Réserver · {fmtF(o.prix * n)}</button>
      {/if}
    {/if}
  {/snippet}
</Feuille>

<style>
  .grand { width: 60px; height: 60px; font-size: 20px; } .t15 { font-size: 15px; }
  .iti { display: flex; gap: 12px; } .iti .t { display: flex; flex-direction: column; align-items: center; padding-top: 5px; } .iti .ligne { flex: 1; width: 2px; margin: 3px 0; background: linear-gradient(#3de0ff, #ff5bde); border-radius: 1px; }
  .plaque { padding: 4px 10px; border-radius: 8px; background: #f2f4ff; color: #06080f; font-weight: 700; letter-spacing: 0.08em; font-size: 14px; border: 2px solid #8b7cff; }
  .regles { list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; padding: 0; margin: 0; }
  .regles li { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #d6dcf0; } .regles li.non { color: #ffb36b; }
  .avis { padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; border-radius: 18px; }
  .pas { display: inline-flex; align-items: center; gap: 4px; } .pas b { min-width: 34px; text-align: center; font: 700 20px 'Unbounded Variable', 'Unbounded', sans-serif; }
  .pas button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.08); color: #f2f4ff; font: 700 20px 'Sora Variable', sans-serif; cursor: pointer; } .pas button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
