<script lang="ts">
  import { onDestroy } from 'svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { fcfa, court, lireMontant } from '../../core/money.ts';
  import { codeCarte, secondesRestantesCode } from '../../core/sante.ts';
  import { PARTENAIRES, QR_DEMO, controlerSolde, extraireCode, trouverPartenaire, type Partenaire } from '../../core/paiement.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Panneau from './Panneau.svelte';
  import Pict from './Pict.svelte';
  import { facturesAPayer } from './etat.ts';
  import { preparerEnvoi, preparerPaiementLibre } from './actions.ts';

  type Phase = 'attente' | 'lecture' | 'trouve';
  const ONGLETS = ['Scanner', 'Ma carte', 'Envoyer'] as const;
  let mode = $state(0), phase = $state<Phase>('attente'), partenaire = $state<Partenaire | null>(null), message = $state('');
  let lampe = $state(false), camera = $state<'inactive' | 'active' | 'refusee' | 'indisponible'>('inactive');
  let codeOuvert = $state(false), code = $state(''), erreurCode = $state('');
  let video = $state<HTMLVideoElement>();
  let montantLibre = $state(''), erreurMontant = $state('');
  let contact = $state(0), montantEnvoi = $state(10_000), envoiLibre = $state('');
  let maintenantMs = $state(maintenant());

  // ------------------------------------------------------------ caméra et lecture réelle (BarcodeDetector)
  interface Detecteur { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
  const BD = (globalThis as { BarcodeDetector?: new (o?: { formats: string[] }) => Detecteur }).BarcodeDetector;
  let flux: MediaStream | null = null, boucle: ReturnType<typeof setInterval> | undefined, delai: ReturnType<typeof setTimeout> | undefined;

  function arreterCamera() {
    clearInterval(boucle); boucle = undefined;
    flux?.getTracks().forEach((t) => t.stop()); flux = null; lampe = false;
    if (camera === 'active') camera = 'inactive';
  }
  async function demarrerCamera() {
    if (!BD || !navigator.mediaDevices?.getUserMedia) { camera = 'indisponible'; return; }
    try {
      const f = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      if (mode !== 0) { f.getTracks().forEach((t) => t.stop()); return; }
      flux = f; camera = 'active';
      queueMicrotask(async () => { if (video) { video.srcObject = f; try { await video.play(); } catch { /* lecture automatique refusée */ } } });
      const d = new BD({ formats: ['qr_code'] });
      boucle = setInterval(async () => {
        if (!video || video.readyState < 2 || phase === 'trouve') return;
        try { const r = await d.detect(video); if (r[0]) lire(r[0].rawValue); } catch { /* image illisible, on réessaie */ }
      }, 300);
    } catch { camera = 'refusee'; }
  }
  $effect(() => {
    if (mode !== 0) return;
    demarrerCamera();
    return arreterCamera;
  });
  async function basculerLampe() {
    const piste = flux?.getVideoTracks()[0];
    const caps = piste?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
    if (!piste || !caps?.torch) { montrer('Lampe indisponible sur cet appareil', 'danger'); return; }
    try { await piste.applyConstraints({ advanced: [{ torch: !lampe } as MediaTrackConstraintSet] }); lampe = !lampe; } catch { montrer('Lampe indisponible', 'danger'); }
  }

  // ------------------------------------------------------------ résultat d'une lecture (caméra, collage, saisie, démonstration)
  function lire(texte: string): boolean {
    const p = trouverPartenaire(texte);
    if (!p) { message = extraireCode(texte) ? `Code ${extraireCode(texte)} inconnu.` : "Ce QR n'est pas un code AssureMe."; phase = 'attente'; return false; }
    message = ''; partenaire = p; phase = 'trouve'; montantLibre = ''; erreurMontant = '';
    return true;
  }
  function simuler() {
    if (phase === 'lecture') return;
    phase = 'lecture'; message = '';
    delai = setTimeout(() => lire(QR_DEMO), 1200);
  }
  function valider() {
    if (!code.trim()) { erreurCode = 'Entrez le code du partenaire.'; return; }
    if (!lire(code)) { erreurCode = message; return; }
    codeOuvert = false; code = ''; erreurCode = ''; mode = 0;
  }
  async function coller() {
    try { code = await navigator.clipboard.readText(); erreurCode = ''; } catch { erreurCode = 'Collage indisponible : saisissez le code.'; }
  }
  const factureDuPartenaire = $derived(partenaire ? facturesAPayer().find((f) => (f.code && f.code === partenaire!.code) || f.partenaire === partenaire!.nom) : undefined);
  const montantLu = $derived(lireMontant(montantLibre));
  function payerLibre() {
    if (!partenaire || !montantLu || montantLu < 100) { erreurMontant = 'Entrez le montant demandé à la caisse (100 FCFA minimum).'; return; }
    const c = controlerSolde(app.solde, montantLu);
    if (!c.ok) { erreurMontant = `Solde insuffisant : il vous manque ${fcfa(c.manque)} FCFA.`; return; }
    preparerPaiementLibre(partenaire, montantLu); aller('/pay/confirme');
  }

  // ------------------------------------------------------------ ma carte
  const carte = $derived(app.compte ? codeCarte(app.compte.numeroMembre, maintenantMs) : '');
  const restant = $derived(secondesRestantesCode(maintenantMs));
  $effect(() => { if (mode !== 1) return; maintenantMs = maintenant(); const t = setInterval(() => (maintenantMs = maintenant()), 1000); return () => clearInterval(t); });
  const numeroMasque = $derived(app.compte ? `AM ···· ${app.compte.numeroMembre.slice(-4)}` : '');
  async function copierNumero() {
    try { await navigator.clipboard.writeText(app.compte?.numeroMembre ?? ''); montrer(`Numéro ${numeroMasque} copié`); } catch { montrer('Copie impossible', 'danger'); }
  }

  // ------------------------------------------------------------ envoi entre membres
  const CONTACTS = [{ nom: 'Maman', ini: 'MA' }, { nom: 'Paul', ini: 'PA' }, { nom: 'Junior', ini: 'JU' }];
  const MONTANTS_ENVOI = [5000, 10_000, 25_000, 50_000];
  const montantE = $derived(envoiLibre.trim() ? lireMontant(envoiLibre) : montantEnvoi);
  const apres = $derived(app.solde - (montantE ?? 0));
  const peutEnvoyer = $derived(!!montantE && montantE > 0 && apres >= 0);
  function envoyer() {
    if (!montantE || montantE <= 0 || apres < 0) return;
    preparerEnvoi(CONTACTS[contact].nom, CONTACTS[contact].ini, montantE); aller('/pay/confirme');
  }
  onDestroy(() => { clearTimeout(delai); arreterCamera(); });
  const surTab = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') mode = (mode + 1) % 3; else if (e.key === 'ArrowLeft') mode = (mode + 2) % 3;
  };
