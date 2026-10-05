<script lang="ts">
  import { untrack } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import { estArrive } from '@core/minuteur.ts';
  import { ajouterJours, utcVersLocal } from '@core/dates.ts';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { blocsDuJour, profil } from '../../data/requetes.ts';
  import { aujourdhui as jourCourant, fuseau, horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { ecouleOccurrence, minuteurDe, terminerBloc } from '../../data/actions/blocs.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { styleTeinte } from './teintes.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import BarreOnglets from '../../ui/BarreOnglets.svelte';
  import Segment from '../../ui/Segment.svelte';
  import Icone from '../../ui/Icone.svelte';
  import BandeauJours from './BandeauJours.svelte';
  import Journee from './Journee.svelte';
  import CarteBas from './CarteBas.svelte';
  import VoletBloc from './VoletBloc.svelte';
  import Reporter from './Reporter.svelte';
  import Confirmer from './Confirmer.svelte';
  import { basculerMinuteur, occurrencesActives, statsJour } from './vue-blocs.ts';
  import { cap, dateLongue, dureeMin } from './format.ts';
  import { jourValide } from './navigation.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const aujourdhui = $derived(jourCourant());
  const jour = $derived(jourValide(routeur.params.get('jour')) ?? aujourdhui);
  const estAujourdhui = $derived(jour === aujourdhui);
  const blocs = $derived(blocsDuJour(jour));
  const stats = $derived(statsJour(blocs));
  const actifs = $derived(occurrencesActives());
  const actif = $derived(actifs[0]);
  const prenom = $derived(profil()?.prenom ?? 'Luther');
  const mode = $derived(theme.mode);

  const statLabel = $derived(
    !blocs.length ? 'Aucun bloc prévu' : jour > aujourdhui ? `${blocs.length} bloc${blocs.length > 1 ? 's' : ''} prévu${blocs.length > 1 ? 's' : ''}`
      : `${stats.faits} sur ${stats.total} accomplis · ${stats.servies} ${stats.servies > 1 ? 'thèmes servis' : 'thème servi'}`
  );

  /** Où ouvrir la journée : le bloc en cours, sinon « maintenant » ; un autre jour, son premier bloc. */
  const focusMin = $derived.by(() => {
    if (estAujourdhui) {
      if (actif && actif.jour === jour) return utcVersLocal(Date.parse(actif.debut), fuseau()).minutes;
      return untrack(() => maintenantLocal().minutes);
    }
    // Jour à venir sans bloc : on montre le bloc fantôme de 09:00.
    return blocs[0]?.debutMin ?? (jour > aujourdhui ? 8 * 60 : 6 * 60);
  });

  // Notifications : tant qu'elles ne sont pas autorisées, la cloche mène à l'écran d'autorisation (avec une pastille).
  const notifsOk = typeof Notification !== 'undefined' && Notification.permission === 'granted';

  let selId = $state<string | null>(null);
  let reportId = $state<string | null>(null);
  let confirmId = $state<string | null>(null);
  const refuses = new SvelteSet<string>();

  const blocDe = (id: string | null) => {
    if (!id) return null;
    const o = magasin.trouver('occurrences', id);
    return o ? blocsDuJour(o.jour).find((b) => b.occ.id === id) ?? null : null;
  };
  const selBloc = $derived(reportId || confirmId ? null : blocDe(selId));
  const confBloc = $derived(blocDe(confirmId));

  // Liens profonds : /?bloc=… ouvre le volet, /?reporter=… ouvre le report (depuis Action rapide ou la recherche).
  $effect(() => {
    const p = routeur.params;
    const bloc = p.get('bloc'), rep = p.get('reporter');
    if (!bloc && !rep) return;
    untrack(() => {
      if (bloc) { selId = bloc; routeur.definir('bloc', null); }
      if (rep) { reportId = rep; routeur.definir('reporter', null); }
    });
  });

  // Fin prévue atteinte : « As-tu terminé ? » (aussi à l'ouverture si l'app était fermée).
  // Avec plusieurs minuteurs, on les passe un par un : la question suivante vient quand la précédente est répondue.
  $effect(() => {
    if (confirmId) return;
    const fini = actifs.find((a) => a.etat === 'en_cours' && !refuses.has(a.id) && estArrive(minuteurDe(a), horloge.maintenant, (Date.parse(a.fin) - Date.parse(a.debut)) / 1000));
    if (fini) confirmId = fini.id;
  });

  // Sens du dernier changement de jour (1 = vers demain) : la journée entre du côté d'où l'on vient.
  let sens = $state(1);
  function choisirJour(j: string) { sens = j >= jour ? 1 : -1; selId = null; routeur.definir('jour', j === aujourdhui ? null : j); }

  // Glisser la journée vers la gauche (jour suivant) ou vers la droite (jour précédent).
  let depart: { x: number; y: number; t: number } | null = null;
  function toucheDebut(e: TouchEvent) { const t = e.touches[0]; depart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null; }
  // Un glissement franchement horizontal ne doit pas déclencher le « retour » du navigateur : on l'annule (écouteur non passif).
  let pan: HTMLDivElement | undefined = $state();
  $effect(() => {
    const el = pan;
    if (!el) return;
    const bloquer = (e: TouchEvent) => {
      const t = e.touches[0];
      if (depart && t && e.cancelable && Math.abs(t.clientX - depart.x) > 12 && Math.abs(t.clientX - depart.x) > Math.abs(t.clientY - depart.y) * 1.6) e.preventDefault();
    };
    el.addEventListener('touchmove', bloquer, { passive: false });
    return () => el.removeEventListener('touchmove', bloquer);
  });
  function toucheFin(e: TouchEvent) {
    const d = depart; depart = null;
    const t = e.changedTouches[0];
    if (!d || !t) return;
    const dx = t.clientX - d.x, dy = t.clientY - d.y;
    // Geste net : assez long, plutôt horizontal, assez vif (sinon c'est un défilement ou une hésitation).
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - d.t > 700) return;
    choisirJour(ajouterJours(jour, dx < 0 ? 1 : -1));
  }

  function confirmer(corriger: boolean) {
    const b = confBloc;
    if (!b) { confirmId = null; return; }
    const sec = ecouleOccurrence(b.occ);
    terminerBloc(b.occ.id);
    confirmId = null;
    if (corriger) selId = b.occ.id;
    else dire(`« ${b.titre} » cochée · ${dureeMin(Math.round(sec / 60))}`);
  }
  function pasEncore() { if (confirmId) refuses.add(confirmId); confirmId = null; }
