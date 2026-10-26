<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { droitDe } from '../../domain/marche.ts';
  import { brouillonDe, type CasErreur, type Motif } from '../../domain/transfert.ts';
  import { va } from '../voyager/lien.ts';
  import CarteDroit from './CarteDroit.svelte';
  import { actionsErreur, resumeDroit, textesErreur, type ActionErreur } from './vues.ts';

  /** « Transfert non effectué » : la raison de l'échec (réseau, droit non transférable, échéance, destinataire inactif, incident), l'état réel du droit, et la suite. Rien n'a changé. */
  let { droitId, cas, motif, versNom, incident, echeance }: { droitId: string; cas: CasErreur; motif?: Motif; versNom?: string; incident?: string; echeance?: number } = $props();
  const droit = $derived(droitDe(droitId));
  const resume = $derived(droit ? resumeDroit(app.monde, droit) : undefined);
  const t = $derived(textesErreur(cas, { versNom, motif, echeance }));
  const acts = $derived(actionsErreur(cas, motif));
  const id = $derived(encodeURIComponent(droitId));
  const lien = (a: ActionErreur): string => a === 'reessayer' ? (brouillonDe(droitId)?.versId ? `/transferer/${id}/confirmer` : `/transferer/${id}`) : a === 'choisir' ? `/transferer/${id}` : a === 'billet' ? `/droit/${id}` : '/portefeuille';
  const LIBELLES: Record<ActionErreur, string> = { reessayer: 'Réessayer le transfert', choisir: 'Choisir un autre proche', billet: 'Revenir au billet', portefeuille: 'Retour au portefeuille' };
</script>

<Ecran titre="Transfert" face="nuit" retour={`/droit/${id}`}>
  <div class="boite" role="alert">
    <p class="kicker"><Icone nom="info" taille={18} />Transfert non effectué</p>
    <h1 class="grand">{t.titre}</h1>
    <p class="t1">{t.texte1}</p>
    <p class="t2">{t.texte2}</p>
    {#if t.technique && incident}<p class="incident">Référence de l’incident : {incident} (démo)</p>{/if}
  </div>
  {#if resume}
    <section class="col g8" aria-labelledby="etat-h">
      <h2 id="etat-h" class="sec-t">État du droit</h2>
      <CarteDroit {resume} />
      {#if t.technique && incident}<p class="t-sec">Si l’échec persiste, contactez le support en indiquant la référence de l’incident.</p>{/if}
    </section>
  {/if}
  {#snippet pied()}
    <a class="btn" href={lien(acts.principale)} onclick={(e) => va(e, lien(acts.principale))}>
      {#if acts.principale === 'reessayer'}<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>{/if}{LIBELLES[acts.principale]}
    </a>
    {#if acts.secondaire}<a class="btn texte autre" href={lien(acts.secondaire)} onclick={(e) => va(e, lien(acts.secondaire!))}>{LIBELLES[acts.secondaire]}</a>{/if}
  {/snippet}
</Ecran>

<style>
  .boite { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; background: rgba(255, 123, 123, 0.12); border: 1px solid rgba(255, 123, 123, 0.4); }
  .kicker { display: flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--err); }
  .grand { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; text-wrap: balance; }
  .t1 { font: 400 15px/22px 'Barlow', sans-serif; } .t2 { font: 400 14px/20px 'Barlow', sans-serif; color: var(--ink2); }
  .incident { font: 500 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); overflow-wrap: anywhere; }
  .sec-t { font: 600 22px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; }
  .autre { align-self: center; }
</style>
