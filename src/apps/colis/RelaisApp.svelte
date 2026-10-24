<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { deconnecter, departParId } from '../../domain/actions.ts';
  import type { Colis } from '../../domain/types.ts';
  import { fcfa } from '../../core/money.ts';
  import { ageEnRayon, COMMISSION_RELAIS, DELAI_RETRAIT_JOURS, etatOuverture, formaterTel, libelleHoraires } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { acteur, arriveeDepart, colisAttendus, colisEnRayon, colisPourRemise, depuisRayon, gainsRelais, NOM_TAILLE, prenomDe, recevoirColis, remettreColis } from './actions.ts';
  import { boutiqueDe } from './etat.ts';
  import Pic from './Pic.svelte';

  const moi = $derived(acteur('relais'));
  const boutique = $derived(boutiqueDe(moi?.id));
  const ouverture = $derived(boutique ? etatOuverture(boutique, new Date(maintenant())) : undefined);
  const attendus = $derived(moi ? colisAttendus(moi.id) : []);
  const rayon = $derived(moi ? colisEnRayon(moi.id) : []);
  const gains = $derived(moi ? gainsRelais(moi.id) : undefined);
  const aRendre = $derived(rayon.filter((c) => ageEnRayon(depuisRayon(c), maintenant()).aRetourner).length);
  const retires = $derived(moi ? app.monde.colis.filter((c) => c.relaisId === moi.id && c.statut === 'livre').length : 0);
  const taux = $derived(retires + rayon.length ? Math.round((retires / (retires + rayon.length)) * 100) : null);

  const ONGLETS = ['Colis', 'Remettre', 'Gains'];
  let onglet = $state(0);

  // --- réception
  let saisie = $state(''), retour = $state<{ ok: boolean; message: string } | null>(null);
  function recevoir(code: string) {
    if (!moi) return;
    const r = recevoirColis(code, moi.id); retour = { ok: r.ok, message: r.message };
    if (r.ok) { saisie = ''; montrer(r.message); } else montrer(r.message, 'er');
  }

  // --- remise
  let code = $state(''), pieceVue = $state(false), choix = $state<string | null>(null), faux = $state(0), verrou = $state(false), message = $state(''), remis = $state<{ nom: string; gain: number; aEncaisser: number } | null>(null);
  const trouves = $derived<Colis[]>(moi && code.length === 4 ? colisPourRemise(moi.id, code) : []);
  const colis = $derived(trouves.find((c) => c.id === choix) ?? (trouves.length === 1 ? trouves[0] : undefined));
  function touche(d: string) {
    if (verrou || remis || code.length >= 4) return;
    code += d; message = ''; pieceVue = false; choix = null;
    if (code.length === 4 && moi && colisPourRemise(moi.id, code).length === 0) {
      faux++; message = faux >= 5 ? 'Trop d’essais : attends une minute avant de réessayer' : 'Code inconnu : aucun colis au relais pour ce code';
      if (faux >= 5) { verrou = true; setTimeout(() => { verrou = false; faux = 0; code = ''; message = ''; }, 60_000); }
    }
  }
  const effacer = () => { code = ''; pieceVue = false; choix = null; message = ''; remis = null; };
  function remettre() {
    if (!moi || !colis) return;
    const r = remettreColis(colis.id, code, moi.id, pieceVue);
    if (!r.ok) { message = r.message; montrer(r.message, 'er'); return; }
    remis = { nom: r.colis.destinataire.nom, gain: r.gain, aEncaisser: r.aEncaisser }; montrer(r.message);
  }
  function quitter() { deconnecter(); aller('/entree'); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const busDe = (c: Colis) => { const d = c.departId ? departParId(c.departId) : undefined; return d ? { pl: `bus ${d.heure}`, arrivee: arriveeDepart(d) } : { pl: c.statut === 'en_route' ? 'en route' : c.statut === 'depose' ? 'déposé' : 'à venir', arrivee: '' }; };
  const initiales = $derived(moi ? `${moi.prenom[0]}${moi.nom[0] ?? ''}` : '');
</script>

<Mobile>
  {#snippet enteteLibre()}
    <header class="hd">
      <div class="row g12" style="min-width: 0"><span class="av hot" aria-hidden="true">{initiales}</span><div class="col"><span class="ttl t16 ell">{boutique?.nom ?? 'Point relais'}</span><span class="t13 mut ell">Relais · {boutique?.adresse.split(',')[0] ?? 'Douala'}{ouverture ? ` · ${ouverture.libelle}` : ''}</span></div></div>
      <span class="pl ok" role="status"><span class="dot"></span>{rayon.length} à remettre</span>
    </header>
  {/snippet}

  {#if !moi?.actif}
    <div class="center">
      <span class="ill"><Pic nom="maison" taille={64} trait={1.5} /></span>
      <span class="ttl t18">Compte en attente de validation</span>
      <span class="t14 mut">Notre équipe vérifie ta fiche. Tu pourras recevoir des colis dès l’acceptation (réponse sous 48 h).</span>
      <button type="button" class="b s" onclick={quitter}>Changer de compte</button>
    </div>
  {:else}
    <div class="seg2" role="tablist" aria-label="Sections">
      {#each ONGLETS as t, i (t)}<button type="button" role="tab" id="ong-{i}" aria-selected={onglet === i} aria-controls="pan-{i}" class:on={onglet === i} onclick={() => (onglet = i)}>{t}</button>{/each}
    </div>

    {#if onglet === 0}
      <div role="tabpanel" id="pan-0" aria-labelledby="ong-0" class="col g12">
        <form class="gl ac col g8" onsubmit={(e) => { e.preventDefault(); recevoir(saisie); }}>
          <label class="lab" for="code-colis">Recevoir un colis · code AM-C-…</label>
          <div class="row g8"><input id="code-colis" class="inp mono" bind:value={saisie} placeholder="AM-C-9Q2" autocapitalize="characters" autocomplete="off" spellcheck="false" maxlength="12" aria-describedby="retour-recep" /><button type="submit" class="b p sm" disabled={!saisie.trim()}>Recevoir</button></div>
          <span id="retour-recep" class="t13 {retour ? (retour.ok ? 'okc' : 'erc') : 'mut'}" role="status">{retour?.message ?? 'Tape le code écrit sur l’étiquette ou touche « Réceptionner » ci-dessous.'}</span>
        </form>

        <span class="lab">Arrivent bientôt · {attendus.length}</span>
        <div class="gl col" style="gap: 0">
          {#each attendus as c (c.id)}
            {@const bus = busDe(c)}
            <div class="ligne"><span class="col grow"><span class="t14 b7">{c.code} · {NOM_TAILLE[c.taille]}</span><span class="t12 mut">pour {c.destinataire.nom} · {formaterTel(c.destinataire.tel)}{bus.arrivee ? ` · arrivée ${bus.arrivee}` : ''}{c.options.moto ? ' · moto' : ''}</span></span>
              <span class="col fin g6"><span class="pl inf">{bus.pl}</span>{#if c.statut !== 'cree'}<button type="button" class="b s sm" onclick={() => recevoir(c.code)} aria-label="Réceptionner le colis {c.code}">Réceptionner</button>{/if}</span></div>
          {:else}<div class="ligne"><span class="t13 mut">Aucun colis en route vers ton relais pour l’instant.</span></div>{/each}
        </div>

        <span class="lab">En rayon · {rayon.length}</span>
        <div class="gl col" style="gap: 0">
          {#each rayon as c (c.id)}
            {@const age = ageEnRayon(depuisRayon(c), maintenant())}
            <div class="ligne"><span class="pl {age.ton}">{age.pl}</span><span class="col grow"><span class="t14 b7">{c.code} · {NOM_TAILLE[c.taille]}</span><span class="t12 mut">{c.destinataire.nom}{c.options.moto ? ' · attend un livreur moto' : ' · prévenu par SMS'}{c.options.contreRemboursement ? ` · à encaisser ${fcfa(c.prix)} F` : ''}</span></span><span class="t12 mut3">{age.texte}</span></div>
          {:else}<div class="ligne"><span class="t13 mut">Rien en rayon : les colis reçus apparaissent ici.</span></div>{/each}
        </div>
        <div class="toast"><span class="bub aq"><Pic nom="info" taille={18} /></span><span class="t13 grow">Un colis non retiré après {DELAI_RETRAIT_JOURS} jours retourne à la gare{aRendre ? ` (${aRendre} à rendre)` : ''}. Tu es payé·e {COMMISSION_RELAIS} F par colis remis.</span></div>
      </div>

    {:else if onglet === 1}
      <div role="tabpanel" id="pan-1" aria-labelledby="ong-1" class="col g12">
        {#if remis}
          <div class="center" style="flex: none"><span class="ill ok"><Pic nom="ok" taille={60} trait={1.8} /></span><span class="t16 b7" role="status">Colis remis à {prenomDe(remis.nom)}</span><span class="t13 mut">+{fcfa(remis.gain)} F · versés lundi</span>
            {#if remis.aEncaisser}<span class="pl wa">Encaisse {fcfa(remis.aEncaisser)} F auprès de {prenomDe(remis.nom)}</span>{/if}</div>
          <button type="button" class="b s" onclick={effacer}>Colis suivant</button>
        {:else}
          <div class="gl ac"><span class="lab c" id="lab-code">Le client donne son code de retrait</span>
            <div class="otp" style="margin-top: 8px" role="img" aria-label="Code saisi : {code.length} chiffre{code.length > 1 ? 's' : ''} sur 4">{#each [0, 1, 2, 3] as i (i)}<span class:on={code.length === i}>{code[i] ?? ''}</span>{/each}</div>
            <span class="t13 c {message ? 'erc' : 'mut'}" style="display: block; margin-top: 8px" role="status">{message || (trouves.length === 1 ? `code reconnu · ${trouves[0].code}` : trouves.length > 1 ? 'plusieurs colis : choisis le bon' : 'tape les 4 chiffres (ex. 4819)')}</span></div>

          {#if trouves.length > 1}
            <div class="gl col" style="gap: 0" role="radiogroup" aria-label="Colis possibles">{#each trouves as c (c.id)}<button type="button" role="radio" aria-checked={choix === c.id} class="li choix" class:on={choix === c.id} onclick={() => (choix = c.id)}><span class="grow t14 b7">{c.code} · {NOM_TAILLE[c.taille]}</span><span class="t13 mut">{c.destinataire.nom}</span></button>{/each}</div>
          {/if}

          {#if colis}
            <div class="gl col" style="gap: 0">
              <div class="li"><span class="grow t14">Colis</span><span class="mono b7">{colis.code} · {NOM_TAILLE[colis.taille]}</span></div>
              <div class="li"><span class="grow t14">Pour</span><span class="t14 b7">{colis.destinataire.nom} · {formaterTel(colis.destinataire.tel)}</span></div>
              {#if colis.options.contreRemboursement}<div class="li"><span class="grow t14">À encaisser</span><span class="pl wa">{fcfa(colis.prix)} F</span></div>{/if}
              <div class="li"><button type="button" role="checkbox" aria-checked={pieceVue} aria-labelledby="l-piece" class="case" class:on={pieceVue} onclick={() => (pieceVue = !pieceVue)}>{#if pieceVue}<Pic nom="ok" taille={16} trait={3} />{/if}</button><span class="grow t14" id="l-piece">J’ai vu la pièce d’identité de {prenomDe(colis.destinataire.nom)} (visage ou CNI)</span></div>
            </div>
            <button type="button" class="b p" disabled={!pieceVue} onclick={remettre}>Remettre le colis · +{COMMISSION_RELAIS} F</button>
          {/if}

          {#if trouves.length === 0}
            <div class="pad" aria-label="Pavé numérique">
              {#each ['1', '2', '3', '4', '5', '6', '7', '8', '9'] as k (k)}<button type="button" onclick={() => touche(k)} disabled={verrou}>{k}</button>{/each}
              <button type="button" onclick={effacer} aria-label="Tout effacer">C</button><button type="button" onclick={() => touche('0')} disabled={verrou}>0</button><button type="button" onclick={() => { code = code.slice(0, -1); message = ''; }} aria-label="Effacer un chiffre">←</button>
            </div>
          {:else}<button type="button" class="b g" onclick={effacer}>Autre code</button>{/if}
        {/if}
        <a class="b g" href="/depot" onclick={(e) => lien(e, '/depot')}>Recevoir un dépôt (code client)</a>
      </div>

    {:else if gains}
      <div role="tabpanel" id="pan-2" aria-labelledby="ong-2" class="col g12">
        <div class="gl ac row sp"><span class="col"><span class="lab">Aujourd’hui</span><span class="big">{fcfa(gains.gainJour)} F</span><span class="t12 mut">{gains.nbJour} colis remis · {COMMISSION_RELAIS} F par colis</span></span>
          <span class="ringp" style="--p: {taux ?? 0}%" role="img" aria-label={taux === null ? 'Aucun colis encore' : `${taux} % des colis reçus ont été retirés`}><span class="t13 b7">{taux === null ? '—' : `${taux} %`}</span></span></div>
        <div class="gl row sp"><span class="col"><span class="lab">Cette semaine</span><span class="ttl t20">{fcfa(gains.gainSemaine)} F</span><span class="t12 mut">{gains.nbSemaine} colis remis · versé lundi sur MoMo</span></span></div>
        <div class="gl"><div class="row sp" style="margin-bottom: 8px"><span class="lab">Par jour · 7 derniers jours</span></div>
          <div class="spark" role="img" aria-label="Colis remis par jour : {gains.parJour.join(', ')}">{#each gains.parJour as n, i (i)}<i class:hi={i === 6} style="height: {Math.max(6, (n / Math.max(1, ...gains.parJour)) * 100)}%"></i>{/each}</div></div>
        <div class="gl col" style="gap: 0">
          <div class="li"><span class="grow t14">Note des clients</span><span class="t14 b7">{moi.note ? `★ ${moi.note.toLocaleString('fr-FR')}` : '—'}</span></div>
          <div class="li"><span class="grow t14">Colis à rendre à la gare (+ {DELAI_RETRAIT_JOURS} j)</span><span class="t14 b7">{aRendre}</span></div>
          <a class="li" href="/relais/inscription" onclick={(e) => lien(e, '/relais/inscription')}><span class="grow t14">Ma fiche relais</span><span class="t13 aq">modifier</span></a>
        </div>
        <a class="b g" href="/relais?relais={moi.id}" onclick={(e) => lien(e, `/relais?relais=${moi.id}`)}>Voir ma boutique sur la carte client</a>
        <button type="button" class="b g" onclick={quitter}>Changer de compte</button>
      </div>
    {/if}
  {/if}
</Mobile>

<style>
  .ligne { display: flex; align-items: center; gap: 10px; padding: 10px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); min-height: 56px; } .ligne:last-child { border: 0; }
  .fin { align-items: flex-end; flex: none; }
  .otp { display: flex; gap: 6px; justify-content: center; }
  .otp span { width: 44px; height: 52px; border-radius: 12px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; font: 700 22px 'Geist Mono', monospace; } .otp span.on { border-color: #3de0ff; }
  .choix { background: transparent; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); width: 100%; text-align: left; cursor: pointer; color: inherit; font: inherit; } .choix.on { background: rgba(61, 224, 255, 0.12); }
  .case { flex: none; width: 28px; height: 28px; margin: 8px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; cursor: pointer; color: #06080f; position: relative; }
  .case::after { content: ''; position: absolute; inset: -10px; } .case.on { background: #3de0ff; border-color: #3de0ff; }
  button:disabled { opacity: 0.45; }
  button:focus-visible, a:focus-visible, input:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
