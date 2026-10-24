<script lang="ts">
  import { maintenant } from '../../data/store.svelte.ts';
  import { departEnMs, departParId, heureLocale, ligneDe, compagnieDe, personne, personneCourante } from '../../domain/actions.ts';
  import { jourSemaineLong, jourDe } from '../../core/dates.ts';
  import { distanceKm, prochainArret, quaiDe } from '../../core/arrets.ts';
  import { hhmm, minutes } from '../../core/retard.ts';
  import { estimer, minutesDepuisMinuit, OUVERTURE_MIN, phaseTrajet, texteIlot } from '../../core/suivi.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { nav } from './nav.ts';
  import { arretsDuDepart, billetASuivre } from './actions.ts';
  import Ilot from './Ilot.svelte';
  import { horloge } from './temps.svelte.ts';

  /** Écran verrouillé : îlot dynamique, notifications, activité en direct. « Avancer le temps » rejoue les trois moments du trajet (embarquement, en route, arrivée proche). */
  const h = horloge(10_000);
  let demo = $state<0 | 1 | 2 | null>(null);
  const moi = $derived(personneCourante());
  const billet = $derived(moi ? billetASuivre(moi.id, h.ms) : undefined);
  const d = $derived(billet ? departParId(billet.departId) : undefined);
  const ligne = $derived(d ? ligneDe(d) : undefined);
  const arrets = $derived(d ? arretsDuDepart(d) : []);
  const debut = $derived(d ? departEnMs(d) : 0), duree = $derived((ligne?.dureeMin ?? 0) * 60_000);
  const maint = $derived(demo === null || !d ? h.ms : demo === 0 ? debut - 32 * 60_000 : demo === 1 ? debut + duree * 0.48 : debut + duree - 6 * 60_000);
  const nowMin = $derived(d ? minutesDepuisMinuit(maint, d.jour) : 0);
  const est = $derived(d && ligne ? estimer(d.heure, ligne.dureeMin, d.retardMin, nowMin) : undefined);
  const minAvant = $derived(Math.round((debut - maint) / 60_000));
  const phase = $derived(est ? phaseTrajet(minAvant, est) : 'avant');
  const avancement = $derived(phase === 'arrive' ? 1 : phase === 'route' ? (est?.avancement ?? 0) : 0);
  const prochain = $derived(prochainArret(arrets, nowMin));
  const texte = $derived(est ? texteIlot(phase, minAvant, est.resteMin, prochain && prochain.arret.type === 'etape' ? { nom: prochain.arret.nom, dansMin: prochain.dansMin } : null) : '');
  const depMin = $derived(d ? minutes(d.heure) + d.retardMin : 0);
  const eta = $derived(phase === 'avant' || phase === 'embarquement' ? hhmm(depMin - OUVERTURE_MIN) : (est?.arrivee ?? ''));
  const dernierPasse = $derived([...arrets].reverse().find((a) => a.type === 'etape' && a.min <= nowMin));
  const km = $derived(ligne ? Math.round(distanceKm(ligne.de, ligne.vers) * avancement) : 0);
  const live = $derived(phase === 'route' ? (est && est.resteMin <= 10 && dernierPasse ? `${dernierPasse.nom} passé` : `${km} km${d && d.retardMin > 0 ? ` · +${d.retardMin} min` : ' · à l’heure'}`) : phase === 'arrive' ? 'arrivé' : 'au quai · 0 km');
  const notif = $derived(phase === 'route' ? (prochain && prochain.arret.type === 'etape' ? `Prochain arrêt : ${prochain.arret.nom} à ${prochain.arret.heure}.` : `Arrivée à ${arrets[arrets.length - 1]?.nom.split(' · ')[1] ?? ''} à ${est?.arrivee}.`) : phase === 'arrive' ? 'Ton bus est arrivé. Bon séjour !' : `Ton bus est au quai ${d ? quaiDe(d.id) : ''}. Embarquement dès ${hhmm(depMin - OUVERTURE_MIN)}.`);
  const proche = $derived(personne(moi?.prochesIds?.[0]));
  const horlogeTxt = $derived(heureLocale(maint)), dateTxt = $derived(jourSemaineLong(jourDe(new Date(maint))));
  const libelleDemo = $derived(demo === null ? 'Avancer le temps (démo)' : `Avancer le temps (démo · ${demo + 1}/3)`);

  async function activer() {
    if (typeof Notification === 'undefined') { montrer('Les notifications ne sont pas disponibles sur cet appareil.', 'wa'); return; }
    let perm: NotificationPermission = Notification.permission;
    if (perm === 'default') { try { perm = await Notification.requestPermission(); } catch { perm = 'denied'; } }
    if (perm !== 'granted') { montrer('Notifications refusées : active-les dans les autorisations.', 'wa'); return; }
    try { new Notification(`AfriMove · ${texte}`, { body: notif, tag: 'am-direct' }); } catch { /* l'appareil exige un service worker : on ignore */ }
    try { await (navigator as Navigator & { setAppBadge?: (n?: number) => Promise<void> }).setAppBadge?.(1); } catch { /* badge non pris en charge */ }
    montrer('Activité en direct activée');
  }
