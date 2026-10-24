<script lang="ts">
  import { aujourdhui } from '../../data/horloge.ts';
  import { ajouterJours, jourSemaineCourt } from '../../core/dates.ts';
  import { initiales, nomCourt, nomVehicule, placesRestantes } from '../../core/covoit.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { param } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { offresInterurbain } from './actions.ts';
  import FicheConducteur from './FicheConducteur.svelte';
  import { nav } from './nav.ts';

  const moi = $derived(personneCourante());
  const FILTRES = ['Tous', 'Tôt', 'Pas cher', '2+ places'] as const;
  let filtre = $state<(typeof FILTRES)[number]>('Tous'), fiche = $state<string | null>(null);
  const toutes = $derived(offresInterurbain());
  // Trajet affiché : ?de=&vers=&jour= ; sinon la ligne et le jour de la prochaine offre.
  const premiere = $derived(toutes.find((o) => o.jour >= aujourdhui()) ?? toutes[0]);
  const de = $derived(param('de') ?? premiere?.de ?? 'Yaoundé'), vers = $derived(param('vers') ?? premiere?.vers ?? 'Douala'), jour = $derived(param('jour') ?? premiere?.jour ?? ajouterJours(aujourdhui(), 1));
  const duTrajet = $derived(toutes.filter((o) => o.de === de && o.vers === vers && o.jour === jour));
  const prixMin = $derived(Math.min(...duTrajet.map((o) => o.prix)));
  const offres = $derived(duTrajet.filter((o) => filtre === 'Tous' || (filtre === 'Tôt' && o.heure < '09:00') || (filtre === 'Pas cher' && o.prix === prixMin) || (filtre === '2+ places' && placesRestantes(o) >= 2)));
  const reservee = (id: string) => !!moi && app.monde.covoits.find((o) => o.id === id)?.reservations.some((r) => r.voyageurId === moi.id);
  const note = (n?: number) => (n ? String(n).replace('.', ',') : '—');
  function ecrire(nom: string) { montrer(`Message envoyé à ${nom}`); }
</script>

<Mobile titre="Covoiturage" sous="{de} → {vers} · {jourSemaineCourt(jour)}" retourVers="/" dock={dockVoyageur('voyager')}>
  {#snippet droite()}<a class="pl ac" href="/covoit/conduire" use:nav>je conduis</a>{/snippet}

  <div class="seg2" role="group" aria-label="Type de covoiturage">
    <button type="button" class="on" aria-pressed="true">Interurbain</button>
    <a class="b g" href="/covoit/ville" use:nav style="flex: 1; min-height: 44px; border-radius: 14px; font-size: 14px">En ville</a>
  </div>
  <div class="chips" role="group" aria-label="Filtres">
    {#each FILTRES as f (f)}<button type="button" class="ch" class:on={filtre === f} aria-pressed={filtre === f} onclick={() => (filtre = f)}>{f}</button>{/each}
  </div>

  {#each offres as o, i (o.id)}
    {@const c = personne(o.conducteurId)}
    {@const libres = placesRestantes(o)}
    <article class="drv" class:top={i === 0}>
      <div class="row g12">
        <span class="av" class:hot={c?.note === 5 || i === 1}>{initiales(c?.prenom ?? '?', c?.nom)}</span>
        <span class="col grow"><span class="t16 b7 ell">{c ? nomCourt(c.prenom, c.nom) : 'Conducteur'}</span><span class="t13 mut ell">★ {note(c?.note)} · départ {o.depart}</span></span>
        <span class="col" style="align-items: flex-end"><span class="ttl t20">{fmtF(o.prix)}</span><span class="t12 mut3">par place</span></span>
      </div>
      <div class="row sp">
        <span class="row g8"><span class="mono t13 b7">{o.heure}</span><span class="t13 mut">{nomVehicule(o.vehicule)}</span></span>
        <span class="row g8"><span class="t12 mut">{libres} place{libres > 1 ? 's' : ''} libre{libres > 1 ? 's' : ''}</span><span class="sts" role="img" aria-label="{libres} places libres sur {o.places}">{#each Array.from({ length: o.places }, (_, k) => k) as k (k)}<i class:f={k < libres}></i>{/each}</span></span>
      </div>
      <div class="row g8">
        {#if reservee(o.id)}<span class="b s sm grow" style="cursor: default">Réservé</span>
        {:else if libres === 0}<span class="b s sm grow" style="cursor: default; opacity: 0.6">Complet</span>
        {:else}<a class="b p sm grow" href="/paiement?covoit={o.id}" use:nav>Réserver {fmtF(o.prix)}</a>{/if}
        <button type="button" class="ib" aria-label="Fiche de {c ? c.prenom : 'conducteur'}" onclick={() => (fiche = o.id)}><Icone nom="moi" taille={20} /></button>
      </div>
    </article>
  {:else}
    <div class="center">
      <div class="ill" aria-hidden="true"><Icone nom="groupe" taille={64} trait={1.6} /></div>
      <span class="ttl t20">{duTrajet.length ? 'Aucun conducteur pour ce filtre' : 'Pas encore de conducteur'}</span>
      <span class="t14 mut">{duTrajet.length ? 'Essaie un autre filtre.' : `Personne ne propose ${de} → ${vers} ce jour-là. Publie ton trajet pour en faire profiter les autres.`}</span>
    </div>
    {#if duTrajet.length}<button type="button" class="b s" onclick={() => (filtre = 'Tous')}>Voir tous les conducteurs</button>{:else}<a class="b p" href="/covoit/conduire" use:nav>Je conduis ce jour-là</a>{/if}
  {/each}

  <div class="toast"><span class="bub aq"><Icone nom="info" taille={18} /></span><span class="t13 grow">Conducteurs vérifiés (CNI, permis, visage). Paiement bloqué jusqu’à l’arrivée.</span></div>
</Mobile>

{#if fiche}<FicheConducteur offreId={fiche} fermer={() => (fiche = null)} ecrire={ecrire} />{/if}

<style>
  .chips { flex: none; }
  .drv { display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 22px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); }
  .drv.top { background: linear-gradient(135deg, rgba(139, 124, 255, 0.22), rgba(61, 224, 255, 0.14)); border-color: rgba(139, 124, 255, 0.45); }
  .sts { display: flex; gap: 4px; } .sts i { width: 14px; height: 18px; border-radius: 4px 4px 2px 2px; background: rgba(255, 255, 255, 0.14); } .sts i.f { background: #3de0ff; }
</style>
