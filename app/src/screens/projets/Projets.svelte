<script lang="ts">
  // Projets (planches Projets, ProjetsEdition, JourProjets) : progression du mois par rubrique, projets et sous-projets
  // dépliables, mode Modifier pour ajouter ou retirer rubriques, projets et sous-projets (spec §12, US-14).
  import { SvelteSet } from 'svelte/reactivity';
  import { untrack } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { joursDuMois, moisDe } from '@core/dates.ts';
  import type { Projet, Rubrique, SousProjetLigne } from '@core/lignes.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Volet from '../../ui/Volet.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import { couleurRubrique, styleCouleur } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { progressionProjet, progressionRubrique, progressionSousProjet, projetsDe, rubriques, sousProjetsDe } from '../../data/requetes.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';
  import { ajouterProjet, ajouterRubrique, archiverSousProjet, retirerProjet, retirerRubrique } from '../../data/actions/projets.ts';
  import { jourCourt, nomMois, resumeProgression } from './vues.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const NOMS_COURTS: Record<string, string> = { dieu: 'Relation avec Dieu', service: 'Service à Dieu', travail: 'Travail et études', vie: 'Vie personnelle', transversal: 'Transversal' };
  const PALETTE = ['#9D8CFF', '#34D1B6', '#5EA6FF', '#FF8F66', '#F5B843', '#A3A6B1'];

  const jour = $derived(aujourdhui());
  const mois = $derived(moisDe(jour));
  const jourN = $derived(+jour.slice(8, 10));
  const nbJours = $derived(joursDuMois(mois));
  const attendu = $derived(Math.round((jourN / nbJours) * 100));

  let edition = $state(false);
  const ouverts = new SvelteSet<string>();
  // Rubriques repliées (flèche à droite du titre), gardées sur l'appareil.
  const CLE_REPLIEES = 'luther-life:rubriques-repliees';
  const repliees = new SvelteSet<string>(untrack(() => { try { return JSON.parse(localStorage.getItem(CLE_REPLIEES) ?? '[]') as string[]; } catch { return []; } }));
  function replier(id: string) {
    if (repliees.has(id)) repliees.delete(id); else repliees.add(id);
    try { localStorage.setItem(CLE_REPLIEES, JSON.stringify([...repliees])); } catch { /* stockage indisponible : le repli ne dure que cette visite */ }
  }

  /** Sous-projets montrés ici : ceux qui vivent encore (les terminés sont dans l'Archive). */
  const vivants = (pid: string) => sousProjetsDe(pid).filter((s) => s.statut !== 'termine').sort((a, b) => a.created_at.localeCompare(b.created_at));

  function vueSousProjet(sp: SousProjetLigne) {
    const { pilote, progression: p } = progressionSousProjet(sp, mois, jour);
    let obj = 'Objectif à définir';
    if (pilote && p && p.cible != null) obj = resumeProgression(pilote, p);
    if (p?.etat === 'a_venir') obj = `dès le ${jourCourt(sp.debut)}${p.cible != null ? ' · ' + obj : ''}`;
    if (sp.statut === 'brouillon') obj = `En pause · ${obj}`;
    const pct = sp.statut === 'brouillon' ? null : p?.pct ?? null;
    return { sp, pct, obj, futur: p?.etat === 'a_venir', href: `/projets/sous-projet/${sp.id}` };
  }

  function vueProjet(p: Projet) {
    const subs = vivants(p.id).map(vueSousProjet);
    const pct = progressionProjet(p.id, mois, jour);
    const n = subs.length;
    const ligne = n === 0 ? 'Aucun sous-projet · ajoutes-en un' : n === 1 ? subs[0].sp.nom + (subs[0].obj ? ' · ' + subs[0].obj : '') : `${n} sous-projets`;
    return {
      p, subs, pct, ligne,
      marqueur: pct != null && !(n > 0 && subs.every((s) => s.futur)),
      href: n ? subs[0].href : `/projets/nouveau-sous-projet?projet=${p.id}`
    };
  }

  function vueRubrique(r: Rubrique, i: number) {
    const projets = projetsDe(r.id).map(vueProjet);
    return {
      r, projets,
      numero: r.cle === 'transversal' ? '∞' : String(i + 1),
      court: (r.cle && NOMS_COURTS[r.cle]) || r.nom,
      couleur: couleurRubrique(r.couleur, theme.mode),
      pct: progressionRubrique(r.id, mois, jour)
    };
  }

  const vue = $derived(rubriques().map(vueRubrique));

  // Au premier affichage, on déplie le premier projet qui a plusieurs sous-projets (comme la maquette).
  untrack(() => {
    const premier = vue.flatMap((r) => r.projets).find((p) => p.subs.length > 1);
    if (premier) ouverts.add(premier.p.id);
  });

  const basculer = (id: string) => (ouverts.has(id) ? ouverts.delete(id) : ouverts.add(id));
  const couleurPct = (pct: number | null) => (pct != null && pct >= 100 ? 'var(--bon)' : pct != null && pct < attendu * 0.5 ? 'var(--muted)' : 'var(--texte)');

  // ------------------------------------------------------------------ mode Modifier
  let nouveauProjet = $state<{ rubriqueId: string; nom: string } | null>(null);
  let nouvelleRubrique = $state<{ nom: string; couleur: string } | null>(null);
  let aRetirer = $state<{ type: 'rubrique' | 'projet' | 'sous-projet'; id: string; nom: string } | null>(null);

  function creerProjet() {
    if (!nouveauProjet) return;
    const id = ajouterProjet(nouveauProjet.rubriqueId, nouveauProjet.nom);
    ouverts.add(id);
    dire('Projet ajouté');
    nouveauProjet = null;
  }
  function creerRubrique() {
    if (!nouvelleRubrique) return;
    ajouterRubrique(nouvelleRubrique.nom, nouvelleRubrique.couleur);
    dire('Rubrique ajoutée');
    nouvelleRubrique = null;
  }
  function confirmerRetrait() {
    const a = aRetirer;
    if (!a) return;
    if (a.type === 'rubrique') retirerRubrique(a.id);
    else if (a.type === 'projet') retirerProjet(a.id);
    else archiverSousProjet(a.id);
    dire(`${a.type === 'rubrique' ? 'Rubrique retirée' : a.type === 'projet' ? 'Projet retiré' : 'Sous-projet retiré'} · les saisies passées sont gardées`);
    aRetirer = null;
  }
