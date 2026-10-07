<script lang="ts">
  // « Saisir un autre jour » et correction d'une journée depuis un sous-projet (spec §8, sources manuel et rattrapage).
  // Chaque champ montre le total de la journée ; le modifier ajuste la saisie manuelle de ce jour, sans toucher aux blocs.
  import { agreger, TYPES } from '@core/metriques.ts';
  import { compterChapitres, formaterPassages, lirePassages, type Passage } from '@core/bible.ts';
  import { attenduDuJour } from '@core/rapport.ts';
  import { formatHeure, parseHeure } from '@core/units.ts';
  import type { Jour, Metrique } from '@core/types.ts';
  import Volet from '../../ui/Volet.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import Puces from '../../ui/Puces.svelte';
  import PassagesLus from '../../ui/PassagesLus.svelte';
  import ChampTemps from '../../ui/ChampTemps.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import type { LivreSuivi } from '@core/lignes.ts';
  import { ajouterLivre, retirerLivre } from '../../data/actions/reglages.ts';
  import { contenuDuJour, idSaisieManuelle, saisirJour } from './donnees.ts';
  import { champTexte, jourCourt, lireChamp, pasDe, valeurTexte } from './vues.ts';

  let { ouvert, onfermer, projetId, metriques, jour, aujourdhui, periode, pointLivres = null }: {
    ouvert: boolean; onfermer: () => void; projetId: string; metriques: Metrique[]; jour: Jour; aujourdhui: Jour; periode: { debut: Jour; fin: Jour | null };
    /** Point du rapport qui suit des livres (CL) : la fenêtre permet d'en ajouter ou d'en retirer. */
    pointLivres?: { id: string; livres: LivreSuivi[] } | null;
  } = $props();

  let j = $state('');
  let nums = $state<Record<string, number | null>>({});
  let champs = $state<Record<string, string>>({});
  let textes = $state<Record<string, string>>({});
  let autresTextes = $state<Record<string, string>>({});
  let note = $state('');
  /** Passages de la Bible choisis dans les menus, par clé de référence. */
  let passagesPar = $state<Record<string, Passage[]>>({});

  $effect(() => { if (ouvert) j = jour; });

  // Recharge le contenu de la journée choisie.
  $effect(() => {
    if (!ouvert || !j) return;
    const c = contenuDuJour(projetId, j);
    const n: Record<string, number | null> = {}, ch: Record<string, string> = {}, t: Record<string, string> = {}, at: Record<string, string> = {};
    for (const m of metriques) {
      const e = c.get(m.cle);
      if (m.type === 'reference') { t[m.cle] = e?.manuelTxt ?? ''; at[m.cle] = e?.textes.join(' · ') ?? ''; continue; }
      const somme = TYPES[m.type].agregation === 'somme';
      const tous = [...(e?.nums ?? []), ...(e?.manuel != null ? [e.manuel] : [])];
      const v = !e ? null : somme ? tous.reduce((s, x) => s + x, 0) : e.manuel ?? agreger(m.type, tous.map((valeur) => ({ cle: m.cle, jour: j, valeur })));
      n[m.cle] = v;
      ch[m.cle] = champTexte(m.type, v);
    }
    nums = n; champs = ch; textes = t; autresTextes = at;
    passagesPar = Object.fromEntries(Object.entries(t).map(([cle, txt]) => [cle, lirePassages(txt)]));
    note = magasin.trouver('saisies', idSaisieManuelle(projetId, j))?.note ?? '';
  });

  // Pages par livre : le total de pages du point (« nombre:pages ») suit la somme des livres, le reste (pages hors livres) est gardé.
  const clesLivres = $derived(metriques.filter((m) => m.cle.startsWith('livre:')).map((m) => m.cle));
  const sommeLivres = () => clesLivres.reduce((s, c) => s + (nums[c] ?? 0), 0);
  let pagesHorsLivres = 0;
  $effect(() => { if (ouvert && j && clesLivres.length) pagesHorsLivres = Math.max(0, (nums['nombre:pages'] ?? 0) - sommeLivres()); });

  function regler(m: Metrique, v: number | null) {
    nums[m.cle] = v; champs[m.cle] = champTexte(m.type, v);
    if (m.cle.startsWith('livre:') && metriques.some((x) => x.cle === 'nombre:pages')) {
      const pages = metriques.find((x) => x.cle === 'nombre:pages')!;
      const total = pagesHorsLivres + sommeLivres();
      nums[pages.cle] = total; champs[pages.cle] = champTexte(pages.type, total);
    }
  }
  function pas(m: Metrique, signe: 1 | -1) {
    let v = Math.max(0, (nums[m.cle] ?? 0) + signe * (pasDe(m.type, nums[m.cle] ?? 0) || 1));
    if (m.type === 'note') v = Math.min(10, v);
    if (m.type === 'pourcentage') v = Math.min(100, v);
    regler(m, v);
  }
  function lire(m: Metrique) { const v = lireChamp(m.type, champs[m.cle] ?? ''); regler(m, v ?? (champs[m.cle]?.trim() ? nums[m.cle] : null)); }

  /** Passages choisis dans les menus : le texte de la référence suit, et le nombre de chapitres du jour varie de la même quantité. */
  function changerPassages(m: Metrique, ps: Passage[]) {
    const avant = compterChapitres(passagesPar[m.cle] ?? []);
    passagesPar[m.cle] = ps;
    textes[m.cle] = ps.length ? formaterPassages(ps) : '';
    const chap = metriques.find((x) => x.cle === 'nombre:chapitres');
    if (chap) regler(chap, Math.max(0, (nums[chap.cle] ?? 0) + compterChapitres(ps) - avant));
  }

  let nouveau = $state<{ titre: string; auteur: string; total: string; depart: string } | null>(null);
  function creerLivre() {
    if (!pointLivres || !nouveau?.titre.trim()) return;
    const n = (t: string) => { const v = Math.round(Number(t.replace(',', '.').replace(/[^\d.]/g, ''))); return Number.isFinite(v) && v > 0 ? v : null; };
    ajouterLivre(pointLivres.id, { titre: nouveau.titre, auteur: nouveau.auteur, total: n(nouveau.total), depart: n(nouveau.depart) ?? 0 });
    nouveau = null;
    dire('Livre ajouté');
  }

  const horsPeriode = $derived(!!j && (j < periode.debut || (periode.fin != null && j > periode.fin)));

  function enregistrer() {
    if (!j || j > aujourdhui) { dire('Choisis un jour passé ou aujourd’hui.'); return; }
    saisirJour(projetId, j, metriques.map((m) => ({ cle: m.cle, type: m.type, num: nums[m.cle], txt: textes[m.cle], detail: m.type === 'reference' && passagesPar[m.cle] ? (passagesPar[m.cle] as unknown[]) : undefined })), aujourdhui, note);
    dire(j === aujourdhui ? 'Saisie enregistrée' : `Saisie du ${jourCourt(j)} enregistrée`);
    onfermer();
  }
