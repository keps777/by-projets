<script lang="ts">
  import './guichet.css';
  import { onMount } from 'svelte';
  import { maintenant } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { caisseOuverte, compagnieDe, departParId, ligneDe, placesLibres, remplissage, siegesIndisponibles } from '../../domain/actions.ts';
  import { fcfa, lireMontant } from '../../core/money.ts';
  import { formaterTel, grilleBus, libelleErreur, montantsRapides, normaliserTel, rendu } from '../../core/guichet.ts';
  import { prixEtudiant } from '../../core/tarif.ts';
  import { supplementSiege } from '../../core/sieges.ts';
  import { app } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Lecture from './Lecture.svelte';
  import { dockAgent } from './dock.ts';
  import { contexte as contexteAgent, departsDeLaGare, finaliserPaiement, nomDepart, totalVente, vendre } from './actions.ts';

  const MAX_PLACES = 4;
  const ctx = $derived(contexteAgent()), agent = $derived(ctx.agent);
  const caisse = $derived(agent ? caisseOuverte(agent.id) : undefined);
  const demande = param('depart');
  let choisi = $state<string | null>(demande);
  const liste = $derived.by(() => {
    const l = agent?.gareId ? departsDeLaGare(agent.gareId, 10) : [], voulu = demande ? departParId(demande) : undefined;
    return voulu && !l.some((d) => d.id === voulu.id) ? [voulu, ...l] : l;
  });
  const depart = $derived(liste.find((d) => d.id === choisi) ?? liste[0]);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const grille = $derived(depart && ligne ? grilleBus(ligne.classe, depart.capacite) : null);
  const pris = $derived(depart ? siegesIndisponibles(depart) : new Set<string>());
  const libres = $derived(depart ? placesLibres(depart) : 0);

  let sieges = $state<string[]>([]), nom = $state(''), tel = $state(''), etudiant = $state(false), moyen = $state<'especes' | 'momo' | 'om'>('especes'), recu = $state('');
  let erreur = $state(''), occupe = $state(false), paiementId = $state(param('paiement') ?? '');
  const choisis = $derived(sieges.filter((s) => !pris.has(s)));
  const prixUnitaire = $derived(etudiant && depart ? prixEtudiant(depart.prix) : undefined);
  const total = $derived(depart ? totalVente(depart, choisis, prixUnitaire) : 0);
  const telNorm = $derived(normaliserTel(tel));
  const horsLigne = $derived(app.session.hors_ligne);
  const recuMontant = $derived(lireMontant(recu) ?? total), monnaie = $derived(rendu(recuMontant, total));

  // plan 3D : inclinaison au doigt (poignée) ; à plat si l'utilisateur réduit les animations
  let plat = $state(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches), angle = $state(48);
  const hauteurPlan = $derived(grille ? Math.round((grille.rangs * 31 + 50) * Math.cos((angle * Math.PI) / 180) * 1.4 + 30) : 120);
  let glisse: { y: number; a: number } | null = null;
  const incliner = (e: PointerEvent) => { if (glisse) angle = Math.max(15, Math.min(70, Math.round(glisse.a + (e.clientY - glisse.y) * 0.4))); };
  const toucheIncl = (e: KeyboardEvent) => { if (e.key === 'ArrowUp') angle = Math.min(70, angle + 4); else if (e.key === 'ArrowDown') angle = Math.max(15, angle - 4); else return; e.preventDefault(); };

  function choisirDepart(id: string) { choisi = id; sieges = []; erreur = ''; }
  function basculer(id: string) {
    erreur = '';
    if (sieges.includes(id)) sieges = sieges.filter((s) => s !== id);
    else if (sieges.length >= MAX_PLACES) sieges = [...sieges.slice(1), id];
    else sieges = [...sieges, id];
  }
  function voisine(delta: number) {
    if (!grille) return; const libresIds = grille.cases.map((c) => c.id).filter((i) => !pris.has(i)); if (!libresIds.length) return;
    const k = libresIds.indexOf(choisis[choisis.length - 1] ?? ''); sieges = [libresIds[(k + delta + libresIds.length * 2) % libresIds.length]];
  }
  const suppl = (id: string) => (ligne ? supplementSiege(ligne.classe, id) : 0);

  function encaisser() {
    if (!agent || !depart || ctx.lecture) return; erreur = '';
    if (!choisis.length) { erreur = 'Choisis au moins une place'; return; }
    if (moyen !== 'especes' && !telNorm) { erreur = 'Numéro du payeur à renseigner pour MoMo / OM'; return; }
    if (tel.trim() && !telNorm) { erreur = 'Numéro de téléphone illisible (9 chiffres)'; return; }
    occupe = true;
    try {
      const base = nom.trim() || 'Client guichet', n = choisis.length;
      const res = vendre({ agentId: agent.id, departId: depart.id, sieges: [...choisis], passagers: choisis.map((_, i) => ({ nom: n > 1 ? `${base} (${i + 1}/${n})` : base, tel: telNorm ?? '' })), moyen, prixUnitaire, recu: moyen === 'especes' ? recuMontant : undefined });
      if (moyen === 'especes') aller(`/vente/ticket?billet=${res.billets[0].id}&imprimer=1`); else paiementId = res.paiement.id;
    } catch (e) { erreur = libelleErreur(e); sieges = sieges.filter((s) => !pris.has(s)); }
    finally { occupe = false; }
  }

  // paiement MoMo / OM en attente (le passager valide sur son téléphone ; en démonstration, l'agent simule l'issue)
  const paiement = $derived(paiementId ? app.monde.paiements.find((p) => p.id === paiementId) : undefined);
  const billetsPaiement = $derived(paiement ? app.monde.billets.filter((b) => b.paiementId === paiement.id) : []);
  const departPaiement = $derived(billetsPaiement[0] ? departParId(billetsPaiement[0].departId) : undefined);
  let maintenantMs = $state(maintenant());
  onMount(() => { const t = setInterval(() => (maintenantMs = maintenant()), 1000); return () => clearInterval(t); });
  const reste = $derived(paiement?.expireLe ? Math.max(0, Math.floor((paiement.expireLe - maintenantMs) / 1000)) : 0);
  const expire = $derived(paiement?.statut === 'attente' && !!paiement.expireLe && paiement.expireLe <= maintenantMs);
  function issue(ok: boolean, motif = 'Solde insuffisant') {
    if (!agent || !paiement || ctx.lecture) return;
    try {
      const p = finaliserPaiement(agent.id, paiement.id, ok ? { ok: true } : { refus: motif });
      if (p.statut === 'ok') aller(`/vente/ticket?billet=${billetsPaiement[0].id}&imprimer=1`);
      else { montrer(p.motif ?? 'Paiement refusé', 'er'); }
    } catch (e) { erreur = libelleErreur(e); }
  }
  function nouvelle() { paiementId = ''; sieges = []; erreur = ''; aller('/vente'); }
  const mm = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
