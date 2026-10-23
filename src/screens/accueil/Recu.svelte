<script lang="ts">
  import { app } from '../../data/store.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { dateRecu, texteRecu } from '../../core/recu-paiement.ts';
  import { pctPlafond } from '../../core/sante.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Jauge from '../../ui/Jauge.svelte';
  import Panneau from './Panneau.svelte';
  import Pict from './Pict.svelte';
  import { dernierRecu, recuParRef } from './actions.ts';

  const r = $derived(recuParRef(param('ref')) ?? (param('ref') ? undefined : dernierRecu()));
  let partage = $state(false), avecDetail = $state(false);
  const police = $derived(app.compte ? `FAM-2026-${app.compte.numeroMembre.replace(/\D/g, '')}` : '');
  const sante = $derived(r?.categorie === 'sante' && r.plafondTotal != null);
  const texte = $derived(r ? texteRecu(r, avecDetail) : '');

  async function copier(valeur: string, message: string) {
    try { await navigator.clipboard.writeText(valeur); montrer(message); } catch { montrer('Copie impossible', 'danger'); }
  }
  async function partager() {
    if (!r) return;
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: `Reçu AssureMe ${r.ref}`, text: texte }); return; } catch (e) { if ((e as Error).name === 'AbortError') return; }
    }
    partage = true;
  }
  const whatsapp = $derived(`https://wa.me/?text=${encodeURIComponent(texte)}`);
  function imprimer() { montrer('Choisissez « Enregistrer au format PDF »'); setTimeout(() => window.print(), 400); }
</script>

