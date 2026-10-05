<script lang="ts">
  import { nombre } from '@core/units.ts';
  import type { BlocVue } from '../../data/requetes.ts';
  import { horloge } from '../../data/temps.svelte.ts';
  import { basculerFait, corrigerValeur, saisirBloc } from '../../data/actions/blocs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import Volet from '../../ui/Volet.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import { cap, chrono, dureeMin, formatValeur, hm, nomDuMois } from './format.ts';
  import { abreger, codeDuProjet, mesuresDuBloc, progressionsDe, tempsDuBloc, type MesureBloc } from './vue-blocs.ts';
  import { depuisAffichage, versAffichage } from './saisie.ts';
  import { styleTeinte } from './teintes.ts';

  /** Volet d'un bloc : minuteur, valeurs réalisées corrigeables, Fait, Reporter, Focus, sous-projets alimentés (spec §8, §12). */
  let { b, aujourdhui, onfermer, onjouer, onterminer, onreporter }: {
    b: BlocVue | null; aujourdhui: string; onfermer: () => void; onjouer: (id: string) => void; onterminer: (id: string) => void; onreporter: (id: string) => void;
  } = $props();

  const style = $derived(b ? styleTeinte(b.couleur, theme.mode) : '');
  const code = $derived(b ? codeDuProjet(b.projet?.id) : null);
  const totalS = $derived(b ? (b.finMin - b.debutMin) * 60 : 0);
  const tourne = $derived(!!b && (b.enCours || b.enPause));
  const ecoule = $derived(b ? tempsDuBloc(b, horloge.maintenant) : 0);
  const mesures = $derived(b ? mesuresDuBloc(b, horloge.maintenant) : []);
  const mois = $derived(aujourdhui.slice(0, 7));
  const progs = $derived(b ? progressionsDe(b.sousProjets, mois, aujourdhui) : []);
  const jourDuMois = $derived(Math.round((+aujourdhui.slice(8) / new Date(Date.UTC(+aujourdhui.slice(0, 4), +aujourdhui.slice(5, 7), 0)).getUTCDate()) * 100));
  const fil = $derived(!b ? '' : `${b.rubrique?.nom ?? 'Rendez-vous'}`);
  const spLabel = $derived(!b ? '' : b.sousProjets.length > 1 ? `${b.sousProjets.length} sous-projets` : b.sousProjets[0]?.nom ?? (b.projet ? 'Aucun sous-projet' : ''));
  const libelleJouer = $derived(!b ? '' : b.enCours ? 'Pause' : b.enPause ? 'Reprendre' : ecoule > 0 || b.fait ? 'Relancer' : 'Lancer');

  let edition = $state<string | null>(null);
  let brouillon = $state('');

  function ajuster(m: MesureBloc, sens: 1 | -1) {
    if (!b) return;
    corrigerValeur(b.occ.id, m.cle, Math.max(0, Math.round((m.realise + sens * m.pas) * 1000) / 1000));
  }
  function editer(m: MesureBloc) { edition = m.cle; brouillon = String(nombre(versAffichage(m.type, m.realise), 2)).replace(/\s/g, ''); }
  function valider(m: MesureBloc) {
    if (!b || edition !== m.cle) return;
    const v = depuisAffichage(m.type, brouillon);
    if (v != null) corrigerValeur(b.occ.id, m.cle, v);
    edition = null;
  }
  // Comme la maquette : un compte (« fois ») se remplit jusqu'au prévu (trait au bout), les autres jusqu'à 125 % (trait à 80 %).
  const echelle = (m: MesureBloc) => (m.type === 'fois' ? 1 : 1.25);
  const largeur = (m: MesureBloc) => (m.prevu ? Math.min(100, (m.realise / (m.prevu * echelle(m))) * 100) : m.realise > 0 ? 100 : 0);
  const atteint = (m: MesureBloc) => m.type !== 'temps' && m.prevu != null && m.realise >= m.prevu;
  const valeur = (m: MesureBloc) => (m.type === 'fois' || m.type === 'nombre' ? nombre(m.realise) : formatValeur(m.type, m.realise, '', m.options));
  const prevu = (m: MesureBloc) => {
    if (m.prevu == null) return '';
    if (m.type === 'temps') return `sur ${formatValeur('temps', m.prevu)} prévus`;
    if (m.type === 'fois' || m.type === 'nombre') return `/ ${nombre(m.prevu)}${m.unite ? ' ' + abreger(m.unite) : ''}`;
    return `/ ${formatValeur(m.type, m.prevu, m.unite, m.options)}`;
  };
</script>

