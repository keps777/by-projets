<script lang="ts">
  import { jourLong, moisAnnee } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { avancerSuivi } from './actions.ts';
  import { ent } from './etat.ts';
  import { telecharger } from './nav.ts';
  import { csvRetenues, echeances, NOM_FICHIER, statistiques, type LigneSalarie } from './vues.ts';
  import Statut from './Statut.svelte';

  let { ls }: { ls: LigneSalarie[] } = $props();
  const ech = $derived(echeances(6));
  const cur = $derived(ech[0]);
  const suivi = $derived(cur ? ent().suivi[cur.paie] : undefined);
  const etape = $derived(suivi === 'reverse' ? 2 : suivi === 'integre' ? 1 : 0);
  const inclus = $derived(ls.filter((l) => l.inclus));
  const exclus = $derived(ls.filter((l) => l.statut === 'nouveau'));
  const st = $derived(statistiques(ls));
  const somme = (f: (l: LigneSalarie) => number) => inclus.reduce((s, l) => s + f(l), 0);
  const ETAPES = [['Fichier généré', 'Prêt pour votre logiciel de paie'], ['Intégré à la paie', 'Retenues appliquées le jour de paie'], ['Reversé à AssureMe', 'Sous 2 jours ouvrés après la paie']];
  const LIB = ['Marquer comme intégré à la paie', 'Confirmer le reversement', 'Retenues terminées'];

  function exporter() {
    if (!cur) return;
    if (!inclus.length) { montrer("Aucune retenue validée : le fichier serait vide.", 'danger'); return; }
    telecharger(NOM_FICHIER(cur.paie), csvRetenues(ls, cur.paie));
    montrer(`Fichier de retenues exporté (${inclus.length} salarié${inclus.length > 1 ? 's' : ''})`);
  }
  function avancer() {
    if (!cur) return;
    if (!inclus.length) { montrer('Rien à intégrer : aucune retenue validée.', 'danger'); return; }
    const r = avancerSuivi(cur.paie);
    if (r) montrer(r === 'integre' ? 'Fichier marqué comme intégré à la paie' : 'Reversement confirmé');
  }
</script>

