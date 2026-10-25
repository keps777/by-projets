<script lang="ts">
  import { attenteMin, NOM_MODE, prixCourse, trajetMin, type Mode } from '../../core/course.ts';
  import { nomVehicule } from '../../core/covoit.ts';
  import { texteDuree } from '../../core/covoitPrix.ts';
  import { lienTel, lienWhatsApp, messagePartage, PALIERS_ANNULATION } from '../../core/covoitRegles.ts';
  import { suiviTrajet } from '../../core/covoitSuivi.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personne } from '../../domain/actions.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { annulerReservation, basculerPartage, commanderMotoRencontre, declencherSOS, dureeOffre, motoRencontre, partageActif, profilDe, remboursementAnnulation, type Resa } from './covoitActions.ts';
  import FeuilleAvis from './FeuilleAvis.svelte';
  import FeuilleProbleme from './FeuilleProbleme.svelte';
  import IconeCv from './IconeCv.svelte';

  /** Les fenêtres de l'onglet Voyageur pour la réservation choisie : suivre, moto-taxi, partager, annuler, problème, avis. Jamais une autre page. */
  let { resa, quoi = $bindable(null), maintenant }: { resa: Resa | undefined; quoi: string | null; maintenant: number } = $props();
  const o = $derived(resa?.offre), c = $derived(personne(o?.conducteurId)), pr = $derived(profilDe(o?.conducteurId));
  const ferme = (nom: string) => ({ get: () => quoi === nom, set: (v: boolean) => { if (!v && quoi === nom) quoi = null; } });
  const suivi = $derived(o ? suiviTrajet(o, maintenant, dureeOffre(o)) : undefined);
  const rb = $derived(resa ? remboursementAnnulation(resa, maintenant) : undefined);
  let mode = $state<Mode>('moto'), sos = $state(false);
  $effect(() => { if (quoi) sos = false; });
  const moto = $derived(o && resa ? motoRencontre(o.id, resa.voyageurId) : undefined), partage = $derived(o && resa ? partageActif(o.id, resa.voyageurId) : false);
  const texte = $derived(o && c ? messagePartage({ de: o.de, vers: o.vers, quand: jourSemaineCourt(o.jour), heure: o.heure, conducteur: `${c.prenom} ${c.nom}`, vehicule: nomVehicule(o.vehicule), plaque: pr?.vehicule.plaque, depart: o.depart }) : '');
  function copier() { try { navigator.clipboard?.writeText(texte); montrer('Message copié'); } catch { montrer('Copie impossible', 'wa'); } }
  function commander() { if (!o || !resa) return; const p = commanderMotoRencontre(o.id, resa.voyageurId, mode); montrer(`${NOM_MODE[mode]} commandé · ${fmtF(p)}`); }
  function annuler() { if (!o || !resa) return; try { const r = annulerReservation(o.id, resa.voyageurId); montrer(r.rembourse ? `Réservation annulée · ${fmtF(r.rembourse)} remboursés` : 'Réservation annulée'); quoi = null; } catch { montrer('Annulation impossible : le trajet a démarré.', 'er'); } }
  function alerter() { if (!o || !resa) return; const n = declencherSOS(o.id, resa.voyageurId); montrer(`Alerte envoyée à ${n} personne${n > 1 ? 's' : ''}`, 'wa'); sos = false; }
  function partager() { if (!o || !resa) return; const actif = basculerPartage(o.id, resa.voyageurId); montrer(actif ? 'Position partagée en direct avec tes proches' : 'Partage arrêté'); }
</script>