<Volet ouvert={!!b} {onfermer} label={b?.titre ?? ''}>
  {#if b}
    <div class="volet" {style}>
      <div class="ariane">
        <span class="point"></span>
        <span>{fil}</span>
        {#if b.projet}<span class="sep">›</span><span>{b.projet.nom}</span>{/if}
        {#if spLabel}<span class="sep">›</span><span>{spLabel}</span>{/if}
      </div>

      <div class="tete">
        <div class="col">
          <h2 class="titre">{b.titre}</h2>
          <span class="mono muted heures">{hm(b.debutMin)} – {hm(b.finMin)} · {dureeMin(b.finMin - b.debutMin)}</span>
        </div>
        {#if code}<span class="code mono">{code}</span>{/if}
      </div>

      <div class="minuteur">
        <div class="col grandit">
          <span class="mono chrono">{chrono(ecoule)} / {chrono(totalS)}</span>
          <span class="piste"><span style:width="{Math.min(100, (ecoule / totalS) * 100)}%"></span></span>
        </div>
        {#if tourne}
          <button type="button" class="stop" aria-label="Terminer" onclick={() => onterminer(b.occ.id)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" /></svg>
          </button>
        {/if}
        <button type="button" class="jouer" onclick={() => onjouer(b.occ.id)}>
          {#if b.enCours}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="5" y="4" width="5" height="16" rx="1.5" /><rect x="14" y="4" width="5" height="16" rx="1.5" /></svg>
          {:else}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 4.5v15a1 1 0 0 0 1.5.9l12-7.5a1 1 0 0 0 0-1.7l-12-7.5A1 1 0 0 0 7 4.5z" /></svg>
          {/if}
          {libelleJouer}
        </button>
      </div>

      <div class="mesures">
        <span class="etiquette">Réalisé · corrigeable à la main</span>
        {#each mesures as m (m.cle)}
          <div class="mesure">
            {#if m.type === 'reference'}
              <label class="col texte-ref"><span class="muted petit">{m.label}</span>
                <input value={m.texte ?? ''} placeholder="Ex. Matthieu 8–10" onchange={(e) => saisirBloc(b.occ.id, [{ cle: m.cle, txt: e.currentTarget.value.trim() || null }])} />
              </label>
            {:else if m.type === 'oui_non'}
              <div class="rang"><span class="grand">{m.label}</span>
                <Interrupteur actif={m.realise >= 1} label={m.label} couleur="var(--c)" onchange={(v) => corrigerValeur(b.occ.id, m.cle, v ? 1 : 0)} /></div>
            {:else if m.type === 'choix'}
              <span class="muted petit">{m.label}</span>
              <div class="choix">
                {#each m.options ?? [] as o (o.valeur)}
                  <button type="button" class:actif={m.realise === o.valeur} aria-pressed={m.realise === o.valeur} onclick={() => corrigerValeur(b.occ.id, m.cle, o.valeur)}>{o.label}</button>
                {/each}
              </div>
            {:else}
              <div class="rang">
                <div class="col serre">
                  <span class="muted petit">{m.label}</span>
                  {#if edition === m.cle}
                    <input class="direct" inputmode="decimal" bind:value={brouillon} aria-label="{m.label} ({m.type === 'temps' ? 'minutes' : m.unite})"
                      onblur={() => valider(m)} onkeydown={(e) => { if (e.key === 'Enter') valider(m); if (e.key === 'Escape') edition = null; }} />
                  {:else}
                    <button type="button" class="valeur" disabled={m.cle === 'temps' && tourne} onclick={() => editer(m)} aria-label="Saisir {m.label}">{valeur(m)} <span class="sur">{prevu(m)}</span></button>
                  {/if}
                </div>
                <div class="pas">
                  <button type="button" aria-label="Diminuer {m.label}" disabled={m.cle === 'temps' && tourne} onclick={() => ajuster(m, -1)}>−</button>
                  <button type="button" aria-label="Augmenter {m.label}" disabled={m.cle === 'temps' && tourne} onclick={() => ajuster(m, 1)}>+</button>
                </div>
              </div>
              <span class="piste large"><span class:bon={atteint(m)} style:width="{largeur(m)}%"></span>{#if m.prevu}<i style:left="{100 / echelle(m)}%"></i>{/if}</span>
            {/if}
          </div>
        {/each}
      </div>

      <button type="button" class="fait" class:actif={b.fait} onclick={() => basculerFait(b.occ.id)}>
        <Icone nom="coche" taille={20} trait={2.8} />
        {b.fait ? 'Fait · toucher pour annuler' : 'Marquer comme fait'}
      </button>
      <div class="duo">
        <button type="button" class="second" onclick={() => onreporter(b.occ.id)}><Icone nom="reporter" taille={16} /> Reporter</button>
        <a class="second" href="/focus?occ={b.occ.id}"><Icone nom="focus" taille={16} /> Mode Focus</a>
      </div>

      {#if progs.length}
        <div class="alimentes">
          <span class="etiquette">Sous-projets alimentés · {cap(nomDuMois(aujourdhui))}</span>
          {#each progs as p (p.sp.id)}
            <a class="sp" href="/projets/sous-projet/{p.sp.id}">
              <span class="rang base"><span class="nom">{p.sp.nom}</span><span class="pct titre">{p.pct} %</span></span>
              <span class="piste large"><span style:width="{p.pct}%"></span><i style:left="{p.trait ?? jourDuMois}%"></i></span>
              <span class="muted petit">{p.texte}</span>
            </a>
          {/each}
          {#if progs.length > 1}<span class="muted petit">Ce que tu notes ici compte dans tous ces sous-projets. Le trait marque où tu devrais être aujourd’hui.</span>{/if}
        </div>
      {/if}

      <div class="liens">
        {#if b.sousProjets[0]}<a class="souligne" href="/projets/sous-projet/{b.sousProjets[0].id}">Ouvrir le sous-projet <Icone nom="suivant" taille={16} trait={2.2} /></a>{/if}
        <a href="/tache/{b.tache.id}?occ={b.occ.id}" class="muted">Modifier la tâche <Icone nom="suivant" taille={16} trait={2.2} /></a>
      </div>
    </div>
  {/if}
</Volet>

<style>
  .volet { display: flex; flex-direction: column; gap: 14px; }
  .col { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
  .grandit { flex: 1; gap: 6px; }
  .col.serre { gap: 0; }
  .rang { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .rang.base { align-items: baseline; }
  .petit { font-size: 13px; }
  .ariane { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; color: var(--c-titre); }
  .ariane .point { width: 8px; height: 8px; border-radius: 4px; background: var(--c); }
  .ariane .sep { color: var(--faint); }
  .tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  h2 { font-size: 26px; }
  .heures { font-size: 12px; }
  .code { flex: none; font-size: 11px; padding: 4px 8px; border-radius: 8px; background: var(--c-fond); color: var(--c-titre); }
  .minuteur { display: flex; align-items: center; gap: 12px; background: var(--surface-2); border-radius: 18px; padding: 8px 8px 8px 14px; }
  .chrono { font-size: 20px; }
  .piste { position: relative; display: block; height: 4px; border-radius: 2px; background: var(--piste); }
  .piste > span { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--c); transition: width 0.25s ease; }
  .piste > span.bon { background: var(--bon); }
  .piste.large { height: 8px; border-radius: 4px; }
  .piste i { position: absolute; top: -3px; bottom: -3px; width: 2px; background: var(--texte); opacity: 0.55; }
  .jouer { flex: none; height: 48px; padding: 0 18px; border-radius: 16px; border: 0; background: var(--c); color: var(--c-sur); font-size: 15px; font-weight: 600; display: flex; align-items: center; gap: 8px; }
  .stop { flex: none; width: 48px; height: 48px; border-radius: 16px; border: 1px solid var(--ligne); background: var(--surface); color: var(--texte); display: flex; align-items: center; justify-content: center; }
  .mesures { display: flex; flex-direction: column; gap: 4px; }
  .mesure { display: flex; flex-direction: column; gap: 8px; padding: 10px 0; border-bottom: 1px solid var(--ligne); }
  .valeur { border: 0; background: none; padding: 0; text-align: left; font-size: 19px; font-weight: 600; }
  .valeur:active { transform: none; opacity: 0.7; }
  .valeur:disabled { cursor: default; }
  .sur { font-size: 13px; font-weight: 500; color: var(--muted); }
  .direct { width: 110px; height: 36px; border-radius: 10px; border: 1px solid var(--c); background: var(--champ); font-size: 17px; padding: 0 10px; }
  .grand { font-size: 15px; font-weight: 600; }
  .pas { display: flex; gap: 6px; }
  .pas button { width: 44px; height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); font-size: 20px; }
  .pas button:disabled { opacity: 0.4; cursor: not-allowed; }
  .texte-ref input { height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 12px; font-size: 15px; }
  .choix { display: flex; gap: 6px; flex-wrap: wrap; }
  .choix button { min-height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .choix button.actif { background: var(--c); border-color: var(--c); color: var(--c-sur); }
  .fait { height: 52px; border-radius: 18px; border: 0; background: var(--inverse); color: var(--inverse-texte); font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .fait.actif { background: var(--c); color: var(--c-sur); }
  .duo { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; margin-top: -4px; }
  .second { height: 46px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .alimentes { background: var(--surface-2); border-radius: 18px; padding: 12px 14px; display: flex; flex-direction: column; gap: 12px; }
  .sp { display: flex; flex-direction: column; gap: 6px; min-height: 44px; justify-content: center; }
  .sp .nom { font-size: 14px; font-weight: 600; min-width: 0; }
  .sp .pct { flex: none; font-size: 20px; letter-spacing: 0; color: var(--c-titre); }
  .sp .piste { overflow: hidden; }
  .sp .piste i { top: 0; bottom: 0; opacity: 0.5; }
  .liens { display: flex; justify-content: space-between; gap: 8px; flex-wrap: wrap; }
  .liens a { font-size: 14px; font-weight: 600; min-height: 44px; display: flex; align-items: center; gap: 6px; }
  .liens .souligne { text-decoration: underline; text-underline-offset: 2px; }
</style>