</script>

<div class="ecran-fil">
  <header class="entete">
    <div class="ligne">
      <span class="titre appli">{prenom} Life</span>
      <div class="actions">
        <a class="rond" href="/carnet?ecrire=1" aria-label="Carnet : écrire une note"><Icone nom="livre" taille={19} /></a>
        <a class="rond" href="/recherche" aria-label="Rechercher"><Icone nom="recherche" taille={19} /></a>
        <a class="rond cloche" href={notifsOk ? '/reglages' : '/autoriser-notifications'} aria-label="Notifications">
          <Icone nom="cloche" taille={19} />{#if !notifsOk}<span class="pastille"></span>{/if}
        </a>
        <a class="rond plus" href="/tache/nouvelle{estAujourdhui ? '' : `?jour=${jour}`}" aria-label="Ajouter une tâche"><Icone nom="plus" taille={20} trait={2.2} /></a>
      </div>
    </div>
    <div class="ligne bas">
      <div class="col">
        <h1 class="titre">{cap(dateLongue(jour))}</h1>
        <span class="muted stat">{statLabel}</span>
      </div>
      <div class="jour-pct">
        <span class="mono muted">jour {stats.pct} %</span>
        <span class="segments">
          {#each stats.segments as s (s.couleur)}<span style:width="{s.pct}%" style:background={couleurRubrique(s.couleur, mode)}></span>{/each}
        </span>
      </div>
    </div>
  </header>

  <div class="vues">
    <Segment valeur="jour" options={[
      { valeur: 'jour', label: 'Jour' },
      { valeur: 'semaine', label: 'Semaine', href: `/semaine${estAujourdhui ? '' : `?semaine=${jour}`}` },
      { valeur: 'mois', label: 'Mois', href: `/mois${estAujourdhui ? '' : `?mois=${jour.slice(0, 7)}`}` }
    ]} />
  </div>

  <BandeauJours {jour} {aujourdhui} onchoisir={choisirJour} />

  <div class="pan" bind:this={pan} ontouchstart={toucheDebut} ontouchend={toucheFin} role="presentation">
    {#key jour}
      <div class="page" in:fly={{ x: sens * 36, duration: 230, easing: cubicOut, opacity: 0 }}>
        <Journee {blocs} {jour} {aujourdhui} {estAujourdhui} {focusMin} onouvrir={(id) => (selId = id)} onjouer={basculerMinuteur} />
      </div>
    {/key}
  </div>

  <CarteBas {blocs} {jour} {aujourdhui} {actifs} onouvrir={(id) => (selId = id)} onjouer={basculerMinuteur} onterminer={(id) => (confirmId = id)} />

  <BarreOnglets filet={false} />
</div>

<VoletBloc b={selBloc} {aujourdhui} onfermer={() => (selId = null)} onjouer={basculerMinuteur} onterminer={(id) => (confirmId = id)} onreporter={(id) => (reportId = id)} />

<Reporter occId={reportId} {aujourdhui} onfermer={() => (reportId = null)} onvalide={() => { reportId = null; selId = null; }} />

<div style={confBloc ? styleTeinte(confBloc.couleur, mode) : ''}>
  <Confirmer ouvert={!!confBloc} sur="{dureeMin(Math.round((confBloc ? ecouleOccurrence(confBloc.occ, horloge.maintenant) : 0) / 60))} écoulées" question="As-tu terminé « {confBloc?.titre ?? ''} » ?">
    <button type="button" class="oui" onclick={() => confirmer(false)}>Oui, c’est fait</button>
    <div class="duo">
      <button type="button" class="non" onclick={() => confirmer(true)}>Corriger le temps</button>
      <button type="button" class="non" onclick={pasEncore}>Pas encore</button>
    </div>
  </Confirmer>
</div>

<style>
  .ecran-fil { height: 100dvh; max-width: 480px; margin: 0 auto; display: flex; flex-direction: column; background: var(--fond); overflow: hidden; }
  .entete { padding: calc(20px + var(--haut-sûr)) 18px 4px; display: flex; flex-direction: column; gap: 6px; flex: none; }
  .ligne { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .ligne.bas { align-items: flex-end; }
  .appli { font-size: 15px; letter-spacing: 0.01em; }
  .actions { display: flex; gap: 6px; }
  .cloche { position: relative; }
  .pastille { position: absolute; top: 9px; right: 10px; width: 8px; height: 8px; border-radius: 4px; background: var(--maintenant); }
  .plus { background: var(--inverse); color: var(--inverse-texte); border: 0; }
  .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  h1 { font-size: 30px; line-height: 1.05; }
  .stat { font-size: 13px; }
  .jour-pct { flex: none; width: 92px; display: flex; flex-direction: column; gap: 5px; align-items: flex-end; }
  .jour-pct .mono { font-size: 12px; }
  .segments { width: 92px; height: 6px; border-radius: 3px; background: var(--surface-2); overflow: hidden; display: flex; }
  .vues { padding: 2px 18px 6px; flex: none; }
  /* touch-action : le défilement vertical reste au navigateur, le glissement horizontal nous revient. */
  .pan { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; touch-action: pan-y; }
  .page { flex: 1; min-height: 0; display: flex; flex-direction: column; }
  /* Sur la maquette du Fil, la barre d'onglets n'a pas de filet (la carte du bas la sépare déjà). */
</style>
