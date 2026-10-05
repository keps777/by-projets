<script lang="ts">
  // Suivi en dollars (planche SousProjetFinances) : solde du mois, entrées / sorties / épargne, calculs automatiques,
  // sorties par catégorie et mouvements (spec §4, US-21). Montants en centimes, affichés avec @core/units.
  import { fenetreDuMois, joursEcoules, progressionDuMois } from '@core/progression.ts';
  import { resteBudget, solde, tauxEpargne } from '@core/calculs.ts';
  import { formatMontant, formatMontantCourt } from '@core/units.ts';
  import type { Jour, Metrique } from '@core/types.ts';
  import type { SousProjetLigne } from '@core/lignes.ts';
  import Volet from '../../ui/Volet.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Segment from '../../ui/Segment.svelte';
  import Puces from '../../ui/Puces.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { valeursDuSousProjet } from '../../data/requetes.ts';
  import { ajouterMouvement, lireDetail, retirerMouvement, saisiesDuProjet } from './donnees.ts';
  import { jourCourt, lireChamp, rolesFinances } from './vues.ts';

  let { sp, metriques, mois, jour }: { sp: SousProjetLigne; metriques: Metrique[]; mois: string; jour: Jour } = $props();

  const roles = $derived(rolesFinances(metriques));
  const valeurs = $derived(valeursDuSousProjet(sp));
  const f = $derived(fenetreDuMois(sp, mois));
  const prog = (m: Metrique | undefined) => (m ? progressionDuMois(m, sp, valeurs, mois, jour) : null);
  const pE = $derived(prog(roles.entrees));
  const pS = $derived(prog(roles.sorties));
  const pP = $derived(prog(roles.epargne));
  const entrees = $derived(pE?.realise ?? 0);
  const sorties = $derived(pS?.realise ?? 0);
  const leSolde = $derived(solde(entrees, sorties));
  const restants = $derived(f ? f.jours - joursEcoules(f, jour) + 1 : 0);
  const reste = $derived(pS?.cible != null ? resteBudget(Math.round(pS.cible), sorties, Math.max(0, restants)) : null);
  const taux = $derived(roles.epargne ? tauxEpargne(pP?.realise ?? 0, entrees) : null);

  const barres = $derived([
    { nom: roles.entrees?.nom ?? 'Entrées', p: pE, bon: true },
    { nom: roles.sorties?.nom ?? 'Sorties', p: pS, bon: false, moins: true },
    ...(roles.epargne ? [{ nom: roles.epargne.nom, p: pP, bon: false }] : [])
  ]);
  const largeur = (p: typeof pE) => (p?.cible ? Math.min(100, Math.round(((p.realise ?? 0) / p.cible) * 100)) : 0);

  // Mouvements du mois (une valeur de montant par ligne)
  const mouvements = $derived.by(() => {
    if (!f) return [];
    const parCle = new Map(metriques.filter((m) => m.type === 'montant').map((m) => [m.cle, m]));
    const debut = sp.reprise_passe ? f.debut : f.debut > sp.created_at.slice(0, 10) ? f.debut : sp.created_at.slice(0, 10);
    return saisiesDuProjet(sp.projet_id, debut, f.fin).flatMap((s) => s.valeurs.filter((v) => parCle.has(v.cle) && v.valeur_num).map((v) => {
      const m = parCle.get(v.cle)!;
      const d = lireDetail(v.detail);
      const signe = m === roles.sorties ? -1 : m === roles.entrees ? 1 : 0;
      return {
        id: v.id, saisieId: s.saisie.id, manuel: !s.saisie.occurrence_id, jour: s.saisie.jour,
        nom: d.libelle ?? s.saisie.note ?? s.tache?.titre ?? m.nom, cat: d.categorie ?? m.nom,
        sortie: m === roles.sorties, montant: v.valeur_num!, signe
      };
    }));
  });
  const categories = $derived.by(() => {
    const parCat = new Map<string, number>();
    for (const m of mouvements) if (m.sortie) parCat.set(m.cat, (parCat.get(m.cat) ?? 0) + m.montant);
    const total = [...parCat.values()].reduce((s, x) => s + x, 0);
    return [...parCat].sort((a, b) => b[1] - a[1]).map(([nom, v]) => ({ nom, v, pct: total ? Math.round((v / total) * 100) : 0 }));
  });
  const texteMontant = (m: (typeof mouvements)[number]) => `${m.signe < 0 ? '−' : m.signe > 0 ? '+' : ''}${formatMontant(m.montant)}`;

  // Saisir un mouvement
  type Role = 'entrees' | 'sorties' | 'epargne';
  let ouvert = $state(false);
  let role = $state<Role>('sorties');
  let montant = $state('');
  let libelle = $state('');
  let categorie = $state('');
  let quand = $state('');
  let aRetirer = $state<(typeof mouvements)[number] | null>(null);
  const optionsRole = $derived([
    { valeur: 'entrees' as Role, label: 'Entrée' }, { valeur: 'sorties' as Role, label: 'Sortie' },
    ...(roles.epargne ? [{ valeur: 'epargne' as Role, label: 'Épargne' }] : [])
  ]);
  const categoriesConnues = $derived([...new Set([...categories.map((c) => c.nom), 'Logement', 'Alimentation', 'Transport', 'Dons et dîme', 'Loisirs', 'Divers'])].filter((c) => c !== roles.sorties?.nom).slice(0, 8));

  function ouvrir() { ouvert = true; role = 'sorties'; montant = ''; libelle = ''; categorie = ''; quand = jour; }
  function enregistrer() {
    const m = roles[role];
    const c = lireChamp('montant', montant);
    if (!m || !c) { dire('Indique un montant.'); return; }
    if (quand > jour) { dire('Choisis un jour passé ou aujourd’hui.'); return; }
    ajouterMouvement(sp.projet_id, quand, m.cle, c, { libelle, categorie: role === 'sorties' ? categorie : m.nom }, jour);
    dire('Mouvement enregistré');
    ouvert = false;
  }