</script>

<Mobile titre="Vendre" sous={`guichet · ${app.monde.gares.find((g) => g.id === agent?.gareId)?.nom ?? ''}`} retourVers="/guichet" dock={dockAgent()}>
  {#snippet droite()}<a class="pl ac" href="/cadence" onclick={(e) => { e.preventDefault(); aller('/cadence'); }} style="min-height: 44px; text-decoration: none">mode cadence</a>{/snippet}

  {#if ctx.lecture}<Lecture {agent} />{/if}

  {#if paiement}
    <section class="gl col g12" aria-live="polite">
      {#if paiement.statut === 'attente' && !expire}
        <span class="lab">{paiement.moyen === 'om' ? 'Orange Money' : 'MoMo'} · en attente</span>
        <span class="ttl t24">{fcfa(paiement.montant)} F</span>
        <p class="t14 mut">La demande de paiement est partie sur le {formaterTel(billetsPaiement[0]?.passager.tel ?? '')}. Le passager valide avec son code secret. Les places sont retenues <b class="mono">{mm(reste)}</b>.</p>
        {#if departPaiement}<span class="t13 mut">{departPaiement.heure} {nomDepart(departPaiement)} · place{billetsPaiement.length > 1 ? 's' : ''} {billetsPaiement.map((b) => b.siege ?? 'libre').join(', ')}</span>{/if}
        <div class="row g8 wrapf">
          <button type="button" class="b p" disabled={ctx.lecture} onclick={() => issue(true)}><span class="col">Le client a validé<small>simulation de démonstration</small></span></button>
          <button type="button" class="b s" disabled={ctx.lecture} onclick={() => issue(false)}><span class="col">Paiement refusé<small>simulation de démonstration</small></span></button>
        </div>
        <button type="button" class="b g" disabled={ctx.lecture} onclick={() => { issue(false, 'Annulé au guichet'); nouvelle(); }}>Annuler la demande</button>
      {:else if paiement.statut === 'ok'}
        <span class="pl ok">paiement reçu</span><p class="t14">Le paiement est confirmé : les billets sont valides.</p>
        <a class="b p" href="/vente/ticket?billet={billetsPaiement[0]?.id}&imprimer=1" onclick={(e) => { e.preventDefault(); aller(`/vente/ticket?billet=${billetsPaiement[0]?.id}&imprimer=1`); }}>Imprimer le ticket</a>
      {:else}
        <span class="pl er">{paiement.statut === 'attente' ? 'demande expirée' : 'paiement refusé'}</span>
        <p class="t14" role="alert">{expire ? 'Le délai est dépassé : la demande n’a pas été validée.' : (paiement.motif ?? 'Paiement non abouti')} Les places sont libérées, aucune somme n’est prélevée.</p>
        <button type="button" class="b p" onclick={nouvelle}>Nouvelle vente</button>
      {/if}
    </section>
  {:else if !caisse && !ctx.lecture}
    <div class="gl col g12"><span class="pl wa">caisse fermée</span><p class="t14">Ouvre ta caisse (fond de caisse) avant de vendre : chaque billet encaissé s’y rattache.</p><a class="b p" href="/caisse" onclick={(e) => { e.preventDefault(); aller('/caisse'); }}>Ouvrir la caisse</a></div>
  {:else if !depart}
    <div class="gl col g8"><span class="t16 b7">Aucun départ à vendre</span><p class="t13 mut">Il n’y a plus de départ prévu depuis cette gare. Reviens plus tard.</p></div>
  {:else}
    <div class="chips g-fix" role="group" aria-label="Départ">
      {#each liste as d (d.id)}
        <button type="button" class="ch" class:on={d.id === depart.id} aria-pressed={d.id === depart.id} onclick={() => choisirDepart(d.id)}>{d.jour !== liste[0].jour ? 'demain ' : ''}{d.heure} {nomDepart(d)}{d.retardMin ? ` +${d.retardMin}` : ''}</button>
      {/each}
    </div>

    {#if libres === 0}
      <div class="gl col g8" role="status"><span class="pl er">complet</span><p class="t13 mut">Ce départ n’a plus de place. Choisis un autre départ dans la liste.</p></div>
    {/if}

    {#if grille}
      <div class="plan g-fix" class:plat style="--ang: {angle}deg; --h: {plat ? 'auto' : `${hauteurPlan}px`}">
        <div class="deckw" role="group" aria-label="Plan du bus · touche une place">
          <div class="deck">
            <span class="avant" aria-hidden="true">↑ avant · chauffeur</span>
            <div class="seats" style="grid-template-columns: {grille.colonnes === 5 ? 'repeat(2, 1fr) 16px repeat(2, 1fr)' : '1fr 16px repeat(2, 1fr)'}">
              {#each grille.cases as c (c.id)}
                {@const prise = pris.has(c.id)}
                {@const on = choisis.includes(c.id)}
                <button type="button" class="st" class:tk={prise} class:on style="grid-column: {c.col}; grid-row: {c.rang}" disabled={prise} aria-pressed={on}
                  aria-label="Place {c.id}{prise ? ' prise' : ''}{suppl(c.id) ? `, confort +${fcfa(suppl(c.id))} F` : ''}" onclick={() => basculer(c.id)}>{c.id}{#if suppl(c.id) && !prise}<i class="conf" aria-hidden="true"></i>{/if}</button>
              {/each}
            </div>
          </div>
        </div>
        <div class="outils">
          {#if !plat}<div class="incl" role="slider" tabindex="0" aria-label="Inclinaison du plan" aria-valuemin="15" aria-valuemax="70" aria-valuenow={angle} onkeydown={toucheIncl}
            onpointerdown={(e) => { glisse = { y: e.clientY, a: angle }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }} onpointermove={incliner} onpointerup={() => (glisse = null)} onpointercancel={() => (glisse = null)}><span class="grab"></span><span class="t12 mut3">glisse pour incliner</span></div>{/if}
          <button type="button" class="ch" aria-pressed={plat} onclick={() => (plat = !plat)}>{plat ? 'Vue 3D' : 'Vue à plat'}</button>
        </div>
      </div>
    {/if}

    <div class="row g8">
      <div class="gl grow" style="padding: 10px 12px"><span class="lab">Place{choisis.length > 1 ? 's' : ''}</span>
        <span class="row g8"><span class="ttl t20 grow" aria-live="polite">{choisis.length ? choisis.join(' · ') : '—'}</span>
          <button type="button" class="ib" style="width: 44px; height: 44px" aria-label="Place libre précédente" onclick={() => voisine(-1)}><Icone nom="retour" taille={18} /></button>
          <button type="button" class="ib" style="width: 44px; height: 44px" aria-label="Place libre suivante" onclick={() => voisine(1)}><Icone nom="suivant" taille={18} /></button></span>
      </div>
    </div>
    <div class="gl col g8" style="padding: 10px 12px">
      <span class="lab">Passager{choisis.length > 1 ? ` (${choisis.length} places)` : ''}</span>
      <div class="row g8"><label class="fld grow"><span class="t12 mut">Nom</span><input class="inp" bind:value={nom} placeholder="Client guichet" autocomplete="off" /></label>
        <label class="fld grow"><span class="t12 mut">Téléphone{moyen === 'especes' ? ' (facultatif)' : ''}</span><input class="inp" bind:value={tel} inputmode="tel" placeholder="6 91 22 10 08" autocomplete="off" aria-invalid={tel.trim() !== '' && !telNorm} /></label></div>
      {#if !tel.trim() && moyen === 'especes'}<span class="t12 mut3">sans téléphone · ticket papier</span>{/if}
      {#if app.monde.params.tarifs.etudiant}
        <label class="row g8" style="min-height: 44px"><input type="checkbox" bind:checked={etudiant} style="width: 22px; height: 22px" /><span class="t13">Tarif étudiant −20 % <span class="mut3">(carte vérifiée)</span></span></label>
      {/if}
    </div>

    <div class="seg2" role="group" aria-label="Paiement">
      {#each [['especes', 'Espèces'], ['momo', 'MoMo'], ['om', 'OM']] as [m, n] (m)}
        <button type="button" class:on={moyen === m} aria-pressed={moyen === m} disabled={horsLigne && m !== 'especes'} onclick={() => (moyen = m as typeof moyen)}>{n}</button>
      {/each}
    </div>
    {#if horsLigne}<span class="t12 wac" role="status">Hors ligne : espèces seulement, la vente sera synchronisée plus tard.</span>{/if}

    <div class="sheet">
      <div class="row sp">
        <span class="col"><span class="lab">{depart.heure} {nomDepart(depart)} · {compagnieDe(depart).abrev} · place{choisis.length > 1 ? 's' : ''} {choisis.join(', ') || '—'}</span><span class="ttl t24" aria-live="polite">{fcfa(total)} F</span>
          <span class="t13 mut">{moyen === 'especes' ? 'espèces · rendu calculé' : moyen === 'momo' ? 'MoMo · le passager valide sur son téléphone' : 'Orange Money · code marchand'}</span></span>
        <span class="ringp" style="--p: {Math.round(remplissage(depart) * 100)}%" role="img" aria-label="{libres} places libres"><span class="t12 b7">{libres} l.</span></span>
      </div>
      {#if moyen === 'especes' && total > 0}
        <div class="col g8">
          <label class="fld"><span class="t12 mut">Espèces reçues</span><input class="inp" value={recu} oninput={(e) => (recu = e.currentTarget.value)} inputmode="numeric" placeholder={fcfa(total)} autocomplete="off" /></label>
          <div class="chips g-fix" role="group" aria-label="Montants rapides">{#each montantsRapides(total) as m (m)}<button type="button" class="ch" onclick={() => (recu = String(m))}>{fcfa(m)}</button>{/each}</div>
          <span class="t14 b7" class:okc={monnaie !== null} class:erc={monnaie === null} aria-live="polite">{monnaie === null ? `Il manque ${fcfa(total - recuMontant)} F` : `Rendu : ${fcfa(monnaie)} F`}</span>
        </div>
      {/if}
      {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
      <button type="button" class="b p" disabled={occupe || ctx.lecture || !choisis.length || libres === 0 || monnaie === null} onclick={encaisser}>{moyen === 'especes' ? 'Encaisser et imprimer' : 'Envoyer la demande de paiement'}</button>
    </div>
  {/if}
</Mobile>

<style>
  .plan { display: flex; flex-direction: column; gap: 6px; }
  .deckw { position: relative; height: var(--h); perspective: 800px; perspective-origin: 50% 0; }
  .plan.plat .deckw { perspective: none; }
  .deck { position: absolute; left: 50%; top: 10px; width: min(270px, calc(100% - 56px)); margin-left: calc(min(270px, calc(100% - 56px)) / -2); padding: 10px 12px 14px; border-radius: 30px 30px 20px 20px; background: linear-gradient(180deg, rgba(255, 255, 255, 0.14), rgba(255, 255, 255, 0.04)); border: 1px solid rgba(255, 255, 255, 0.24); transform: rotateX(var(--ang)); transform-style: preserve-3d; }
  .plan.plat .deck { position: relative; left: 0; top: 0; margin: 0 auto; transform: none; width: min(100%, 300px); }
  .avant { display: block; margin-bottom: 8px; text-align: center; font: 600 10px 'Geist Mono', monospace; letter-spacing: 0.12em; text-transform: uppercase; color: #8e99bb; }
  .seats { display: grid; gap: 5px; transform-style: preserve-3d; }
  .st { position: relative; height: 26px; border-radius: 7px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.1); color: #b7c0db; font: 700 10px 'Geist Mono', monospace; cursor: pointer; display: grid; place-items: center; transform: translateZ(6px); padding: 0; }
  .plan.plat .st { height: 40px; font-size: 12px; transform: none; }
  .st.tk { background: rgba(255, 255, 255, 0.03); color: rgba(255, 255, 255, 0.25); border-style: dashed; transform: none; cursor: default; }
  .st.on { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; border-color: transparent; transform: translateZ(16px); }
  .plan.plat .st.on { transform: none; box-shadow: 0 0 0 2px #fff; }
  .st:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .conf { position: absolute; top: 2px; right: 3px; width: 5px; height: 5px; border-radius: 50%; background: #ffc24b; }
  .outils { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .incl { flex: 1; display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 0 10px; border-radius: 14px; background: rgba(255, 255, 255, 0.06); touch-action: none; cursor: ns-resize; }
  .incl .grab { margin: 0; width: 34px; }
  .incl:focus-visible { outline: 2px solid #fff; }
</style>