</script>

<div class="lock">
  {#if d && ligne && est}
    <Ilot compagnie={compagnieDe(d).nom} quai={quaiDe(d.id)} {texte} {eta} etendu={demo !== null || phase === 'route'} />
    <button type="button" class="b g sm" style="margin-top: 10px" onclick={() => (demo = demo === null ? 0 : demo === 2 ? null : ((demo + 1) as 1 | 2))}>{libelleDemo}</button>
    <div class="clock" aria-label="Heure {horlogeTxt}">{horlogeTxt}</div>
    <span class="t16 mut">{dateTxt}</span>
    <div class="col g8 cartes">
      <a class="notif" href="/direct" use:nav><span class="av sm">AM</span><span class="col grow"><span class="t13 b7">AfriMove · à l’instant</span><span class="t13 mut">{notif}</span></span></a>
      {#if proche}<a class="notif" href="/proche" use:nav><span class="av sm hot">{proche.prenom[0]}</span><span class="col grow"><span class="t13 b7">{proche.id === 'p-maman' ? 'Maman' : proche.prenom} · {hhmm(Math.max(0, nowMin - 16) % 1440)}</span><span class="t13 mut">Bon voyage ma fille, écris-moi en arrivant.</span></span></a>{/if}
    </div>
    <a class="live" href="/direct" use:nav aria-label="Activité en direct : {ligne.de} vers {ligne.vers}, {live}">
      <div class="row sp"><span class="t13 b7">{ligne.de} → {ligne.vers}</span><span class="pl ok"><span class="dot"></span>en direct</span></div>
      <div class="trk" aria-hidden="true"><i style="width: {Math.round(avancement * 100)}%"></i><b style="left: {Math.round(avancement * 100)}%"></b></div>
      <div class="row sp t12 mut"><span>{arrets[0].nom.split(' · ')[1]} · {arrets[0].heure}</span><span>{live}</span><span>{arrets[arrets.length - 1].nom.split(' · ')[1]} · {arrets[arrets.length - 1].heure}</span></div>
    </a>
    <div class="row g8 bas">
      <button type="button" class="b s sm grow" onclick={activer}>Activer l’activité en direct</button>
      <a class="b g sm" href="/direct" use:nav>Ouvrir le suivi</a>
    </div>
  {:else}
    <div class="center" style="margin-top: 80px">
      <span class="clock" style="margin: 0">{heureLocale(maintenant())}</span>
      <span class="ttl t20">Aucune activité en direct</span>
      <span class="t14 mut">L’îlot apparaît dès que tu as un billet valide.</span>
      <a class="b p" href="/" use:nav>Voir les départs</a>
    </div>
  {/if}
</div>

<style>
  .lock { position: relative; width: 100%; height: 100dvh; overflow-y: auto; color: #f2f4ff; display: flex; flex-direction: column; align-items: center; padding: max(14px, env(safe-area-inset-top)) 14px 20px; scrollbar-width: none;
    background: radial-gradient(60% 40% at 50% 0%, rgba(139, 124, 255, 0.5), transparent 60%), radial-gradient(60% 40% at 50% 100%, rgba(61, 224, 255, 0.35), transparent 60%), #05070d; }
  .clock { font: 300 92px/1 'Sora Variable', 'Sora', sans-serif; letter-spacing: -0.04em; margin-top: 34px; }
  .cartes { margin-top: 22px; width: min(350px, 100%); }
  .notif { width: 100%; padding: 12px 14px; border-radius: 22px; background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.14); backdrop-filter: blur(20px); display: flex; gap: 12px; align-items: center; text-decoration: none; color: inherit; min-height: 64px; }
  .live { margin-top: auto; margin-bottom: 14px; padding-top: 14px; width: min(350px, 100%); padding: 14px; border-radius: 26px; background: rgba(255, 255, 255, 0.12); border: 1px solid rgba(255, 255, 255, 0.18); backdrop-filter: blur(20px); display: flex; flex-direction: column; gap: 10px; text-decoration: none; color: inherit; }
  .bas { width: min(350px, 100%); margin-bottom: 8px; }
  .trk { position: relative; height: 10px; border-radius: 5px; background: rgba(255, 255, 255, 0.14); }
  .trk i { position: absolute; left: 0; top: 0; height: 100%; border-radius: 5px; background: linear-gradient(90deg, #8b7cff, #3de0ff); transition: width 0.4s; }
  .trk b { position: absolute; top: 50%; width: 22px; height: 22px; margin: -11px 0 0 -11px; border-radius: 50%; background: #3de0ff; box-shadow: 0 0 16px #3de0ff; transition: left 0.4s; }
</style>
