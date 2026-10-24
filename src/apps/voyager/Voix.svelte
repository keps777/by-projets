<script lang="ts">
  import { onDestroy } from 'svelte';
  import { aller, retour } from '../../router.svelte.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { analyser, dansFenetre, libelleJour, NOM_PERIODE, VILLES } from '../../core/voix.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { gare } from '../../domain/actions.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { choisirJour, choisirTrajet, initRecherche } from './etat.ts';
  import { offresDuJour } from './offres.ts';

  /** « Dis où tu vas » : reconnaissance vocale (Web Speech API) quand le navigateur la propose, sinon saisie au clavier. La phrase est analysée par `core/voix.ts`. */
  const R = initRecherche();
  const SR = (typeof window !== 'undefined' ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition) : undefined) as (new () => any) | undefined;
  let ecoute = $state(false), phrase = $state(''), saisie = $state(''), ecrire = $state(!SR), erreur = $state('');
  let rec: any = null;

  const ref = aujourdhui();
  const comp = $derived(analyser(phrase, ref, VILLES));
  const horsLigne = $derived(app.session.hors_ligne);
  const de = $derived(comp.origine ?? (comp.destination === R.de ? R.vers : R.de));
  const vers = $derived(comp.destination ?? R.vers);
  const jour = $derived(comp.jour ?? R.jour);
  const ligne = $derived(app.monde.lignes.some((l) => l.actif && l.de === de && l.vers === vers));
  const fenetre = $derived(comp.fenetre);
  /** Les départs réels qui tombent dans la fenêtre dite. */
  const trouves = $derived(ligne ? offresDuJour(jour, de, vers).filter((o) => !fenetre || dansFenetre(o.heure, fenetre)).sort((a, b) => a.heure.localeCompare(b.heure)) : []);
  const gareNom = $derived(gare(app.monde.lignes.find((l) => l.de === de && l.vers === vers)?.gareVers ?? '')?.nom);
  const compris = $derived(!!phrase.trim() && !!comp.destination);
  const pastille = $derived(ecoute ? { t: 'j’écoute', c: 'er' } : compris ? { t: 'compris', c: 'ok' } : phrase.trim() ? { t: 'à reformuler', c: 'wa' } : { t: 'prêt', c: '' });
  const quand = $derived(`${libelleJour(jour, ref)}${comp.heure ? ` · ${comp.heure}` : comp.periode ? ` · ${NOM_PERIODE[comp.periode].replace(/^(le |l’|à l’|la |à )/, '')}` : ''}`);
  const quandSous = $derived(`${jourSemaineCourt(jour)}${fenetre ? ` · ${fenetre[0]} – ${fenetre[1] === '24:00' ? '00:00' : fenetre[1]}` : ' · toute la journée'}`);
  const resultat = $derived(!ligne ? `Aucune ligne ${de} → ${vers} pour le moment`
    : !trouves.length ? `Aucun départ ${fenetre ? 'dans ce créneau' : 'ce jour-là'}${fenetre ? ' · essaie une autre heure' : ''}`
    : `${trouves.length} départ${trouves.length > 1 ? 's' : ''}${fenetre ? ` entre ${trouves[0].heure} et ${trouves[trouves.length - 1].heure}` : ''}, dès ${fmtF(Math.min(...trouves.map((o) => o.prix)))}`);
  const peutContinuer = $derived(!phrase.trim() || (compris && ligne));
  const hint = $derived(erreur || (ecoute ? 'Parle en français, en anglais ou en pidgin · touche pour arrêter' : SR && !horsLigne ? 'Touche le micro pour reformuler' : 'Écris ta phrase ci-dessous, par exemple « Douala demain matin »'));

  function arreter() { try { rec?.stop(); } catch { /* déjà arrêtée */ } ecoute = false; }
  function parler() {
    if (ecoute) { arreter(); return; }
    erreur = '';
    if (!SR || horsLigne) { ecrire = true; erreur = horsLigne ? 'Hors ligne : la reconnaissance vocale a besoin d’internet. Écris ta phrase.' : 'Ton navigateur ne gère pas la voix. Écris ta phrase.'; return; }
    try {
      rec = new SR(); rec.lang = 'fr-FR'; rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
      rec.onresult = (e: any) => { phrase = Array.from(e.results as ArrayLike<any>).map((r) => r[0].transcript).join(' ').trim(); saisie = phrase; };
      rec.onerror = (e: any) => {
        ecoute = false; ecrire = true;
        erreur = e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'Le micro est refusé : autorise-le dans les réglages, ou écris ta phrase.'
          : e.error === 'no-speech' ? 'Je n’ai rien entendu. Réessaie, ou écris ta phrase.' : e.error === 'audio-capture' ? 'Aucun micro trouvé. Écris ta phrase.'
          : e.error === 'network' ? 'Pas de connexion pour la voix. Écris ta phrase.' : e.error === 'aborted' ? '' : 'La voix a échoué. Écris ta phrase.';
      };
      rec.onend = () => (ecoute = false);
      phrase = ''; saisie = ''; rec.start(); ecoute = true;
    } catch { ecoute = false; ecrire = true; erreur = 'Impossible de démarrer le micro. Écris ta phrase.'; }
  }
  onDestroy(() => { try { rec?.abort(); } catch { /* rien à arrêter */ } });

  /** Reporte ce qui a été compris dans la recherche partagée. */
  function appliquer() {
    if (!phrase.trim() || !comp.destination) return;
    choisirTrajet(R, de, vers);
    choisirJour(R, jour, fenetre ? (trouves.find((o) => o.heure >= fenetre[0])?.heure ?? trouves[0]?.heure ?? fenetre[0]) : null);
  }
  const continuer = () => { appliquer(); aller('/'); };
  const corriger = (e: MouseEvent, href: string) => { e.preventDefault(); appliquer(); aller(href); };
  const soumettre = (e: SubmitEvent) => { e.preventDefault(); phrase = saisie; };
