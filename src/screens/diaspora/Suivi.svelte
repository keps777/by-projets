<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Etiquette from '../_services/Etiquette.svelte';
  import Vide from '../_services/Vide.svelte';
  import { horloge } from '../_services/horloge.svelte.ts';
  import { dureeCourte } from '../../core/services.ts';
  import { pdfSimple } from '../../core/recu.ts';
  import { euro, fcfa, versEuro } from '../../core/money.ts';
  import { totalEuro } from '../../core/diaspora.ts';
  import { avancer } from './actions.ts';
  import { etapesVue, libellePartenaire, lignesRecu, totalEnvoye } from './calcul.ts';
  import { etat } from './etat.ts';

  let { params }: { params: Record<string, string> } = $props();
  const e = etat();
  const h = horloge(1000);
  const p = $derived(e.paiements.find((x) => x.id === params.id) ?? (params.id ? undefined : e.paiements[0]));
  const proche = $derived(e.proches.find((x) => x.id === p?.procheId));
  $effect(() => { avancer(h.t); });
  const etapes = $derived(p ? etapesVue(p, h.t) : []);
  const reste = $derived(p ? p.debut + p.delaiSigne - h.t : 0);
  const minutes = $derived(p ? Math.round(p.delaiSigne / 60_000) : 0);
  const annee = $derived(new Date(h.t).getFullYear());

  function telecharger() {
    if (!p) return;
    const octets = pdfSimple(`Reçu AssureMe · ${p.lignes[0].recu}`, lignesRecu(p, p.signe));
    const url = URL.createObjectURL(new Blob([octets as BlobPart], { type: 'application/pdf' }));
    const a = document.createElement('a'); a.href = url; a.download = `recu-${p.lignes[0].recu}.pdf`; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    montrer(`Reçu ${p.lignes[0].recu} téléchargé · PDF ${Math.max(1, Math.round(octets.length / 1024))} Ko`);
  }
  const envoyer = () => { if (p) montrer(`Reçu envoyé à ${p.procheNom} sur WhatsApp`); };
</script>

