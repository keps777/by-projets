<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { niveauDuScore } from '../../core/credit.ts';
  import { CONSEILS, SCORE_MAX, SCORE_MIN, trajectoire, type Conseil } from '../../core/score.ts';
  import { fractionJauge } from '../../core/scoreHistorique.ts';
  import { basculerConseil } from './actions.ts';
  import PileCartes from '../coffres/PileCartes.svelte';

  const valeur = $derived(app.score.valeur);
  const faits = $derived(app.score.conseilsFaits);
  const traj = $derived(trajectoire(valeur, faits));
  const potentiel = $derived(Math.min(SCORE_MAX, valeur + traj.gainPossible));
  const elite = $derived(niveauDuScore(valeur) === 'ELITE');
  let courant = $state(0);
  /** Écran où réaliser chaque action. */
  const ALLER: Record<string, { href: string; label: string }> = {
    facture: { href: '/pay/facture', label: 'Régler la facture' }, epargne: { href: '/coffres/nouveau', label: 'Ouvrir un coffre' },
    garant: { href: '/profil', label: 'Ouvrir mon profil' }, adresse: { href: '/logement', label: 'Ajouter un justificatif' }
  };

  function basculer(c: Conseil) {
    const avant = niveauDuScore(app.score.valeur);
    const fait = faits.includes(c.id);
    const delta = basculerConseil(c.id);
    const apres = niveauDuScore(app.score.valeur);
    const signe = delta >= 0 ? '+' : '−';
    montrer(apres !== avant ? `${signe}${Math.abs(delta)} points · niveau ${apres}` : `${fait ? 'Retiré' : 'Fait'} · ${signe}${Math.abs(delta)} points`, 'bon');
  }
</script>

