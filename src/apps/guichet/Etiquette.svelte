<script lang="ts">
  import './guichet.css';
  import { departParId, heureLocale, departEnMs } from '../../domain/actions.ts';
  import { TAILLES } from '../../core/colis.ts';
  import { formaterTel } from '../../core/guichet.ts';
  import Qr from '../../ui/Qr.svelte';
  import { etat } from './etat.ts';
  import type { Colis, Passager } from '../../domain/types.ts';

  /** Étiquette de colis (thermique 58 mm) : code AM-C, trajet, taille, remise, destinataire, expéditeur, QR. Sans colis : aperçu. */
  let { colis, compagnie, apercu }: { colis?: Colis; compagnie: string; apercu?: { taille: keyof typeof TAILLES; depart: string; arrivee: string; destinataire: Passager; expediteur: Passager; jour: string } } = $props();
  const depart = $derived(colis?.departId ? departParId(colis.departId) : undefined);
  const jj = (ms: number) => { const d = new Date(ms); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${heureLocale(ms)}`; };
  const quand = $derived(depart ? jj(departEnMs(depart)) : colis ? jj(colis.etapes[0].ts) : (apercu?.jour ?? ''));
  const taille = $derived(colis?.taille ?? apercu?.taille ?? 'M');
  const exp = $derived(colis ? etat().expediteurs[colis.id] ?? apercu?.expediteur : apercu?.expediteur);
  const dest = $derived(colis?.destinataire ?? apercu?.destinataire);
  const trajet = (d: string, a: string) => `${d.replace(' · ', ' ')} → ${a.replace(' · ', ' ')}`;
</script>

<article class="g-rcpt" aria-label="Étiquette du colis">
  <h3>{compagnie.toUpperCase()} · {quand}</h3>
  <div class="code">{colis ? colis.code : 'AM-C-···'}</div>
  <div class="c">{colis ? trajet(colis.depart, colis.arrivee) : apercu ? trajet(apercu.depart, apercu.arrivee) : ''}</div><hr />
  <div class="l"><span>Taille</span><b>{TAILLES[taille].nom}</b></div>
  {#if colis?.options.assurance}<div class="l"><span>Assuré</span><b>oui</b></div>{/if}
  {#if colis?.options.moto}<div class="l"><span>Livraison</span><b>moto</b></div>{/if}
  <div class="l"><span>Dest.</span><b>{dest?.nom}{dest?.tel ? ` · ${formaterTel(dest.tel)}` : ''}</b></div>
  <div class="l"><span>Exp.</span><b>{exp?.nom || 'Client du guichet'}{exp?.tel ? ` · ${formaterTel(exp.tel)}` : ''}</b></div>
  <div class="qr">{#if colis}<Qr texte={colis.code} taille={110} libelle="QR du colis {colis.code}" />{:else}<span class="petit">le QR est créé à l’encaissement</span>{/if}</div>
  {#if colis}<div class="petit">Retrait : code {colis.codeRetrait} remis au destinataire</div>{/if}
</article>