{#if !p}
  <Ecran titre="Suivi du paiement" retourVers="/diaspora">
    <Vide icone="diaspora" titre="Paiement introuvable" texte="Ce paiement n'existe pas ou n'existe plus. Revenez à la liste pour en lancer un nouveau.">
      <Bouton href="/diaspora">Payer pour un proche</Bouton>
    </Vide>
  </Ecran>
{:else}
  <Ecran titre={`Paiement pour ${p.procheNom}`} sur={`${p.depuis} → ${p.procheVille} · ${minutes} minutes`} retourVers="/diaspora">
    <div class="tete" aria-live="polite">
      <Pastille ton={p.signe ? 'bon' : 'primaire'}>{p.signe ? 'Reçu signé' : 'En cours'}</Pastille>
      <b class="mono gros">{euro(totalEuro(p.montantFcfa))} €</b>
      <span class="mono muted">= {fcfa(p.montantFcfa)} FCFA</span>
    </div>

    <ol class="etapes" aria-label="Étapes du paiement">
      {#each etapes as s, i (i)}
        <li class:fait={s.atteinte} class:der={i === etapes.length - 1}>
          <span class="pt" aria-hidden="true">{#if s.atteinte}<Icone nom="ok" taille={12} trait={3} />{/if}</span>
          <span class="tx"><b>{s.titre}</b><small>{s.sous}</small></span>
          <span class="mono h">{s.atteinte ? s.heure : `~ ${s.heure}`}</span>
        </li>
      {/each}
    </ol>
    {#if !p.signe}<p class="attente" role="status">Signature attendue dans environ {dureeCourte(reste)}. Nous vous prévenons dès que c'est fait.</p>{/if}

    <Etiquette>Reçu{p.lignes.length > 1 ? 's' : ''}</Etiquette>
    {#each p.lignes as l (l.factureId)}
      <Carte>
        <div class="recu">
          <div class="en"><b>{l.prestataire}</b><span class="mono">{fcfa(l.montant)}</span></div>
          <small class="mono">REÇU N° {l.recu}</small>
          <span class="muted">{l.detail}</span>
          <span class={p.signe ? 'bon' : 'muted'}>{p.signe ? `Signé par ${l.signataire}` : 'Signature en attente'}</span>
        </div>
      </Carte>
    {/each}
    <div class="duo">
      <Bouton variante="secondaire" onclick={envoyer}>Envoyer à {p.procheNom}</Bouton>
      <Bouton variante="secondaire" onclick={telecharger}>Télécharger PDF</Bouton>
    </div>

    <div class="duo">
      {#if proche && proche.plafondSante !== null}
        <Carte><small class="mono">PLAFOND SANTÉ {proche.nom.toUpperCase()}</small><b class="mono val">{fcfa(Math.max(0, proche.plafondSante - proche.consommeSante))}</b><small class="muted">/ {fcfa(proche.plafondSante)}</small></Carte>
      {/if}
      <Carte><small class="mono">ENVOYÉ EN {annee}</small><b class="mono val">{fcfa(totalEnvoye(e.avantEuro, e.paiements, annee))} €</b><small class="bon">0 € de frais</small></Carte>
    </div>

    {#if proche && proche.pass !== 'Pass Premium'}
      <Carte href="/piliers" accent="var(--primaire)">
        <div class="offre"><span class="m"><b>Offrir le Pass Premium à {proche.nom}</b><small>60 000 FCFA / mois ≈ {Math.round(versEuro(60_000))} € · hôpital à 0 franc, pharmacie incluse</small></span><Icone nom="suivant" taille={18} /></div>
      </Carte>
    {/if}
    <p class="muted petit">Versé à {libellePartenaire(p)}. Taux fixe 655,957, aucun frais de change.</p>

    <Bouton href="/diaspora">Payer à nouveau</Bouton>
    <Bouton variante="discret" href="/">Accueil</Bouton>
  </Ecran>
{/if}

<style>
  .tete { display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 12px 0 4px; }
  .gros { font-size: 38px; font-weight: 500; letter-spacing: -0.03em; line-height: 1.05; }
  .etapes { list-style: none; display: flex; flex-direction: column; padding: 4px 2px; }
  li { display: grid; grid-template-columns: 22px 1fr auto; gap: 12px; align-items: start; padding-bottom: 20px; position: relative; color: var(--muted); }
  li:not(.der)::before { content: ''; position: absolute; left: 10.5px; top: 22px; bottom: 0; width: 1px; background: var(--ligne-forte); }
  li.fait:not(.der)::before { background: rgba(61, 213, 152, 0.5); }
  li.der { padding-bottom: 4px; }
  .pt { width: 22px; height: 22px; border-radius: 11px; border: 1.5px solid var(--ligne-forte); display: grid; place-items: center; color: #07090f; }
  .fait .pt { background: var(--bon); border-color: var(--bon); } .fait.der .pt { box-shadow: 0 0 18px rgba(61, 213, 152, 0.7); }
  .tx { display: flex; flex-direction: column; } .tx b { font-size: 14.5px; font-weight: 600; } .fait .tx b { color: var(--texte); } .tx small { font-size: 12.5px; }
  .h { font-size: 13px; padding-top: 2px; }
  .attente { font-size: 13px; color: var(--pale); background: var(--primaire-fond); padding: 10px 14px; border-radius: 14px; }
  .recu { display: flex; flex-direction: column; gap: 3px; } .en { display: flex; justify-content: space-between; gap: 8px; } .en b { font-size: 15px; }
  small.mono { letter-spacing: 0.08em; color: var(--muted); font-size: 11px; } .bon { color: var(--bon); font-size: 13px; }
  .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .val { display: block; font-size: 22px; font-weight: 500; margin: 4px 0 2px; }
  .offre { display: flex; align-items: center; gap: 12px; } .m { flex: 1; display: flex; flex-direction: column; gap: 2px; } .m small { color: var(--muted); font-size: 12.5px; }
  .petit { font-size: 12px; text-align: center; }
</style>
