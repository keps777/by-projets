<script lang="ts">
  import { magasin } from '../../data/magasin.svelte.ts';
  import { blocsDuJour, type BlocVue } from '../../data/requetes.ts';
  import { aujourdhui as jourCourant, horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { ecouleOccurrence } from '../../data/actions/blocs.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import Anneau from '../../ui/Anneau.svelte';
  import { basculerMinuteur } from './vue-blocs.ts';
  import { chrono, dureeMin, hm } from './format.ts';
  import { styleTeinte } from './teintes.ts';

  /** Écran ouvert par une notification de rappel : compte à rebours, Lancer maintenant, Reporter, Voir le Fil (spec §10). */
  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const aujourdhui = $derived(jourCourant());
  const occId = $derived(routeur.params.get('occ'));

  /** Le bloc de la notification ; sans paramètre, le prochain bloc du jour. */
  const b = $derived.by((): BlocVue | null => {
    if (occId) {
      const o = magasin.trouver('occurrences', occId);
      return o ? blocsDuJour(o.jour).find((x) => x.occ.id === occId) ?? null : null;
    }
    const m = maintenantLocal().minutes;
    return blocsDuJour(aujourdhui).find((x) => !x.fait && x.finMin > m) ?? null;
  });

  // Halo et étiquette : la nuit, la couleur assombrie (#1C1840) et éclaircie (#BDB3FF) comme la maquette ; le jour, teinte douce et encre.
  const style = $derived(b ? styleTeinte(b.couleur, theme.mode) + (theme.mode === 'nuit'
    ? ';--ar-halo:color-mix(in srgb, var(--c) 20%, #000);--ar-kicker:color-mix(in srgb, var(--c) 70%, #fff)'
    : ';--ar-halo:var(--c-fond);--ar-kicker:var(--c-encre)') : '');
  const tourne = $derived(!!b && (b.enCours || b.enPause));
  const reste = $derived(b ? Math.round((Date.parse(b.occ.debut) - horloge.maintenant) / 1000) : 0);
  const delai = $derived(Math.max(60, (b?.tache.rappel_min || 10) * 60));
  const pct = $derived(tourne && b ? Math.min(100, (ecouleOccurrence(b.occ, horloge.maintenant) / ((b.finMin - b.debutMin) * 60)) * 100) : Math.max(0, Math.min(100, (1 - reste / delai) * 100)));
  const libelle = $derived(tourne ? (b?.enPause ? 'en pause depuis' : 'en cours depuis') : reste >= 0 ? 'commence dans' : 'a commencé il y a');
  // Au-delà d'une heure, « 11 h 36 » se lit mieux qu'un chronomètre.
  const compteur = $derived(tourne && b ? chrono(ecouleOccurrence(b.occ, horloge.maintenant)) : Math.abs(reste) >= 3600 ? dureeMin(Math.floor(Math.abs(reste) / 60)) : chrono(Math.abs(reste)));
  const suffixeJour = $derived(b && b.occ.jour !== aujourdhui ? `jour=${b.occ.jour}` : '');

  function lancer() {
    if (!b) return;
    if (!b.enCours) basculerMinuteur(b.occ.id);
    routeur.aller('/' + (suffixeJour ? `?${suffixeJour}` : ''));
  }
</script>

<div class="ecran-ar" {style}>
  <div class="halo" aria-hidden="true"></div>
  {#if b}
    <div class="tete">
      <span class="kicker">{b.rubrique?.nom ?? 'Rendez-vous'}{b.projet ? ` · ${b.projet.nom}` : ''}</span>
      <h1 class="titre">{b.titre}</h1>
      <span class="mono muted heures">{hm(b.debutMin)} – {hm(b.finMin)} · {dureeMin(b.finMin - b.debutMin)}</span>
    </div>

    <div class="anneau">
      <Anneau {pct} taille={198} epaisseur={10} couleur="var(--c)">
        <span class="muted petit">{libelle}</span>
        <span class="mono compteur">{compteur}</span>
      </Anneau>
    </div>

    <div class="actions">
      <button type="button" class="lancer" onclick={lancer}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
        {b.enCours ? 'Voir le minuteur' : b.enPause ? 'Reprendre maintenant' : 'Lancer maintenant'}
      </button>
      <div class="duo">
        <a class="second" href="/?reporter={b.occ.id}{suffixeJour ? `&${suffixeJour}` : ''}">Reporter</a>
        <a class="second muted" href="/">Voir le Fil</a>
      </div>
      <span class="aide">Cet écran s’ouvre quand tu touches la notification. Lancer, c’est un seul geste.</span>
    </div>
  {:else}
    <div class="tete">
      <span class="kicker">Action rapide</span>
      <h1 class="titre">Ce bloc n’existe plus</h1>
      <span class="muted">Il a peut-être été reporté ou supprimé.</span>
    </div>
    <div class="actions"><a class="second" href="/">Voir le Fil</a></div>
  {/if}
</div>

<style>
  .ecran-ar { --c: var(--accent); position: relative; overflow: hidden; height: 100dvh; max-width: 480px; margin: 0 auto; background: var(--fond); padding: calc(64px + var(--haut-sûr)) 20px calc(28px + var(--bas-sûr)); display: flex; flex-direction: column; gap: 22px; }
  .halo { position: absolute; left: -90px; top: -120px; width: 420px; height: 420px; border-radius: 210px; background: var(--ar-halo, color-mix(in srgb, var(--c) 16%, var(--fond))); opacity: 0.8; pointer-events: none; animation: halo-entre 0.6s ease-out both; }
  @keyframes halo-entre { from { transform: scale(0.85); opacity: 0; } }
  .tete { position: relative; display: flex; flex-direction: column; gap: 6px; }
  .kicker { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--ar-kicker, var(--accent-encre)); }
  h1 { font-size: 40px; letter-spacing: -0.03em; line-height: 1.05; }
  .heures { font-size: 14px; }
  /* Cadre de 210 px, anneau de rayon 94 et 10 px d'épaisseur, comme la maquette. */
  .anneau { position: relative; align-self: center; width: 210px; height: 210px; display: flex; align-items: center; justify-content: center; flex: none; }
  .petit { font-size: 12px; }
  .compteur { font-size: 44px; letter-spacing: -0.03em; }
  .actions { position: relative; display: flex; flex-direction: column; gap: 10px; margin-top: auto; }
  .lancer { height: 58px; border-radius: 18px; border: 0; background: var(--c); color: var(--c-sur, var(--accent-texte)); font-size: 17px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .second { height: 52px; border-radius: 16px; border: 1px solid var(--ligne); font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
  .aide { font-size: 12px; color: var(--faint); text-align: center; line-height: 1.45; }
</style>
