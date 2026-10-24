<script lang="ts">
  import './guichet.css';
  import { app } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { caisseOuverte, heureLocale, personne } from '../../domain/actions.ts';
  import { COUPURES, evaluerEcart, totalCompte } from '../../core/caisse.ts';
  import { fcfa, fcfaSigne, lireMontant } from '../../core/money.ts';
  import { libelleErreur } from '../../core/guichet.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Lecture from './Lecture.svelte';
  import { dockAgent } from './dock.ts';
  import { cloturerCaisse, contexte, derniereCaisse, ouvrirLaCaisse, resumeCaisse } from './actions.ts';
  import { reduirePhoto } from './photo.ts';
  import { etat } from './etat.ts';

  const ctx = $derived(contexte()), agent = $derived(ctx.agent);
  const ouverte = $derived(agent ? caisseOuverte(agent.id) : undefined);
  const derniere = $derived(agent ? derniereCaisse(agent.id) : undefined);
  const resume = $derived(ouverte ? resumeCaisse(ouverte) : null);
  const bordereauRequis = $derived(!!app.monde.params.regles.bordereau);

  // ouverture
  let fond = $state('20 000'), erreur = $state('');
  // comptage par coupure + petite monnaie (pièces < 500 F, en francs)
  let q = $state<Record<string, number>>(Object.fromEntries(COUPURES.map((v) => [String(v), 0]))), pieces = $state('');
  let justification = $state(''), photo = $state(''), erreurPhoto = $state(''), confirmer = $state(false), occupe = $state(false);
  const piecesMontant = $derived(lireMontant(pieces) ?? 0);
  const compte = $derived(totalCompte(q) + piecesMontant);
  const ev = $derived(resume ? evaluerEcart(compte, resume.attendu) : null);
  const fermee = $derived(derniere && derniere.statut !== 'ouverte' ? derniere : undefined);
  const bordereau = $derived(fermee ? etat().bordereaux[fermee.id] : '');

  function ouvrir() {
    if (!agent || ctx.lecture) return; erreur = '';
    const montant = lireMontant(fond); if (montant === null) { erreur = 'Entre le fond de caisse en francs'; return; }
    try { ouvrirLaCaisse(agent.id, montant); montrer(`Caisse ouverte · fond ${fcfa(montant)} F`); } catch (e) { erreur = libelleErreur(e); }
  }
  const pas = (v: number, d: number) => { q[String(v)] = Math.max(0, (q[String(v)] ?? 0) + d); confirmer = false; };
  async function prendrePhoto(e: Event) {
    const f = (e.currentTarget as HTMLInputElement).files?.[0]; erreurPhoto = ''; if (!f) return;
    try { photo = await reduirePhoto(f); } catch (x) { erreurPhoto = x instanceof Error ? x.message : 'Photo illisible'; }
  }
  function cloturer() {
    if (!agent || !ouverte || ctx.lecture) return; erreur = '';
    if (!confirmer) {
      if (ev && ev.niveau !== 'juste' && !justification.trim()) { erreur = libelleErreur(new Error('justification_requise')); return; }
      if (bordereauRequis && !photo) { erreur = libelleErreur(new Error('bordereau_requis')); return; }
      confirmer = true; return;
    }
    occupe = true;
    try {
      const compteFinal: Record<string, number> = { ...q }; if (piecesMontant > 0) compteFinal['1'] = piecesMontant;
      const r = cloturerCaisse({ agentId: agent.id, caisseId: ouverte.id, compte: compteFinal, justification: justification.trim() || undefined, bordereau: photo || undefined });
      montrer(r.niveau === 'juste' ? 'Caisse juste · clôture envoyée' : `Clôture envoyée · écart ${fcfaSigne(r.montant)} F`, r.niveau === 'a_valider' ? 'wa' : 'ok');
      q = Object.fromEntries(COUPURES.map((v) => [String(v), 0])); pieces = ''; justification = ''; photo = ''; confirmer = false;
    } catch (e) { erreur = libelleErreur(e); confirmer = false; } finally { occupe = false; }
  }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const statutTexte = { fermee: 'en attente du superviseur', validee: 'validée', bloquee: 'bloquée' } as const;
</script>