{#if cur}
  <div class="titre">
    <div><h1>Retenues de paie</h1><p class="doux">{moisAnnee(cur.paie)} · à intégrer avant le {jourLong(cur.fichierAvant)}.</p></div>
    <button class="btn prim" onclick={exporter}>Exporter le CSV des retenues</button>
  </div>

  <section class="carte fichier" aria-labelledby="h-f">
    <h2 id="h-f">Fichier de retenues · {moisAnnee(cur.paie)}</h2>
    <p class="total"><b class="mono">{fcfa(st.totalRetenues)}</b> FCFA à retenir sur la paie du {jourLong(cur.paie)}</p>
    <p class="doux">{inclus.length} salarié{inclus.length > 1 ? 's' : ''} dans le fichier. Reversement à AssureMe sous 2 jours ouvrés après la paie, soit au plus tard le {jourLong(cur.reversement)}. Les crédits des salariés au plafond de 33 % sont déjà limités dans le fichier.</p>
    <ol class="frise">
      {#each ETAPES as [t, s], i (t)}
        <li class:fait={i < etape} class:cur={i === etape} aria-current={i === etape && etape < 2 ? 'step' : undefined}><span class="n" aria-hidden="true">{i < etape ? '✓' : i + 1}</span><span><b>{t}</b><small class="doux">{s}</small></span></li>
      {/each}
    </ol>
    <button class="btn noir" onclick={avancer} disabled={etape >= 2}>{LIB[Math.min(etape, 2)]}</button>
  </section>

  <section aria-labelledby="h-d">
    <h2 id="h-d">Détail par salarié</h2>
    {#if inclus.length === 0}
      <div class="carte vide"><p><b>Aucune retenue validée pour cette paie.</b></p><p class="doux">Les retenues apparaissent ici une fois les salariés inscrits et leur retenue validée.</p></div>
    {:else}
      <div class="tableau"><table>
        <caption class="sr">Retenues de {moisAnnee(cur.paie)} par salarié, en FCFA</caption>
        <thead><tr><th scope="col">Matricule</th><th scope="col">Salarié</th><th scope="col" class="num">Pass (part salarié)</th><th scope="col" class="num">Crédits</th><th scope="col" class="num">Coffre</th><th scope="col" class="num">Total</th><th scope="col">Statut</th></tr></thead>
        <tbody>
          {#each inclus as l (l.id)}
            <tr><td class="mono">{l.matricule}</td><td>{l.nom}</td><td class="num mono">{fcfa(l.retenue.pass)}</td><td class="num mono">{fcfa(l.retenue.credit)}</td><td class="num mono">{fcfa(l.retenue.coffre)}</td><td class="num mono"><b>{fcfa(l.retenue.total)}</b></td><td><Statut statut={l.affiche} /></td></tr>
          {/each}
        </tbody>
        <tfoot><tr><th scope="row" colspan="2">Total à retenir</th><td class="num mono">{fcfa(somme((l) => l.retenue.pass))}</td><td class="num mono">{fcfa(somme((l) => l.retenue.credit))}</td><td class="num mono">{fcfa(somme((l) => l.retenue.coffre))}</td><td class="num mono"><b>{fcfa(somme((l) => l.retenue.total))}</b></td><td></td></tr></tfoot>
      </table></div>
    {/if}
    {#if exclus.length}
      <p class="doux note"><b>{exclus.length} retenue{exclus.length > 1 ? 's' : ''} non incluse{exclus.length > 1 ? 's' : ''}</b> (à valider dans la fiche du salarié) : {exclus.map((l) => l.nom).join(', ')}.</p>
    {/if}
  </section>

  <section aria-labelledby="h-c">
    <h2 id="h-c">Calendrier de paie</h2>
    <div class="tableau"><table>
      <caption class="sr">Prochaines paies</caption>
      <thead><tr><th scope="col">Paie</th><th scope="col">Fichier à intégrer avant le</th><th scope="col">Reversement à AssureMe avant le</th></tr></thead>
      <tbody>{#each ech as x, i (x.paie)}<tr><th scope="row" class="nom">{jourLong(x.paie)}{#if i === 0} <span class="puce primaire">En cours</span>{/if}</th><td>{jourLong(x.fichierAvant)}</td><td>{jourLong(x.reversement)}</td></tr>{/each}</tbody>
    </table></div>
  </section>
{/if}

<style>
  .titre { display: flex; justify-content: space-between; gap: 12px; align-items: flex-start; flex-wrap: wrap; }
  .fichier { display: flex; flex-direction: column; gap: 12px; align-items: flex-start; } .total { font-size: 18px; } .total b { font-size: 28px; }
  .frise { list-style: none; display: grid; gap: 10px; width: 100%; grid-template-columns: 1fr; } @media (min-width: 760px) { .frise { grid-template-columns: repeat(3, 1fr); } }
  .frise li { display: flex; gap: 12px; align-items: flex-start; padding: 12px; border-radius: 14px; border: 1px solid var(--ligne); } .frise li.cur { border: 2px solid var(--texte); padding: 11px; } .frise li.fait { background: var(--primaire-fond); border-color: var(--primaire); }
  .frise .n { width: 28px; height: 28px; border-radius: 14px; flex: none; display: grid; place-items: center; font: 600 13px var(--mono); background: var(--ligne-forte); color: var(--texte); }
  .frise li.cur .n { background: var(--texte); color: var(--carte); } .frise li.fait .n { background: var(--primaire); color: #fff; } .frise b { display: block; } .frise small { display: block; }
  section > h2 { margin-bottom: 10px; } .vide { text-align: center; padding: 28px; } .note { margin-top: 10px; font-size: 13.5px; }
  tfoot th, tfoot td { background: var(--carte2); font-weight: 600; border-top: 1px solid var(--ligne-forte); } .nom { font-family: var(--sans); font-size: 14px; letter-spacing: 0; text-transform: none; color: var(--texte); background: none; font-weight: 600; }
  tfoot th { text-transform: none; font-family: var(--sans); letter-spacing: 0; font-size: 14px; color: var(--texte); }
</style>
