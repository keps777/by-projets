<script lang="ts">
  import { onMount } from 'svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { peutEchanger } from '../../core/regles.ts';
  import { annulerDrop, cloreDrop, creerDrop, ErreurAdmin, libelleVol, lignesDrops, MAX_PLACES, ouvrirDrop, prochainNumeroDrop, validerDrop, type ChampDrop, type LigneDrop, type StatutLigne } from '../../domain/admin-drops.ts';
  import { departDuVol } from '../../domain/marche.ts';
  import Icone from '../../ui/Icone.svelte';
  import Champ from '../../ui/Champ.svelte';
  import { compteARebours, decalage, heure, jour, jourSemaine, lireInstant } from './DropsFormat.ts';
  /** Volet « Drops » de la console : liste (drops réels et annonces), drop sélectionné (règles, places, actions) et formulaire « Planifier un drop ». Chaque action passe par `domain/admin-drops.ts` et est consignée au journal d'audit. */
  let { acteur, horsLigne, informer }: { acteur: string; horsLigne: boolean; informer: (m: string, ton?: 'ok' | 'er') => void } = $props();

  let now = $state(maintenant());
  onMount(() => { const t = setInterval(() => (now = maintenant()), 1000); return () => clearInterval(t); });
  const lignes = $derived(lignesDrops(now));
  let choix = $state('');
  const sel = $derived(lignes.find((l) => l.id === choix) ?? lignes.find((l) => l.statut === 'ouvert') ?? lignes[0]);
  let confirmer = $state<'ouvrir' | 'clore' | 'annuler' | null>(null);
  const selId = $derived(sel?.id);
  $effect(() => { void selId; confirmer = null; });

  const STATUTS: Record<StatutLigne, { texte: string; icone: string }> = { planifie: { texte: 'Planifié', icone: 'horloge' }, ouvert: { texte: 'Ouvert', icone: 'drops' }, epuise: { texte: 'Épuisé', icone: 'ok' }, termine: { texte: 'Terminé', icone: 'fermer' } };
  const etiquetteNum = (l: LigneDrop) => (l.n ? `N° ${l.n}` : 'N° —');
  const places = (l: LigneDrop) => (l.annonce ? { a: '—', b: 'sur —', c: 'à définir' } : l.statut === 'planifie' ? { a: '—', b: `sur ${l.places}`, c: 'prévues' } : { a: `${(l.places ?? 0) - (l.restantes ?? 0)}`, b: `sur ${l.places}`, c: 'réclamées sur libérées' });

  // ── Planifier un drop
  let plan = $state(false);
  let f = $state({ volId: '', places: '', prix: '', dateO: '', heureO: '', dateF: '', heureF: '' });
  let erreurs = $state<Partial<Record<ChampDrop, string>>>({});
  let essaye = $state(false);
  const volsPossibles = $derived([...app.monde.vols].filter((v) => peutEchanger(departDuVol(v), now)).sort((a, b) => departDuVol(a) - departDuVol(b)));
  const nombre = (t: string) => (/^\d+$/.test(t.trim()) ? Number(t.trim()) : NaN);
  const entree = () => ({ volId: f.volId, prixMembre: nombre(f.prix), places: nombre(f.places), ouvre: lireInstant(f.dateO, f.heureO), fin: lireInstant(f.dateF, f.heureF) });
  const verifier = () => { erreurs = validerDrop(entree(), maintenant()); };
  function ouvrirPlan() { if (horsLigne) return; plan = true; essaye = false; erreurs = {}; f = { volId: '', places: '', prix: '', dateO: '', heureO: '', dateF: '', heureF: '' }; queueMicrotask(() => document.getElementById('pl-vol')?.focus()); }
  function valider(e: SubmitEvent) {
    e.preventDefault(); if (horsLigne) return; essaye = true; verifier(); if (Object.keys(erreurs).length) return;
    try { const d = creerDrop(acteur, entree()); plan = false; choix = d.id; informer(`Drop N° ${d.n} planifié : ouverture le ${jour(d.ouvre)} à ${heure(d.ouvre)}. Action consignée au journal d’audit.`); }
    catch (x) { if (x instanceof ErreurAdmin) { erreurs = x.champs as typeof erreurs; informer(x.message, 'er'); } else throw x; }
  }
  const err = (c: ChampDrop) => (essaye ? (erreurs[c] ?? '') : '');

  // ── Actions sur le drop sélectionné
  function agir(quoi: 'ouvrir' | 'clore' | 'annuler') {
    if (!sel || horsLigne) return;
    try {
      if (quoi === 'ouvrir') { ouvrirDrop(acteur, sel.id); informer(`Drop N° ${sel.n} ouvert maintenant. Action consignée au journal d’audit.`); }
      else if (quoi === 'clore') { cloreDrop(acteur, sel.id); informer(`Drop N° ${sel.n} clos. Action consignée au journal d’audit.`); }
      else { annulerDrop(acteur, sel.id); informer(sel.n ? `Drop N° ${sel.n} annulé. Action consignée au journal d’audit.` : 'Annonce de drop annulée. Action consignée au journal d’audit.'); choix = ''; }
    } catch (x) { if (x instanceof ErreurAdmin) informer(x.message, 'er'); else throw x; }
    confirmer = null;
  }
  const TEXTE_CONFIRM = { ouvrir: 'Ouvrir ce drop maintenant ? L’ouverture est immédiate et journalisée. Les règles d’attribution publiées s’appliquent.', clore: 'Clore ce drop ? Les places restantes ne seront plus attribuées ; les places déjà attribuées restent acquises. Action journalisée.', annuler: 'Annuler ce drop ? Il disparaît des prochains drops des membres. Action journalisée.' } as const;
  const BOUTON_CONFIRM = { ouvrir: 'Confirmer l’ouverture', clore: 'Confirmer la clôture', annuler: 'Confirmer l’annulation' } as const;
