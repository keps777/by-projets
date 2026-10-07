<script lang="ts">
  import { alarmes } from '../alarme/alarme.svelte.ts';
  import { sonnerie } from '../alarme/son.ts';
  import { fuseau, horloge, maintenantLocal } from '../data/temps.svelte.ts';
  import { reporter } from '../data/actions/taches.ts';
  import { basculerMinuteur } from '../screens/fil/vue-blocs.ts';
  import { utcVersLocal } from '@core/dates.ts';
  import { formatHeure } from '@core/units.ts';
  import { routeur } from '../routeur.svelte.ts';
  import { fly } from 'svelte/transition';

  const a = $derived(alarmes.courante);
  const debutMin = $derived(a && a.occ ? utcVersLocal(Date.parse(a.occ.debut), fuseau()).minutes : null);
  const reste = $derived(a && a.occ ? Math.round((Date.parse(a.occ.debut) - horloge.maintenant) / 60000) : 0);
  const quand = $derived(!a?.occ ? 'Alarme d’essai' : reste > 0 ? `Commence dans ${reste} min` : reste === 0 ? 'Commence maintenant' : `Commencé il y a ${-reste} min`);

  // Le son joue tant que l'alarme est affichée ; si iOS ne l'a pas encore autorisé, on invite à toucher l'écran.
  $effect(() => {
    if (a) sonnerie.jouer(); else sonnerie.arreter();
    return () => sonnerie.arreter();
  });
  const sonPret = $derived(a ? (horloge.maintenant, sonnerie.pret) : true);

  function lancer() {
    if (!a?.occ) return alarmes.finEssai();
    const id = a.occ.id;
    alarmes.faireTaire(id);
    basculerMinuteur(id);
  }
  function reporterDe10() {
    if (!a?.occ) return alarmes.finEssai();
    const id = a.occ.id, t = a.tache!;
    alarmes.faireTaire(id);
    const { jour, minutes } = maintenantLocal();
    const total = minutes + 10;
    reporter(id, total >= 1440 ? { jour: new Date(Date.parse(`${jour}T00:00:00Z`) + 86400000).toISOString().slice(0, 10), debutMin: total - 1440, rappelMin: t.rappel_min } : { jour, debutMin: total, rappelMin: t.rappel_min });
  }
  function choisirHeure() {
    if (!a?.occ) return alarmes.finEssai();
    const id = a.occ.id;
    alarmes.faireTaire(id);
    routeur.aller(`/?reporter=${id}`);
  }
  function ignorer() {
    if (!a?.occ) return alarmes.finEssai();
    alarmes.faireTaire(a.occ.id);
  }
</script>

{#if a}
  <div class="alarme" role="alertdialog" aria-modal="true" aria-label="Alarme" transition:fly={{ y: 24, duration: 220 }}>
    <div class="halo" aria-hidden="true"></div>
    <div class="contenu">
      <span class="kicker">⏰ Alarme{alarmes.autres > 0 ? ` · +${alarmes.autres} autre${alarmes.autres > 1 ? 's' : ''}` : ''}</span>
      <h1 class="titre">{a.tache ? a.tache.titre : 'Ceci est un essai'}</h1>
      <p class="quand">{quand}{debutMin != null ? ` · ${formatHeure(debutMin)}` : ''}</p>
      {#if !sonPret}<p class="son">Touche l’écran pour activer le son.</p>{/if}
      <div class="boutons">
        <button type="button" class="lancer" onclick={lancer}>{a.occ ? 'Lancer' : 'Fermer l’essai'}</button>
        {#if a.occ}
          <button type="button" onclick={reporterDe10}>Reporter de 10 min</button>
          <button type="button" onclick={choisirHeure}>Choisir une autre heure</button>
          <button type="button" class="discret" onclick={ignorer}>Ignorer</button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .alarme { position: fixed; inset: 0; z-index: 1000; display: flex; align-items: center; justify-content: center; padding: 24px; background: color-mix(in srgb, var(--fond, #0e0f13) 94%, #e0412e); color: var(--texte); }
  .halo { position: absolute; inset: 0; background: radial-gradient(circle at 50% 38%, color-mix(in srgb, #e0412e 55%, transparent), transparent 62%); animation: pouls 1.4s ease-in-out infinite; pointer-events: none; }
  .contenu { position: relative; width: 100%; max-width: 420px; display: flex; flex-direction: column; gap: 12px; text-align: center; }
  .kicker { font-size: 13px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; color: #ff7a66; }
  h1 { font-size: 34px; line-height: 1.1; }
  .quand { font-size: 17px; color: var(--muted); margin: 0 0 8px; }
  .son { font-size: 13px; color: #ffb4a8; margin: 0; }
  .boutons { display: flex; flex-direction: column; gap: 10px; margin-top: 12px; }
  .boutons button { min-height: 56px; border-radius: 18px; border: 1px solid var(--ligne); background: var(--surface-2, #1c1e26); color: var(--texte); font-size: 17px; font-weight: 600; }
  .boutons .lancer { background: #34d3b8; border-color: #34d3b8; color: #08211d; min-height: 64px; font-size: 19px; }
  .boutons .discret { background: transparent; border-color: transparent; color: var(--muted); }
  @keyframes pouls { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.9; } }
  @media (prefers-reduced-motion: reduce) { .halo { animation: none; opacity: 0.6; } }
</style>
