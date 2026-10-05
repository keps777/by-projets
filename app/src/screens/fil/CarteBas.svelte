<script lang="ts">
  import type { Occurrence } from '@core/lignes.ts';
  import type { BlocVue } from '../../data/requetes.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { ecouleOccurrence } from '../../data/actions/blocs.ts';
  import { COULEUR_SANS_PROJET } from '../../data/requetes.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { cap, chrono, dureeMin, hm, nomDuJour } from './format.ts';

  /** Carte du bas : bloc en cours (Pause, Terminer), sinon « En ce moment » / « Ensuite » avec Lancer. */
  let { blocs, jour, aujourdhui, actif, onouvrir, onjouer, onterminer }: {
    blocs: BlocVue[]; jour: string; aujourdhui: string; actif: Occurrence | undefined;
    onouvrir: (id: string) => void; onjouer: (id: string) => void; onterminer: (id: string) => void;
  } = $props();

  const maintenant = $derived(maintenantLocal().minutes);

  /** Bloc du minuteur actif (titre, couleur, durée prévue). */
  const actifInfo = $derived.by(() => {
    if (!actif) return null;
    const tache = magasin.trouver('taches', actif.tache_id);
    const projet = tache?.projet_id ? magasin.trouver('projets', tache.projet_id) : undefined;
    const rubrique = projet ? magasin.trouver('rubriques', projet.rubrique_id) : undefined;
    return { titre: tache?.titre ?? 'Bloc', couleur: rubrique?.couleur ?? COULEUR_SANS_PROJET, totalS: Math.max(60, (Date.parse(actif.fin) - Date.parse(actif.debut)) / 1000) };
  });

  type Carte = { kicker: string; titre: string; sous: string; mono?: boolean; couleur: string | null; action?: { label: string; aria: string; pause?: boolean; faire: () => void }; terminer?: () => void; pct?: number; ouvrir?: () => void };

  const carte = $derived.by((): Carte => {
    if (jour !== aujourdhui) {
      const futur = jour > aujourdhui;
      const faits = blocs.filter((b) => b.fait).length;
      return {
        kicker: cap(nomDuJour(jour)), couleur: null,
        titre: !blocs.length ? 'Aucun bloc ce jour-là' : futur ? `${blocs.length} bloc${blocs.length > 1 ? 's' : ''} prévu${blocs.length > 1 ? 's' : ''}` : `${faits} sur ${blocs.length} accomplis`,
        sous: futur ? 'Planifié · touche un bloc pour le modifier' : 'Rapport du jour disponible dans Rapports',
        ouvrir: futur ? undefined : () => routeur.aller('/rapports')
      };
    }
    if (actif && actifInfo) {
      const el = ecouleOccurrence(actif, horloge.maintenant);
      const enPause = actif.etat === 'pause';
      return {
        kicker: enPause ? 'En pause' : 'En cours', titre: actifInfo.titre, couleur: actifInfo.couleur, mono: true,
        sous: `${chrono(el)} / ${chrono(actifInfo.totalS)}`, pct: Math.min(100, (el / actifInfo.totalS) * 100),
        action: { label: enPause ? 'Reprendre' : 'Pause', aria: enPause ? 'Reprendre' : 'Mettre en pause', pause: !enPause, faire: () => onjouer(actif.id) },
        terminer: () => onterminer(actif.id), ouvrir: () => onouvrir(actif.id)
      };
    }
    const cur = blocs.find((b) => b.debutMin <= maintenant && maintenant < b.finMin);
    const next = blocs.find((b) => b.debutMin > maintenant);
    const cible = cur ?? next;
    if (cible) {
      return {
        kicker: cur ? `En ce moment · reste ${dureeMin(cible.finMin - maintenant)}` : `Ensuite · dans ${dureeMin(cible.debutMin - maintenant)}`,
        titre: cible.titre, sous: `${cible.projet?.nom ?? 'Sans projet'} · ${hm(cible.debutMin)}–${hm(cible.finMin)}`, couleur: cible.couleur,
        action: cible.fait ? undefined : { label: 'Lancer', aria: `Lancer ${cible.titre}`, faire: () => onjouer(cible.occ.id) },
        ouvrir: () => onouvrir(cible.occ.id)
      };
    }
    if (!blocs.length) return { kicker: 'Aujourd’hui', titre: 'Aucun bloc prévu', sous: 'Touche + pour ajouter une tâche', couleur: null, ouvrir: () => routeur.aller(`/tache/nouvelle?jour=${jour}`) };
    return { kicker: 'Journée accomplie', titre: 'Ton rapport du jour est prêt', sous: 'Touche pour le relire et l’envoyer', couleur: null, ouvrir: () => routeur.aller('/rapports') };
  });

  const style = $derived(carte.couleur ? styleCouleur(couleurRubrique(carte.couleur, theme.mode)) : '--c:var(--carte-muted)');
</script>

<div class="enveloppe">
  <div class="carte-bas" {style}>
    <div class="rang">
      <button type="button" class="texte" onclick={() => carte.ouvrir?.()} disabled={!carte.ouvrir}>
        <span class="kicker" class:maintenant={!carte.couleur && carte.kicker === 'Journée accomplie'}>{carte.kicker}</span>
        <span class="titre-carte">{carte.titre}</span>
        <span class="sous" class:mono={carte.mono}>{carte.sous}</span>
      </button>
      {#if carte.terminer}
        <button type="button" class="terminer" aria-label="Terminer" onclick={carte.terminer}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
        </button>
      {/if}
      {#if carte.action}
        <button type="button" class="action" aria-label={carte.action.aria} onclick={carte.action.faire}>
          {#if carte.action.pause}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
          {:else}
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
          {/if}
          {carte.action.label}
        </button>
      {/if}
    </div>
    {#if carte.pct != null}
      <span class="piste"><span class="barre" style:width="{carte.pct}%"></span></span>
    {/if}
  </div>
</div>

<style>
  .enveloppe { padding: 10px 10px 0; flex: none; }
  .carte-bas { background: var(--carte-fond); color: var(--carte-texte); border: 1px solid var(--carte-ligne); border-radius: 22px; padding: 12px 12px 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .rang { display: flex; align-items: center; gap: 12px; }
  .texte { flex: 1; min-width: 0; border: 0; background: none; color: inherit; text-align: left; padding: 0; display: flex; flex-direction: column; gap: 2px; cursor: pointer; }
  .texte:disabled { cursor: default; opacity: 1; }
  .kicker { font-size: 11px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--c); }
  .kicker.maintenant { color: var(--maintenant); }
  .titre-carte { font-size: 16px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sous { font-size: 12px; color: var(--carte-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .terminer { flex: none; width: 44px; height: 44px; border-radius: 22px; border: 1px solid var(--carte-ligne); background: transparent; color: var(--carte-texte); display: flex; align-items: center; justify-content: center; }
  .action { flex: none; height: 44px; padding: 0 16px; border-radius: 22px; border: 0; background: var(--c); color: var(--c-sur); font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
  .piste { height: 6px; border-radius: 3px; background: var(--carte-piste); overflow: hidden; }
  .barre { display: block; height: 6px; background: var(--c); border-radius: 3px; transition: width 0.9s linear; }
</style>