<Mobile titre="Caisse" sous={ouverte ? `ouverte ${heureLocale(ouverte.ouvertA)} · fond ${fcfa(ouverte.fond)} F` : 'fermée'} retourVers="/guichet" dock={dockAgent('caisse')}>
  {#snippet droite()}<span class="pl {ouverte ? (ev?.niveau === 'juste' ? 'ok' : 'wa') : fermee?.statut === 'validee' ? 'ok' : fermee?.statut === 'bloquee' ? 'er' : 'inf'}">{ouverte ? (ev?.niveau === 'juste' ? 'juste' : 'à compter') : fermee ? statutTexte[fermee.statut as 'fermee'] : 'fermée'}</span>{/snippet}
  {#if ctx.lecture}<Lecture {agent} />{/if}

  {#if ouverte && resume}
    <div class="bento">
      <div class="gl ac w2"><span class="lab">Attendu en espèces</span><span class="big" aria-live="polite">{fcfa(resume.attendu)} F</span><span class="t12 mut">{resume.billets} billet{resume.billets > 1 ? 's' : ''} · {resume.colis} colis · fond inclus</span></div>
      <div class="gl w2 row sp"><span class="col"><span class="lab">MoMo / OM</span><span class="ttl t20">{fcfa(resume.mobile)} F</span></span><span class="t12 mut" style="text-align: right">déjà sur le compte compagnie</span></div>
    </div>

    <span class="lab" id="lab-compte">Compte les billets</span>
    <div class="gl col" style="gap: 0; padding-top: 6px; padding-bottom: 6px" role="group" aria-labelledby="lab-compte">
      {#each COUPURES as v (v)}
        <div class="bill">
          <span class="col grow"><span class="t16 b7">{fcfa(v)} F</span><span class="t12 mut mono">{fcfa(v * (q[String(v)] ?? 0))} F</span></span>
          <span class="g-stp"><button type="button" aria-label="Moins {v <= 500 ? 'une pièce' : 'un billet'} de {fcfa(v)} F" disabled={ctx.lecture || !q[String(v)]} onclick={() => pas(v, -1)}>−</button><b aria-live="polite">{q[String(v)] ?? 0}</b><button type="button" aria-label="Plus {v <= 500 ? 'une pièce' : 'un billet'} de {fcfa(v)} F" disabled={ctx.lecture} onclick={() => pas(v, 1)}>+</button></span>
        </div>
      {/each}
      <div class="bill"><label class="col grow" for="pieces"><span class="t16 b7">Autres pièces</span><span class="t12 mut">moins de 50 F, total en francs</span></label><input id="pieces" class="inp" style="width: 120px; text-align: right" inputmode="numeric" placeholder="0" bind:value={pieces} disabled={ctx.lecture} oninput={() => (confirmer = false)} /></div>
    </div>

    {#if ev}
      <div class="gl row sp" class:ac={ev.niveau === 'juste'}>
        <span class="col"><span class="lab">Compté</span><span class="ttl t20">{fcfa(compte)} F</span></span>
        <span class="col" style="align-items: flex-end"><span class="lab">Écart</span><span class="ttl t20" class:okc={ev.niveau === 'juste'} class:wac={ev.niveau === 'tolere'} class:erc={ev.niveau === 'a_valider'} aria-live="polite">{ev.montant > 0 ? '+' : ev.montant < 0 ? '−' : ''}{fcfa(Math.abs(ev.montant))} F</span><span class="t12 mut">{ev.texte}</span></span>
      </div>
      {#if ev.niveau !== 'juste'}
        <label class="fld"><span class="t13 b7">Explique l’écart <span class="erc">(obligatoire)</span></span><textarea class="inp" style="min-height: 76px; padding: 10px 14px" bind:value={justification} placeholder="Ex. monnaie rendue en trop à un passager" oninput={() => (confirmer = false)}></textarea></label>
      {/if}
    {/if}

    <div class="gl col g8">
      <span class="t14 b7">Bordereau de dépôt {bordereauRequis ? '(obligatoire)' : '(facultatif)'}</span>
      <span class="t12 mut">Photographie le bordereau remis à la banque ou au coffre avec les espèces.</span>
      {#if photo}<img src={photo} alt="Bordereau de dépôt photographié" style="width: 100%; max-height: 160px; object-fit: contain; border-radius: 12px; background: #000" />{/if}
      <label class="b s sm" style="cursor: pointer">{photo ? 'Reprendre la photo' : 'Photographier le bordereau'}<input type="file" accept="image/*" capture="environment" onchange={prendrePhoto} disabled={ctx.lecture} style="position: absolute; width: 1px; height: 1px; opacity: 0" aria-label="Photographier le bordereau de dépôt" /></label>
      {#if erreurPhoto}<span class="t12 erc" role="alert">{erreurPhoto}</span>{/if}
    </div>

    {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
    <button type="button" class="b p" disabled={occupe || ctx.lecture} onclick={cloturer}>{confirmer ? `Confirmer : clôturer avec ${fcfa(compte)} F` : 'Clôturer · envoyer au superviseur'}</button>
    {#if confirmer}<button type="button" class="b g" onclick={() => (confirmer = false)}>Revenir au comptage</button>{/if}
    <a class="b g" href="/rapport-soir" onclick={(e) => lien(e, '/rapport-soir')}>Voir le rapport du soir</a>
  {:else}
    {#if fermee}
      {@const f = fermee}
      <div class="gl col g8" role="status">
        <span class="pl {f.statut === 'validee' ? 'ok' : f.statut === 'bloquee' ? 'er' : 'inf'}">{f.statut === 'validee' ? 'clôture validée' : f.statut === 'bloquee' ? 'caisse bloquée' : 'en attente de validation'}</span>
        <span class="t14">{f.statut === 'validee' ? `Validée par ${personne(f.validePar)?.prenom ?? 'le superviseur'}${f.valideeA ? ` à ${heureLocale(f.valideeA)}` : ''}.` : f.statut === 'bloquee' ? 'Appelle le superviseur pour débloquer la caisse.' : 'Le superviseur doit valider ta clôture. Tu peux ouvrir une nouvelle caisse en attendant.'}</span>
        <table class="tbl g-fix"><tbody>
          <tr><td>Attendu</td><td class="r mono">{fcfa(f.attendu ?? 0)} F</td></tr>
          <tr><td>Compté</td><td class="r mono">{fcfa(totalCompte(f.compte ?? {}))} F</td></tr>
          <tr><td>Écart</td><td class="r mono" class:okc={f.ecart === 0} class:erc={Math.abs(f.ecart ?? 0) > 1000}>{fcfaSigne(f.ecart ?? 0)} F</td></tr>
          <tr><td>Fermée à</td><td class="r mono">{f.fermeeA ? heureLocale(f.fermeeA) : ''}</td></tr>
        </tbody></table>
        {#if f.justification}<span class="t13 mut">Justification : {f.justification}</span>{/if}
        {#if bordereau}<img src={bordereau} alt="Bordereau de dépôt" style="width: 100%; max-height: 140px; object-fit: contain; border-radius: 12px; background: #000" />{/if}
      </div>
      <a class="b s" href="/rapport-soir" onclick={(e) => lien(e, '/rapport-soir')}>Voir le rapport du soir</a>
    {/if}
    <div class="gl col g12">
      <span class="lab">{fermee ? 'Nouvelle caisse' : 'Ouvrir la caisse'}</span>
      <p class="t14 mut">Compte le fond de caisse reçu avant d’ouvrir : chaque billet et colis encaissé en espèces s’y rattache.</p>
      <label class="fld"><span class="t12 mut">Fond de caisse (F)</span><input class="inp" inputmode="numeric" bind:value={fond} disabled={ctx.lecture} aria-invalid={lireMontant(fond) === null} /></label>
      <div class="chips g-fix" role="group" aria-label="Fonds usuels">{#each [0, 10000, 20000, 30000, 50000] as m (m)}<button type="button" class="ch" onclick={() => (fond = fcfa(m))}>{fcfa(m)}</button>{/each}</div>
      {#if erreur}<span class="t13 erc" role="alert">{erreur}</span>{/if}
      <button type="button" class="b p" disabled={ctx.lecture} onclick={ouvrir}>Ouvrir la caisse</button>
    </div>
  {/if}
</Mobile>

<style>
  .bill { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .bill:last-child { border: 0; }
  textarea.inp { resize: vertical; align-items: flex-start; }
  label.b { position: relative; }
</style>
