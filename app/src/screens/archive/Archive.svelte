<script lang="ts">
  // Archive (planches Archive, ArchiveRapports, JourArchive) : les sous-projets accomplis, « pierres de mémorial »
  // (1 Samuel 7:12), et les récapitulatifs des rapports.
  import EcranPage from '../../ui/EcranPage.svelte';
  import Segment from '../../ui/Segment.svelte';
  import { couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { aujourdhui, maintenantLocal } from '../../data/temps.svelte.ts';
  import { COULEUR_SANS_PROJET, profil } from '../../data/requetes.ts';
  import { ajouterJours, dernierDuMois, lundiDe, moisDe, premierDuMois } from '@core/dates.ts';
  import { preparer } from '../rapports/calcul.ts';
  import { donneesRapport, premierJour } from '../rapports/donnees.ts';
  import { calculerJours, formatPct, pctJours } from '../rapports/syntheses.ts';
  import { libelleJourCourt, libelleMois, libelleSemaine } from '../rapports/periodes.ts';
  import { accomplis, groupesParMois } from './accomplis.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  type Onglet = 'accomplis' | 'rapports';
  const onglet = $derived<Onglet>(routeur.params.get('onglet') === 'rapports' ? 'rapports' : 'accomplis');

  // ------------------------------------------------------------------ accomplis
  const liste = $derived(accomplis(magasin.lignes));
  const groupes = $derived(groupesParMois(liste));
  const nbRubriques = $derived(new Set(liste.map((a) => a.rubrique?.id).filter(Boolean)).size);
  const depuis = $derived(liste.length ? liste[liste.length - 1].jour.slice(0, 4) : aujourdhui().slice(0, 4));

  // ------------------------------------------------------------------ rapports
  const auj = $derived(aujourdhui());
  // Le rapport du jour n'existe qu'à partir de l'heure du rapport : avant, la journée en cours n'est pas comptée.
  const minutesRapport = $derived.by(() => { const [h, m] = (profil()?.heure_rapport ?? '21:15').split(':').map(Number); return (h || 0) * 60 + (m || 0); });
  const dernierJour = $derived(maintenantLocal().minutes < minutesRapport ? ajouterJours(auj, -1) : auj);
  const d = $derived(onglet === 'rapports' ? donneesRapport() : null);
  const prep = $derived(d ? preparer(d) : []);
  const debut = $derived(premierJour(auj));
  const envoyes = $derived(new Set(magasin.lignes.rapports.filter((r) => r.envoye_a).map((r) => r.jour)));
  const moisVedette = $derived(moisDe(debut) < moisDe(auj) ? moisDe(ajouterJours(premierDuMois(moisDe(auj)), -1)) : moisDe(auj));
  const joursMois = $derived(d ? calculerJours(prep, d, premierDuMois(moisVedette), dernierDuMois(moisVedette), auj).filter((j) => !j.futur && j.jour >= debut && j.jour <= dernierJour) : []);
  const semaines = $derived.by(() => {
    if (!d) return [];
    const res = [];
    for (let l = lundiDe(dernierJour); l >= lundiDe(debut) && res.length < 4; l = ajouterJours(l, -7)) {
      const jours = calculerJours(prep, d, l, ajouterJours(l, 6), auj).filter((j) => !j.futur && j.jour >= debut && j.jour <= dernierJour);
      if (!jours.length) continue;
      res.push({ lundi: l, jours, envoyes: jours.filter((j) => envoyes.has(j.jour)).length, pct: pctJours(jours) });
    }
    return res;
  });
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
</script>

<EcranPage>
  <div class="tete">
    <h1 class="titre">Archive</h1>
    <span class="serif verset">« Jusqu’ici l’Éternel nous a secourus. » 1 Samuel 7:12</span>
  </div>

  <Segment options={[{ valeur: 'accomplis', label: 'Accomplis' }, { valeur: 'rapports', label: 'Rapports' }]} valeur={onglet}
    onchoisir={(v) => routeur.definir('onglet', v === 'accomplis' ? null : v)} hauteur={40} ample />

  {#if onglet === 'accomplis'}
    <div class="accomplis">
    <div class="stats">
      <div class="carte stat"><span class="titre">{liste.length}</span><span class="muted">accompli{liste.length > 1 ? 's' : ''}</span></div>
      <div class="carte stat"><span class="titre">{nbRubriques}</span><span class="muted">rubrique{nbRubriques > 1 ? 's' : ''}</span></div>
      <div class="carte stat"><span class="titre">{depuis}</span><span class="muted">depuis</span></div>
    </div>

    {#if !liste.length}
      <!-- État vide : la frise est déjà là, avec une pierre en attente, pour donner envie de poser la première. -->
      <div class="pierre attente">
        <div class="rail"><span class="caillou"></span><span class="trait"></span></div>
        <div class="corps">
          <span class="textes">
            <span class="serif premiere">Ta première pierre viendra.</span>
            <span class="muted meta">Chaque sous-projet validé s’ajoute ici, avec son document signé. Une pierre à la fois.</span>
          </span>
        </div>
      </div>
    {/if}

    <div class="frise">
      {#each groupes as g (g.mois)}
        <span class="etiquette mois">{libelleMois(g.mois)}</span>
        {#each g.items as a (a.sp.id)}
          <div class="pierre">
            <div class="rail"><span class="caillou" style:background={couleurRubrique(a.rubrique?.couleur ?? COULEUR_SANS_PROJET, theme.mode)}></span><span class="trait"></span></div>
            <div class="corps">
              <a class="textes" href="/projets/sous-projet/{a.sp.id}">
                <span class="nom">{a.sp.nom}</span>
                <span class="muted meta">{a.projet?.nom ?? 'Sans projet'} · signé le {libelleJourCourt(a.jour)}</span>
              </a>
              <a class="pdf mono" href="/projets/sous-projet/{a.sp.id}?onglet=document" aria-label="Ouvrir le PDF signé de {a.sp.nom}">PDF</a>
            </div>
          </div>
        {/each}
      {/each}
    </div>
    </div>
  {:else}
    <div class="rapports">
      <a class="vedette" href="/rapports?onglet=mois&jour={premierDuMois(moisVedette)}">
        <span class="sur">Rapport mensuel</span>
        <span class="grand">{libelleMois(moisVedette)}</span>
        <span class="muted petit">{pluriel(joursMois.length, 'rapport')} · {formatPct(pctJours(joursMois))} des points atteints</span>
      </a>
      {#if !semaines.length}
        <div class="carte attente-rapport">
          <span class="serif premiere">Ton premier rapport arrive ce soir.</span>
          <span class="muted meta">Il se prépare tout seul à {profil()?.heure_rapport ?? '21:15'}, à partir de tes saisies du jour.</span>
        </div>
      {:else}
      <div class="carte liste">
        {#each semaines as s (s.lundi)}
          <a class="semaine" href="/rapports?onglet=semaine&jour={s.lundi}">
            <span class="textes"><span class="fort">{libelleSemaine(s.lundi)}</span><span class="muted petit">{pluriel(s.jours.length, 'rapport')} · {pluriel(s.envoyes, 'envoyé')}</span></span>
            <span class="mono">{formatPct(s.pct)}</span>
          </a>
        {/each}
      </div>
      {/if}
      <a class="tous" href="/rapports/archives">Voir tous les rapports quotidiens</a>
    </div>
  {/if}
</EcranPage>

<style>
  .tete { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; }
  h1 { font-size: 34px; line-height: normal; }
  .verset { font-size: 19px; color: var(--muted); }
  .accomplis { display: flex; flex-direction: column; gap: 14px; }
  .stats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; }
  .stat { border-radius: 16px; padding: 10px 12px; display: flex; flex-direction: column; }
  .stat .titre { font-size: 24px; line-height: normal; }
  .stat .muted { font-size: 11px; }
  .attente .caillou { background: transparent; border: 2px dashed var(--faint); }
  .attente .trait { background: linear-gradient(var(--ligne), transparent); min-height: 24px; }
  .premiere { font-size: 19px; }
  .attente-rapport { padding: 16px; display: flex; flex-direction: column; gap: 4px; }
  .frise { display: flex; flex-direction: column; }
  .mois { padding: 10px 0 6px; letter-spacing: 0.08em; }
  .pierre { display: flex; gap: 12px; align-items: stretch; }
  .rail { width: 22px; flex: none; display: flex; flex-direction: column; align-items: center; }
  .caillou { width: 16px; height: 14px; margin-top: 14px; border-radius: 7px 9px 5px 6px; }
  .trait { flex: 1; width: 2px; background: var(--ligne); }
  .corps { flex: 1; min-width: 0; display: flex; align-items: center; gap: 10px; padding: 8px 0 12px; }
  .textes { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .nom { font-size: 15px; font-weight: 600; }
  .meta { font-size: 12px; }
  .pdf { flex: none; height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--ligne); font-size: 11px; display: flex; align-items: center; }
  .rapports { display: flex; flex-direction: column; gap: 10px; }
  .vedette { background: var(--surface-2); border: 1px solid var(--ligne); border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 4px; }
  .sur { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-encre); }
  .grand { font-size: 17px; font-weight: 600; }
  .petit { font-size: 12px; }
  .fort { font-size: 14px; font-weight: 600; }
  .liste { overflow: hidden; }
  /* Comme la maquette : 52 px de contenu minimum plus les marges (ligne de 77 px). */
  .semaine { box-sizing: content-box; display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 14px; min-height: 52px; }
  .semaine:not(:last-child) { border-bottom: 1px solid var(--ligne); }
  .semaine .mono { font-size: 13px; }
  .tous { color: var(--accent-encre); font-size: 14px; font-weight: 600; min-height: 48px; display: flex; align-items: center; justify-content: center; }
</style>
