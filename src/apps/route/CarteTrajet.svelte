<script lang="ts">
  import { initiales, nomCourt, nomVehicule, placesRestantes } from '../../core/covoit.ts';
  import { heureArrivee, texteDuree } from '../../core/covoitPrix.ts';
  import { noteTexte } from '../../core/covoitRegles.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personne } from '../../domain/actions.ts';
  import type { OffreCovoit } from '../../domain/types.ts';
  import { dureeOffre, infoOffre, nbAvisDe, optionsOffre } from './covoitActions.ts';
  import IconeCv from './IconeCv.svelte';

  /** Une offre de covoiturage : conducteur (initiales, note, vérifié), heure et arrivée estimée, véhicule, point de départ, places libres en pastilles, prix par place. */
  let { offre, reservee = false, afficherJour = false, onvoir }: { offre: OffreCovoit; reservee?: boolean; afficherJour?: boolean; onvoir: (id: string) => void } = $props();
  const c = $derived(personne(offre.conducteurId)), libres = $derived(placesRestantes(offre)), info = $derived(infoOffre(offre)), opts = $derived(optionsOffre(offre.id, offre.conducteurId));
  const duree = $derived(dureeOffre(offre)), arrivee = $derived(heureArrivee(offre.heure, duree));
  const nom = $derived(c ? nomCourt(c.prenom, c.nom) : 'Conducteur');
</script>

<article class="carte" class:complet={libres === 0} aria-label="Trajet de {nom}, {offre.de} vers {offre.vers}, départ {offre.heure}">
  <div class="haut">
    <span class="av" class:hot={c?.note !== undefined && c.note >= 4.9}>{initiales(c?.prenom ?? '?', c?.nom)}{#if info.verifie}<i class="coche" aria-hidden="true"><IconeCv nom="valide" taille={11} trait={3} /></i>{/if}</span>
    <span class="col grow"><span class="t16 b7 ell">{nom}</span>
      <span class="row g6 t12 mut"><span class="cv-etoile"><IconeCv nom="etoile" taille={13} />{noteTexte(c?.note)}</span><span>({nbAvisDe(offre.conducteurId)} avis)</span></span><span class="t12 mut ell">{nomVehicule(offre.vehicule)}</span></span>
    <span class="col prix"><span class="ttl t20">{fmtF(offre.prix)}</span><span class="t12 mut3">par place</span></span>
  </div>
  <div class="horaire">
    <span class="col"><span class="mono t20 b7">{offre.heure}</span><span class="t12 mut ell">{offre.depart}</span></span>
    <span class="trait" aria-hidden="true"><i></i><span class="t12 mut3">{texteDuree(duree)}</span><i></i></span>
    <span class="col fin"><span class="mono t20 b7">{arrivee.heure}</span><span class="t12 mut ell">{offre.enVille ? offre.vers : `${offre.vers}${arrivee.lendemain ? ' +1' : ''}`}</span></span>
  </div>
  <div class="bas">
    <span class="row g8"><span class="cv-pastilles" role="img" aria-label="{libres} place{libres > 1 ? 's' : ''} libre{libres > 1 ? 's' : ''} sur {offre.places}">{#each Array.from({ length: offre.places }, (_, k) => k) as k (k)}<i class:f={k < libres}></i>{/each}</span><span class="t12 {libres === 1 ? 'wac b7' : 'mut'}">{libres === 0 ? 'Complet' : libres === 1 ? 'Dernière place' : `${libres} places libres`}</span></span>
    <span class="row g6 wrapf etiq">
      {#if info.verifie}<span class="cv-badge ok">vérifié</span>{/if}{#if !info.fumeur}<span class="cv-badge"><IconeCv nom="fumee" taille={11} />non-fumeur</span>{/if}{#if info.femmes}<span class="cv-badge ac">entre femmes</span>{/if}{#if opts.clim !== false}<span class="cv-badge"><IconeCv nom="clim" taille={11} />clim</span>{/if}
    </span>
  </div>
  <button type="button" class="cv-bouton {reservee ? '' : 'p'} voir" onclick={() => onvoir(offre.id)}>{reservee ? 'Déjà réservé · voir' : libres === 0 ? 'Complet · voir la fiche' : `Voir et réserver${afficherJour ? ` · ${jourSemaineCourt(offre.jour)}` : ''}`}</button>
</article>

<style>
  .carte { display: flex; flex-direction: column; gap: 12px; padding: 14px; border-radius: 24px; background: linear-gradient(160deg, rgba(255, 255, 255, 0.1), rgba(255, 255, 255, 0.04)); border: 1px solid rgba(255, 255, 255, 0.14); backdrop-filter: blur(16px); box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12); }
  .carte.complet { opacity: 0.72; }
  .haut { display: flex; align-items: center; gap: 12px; min-width: 0; }
  .av { position: relative; width: 46px; height: 46px; font-size: 15px; }
  .coche { position: absolute; right: -3px; bottom: -3px; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: #4ade80; color: #06080f; border: 2px solid #0b0f1f; }
  .prix { align-items: flex-end; flex: none; }
  .horaire { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 16px; background: rgba(5, 7, 13, 0.35); }
  .horaire .col { min-width: 0; flex: 0 1 34%; } .fin { align-items: flex-end; text-align: right; }
  .trait { flex: 1; display: flex; align-items: center; gap: 6px; min-width: 40px; } .trait i { flex: 1; height: 2px; border-radius: 1px; background: linear-gradient(90deg, #3de0ff, #ff5bde); opacity: 0.7; }
  .bas { display: flex; flex-direction: column; gap: 8px; }
  .etiq { row-gap: 4px; }
  .voir { width: 100%; }
</style>
