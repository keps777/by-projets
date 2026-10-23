<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { lignesDe, prochaine, type LigneAvecEffet } from '../../data/paie.ts';
  import { fcfa } from '../../core/money.ts';
  import { jourLong, moisAnnee, nomMois } from '../../core/dates.ts';
  import { PLAFOND_ENDETTEMENT } from '../../core/credit.ts';
  import { totalPrelevement } from '../../core/prelevement.ts';
  import { calendrierPaies, etiquetteMois, pourcent, repartition } from '../../core/calendrier-paie.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Ligne from '../../ui/Ligne.svelte';
  import Panneau from './Panneau.svelte';
  import GraphiqueSalaire from './GraphiqueSalaire.svelte';
  import { lirePaiements } from './etat.ts';
  import { peutReporterLigne, reporterLigne } from './actions.ts';

  const c = $derived(app.compte);
  const paie = $derived(prochaine());
  const lignes = $derived(paie ? lignesDe(paie) : []);
  const rep = $derived(c ? repartition(c.salaireNet, lignes) : null);
  const mois = $derived(paie && c ? calendrierPaies(paie, c.jourPaie, 12) : []);
  const anneeCourante = $derived(new Date(maintenant()).getFullYear());
  let choisi = $state(0), ligneOuverte = $state<LigneAvecEffet | null>(null), feuille = $state(false), confirmeReport = $state<LigneAvecEffet | null>(null), feuilleReport = $state(false);
  const detailMois = $derived(mois[choisi] ? lignesDe(mois[choisi]) : []);
  const totauxMois = $derived(mois.map((m) => totalPrelevement(lignesDe(m))));
  const reportables = $derived(lignes.filter((l) => l.reporter && !l.reporte));
  const aDejaPaie = $derived(!!app.dernierePaie && app.mouvements.some((m) => m.categorie === 'salaire'));
  const reports = $derived(lirePaiements().reports);

  function ouvrir(l: LigneAvecEffet) { ligneOuverte = l; feuille = true; }
  function demanderReport(l: LigneAvecEffet) { confirmeReport = l; feuille = false; feuilleReport = true; }
  function reporter() {
    if (!confirmeReport || !paie) return;
    const l = confirmeReport;
    if (reporterLigne(l, paie)) montrer(`${l.libelle} reportée d'un mois`);
    else montrer('Report impossible : un seul par an', 'danger');
    feuilleReport = false; confirmeReport = null;
  }
</script>

