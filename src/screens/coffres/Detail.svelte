<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Ligne from '../../ui/Ligne.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { aller } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { fcfa, fcfaSigne, lireMontant } from '../../core/money.ts';
  import { jourCourt, jourLong } from '../../core/dates.ts';
  import { TAUX_COFFRE, pctCoffre } from '../../core/epargne.ts';
  import { estAtteint, MENSUEL_MIN, montantAuto } from '../../core/coffres.ts';
  import { basculerAuto, modifierMensuel, supprimerCoffre } from './actions.ts';
  import { etatCoffres, trouverCoffre } from './etat.ts';
  import { accentDe, dateOp, etaObjectif, jourPaieMembre, LIBELLE_OP, partMembre, prochaineDatePaie, sousTitre } from './affichage.ts';
  import FeuilleVerser from './FeuilleVerser.svelte';
  import FeuilleRetrait from './FeuilleRetrait.svelte';
  import Puces from './Puces.svelte';

  let { params }: { params: { id: string } } = $props();
  etatCoffres();
  const c = $derived(trouverCoffre(params.id));
  const pct = $derived(c ? pctCoffre(c.epargne, c.objectif) : 0);
  const atteint = $derived(c ? estAtteint(c.epargne, c.objectif) : false);
  const interets = $derived(c ? c.operations.filter((o) => o.type === 'interet').reduce((t, o) => t + o.montant, 0) : 0);
  const prochain = $derived(c && c.auto && !atteint ? montantAuto(c.epargne, c.objectif, c.mensuel) : 0);
  let verser = $state(false); let retrait = $state(false); let modifier = $state(false);
  let choix = $state<number | null>(null); let libre = $state(''); let erreurMensuel = $state('');
  const nouveau = $derived(libre.trim() ? lireMontant(libre) : choix);

  function ouvrirModifier() { if (!c) return; choix = [10_000, 25_000, 50_000, 100_000].includes(c.mensuel) ? c.mensuel : null; libre = ''; erreurMensuel = ''; modifier = true; }
  function enregistrer() {
    if (!c) return;
    const r = nouveau === null ? ({ ok: false, erreur: `Versement minimum : ${fcfa(MENSUEL_MIN)}.` } as const) : modifierMensuel(c.id, nouveau);
    if (r.ok) { montrer(r.message); modifier = false; } else erreurMensuel = r.erreur;
  }
  function supprimer() { if (!c) return; const r = supprimerCoffre(c.id); if (r.ok) { montrer(r.message); aller('/coffres', { remplacer: true }); } else montrer(r.erreur, 'danger'); }
</script>

