<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { fmt, fmtSigne } from '../../core/argent.ts';
  import { departDe, echeanceDe } from '../../core/regles.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { compteCourant, compteDe } from '../../domain/compte.ts';
  import { compagnieDe, droitDe, volDe } from '../../domain/marche.ts';
  import { ErreurRevente, retirerProposition } from '../../domain/revente.ts';
  import { aller } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { intentionDe, valideJusqua, ENGAGEMENT_H } from '../intentions/modele.ts';
  import Absent from './Absent.svelte';
  import BilletBlanc from './BilletBlanc.svelte';
  import { jourComplet, jourHeure } from './format.ts';
  import { naviguer } from './lien.ts';
  import Pic from './Pic.svelte';
  import { recu } from './vente.ts';

  /** Issue d'une proposition faite à un acheteur : vente immédiate (accord conclu) ou proposition envoyée (réponse sous 48 h). */
  let { intentionId = '' }: { intentionId?: string } = $props();
  const compte = $derived(compteCourant());
  const intention = $derived(intentionDe(intentionId));
  const p = $derived(intention && compte ? [...intention.propositions].filter((x) => x.vendeurId === compte.id).sort((a, b) => b.quand - a.quand)[0] : undefined);
  const droit = $derived(p ? droitDe(p.droitId) : undefined), vol = $derived(droit ? volDe(droit.volId) : undefined);
  const initiale = $derived(`${(compteDe(intention?.compteId)?.prenom ?? '?').charAt(0).toUpperCase()}.`);
  const pass = $derived(!!compte?.pass.actif);
  const r = $derived(p ? recu(p.prix, payePar(), pass) : undefined);
  let maintenantMs = $state(maintenant()), erreur = $state('');
  $effect(() => { const t = setInterval(() => (maintenantMs = maintenant()), 1000); return () => clearInterval(t); });
  const fin = $derived(p ? valideJusqua(p) : 0), reste = $derived(Math.max(0, fin - maintenantMs));
  const pad = (n: number) => String(n).padStart(2, '0');
  const compte_a_rebours = $derived(`${pad(Math.floor(reste / 3_600_000))} h ${pad(Math.floor((reste % 3_600_000) / 60_000))} min ${pad(Math.floor((reste % 60_000) / 1000))} s`);
  const progression = $derived(`${Math.min(100, (reste / (ENGAGEMENT_H * 3_600_000)) * 100).toFixed(2)}%`);
  /** Prix que le vendeur avait payé : le maillon qui lui a donné le droit. */
  function payePar(): number {
    if (!droit || !p) return 0;
    const avant = droit.statut === 'en_vente' || droit.detenteurId === p.vendeurId ? droit.chaine : droit.chaine.slice(0, -1);
    return [...avant].reverse().find((m) => m.vers === p.vendeurId && m.type !== 'nommage' && m.type !== 'gel' && m.type !== 'degel')?.prix ?? droit.prixPaye;
  }
  function retirer() {
    erreur = ''; if (!compte || !intention || !p) return;
    try { retirerProposition(compte.id, intention.id, p.id); montrer('Proposition retirée : votre billet reste en vente.'); aller('/marche-intentions'); } catch (e) { erreur = e instanceof ErreurRevente ? e.message : 'Impossible de retirer la proposition.'; }
  }
</script>