</script>

<div class="scan">
  <header>
    <a class="rond" href="/" aria-label="Fermer" onclick={(e) => { e.preventDefault(); aller('/'); }}><Icone nom="fermer" taille={18} trait={2.2} /></a>
    <h1>Payer</h1>
    <button type="button" class="rond" class:on={lampe} onclick={basculerLampe} aria-pressed={lampe} aria-label="Lampe"><Pict nom="lampe" taille={18} /></button>
  </header>
  <div class="onglets" role="tablist" aria-label="Mode de paiement" tabindex="-1" onkeydown={surTab}>
    {#each ONGLETS as o, i (o)}<button type="button" role="tab" id="t{i}" aria-selected={mode === i} aria-controls="p{i}" tabindex={mode === i ? 0 : -1} class:on={mode === i} onclick={() => (mode = i)}>{o}</button>{/each}
  </div>

  {#if mode === 0}
    <div class="zone" id="p0" role="tabpanel" aria-labelledby="t0">
      <div class="viseur" class:trouve={phase === 'trouve'}>
        {#if camera === 'active'}<!-- svelte-ignore a11y_media_has_caption --><video bind:this={video} playsinline muted aria-label="Flux de la caméra"></video>{/if}
        <span class="coin hg"></span><span class="coin hd"></span><span class="coin bg"></span><span class="coin bd"></span>
        {#if phase === 'lecture'}<span class="laser" aria-hidden="true"></span>{/if}
      </div>
      {#if phase === 'trouve' && partenaire}
        <div class="resultat" role="status">
          <span class="ini">{partenaire.ini}</span>
          <span class="tx"><b>{partenaire.nom}</b><small>{partenaire.mode === 'facture' ? 'Partenaire tiers payant' : 'Partenaire'} · {partenaire.lieu}</small></span>
          <span class="det mono">DÉTECTÉ</span>
        </div>
        {#if factureDuPartenaire}
          <Bouton href="/pay/facture?id={encodeURIComponent(factureDuPartenaire.id)}">Voir la facture <Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
        {:else if partenaire.mode === 'facture'}
          <p class="aucune muted" role="status">Aucune facture en attente chez ce partenaire. Demandez à la caisse d'émettre la facture, elle apparaîtra ici.</p>
        {:else}
          <Champ etiquette="Montant demandé à la caisse" inputmode="numeric" placeholder="Ex. 4 500" suffixe="FCFA" bind:valeur={montantLibre} erreur={erreurMontant} oninput={() => (erreurMontant = '')} />
          <Bouton onclick={payerLibre} desactive={!montantLu}>Payer {montantLu ? fcfa(montantLu) : ''}</Bouton>
        {/if}
        <button type="button" class="lien" onclick={() => { phase = 'attente'; partenaire = null; }}>Scanner un autre code</button>
      {:else}
        <div class="attente" role="status">
          <b>{phase === 'lecture' ? 'Lecture du QR…' : message || "En attente d'un QR"}</b>
          <small>{phase === 'lecture' ? 'Ne bougez pas, 1 seconde.' : camera === 'active' ? 'Cadrez le code affiché à la caisse du partenaire.' : camera === 'refusee' ? "Caméra refusée : autorisez-la dans les réglages, ou saisissez le code ci-dessous." : "Caméra ou lecture QR indisponible sur cet appareil : saisissez le code du partenaire."}</small>
        </div>
        <Bouton variante="secondaire" onclick={simuler} desactive={phase === 'lecture'}>{phase === 'lecture' ? 'Lecture…' : 'QR de démonstration'}</Bouton>
        <button type="button" class="pasqr" onclick={() => { codeOuvert = true; erreurCode = ''; }}><span>Pas de QR ?</span><b>Entrer le code du partenaire</b></button>
      {/if}
    </div>
  {:else if mode === 1}
    <div class="zone" id="p1" role="tabpanel" aria-labelledby="t1">
      {#if app.compte}
        <div class="cartem">
          <span class="mono lib">CARTE ASSUREME</span>
          <b class="nom">{app.compte.prenom} {app.compte.nom}</b><span class="mono num">{numeroMasque}</span>
          <div class="code mono" aria-live="off" data-testid="code-carte">{carte.slice(0, 3)} {carte.slice(3)}</div>
          <div class="compte"><i style:width="{(restant / 30) * 100}%"></i></div>
          <small>Expire dans {restant} s</small>
        </div>
        <p class="muted centre">Présentez ce code à la caisse d'un partenaire. Il change toutes les 30 secondes.</p>
        <Bouton variante="secondaire" onclick={copierNumero}><Pict nom="copier" taille={18} />Copier mon numéro</Bouton>
      {:else}<p class="muted centre">Votre carte sera disponible une fois le compte créé.</p>{/if}
    </div>
  {:else}
    <div class="zone" id="p2" role="tabpanel" aria-labelledby="t2">
      <span class="mono lib2">À QUI ?</span>
      <div class="contacts" role="radiogroup" aria-label="Destinataire">
        {#each CONTACTS as c, i (c.nom)}<button type="button" role="radio" aria-checked={contact === i} class:on={contact === i} onclick={() => (contact = i)}><span class="av">{c.ini}</span>{c.nom}</button>{/each}
      </div>
      <span class="mono lib2">MONTANT</span>
      <div class="montants" role="group" aria-label="Montant à envoyer">
        {#each MONTANTS_ENVOI as v (v)}<button type="button" class:on={!envoiLibre.trim() && montantEnvoi === v} aria-pressed={!envoiLibre.trim() && montantEnvoi === v} onclick={() => { montantEnvoi = v; envoiLibre = ''; }}>{court(v)}</button>{/each}
      </div>
      <Champ etiquette="Autre montant" inputmode="numeric" placeholder="Ex. 15 000" suffixe="FCFA" bind:valeur={envoiLibre} />
      <p class="muted note">Envoi gratuit entre membres AssureMe, reçu en moins de 5 secondes. Solde après envoi : <b class="mono" class:neg={apres < 0}>{fcfa(Math.max(apres, 0))}</b>.</p>
      {#if apres < 0}<p class="alerte" role="alert">Solde insuffisant : il vous manque {fcfa(-apres)} FCFA. <a href="/?recharger=1&manque={-apres}" onclick={(e) => { e.preventDefault(); aller(`/?recharger=1&manque=${-apres}`); }}>Recharger</a></p>{/if}
      <Bouton onclick={envoyer} desactive={!peutEnvoyer}>Envoyer {montantE ? fcfa(montantE) : ''} à {CONTACTS[contact].nom}</Bouton>
    </div>
  {/if}
</div>

<Panneau bind:ouverte={codeOuvert} titre="Code du partenaire">
  <p class="muted">Le code est affiché à la caisse, sous le QR. Exemple : CLP-0425. Vous pouvez aussi coller le contenu du QR.</p>
  <Champ etiquette="Code" placeholder="CLP-0425" bind:valeur={code} erreur={erreurCode} oninput={() => (erreurCode = '')} autofocus />
  <div class="rapide">
    {#each PARTENAIRES as p (p.code)}<button type="button" onclick={() => { code = p.code; erreurCode = ''; }}>{p.code}</button>{/each}
    <button type="button" onclick={coller}>Coller</button>
  </div>
  <div class="pied"><Bouton variante="secondaire" onclick={() => (codeOuvert = false)}>Annuler</Bouton><Bouton onclick={valider}>Valider le code</Bouton></div>
</Panneau>

<style>
  .scan { min-height: 100dvh; display: flex; flex-direction: column; gap: 14px; padding: calc(env(safe-area-inset-top) + 12px) 20px 28px; background: radial-gradient(circle at 50% 28%, rgba(48, 80, 255, 0.22), transparent 55%), var(--fond); }
  header { display: grid; grid-template-columns: 44px 1fr 44px; align-items: center; } h1 { text-align: center; font-size: 17px; font-weight: 650; }
  .rond { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; } .rond.on { background: #fff; color: #0b0f1a; }
  .onglets { display: flex; gap: 8px; justify-content: center; } .onglets button { min-height: 44px; padding: 0 18px; border-radius: 22px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); font-weight: 500; font-size: 14px; }
  .onglets button.on { background: var(--primaire); border-color: var(--primaire); color: #fff; font-weight: 600; }
  .zone { display: flex; flex-direction: column; gap: 14px; flex: 1; }
  .viseur { position: relative; align-self: center; width: min(78vw, 300px); aspect-ratio: 1; border-radius: 28px; background: rgba(15, 20, 34, 0.6); overflow: hidden; box-shadow: 0 0 80px -10px rgba(48, 80, 255, 0.5); }
  video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
  .coin { position: absolute; width: 38px; height: 38px; border: 4px solid var(--primaire-clair); } .trouve .coin { border-color: var(--bon); }
  .hg { top: 10px; left: 10px; border-right: 0; border-bottom: 0; border-top-left-radius: 16px; } .hd { top: 10px; right: 10px; border-left: 0; border-bottom: 0; border-top-right-radius: 16px; }
  .bg { bottom: 10px; left: 10px; border-right: 0; border-top: 0; border-bottom-left-radius: 16px; } .bd { bottom: 10px; right: 10px; border-left: 0; border-top: 0; border-bottom-right-radius: 16px; }
  .laser { position: absolute; left: 12%; right: 12%; height: 3px; background: var(--primaire-clair); box-shadow: 0 0 14px var(--primaire-clair); animation: balaye 1.2s ease-in-out infinite alternate; } @keyframes balaye { from { top: 14%; } to { top: 84%; } }
  .attente { text-align: center; display: flex; flex-direction: column; gap: 4px; } .attente b { font-size: 17px; } .attente small { color: var(--muted); font-size: 13.5px; }
  .resultat { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 16px; background: var(--carte); border: 1px solid var(--bon); }
  .ini { width: 40px; height: 40px; border-radius: 12px; background: var(--carte2); display: grid; place-items: center; font: 600 12px var(--mono); flex: none; }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; } .tx small { color: var(--muted); font-size: 12.5px; } .det { color: var(--bon); font-size: 10.5px; letter-spacing: 0.1em; }
  .aucune { font-size: 14px; text-align: center; padding: 6px 4px; }
  .lien { color: var(--primaire-clair); min-height: 44px; font-size: 14px; }
  .pasqr { min-height: 56px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); display: flex; justify-content: space-between; align-items: center; padding: 0 16px; font-size: 14px; color: var(--muted); } .pasqr b { color: var(--primaire-clair); font-weight: 600; }
  .cartem { border-radius: 24px; padding: 22px; display: flex; flex-direction: column; gap: 8px; background: linear-gradient(135deg, rgba(48, 80, 255, 0.55), #0f1733 70%); border: 1px solid rgba(124, 147, 255, 0.35); color: #f3f5fa; }
  .lib { font-size: 11px; letter-spacing: 0.14em; color: #c9d2ff; } .nom { font-size: 20px; } .num { color: #c9d2ff; font-size: 14px; }
  .code { font-size: 44px; font-weight: 500; letter-spacing: 0.08em; text-align: center; padding: 18px 0 10px; } .compte { height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.15); } .compte i { display: block; height: 100%; border-radius: 2px; background: var(--primaire-clair); transition: width 1s linear; }
  .cartem small { color: #c9d2ff; font-size: 12px; text-align: center; } .centre { text-align: center; font-size: 14px; }
  .lib2 { font-size: 10.5px; letter-spacing: 0.12em; color: var(--muted); }
  .contacts, .montants { display: grid; gap: 8px; } .contacts { grid-template-columns: repeat(3, 1fr); } .montants { grid-template-columns: repeat(4, 1fr); }
  .contacts button { min-height: 76px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; font-size: 13px; }
  .av { width: 34px; height: 34px; border-radius: 17px; background: var(--carte2); display: grid; place-items: center; font: 600 11px var(--mono); color: var(--doux); }
  .contacts .on { background: var(--primaire-fond); border-color: var(--primaire); } .contacts .on .av { background: var(--primaire); color: #fff; }
  .montants button { min-height: 48px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); font: 500 14px var(--mono); } .montants .on { background: var(--primaire-fond); border-color: var(--primaire); color: var(--texte); }
  .note { font-size: 13px; } .neg { color: var(--danger); } .alerte { color: var(--danger); font-size: 13.5px; } .alerte a { color: var(--primaire-clair); font-weight: 600; text-decoration: underline; padding: 8px 4px; }
  .rapide { display: flex; gap: 8px; flex-wrap: wrap; } .rapide button { min-height: 44px; padding: 0 14px; border-radius: 12px; background: var(--carte2); border: 1px solid var(--ligne); font: 500 13px var(--mono); }
  .pied { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; }
</style>
