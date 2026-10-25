<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import { colisDe, heureLocale, personne, personneCourante } from '../../domain/actions.ts';
  import type { Colis } from '../../domain/types.ts';
  import { espacerCode, ETAPES_COURSE, etaCourse, kmCourse, MAISON, POSITIONS_COURSE } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { nomRelais, prenomDe, quartierDe, simulerEtapeSuivante } from './actions.ts';
  import { courseDe } from './etat.ts';
  import Pic from './Pic.svelte';

  const moi = $derived(personneCourante());
  const motos = $derived(moi ? [...colisDe(moi.id)].filter((x) => x.options.moto && x.statut !== 'annule').reverse() : []);
  const rang = (x: Colis) => (x.statut === 'en_livraison' ? 0 : x.statut === 'au_relais' ? 1 : x.statut === 'livre' ? 3 : 2);
  const c = $derived<Colis | undefined>(motos.find((x) => x.id === param('colis')) ?? [...motos].sort((a, b) => rang(a) - rang(b))[0]);
  const livreur = $derived(personne(c?.livreurId));
  const etape = $derived(c?.statut === 'livre' ? 3 : c?.statut === 'en_livraison' ? courseDe(c.id)?.etape ?? 0 : 0);
  const quartier = $derived(c ? quartierDe(c.id) : '');
  const eta = $derived(etaCourse(kmCourse(quartier), etape));
  const prenomDest = $derived(c ? prenomDe(c.destinataire.nom) : '');
  const heureLivre = $derived(c?.statut === 'livre' ? heureLocale(c.etapes[c.etapes.length - 1].ts) : '');
  const pilule = $derived(!c ? '' : c.statut === 'en_livraison' ? ETAPES_COURSE[etape] : c.statut === 'livre' ? `livré · ${heureLivre}` : c.statut === 'au_relais' ? 'en attente d’un livreur' : 'bientôt');
  const ton = $derived(c?.statut === 'au_relais' ? 'wa' : c?.statut === 'en_livraison' || c?.statut === 'livre' ? 'ok' : 'inf');
  const rider = $derived(POSITIONS_COURSE[Math.min(3, etape)]);
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };

  function suite() {
    if (!c) return;
    const r = simulerEtapeSuivante(c.id);
    if (!r.ok) montrer(r.message, 'er'); else if (r.livre) montrer(`Colis remis à ${prenomDest}`);
  }
  const labelSuite = $derived(etape >= 2 ? `Simuler la remise · ${prenomDest} donne son code` : 'Simuler l’étape suivante');
</script>