<Ecran titre="Reçu" retourVers="/">
  {#snippet droite()}
    {#if r}<div class="outils"><button type="button" onclick={imprimer} aria-label="Télécharger le PDF"><Pict nom="telecharger" taille={19} /></button><button type="button" onclick={partager} aria-label="Partager le reçu"><Pict nom="partage" taille={19} /></button></div>{/if}
  {/snippet}

  {#if !r}
    <div class="vide"><Icone nom="document" taille={34} /><b>Reçu introuvable</b><p class="muted">Ce reçu n'existe pas (ou plus) sur cet appareil.</p><Bouton href="/">Retour à l'accueil</Bouton></div>
  {:else}
    <article class="recu" aria-label="Reçu {r.ref}">
      <div class="marque"><span class="logo" aria-hidden="true"><Icone nom="protection" taille={22} /></span><b>Assure<span>Me</span></b></div>
      <div class="ref mono"><span>{r.ref}</span><span>{dateRecu(r.ts)}</span></div>
      <div class="part"><b>{r.partenaire}</b>{#if r.lieu || r.beneficiaire}<small>{[r.lieu, r.beneficiaire ? `Patient(e) : ${r.beneficiaire}` : ''].filter(Boolean).join(' · ')}</small>{/if}</div>
      <ul class="lignes">{#each r.lignes as l (l.nom)}<li><span>{l.nom}</span><b class="mono">{fcfa(l.montant)}</b></li>{/each}</ul>
      <div class="tot"><span>Total</span><b class="mono">{fcfa(r.total)}</b></div>
      {#if r.priseEnCharge > 0}<div class="am"><span>Pris en charge par AssureMe ({Math.round((r.priseEnCharge / r.total) * 100)} %)</span><b class="mono">− {fcfa(r.priseEnCharge)}</b></div>{/if}
      <div class="paye"><span>{r.mode === 'etale' ? `Payé par vous, en ${r.mois} fois` : 'Payé par vous'}</span><b class="mono">{fcfa(r.paye)}</b></div>
      {#if r.mode === 'etale'}<p class="muted petit">{fcfa(r.mensualite ?? 0)} par mois, prélevés sur votre salaire (frais 1,5 % par mois inclus).</p>{/if}
      {#if sante}
        <p class="petit muted">Assureur : [ASSUREUR AGRÉÉ CIMA]</p>
        <button type="button" class="police mono" onclick={() => copier(police, 'Numéro de police copié')}>POLICE {police}</button>
      {/if}
    </article>

    {#if sante && r.plafondTotal != null && r.plafondRestant != null}
      <section class="plafond" aria-label="Plafond santé">
        <div><span>Reste de plafond santé 2026</span><b class="mono">{fcfa(r.plafondRestant)}</b></div>
        <Jauge pct={pctPlafond(r.plafondTotal - r.plafondRestant, r.plafondTotal)} couleur="var(--bon)" />
        <small class="mono">{fcfa(r.plafondTotal - r.plafondRestant)} UTILISÉS SUR {fcfa(r.plafondTotal)}</small>
      </section>
      <div class="liens">
        <a href="/sante" onclick={(e) => { e.preventDefault(); aller('/sante'); }}><Icone nom="pharmacie" /><span><b>Ordonnance</b><small>Livraison pharmacie en 2 h</small></span></a>
        <a href="/sante" onclick={(e) => { e.preventDefault(); aller('/sante'); }}><Icone nom="document" /><span><b>Carnet de santé</b><small>Résultats d'analyses à J+1</small></span></a>
      </div>
    {/if}
    <Bouton href="/">Terminé</Bouton>
  {/if}
</Ecran>

<Panneau bind:ouverte={partage} titre="Partager le reçu">
  <p class="muted">Partagez le reçu seulement avec une personne de confiance (autre assureur, employeur, médecin).</p>
  <label class="det"><input type="checkbox" bind:checked={avecDetail} /> <span>Inclure le détail des soins <small>(masqué par défaut)</small></span></label>
  <pre class="apercu">{texte}</pre>
  <a class="wa" href={whatsapp} target="_blank" rel="noopener noreferrer" onclick={() => (partage = false)}>Envoyer par WhatsApp</a>
  <Bouton variante="secondaire" onclick={() => { copier(texte, 'Texte du reçu copié'); partage = false; }}><Pict nom="copier" taille={18} />Copier le texte</Bouton>
</Panneau>

<style>
  .mono { white-space: nowrap; }
  .outils { display: flex; gap: 4px; } .outils button { width: 44px; height: 44px; display: grid; place-items: center; border-radius: 22px; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 40px 10px; color: var(--muted); } .vide b { color: var(--texte); font-size: 17px; }
  .recu { background: var(--carte); border: 1px solid var(--ligne); border-radius: 22px; padding: 20px; display: flex; flex-direction: column; gap: 12px; }
  .marque { display: flex; align-items: center; gap: 10px; font-size: 20px; letter-spacing: -0.03em; } .marque span { color: var(--primaire-clair); } .logo { width: 34px; height: 34px; border-radius: 10px; background: var(--primaire); color: #fff; display: grid; place-items: center; }
  .ref { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; font-size: 11px; letter-spacing: 0.06em; color: var(--muted); }
  .part { display: flex; flex-direction: column; padding-bottom: 12px; border-bottom: 1px dashed var(--ligne-forte); } .part b { font-size: 17px; } .part small { color: var(--muted); font-size: 12.5px; }
  .lignes { list-style: none; display: flex; flex-direction: column; gap: 8px; } .lignes li, .tot, .am, .paye { display: flex; justify-content: space-between; gap: 10px; font-size: 14px; color: var(--doux); }
  .tot { padding-top: 10px; border-top: 1px solid var(--ligne); color: var(--texte); font-weight: 600; } .am { color: var(--bon); } .paye { color: var(--texte); font-weight: 650; font-size: 17px; } .paye b { font-size: 22px; }
  .petit { font-size: 12.5px; } .police { align-self: flex-start; min-height: 44px; padding: 0 12px; border-radius: 10px; background: var(--carte2); font-size: 11px; letter-spacing: 0.06em; color: var(--doux); }
  .plafond { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; } .plafond div { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; font-size: 14px; } .plafond b { font-size: 18px; } .plafond small { font-size: 10.5px; color: var(--muted); letter-spacing: 0.06em; }
  .liens { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .liens a { display: flex; gap: 10px; align-items: center; padding: 12px; min-height: 64px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); } .liens span { display: flex; flex-direction: column; } .liens b { font-size: 14px; } .liens small { color: var(--muted); font-size: 11.5px; }
  .det { display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 14px; } .det input { width: 20px; height: 20px; accent-color: var(--primaire); } .det small { color: var(--muted); }
  .apercu { white-space: pre-wrap; background: var(--carte2); border-radius: 12px; padding: 12px; font: 12.5px var(--mono); color: var(--doux); }
  .wa { display: flex; align-items: center; justify-content: center; min-height: 52px; border-radius: 16px; background: #25d366; color: #07230f; font-weight: 650; }
  @media print { :global(nav), :global(.toast), .outils, :global(footer) { display: none !important; } }
</style>