<Ecran titre="Prélèvement sur salaire" sur={paie ? `${moisAnnee(paie).toUpperCase()} · LE ${c?.jourPaie ?? ''}` : ''} retourVers="/">
  {#if !c || !paie || !rep}
    <div class="vide"><Icone nom="calendrier" taille={34} /><b>Pas encore de paie programmée</b><p class="muted">Renseignez votre salaire et votre jour de paie pour voir ce qui sera prélevé.</p><Bouton href="/profil">Compléter mon profil</Bouton></div>
  {:else}
    <section class="entete" aria-label="Total prélevé">
      <div class="r1"><span class="mono lib">TOTAL PRÉLEVÉ</span><span class="mono pct" class:dan={rep.depassePlafond}>{pourcent(rep.part)} % · PLAFOND {Math.round(PLAFOND_ENDETTEMENT * 100)} %</span></div>
      <p class="gros mono" data-testid="total-preleve">{fcfa(rep.preleve)} <small>/ {fcfa(rep.salaire)}</small></p>
      <p class="muted">Prélevé le {jourLong(paie)}, avant le versement : {fcfa(rep.verse)} arrivent sur votre solde.</p>
    </section>

    <GraphiqueSalaire {rep} />

    {#if lignes.length === 0}
      <div class="aucun"><b>Aucun prélèvement ce mois-ci</b><p class="muted">Votre salaire arrive en entier. Un Pass santé, un crédit ou un coffre apparaîtront ici dès qu'ils seront actifs.</p>
        <Bouton variante="secondaire" href="/coffres">Créer un coffre</Bouton></div>
    {:else}
      <div class="liste">
        {#each lignes as l (l.id)}
          <button type="button" class="l" onclick={() => ouvrir(l)} aria-label="{l.libelle}, {fcfa(l.montant)}{l.reporte ? ', reporté' : ''}. Détails">
            <Ligne ini={l.type === 'pass' ? 'PA' : l.type === 'coffre' ? 'CO' : 'CR'} titre={l.libelle} sous={l.detail} valeur={l.reporte ? 'reporté' : fcfa(l.montant)} />
          </button>
        {/each}
      </div>
    {/if}

    <h2 class="mono sous">PROCHAINS MOIS</h2>
    <div class="mois" role="group" aria-label="Calendrier des 12 prochains mois">
      {#each mois as m, i (m)}
        <button type="button" class:on={choisi === i} aria-pressed={choisi === i} onclick={() => (choisi = i)}>
          <span class="mono">{etiquetteMois(m, anneeCourante)}</span><b class="mono" class:zero={totauxMois[i] === 0}>{fcfa(totauxMois[i])}</b>
        </button>
      {/each}
    </div>
    {#if mois[choisi]}
      <section class="detail" aria-live="polite">
        <b>{nomMois(mois[choisi])[0].toUpperCase()}{nomMois(mois[choisi]).slice(1)} · {jourLong(mois[choisi])}</b>
        {#if detailMois.length}<p class="muted">{detailMois.map((l) => `${l.libelle} ${fcfa(l.montant)}`).join(' + ')}</p>{:else}<p class="muted">Aucun prélèvement.</p>{/if}
      </section>
    {/if}

    {#if reportables.length}
      <section class="report">
        <p class="muted"><Icone nom="info" taille={16} /> Un mois difficile ? Vous pouvez reporter une mensualité par an, sans frais ni pénalité.</p>
        {#each reportables as l (l.id)}
          {@const ok = peutReporterLigne(l, paie)}
          <Bouton variante="secondaire" desactive={!ok} onclick={() => demanderReport(l)}>Reporter « {l.libelle} » d'un mois</Bouton>
          {#if !ok}<p class="muted petit">Déjà reporté pour la paie du {reports[l.id] ? jourLong(reports[l.id]) : ''} : un seul report par an.</p>{/if}
        {/each}
      </section>
    {/if}
    <div class="liens">
      <Bouton variante="discret" href="/coffres">Modifier le coffre</Bouton>
      {#if aDejaPaie}<Bouton variante="discret" href="/prelevement/notif">Voir la dernière paie</Bouton>{/if}
    </div>
  {/if}
  <div class="espace"></div>
</Ecran>

<Panneau bind:ouverte={feuille} titre={ligneOuverte?.libelle ?? ''}>
  {#if ligneOuverte}
    <p>{ligneOuverte.detail}</p>
    <div class="kv"><span>Montant prélevé</span><b class="mono">{fcfa(ligneOuverte.montant)}</b></div>
    <div class="kv"><span>Date</span><b>{paie ? jourLong(paie) : ''}</b></div>
    {#if ligneOuverte.reporter && paie}
      <Bouton variante="secondaire" desactive={!peutReporterLigne(ligneOuverte, paie)} onclick={() => demanderReport(ligneOuverte!)}>Reporter d'un mois</Bouton>
    {/if}
    <Bouton onclick={() => (feuille = false)}>Fermer</Bouton>
  {/if}
</Panneau>
<Panneau bind:ouverte={feuilleReport} titre="Reporter d'un mois ?">
  {#if confirmeReport}
    <p>« {confirmeReport.libelle} » ({fcfa(confirmeReport.montant)}) n'est pas prélevé le {paie ? jourLong(paie) : ''} : il est décalé d'un mois.</p>
    <p class="muted">Sans frais ni pénalité, votre score ne bouge pas. Un seul report par an et par prélèvement.</p>
    <div class="pied"><Bouton variante="secondaire" onclick={() => (feuilleReport = false)}>Annuler</Bouton><Bouton onclick={reporter}>Reporter d'un mois</Bouton></div>
  {/if}
</Panneau>

<style>
  .mono { white-space: nowrap; }
  .espace { height: 90px; }
  .vide, .aucun { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 30px 10px; color: var(--muted); } .vide b, .aucun b { color: var(--texte); font-size: 17px; }
  .aucun { background: var(--carte); border: 1px solid var(--ligne); border-radius: 20px; }
  .entete { background: var(--carte); border: 1px solid var(--ligne); border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 6px; }
  .r1 { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; } .lib, .pct { font-size: 10.5px; letter-spacing: 0.1em; color: var(--muted); } .pct { color: var(--bon); } .pct.dan { color: var(--danger); }
  .gros { font-size: 34px; font-weight: 500; letter-spacing: -0.03em; } .gros small { font-size: 15px; color: var(--muted); font-weight: 400; } .entete .muted { font-size: 13px; }
  .liste { background: var(--carte); border: 1px solid var(--ligne); border-radius: 20px; padding: 2px 14px; } .l { width: 100%; text-align: left; display: block; min-height: 56px; } .l + .l { border-top: 1px solid var(--ligne); } .l :global(.l) { border: 0; }
  .sous { font-size: 11px; letter-spacing: 0.12em; color: var(--muted); font-weight: 500; margin-top: 4px; }
  .mois { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .mois button { min-height: 56px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 2px; } .mois button.on { border-color: var(--primaire); background: var(--primaire-fond); }
  .mois span { font-size: 10px; letter-spacing: 0.08em; color: var(--muted); } .mois b { font-size: 13px; font-weight: 500; } .zero { color: var(--faint); }
  .detail { background: var(--carte); border: 1px solid var(--ligne); border-radius: 16px; padding: 12px 14px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; } .detail .muted { font-size: 13px; }
  .report { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 14px; display: flex; flex-direction: column; gap: 10px; } .report .muted { display: flex; gap: 8px; font-size: 13.5px; align-items: flex-start; } .petit { font-size: 12.5px !important; }
  .liens { display: flex; justify-content: space-between; flex-wrap: wrap; } .liens :global(.b) { width: auto; }
  .kv { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--ligne); font-size: 14.5px; } .kv span { color: var(--muted); }
  .pied { display: grid; grid-template-columns: 1fr 2fr; gap: 10px; } .dan { color: var(--danger); }
</style>