</script>

<div class="carte bloc">
  <div class="col">
    <span class="etiquette">Solde du mois</span>
    <span class="titre solde" style:color={leSolde >= 0 ? 'var(--bon)' : 'var(--mauvais)'}>{leSolde > 0 ? '+' : ''}{formatMontant(leSolde)}</span>
  </div>
  {#each barres as b (b.nom)}
    <div class="col serre">
      <span class="rang"><span>{b.nom}</span><span class="mono">{formatMontantCourt(Math.round(b.p?.realise ?? 0))}{b.p?.cible != null ? ` / ${formatMontantCourt(Math.round(b.p.cible))}` : ''}</span></span>
      <span class="piste"><span class="rempli" style:width="{largeur(b.p)}%" style:background={b.bon ? 'var(--bon)' : b.moins && (b.p?.ratio ?? 0) > 1 ? 'var(--mauvais)' : 'var(--c)'}></span></span>
    </div>
  {/each}
  <div class="calculs mono">
    <span>Solde = {roles.entrees?.nom ?? 'Entrées'} − {roles.sorties?.nom ?? 'Sorties'}</span>
    {#if reste && pS?.cible != null}
      <span>Reste du budget = {formatMontantCourt(Math.round(pS.cible))} − {roles.sorties?.nom} = {formatMontantCourt(reste.reste)}</span>
      {#if reste.parJour != null && f}<span class="muted">soit {formatMontant(reste.parJour)} par jour jusqu’au {jourCourt(f.fin)}</span>{/if}
    {/if}
    {#if taux != null}<span>Taux d’épargne = {Math.round(taux * 100)} %</span>{/if}
  </div>
</div>

<section class="groupe">
  <span class="etiquette">Sorties par catégorie</span>
  <div class="carte liste-cat">
    {#each categories as x (x.nom)}
      <div class="cat">
        <span class="rang"><span class="gras">{x.nom}</span><span class="mono petit">{formatMontantCourt(x.v)} · {x.pct} %</span></span>
        <span class="piste mince"><span class="rempli" style:width="{x.pct}%"></span></span>
      </div>
    {:else}
      <p class="muted petit vide">Aucune sortie ce mois-ci.</p>
    {/each}
  </div>
</section>

<section class="groupe">
  <div class="rang base"><span class="etiquette">Mouvements</span><span class="muted petit">saisis dans les blocs ou ici</span></div>
  <div class="carte liste">
    {#each mouvements as m (m.id)}
      <button type="button" class="mouvement" disabled={!m.manuel} onclick={() => (aRetirer = m)} aria-label="{m.nom}, {texteMontant(m)}">
        <span class="muted petit">{jourCourt(m.jour)}</span>
        <span class="col min"><span class="gras coupe">{m.nom}</span><span class="muted petit">{m.cat}</span></span>
        <span class="mono" style:color={m.signe > 0 ? 'var(--bon)' : 'var(--texte)'}>{texteMontant(m)}</span>
      </button>
    {:else}
      <p class="muted petit vide">Aucun mouvement ce mois-ci.</p>
    {/each}
    <button type="button" class="ajouter" onclick={ouvrir}><Icone nom="plus" taille={14} trait={2.6} />Saisir un mouvement</button>
  </div>
</section>

<Volet {ouvert} onfermer={() => (ouvert = false)} label="Saisir un mouvement">
  <h2 class="titre">Saisir un mouvement</h2>
  <Segment options={optionsRole} valeur={role} onchoisir={(v) => (role = v)} />
  <label class="champ">Montant ($)
    <!-- svelte-ignore a11y_autofocus -->
    <input class="mono grand-champ" bind:value={montant} inputmode="decimal" placeholder="0,00" autofocus />
  </label>
  <label class="champ">Libellé
    <input bind:value={libelle} placeholder={role === 'entrees' ? 'Ex. Salaire' : 'Ex. Épicerie'} />
  </label>
  {#if role === 'sorties'}
    <div class="champ">Catégorie
      <Puces options={categoriesConnues.map((c) => ({ valeur: c, label: c }))} valeur={categorie || null} couleur="var(--c)" texte="var(--c-sur)" petit onchoisir={(v) => (categorie = v)} />
      <input bind:value={categorie} placeholder="Ou tape une catégorie" aria-label="Catégorie" />
    </div>
  {/if}
  <label class="champ">Jour
    <input type="date" bind:value={quand} max={jour} />
  </label>
  <Bouton grand plein onclick={enregistrer}>Enregistrer</Bouton>
</Volet>

<Volet ouvert={!!aRetirer} onfermer={() => (aRetirer = null)} label="Retirer le mouvement">
  {#if aRetirer}
    <h2 class="titre">Retirer « {aRetirer.nom} » ?</h2>
    <p class="muted">{jourCourt(aRetirer.jour)} · {texteMontant(aRetirer)}. Le solde se recalcule aussitôt.</p>
    <div class="deux">
      <Bouton variante="secondaire" onclick={() => (aRetirer = null)}>Garder</Bouton>
      <Bouton variante="danger" onclick={() => { if (aRetirer) retirerMouvement(aRetirer.saisieId, aRetirer.id); aRetirer = null; dire('Mouvement retiré'); }}>Retirer</Bouton>
    </div>
  {/if}
</Volet>

<style>
  .petit { font-size: 12px; }
  .gras { font-weight: 600; }
  .bloc { border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  .col { display: flex; flex-direction: column; gap: 2px; }
  .col.serre { gap: 6px; }
  .min { min-width: 0; }
  .solde { font-size: 40px; line-height: 1; }
  .rang { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 13px; }
  .rang.base { align-items: baseline; }
  .piste { position: relative; display: block; height: 8px; border-radius: 4px; background: var(--piste); overflow: hidden; }
  .piste.mince { height: 6px; border-radius: 3px; }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--c); animation: remplit 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; transition: width 0.4s ease; }
  @keyframes remplit { from { width: 0; } }
  .calculs { background: var(--surface-2); border-radius: 14px; padding: 10px 12px; display: flex; flex-direction: column; gap: 4px; font-size: 12px; }
  .groupe { display: flex; flex-direction: column; gap: 8px; }
  .liste-cat { border-radius: 20px; padding: 6px 14px; }
  .cat { display: flex; flex-direction: column; gap: 6px; padding: 10px 0; border-bottom: 1px solid var(--ligne); }
  .cat .rang { font-size: 14px; }
  .liste { border-radius: 20px; overflow: hidden; }
  .mouvement { width: 100%; display: grid; grid-template-columns: 48px minmax(0, 1fr) auto; gap: 10px; align-items: center; padding: 10px 14px; border: 0; border-bottom: 1px solid var(--ligne); background: transparent; text-align: left; min-height: 73px; font-size: 14px; }
  .mouvement:disabled { cursor: default; opacity: 1; }
  .coupe { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .vide { padding: 12px 14px; }
  .ajouter { width: 100%; border: 0; background: transparent; color: var(--c-encre); font-size: 14px; font-weight: 600; min-height: 50px; display: flex; align-items: center; justify-content: center; gap: 6px; }
  h2 { font-size: 22px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
  .champ input { height: 48px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 12px; font-size: 16px; }
  .champ .grand-champ { font-size: 22px; height: 54px; }
  .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
</style>