</script>

<section aria-labelledby="drops-titre" class="volet">
  <div class="entete">
    <div class="col g4"><h2 id="drops-titre" class="t-section htitre">Drops</h2><p class="t-sec">Heure de Montréal ({decalage(now)}). Sélectionnez un drop pour voir ses règles et ses places.</p></div>
    <button type="button" class="btn sm plan" aria-disabled={horsLigne} onclick={ouvrirPlan}><Icone nom="plus" taille={18} trait={2} />Planifier un drop</button>
  </div>

  {#if plan}
    <form class="carte formulaire" aria-labelledby="plan-titre" onsubmit={valider} novalidate>
      <div class="col g4"><h3 id="plan-titre" class="h3">Planifier un drop</h3><p class="t-sec">Prix membre en dollars canadiens, nombre entier. Ouverture et fin en heure de Montréal ({decalage(now)}). Action journalisée. Ce sera le drop N° {prochainNumeroDrop()}.</p></div>
      <div class="grille">
        <div class="champ large" data-erreur={err('volId') ? '' : undefined}>
          <label for="pl-vol">Vol du drop</label>
          <select id="pl-vol" bind:value={f.volId} onchange={verifier} aria-invalid={err('volId') ? 'true' : undefined} aria-describedby={err('volId') ? 'pl-vol-e' : undefined}>
            <option value="">Choisir un vol</option>{#each volsPossibles as v (v.id)}<option value={v.id}>{libelleVol(v)} · {v.de} → {v.vers} · {v.jour} · prix équivalent {fmt(v.prixNeuf)}</option>{/each}
          </select>
          {#if err('volId')}<span class="erreur" id="pl-vol-e" role="alert"><Icone nom="alerte" taille={16} />{err('volId')}</span>{/if}
        </div>
        <Champ id="pl-places" label={`Places à libérer (1 à ${MAX_PLACES})`} bind:valeur={f.places} inputmode="numeric" erreur={err('places')} onsaisie={verifier} />
        <Champ id="pl-prix" label="Prix membre ($)" bind:valeur={f.prix} inputmode="numeric" erreur={err('prixMembre')} onsaisie={verifier} />
        <Champ id="pl-date" label="Date d’ouverture (AAAA-MM-JJ)" bind:valeur={f.dateO} inputmode="numeric" placeholder="2026-10-20" erreur={err('ouvre')} onsaisie={verifier} />
        <Champ id="pl-heure" label="Heure d’ouverture (HH:MM, heure de Montréal)" bind:valeur={f.heureO} inputmode="numeric" placeholder="12:00" onsaisie={verifier} />
        <Champ id="pl-date-fin" label="Date de fin (AAAA-MM-JJ)" bind:valeur={f.dateF} inputmode="numeric" placeholder="2026-10-21" erreur={err('fin')} onsaisie={verifier} />
        <Champ id="pl-heure-fin" label="Heure de fin (HH:MM)" bind:valeur={f.heureF} inputmode="numeric" placeholder="12:00" onsaisie={verifier} />
      </div>
      <div class="row g12 fin"><button type="button" class="btn sec sm" onclick={() => (plan = false)}>Annuler</button><button type="submit" class="btn sm">Planifier le drop</button></div>
    </form>
  {/if}

  {#if lignes.length === 0}
    <div class="carte vide"><span class="ico"><Icone nom="chercher" taille={32} trait={1.5} /></span><h3 class="h3">Aucun drop planifié</h3><p class="t-sec">Aucun drop n’est planifié ni ouvert pour le moment.</p>
      <button type="button" class="btn sec sm" aria-disabled={horsLigne} onclick={ouvrirPlan}>Planifier un drop</button></div>
  {:else if sel}
    <div class="duo">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="tableau" role="region" aria-label="Liste des drops" tabindex="0">
        <table>
          <caption class="sr">Drops : numéro, trajet et vol, ouverture, places réclamées sur libérées, prix membre et statut.</caption>
          <thead><tr><th scope="col" class="p16">Drop</th><th scope="col">Trajet et vol</th><th scope="col">Ouverture</th><th scope="col">Places</th><th scope="col">Prix membre</th><th scope="col">Statut</th></tr></thead>
          <tbody>
            {#each lignes as l (l.id)}
              {@const p = places(l)}
              <tr class:actif={l.id === sel.id}>
                <th scope="row"><button type="button" class="selection" aria-pressed={l.id === sel.id} onclick={() => (choix = l.id)}><span class="num" class:on={l.id === sel.id}>{etiquetteNum(l)}</span><span class="t-sec">{l.annonce ? `${l.zone} · annonce` : l.zone}</span></button></th>
                <td><span class="trajet">{l.trajet}</span><span class="t-sec nowrap">{l.vol}</span></td>
                <td class="nowrap"><span class="j">{jourSemaine(l.ouvre)}</span><span class="t-aide">{heure(l.ouvre)} · {decalage(l.ouvre)}</span></td>
                <td class="nowrap"><span class="mono val">{p.a}&nbsp;{p.b}</span><span class="t-aide">{p.c}</span></td>
                <td class="mono val nowrap">{l.prixMembre !== undefined ? fmt(l.prixMembre) : '—'}</td>
                <td>{@render statut(l)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <aside class="carte panneau" aria-labelledby="drop-titre">
        <p class="t-sur">{sel.annonce ? 'Annonce sélectionnée' : 'Drop sélectionné'}</p>
        <div class="col g4"><h3 id="drop-titre" class="gros">{sel.n ? `Drop N° ${sel.n}` : `Drop annoncé · ${sel.zone}`}</h3><p class="t-sec">{sel.zone} · {sel.trajet}{sel.volId ? ` · ${sel.vol}` : ''}</p></div>
        <div>{@render statut(sel)}</div>
        {#if !sel.annonce}
          {@const prises = (sel.places ?? 0) - (sel.restantes ?? 0)}
          <div class="col g8">
            <div class="jauge" role="img" aria-label={`${prises} places réclamées sur ${sel.places}`}><span style:width={`${sel.places ? (100 * prises) / sel.places : 0}%`}></span></div>
            <p class="mono petit">{prises} réclamées · {sel.restantes} restantes sur {sel.places} libérées</p>
            {#if sel.statut === 'ouvert' && sel.fin}<p class="rebours" role="timer" aria-label="Temps restant avant la fin du drop"><Icone nom="horloge" taille={16} />Se termine dans <span class="mono">{compteARebours(sel.fin - now)}</span></p>{/if}
          </div>
        {/if}
        <div class="filet"></div>
        <dl class="infos">
          <div><dt>Ouverture</dt><dd class="mono">{jourSemaine(sel.ouvre)} · {heure(sel.ouvre)}</dd><dd class="t-aide">{decalage(sel.ouvre)}</dd></div>
          {#if sel.fin}<div><dt>Fin</dt><dd class="mono">{jourSemaine(sel.fin)} · {heure(sel.fin)}</dd><dd class="t-aide">{decalage(sel.fin)}</dd></div>{/if}
          {#if sel.prixMembre !== undefined}<div><dt>Prix membre</dt><dd class="mono">{fmt(sel.prixMembre)}</dd></div><div><dt>Prix équivalent</dt><dd class="mono">{fmt(sel.prixEquivalent ?? 0)}</dd><dd class="t-aide">neuf, aujourd’hui</dd></div>{/if}
        </dl>
        {#if sel.annonce}<p class="t-aide">Annonce de « prochain drop » : la destination reste masquée au public jusqu’à l’ouverture. Aucun lot ni prix n’est encore réservé.</p>{/if}

        {#if confirmer}
          <div class="carte2 confirm" role="alertdialog" aria-labelledby="conf-t">
            <p id="conf-t" class="t-sec fort">{TEXTE_CONFIRM[confirmer]}</p>
            <div class="row g8"><button type="button" class="btn sec sm" onclick={() => (confirmer = null)}>Annuler</button><button type="button" class="btn sm" class:danger={confirmer !== 'ouvrir'} onclick={() => agir(confirmer!)}>{BOUTON_CONFIRM[confirmer]}</button></div>
          </div>
        {:else if sel.statut === 'planifie'}
          <div class="row g8 wrap">{#if !sel.annonce}<button type="button" class="btn sm" aria-disabled={horsLigne} onclick={() => !horsLigne && (confirmer = 'ouvrir')}>Ouvrir maintenant</button>{/if}<button type="button" class="btn sec sm" aria-disabled={horsLigne} onclick={() => !horsLigne && (confirmer = 'annuler')}>Annuler le drop</button></div>
          <p class="t-aide">{horsLigne ? 'Hors ligne : les actions d’administration sont indisponibles.' : 'Action sensible, journalisée.'}</p>
        {:else if sel.statut === 'ouvert'}
          <div class="row g8 wrap"><button type="button" class="btn sec sm" aria-disabled={horsLigne} onclick={() => !horsLigne && (confirmer = 'clore')}>Clore le drop</button></div>
          <p class="t-aide">{horsLigne ? 'Hors ligne : les actions d’administration sont indisponibles.' : 'Action sensible, journalisée.'}</p>
        {/if}

        {#if !sel.annonce}
          <div class="filet"></div>
          <div class="col g8"><p class="t-sur">Règles d’attribution publiées</p>
            <ul class="regles"><li>Une place par membre et par drop.</li><li>La place est attribuée à la fin du paiement, dans l’ordre d’arrivée.</li><li>Même règle d’accès pour tous les membres, quel que soit le lieu de connexion.</li></ul>
            <p class="t-aide">Règles provisoires, hypothèses à valider. Les quantités affichées sont les quantités réelles.</p>
            <a href="/drops" class="lien" onclick={(e) => { e.preventDefault(); aller('/drops'); }}>Voir la page publique du drop<Icone nom="suivant" taille={16} trait={2} /></a></div>
          <div class="filet"></div>
          <div class="col g8"><p class="t-sur">Places attribuées</p>
            {#if sel.servis.length}<ul class="servis">{#each sel.servis as s (s)}<li class="mono">{s}</li>{/each}</ul>{:else}<p class="t-aide">{sel.statut === 'planifie' ? 'Aucune attribution : le drop n’est pas encore ouvert.' : 'Aucune place attribuée pour l’instant.'}</p>{/if}
            <p class="t-aide">Les membres servis sont désignés par leur identifiant pseudonymisé (ACC-…), jamais par leur nom.</p></div>
        {/if}
      </aside>
    </div>
  {/if}
</section>

{#snippet statut(l: LigneDrop)}
  {@const s = STATUTS[l.statut]}
  <span class="chip {l.statut}"><Icone nom={s.icone} taille={14} trait={2} />{s.texte}</span>
{/snippet}

<style>
  .volet { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .entete { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; }
  .htitre { font-size: 24px; letter-spacing: 0.04em; text-transform: uppercase; }
  .h3 { font: 700 18px/24px 'Barlow', sans-serif; }
  .plan { min-height: 48px; }
  .formulaire { display: flex; flex-direction: column; gap: 14px; padding: 18px; }
  .grille { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 14px 16px; align-items: start; }
  .large { grid-column: 1 / -1; } .fin { justify-content: flex-end; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 40px 24px; } .ico { color: var(--ink3); display: flex; }
  .duo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: start; }
  @media (min-width: 1100px) { .duo { grid-template-columns: minmax(0, 1fr) 380px; } }
  .tableau { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; }
  table { width: 100%; min-width: 760px; border-collapse: collapse; }
  th[scope='col'] { padding: 12px 8px 10px; text-align: left; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); white-space: nowrap; }
  th.p16 { padding-left: 16px; }
  tbody tr { border-top: 1px solid var(--line); } tbody tr.actif { background: var(--surface2); }
  td, tbody th { padding: 8px; vertical-align: middle; text-align: left; font-weight: inherit; } tbody th { padding: 0; }
  td > span { display: block; }
  .selection { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; width: 100%; min-height: 64px; padding: 8px 8px 8px 16px; background: transparent; border: 0; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
  .num { font: 700 20px/22px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; white-space: nowrap; } .num.on { color: var(--accent); }
  .trajet { font: 700 18px/20px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; white-space: nowrap; }
  .j { font: 600 14px/20px 'Barlow', sans-serif; } .nowrap { white-space: nowrap; }
  .val { font-weight: 600; font-size: 15px; font-variant-numeric: tabular-nums; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; background: var(--surface3); color: var(--ink2); }
  .chip.planifie { background: rgba(98, 199, 255, 0.12); color: var(--up); } .chip.ouvert { background: var(--signal-soft); color: var(--signal-ink); }
  .panneau { display: flex; flex-direction: column; gap: 16px; padding: 18px; min-width: 0; }
  .gros { font: 700 30px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.02em; }
  .jauge { height: 10px; border-radius: 999px; background: var(--surface3); overflow: hidden; } .jauge span { display: block; height: 100%; background: var(--up); border-radius: 999px; }
  .petit { font-size: 13px; line-height: 18px; font-weight: 600; } .rebours { display: flex; align-items: center; gap: 6px; font: 600 14px/20px 'Barlow', sans-serif; color: var(--signal-ink); }
  .infos { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; } .infos dt { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .infos dd { margin: 0; font-weight: 600; font-size: 14px; line-height: 18px; } .infos dd.t-aide { font-weight: 400; }
  .confirm { display: flex; flex-direction: column; gap: 10px; border: 1px solid var(--line-strong); } .fort { color: var(--ink); }
  .wrap { flex-wrap: wrap; }
  .regles { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; line-height: 20px; }
  .servis { margin: 0; padding: 0; list-style: none; display: flex; flex-wrap: wrap; gap: 6px; } .servis li { padding: 4px 8px; border-radius: 8px; background: var(--surface2); font-size: 13px; }
  .lien { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; font-weight: 700; color: var(--accent); }

</style>
