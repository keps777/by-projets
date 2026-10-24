<script lang="ts">
  import { fcfa } from '../../core/money.ts';
  import { totalEcarts } from '../../core/rapprochement.ts';
  import { app } from '../../data/store.svelte.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import Defile from './Defile.svelte';
  import { injecterDemo } from './demo.ts';
  import { lireSiege } from './etat.ts';
  import { heureCourte } from './format.ts';
  import Lien from './Lien.svelte';
  import { associerTransaction, etatRapprochement, messageRapprochement, releveComplet, rembourserTransaction } from './rapprochementMonde.ts';
  import Siege from './Siege.svelte';

  injecterDemo();
  const moi = personneCourante();
  const rap = $derived(etatRapprochement());
  const decisions = $derived(lireSiege().decisions);
  /** Transactions à traiter, puis celles déjà décidées (affichées « associée » / « remboursée »). */
  const lignes = $derived({ ouvertes: [...rap.ecarts].sort((a, b) => b.tx.ts - a.tx.ts), faites: Object.entries(decisions).map(([ref, d]) => ({ ref, d, tx: releveComplet().find((t) => t.ref === ref) })) });
  const total = $derived(lignes.ouvertes.length + lignes.faites.length);
  const montantOuvert = $derived(totalEcarts(rap.ecarts));
  const finis = $derived(lignes.ouvertes.length === 0);
  let erreur = $state(''), choix = $state<Record<string, string>>({});
  const billet = (id: string) => app.monde.billets.find((b) => b.id === id);
  const nomPayeur = (paiementId?: string) => { const p = app.monde.paiements.find((x) => x.id === paiementId); return p ? personne(p.payeurId) : undefined; };
  const tel = (n: string) => (n.length === 9 ? `${n[0]} ${n.slice(1, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}` : n);
  function associer(ref: string, billetId: string) { try { const b = associerTransaction(ref, billetId, moi?.id); erreur = ''; montrer(`Transaction associée au billet ${b.code}`); } catch (e) { erreur = messageRapprochement((e as Error).message); montrer(erreur, 'er'); } }
  function rembourser(ref: string) { try { rembourserTransaction(ref, moi?.id); erreur = ''; montrer('Remboursement demandé à l’opérateur · 5 min'); } catch (e) { erreur = messageRapprochement((e as Error).message); montrer(erreur, 'er'); } }
</script>

<Siege actif="comptable" section="comptable">
  <div class="top">
    <div class="row g12"><Lien href="/siege/comptable" class="ib" aria-label="Retour à la comptabilité"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Lien>
      <div class="col"><h1 class="ttl">Rapprochement MoMo</h1><span class="t13 mut" aria-live="polite">{lignes.ouvertes.length} transaction{lignes.ouvertes.length > 1 ? 's' : ''} sans vente AfriMove en face · {fcfa(montantOuvert)} F</span></div></div>
    <button type="button" class="b p sm {finis ? '' : 'off'}" disabled={!finis} onclick={() => { montrer('Rapprochement terminé'); aller('/siege/comptable'); }}>Terminer le rapprochement</button>
  </div>
  {#if erreur}<p class="alerte" role="alert">{erreur}</p>{/if}

  <div class="gl">
      <Defile label="Transactions sans correspondance" ><table class="tbl"><thead><tr><th scope="col">Réf. opérateur</th><th scope="col">Heure</th><th scope="col">Numéro</th><th scope="col" class="r">Montant</th><th scope="col" class="libre">Piste</th><th scope="col">Décision</th></tr></thead><tbody>
        {#each lignes.ouvertes as e (e.tx.ref)}
          {@const payeur = nomPayeur(e.paiementId)}
          <tr><td class="mono">{e.tx.ref}</td><td class="mono">{heureCourte(e.tx.ts)}</td><td class="mono">{tel(e.tx.numero)}</td><td class="r mono">{fcfa(e.tx.montant)}</td>
            <td class="libre t13 mut">{e.piste}{payeur ? ` · payé par ${payeur.prenom} ${payeur.nom}` : ''}</td>
            <td><div class="col g6" style="min-width: 190px">
              {#if e.candidats.length}
                <label class="sr" for="b-{e.tx.ref}">Billet à associer à {e.tx.ref}</label>
                <select id="b-{e.tx.ref}" class="in" value={choix[e.tx.ref] ?? e.candidats[0]} onchange={(ev) => (choix[e.tx.ref] = ev.currentTarget.value)}>{#each e.candidats as id (id)}{@const b = billet(id)}<option value={id}>{b?.code} · {b?.passager.nom}</option>{/each}</select>
              {:else}<span class="t12 mut3" id="np-{e.tx.ref}">{e.motif === 'doublon' ? 'Un doublon ne s’associe pas.' : 'Aucun billet de ce montant à associer.'}</span>{/if}
              <div class="row g6"><button type="button" class="b s sm xs" disabled={!e.candidats.length} aria-describedby={e.candidats.length ? undefined : `np-${e.tx.ref}`} onclick={() => associer(e.tx.ref, choix[e.tx.ref] ?? e.candidats[0])}>Associer</button><button type="button" class="b g sm xs" onclick={() => rembourser(e.tx.ref)}>Rembourser</button></div>
            </div></td></tr>
        {/each}
        {#each lignes.faites as f (f.ref)}<tr><td class="mono">{f.ref}</td><td class="mono">{f.tx ? heureCourte(f.tx.ts) : '—'}</td><td class="mono">{f.tx ? tel(f.tx.numero) : '—'}</td><td class="r mono">{f.tx ? fcfa(f.tx.montant) : '—'}</td><td class="libre t13 mut">{f.d.type === 'associe' ? `associée au billet ${billet(f.d.billetId ?? '')?.code ?? ''}` : 'remboursement demandé à l’opérateur'} · par {personne(f.d.par)?.prenom ?? '—'}</td><td><span class="pl {f.d.type === 'associe' ? 'ok' : 'inf'}">{f.d.type === 'associe' ? 'associée' : 'remboursée'}</span></td></tr>{/each}
        {#if total === 0}<tr><td colspan="6" class="vide-etat">Aucune transaction sans correspondance : tout le relevé est rapproché.</td></tr>{/if}
      </tbody></table></Defile>
  </div>
  <div class="c3">
      <div class="gl ac"><span class="t15 b7">Comment ça arrive</span><p class="t13 mut" style="margin: 6px 0 0">Le client valide MoMo, mais la vente n’est pas revenue (réseau coupé au guichet). Associer = retrouver la vente hors ligne synchronisée plus tard. Rembourser = MTN renvoie l’argent en 5 min.</p></div>
      <div class="gl"><span class="t15 b7">Avancement</span><div class="row sp" style="margin-top: 6px"><span class="t13 mut">traitées</span><b>{lignes.faites.length} / {total}</b></div><div class="bar" role="img" aria-label="{lignes.faites.length} traitées sur {total}" style="margin-top: 6px"><i style="width: {total ? Math.round((lignes.faites.length / total) * 100) : 100}%"></i></div></div>
      <Lien href="/litige" class="b s sm">Voir les litiges clients liés</Lien>
  </div>
</Siege>
