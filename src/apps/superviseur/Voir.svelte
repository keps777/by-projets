<script lang="ts">
  import { untrack } from 'svelte';
  import { app } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { annoncerRetard, billetParId, departParId, ligneDe, minutesAvant, personne, personneCourante } from '../../domain/actions.ts';
  import { departsGare } from '../../core/gare.ts';
  import { jourDe } from '../../core/dates.ts';
  import { fcfa, fcfaUnite } from '../../core/money.ts';
  import { MOTIFS_ANNULATION, MOTIFS_DEPART } from '../../core/supervision.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { annulerBilletDecide, annulerDepartDecide, refuserAnnulation } from './actions.ts';
  import { alertesGare, gareDuBillet, gareDuDepartId } from './alertes.ts';
  import { dockSuperviseur } from './dock.ts';
  import { gareSuivie, horloge } from './etat.svelte.ts';
  import Feuille from './Feuille.svelte';
  import { hhmm, va } from './nav.ts';

  const moi = $derived(personneCourante());
  const gareId = $derived(gareSuivie(moi, param('gare')));
  const now = $derived(horloge.t);
  const litige = $derived(app.monde.litiges.find((l) => l.id === param('litige')));
  const billet = $derived(billetParId(param('billet') ?? (litige?.objet.type === 'billet' ? litige.objet.id : '')));
  const depart = $derived(departParId(param('depart') ?? (litige?.objet.type === 'depart' ? litige.objet.id : '')));
  const mode = $derived(billet ? 'billet' : depart ? 'depart' : 'liste');
  const MOYEN: Record<string, string> = { momo: 'MoMo', om: 'Orange Money', carte: 'carte', visage: 'visage', especes: 'espèces', proche: 'proche' };

  let motif = $state(''), rembourserChoix = $state<boolean | null>(null), erreur = $state(''), confirmer = $state(false), refus = $state(false), code = $state(''), introuvable = $state('');

  // Changer de billet ou de départ (même écran, autre ?paramètre) repart d'une feuille blanche.
  $effect(() => { void billet?.id; void depart?.id; untrack(() => { motif = ''; rembourserChoix = null; erreur = ''; confirmer = false; refus = false; }); });

  // ----- billet
  const dB = $derived(billet ? departParId(billet.departId) : undefined);
  const permisB = $derived(!!billet && (moi?.role === 'patron' || gareDuBillet(app.monde, billet.id) === moi?.gareId));
  const partiB = $derived(!!dB && (dB.statut === 'parti' || dB.statut === 'arrive' || minutesAvant(dB) < 0));
  const rembourser = $derived(billet?.statut === 'scanne' ? false : rembourserChoix ?? !partiB);
  const demandeur = $derived(litige ? personne(litige.auteurId) : undefined);
  const acheteur = $derived(billet ? personne(billet.acheteurId) : undefined);
  const paiement = $derived(billet ? app.monde.paiements.find((p) => p.id === billet.paiementId) : undefined);
  const scans = $derived(billet ? app.monde.evenements.filter((e) => e.ref === billet.id && (e.type === 'scan' || e.type === 'scan_refuse')) : []);
  const dernierRefus = $derived(scans.find((e) => e.type === 'scan_refuse'));
  const closB = $derived(!!billet && (billet.statut === 'annule' || billet.statut === 'rembourse' || (!!litige && litige.statut === 'resolu')));
  const refusee = $derived(!!litige && litige.statut === 'resolu' && /refus/i.test(litige.reponse ?? '') && billet?.statut !== 'annule' && billet?.statut !== 'rembourse');
  const motifB = $derived(motif.trim() || litige?.texte || '');
  const sansRemb = $derived(billet?.statut === 'scanne' || !rembourser);

  function annulerB() {
    if (!moi || !billet) return;
    const r = annulerBilletDecide(moi.id, billet.id, { motif: motifB, rembourser });
    confirmer = false;
    if (r.ok) { erreur = ''; montrer(r.rembourse ? `Billet annulé · ${fcfaUnite(r.rembourse)} remboursés` : 'Billet annulé · place libérée'); } else erreur = r.erreur;
  }
  function refuserB() {
    if (!moi || !billet) return;
    const r = refuserAnnulation(moi.id, billet.id, motif.trim() ? `Annulation refusée · ${motif.trim()}` : 'Annulation refusée · copie bloquée');
    refus = false;
    if (r.ok) { erreur = ''; montrer('Annulation refusée · copie bloquée'); } else erreur = r.erreur;
  }

  // ----- départ
  const vueD = $derived(depart ? departsGare(app.monde, gareDuDepartId(app.monde, depart.id) ?? gareId, depart.jour, now).find((v) => v.id === depart.id) : undefined);
  const permisD = $derived(!!depart && (moi?.role === 'patron' || gareDuDepartId(app.monde, depart.id) === moi?.gareId));
  const billetsD = $derived(depart ? app.monde.billets.filter((b) => b.departId === depart.id && b.statut === 'valide') : []);
  const aRembourser = $derived(billetsD.reduce((s, b) => s + b.prix, 0));
  const annulables = $derived(!!depart && (depart.statut === 'prevu' || depart.statut === 'embarquement'));
  const rembourses = $derived(depart ? app.monde.billets.filter((b) => b.departId === depart.id && b.statut === 'rembourse').length : 0);
  function annulerD() {
    if (!moi || !depart) return;
    const r = annulerDepartDecide(moi.id, depart.id, motif.trim());
    confirmer = false;
    if (r.ok) { erreur = ''; montrer(`Départ annulé · ${r.rembourses} billet${r.rembourses > 1 ? 's' : ''} remboursé${r.rembourses > 1 ? 's' : ''}`); } else erreur = r.erreur;
  }
  function retard(min: number) { if (!moi || !depart) return; annoncerRetard(depart.id, min, moi.id); montrer(min ? `Retard de ${min} min annoncé aux voyageurs` : 'Départ remis à l’heure', 'wa'); }

  // ----- liste
  const aDecider = $derived(alertesGare(app.monde, gareId, now));
  const avenir = $derived(departsGare(app.monde, gareId, jourDe(new Date(now)), now).filter((d) => d.statut === 'prevu' || d.statut === 'embarquement'));
  function chercher(e: SubmitEvent) {
    e.preventDefault(); const c = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const b = app.monde.billets.find((x) => x.code === c && (moi?.role === 'patron' || gareDuBillet(app.monde, x.id) === moi?.gareId));
    if (b) { introuvable = ''; aller(`/superviseur/voir?billet=${b.id}`); } else introuvable = c ? `Aucun billet ${c} dans ta gare` : 'Saisis le code du billet';
  }
  const titre = $derived(mode === 'billet' ? 'Annuler un billet' : mode === 'depart' ? 'Décider d’un départ' : 'Décider une annulation');
  const sous = $derived(mode === 'billet' && dB ? (partiB ? 'après départ · pas de remboursement' : 'avant départ · remboursable') : '');
