<script lang="ts">
  import { texteAttestation } from '../../core/attestation.ts';
  import { jourDe } from '../../core/dates.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { ent } from './etat.ts';
  import { copier, telecharger } from './nav.ts';
  import Panneau from './Panneau.svelte';

  /** Identifiant de l'attestation à afficher ; null : fermé. */
  let { id = $bindable(null) }: { id: string | null } = $props();
  const t = $derived(ent());
  const a = $derived(t.attestations.find((x) => x.id === id) ?? null);
  const e = $derived(t.entreprise);
  const paragraphes = $derived(a && e ? texteAttestation({ numero: a.numero, employeur: e.raisonSociale, ville: e.ville, signataire: e.contact.nom, fonction: e.contact.fonction, salarie: a.salarie, matricule: a.matricule, salaire: a.salaire, jourPaie: e.jourPaie, anciennete: t.salaries.find((x) => x.id === a.salarieId)?.anciennete, date: jourDe(new Date(a.ts)) }) : []);
  let ouvert = $state(false);
  $effect(() => { ouvert = !!a; });
  $effect(() => { if (!ouvert) id = null; });
  $effect(() => { document.body.classList.toggle('imprime-attestation', ouvert); return () => document.body.classList.remove('imprime-attestation'); });
  const texte = $derived(a && e ? [`ATTESTATION DE SALAIRE N° ${a.numero}`, e.raisonSociale, '', ...paragraphes.flatMap((p) => [p, '']), `${e.contact.nom}, ${e.contact.fonction}`].join('\n') : '');
  async function copie() { montrer((await copier(texte)) ? 'Texte copié' : 'Copie impossible sur cet appareil', 'bon'); }
</script>

<Panneau bind:ouvert titre={a ? `Attestation ${a.numero}` : 'Attestation'} sous="Aperçu avant impression" large>
  {#if a && e}
    <article class="attestation">
      <header><b>{e.raisonSociale}</b><span>{e.ville} · RCCM {e.rccm} · NIU {e.niu}</span></header>
      <h3>Attestation de salaire n° {a.numero}</h3>
      {#each paragraphes as p (p)}<p>{p}</p>{/each}
      <p class="signature"><b>{e.contact.nom}</b><br />{e.contact.fonction}</p>
    </article>
    <div class="barre">
      <button class="btn prim" onclick={() => window.print()}>Imprimer</button>
      <button class="btn" onclick={() => telecharger(`attestation-${a.numero}.txt`, texte, 'text/plain;charset=utf-8')}>Télécharger (.txt)</button>
      <button class="btn" onclick={copie}>Copier le texte</button>
    </div>
  {/if}
</Panneau>

<style>
  .attestation { background: #fff; color: #111; border: 1px solid var(--ligne-forte); border-radius: 8px; padding: 28px; display: flex; flex-direction: column; gap: 14px; line-height: 1.5; font-family: Georgia, 'Times New Roman', serif; }
  header { display: flex; flex-direction: column; gap: 2px; border-bottom: 1px solid #ccc; padding-bottom: 12px; } header span { font-size: 12.5px; color: #555; font-family: var(--sans); }
  h3 { text-align: center; font-size: 18px; text-transform: uppercase; letter-spacing: 0.04em; margin: 8px 0; } .signature { margin-top: 18px; text-align: right; }
  .barre { display: flex; gap: 10px; flex-wrap: wrap; }
  @media print {
    :global(body.imprime-attestation #app), :global(body.imprime-attestation .voile), :global(body.imprime-attestation .toast) { display: none !important; }
    :global(body.imprime-attestation) { background: #fff; }
    :global(body.imprime-attestation .pe.fenetre) { position: static !important; width: 100% !important; max-height: none !important; box-shadow: none !important; animation: none !important; border-radius: 0; }
    :global(body.imprime-attestation .pe.fenetre > header), .barre { display: none !important; }
    .attestation { border: 0; padding: 0; }
  }
</style>
