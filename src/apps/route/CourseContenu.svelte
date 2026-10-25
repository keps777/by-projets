<script lang="ts">
  import { tick } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { compagnieDe, departEnMs, departParId, gare, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { quaiDe } from '../../core/arrets.ts';
  import { attenteMin, CONDUCTEURS, ETAPES, marge, MARGE_MINI, MODES, MOYENS_COURSE, heureRecommandee, NOM_MODE, NOM_MOYEN, prixCourse, trajetMin, type Mode, type MoyenCourse } from '../../core/course.ts';
  import { detailPaiementCourse } from '../../core/courseCommission.ts';
  import { estimerArrivee, flotte } from '../../core/courseFlotte.ts';
  import { kmVersGare, type Lieu } from '../../core/lieux.ts';
  import { delai } from '../../core/suivi.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { annulerCourse, avancerCourse, billetASuivre, commanderCourse, courseActive } from './actions.ts';
  import { cagnotteDe, lire } from './etat.ts';
  import ChampLieu from './ChampLieu.svelte';
  import Relief from './Relief.svelte';
  import { horloge } from './temps.svelte.ts';
  import { nav } from './nav.ts';

  /** Moto-taxi vers la gare de départ du billet : choix moto ou taxi, point de départ avec autocomplétion, arrivée estimée d'après les véhicules connectés autour, paiement (MoMo, Orange Money, cagnotte, espèces),
   *  puis suivi simulé de la course. Contenu partagé par la page `/course` et par la fenêtre « Moto-taxi vers la gare ». */
  let { departId = null, onfermer }: { departId?: string | null; onfermer?: () => void } = $props();
  const h = horloge(15_000);
  const moi = $derived(personneCourante());
  const active = $derived(courseActive(moi?.id));
  const derniere = $derived(moi ? lire().courses.find((c) => c.personneId === moi.id) : undefined); // terminée ou annulée, pour le récapitulatif
  const billet = $derived(moi ? billetASuivre(moi.id, h.ms) : undefined);
  const recente = $derived(derniere && derniere.statut === 'terminee' && h.ms - derniere.majLe < 10 * 60_000 ? derniere : undefined); // la course qui vient de finir reste affichée
  const dId = $derived(active?.departId ?? recente?.departId ?? departId ?? billet?.departId);
  const d = $derived(dId ? departParId(dId) : undefined);
  const ligne = $derived(d ? ligneDe(d) : undefined);
  const gareDe = $derived(ligne ? gare(ligne.gareDe) : undefined);
  const ville = $derived(gareDe?.ville ?? ligne?.de ?? 'Yaoundé');
  let mode = $state<Mode>('moto'), lieu = $state<Lieu | null>(null), saisie = $state(''), moyen = $state<MoyenCourse>('momo'), erreur = $state(''), az = $state(0);
  const km = $derived(lieu && ligne ? kmVersGare(lieu, ligne.gareDe) : 0);
  const prix = $derived(lieu ? prixCourse(mode, km) : 0);
  const flotteVille = $derived(flotte(ville, mode, h.ms));
  const est = $derived(lieu ? estimerArrivee(mode, lieu, flotteVille) : null);
  const connectes = $derived(flotteVille.filter((c) => c.enLigne).length);
  const attente = $derived(est?.arriveeMin ?? attenteMin(mode));
  const detail = $derived(detailPaiementCourse(prix, moyen));
  const departMs = $derived(d ? departEnMs(d) : 0);
  const margeMin = $derived(d && lieu ? marge(departMs, h.ms, mode, km, attente) : 0);
  const gareTxt = $derived(gareDe ? `gare de ${gareDe.nom}` : 'la gare');
  const solde = $derived(cagnotteDe(moi?.id));
  const soldeKo = $derived(moyen === 'cagnotte' && solde < prix);
  const parti = $derived(!d || d.statut === 'parti' || d.statut === 'arrive' || d.statut === 'annule');
  const recommandee = $derived(d && lieu ? new Date(heureRecommandee(departMs, mode, km, attente)).toTimeString().slice(0, 5) : '');
  const tropTot = $derived(d ? Math.round((departMs - h.ms) / 60_000) > 120 : false);
  const indisponible = $derived(!!est && !est.disponible);

  // Suivi
  const c = $derived(active ?? recente);
  let tete = $state<HTMLElement | undefined>();
  $effect(() => { if (c?.id) tick().then(() => tete?.scrollIntoView({ block: 'nearest' })); }); // le suivi s'affiche depuis le haut, pas à la hauteur du bouton « Commander »
  const cond = $derived(c ? { ...CONDUCTEURS[c.mode], ...(c.conducteur ? { nom: c.conducteur, initiales: c.conducteur.slice(0, 2).toUpperCase() } : {}) } : CONDUCTEURS[mode]);
  const etape = $derived(c ? ETAPES[c.etape] : ETAPES[0]);
  const POS = [{ x: 262, y: 82 }, { x: 122, y: 142 }, { x: 200, y: 104 }, { x: 292, y: 62 }];
  const ETAPES_LIBELLE = ['Commandée', 'Véhicule là', 'En route', 'À la gare'];
  const margeRoute = $derived(c && d ? Math.round((departMs - h.ms) / 60_000) - trajetMin(c.mode, c.km) : 0);
  const k1 = $derived(!c ? ['', ''] : c.etape === 0 ? ['Arrive dans', `~${c.attente ?? attenteMin(c.mode)} min`] : c.etape === 1 ? ['Trajet', `${trajetMin(c.mode, c.km)} min`] : c.etape === 2 ? ['Arrivée', new Date(h.ms + trajetMin(c.mode, c.km) * 60_000).toTimeString().slice(0, 5)] : ['Durée', `${trajetMin(c.mode, c.km)} min`]);
  const detailSuivi = $derived(c ? detailPaiementCourse(c.prix, c.moyen) : null);
  const msg = $derived(!c || !d ? '' : c.etape === 0 ? `${cond.nom} te voit. Reste à ton point de prise en charge : ${c.quartier}.` : c.etape === 1 ? `Vérifie la plaque ${cond.plaque} et ${c.mode === 'moto' ? 'prends le casque' : 'monte à l’arrière'}.`
    : c.etape === 2 ? (d.statut === 'embarquement' ? `Ton bus de ${d.heure} est au quai ${quaiDe(d.id)}` : `Ton bus de ${d.heure} part dans ${delai(Math.round((departMs - h.ms) / 60_000))}`) + (margeRoute >= 0 ? ` · tu as ${margeRoute} min de marge.` : ' · tu risques de le rater : dis-le au quai.') : `Tu es à la gare. Montre ton billet au quai ${quaiDe(d.id)}.`);

  function commander() {
    if (!moi || !d || !lieu) return; erreur = '';
    try { commanderCourse({ personneId: moi.id, departId: d.id, mode, quartier: lieu.nom, moyen }); montrer(`${NOM_MODE[mode]} commandée · ${fmtF(prix)}`); }
    catch (e) { const m = e instanceof Error ? e.message : ''; erreur = m === 'solde_insuffisant' ? `Cagnotte insuffisante : il manque ${fmtF(prix - solde)}.` : m === 'depart_ferme' ? 'Ce bus est déjà parti.' : m === 'course_en_cours' ? 'Tu as déjà une course en cours.' : 'Commande impossible pour le moment.'; }
  }
  function suivante() { if (c) avancerCourse(c.id); }
  function actionPrincipale() {
    if (!c) return;
    if (c.etape === 1) { avancerCourse(c.id); return; }
    if (onfermer) onfermer(); else aller(billet ? `/pass?billet=${billet.id}` : '/pass');
  }
  function annuler() { if (c) { try { annulerCourse(c.id); montrer('Course annulée, rien à payer'); } catch { montrer('La course a commencé : elle ne peut plus être annulée gratuitement.', 'wa'); } } }
  const libMoyen = (m: MoyenCourse) => (m === 'cagnotte' ? 'Cagnotte' : NOM_MOYEN[m]);
</script>

{#if c && d && ligne}
  <div class="row sp" style="align-items: center" bind:this={tete}><div class="col" style="min-width: 0"><h3 class="ttl t20" aria-live="polite">{etape.titre.replace('{mode}', NOM_MODE[c.mode])}</h3><span class="t13 mut ell">{c.quartier} → {gareTxt} · bus de {d.heure}</span></div><span class="pl {etape.ton}"><span class="dot"></span>{etape.pill}</span></div>
  <ol class="etapes" aria-label="Étapes de la course">
    {#each ETAPES_LIBELLE as t, i (t)}<li class:ok={i < c.etape} class:cur={i === c.etape} aria-current={i === c.etape ? 'step' : undefined}><span class="pt" aria-hidden="true"></span><span class="t12">{t}</span></li>{/each}
  </ol>
  <Relief label="Carte en relief : {c.mode === 'moto' ? 'la moto' : 'le taxi'} arrive. Étape {c.etape + 1} sur 4." bind:az hauteur={260} echelle={0.95}>
    <svg class="rl-plat" viewBox="0 0 360 240" aria-hidden="true"><path d="M118 140 C 160 120, 200 120, 292 56" fill="none" stroke="rgba(61,224,255,.5)" stroke-width="3" stroke-dasharray="6 7" stroke-linecap="round" /></svg>
    <span class="moi rl-pied" style="left: 112px; top: 148px" role="img" aria-label="Toi"><span class="orb pt"></span></span>
    <span class="tag rl-pied" style="left: 292px; top: 38px">{gareTxt}</span>
    <div class="mk rl-pied" style="left: {POS[c.etape].x}px; top: {POS[c.etape].y}px" role="img" aria-label={c.mode === 'moto' ? 'Moto' : 'Taxi'}><span class="orb"><Icone nom={c.mode} taille={22} trait={2.2} /></span></div>
  </Relief>
  <div class="gl hl row g12">
    <span class="av hot">{cond.initiales}</span>
    <span class="col grow"><span class="t16 b7 ell">{cond.nom} · {cond.societe}</span><span class="t13 mut">★ {String(cond.note).replace('.', ',')} · {cond.courses.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} courses{c.mode === 'moto' ? ' · casque pour toi' : ''}</span></span>
    <span class="plate">{cond.plaque}</span>
  </div>
  <div class="tuiles">
    <div class="gl arr col g4"><span class="lab">{k1[0]}</span><span class="ttl t24 nw">{k1[1]}</span></div>
    <div class="gl col g4"><span class="lab">Prix</span><span class="ttl t20 nw">{fmtF(c.prix)}</span></div>
    <div class="gl col g4"><span class="lab">{c.moyen === 'especes' ? 'À payer' : 'Payé'}</span><span class="ttl t16" class:okc={c.moyen !== 'especes'}>{libMoyen(c.moyen)}</span></div>
  </div>
  {#if detailSuivi}<div class="gl" data-testid="detail-commission"><span class="t13">{detailSuivi.texte}.</span></div>{/if}
  <div class="toast" role="status"><span class="bub aq"><Icone nom="horloge" taille={18} /></span><span class="t13 grow">{msg}</span></div>
  <div class="row g8">
    {#if c.statut === 'en_cours'}<button type="button" class="b s" onclick={suivante}>Simuler l’étape suivante</button>{/if}
    <button type="button" class="ib" aria-label="Appeler le chauffeur" onclick={() => montrer(`Appel de ${cond.nom} (simulé)`)}><Icone nom="info" taille={20} /></button>
  </div>
  <div class="col g8" style="margin-top: auto">
    <button type="button" class="b p" onclick={actionPrincipale}>{etape.cta}</button>
    {#if c.etape === 0}<button type="button" class="b g" onclick={annuler}>Annuler la course (gratuit avant l’arrivée)</button>{/if}
  </div>
{:else if !moi || !d || !ligne}
  <div class="center">
    <div class="ill" aria-hidden="true"><Icone nom="moto" taille={64} trait={1.6} /></div>
    <span class="ttl t20">Pas de bus à rejoindre</span><span class="t14 mut">Réserve d’abord un départ : on t’emmène ensuite à la gare en moto ou en taxi.</span>
  </div>
  {#if onfermer}<button type="button" class="b p" onclick={() => { onfermer(); aller('/'); }}>Voir les départs</button>{:else}<a class="b p" href="/" use:nav>Voir les départs</a>{/if}
{:else if parti}
  <div class="center">
    <div class="ill er" aria-hidden="true"><Icone nom="alerte" taille={64} trait={1.6} /></div>
    <span class="ttl t20">{d.statut === 'annule' ? 'Départ annulé' : 'Ce bus est déjà parti'}</span><span class="t14 mut">{compagnieDe(d).nom} · {ligne.de} → {ligne.vers} · {d.heure}. Choisis un autre départ.</span>
  </div>
  {#if onfermer}<button type="button" class="b p" onclick={() => { onfermer(); aller('/'); }}>Voir les départs</button>{:else}<a class="b p" href="/" use:nav>Voir les départs</a>{/if}
{:else}
  {#if derniere && derniere.statut !== 'en_cours'}
    <div class="gl row g12"><span class="bub" class:aq={derniere.statut === 'terminee'}><Icone nom={derniere.statut === 'terminee' ? 'ok' : 'fermer'} taille={18} /></span><span class="t13 grow">Dernière course : {derniere.statut === 'terminee' ? 'terminée' : 'annulée'} · {derniere.quartier} → gare · {fmtF(derniere.prix)}</span></div>
  {/if}
  <div class="gl row g12">
    <span class="bub aq"><Icone nom="pin" taille={18} /></span>
    <span class="col grow"><span class="t14 b7">Vers la {gareTxt}</span><span class="t12 mut">Bus {compagnieDe(d).abrev} de {d.heure}{d.retardMin > 0 ? ` (+${d.retardMin} min)` : ''} · {ligne.de} → {ligne.vers}</span></span>
  </div>
  <div class="seg2" role="group" aria-label="Véhicule">
    {#each MODES as m (m)}<button type="button" class:on={mode === m} aria-pressed={mode === m} onclick={() => (mode = m)}><Icone nom={m} taille={18} /> {NOM_MODE[m]}{lieu ? ` · ${fmtF(prixCourse(m, km))}` : ''}</button>{/each}
  </div>
  <ChampLieu {ville} bind:lieu bind:valeur={saisie} />

  <div class="tuiles" aria-live="polite">
    <div class="gl arr ac col g4" data-testid="tuile-arrivee"><span class="lab">Arrivée dans</span><span class="ttl t24 nw">{est?.arriveeMin != null ? `~${est.arriveeMin} min` : '—'}</span></div>
    <div class="gl col g4"><span class="lab">Trajet</span><span class="ttl t20 nw">{lieu ? `${trajetMin(mode, km)} min` : '—'}</span></div>
    <div class="gl col g4"><span class="lab">Prix</span><span class="ttl t20 nw">{lieu ? fmtF(prix) : '—'}</span></div>
  </div>
  <div class="gl row g12" data-testid="flotte-proche" aria-live="polite">
    <span class="bub aq"><Icone nom={mode} taille={18} /></span>
    {#if est}<span class="col grow"><span class="t14 b7">{est.libelleProche}{est.disponible ? ` · arrive dans ~${est.arriveeMin} min` : ''}</span><span class="t12 mut">{est.libelleProches} · {connectes} {mode === 'moto' ? (connectes > 1 ? 'motos connectées' : 'moto connectée') : (connectes > 1 ? 'taxis connectés' : 'taxi connecté')} à {ville}</span></span>
    {:else}<span class="col grow"><span class="t14 b7">{connectes} {mode === 'moto' ? (connectes > 1 ? 'motos connectées' : 'moto connectée') : (connectes > 1 ? 'taxis connectés' : 'taxi connecté')} à {ville}</span><span class="t12 mut">Choisis ton point de départ : on calcule l’arrivée du plus proche.</span></span>{/if}
  </div>
  {#if lieu}
    <div class="gl row g12">
      <span class="bub aq"><Icone nom="pin" taille={18} /></span>
      <span class="col grow"><span class="t14 b7">{lieu.nom} → {gareTxt}</span><span class="t12 mut">{km} km · {NOM_MODE[mode].toLowerCase()} {fmtF(prix)}{lieu.libre ? ' · distance estimée' : ''}</span></span>
    </div>
    {#if indisponible}
      <div class="gl row g12" role="alert" style="border-color: rgba(255,107,107,.5)"><span class="t13 erc grow">{mode === 'moto' ? 'Aucune moto' : 'Aucun taxi'} assez proche pour le moment. Essaie {mode === 'moto' ? 'un taxi' : 'une moto'} ou un autre point de départ.</span></div>
    {:else if margeMin < 0}
      <div class="gl row g12" role="alert" style="border-color: rgba(255,107,107,.5)"><span class="t13 erc grow">Trop tard pour ce bus : tu arriverais {-margeMin} min après le départ. Choisis la moto, plus rapide, ou un autre départ.</span></div>
    {:else if margeMin < MARGE_MINI}
      <div class="gl row g12" role="alert" style="border-color: rgba(255,194,75,.5)"><span class="t13 wac grow">Juste : tu arriverais {margeMin} min avant le départ. La moto est plus sûre.</span></div>
    {:else if tropTot}
      <div class="gl row g12"><span class="t13 grow">Le bus part dans {delai(Math.round((departMs - h.ms) / 60_000))}. Commande plutôt vers <b>{recommandee}</b> pour arriver 25 min avant.</span></div>
    {:else}
      <div class="toast"><span class="bub aq"><Icone nom="horloge" taille={18} /></span><span class="t13 grow">Tu arriverais à la gare avec {margeMin} min de marge.</span></div>
    {/if}
  {/if}

  <span class="lab" id="moyen-lab">Paiement</span>
  <div class="moyens" role="radiogroup" aria-labelledby="moyen-lab">
    {#each MOYENS_COURSE as m (m)}<button type="button" role="radio" aria-checked={moyen === m} class:on={moyen === m} onclick={() => (moyen = m)}><span class="t14 b7">{libMoyen(m)}</span><span class="t12 mut">{m === 'especes' ? 'au conducteur' : m === 'cagnotte' ? fmtF(solde) : 'dans l’app'}</span></button>{/each}
  </div>
  {#if lieu}
    <div class="gl col g4" data-testid="detail-commission"><span class="t13" aria-live="polite">{detail.texte}.</span>
      {#if moyen === 'cagnotte'}<span class="t12 {soldeKo ? 'erc' : 'mut'}" role={soldeKo ? 'alert' : undefined}>Cagnotte : {fmtF(solde)}{soldeKo ? ` · il manque ${fmtF(prix - solde)}` : ''}</span>{/if}</div>
  {:else if moyen === 'especes'}<span class="t12 mut">AfriMove prélève sa commission de 10 % sur le compte du conducteur.</span>
  {:else}<span class="t12 mut">La commission AfriMove (10 %) est retenue sur le paiement.</span>{/if}
  {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
  <div class="col g8" style="margin-top: auto">
    <button type="button" class="b p" onclick={commander} disabled={!lieu || soldeKo || indisponible || margeMin < 0}>{lieu ? `Commander · ${fmtF(prix)}` : 'Choisis ton point de départ'}</button>
    <span class="t12 mut3 c">Annulation gratuite avant l’arrivée du véhicule.</span>
  </div>
{/if}

<style>
  .chips { flex: none; }
  .tag { padding: 4px 8px; border-radius: 999px; background: rgba(5, 7, 13, 0.85); border: 1px solid rgba(255, 255, 255, 0.2); font: 600 11px 'Geist Mono', monospace; white-space: nowrap; margin-top: -6px; }
  .mk { padding: 12px; margin-top: 10px; }
  .moi { padding: 12px; margin-top: 12px; }
  .orb { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; color: #06080f; background: linear-gradient(135deg, #8b7cff, #3de0ff); box-shadow: 0 0 0 8px rgba(61, 224, 255, 0.15); }
  .orb.pt { width: 22px; height: 22px; background: #ff5bde; box-shadow: 0 0 0 8px rgba(255, 91, 222, 0.2); }
  .plate { font: 700 14px 'Geist Mono', monospace; padding: 4px 8px; border-radius: 8px; background: #f2f4ff; color: #06080f; white-space: nowrap; }
  .nw { white-space: nowrap; }
  .tuiles { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; } .tuiles .arr { grid-column: 1 / -1; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
  .seg2 button { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
  .moyens { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .moyens button { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-height: 58px; padding: 8px 14px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; font: inherit; text-align: left; cursor: pointer; }
  .moyens button.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.3), rgba(61, 224, 255, 0.18)); border-color: #8b7cff; }
  .moyens button:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .etapes { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(4, 1fr); gap: 4px; }
  .etapes li { display: flex; flex-direction: column; gap: 6px; color: #a1accb; }
  .etapes .pt { height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.14); }
  .etapes .ok .pt { background: #4ade80; } .etapes .cur .pt { background: linear-gradient(90deg, #8b7cff, #3de0ff); box-shadow: 0 0 10px #3de0ff; } .etapes .cur { color: #f2f4ff; font-weight: 700; }
</style>
