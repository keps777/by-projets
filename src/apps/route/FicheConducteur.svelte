<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { initiales, nomVehicule, placesRestantes } from '../../core/covoit.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personne } from '../../domain/actions.ts';
  import Icone from '../../ui/Icone.svelte';
  import { nav } from './nav.ts';

  /** Fiche d'un conducteur (feuille modale) : note, véhicule, vérifications, autres trajets. */
  let { offreId, fermer, ecrire }: { offreId: string; fermer: () => void; ecrire: (nom: string) => void } = $props();
  const o = $derived(app.monde.covoits.find((x) => x.id === offreId));
  const c = $derived(personne(o?.conducteurId));
  const autres = $derived(app.monde.covoits.filter((x) => x.conducteurId === o?.conducteurId && x.id !== o?.id && x.statut === 'ouverte'));
  const faits = $derived(app.monde.covoits.filter((x) => x.conducteurId === o?.conducteurId && x.statut === 'terminee').length);
  let bouton: HTMLButtonElement | undefined = $state();
  $effect(() => { bouton?.focus(); });
  function touche(e: KeyboardEvent) { if (e.key === 'Escape') fermer(); }
</script>

<svelte:window onkeydown={touche} />
{#if o && c}
  <div class="voile" role="presentation" onclick={fermer}></div>
  <div class="sheet fiche" role="dialog" aria-modal="true" aria-label="Fiche de {c.prenom} {c.nom}">
    <span class="grab"></span>
    <div class="row g12">
      <span class="av">{initiales(c.prenom, c.nom)}</span>
      <span class="col grow"><span class="ttl t18">{c.prenom} {c.nom}</span><span class="t13 mut">★ {String(c.note ?? '—').replace('.', ',')} · {nomVehicule(o.vehicule)}{faits ? ` · ${faits} trajet${faits > 1 ? 's' : ''} avec AfriMove` : ''}</span></span>
      <button type="button" class="ib" bind:this={bouton} aria-label="Fermer la fiche" onclick={fermer}><Icone nom="fermer" taille={20} /></button>
    </div>
    <div class="row g8 wrapf">
      <span class="pl ok"><Icone nom="ok" taille={12} trait={2.6} /> CNI vérifiée</span><span class="pl ok"><Icone nom="ok" taille={12} trait={2.6} /> permis</span>{#if c.visage !== false}<span class="pl ok"><Icone nom="visage" taille={12} trait={2.2} /> visage</span>{/if}
    </div>
    <div class="gl col g4">
      <span class="lab">Ce trajet</span>
      <span class="t14 b7">{o.de} → {o.vers} · {jourSemaineCourt(o.jour)} {o.heure}</span>
      <span class="t13 mut">Départ {o.depart} · {fmtF(o.prix)} par place · {placesRestantes(o)} place{placesRestantes(o) > 1 ? 's' : ''} libre{placesRestantes(o) > 1 ? 's' : ''}</span>
    </div>
    {#if autres.length}
      <div class="gl col g4"><span class="lab">Autres trajets</span>{#each autres as a (a.id)}<span class="t13">{a.de} → {a.vers} · {jourSemaineCourt(a.jour)} {a.heure} · {fmtF(a.prix)}</span>{/each}</div>
    {/if}
    <div class="row g8">
      <button type="button" class="b s" onclick={() => { ecrire(c.prenom); fermer(); }}>Écrire à {c.prenom}</button>
      <a class="b p" href="/paiement?covoit={o.id}" use:nav>Réserver</a>
    </div>
  </div>
{/if}

<style>
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.55); z-index: 40; }
  .fiche { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); z-index: 41; margin: 0; max-height: 86dvh; overflow-y: auto; }
</style>