<Mobile titre="Livraison moto" sous={c ? `Colis ${c.code} · vers ${prenomDest}, ${quartier}` : 'Aucune livraison'} retourVers={c ? `/colis/suivi?colis=${c.id}` : '/colis/suivi'} dock={dockVoyageur('billets')}>
  {#snippet droite()}{#if c}<span class="pl {ton}" role="status"><span class="dot"></span>{pilule}</span>{/if}{/snippet}

  {#if !c}
    <div class="center">
      <span class="ill"><Pic nom="moto" taille={64} trait={1.5} /></span>
      <span class="ttl t18">Pas de livraison moto</span>
      <span class="t14 mut">Ajoute « Livraison moto » en envoyant un colis : un livreur l’apporte chez ton proche, avec un code de remise.</span>
      <a class="b p" href="/colis/envoi" onclick={(e) => lien(e, '/colis/envoi')}>Envoyer un colis</a>
    </div>
  {:else}
    <div class="map" role="img" aria-label={c.statut === 'en_livraison' ? `Le livreur est ${ETAPES_COURSE[etape]}, arrivée dans ${eta} minutes` : 'Carte de la livraison'}>
      <div class="plane"></div>
      <svg class="route" viewBox="0 0 100 230" preserveAspectRatio="none" aria-hidden="true"><path d="M18 170 C 40 170, 50 80, 77 60" fill="none" stroke="rgba(127,235,255,.55)" stroke-width="2" stroke-dasharray="5 5" vector-effect="non-scaling-stroke" /></svg>
      <div class="mk depart" style="left: {POSITIONS_COURSE[0].x}%; top: {POSITIONS_COURSE[0].y}px" aria-label="Relais {nomRelais(c.relaisId)}"><Pic nom="colis" taille={18} trait={2.2} /></div>
      <div class="mk home" style="left: {MAISON.x}%; top: {MAISON.y}px" aria-label="Maison de {prenomDest}"><Pic nom="maison" taille={20} trait={2.2} /></div>
      {#if c.statut === 'en_livraison' || c.statut === 'livre'}<div class="mk" style="left: {rider.x}%; top: {rider.y}px" aria-label="Livreur"><Pic nom="moto" taille={22} trait={2.2} /></div>{/if}
    </div>

    {#if c.statut === 'en_livraison' || c.statut === 'livre'}
      <div class="gl hl row g12">
        <span class="av">{livreur ? `${livreur.prenom[0]}${livreur.nom[0] ?? ''}` : '?'}</span>
        <span class="col grow"><span class="t16 b7">{livreur ? `${livreur.prenom} ${livreur.nom[0] ?? ''}. · livreur AfriMove` : 'Livreur AfriMove'}</span><span class="t13 mut">{livreur?.note ? `★ ${livreur.note.toLocaleString('fr-FR')} · ` : ''}{livreur?.vehicule ?? 'moto'}</span></span>
        {#if livreur}<a class="ib" href="tel:+237{livreur.tel}" aria-label="Appeler {livreur.prenom}"><Pic nom="appel" /></a>{/if}
      </div>
      <div class="row g8">
        <div class="gl grow col"><span class="lab">{c.statut === 'livre' ? 'Livré à' : 'Arrive dans'}</span><span class="ttl t24" aria-live="polite">{c.statut === 'livre' ? heureLivre : `${eta} min`}</span></div>
        <div class="gl grow ac col"><span class="lab">Code à donner</span><span class="code" aria-label="Code de remise {c.codeRetrait}">{espacerCode(c.codeRetrait)}</span></div>
      </div>
      <div class="toast"><span class="bub aq"><Pic nom="bouclier" taille={18} /></span><span class="t13 grow">{#if c.statut === 'livre'}Livraison confirmée : {prenomDest} a donné son code de remise.{:else}{prenomDest} donne le code {c.codeRetrait} à {livreur?.prenom ?? 'le livreur'}. Sans code, pas de remise : le colis revient au relais.{/if}</span></div>
      {#if c.statut === 'en_livraison'}<button type="button" class="b s" onclick={suite}>{labelSuite}</button>{/if}
    {:else if c.statut === 'au_relais'}
      <div class="gl col g8" aria-busy="true">
        <span class="row g8"><span class="dot aq"></span><span class="t14 b7">Recherche d’un livreur…</span></span>
        <span class="sk" style="width: 70%"></span><span class="sk" style="width: 45%"></span>
        <span class="t13 mut">Le colis est au relais {nomRelais(c.relaisId)}. Un livreur à moto proche l’acceptera dans quelques minutes ; tu le verras ici.</span>
      </div>
      <div class="gl ac"><span class="lab">Code à donner au livreur</span><span class="code" aria-label="Code de remise {c.codeRetrait}">{espacerCode(c.codeRetrait)}</span></div>
    {:else}
      <div class="gl col g8">
        <span class="t14 b7">Le colis n’est pas encore arrivé au relais</span>
        <span class="t13 mut">La moto part dès que le colis est au relais {nomRelais(c.relaisId)}, dans l’heure après l’arrivée du bus. Code à donner au livreur : <span class="mono b7">{espacerCode(c.codeRetrait)}</span>.</span>
        <a class="b s sm" href="/colis/suivi?colis={c.id}" onclick={(e) => lien(e, `/colis/suivi?colis=${c.id}`)}>Suivre le colis</a>
      </div>
    {/if}
    {#if motos.length > 1}
      <div class="chips" role="group" aria-label="Mes livraisons moto">{#each motos as x (x.id)}<button type="button" class="ch" class:on={x.id === c.id} aria-pressed={x.id === c.id} onclick={() => aller(`/livraison?colis=${x.id}`)}>{x.code}</button>{/each}</div>
    {/if}
    <a class="b g" href="/litige?colis={c.id}" style="margin-top: auto" onclick={(e) => lien(e, `/litige?colis=${c.id}`)}>Un problème avec la livraison</a>
  {/if}
</Mobile>

<style>
  .map { position: relative; height: 230px; margin: 0 -16px; overflow: hidden; perspective: 800px; perspective-origin: 50% 15%; flex: none; }
  .plane { position: absolute; left: -30%; right: -30%; top: 0; bottom: -60%; transform: rotateX(60deg); background-image: linear-gradient(rgba(61, 224, 255, 0.14) 1px, transparent 1px), linear-gradient(90deg, rgba(61, 224, 255, 0.14) 1px, transparent 1px); background-size: 38px 38px; background-color: rgba(10, 14, 28, 0.6); }
  .route { position: absolute; inset: 0; width: 100%; height: 100%; }
  .mk { position: absolute; width: 46px; height: 46px; margin: -23px 0 0 -23px; border-radius: 50%; display: grid; place-items: center; color: #06080f; background: linear-gradient(135deg, #8b7cff, #3de0ff); box-shadow: 0 0 0 8px rgba(61, 224, 255, 0.15); transition: left 0.5s, top 0.5s; }
  .mk.home { background: #ff5bde; box-shadow: 0 0 0 8px rgba(255, 91, 222, 0.2); }
  .mk.depart { width: 34px; height: 34px; margin: -17px 0 0 -17px; background: rgba(255, 255, 255, 0.9); box-shadow: 0 0 0 6px rgba(255, 255, 255, 0.12); }
  .code { font: 700 26px 'Geist Mono', monospace; letter-spacing: 0.1em; }
  button:focus-visible, a:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