{#if resa && o}
  <Feuille bind:ouvert={ferme('suivi').get, ferme('suivi').set} titre="Suivre mon voyage" sous="{o.de} → {o.vers} · {o.heure}" hauteur="haute">
    {#if suivi}
      <div class="cv-verre vi col g8" role="status" aria-live="polite">
        <span class="row sp"><span class="t18 ttl">{suivi.titre}</span><span class="cv-badge {suivi.etape === 'en_route' ? 'ac' : suivi.etape === 'attente' ? 'wa' : 'ok'}">{suivi.etape === 'en_route' ? 'en direct' : suivi.etape === 'arrive' ? 'arrivé' : 'à venir'}</span></span>
        <span class="t13 mut">{suivi.detail}</span>
        <div class="piste" aria-hidden="true"><i style="width: {suivi.progres * 100}%"></i><span style="left: {suivi.progres * 100}%"><IconeCv nom="voiture" taille={18} /></span></div>
        <span class="row sp t12 mut"><span>{o.de}</span><span>{o.vers}</span></span>
      </div>
      <div class="cv-verre row g12"><span class="av">{c?.prenom[0]}{c?.nom[0]}</span>
        <span class="col grow"><span class="t14 b7">{c?.prenom} {c?.nom}</span><span class="t12 mut">{pr ? `${pr.vehicule.couleur} ${pr.vehicule.marque} ${pr.vehicule.modele} · ${pr.vehicule.plaque}` : nomVehicule(o.vehicule)}</span></span></div>
      {#if c}<div class="cv-grille"><a class="cv-bouton" href={lienTel(c.tel)}><IconeCv nom="tel" taille={18} />Appeler</a><a class="cv-bouton" href={lienWhatsApp(`Bonjour ${c.prenom}, je suis au point de rencontre (${o.depart}).`, c.tel)} target="_blank" rel="noopener"><IconeCv nom="whatsapp" taille={18} />WhatsApp</a></div>{/if}
      <span class="cv-titre">Sécurité</span>
      <button type="button" class="cv-bouton" aria-pressed={partage} onclick={partager}><IconeCv nom="position" taille={18} />{partage ? 'Partage en direct actif · arrêter' : 'Partager mon trajet en direct'}</button>
      {#if partage}<span class="cv-note">Tes proches voient ta position simulée jusqu’à l’arrivée.</span>{/if}
      {#if !sos}<button type="button" class="cv-bouton d" onclick={() => (sos = true)}><IconeCv nom="sos" taille={18} />SOS</button>
      {:else}
        <div class="cv-verre col g8" role="alertdialog" aria-label="Confirmer l’alerte SOS" style="border-color: rgba(255,107,107,.6)">
          <span class="t14 b7 erc">Envoyer une alerte à tes proches et à l’équipe AfriMove ?</span>
          <div class="cv-grille"><a class="cv-bouton" href="tel:117">Police 117</a><a class="cv-bouton" href="tel:119">Urgences 119</a></div>
          <div class="cv-grille"><button type="button" class="cv-bouton sos" onclick={alerter}>Envoyer l’alerte</button><button type="button" class="cv-bouton" onclick={() => (sos = false)}>Ce n’est pas une urgence</button></div>
        </div>
      {/if}
    {/if}
  </Feuille>

  <Feuille bind:ouvert={ferme('moto').get, ferme('moto').set} titre="Moto-taxi vers le point de rencontre" sous="Rejoins {o.depart} à l’heure">
    <div class="cv-grille" role="radiogroup" aria-label="Moto ou taxi">
      {#each ['moto', 'taxi'] as m (m)}
        <button type="button" role="radio" aria-checked={mode === m} class="cv-ligne" aria-current={mode === m ? 'true' : undefined} style="flex-direction: column; align-items: flex-start; gap: 2px" onclick={() => (mode = m as Mode)}>
          <span class="t16 b7">{NOM_MODE[m as Mode]}</span><span class="ttl t20">{fmtF(prixCourse(m as Mode, 3))}</span><span class="t12 mut">arrive en {attenteMin(m as Mode)} min · trajet {texteDuree(trajetMin(m as Mode, 3))}</span>
        </button>
      {/each}
    </div>
    {#if moto}<div class="cv-verre vi" role="status"><span class="t14 b7 okc">{NOM_MODE[moto.mode]} commandé</span><br /><span class="t13 mut">{fmtF(moto.prix)} · retrouve ton conducteur à {moto.point}. Paiement au conducteur.</span></div>{/if}
    {#snippet pied()}<button type="button" class="cv-bouton p" onclick={commander}><IconeCv nom="moto" taille={18} />{moto ? 'Commander à nouveau' : `Commander · ${fmtF(prixCourse(mode, 3))}`}</button>{/snippet}
  </Feuille>

  <Feuille bind:ouvert={ferme('partage').get, ferme('partage').set} titre="Partager mon covoiturage" sous="Pour que tes proches te sachent en route">
    <div class="cv-verre"><p class="t13" style="white-space: pre-line">{texte}</p></div>
    <a class="cv-bouton p" href={lienWhatsApp(texte)} target="_blank" rel="noopener"><IconeCv nom="whatsapp" taille={18} />Envoyer par WhatsApp</a>
    <button type="button" class="cv-bouton" onclick={copier}>Copier le message</button>
    <button type="button" class="cv-bouton" aria-pressed={partage} onclick={partager}><IconeCv nom="position" taille={18} />{partage ? 'Partage en direct actif · arrêter' : 'Partager ma position en direct'}</button>
  </Feuille>

  <Feuille bind:ouvert={ferme('annuler').get, ferme('annuler').set} titre="Annuler ma réservation" sous="{o.de} → {o.vers} · {jourSemaineCourt(o.jour)} {o.heure}">
    {#if rb}
      <div class="cv-verre vi col g4" role="status"><span class="lab">Remboursement si tu annules maintenant</span><span class="big">{fmtF(rb.rembourse)}</span><span class="t13 mut">{rb.regle}{rb.frais ? ` · ${fmtF(rb.frais)} retenus` : ''}</span></div>
      <span class="cv-titre">Règle de remboursement</span>
      <ul class="paliers">{#each PALIERS_ANNULATION as p (p.texte)}<li class:cur={p.texte === rb.regle}><b>{p.pourcent} %</b><span>{p.texte}</span></li>{/each}</ul>
    {/if}
    {#snippet pied()}<button type="button" class="cv-bouton" onclick={() => (quoi = null)}>Garder ma place</button><button type="button" class="cv-bouton d" onclick={annuler} disabled={o.statut !== 'ouverte'}>Annuler et être remboursé</button>{/snippet}
  </Feuille>

  <FeuilleProbleme bind:ouvert={ferme('probleme').get, ferme('probleme').set} offreId={o.id} auteurId={resa.voyageurId} />
  <FeuilleAvis bind:ouvert={ferme('avis').get, ferme('avis').set} offreId={o.id} deId={resa.voyageurId} pourId={o.conducteurId} role="conducteur" />
{/if}

<style>
  .piste { position: relative; height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.12); margin: 14px 12px 4px; }
  .piste i { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 4px; background: linear-gradient(90deg, #8b7cff, #3de0ff); transition: width 0.6s; }
  .piste span { position: absolute; top: 50%; width: 32px; height: 32px; margin: -16px 0 0 -16px; border-radius: 50%; display: grid; place-items: center; background: #f2f4ff; color: #06080f; box-shadow: 0 6px 16px -4px rgba(61, 224, 255, 0.8); transition: left 0.6s; }
  .paliers { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 6px; }
  .paliers li { display: flex; gap: 10px; align-items: center; padding: 10px 12px; border-radius: 14px; background: rgba(255, 255, 255, 0.05); border: 1px solid transparent; font-size: 13px; color: #b7c0db; }
  .paliers li.cur { border-color: #8b7cff; background: rgba(139, 124, 255, 0.18); color: #f2f4ff; } .paliers b { flex: none; min-width: 48px; font: 700 14px 'Geist Mono', monospace; }
  [role='alertdialog'] a.cv-bouton { color: #f2f4ff; }
</style>
