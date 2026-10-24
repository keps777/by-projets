<script lang="ts">
  import './guichet.css';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { caisseOuverte, compagnieDe, heureLocale, placesLibres, remplissage } from '../../domain/actions.ts';
  import { fcfa } from '../../core/money.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Lecture from './Lecture.svelte';
  import { dockAgent } from './dock.ts';
  import { alertes, basculerReseau, contexte, departsDeLaGare, nomDepart, resumeCaisse, statsDuJour } from './actions.ts';
  import { etat } from './etat.ts';

  const ctx = $derived(contexte()), agent = $derived(ctx.agent);
  const caisse = $derived(agent ? caisseOuverte(agent.id) : undefined);
  const resume = $derived(caisse ? resumeCaisse(caisse) : null);
  const jour = $derived(agent ? statsDuJour(agent.id) : null);
  const departs = $derived(agent?.gareId ? departsDeLaGare(agent.gareId, 4) : []);
  const alertesAgent = $derived(agent ? alertes(agent) : []);
  const compagnie = $derived(agent?.compagnieId ? app.monde.compagnies.find((c) => c.id === agent.compagnieId) : undefined);
  const gareNom = $derived(app.monde.gares.find((g) => g.id === agent?.gareId)?.nom ?? '');
  const moyenne = $derived(departs.length ? Math.round((departs.reduce((s, d) => s + remplissage(d), 0) / departs.length) * 100) : 0);
  const aSync = $derived(etat().aSynchroniser.length), derniereSync = $derived(etat().derniereSync);
  const superviseur = $derived(app.monde.personnes.find((p) => p.role === 'superviseur' && p.gareId === agent?.gareId));
  const enLigne = $derived(!app.session.hors_ligne);
  const pillDepart = (d: (typeof departs)[number]) => {
    const l = placesLibres(d);
    return d.retardMin > 0 ? { t: `retard +${d.retardMin} min`, c: 'wa' } : l === 0 ? { t: 'complet', c: 'er' } : l <= 3 ? { t: 'presque plein', c: 'wa' } : d.statut === 'embarquement' ? { t: 'embarque', c: 'ok' } : { t: 'vente', c: 'inf' };
  };
  function reseau() { const r = basculerReseau(); montrer(r.ligne ? (r.synchronises ? `${r.synchronises} vente(s) synchronisée(s)` : 'En ligne') : 'Hors ligne : espèces seulement', r.ligne ? 'ok' : 'wa'); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
</script>

<Mobile sansRetour dock={dockAgent('guichet')}>
  {#snippet enteteLibre()}
    <header class="hd">
      <div class="row g12"><span class="av hot" aria-hidden="true">{agent?.prenom[0] ?? '?'}</span><div class="col"><span class="ttl t16 ell">{agent?.prenom ?? 'Agent'} · guichet</span><span class="t13 mut ell">Gare de {gareNom}{compagnie ? ` · ${compagnie.nom}` : ''}</span></div></div>
      <button type="button" class="pl {enLigne ? 'ok' : 'wa'}" style="min-height: 44px" aria-pressed={!enLigne} aria-label={enLigne ? 'En ligne : passer hors ligne (démonstration)' : 'Hors ligne : revenir en ligne'} onclick={reseau}><span class="dot"></span>{enLigne ? 'en ligne' : 'hors ligne'}</button>
    </header>
  {/snippet}

  {#if ctx.lecture}<Lecture {agent} />{/if}

  {#each alertesAgent as a (a.texte)}
    {#if a.lien}
      <a class="gl row g8" href={a.lien} onclick={(e) => lien(e, a.lien!)} style="text-decoration: none; color: inherit; min-height: 44px"><span class="pl {a.ton}">{a.ton === 'er' ? 'urgent' : a.ton === 'wa' ? 'à voir' : 'info'}</span><span class="t13 grow">{a.texte}</span><Icone nom="suivant" taille={18} /></a>
    {:else}
      <div class="gl row g8" style="min-height: 44px"><span class="pl {a.ton}">{a.ton === 'er' ? 'urgent' : a.ton === 'wa' ? 'à voir' : 'info'}</span><span class="t13 grow">{a.texte}</span></div>
    {/if}
  {/each}

  <a class="gl ac row sp" href="/caisse" onclick={(e) => lien(e, '/caisse')} style="text-decoration: none; color: inherit">
    {#if caisse && resume}
      <span class="col"><span class="lab">Caisse ouverte {heureLocale(caisse.ouvertA)}</span><span class="big">{fcfa(resume.attendu)} F</span><span class="t12 mut">{jour?.billets ?? 0} billet{(jour?.billets ?? 0) > 1 ? 's' : ''} · {jour?.colis ?? 0} colis · {aSync ? `${aSync} vente${aSync > 1 ? 's' : ''} à synchroniser` : `synchronisé ${heureLocale(derniereSync || maintenant())}`}</span></span>
      <span class="ringp" style="--p: {moyenne}%" role="img" aria-label="Remplissage moyen des prochains départs : {moyenne} %"><span class="t13 b7">{moyenne} %</span></span>
    {:else}
      <span class="col"><span class="lab">Caisse fermée</span><span class="ttl t20">Ouvrir la caisse</span><span class="t12 mut">Compte le fond de caisse avant de vendre</span></span><Icone nom="suivant" />
    {/if}
  </a>

  <div class="bento">
    <a class="tile ac" href="/vente" onclick={(e) => lien(e, '/vente')}><Icone nom="billet" taille={26} /><span class="t16 b7">Vendre</span><span class="t12 mut">bus 3D · 1 écran</span></a>
    <a class="tile hot" href="/cadence" onclick={(e) => lien(e, '/cadence')}><Icone nom="horloge" taille={26} /><span class="t16 b7">Cadence</span><span class="t12 mut">2 touches · heure de pointe</span></a>
    <a class="tile" href="/guichet/colis" onclick={(e) => lien(e, '/guichet/colis')}><Icone nom="colis" taille={26} /><span class="t16 b7">Colis</span><span class="t12 mut">étiquette</span></a>
    <a class="tile" href="/depot" onclick={(e) => lien(e, '/depot')}><Icone nom="scan" taille={26} /><span class="t16 b7">Dépôt prépayé</span><span class="t12 mut">scanner un code</span></a>
  </div>

  {#if jour}<div class="gl row sp" aria-label="Ventes du jour"><span class="kp"><span class="k">Billets vendus</span><span class="v">{jour.billets}</span></span><span class="kp"><span class="k">Espèces</span><span class="v">{fcfa(jour.especes)} F</span></span><span class="kp"><span class="k">MoMo / OM</span><span class="v">{fcfa(jour.mobile)} F</span></span></div>{/if}

  <div class="row sp"><span class="lab">Prochains départs</span><a class="t13 aq" href="/quai" onclick={(e) => lien(e, '/quai')} style="min-height: 44px; display: inline-flex; align-items: center">au quai</a></div>
  <div class="gl col" style="gap: 0">
    {#each departs as d (d.id)}
      {@const p = pillDepart(d)}
      <a class="g-dep" href="/vente?depart={d.id}" onclick={(e) => lien(e, `/vente?depart=${d.id}`)}>
        <span class="ttl t18" style="min-width: 58px">{d.heure}</span>
        <span class="col grow"><span class="t14 b7 ell">{nomDepart(d)} · {compagnieDe(d).abrev}</span><div class="bar" style="margin-top: 6px"><i class:wa={remplissage(d) > 0.85} style="width: {Math.round(remplissage(d) * 100)}%"></i></div></span>
        <span class="col" style="align-items: flex-end"><span class="t13 b7">{placesLibres(d)} libres</span><span class="pl {p.c}">{p.t}</span></span>
      </a>
    {:else}
      <p class="t13 mut" style="padding: 12px 0">Aucun départ à venir depuis cette gare.</p>
    {/each}
  </div>

  <div class="row g8 wrapf">
    <a class="b s sm grow" href="/rapport-soir" onclick={(e) => lien(e, '/rapport-soir')}>Rapport du soir</a>
    <a class="b s sm grow" href="/guichet/rembourser" onclick={(e) => lien(e, '/guichet/rembourser')}>Rembourser un billet</a>
    {#if superviseur}<a class="b s sm grow" href="tel:+237{superviseur.tel}">Appeler le superviseur</a>{/if}
  </div>
</Mobile>
