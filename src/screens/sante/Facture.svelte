<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { ecartJours, jourCourt, jourLong, quand } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { CATEGORIES } from '../../core/sante-facture.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { etalerFacture, payerFacture, simulerEtalement } from './actions.ts';
  import { aujourdhui, couvertureDe, initSante, enRetard, facturesDuMembre } from './etat.ts';
  initSante();

  let { params = {} }: { params?: Record<string, string> } = $props();
  const f = $derived(facturesDuMembre().find((x) => x.id === params.id));
  let mode = $state<'comptant' | 'etale'>('comptant'); let ouvert = $state(-1); let erreur = $state(''); let tiers = $state(false);
  let fait = $state<{ mode: 'comptant' | 'etale'; mensualite?: number } | null>(null);
  const c = $derived(couvertureDe());
  const sim = $derived(f && f.statut === 'a_regler' ? simulerEtalement(f) : null);
  const manque = $derived(f ? Math.max(0, f.partPatient - app.solde) : 0);
  const joursRestants = $derived(f ? ecartJours(aujourdhui(), f.echeance) : 0);
  const peutConfirmer = $derived(mode === 'comptant' ? manque === 0 : !!sim?.approuve);

  function confirmer() {
    if (!f) return; erreur = '';
    const r = mode === 'comptant' ? payerFacture(f.id) : etalerFacture(f.id);
    if (r.ok) fait = { mode, mensualite: (r as { mensualite?: number }).mensualite }; else erreur = r.erreur;
  }
  const taux = (cat: keyof typeof CATEGORIES) => (c ? Math.round((CATEGORIES[cat].pharmacie ? c.pharmacie : c.taux) * 100) : 0);
</script>