</script>

<Volet {ouvert} {onfermer} label="Saisir un jour">
  <div class="tete">
    <h2 class="titre">{j === aujourdhui ? 'Saisir aujourd’hui' : 'Saisir un autre jour'}</h2>
    <input type="date" class="date" bind:value={j} max={aujourdhui} aria-label="Jour de la saisie" />
  </div>
  {#if horsPeriode}<p class="muted petit">Ce jour est hors de la période du sous-projet : la saisie compte pour le projet, pas pour cette barre.</p>{/if}

  {#each metriques as m (m.id)}
    {@const prevu = attenduDuJour(m, periode, j)}
    <div class="champ">
      <span class="libelle"><span>{m.nom}</span>{#if prevu != null && m.type !== 'reference'}<span class="muted mono petit">prévu {valeurTexte(m, prevu, true)}</span>{/if}</span>
      {#if m.type === 'reference' && m.cle === 'reference:passages'}
        <PassagesLus passages={passagesPar[m.cle] ?? []} onchange={(ps) => changerPassages(m, ps)} />
        {#if autresTextes[m.cle]}<span class="muted petit">Déjà noté dans les blocs : {autresTextes[m.cle]}</span>{/if}
      {:else if m.type === 'reference'}
        <input class="texte" bind:value={textes[m.cle]} placeholder="Ex. Matthieu 8–10" aria-label={m.nom} />
        {#if autresTextes[m.cle]}<span class="muted petit">Déjà noté dans les blocs : {autresTextes[m.cle]}</span>{/if}
      {:else if m.type === 'oui_non'}
        <span class="ligne"><span class="muted">{nums[m.cle] ? 'Oui' : 'Non'}</span><Interrupteur actif={!!nums[m.cle]} label={m.nom} couleur="var(--c)" onchange={(v) => regler(m, v ? 1 : 0)} /></span>
      {:else if m.type === 'choix'}
        <Puces options={(m.options ?? []).map((o) => ({ valeur: o.valeur, label: o.label }))} valeur={nums[m.cle] ?? null} couleur="var(--c)" texte="var(--c-sur)" onchoisir={(v) => regler(m, v)} />
      {:else if m.type === 'heure'}
        <input class="texte mono" type="time" value={nums[m.cle] != null ? formatHeure(nums[m.cle]!) : ''} aria-label={m.nom} onchange={(e) => regler(m, parseHeure(e.currentTarget.value))} />
      {:else if m.type === 'temps'}
        <ChampTemps label={m.nom} valeur={nums[m.cle] ?? null} onchange={(v) => (nums[m.cle] = v)} />
      {:else}
        <div class="pas">
          <button type="button" aria-label="Moins" onclick={() => pas(m, -1)}>−</button>
          <input class="mono" bind:value={champs[m.cle]} onchange={() => lire(m)} inputmode="decimal" placeholder="0" aria-label={m.nom} />
          <span class="muted unite">{m.type === 'montant' ? '$' : m.type === 'distance' ? 'km' : m.type === 'poids' ? 'kg' : m.type === 'nombre' ? m.unite : ''}</span>
          <button type="button" aria-label="Plus" onclick={() => pas(m, 1)}>+</button>
        </div>
      {/if}
    </div>
  {/each}

  {#if pointLivres}
    <div class="livres">
      <span class="libelle"><span>Livres</span><span class="muted petit">{pointLivres.livres.filter((l) => l.actif).length} suivi{pointLivres.livres.filter((l) => l.actif).length > 1 ? 's' : ''}</span></span>
      {#each pointLivres.livres.filter((l) => l.actif) as l (l.id)}
        <div class="livre">
          <span class="col"><span class="nom">{l.titre}{l.auteur ? ` (${l.auteur})` : ''}</span><span class="muted petit">{l.total ? `${l.total} p` : 'pages inconnues'}{l.depart ? ` · ${l.depart} déjà lues` : ''}</span></span>
          <button type="button" class="retirer" aria-label="Retirer {l.titre}" onclick={() => retirerLivre(pointLivres.id, l.id)}>Retirer</button>
        </div>
      {/each}
      {#if !nouveau}
        <button type="button" class="ajouter" onclick={() => (nouveau = { titre: '', auteur: '', total: '', depart: '' })}>+ Ajouter un livre</button>
      {:else}
        <div class="nouveau">
          <input class="texte" bind:value={nouveau.titre} placeholder="Titre du livre" aria-label="Titre du livre" autocomplete="off" />
          <input class="texte" bind:value={nouveau.auteur} placeholder="Auteur ou initiales (ZTF)" aria-label="Auteur du livre" autocomplete="off" />
          <span class="deux">
            <input class="texte mono" bind:value={nouveau.total} inputmode="numeric" placeholder="Pages au total" aria-label="Pages au total" />
            <input class="texte mono" bind:value={nouveau.depart} inputmode="numeric" placeholder="Déjà lues" aria-label="Pages déjà lues" />
          </span>
          <span class="deux">
            <Bouton variante="secondaire" onclick={() => (nouveau = null)}>Annuler</Bouton>
            <Bouton variante="accent" desactive={!nouveau.titre.trim()} onclick={creerLivre}>Ajouter</Bouton>
          </span>
        </div>
      {/if}
    </div>
  {/if}

  <label class="champ">Note
    <textarea bind:value={note} rows="2" placeholder="Ce que je retiens de ce jour"></textarea>
  </label>
  <Bouton grand plein onclick={enregistrer}>Enregistrer</Bouton>
</Volet>

<style>
  .tete { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; }
  h2 { font-size: 22px; }
  .date { height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 10px; font-size: 16px; }
  .petit { font-size: 12px; }
  .champ { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 600; }
  .libelle { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; }
  .ligne { display: flex; justify-content: space-between; align-items: center; min-height: 44px; }
  .texte, textarea { min-height: 46px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 12px; font-size: 16px; font-weight: 500; }
  textarea { padding: 10px 12px; resize: none; }
  .pas { display: flex; align-items: center; height: 48px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--champ); }
  .pas button { flex: none; width: 48px; height: 48px; border: 0; background: transparent; font-size: 22px; }
  .pas input { flex: 1; min-width: 0; height: 46px; border: 0; background: transparent; text-align: right; font-size: 17px; padding: 0 6px; }
  .livres { display: flex; flex-direction: column; gap: 8px; font-size: 13px; font-weight: 600; }
  .livre { display: flex; align-items: center; gap: 10px; padding: 8px 12px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); }
  .livre .col { flex: 1; min-width: 0; display: flex; flex-direction: column; }
  .livre .nom { font-size: 14px; }
  .retirer, .ajouter { min-height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; padding: 0 12px; font-size: 13px; font-weight: 600; color: var(--c-encre, var(--texte)); }
  .retirer { min-height: 40px; color: var(--muted); }
  .nouveau { display: flex; flex-direction: column; gap: 8px; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
  .unite { flex: 1; font-size: 13px; font-weight: 500; }
</style>