{#if !intentionId}
  <!-- ancien écran réinstancié brièvement -->
{:else if !intention || !p || !droit || !vol || !r}
  <Absent titre="Aucune proposition" message="Vous n’avez pas de proposition sur cette intention, ou elle a été retirée." lien="/marche-intentions" libelleLien="Retour aux intentions" retour="/marche-intentions" />
{:else}
  {@const cie = compagnieDe(vol)}
  {@const depart = departDe(vol.jour, vol.heureDepart)}
  {@const entete: [string, string] = [`${cie.nom} · ${vol.escales.length ? `${vol.escales.length} escale` : 'direct'}`, jourComplet(depart)]}
  {#if p.statut === 'acceptee'}
    <Ecran titre="Accord conclu" face="nuit" retour="/marche-intentions">
      <section class="haut" role="status" aria-label="Vente conclue"><span class="rond ok"><Icone nom="ok" taille={32} trait={2.25} /></span>
        <p class="grand">Vendu · <span class="mono">{fmt(p.prix)}</span></p><p class="sous">Fonds capturés chez l’acheteur {initiale} Votre droit {vol.de} → {vol.vers} lui est cédé.</p></section>
      <section class="versement carte" aria-label="Versement"><div class="v1"><span class="col"><span class="t-sur">Versé sur votre solde NexG</span><span class="mono gros vert" data-testid="verse">+{fmt(r.net)}</span></span><span class="ic"><Pic nom="portefeuille" taille={22} trait={1.75} /></span></div>
        <dl><div><dt>Prix accepté</dt><dd class="mono">{fmt(p.prix)}</dd></div><div><dt>Commission {r.tauxLabel}{pass ? ' (membre Pass, hypothèse)' : ' (hypothèse)'}</dt><dd class="mono">−{fmt(r.commission)}</dd></div>
          <div><dt>Par rapport au prix payé ({fmt(payePar())})</dt><dd class="mono" class:hausse={r.sens === 'hausse'} class:baisse={r.sens === 'baisse'}>{fmtSigne(r.diff)}</dd></div><div><dt>Référence de l’accord</dt><dd class="mono">{droit.ref}</dd></div></dl></section>
      <section aria-label="Billet cédé" class="cede"><p class="t-sur">Ce billet quitte votre portefeuille</p>
        <div class="cadre"><BilletBlanc compact de={vol.de} vers={vol.vers} {entete} label="Billet {vol.de} vers {vol.vers}, {cie.nom}, cédé à l’acheteur {initiale}">{#snippet bas()}<div class="pied-c"><span class="pastille">Cédé</span><span class="mono">Registre {droit.ref}</span></div>{/snippet}</BilletBlanc>
          <span class="badge"><Pic nom="fleche" taille={14} />Cédé à l’acheteur {initiale}</span></div>
        <p class="info"><Icone nom="info" taille={16} trait={2} /><span>L’acheteur nomme le voyageur avant le {jourHeure(echeanceDe(depart))}. Vous n’avez plus rien à faire. Votre annonce sur le marché, le cas échéant, a été retirée.</span></p></section>
      {#snippet pied()}<a class="btn pleine" href="/solde" onclick={(e) => naviguer(e, '/solde')}><Pic nom="portefeuille" taille={20} />Voir mon solde</a>{/snippet}
      <p class="t-aide centre">Montants fictifs de démonstration. Un droit de voyage n’est pas un placement financier.</p>
    </Ecran>
  {:else if p.statut === 'recue'}
    <Ecran titre="Proposition envoyée" face="nuit" retour="/marche-intentions">
      <section class="haut" role="status" aria-label="Proposition envoyée"><span class="rond bleu"><Icone nom="suivant" taille={32} trait={2} /></span>
        <p class="grand moyen">Proposition à <span class="mono">{fmt(p.prix)}</span> envoyée à l’acheteur {initiale}</p><p class="sous">Vous gardez votre billet jusqu’à sa réponse. Si l’acheteur contre-propose, vous serez prévenu.</p></section>
      <section class="attente" aria-label="Réponse attendue"><div class="v1"><span class="col"><span class="t-sur">Réponse attendue sous {ENGAGEMENT_H} h</span><span class="mono gros jaune" role="timer" aria-live="off" data-testid="compte-a-rebours">{compte_a_rebours}</span></span><span class="ic jn"><Icone nom="horloge" taille={22} /></span></div>
        <div class="progres" aria-hidden="true"><span style="width: {progression}"></span></div>
        <dl><div><dt>Son prix maximum</dt><dd class="mono">{fmt(intention.budget)}</dd></div><div><dt>Votre proposition</dt><dd class="mono">{fmt(p.prix)}</dd></div>
          <div><dt>Net reçu si elle est acceptée (commission {r.tauxLabel})</dt><dd class="mono">{fmt(r.net)}</dd></div><div><dt>Sans réponse à l’échéance</dt><dd>Proposition retirée, billet conservé</dd></div></dl></section>
      <section aria-label="Votre billet, conservé" class="cede"><p class="t-sur">Votre billet reste dans votre portefeuille</p>
        <BilletBlanc compact de={vol.de} vers={vol.vers} {entete} label="Billet {vol.de} vers {vol.vers}, {cie.nom}, en vente, proposition en cours">{#snippet bas()}<div class="pied-c"><span class="pastille actif"><span class="pouls"></span>En vente · proposition en cours</span><span class="mono">Registre {droit.ref}</span></div>{/snippet}</BilletBlanc></section>
      {#if erreur}<p class="erreur" role="alert"><Icone nom="alerte" taille={18} trait={2} /><span>{erreur}</span></p>{/if}
      <button type="button" class="btn sec pleine" onclick={retirer}><Pic nom="annuler" taille={20} />Retirer ma proposition</button>
      <p class="t-aide centre">Montants fictifs de démonstration. Un droit de voyage n’est pas un placement financier.</p>
      {#snippet pied()}<a class="btn pleine" href="/marche-intentions" onclick={(e) => naviguer(e, '/marche-intentions')}><Pic nom="flecheg" taille={20} />Retour aux intentions</a>{/snippet}
    </Ecran>
  {:else}
    <Absent titre={p.statut === 'refusee' ? 'Proposition déclinée' : 'Proposition expirée'} message={p.statut === 'refusee' ? `L’acheteur ${initiale} n’a pas retenu votre proposition de ${fmt(p.prix)}. Votre billet reste en vente.` : `Votre proposition de ${fmt(p.prix)} n’est plus valable. Votre billet est conservé.`} lien="/marche-intentions" libelleLien="Retour aux intentions" retour="/marche-intentions" />
  {/if}
{/if}

<style>
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; } .centre { text-align: center; } .col { display: flex; flex-direction: column; gap: 2px; min-width: 0; } .t-sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .haut { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding-top: 8px; } .rond { width: 64px; height: 64px; border-radius: 999px; display: grid; place-items: center; animation: nx-pop 0.5s ease-out both; } .rond.ok { background: var(--ok-soft); color: var(--ok); } .rond.bleu { background: rgba(98, 199, 255, 0.12); color: var(--up); }
  @keyframes nx-pop { from { transform: scale(0.6); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  .grand { font: 600 clamp(30px, 9.2vw, 36px)/1 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; text-wrap: balance; } .grand.moyen { font-size: clamp(28px, 8.7vw, 34px); } .grand .mono { letter-spacing: -0.02em; white-space: nowrap; } .sous { font-size: 15px; line-height: 22px; color: var(--ink2); }
  .versement, .attente { display: flex; flex-direction: column; gap: 12px; padding: 18px; border-radius: 20px; } .attente { background: #060708; border: 1px solid var(--line); } .v1 { display: flex; align-items: center; justify-content: space-between; gap: 12px; } .gros { font-weight: 600; font-size: clamp(28px, 8.7vw, 34px); line-height: 36px; white-space: nowrap; } .vert { color: var(--ok); } .jaune { color: var(--accent); }
  .ic { width: 44px; height: 44px; flex: none; border-radius: 12px; display: grid; place-items: center; background: var(--ok-soft); color: var(--ok); } .ic.jn { background: var(--accent-soft); color: var(--accent); }
  dl { margin: 0; display: flex; flex-direction: column; font-size: 13px; color: var(--ink2); } dl > div { display: flex; justify-content: space-between; align-items: center; gap: 12px; min-height: 32px; border-top: 1px solid var(--line); } .attente dl > div { border-top-color: #1a1c21; } dd { margin: 0; font-weight: 600; color: var(--ink); text-align: right; } dd.hausse { color: var(--up); } dd.baisse { color: var(--down); }
  .progres { height: 6px; border-radius: 3px; background: var(--surface2); overflow: hidden; } .progres span { display: block; height: 100%; border-radius: 3px; background: var(--accent); }
  .cede { display: flex; flex-direction: column; gap: 10px; } .cadre { position: relative; border-radius: 18px; border: 2px dashed var(--line-strong); } .cadre :global(.billet) { margin: -2px; animation: nx-passe 1.4s ease-out 0.4s both; } @keyframes nx-passe { from { opacity: 1; transform: translateY(0); } to { opacity: 0.22; transform: translateY(-6px); } }
  .badge { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); display: inline-flex; align-items: center; gap: 6px; height: 30px; padding: 0 12px; border-radius: 999px; background: var(--bg); border: 1px solid var(--line-strong); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
  .pied-c { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12px; color: #555c6b; } .pastille { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: #f1f2f4; color: #555c6b; font: 700 12px 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; } .pastille.actif { background: rgba(26, 100, 200, 0.1); color: #1a64c8; } .pouls { width: 7px; height: 7px; border-radius: 999px; background: #1a64c8; animation: nx-pulse 1.4s ease-in-out infinite; }
  .info { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink2); } .info :global(svg) { margin-top: 1px; }
  .erreur { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 12px; background: var(--err-soft); color: var(--err); font-size: 14px; font-weight: 600; } .btn.pleine { width: 100%; height: 52px; border-radius: 14px; } .btn.sec { background: var(--surface2); border-color: var(--line-strong); color: var(--ink); }
</style>