<Ecran titre="Facture santé" sur={f?.etablissement ?? ''} retourVers="/sante">
  {#if !f}
    <Carte><p class="vide"><b>Facture introuvable.</b></p><p class="muted">Elle a peut-être été supprimée, ou elle ne concerne pas ce compte.</p></Carte>
    <Bouton href="/sante">Retour à la santé</Bouton>
  {:else if fait}
    <Carte accent="var(--bon)" rayon={26}>
      <div class="ok"><span class="coche"><Icone nom="ok" taille={26} trait={2.4} /></span>
        <h2>{fait.mode === 'comptant' ? 'Facture réglée' : 'Part étalée sur 3 mois'}</h2>
        <p class="muted">{fait.mode === 'comptant' ? `${fcfa(f.partPatient)} FCFA débités, ${f.etablissement} est payée.` : `${fcfa(fait.mensualite ?? 0)} FCFA prélevés sur votre salaire chaque mois, à partir de la prochaine paie.`}</p></div>
    </Carte>
    <Carte><dl><div><dt>Facture</dt><dd class="mono">{f.numero}</dd></div><div><dt>Pris en charge par AssureMe</dt><dd class="mono">{fcfa(f.assureMe)}</dd></div><div><dt>Votre part</dt><dd class="mono">{fcfa(f.partPatient)}</dd></div></dl></Carte>
    <Bouton href="/sante">Retour à la santé</Bouton>
    {#if fait.mode === 'etale'}<Bouton variante="secondaire" href="/prelevement">Voir mes prélèvements</Bouton>{/if}
  {:else}
    <Carte>
      <div class="tete"><div><b>{f.etablissement}</b><small>Facture {f.numero} · {jourLong(f.date)}</small><small>{f.patient}{f.medecin ? ` · ${f.medecin}` : ''}</small></div>
        <button class="tp" onclick={() => (tiers = true)} aria-label="Qu'est-ce que le tiers payant ?"><Pastille ton="bon">Tiers payant</Pastille></button></div>
    </Carte>

    <Carte rayon={20}>
      <ul class="lignes">
        {#each f.lignes as l, i (i)}
          {@const part = Math.round(l.montant * (c ? (CATEGORIES[l.categorie].pharmacie ? c.pharmacie : c.taux) : 0))}
          <li>
            <button aria-expanded={ouvert === i} onclick={() => (ouvert = ouvert === i ? -1 : i)}><span class="lm"><b>{l.nom}</b><small>{l.sous || CATEGORIES[l.categorie].libelle}</small></span><span class="mono">{fcfa(l.montant)}</span></button>
            {#if ouvert === i}<div class="ld"><div><span>AssureMe ({taux(l.categorie)} %)</span><b class="mono">{fcfa(part)}</b></div><div><span>Votre part ({100 - taux(l.categorie)} %)</span><b class="mono">{fcfa(l.montant - part)}</b></div><small>{CATEGORIES[l.categorie].libelle}</small></div>{/if}
          </li>
        {/each}
      </ul>
      <div class="tot"><div><span>Total facture</span><b class="mono">{fcfa(f.total)}</b></div><div><span>AssureMe paie la clinique · {Math.round((f.assureMe / f.total) * 100)} %</span><b class="mono bon">{fcfa(f.assureMe)}</b></div>
        <div class="part"><span>Votre part</span><b class="mono">{fcfa(f.partPatient)}</b></div></div>
      {#if f.plafondDepasse}<p class="avert" role="note"><Icone nom="attention" taille={16} />Plafond annuel atteint : l'excédent est à votre charge.</p>{/if}
    </Carte>

    {#if f.statut === 'a_regler'}
      <div class="ech" class:retard={enRetard(f)} role="status">{#if enRetard(f)}<Icone nom="attention" taille={16} /> Échéance dépassée le {jourCourt(f.echeance)}. Vous pouvez régler quand vous voulez, sans pénalité.{:else}<Icone nom="calendrier" taille={16} /> À régler avant le {jourLong(f.echeance)}{joursRestants >= 0 ? ` (${joursRestants === 0 ? "aujourd'hui" : `dans ${joursRestants} j`})` : ''}. Un paiement à l'heure améliore votre score.{/if}</div>
      <h3>Votre part, comment ?</h3>
      <div class="modes" role="radiogroup" aria-label="Mode de règlement">
        <button role="radio" aria-checked={mode === 'comptant'} class:on={mode === 'comptant'} onclick={() => (mode = 'comptant')}><span class="rond" aria-hidden="true"></span><span class="mt"><b>Payer maintenant</b><small>Depuis votre solde de {fcfa(app.solde)}</small></span><span class="mono">{fcfa(f.partPatient)}</span></button>
        <button role="radio" aria-checked={mode === 'etale'} class:on={mode === 'etale'} onclick={() => (mode = 'etale')}><span class="rond" aria-hidden="true"></span><span class="mt"><b>Étaler sur 3 mois</b><small>Sur salaire · frais {sim ? (sim.taux * 100).toLocaleString('fr-FR', { maximumFractionDigits: 1 }) : '1,5'} % par mois</small></span><span class="mono">{sim && sim.mensualite ? `${fcfa(sim.mensualite)} / mois` : '—'}</span></button>
      </div>
      {#if mode === 'comptant' && manque > 0}<p class="err" role="alert">Solde insuffisant : il vous manque {fcfa(manque)} FCFA. Rechargez votre compte ou étalez votre part.</p>{/if}
      {#if mode === 'etale' && sim}
        <Carte rayon={18}>
          <h4>Étude de votre demande</h4>
          <ul class="ctrl">{#each sim.controles as k (k.id)}<li class:ko={!k.ok}><span class="pt" aria-hidden="true"><Icone nom={k.ok ? 'ok' : 'fermer'} taille={14} trait={2.4} /></span><span><b>{k.titre}</b><small>{k.ok ? 'Conforme' : 'Non conforme'} · {k.tag}</small></span></li>{/each}</ul>
          {#if sim.mensualite}<dl><div><dt>Mensualité</dt><dd class="mono">{fcfa(sim.mensualite)} × {sim.mois}</dd></div><div><dt>Coût de l'étalement</dt><dd class="mono">{fcfa(sim.frais)}</dd></div><div><dt>Mensualités / salaire net</dt><dd class="mono">{Math.round(sim.partApres * 100)} % (max 33 %)</dd></div></dl>{/if}
          {#if !sim.approuve}<p class="err" role="alert">{sim.motif}</p>{/if}
        </Carte>
      {/if}
      {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
    {:else}
      <Carte accent="var(--bon)"><div class="tete"><div><b>{f.statut === 'etalee' ? 'Part étalée sur 3 mois' : 'Facture réglée'}</b>
        <small>{f.paiement ? `${quand(f.paiement.ts, maintenant())}${f.paiement.mode === 'etale' ? ` · ${fcfa(f.paiement.mensualite ?? 0)} FCFA par mois` : ` · ${fcfa(f.partPatient)} FCFA`}` : ''}</small></div><Pastille ton="bon">{f.statut === 'etalee' ? 'Étalée' : 'Payée'}</Pastille></div></Carte>
    {/if}
  {/if}

  {#snippet pied()}{#if f && !fait && f.statut === 'a_regler'}<Bouton onclick={confirmer} desactive={!peutConfirmer}>{mode === 'comptant' ? `Confirmer · ${fcfa(f.partPatient)} FCFA` : sim?.mensualite ? `Confirmer · ${fcfa(sim.mensualite)} FCFA × ${sim.mois}` : 'Étalement indisponible'}</Bouton>{/if}{/snippet}
</Ecran>

<Feuille bind:ouverte={tiers} titre="Tiers payant">
  <p class="muted">AssureMe paie directement la clinique. Vous ne réglez que votre part, sans avancer le reste.</p>
  <dl><div><dt>Pris en charge</dt><dd class="mono">{c ? Math.round(c.taux * 100) : 0} %</dd></div><div><dt>Réseau</dt><dd>Partenaire</dd></div></dl>
  <Bouton onclick={() => (tiers = false)}>Compris</Bouton>
</Feuille>

<style>
  .vide { margin-bottom: 4px; } .tete { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; } .tete div { display: flex; flex-direction: column; gap: 2px; } .tp { min-height: 44px; display: flex; align-items: center; }
  small { color: var(--muted); font-size: 12.5px; } h3 { font: 500 10.5px var(--mono); letter-spacing: 0.1em; text-transform: uppercase; color: var(--muted); } h4 { font-size: 14.5px; margin-bottom: 8px; }
  .lignes { list-style: none; } .lignes li { border-bottom: 1px solid var(--ligne); } .lignes li > button { width: 100%; display: flex; justify-content: space-between; align-items: center; gap: 10px; min-height: 56px; text-align: left; } .lm { display: flex; flex-direction: column; min-width: 0; }
  .ld { padding: 0 0 12px; display: flex; flex-direction: column; gap: 6px; font-size: 13.5px; } .ld div { display: flex; justify-content: space-between; }
  .tot { display: flex; flex-direction: column; gap: 8px; padding-top: 12px; } .tot div { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; color: var(--doux); } .bon { color: var(--bon); } .part { font-size: 18px; font-weight: 650; color: var(--texte) !important; border-top: 1px solid var(--ligne); padding-top: 10px; }
  .avert { display: flex; gap: 8px; align-items: center; margin-top: 10px; font-size: 13px; color: var(--alerte); }
  .ech { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; color: var(--doux); padding: 0 4px; } .ech.retard { color: var(--alerte); }
  .modes { display: flex; flex-direction: column; gap: 8px; } .modes button { display: flex; align-items: center; gap: 12px; padding: 14px; min-height: 64px; border-radius: 18px; border: 1px solid var(--ligne); background: var(--carte); text-align: left; }
  .modes button.on { border-color: var(--primaire); background: var(--primaire-fond); } .mt { flex: 1; display: flex; flex-direction: column; }
  .rond { width: 20px; height: 20px; border-radius: 50%; border: 2px solid var(--faint); flex: none; } .on .rond { border-color: var(--primaire); background: radial-gradient(circle, var(--primaire) 45%, transparent 50%); }
  .ctrl { list-style: none; display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; } .ctrl li { display: flex; gap: 10px; align-items: flex-start; } .ctrl span:last-child { display: flex; flex-direction: column; font-size: 13.5px; }
  .pt { width: 22px; height: 22px; border-radius: 11px; display: grid; place-items: center; background: rgba(61, 213, 152, 0.18); color: var(--bon); flex: none; } .ko .pt { background: rgba(255, 114, 114, 0.18); color: var(--danger); }
  dl div { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } dt { color: var(--muted); } dd { font-weight: 550; }
  .err { color: var(--danger); font-size: 13.5px; }
  .ok { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 8px; padding: 8px 0; } .coche { width: 56px; height: 56px; border-radius: 28px; background: rgba(61, 213, 152, 0.18); color: var(--bon); display: grid; place-items: center; }
</style>