<Ecran titre={elite ? 'Gagner des points' : 'Passer Elite'} sur="{CONSEILS.length} actions · {faits.length} faite{faits.length > 1 ? 's' : ''}" retourVers="/score">
  <div class="proj" aria-live="polite">
    <div class="ligne">
      <div><small class="mono">SCORE POSSIBLE</small><p class="mono"><span class="act">{valeur}</span> <span class="fl" aria-hidden="true">→</span> <b class:elite={potentiel >= 800}>{potentiel}</b></p></div>
      {#if elite}<span class="badge ok mono">ELITE ATTEINT</span>
      {:else if traj.atteignable}<span class="badge ok mono">ELITE À PORTÉE</span>
      {:else}<span class="badge mono">Elite dès 800 · il manque {traj.manque}</span>{/if}
    </div>
    <div class="barre" role="img" aria-label="Score {valeur}, jusqu'à {potentiel} avec les actions restantes">
      <i class="pot" style:width="{fractionJauge(potentiel) * 100}%"></i><i class="act" style:width="{fractionJauge(valeur) * 100}%"></i>
      <b style:left="{fractionJauge(700) * 100}%"></b><b style:left="{fractionJauge(800) * 100}%"></b>
    </div>
    <div class="echelle mono" aria-hidden="true"><span>{SCORE_MIN}</span><span style:left="{fractionJauge(700) * 100}%">PRO 700</span><span style:left="{fractionJauge(800) * 100}%">ELITE 800</span><span class="max">{SCORE_MAX}</span></div>
  </div>

  <PileCartes items={CONSEILS} bind:courant hauteur={268} libelle="Conseils pour gagner des points">
    {#snippet carte(c: Conseil, i: number)}
      {@const fait = faits.includes(c.id)}
      <article class="conseil" class:fait aria-label="Action {i + 1} sur {CONSEILS.length}">
        <div class="haut"><span class="mono eff">ACTION {i + 1} / {CONSEILS.length} · {c.effort}</span><span class="mono pts" class:fait>+{c.points}</span></div>
        <h2>{c.titre}</h2>
        <p>{c.pourquoi}</p>
        <div class="bas">
          <button class="faire" class:fait onclick={() => basculer(c)} aria-pressed={fait}><Icone nom="ok" taille={16} trait={2.4} />{fait ? 'Fait · retirer' : 'Marquer comme fait'}</button>
          {#if !fait && ALLER[c.id]}<a class="aller" href={ALLER[c.id].href} onclick={(e) => { e.preventDefault(); aller(ALLER[c.id].href); }}>{ALLER[c.id].label}<Icone nom="suivant" taille={14} trait={2.2} /></a>{/if}
        </div>
      </article>
    {/snippet}
  </PileCartes>

  <p class="aide mono" aria-hidden="true">← GLISSEZ LES CONSEILS →</p>
  <div class="nav">
    <button onclick={() => (courant = (courant - 1 + CONSEILS.length) % CONSEILS.length)}><Icone nom="retour" taille={16} trait={2.2} />Précédente</button>
    <button onclick={() => (courant = (courant + 1) % CONSEILS.length)}>Suivante<Icone nom="suivant" taille={16} trait={2.2} /></button>
  </div>
  <Bouton variante="discret" href="/score">Retour au score</Bouton>
  <div class="espace"></div>
</Ecran>

<style>
  .proj { background: var(--carte); border: 1px solid var(--ligne); border-radius: 20px; padding: 14px 16px 12px; display: flex; flex-direction: column; gap: 10px; }
  .ligne { display: flex; justify-content: space-between; align-items: center; gap: 10px; } small { font-size: 10px; letter-spacing: 0.1em; color: var(--muted); } .ligne p { font-size: 26px; font-weight: 500; letter-spacing: -0.03em; } .act { color: var(--muted); } .fl { color: var(--faint); font-size: 18px; } b.elite { color: var(--bon); } b { font-weight: 500; }
  .badge { font-size: 10.5px; letter-spacing: 0.06em; padding: 6px 10px; border-radius: 99px; background: var(--carte2); color: var(--muted); text-align: right; } .badge.ok { background: rgba(61, 213, 152, 0.14); color: var(--bon); }
  .barre { position: relative; height: 8px; border-radius: 4px; background: var(--ligne); } .barre i { position: absolute; inset: 0 auto 0 0; border-radius: 4px; transition: width 0.5s; } .barre i.pot { background: color-mix(in srgb, var(--primaire-clair) 45%, transparent); } .barre i.act { background: var(--primaire); } .barre b { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--texte); opacity: 0.4; }
  .echelle { position: relative; height: 14px; font-size: 10px; color: var(--faint); } .echelle span { position: absolute; transform: translateX(-50%); white-space: nowrap; } .echelle span:first-child { left: 0; transform: none; } .echelle .max { right: 0; transform: none; }
  .conseil { height: 100%; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(160deg, color-mix(in srgb, var(--primaire) 22%, var(--carte)), var(--carte) 70%); border: 1px solid rgba(124, 147, 255, 0.35); box-shadow: 0 24px 50px -28px rgba(48, 80, 255, 0.6); }
  .conseil.fait { border-color: rgba(61, 213, 152, 0.45); background: linear-gradient(160deg, color-mix(in srgb, var(--bon) 16%, var(--carte)), var(--carte) 70%); box-shadow: 0 24px 50px -28px rgba(61, 213, 152, 0.55); }
  .haut { display: flex; justify-content: space-between; align-items: center; } .eff { font-size: 10px; letter-spacing: 0.12em; color: var(--pale); } .pts { font-size: 26px; font-weight: 500; } .pts.fait { color: var(--bon); }
  h2 { font-size: 19px; line-height: 1.25; letter-spacing: -0.02em; } p { font-size: 13.5px; color: var(--doux); }
  .bas { margin-top: auto; display: flex; flex-direction: column; gap: 6px; }
  .faire { min-height: 48px; border-radius: 14px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; font-weight: 600; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.18); } .faire.fait { background: var(--bon); border-color: var(--bon); color: #07090f; }
  .aller { display: inline-flex; align-items: center; justify-content: center; gap: 2px; min-height: 44px; color: var(--primaire-clair); font-weight: 600; font-size: 13.5px; }
  .aide { text-align: center; font-size: 10px; letter-spacing: 0.1em; color: var(--faint); }
  .nav { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .nav button { min-height: 48px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); display: inline-flex; align-items: center; justify-content: center; gap: 6px; font-weight: 550; font-size: 14px; }
  .espace { height: 86px; }
</style>