</script>

<EcranPage>
  <div class="tete">
    <div class="titres">
      <h1 class="titre">Projets</h1>
      <span class="serif devise">Diviser ma vie en plusieurs projets.</span>
    </div>
    <button type="button" class="modifier" class:actif={edition} aria-pressed={edition} onclick={() => (edition = !edition)}>{edition ? 'Terminé' : 'Modifier'}</button>
  </div>

  <section class="carte resume" aria-label="Progression du mois">
    <div class="resume-tete">
      <span>{nomMois(mois)} · progression du mois</span>
      <span class="mono muted petit">jour {jourN}/{nbJours}</span>
    </div>
    {#each vue as r (r.r.id)}
      <div class="ligne-resume" style={styleCouleur(r.couleur)}>
        <span class="muted court">{r.court}</span>
        <span class="piste"><span class="rempli" style:width="{r.pct ?? 0}%"></span><span class="trait" style:left="{attendu}%"></span></span>
        <span class="mono pct">{r.pct == null ? '—' : `${r.pct} %`}</span>
      </div>
    {/each}
    <span class="muted petit">Le trait vertical marque où tu devrais être aujourd’hui. Le pourcentage d’un projet est la moyenne de ses sous-projets.</span>
  </section>

  {#each vue as r (r.r.id)}
    {@const repliee = !edition && repliees.has(r.r.id)}
    <section class="rubrique" style={styleCouleur(r.couleur)} aria-label={r.r.nom}>
      <div class="rubrique-tete">
        <span class="numero mono">{r.numero}</span>
        <h2>{r.r.nom}</h2>
        <span class="muted petit">{r.projets.length} projet{r.projets.length > 1 ? 's' : ''}</span>
        {#if !edition}
          <button type="button" class="plier" aria-expanded={!repliee} aria-label="{repliee ? 'Déplier' : 'Replier'} la rubrique {r.r.nom}" onclick={() => replier(r.r.id)}>
            <span class="chevron" class:tourne={!repliee}><Icone nom="bas" taille={18} trait={2.4} /></span>
          </button>
        {:else}
          <button type="button" class="retirer-rub" aria-label="Retirer la rubrique {r.r.nom}" onclick={() => (aRetirer = { type: 'rubrique', id: r.r.id, nom: r.r.nom })} transition:slide={{ axis: 'x', duration: 180 }}><Icone nom="poubelle" taille={15} /></button>
        {/if}
      </div>
      {#if !repliee}
      <div class="carte liste" transition:slide={{ duration: 180 }}>
        {#each r.projets as p (p.p.id)}
          {@const deplie = edition || ouverts.has(p.p.id)}
          <div class="projet">
            <div class="projet-ligne">
              {#if edition}
                <button type="button" class="moins" transition:slide={{ axis: 'x', duration: 180 }} aria-label="Retirer le projet {p.p.nom}" onclick={() => (aRetirer = { type: 'projet', id: p.p.id, nom: p.p.nom })}><Icone nom="moins" taille={14} trait={3} /></button>
              {/if}
              <a href={p.href} class="projet-lien">
                <span class="projet-haut">
                  <span class="mono muted num">{p.p.numero ?? ''}</span>
                  <span class="projet-nom">{p.p.nom}</span>
                  <span class="mono projet-pct" style:color={couleurPct(p.pct)}>{p.pct == null ? '—' : `${p.pct} %`}</span>
                </span>
                <span class="muted petit coupe">{p.ligne}</span>
                <span class="piste fine">
                  <span class="rempli" style:width="{p.pct ?? 0}%" style:background={p.pct != null && p.pct >= 100 ? 'var(--bon)' : undefined}></span>
                  {#if p.marqueur}<span class="trait" style:left="{attendu}%"></span>{/if}
                </span>
              </a>
              {#if p.subs.length > 1 && !edition}
                <button type="button" class="deplier" class:ouvert={deplie} aria-expanded={deplie} aria-label="{deplie ? 'Replier' : 'Voir'} les sous-projets de {p.p.nom}" onclick={() => basculer(p.p.id)}>
                  <span class="mono">{p.subs.length}</span>
                  <span class="chevron" class:tourne={deplie}><Icone nom="bas" taille={14} trait={2.4} /></span>
                </button>
              {/if}
            </div>
            {#if deplie && (edition || p.subs.length > 1)}
              <div class="subs" transition:slide={{ duration: 240, easing: cubicOut }}>
                {#each p.subs as x (x.sp.id)}
                  <div class="sub">
                    {#if edition}
                      <button type="button" class="moins petit-rond" transition:slide={{ axis: 'x', duration: 180 }} aria-label="Retirer le sous-projet {x.sp.nom}" onclick={() => (aRetirer = { type: 'sous-projet', id: x.sp.id, nom: x.sp.nom })}><Icone nom="moins" taille={12} trait={3} /></button>
                    {/if}
                    <a href={x.href} class="sub-lien">
                      <span class="projet-haut">
                        <span class="sub-nom">{x.sp.nom}</span>
                        <span class="mono petit">{x.pct == null ? '—' : `${x.pct} %`}</span>
                      </span>
                      <span class="piste mince"><span class="rempli" style:width="{x.pct ?? 0}%" style:background={x.pct != null && x.pct >= 100 ? 'var(--bon)' : undefined}></span></span>
                      <span class="muted petit">{x.obj}</span>
                    </a>
                  </div>
                {/each}
                {#if edition}
                  <a class="ajout-sub" transition:slide={{ duration: 180 }} href="/projets/nouveau-sous-projet?projet={p.p.id}"><Icone nom="plus" taille={14} trait={2.6} />Sous-projet</a>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
        {#if edition}
          <button type="button" class="ajout-projet" transition:slide={{ duration: 180 }} onclick={() => (nouveauProjet = { rubriqueId: r.r.id, nom: '' })}><Icone nom="plus" taille={14} trait={2.6} />Projet dans cette rubrique</button>
        {:else if !r.projets.length}
          <p class="muted petit vide">Aucun projet. Touche « Modifier » pour en ajouter un.</p>
        {/if}
      </div>
      {/if}
    </section>
  {/each}

  {#if edition}
    <button type="button" class="ajout-rubrique" transition:slide={{ duration: 180 }} onclick={() => (nouvelleRubrique = { nom: '', couleur: PALETTE[5] })}><Icone nom="plus" taille={16} trait={2.6} />Nouvelle rubrique</button>
  {/if}
  {#if magasin.pret && !vue.length}
    <p class="muted">Aucune rubrique. Touche « Modifier » pour en créer une.</p>
  {/if}
</EcranPage>

<Volet ouvert={!!nouveauProjet} onfermer={() => (nouveauProjet = null)} label="Nouveau projet">
  {#if nouveauProjet}
    <h2 class="titre volet-titre">Nouveau projet</h2>
    <label class="champ">Nom du projet
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={nouveauProjet.nom} placeholder="Ex. Apprendre l’anglais" autofocus onkeydown={(e) => e.key === 'Enter' && creerProjet()} />
    </label>
    <Bouton grand plein onclick={creerProjet}>Ajouter le projet</Bouton>
  {/if}
</Volet>

<Volet ouvert={!!nouvelleRubrique} onfermer={() => (nouvelleRubrique = null)} label="Nouvelle rubrique">
  {#if nouvelleRubrique}
    <h2 class="titre volet-titre">Nouvelle rubrique</h2>
    <label class="champ">Nom de la rubrique
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={nouvelleRubrique.nom} placeholder="Ex. Ma santé" autofocus />
    </label>
    <div class="champ">Couleur
      <div class="couleurs">
        {#each PALETTE as c (c)}
          <button type="button" class="pastille" class:choisie={nouvelleRubrique.couleur === c} style:background={couleurRubrique(c, theme.mode)} aria-label="Couleur {c}" aria-pressed={nouvelleRubrique.couleur === c} onclick={() => nouvelleRubrique && (nouvelleRubrique.couleur = c)}></button>
        {/each}
      </div>
    </div>
    <Bouton grand plein onclick={creerRubrique}>Ajouter la rubrique</Bouton>
  {/if}
</Volet>

<Volet ouvert={!!aRetirer} onfermer={() => (aRetirer = null)} label="Confirmer le retrait">
  {#if aRetirer}
    <h2 class="titre volet-titre">Retirer {aRetirer.type === 'rubrique' ? 'la rubrique' : aRetirer.type === 'projet' ? 'le projet' : 'le sous-projet'} « {aRetirer.nom} » ?</h2>
    <p class="muted">Il disparaît de l’écran. Les saisies passées sont conservées (archivées) : rien ne se perd.</p>
    <div class="deux">
      <Bouton variante="secondaire" onclick={() => (aRetirer = null)}>Annuler</Bouton>
      <Bouton variante="danger" onclick={confirmerRetrait}>Retirer</Bouton>
    </div>
  {/if}
</Volet>

<style>
  .tete { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
  .titres { display: flex; flex-direction: column; gap: 2px; }
  h1 { font-size: 30px; line-height: normal; }
  .devise { font-size: 17px; color: var(--muted); }
  .modifier { flex: none; height: 44px; padding: 0 16px; border-radius: 22px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); font-size: 14px; font-weight: 600; }
  .modifier.actif { background: var(--inverse); border-color: var(--inverse); color: var(--inverse-texte); }
  .petit { font-size: 12px; }

  .resume { border-radius: 22px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .resume-tete { display: flex; justify-content: space-between; align-items: baseline; font-size: 14px; font-weight: 600; }
  .ligne-resume { display: grid; grid-template-columns: 112px minmax(0, 1fr) 40px; gap: 10px; align-items: center; }
  .court { font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pct { font-size: 12px; text-align: right; }

  .piste { position: relative; display: block; height: 8px; border-radius: 4px; background: var(--piste); }
  .piste.fine { height: 6px; border-radius: 3px; }
  .piste.mince { height: 5px; border-radius: 3px; }
  .rempli { position: absolute; left: 0; top: 0; bottom: 0; border-radius: inherit; background: var(--c); max-width: 100%; animation: remplit 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) both; transition: width 0.4s ease; }
  @keyframes remplit { from { width: 0; } }
  .trait { position: absolute; top: -3px; bottom: -3px; width: 2px; margin-left: -1px; background: var(--texte); opacity: 0.45; }

  .rubrique { display: flex; flex-direction: column; gap: 8px; }
  .rubrique-tete { display: flex; align-items: center; gap: 10px; }
  .numero { flex: none; width: 26px; height: 26px; border-radius: 8px; background: var(--c); color: var(--c-sur); font-size: 12px; display: flex; align-items: center; justify-content: center; }
  h2 { flex: 1; font-size: 17px; font-weight: 600; }
  /* Absent de la maquette : discret (pas de cadre) pour ne pas alourdir l'en-tête, zone d'appui de 44 px. */
  .retirer-rub { flex: none; position: relative; width: 28px; height: 28px; margin: -2px -4px -2px 0; border-radius: 14px; border: 0; background: transparent; color: var(--mauvais); display: flex; align-items: center; justify-content: center; }
  .retirer-rub::after { content: ''; position: absolute; inset: -8px; }
  .liste { border-radius: 20px; overflow: hidden; }
  .projet { border-bottom: 1px solid var(--ligne); }
  .projet-ligne { display: flex; align-items: center; gap: 10px; padding: 12px 14px; }
  /* Maquette : rouge plein (#E5483A de nuit) et signe blanc ; jetons proposés --mauvais-plein et --sur-mauvais. */
  .moins { flex: none; width: 32px; height: 32px; border-radius: 16px; border: 0; background: var(--mauvais-plein, var(--mauvais)); color: var(--sur-mauvais, #fff); display: flex; align-items: center; justify-content: center; position: relative; }
  .moins::after { content: ''; position: absolute; inset: -6px; }
  .moins.petit-rond { width: 28px; height: 28px; border-radius: 14px; }
  .projet-lien { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .projet-haut { display: flex; align-items: baseline; gap: 8px; }
  .num { flex: none; font-size: 11px; }
  .projet-nom { flex: 1; min-width: 0; font-size: 15px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .projet-pct { flex: none; font-size: 13px; }
  .coupe { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .deplier { flex: none; min-width: 52px; height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: transparent; color: var(--texte); display: flex; align-items: center; justify-content: center; gap: 4px; font-size: 12px; }
  .deplier.ouvert { background: var(--surface-2); }
  .chevron { display: flex; transition: transform 0.2s; }
  .plier { flex: none; width: 44px; height: 44px; margin: -8px -8px -8px 0; border: 0; background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; }
  .chevron.tourne { transform: rotate(180deg); }
  .subs { padding: 0 14px 10px 24px; display: flex; flex-direction: column; }
  .sub { display: flex; align-items: center; gap: 8px; padding: 10px 12px; margin-bottom: 6px; border-radius: 14px; background: var(--surface-2); }
  .sub-lien { flex: 1; min-width: 0; min-height: 44px; display: flex; flex-direction: column; justify-content: center; gap: 5px; }
  .sub-nom { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ajout-sub { box-sizing: content-box; min-height: 44px; border-radius: 14px; border: 1.5px dashed var(--ligne); color: var(--c-encre); font-size: 13px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .ajout-projet { width: 100%; min-height: 48px; border: 0; background: transparent; color: var(--c-encre); font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .vide { padding: 14px; }
  .ajout-rubrique { min-height: 56px; border-radius: 20px; border: 2px dashed var(--ligne); background: transparent; color: var(--texte); font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; }

  .volet-titre { font-size: 22px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 12px; color: var(--muted); }
  .champ input { height: 50px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); font-size: 17px; font-weight: 600; padding: 0 14px; }
  .couleurs { display: flex; gap: 10px; flex-wrap: wrap; }
  .pastille { width: 44px; height: 44px; border-radius: 22px; border: 3px solid transparent; }
  .pastille.choisie { border-color: var(--texte); }
  .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
</style>