{#if !c}
  <Ecran titre="Coffre introuvable" retourVers="/coffres">
    <p class="muted">Ce coffre n'existe plus.</p>
    <Bouton href="/coffres">Retour aux coffres</Bouton>
  </Ecran>
{:else}
  {@const a = accentDe(c.genre)}
  <Ecran titre={c.nom} sur={sousTitre(c)} retourVers="/coffres">
    <Carte accent={a.accent}>
      <div class="hero">
        <div class="ligne"><span class="mono grand">{fcfa(c.epargne)}</span><span class="mono muted">/ {fcfa(c.objectif)}</span></div>
        <Jauge pct={pct} couleur={a.accent} hauteur={10} />
        <div class="ligne"><span class="mono">{pct} %</span>{#if atteint}<Pastille ton="bon">Objectif atteint</Pastille>{:else}<span class="muted">Il manque {fcfa(c.objectif - c.epargne)}</span>{/if}</div>
      </div>
    </Carte>

    <div class="grille">
      <div><span>Versement auto, le {jourPaieMembre()}</span><b class="mono">{c.auto ? (c.partage ? `${fcfa(partMembre(c))} (votre part)` : `${fcfa(c.mensuel)} / mois`) : 'Suspendu'}</b></div>
      <div><span>Prochain versement</span><b class="mono">{prochain > 0 ? jourCourt(prochaineDatePaie()) : '—'}</b></div>
      <div><span>Objectif atteint</span><b class="mono">{etaObjectif(c)}</b></div>
      <div><span>Intérêts · {(TAUX_COFFRE * 100).toLocaleString('fr-FR')} % / an</span><b class="mono bon">+{fcfa(interets)}</b></div>
    </div>

    {#if c.partage}<p class="partage">Coffre partagé entre {c.membres} membres : {fcfa(c.mensuel)} par mois au total, chacun verse {fcfa(partMembre(c))}. Un retrait est notifié à tous.</p>{/if}

    <div class="deux">
      <Bouton onclick={() => (verser = true)} desactive={atteint}>Verser</Bouton>
      <Bouton variante="secondaire" onclick={() => (retrait = true)} desactive={c.epargne <= 0}>Retirer</Bouton>
    </div>
    <Carte>
      <div class="auto">
        <div><b>Versement automatique</b><small>{c.auto ? `Le ${jourPaieMembre()} de chaque mois sur salaire` : 'Suspendu : aucun prélèvement'}</small></div>
        <button class="inter" class:on={c.auto} role="switch" aria-checked={c.auto} aria-label="Versement automatique" onclick={() => { const r = basculerAuto(c.id); if (r.ok) montrer(r.message); }}><i></i></button>
      </div>
      <Bouton variante="discret" onclick={ouvrirModifier}>Modifier le versement mensuel</Bouton>
    </Carte>

    <section aria-labelledby="h-hist"><h3 id="h-hist">Historique</h3>
      {#if c.operations.length === 0}<p class="muted">Aucune opération pour l'instant. Le premier versement partira le {jourLong(prochaineDatePaie())}.</p>
      {:else}<Carte>{#each c.operations.slice(0, 12) as o (o.id)}
        <Ligne ini={o.type === 'interet' ? '%' : o.type === 'retrait' ? '−' : '+'} titre={LIBELLE_OP[o.type]} sous="{dateOp(o.ts)}{o.note && o.type !== 'interet' ? ` · ${o.note}` : ''}" valeur={fcfaSigne(o.montant)} ton={o.montant > 0 ? 'bon' : ''} />
      {/each}</Carte>{/if}
    </section>
    {#if c.epargne === 0}<Bouton variante="danger" onclick={supprimer}>Supprimer ce coffre</Bouton>{/if}
    <div class="espace"></div>
  </Ecran>

  <FeuilleVerser bind:ouverte={verser} coffreId={c.id} />
  <FeuilleRetrait bind:ouverte={retrait} coffreId={c.id} />
  <Feuille bind:ouverte={modifier} titre="Versement mensuel" sous="Chaque {jourPaieMembre()}">
    <Puces nom="Versement mensuel" options={[10_000, 25_000, 50_000, 100_000].map((v) => ({ valeur: v, label: `${v / 1000} k` }))} bind:valeur={choix} onchoix={() => { libre = ''; erreurMensuel = ''; }} />
    <Champ etiquette="Autre montant" placeholder="Ex. 35 000" inputmode="numeric" suffixe="FCFA" bind:valeur={libre} erreur={erreurMensuel} oninput={() => (erreurMensuel = '')} />
    <Bouton onclick={enregistrer}>Enregistrer</Bouton>
    <Bouton variante="discret" onclick={() => (modifier = false)}>Annuler</Bouton>
  </Feuille>
{/if}

<style>
  .hero { display: flex; flex-direction: column; gap: 10px; } .ligne { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13.5px; } .grand { font-size: 32px; font-weight: 500; letter-spacing: -0.03em; }
  .grille { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .grille div { background: var(--carte); border: 1px solid var(--ligne); border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; }
  .grille span { font-size: 11.5px; color: var(--muted); } .grille b { font-size: 14.5px; font-weight: 500; } .bon { color: var(--bon); }
  .partage { font-size: 13px; color: var(--doux); padding: 12px 14px; border-radius: 14px; background: var(--primaire-fond); }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .auto { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 48px; } .auto div { display: flex; flex-direction: column; } .auto small { color: var(--muted); font-size: 12.5px; }
  .inter { width: 52px; height: 32px; border-radius: 16px; background: var(--carte2); border: 1px solid var(--ligne-forte); position: relative; flex: none; transition: background 0.2s; } .inter::before { content: ''; position: absolute; inset: -6px -0px; } .inter i { position: absolute; top: 3px; left: 3px; width: 24px; height: 24px; border-radius: 12px; background: #fff; transition: left 0.2s; }
  .inter.on { background: var(--primaire); border-color: var(--primaire); } .inter.on i { left: 23px; }
  h3 { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); margin-bottom: 8px; }
  .espace { height: 86px; }
</style>
