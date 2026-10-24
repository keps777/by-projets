<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import { compagnieDe, departEnMs, departParId, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { quaiDe } from '../../core/arrets.ts';
  import { attenteMin, CONDUCTEURS, ETAPES, marge, MARGE_MINI, MODES, MOYENS_COURSE, heureRecommandee, NOM_MODE, NOM_MOYEN, prixCourse, QUARTIERS, trajetMin, type Mode, type MoyenCourse } from '../../core/course.ts';
  import { delai } from '../../core/suivi.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { annulerCourse, avancerCourse, billetASuivre, commanderCourse, courseActive } from './actions.ts';
  import { cagnotteDe, lire } from './etat.ts';
  import Relief from './Relief.svelte';
  import { horloge } from './temps.svelte.ts';
  import { nav } from './nav.ts';

  const h = horloge(15_000);
  const moi = $derived(personneCourante());
  const active = $derived(courseActive(moi?.id));
  const derniere = $derived(moi ? lire().courses.find((c) => c.personneId === moi.id) : undefined); // terminée ou annulée, pour le récapitulatif
  const billet = $derived(moi ? billetASuivre(moi.id, h.ms) : undefined);
  const recente = $derived(derniere && derniere.statut === 'terminee' && h.ms - derniere.majLe < 10 * 60_000 ? derniere : undefined); // la course qui vient de finir reste affichée
  const dId = $derived(active?.departId ?? recente?.departId ?? param('depart') ?? billet?.departId);
  const d = $derived(dId ? departParId(dId) : undefined);
  const ligne = $derived(d ? ligneDe(d) : undefined);
  let mode = $state<Mode>('moto'), quartier = $state('Bastos'), moyen = $state<MoyenCourse>('momo'), erreur = $state(''), az = $state(0);
  const km = $derived(QUARTIERS.find((q) => q.nom === quartier)?.km ?? 7);
  const prix = $derived(prixCourse(mode, km));
  const departMs = $derived(d ? departEnMs(d) : 0);
  const margeMin = $derived(d ? marge(departMs, h.ms, mode, km) : 0);
  const gareTxt = $derived(ligne && d ? `gare de ${ligne.gareDe === 'mvan' ? 'Mvan' : ligne.gareDe}` : 'la gare');
  const solde = $derived(cagnotteDe(moi?.id));
  const soldeKo = $derived(moyen === 'cagnotte' && solde < prix);
  const parti = $derived(!d || d.statut === 'parti' || d.statut === 'arrive' || d.statut === 'annule');
  const recommandee = $derived(d ? new Date(heureRecommandee(departMs, mode, km)).toTimeString().slice(0, 5) : '');
  const tropTot = $derived(d ? Math.round((departMs - h.ms) / 60_000) > 120 : false);

  // Suivi
  const c = $derived(active ?? recente);
  const cond = $derived(c ? CONDUCTEURS[c.mode] : CONDUCTEURS[mode]);
  const etape = $derived(c ? ETAPES[c.etape] : ETAPES[0]);
  const POS = [{ x: 262, y: 82 }, { x: 122, y: 142 }, { x: 200, y: 104 }, { x: 292, y: 62 }];
  const margeRoute = $derived(c && d ? Math.round((departMs - h.ms) / 60_000) - trajetMin(c.mode, c.km) : 0);
  const k1 = $derived(!c ? ['', ''] : c.etape === 0 ? ['Arrive dans', `${attenteMin(c.mode)} min`] : c.etape === 1 ? ['Trajet', `${trajetMin(c.mode, c.km)} min`] : c.etape === 2 ? ['Arrivée', new Date(h.ms + trajetMin(c.mode, c.km) * 60_000).toTimeString().slice(0, 5)] : ['Durée', `${trajetMin(c.mode, c.km)} min`]);
  const msg = $derived(!c || !d ? '' : c.etape === 0 ? `${cond.nom} te voit. Reste à ton point de prise en charge : ${c.quartier}.` : c.etape === 1 ? `Vérifie la plaque ${cond.plaque} et ${c.mode === 'moto' ? 'prends le casque' : 'monte à l’arrière'}.`
    : c.etape === 2 ? (d.statut === 'embarquement' ? `Ton bus de ${d.heure} est au quai ${quaiDe(d.id)}` : `Ton bus de ${d.heure} part dans ${delai(Math.round((departMs - h.ms) / 60_000))}`) + (margeRoute >= 0 ? ` · tu as ${margeRoute} min de marge.` : ' · tu risques de le rater : dis-le au quai.') : `Tu es à la gare. Montre ton billet au quai ${quaiDe(d.id)}.`);

  function commander() {
    if (!moi || !d) return; erreur = '';
    try { commanderCourse({ personneId: moi.id, departId: d.id, mode, quartier, moyen }); montrer(`${NOM_MODE[mode]} commandée · ${fmtF(prix)}`); }
    catch (e) { const m = e instanceof Error ? e.message : ''; erreur = m === 'solde_insuffisant' ? `Cagnotte insuffisante : il manque ${fmtF(prix - solde)}.` : m === 'depart_ferme' ? 'Ce bus est déjà parti.' : m === 'course_en_cours' ? 'Tu as déjà une course en cours.' : 'Commande impossible pour le moment.'; }
  }
  function suivante() { if (c) avancerCourse(c.id); }
  function actionPrincipale() {
    if (!c) return;
    if (c.etape === 1) { avancerCourse(c.id); return; }
    aller(billet ? `/pass?billet=${billet.id}` : '/pass');
  }
  function annuler() { if (c) { try { annulerCourse(c.id); montrer('Course annulée, rien à payer'); } catch { montrer('La course a commencé : elle ne peut plus être annulée gratuitement.', 'wa'); } } }
</script>

<Mobile titre={c ? etape.titre.replace('{mode}', NOM_MODE[c.mode]) : 'Moto ou taxi'} sous={c ? `${c.quartier} → ${gareTxt} · pour le bus de ${d?.heure ?? ''}` : d ? `Vers la ${gareTxt} · pour le bus de ${d.heure}` : 'Vers la gare'} retourVers="/" dock={dockVoyageur('voyager')}>
  {#snippet droite()}{#if c}<span class="pl {etape.ton}"><span class="dot"></span>{etape.pill}</span>{/if}{/snippet}

  {#if c && d && ligne}
    <Relief label="Carte en relief : {c.mode === 'moto' ? 'la moto' : 'le taxi'} arrive. Étape {c.etape + 1} sur 4." bind:az hauteur={230} echelle={1.1}>
      <svg class="rl-plat" viewBox="0 0 360 240" aria-hidden="true"><path d="M118 140 C 160 120, 200 120, 292 56" fill="none" stroke="rgba(61,224,255,.5)" stroke-width="3" stroke-dasharray="6 7" stroke-linecap="round" /></svg>
      <span class="moi rl-pied" style="left: 112px; top: 148px" role="img" aria-label="Toi"><span class="orb pt"></span></span>
      <span class="tag rl-pied" style="left: 292px; top: 38px">{gareTxt}</span>
      <div class="mk rl-pied" style="left: {POS[c.etape].x}px; top: {POS[c.etape].y}px" role="img" aria-label={c.mode === 'moto' ? 'Moto' : 'Taxi'}><span class="orb"><Icone nom={c.mode} taille={22} trait={2.2} /></span></div>
    </Relief>
    <div class="gl hl row g12">
      <span class="av hot">{cond.initiales}</span>
      <span class="col grow"><span class="t16 b7 ell">{cond.nom} · {cond.societe}</span><span class="t13 mut">★ {String(cond.note).replace('.', ',')} · {cond.courses.toLocaleString('fr-FR').replace(/[  ]/g, ' ')} courses{c.mode === 'moto' ? ' · casque pour toi' : ''}</span></span>
      <span class="plate">{cond.plaque}</span>
    </div>
    <div class="row g8">
      <div class="gl grow col g4"><span class="lab">{k1[0]}</span><span class="ttl t20 nw">{k1[1]}</span></div>
      <div class="gl grow col g4"><span class="lab">Prix</span><span class="ttl t20 nw">{fmtF(c.prix)}</span></div>
      <div class="gl grow col g4"><span class="lab">{c.moyen === 'especes' ? 'À payer' : 'Payé'}</span><span class="ttl t18" class:okc={c.moyen !== 'especes'}>{c.moyen === 'momo' ? 'MoMo' : c.moyen === 'cagnotte' ? 'Cagnotte' : 'Espèces'}</span></div>
    </div>
    <div class="toast" role="status"><span class="bub aq"><Icone nom="horloge" taille={18} /></span><span class="t13 grow">{msg}</span></div>
    <div class="row g8">
      {#if c.statut === 'en_cours'}<button type="button" class="b s" onclick={suivante}>Simuler l’étape suivante</button>{/if}
      <a class="ib" href="/litige" use:nav aria-label="Appeler le chauffeur"><Icone nom="info" taille={20} /></a>
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
    <a class="b p" href="/" use:nav>Voir les départs</a>
  {:else if parti}
    <div class="center">
      <div class="ill er" aria-hidden="true"><Icone nom="alerte" taille={64} trait={1.6} /></div>
      <span class="ttl t20">{d.statut === 'annule' ? 'Départ annulé' : 'Ce bus est déjà parti'}</span><span class="t14 mut">{compagnieDe(d).nom} · {ligne.de} → {ligne.vers} · {d.heure}. Choisis un autre départ.</span>
    </div>
    <a class="b p" href="/" use:nav>Voir les départs</a>
  {:else}
    {#if derniere && derniere.statut !== 'en_cours'}
      <div class="gl row g12"><span class="bub" class:aq={derniere.statut === 'terminee'}><Icone nom={derniere.statut === 'terminee' ? 'ok' : 'fermer'} taille={18} /></span><span class="t13 grow">Dernière course : {derniere.statut === 'terminee' ? 'terminée' : 'annulée'} · {derniere.quartier} → gare · {fmtF(derniere.prix)}</span></div>
    {/if}
    <div class="seg2" role="group" aria-label="Véhicule">
      {#each MODES as m (m)}<button type="button" class:on={mode === m} aria-pressed={mode === m} onclick={() => (mode = m)}>{NOM_MODE[m]} · {fmtF(prixCourse(m, km))}</button>{/each}
    </div>
    <span class="lab" id="quartier-lab">Je pars de</span>
    <div class="chips" role="group" aria-labelledby="quartier-lab">
      {#each QUARTIERS as q (q.nom)}<button type="button" class="ch" class:on={quartier === q.nom} aria-pressed={quartier === q.nom} onclick={() => (quartier = q.nom)}>{q.nom}</button>{/each}
    </div>
    <div class="row g8">
      <div class="gl grow col g4"><span class="lab">Arrive dans</span><span class="ttl t20 nw">{attenteMin(mode)} min</span></div>
      <div class="gl grow col g4"><span class="lab">Trajet</span><span class="ttl t20 nw">{trajetMin(mode, km)} min</span></div>
      <div class="gl grow col g4"><span class="lab">Prix</span><span class="ttl t20 nw">{fmtF(prix)}</span></div>
    </div>
    <div class="gl row g12">
      <span class="bub aq"><Icone nom="pin" taille={18} /></span>
      <span class="col grow"><span class="t14 b7">{quartier} → {gareTxt}</span><span class="t12 mut">Bus {compagnieDe(d).abrev} de {d.heure}{d.retardMin > 0 ? ` (+${d.retardMin} min)` : ''} · {km} km</span></span>
    </div>
    {#if margeMin < 0}
      <div class="gl row g12" role="alert" style="border-color: rgba(255,107,107,.5)"><span class="t13 erc grow">Trop tard pour ce bus : tu arriverais {-margeMin} min après le départ. Choisis la moto, plus rapide, ou un autre départ.</span></div>
    {:else if margeMin < MARGE_MINI}
      <div class="gl row g12" role="alert" style="border-color: rgba(255,194,75,.5)"><span class="t13 wac grow">Juste : tu arriverais {margeMin} min avant le départ. La moto est plus sûre.</span></div>
    {:else if tropTot}
      <div class="gl row g12"><span class="t13 grow">Le bus part dans {delai(Math.round((departMs - h.ms) / 60_000))}. Commande plutôt vers <b>{recommandee}</b> pour arriver 25 min avant.</span></div>
    {:else}
      <div class="toast"><span class="bub aq"><Icone nom="horloge" taille={18} /></span><span class="t13 grow">Tu arriverais à la gare avec {margeMin} min de marge.</span></div>
    {/if}
    <span class="lab" id="moyen-lab">Paiement</span>
    <div class="seg2" role="group" aria-labelledby="moyen-lab">
      {#each MOYENS_COURSE as m (m)}<button type="button" class:on={moyen === m} aria-pressed={moyen === m} onclick={() => (moyen = m)}>{m === 'cagnotte' ? 'Cagnotte' : NOM_MOYEN[m]}</button>{/each}
    </div>
    {#if moyen === 'cagnotte'}<span class="t12 {soldeKo ? 'erc' : 'mut'}" role={soldeKo ? 'alert' : undefined}>Cagnotte : {fmtF(solde)}{soldeKo ? ` · il manque ${fmtF(prix - solde)}` : ''}</span>
    {:else if moyen === 'especes'}<span class="t12 mut">À régler au conducteur à l’arrivée.</span>{/if}
    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" onclick={commander} disabled={soldeKo || margeMin < 0}>Commander · {fmtF(prix)}</button>
      <span class="t12 mut3 c">Annulation gratuite avant l’arrivée du véhicule.</span>
    </div>
  {/if}
</Mobile>

<style>
  .chips { flex: none; }
  .tag { padding: 4px 8px; border-radius: 999px; background: rgba(5, 7, 13, 0.85); border: 1px solid rgba(255, 255, 255, 0.2); font: 600 11px 'Geist Mono', monospace; white-space: nowrap; margin-top: -6px; }
  .mk { padding: 12px; margin-top: 10px; }
  .moi { padding: 12px; margin-top: 12px; }
  .orb { width: 46px; height: 46px; border-radius: 50%; display: grid; place-items: center; color: #06080f; background: linear-gradient(135deg, #8b7cff, #3de0ff); box-shadow: 0 0 0 8px rgba(61, 224, 255, 0.15); }
  .orb.pt { width: 22px; height: 22px; background: #ff5bde; box-shadow: 0 0 0 8px rgba(255, 91, 222, 0.2); }
  .plate { font: 700 14px 'Geist Mono', monospace; padding: 4px 8px; border-radius: 8px; background: #f2f4ff; color: #06080f; white-space: nowrap; }
  .nw { white-space: nowrap; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