</script>

{#snippet entete()}
  <header class="hd">
    <a class="ib" href="/" aria-label="Retour" onclick={(e) => { e.preventDefault(); retour('/'); }}><Icone nom="retour" /></a>
    <span class="ttl t18">Dis où tu vas</span>
    <span class="pl {pastille.c}" role="status">{pastille.t}</span>
  </header>
{/snippet}

<Mobile enteteLibre={entete} dock={dockVoyageur('voyager')}>
  <div class="gl ac boite">
    <div class="wave" class:still={!ecoute} aria-hidden="true">{#each Array(26) as _, i (i)}<i></i>{/each}</div>
    <p class="trans c" class:vide={!phrase} aria-live="polite">{phrase || (ecoute ? '…' : 'Ex. : « Je veux aller à Douala demain matin »')}</p>
  </div>
  <span class="lab">Ce que j’ai compris</span>
  <div class="bento">
    <a class="tile" href="/destination" onclick={(e) => corriger(e, '/destination')}><span class="lab">Destination</span><span class="t18 b7">{vers}</span><span class="t12 mut">{gareNom ? `Gare ${gareNom} · ` : ''}corriger</span></a>
    <a class="tile" href="/calendrier" onclick={(e) => corriger(e, '/calendrier')}><span class="lab">Quand</span><span class="t18 b7">{quand}</span><span class="t12 mut">{quandSous}</span></a>
    <div class="tile w2 ac" aria-live="polite"><span class="lab">Résultat</span><span class="t16 b7">{resultat}</span><span class="t12 mut">{trouves.length ? 'Le plus tôt sera en face dans le panorama' : de + ' → ' + vers}</span></div>
  </div>
  <button class="mic" class:on={ecoute} type="button" onclick={parler} aria-pressed={ecoute} aria-label={ecoute ? 'Arrêter l’écoute' : 'Parler'}><Icone nom="micro" taille={40} trait={2} /></button>
  <span class="t13 c" class:mut={!erreur} class:erc={!!erreur} role={erreur ? 'alert' : undefined}>{hint}</span>
  {#if ecrire}
    <form class="row g8" onsubmit={soumettre}>
      <label class="sr" for="phrase">Ta phrase</label>
      <input id="phrase" class="inp" type="text" autocomplete="off" placeholder="Douala demain matin" bind:value={saisie} oninput={() => (phrase = saisie)} />
      <button type="submit" class="b p sm" style="flex: none">Comprendre</button>
    </form>
  {/if}
  <div class="col g8" style="margin-top: auto">
    <button type="button" class="b p" disabled={!peutContinuer} onclick={continuer}>C’est ça, montre les départs</button>
    {#if phrase.trim() && !comp.destination}<p class="t12 wac c" role="status">Je n’ai pas trouvé de ville dans ta phrase. Essaie « Bafoussam demain matin ».</p>{/if}
    <button type="button" class="b s" aria-expanded={ecrire} onclick={() => (ecrire = !ecrire)}>{ecrire ? 'Cacher la saisie' : 'Écrire plutôt'}</button>
  </div>
</Mobile>

<style>
  .boite { min-height: 220px; display: flex; flex-direction: column; justify-content: center; gap: 10px; flex: none; }
  .wave { display: flex; align-items: center; justify-content: center; gap: 5px; height: 120px; }
  .wave i { width: 6px; border-radius: 3px; background: linear-gradient(180deg, #3de0ff, #8b7cff); animation: wv 1.1s ease-in-out infinite; height: 20px; }
  .wave i:nth-child(2n) { animation-delay: 0.15s; } .wave i:nth-child(3n) { animation-delay: 0.3s; background: linear-gradient(180deg, #ff5bde, #8b7cff); } .wave i:nth-child(5n) { animation-delay: 0.45s; }
  @keyframes wv { 0%, 100% { height: 18px; } 50% { height: 88px; } }
  .wave.still i { animation: none; height: 10px; opacity: 0.5; }
  .trans { font: 500 22px/1.3 'Sora Variable', 'Sora', sans-serif; margin: 0; overflow-wrap: anywhere; }
  .trans.vide { font-size: 16px; color: #8e99bb; }
  .mic { width: 96px; height: 96px; margin: 0 auto; border-radius: 50%; border: 0; display: grid; place-items: center; cursor: pointer; color: #06080f; background: conic-gradient(from 200deg, #8b7cff, #3de0ff, #ff5bde, #8b7cff); box-shadow: 0 20px 50px -16px rgba(124, 108, 255, 0.8); flex: none; }
  .mic.on { animation: pulse 1.6s infinite; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
</style>