</script>

<Mobile {titre} {sous} retourVers="/superviseur" dock={dockSuperviseur('gare')}>
  {#snippet droite()}
    {#if mode === 'billet'}<span class="pl {closB ? (refusee ? 'ok' : 'inf') : 'wa'}">{closB ? (refusee ? 'refusée' : 'annulée') : 'à décider'}</span>
    {:else if mode === 'depart' && depart}<span class="pl {depart.statut === 'annule' ? 'er' : depart.statut === 'parti' ? 'inf' : depart.statut === 'embarquement' ? 'ac' : 'wa'}">{depart.statut === 'annule' ? 'annulé' : depart.statut === 'parti' ? 'parti' : depart.statut === 'arrive' ? 'arrivé' : depart.statut === 'embarquement' ? 'embarquement' : 'prévu'}</span>{/if}
  {/snippet}

  {#if mode === 'billet' && billet && dB}
    {@const l = ligneDe(dB)}
    <div class="gl col" style="gap: 0">
      <div class="li kv"><span class="t14">Billet</span><span class="mono b7">{billet.code}{billet.siege ? ` · ${billet.siege}` : ''}</span></div>
      <div class="li kv"><span class="t14">Départ</span><span class="t14 b7">{dB.heure} {l.de} → {l.vers}{dB.retardMin ? ` (+${dB.retardMin} min)` : ''}</span></div>
      <div class="li kv"><span class="t14">Acheté par</span><span class="t14 b7">{acheteur ? `${acheteur.prenom} ${acheteur.nom[0]}.` : billet.passager.nom} · {paiement ? MOYEN[paiement.moyen] : '—'} · {fcfaUnite(billet.prix)}</span></div>
      <div class="li kv"><span class="t14">Passager</span><span class="t14 b7">{billet.passager.nom}</span></div>
      {#if litige}<div class="li kv"><span class="t14">Demandé par</span><span class="t14 b7">{demandeur ? `${demandeur.prenom} · ${demandeur.role}` : '—'} · {hhmm(litige.ts)}</span></div>
        <div class="li kv"><span class="t14">Motif</span><span class="t14 b7">{litige.texte}</span></div>{/if}
    </div>
    <span class="lab">Preuves</span>
    <div class="row g8" style="align-items: stretch">
      <div class="gl grow col g4"><span class="lab">Scan</span><span class="t14 b7">{dernierRefus ? `refus ${hhmm(dernierRefus.ts)}` : scans[0] ? `scanné ${hhmm(scans[0].ts)}` : 'pas scanné'}</span><span class="t12 mut">{dernierRefus ? dernierRefus.texte.split(' · ')[0] : 'aucun refus'}</span></div>
      <div class="gl grow col g4"><span class="lab">Statut</span><span class="t14 b7">{billet.statut === 'valide' ? 'valide' : billet.statut === 'scanne' ? 'utilisé' : billet.statut === 'rembourse' ? 'remboursé' : billet.statut === 'annule' ? 'annulé' : billet.statut}</span><span class="t12 mut">{partiB ? 'bus parti' : `départ dans ${Math.max(0, minutesAvant(dB))} min`}</span></div>
      {#if billet.siege}<div class="gl grow col g4"><span class="lab">Siège {billet.siege}</span><span class="t14 b7">{billet.statut === 'valide' || billet.statut === 'scanne' ? 'occupé' : 'libre'}</span><span class="t12 mut ell">{billet.statut === 'valide' || billet.statut === 'scanne' ? `par ${billet.passager.nom.split(' ')[0]}` : 'libérée'}</span></div>{/if}
    </div>
    <div class="toast"><span class="bub aq"><Icone nom="info" taille={18} /></span><span class="t13 grow">{partiB ? 'Règle Bêta Express : pas de remboursement après départ. Une annulation ici sert seulement à libérer la place et à bloquer la copie.' : `Le bus n’est pas parti : l’annulation par la gare rembourse ${fcfaUnite(billet.prix)} au voyageur.`}</span></div>

    {#if !permisB}
      <div class="gl erc t14" role="alert">Ce billet n’est pas d’un départ de ta gare : tu ne peux pas décider ici.</div>
    {:else if closB}
      <div class="center" style="flex: none"><span class="ill ok"><Icone nom="ok" taille={60} trait={1.8} /></span>
        <span class="t16 b7">{litige?.reponse ?? (billet.statut === 'rembourse' ? 'Billet annulé et remboursé' : 'Billet annulé')}{billet.siege && !refusee ? ` · ${billet.siege} libérée` : ''}</span>
        <span class="t13 mut">{demandeur ? `${demandeur.prenom} et ` : ''}{acheteur?.prenom ?? 'le voyageur'} sont prévenus · journalisé</span></div>
      <div class="col g8" style="margin-top: auto"><a class="b p" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a></div>
    {:else}
      <div class="fld"><label class="lab" for="motif">Motif de ta décision</label>
        <div class="chips" role="group" aria-label="Motifs courants">{#each MOTIFS_ANNULATION.filter((m) => m !== 'Autre') as m (m)}<button type="button" class="ch" class:on={motif === m} aria-pressed={motif === m} onclick={() => (motif = m)}>{m}</button>{/each}</div>
        <input id="motif" class="inp" bind:value={motif} placeholder={litige?.texte ?? 'Écris le motif'} autocomplete="off" /></div>
      <div class="gl row sp"><span class="col"><span class="t14 b6">Rembourser le voyageur</span><span class="t12 mut">{billet.statut === 'scanne' ? 'billet déjà utilisé : pas de remboursement' : rembourser ? `${fcfaUnite(billet.prix)} renvoyés` : 'place libérée sans remboursement'}</span></span>
        <button type="button" class="sw" class:on={rembourser} role="switch" aria-checked={rembourser} aria-label="Rembourser le voyageur" disabled={billet.statut === 'scanne'} onclick={() => (rembourserChoix = !rembourser)}></button></div>
      {#if erreur}<div class="gl erc t13" role="alert">{erreur}</div>{/if}
      <div class="col g8" style="margin-top: auto">
        {#if litige}<button type="button" class="b p" onclick={() => (refus = true)}>Refuser l’annulation · bloquer la copie</button>{/if}
        <button type="button" class="b {litige ? 's' : 'p'}" disabled={!motifB} onclick={() => (confirmer = true)}>Annuler et libérer {billet.siege ?? 'la place'}</button>
        {#if !motifB}<span class="t12 mut c">Indique un motif pour annuler.</span>{/if}
      </div>
      <Feuille bind:ouvert={confirmer} titre="Annuler le billet {billet.code} ?" texte={sansRemb ? `La place ${billet.siege ?? ''} est libérée, sans remboursement.` : `${fcfaUnite(billet.prix)} sont remboursés à ${acheteur?.prenom ?? 'l’acheteur'}.`} confirmer="Annuler le billet" ton="d" onconfirmer={annulerB} />
      <Feuille bind:ouvert={refus} titre="Refuser l’annulation ?" texte="La demande est close. Le billet reste valide ; une copie sera refusée au scan." confirmer="Refuser" onconfirmer={refuserB} />
    {/if}

  {:else if mode === 'depart' && depart && vueD}
    <div class="gl col" style="gap: 0">
      <div class="li kv"><span class="t14">Départ</span><span class="mono b7">{vueD.heure} → {vueD.vers}</span></div>
      <div class="li kv"><span class="t14">Compagnie</span><span class="t14 b7">{vueD.compagnie}{vueD.classe === 'VIP' ? ' VIP' : ''}</span></div>
      <div class="li kv"><span class="t14">Retard</span><span class="t14 b7" class:wac={vueD.retardMin > 0}>{vueD.retardMin ? `+${vueD.retardMin} min → ${vueD.heureReelle}` : 'à l’heure'}</span></div>
      <div class="li kv"><span class="t14">À bord</span><span class="t14 b7 mono">{vueD.scannes} scannés · {vueD.occupes}/{vueD.capacite} places</span></div>
      <div class="li kv"><span class="t14">Billets à rembourser</span><span class="t14 b7 mono">{billetsD.length} · {fcfaUnite(aRembourser)}</span></div>
    </div>
    {#if !permisD}
      <div class="gl erc t14" role="alert">Ce départ n’est pas de ta gare.</div>
    {:else if depart.statut === 'annule'}
      <div class="center" style="flex: none"><span class="ill er"><Icone nom="fermer" taille={60} trait={1.8} /></span><span class="t16 b7">Départ annulé</span><span class="t13 mut">{rembourses} billet{rembourses > 1 ? 's' : ''} remboursé{rembourses > 1 ? 's' : ''} · voyageurs et équipe prévenus · journalisé</span></div>
      <div class="col g8" style="margin-top: auto"><a class="b p" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a></div>
    {:else if !annulables}
      <div class="toast"><span class="bub aq"><Icone nom="info" taille={18} /></span><span class="t13 grow">Le bus est {depart.statut === 'parti' ? 'parti' : 'arrivé'} : un départ ne s’annule plus. Annule plutôt les billets contestés un par un.</span></div>
      <div class="col g8" style="margin-top: auto"><a class="b p" href="/superviseur" onclick={va('/superviseur')}>Retour à la gare</a></div>
    {:else}
      <span class="lab">Annoncer un retard</span>
      <div class="chips" role="group" aria-label="Retard à annoncer">{#each [0, 15, 30, 45, 60] as m (m)}<button type="button" class="ch" class:on={depart.retardMin === m} aria-pressed={depart.retardMin === m} onclick={() => retard(m)}>{m === 0 ? 'À l’heure' : `+${m} min`}</button>{/each}</div>
      <div class="fld"><label class="lab" for="motif-d">Motif de l’annulation</label>
        <div class="chips" role="group" aria-label="Motifs courants">{#each MOTIFS_DEPART.filter((m) => m !== 'Autre') as m (m)}<button type="button" class="ch" class:on={motif === m} aria-pressed={motif === m} onclick={() => (motif = m)}>{m}</button>{/each}</div>
        <input id="motif-d" class="inp" bind:value={motif} placeholder="Écris le motif" autocomplete="off" /></div>
      {#if erreur}<div class="gl erc t13" role="alert">{erreur}</div>{/if}
      <div class="col g8" style="margin-top: auto">
        <button type="button" class="b d" disabled={!motif.trim()} onclick={() => (confirmer = true)}>Annuler le départ · rembourser {billetsD.length} billet{billetsD.length > 1 ? 's' : ''}</button>
        {#if !motif.trim()}<span class="t12 mut c">Indique un motif pour annuler.</span>{/if}
        <a class="b g" href="/superviseur" onclick={va('/superviseur')}>Maintenir le départ</a>
      </div>
      <Feuille bind:ouvert={confirmer} titre="Annuler le départ de {vueD.heure} ?" texte="{billetsD.length} billet{billetsD.length > 1 ? 's' : ''} remboursé{billetsD.length > 1 ? 's' : ''} ({fcfaUnite(aRembourser)}). Les voyageurs et l’équipe sont prévenus." confirmer="Annuler le départ" ton="d" onconfirmer={annulerD} />
    {/if}

  {:else}
    <span class="lab">À décider</span>
    <div class="gl col" style="gap: 0">
      {#each aDecider.filter((a) => a.genre !== 'caisse' && a.genre !== 'acces') as a (a.id)}
        <a class="al" href={a.href} onclick={va(a.href)}><span class="pl {a.ton}">{a.etiquette}</span><span class="col grow"><span class="t14 b7">{a.titre}</span><span class="t12 mut">{a.sous}</span></span><span class="t13 aq">décider</span></a>
      {:else}<div class="t13 mut c" style="padding: 12px 0">Aucune annulation ni retard à décider.</div>{/each}
    </div>
    <span class="lab">Annuler un billet</span>
    <form class="row g8" onsubmit={chercher}>
      <input class="inp grow" bind:value={code} placeholder="Code du billet (AM7F3K22)" aria-label="Code du billet" autocomplete="off" autocapitalize="characters" />
      <button type="submit" class="b p sm" style="flex: none">Chercher</button>
    </form>
    {#if introuvable}<span class="t13 erc" role="alert">{introuvable}</span>{/if}
    <span class="lab">Annuler un départ</span>
    <div class="gl col" style="gap: 0">
      {#each avenir as d (d.id)}
        <a class="li" href="/superviseur/voir?depart={d.id}" onclick={va(`/superviseur/voir?depart=${d.id}`)}><span class="mono b7" style="min-width: 54px">{d.heureReelle}</span><span class="col grow"><span class="t14 b7">{d.vers} · {d.compagnie}</span><span class="t12 mut">{d.occupes}/{d.capacite} billets</span></span><span class="t13 aq">décider</span></a>
      {:else}<div class="t13 mut c" style="padding: 12px 0">Plus de départ à venir aujourd’hui.</div>{/each}
    </div>
  {/if}
</Mobile>

<style>
  .kv { align-items: baseline; } .kv > :first-child { flex: none; } .kv > :last-child { flex: 1; text-align: right; overflow-wrap: anywhere; }
  .sw::before { content: ''; position: absolute; inset: -8px -4px; }
  .al { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-decoration: none; color: inherit; min-height: 56px; }
  .al:last-child { border: 0; }
  .b:disabled, .sw:disabled { opacity: 0.45; cursor: not-allowed; }
  .inp { outline: none; } .inp:focus { border-color: #3de0ff; }
</style>
