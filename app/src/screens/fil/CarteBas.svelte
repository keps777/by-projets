<script lang="ts">
  import type { Occurrence } from '@core/lignes.ts';
  import type { BlocVue } from '../../data/requetes.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { horloge, maintenantLocal } from '../../data/temps.svelte.ts';
  import { ecouleOccurrence } from '../../data/actions/blocs.ts';
  import { COULEUR_SANS_PROJET } from '../../data/requetes.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import { theme } from '../../ui/theme.svelte.ts';
  import { cap, chrono, dureeMin, hm, nomDuJour } from './format.ts';
  import { styleTeinte } from './teintes.ts';

  /** Carte du bas : bloc en cours (Pause, Terminer), sinon « En ce moment » / « Ensuite » avec Lancer. */
  let { blocs, jour, aujourdhui, actifs, onouvrir, onjouer, onterminer }: {
    blocs: BlocVue[]; jour: string; aujourdhui: string; actifs: Occurrence[];
    onouvrir: (id: string) => void; onjouer: (id: string) => void; onterminer: (id: string) => void;
  } = $props();

  const maintenant = $derived(maintenantLocal().minutes);
  const actif = $derived(actifs[0]);

  /** Plusieurs minuteurs en même temps : une ligne par bloc, chacun avec sa pause et son arrêt. */
  const plusieurs = $derived(jour === aujourdhui && actifs.length > 1);
  const lignes = $derived(actifs.map((o) => {
    const tache = magasin.trouver('taches', o.tache_id);
    const projet = tache?.projet_id ? magasin.trouver('projets', tache.projet_id) : undefined;
    const rubrique = projet ? magasin.trouver('rubriques', projet.rubrique_id) : undefined;
    const totalS = Math.max(60, (Date.parse(o.fin) - Date.parse(o.debut)) / 1000);
    const el = ecouleOccurrence(o, horloge.maintenant);
    return { o, titre: tache?.titre ?? 'Bloc', couleur: rubrique?.couleur ?? COULEUR_SANS_PROJET, pause: o.etat === 'pause', el, totalS, pct: Math.min(100, (el / totalS) * 100) };
  }));

  /** Bloc du minuteur actif (titre, couleur, durée prévue). */
  const actifInfo = $derived.by(() => {
    if (!actif) return null;
    const tache = magasin.trouver('taches', actif.tache_id);
    const projet = tache?.projet_id ? magasin.trouver('projets', tache.projet_id) : undefined;
    const rubrique = projet ? magasin.trouver('rubriques', projet.rubrique_id) : undefined;
    return { titre: tache?.titre ?? 'Bloc', couleur: rubrique?.couleur ?? COULEUR_SANS_PROJET, totalS: Math.max(60, (Date.parse(actif.fin) - Date.parse(actif.debut)) / 1000) };
  });

  type Carte = { kicker: string; titre: string; sous: string; mono?: boolean; couleur: string | null; action?: { label: string; aria: string; pause?: boolean; faire: () => void }; terminer?: () => void; pct?: number; ouvrir?: () => void };

  // Journée vide, aujourd'hui ou à venir : la carte devient une invitation (premier bloc, ou rendez-vous sans projet).
  const invitation = $derived(!blocs.length && jour >= aujourdhui && !actifs.length);
  const suffixeJour = $derived(jour === aujourdhui ? '' : `jour=${jour}`);

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

  const style = $derived(carte.couleur ? styleTeinte(carte.couleur, theme.mode) : '--c:var(--carte-muted)');
</script>

<div class="enveloppe">
  {#if invitation}
    <div class="carte-bas invitation">
      <div class="texte-invit">
        <span class="kicker" class:maintenant={jour === aujourdhui} style:--c="var(--carte-muted)">{jour === aujourdhui ? 'Journée libre' : cap(nomDuJour(jour))}</span>
        <span class="titre-invit">{jour === aujourdhui ? 'Pose ton premier bloc' : 'Rien de prévu ce jour-là'}</span>
        <span class="verset">« Recommande à l’Éternel tes œuvres, et tes projets réussiront. »</span>
      </div>
      <div class="boutons-invit">
        <a class="ajouter" href="/tache/nouvelle{suffixeJour ? `?${suffixeJour}` : ''}"><Icone nom="plus" taille={15} trait={2.4} />Ajouter un bloc</a>
        <a class="rdv" href="/tache/nouvelle?sans-projet=1{suffixeJour ? `&${suffixeJour}` : ''}"><Icone nom="calendrier" taille={15} />Rendez-vous</a>
      </div>
    </div>
  {:else if plusieurs}
  <div class="carte-bas multi" role="group" aria-label="{actifs.length} blocs en cours">
    <span class="kicker maintenant">{actifs.length} en cours en même temps</span>
    <ul class="liste-actifs">
      {#each lignes as l (l.o.id)}
        <li style={styleTeinte(l.couleur, theme.mode)}>
          <button type="button" class="texte" onclick={() => onouvrir(l.o.id)}>
            <span class="titre-carte">{l.titre}{l.pause ? ' · en pause' : ''}</span>
            <span class="sous mono">{chrono(l.el)} / {chrono(l.totalS)}</span>
            <span class="piste"><span class="barre" style:width="{l.pct}%"></span></span>
          </button>
          <button type="button" class="terminer" aria-label="Terminer {l.titre}" onclick={() => onterminer(l.o.id)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
          </button>
          <button type="button" class="action rond-action" aria-label="{l.pause ? 'Reprendre' : 'Mettre en pause'} {l.titre}" onclick={() => onjouer(l.o.id)}>
            {#if !l.pause}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
            {:else}
              <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
            {/if}
          </button>
        </li>
      {/each}
    </ul>
  </div>
  {:else}
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
  {/if}
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
  .multi { gap: 8px; }
  .liste-actifs { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 10px; max-height: 188px; overflow-y: auto; }
  .liste-actifs li { display: flex; align-items: center; gap: 10px; }
  .liste-actifs .texte { gap: 3px; }
  .rond-action { width: 44px; padding: 0; justify-content: center; }
  .invitation { gap: 12px; padding: 14px 12px 12px 14px; animation: invit-entre 0.45s cubic-bezier(0.2, 0.8, 0.2, 1) both; }
  .texte-invit { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
  .titre-invit { font-family: var(--police-titre); font-size: 21px; font-weight: 700; letter-spacing: -0.02em; line-height: 1.1; }
  .verset { font-family: var(--police-serif); font-style: italic; font-size: 16px; line-height: 1.25; color: var(--carte-muted); margin-top: 2px; }
  .boutons-invit { display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); gap: 8px; }
  .boutons-invit a { height: 44px; border-radius: 22px; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 14px; font-weight: 600; white-space: nowrap; }
  .ajouter { background: var(--carte-texte); color: var(--carte-fond); }
  .rdv { border: 1px solid var(--carte-ligne); color: var(--carte-texte); }
  @keyframes invit-entre { from { opacity: 0; transform: translateY(10px); } }
  .barre { display: block; height: 6px; background: var(--c); border-radius: 3px; transition: width 0.9s linear; }
</style>
