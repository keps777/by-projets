<script lang="ts">
  // Contenu de l'export (planche RapportExport) : préréglages, points à inclure, aperçu du message, Copier, Partager, PDF.
  import Icone from '../../ui/Icone.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { styleCouleur, couleurRubrique } from '../../ui/couleurs.ts';
  import { theme } from '../../ui/theme.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { enregistrerPreset } from '../../data/actions/reglages.ts';
  import type { Langue } from '@core/rapport.ts';
  import { contenuDuJour, texteDuRapport, type PointCalcule } from './calcul.ts';
  import { marquerEnvoye } from './donnees.ts';
  import { copierTexte, partagerTexte } from './partage.ts';
  import { htmlImprimable, imprimer } from './pdf.ts';
  import { libellePeriode, type Periode } from './periodes.ts';

  let { periode, points, nom, langue, entete = true }: { periode: Periode; points: PointCalcule[]; nom: string; langue: Langue; entete?: boolean } = $props();

  const CLE = 'luther-life:export-selection';
  const presets = $derived([...magasin.lignes.presets_export].sort((a, b) => a.ordre - b.ordre));

  function selectionDeDepart(): string[] {
    try { const s = JSON.parse(localStorage.getItem(CLE) ?? 'null'); if (Array.isArray(s)) return s; } catch { /* rien de mémorisé */ }
    const p = [...magasin.lignes.presets_export].sort((a, b) => a.ordre - b.ordre)[0];
    return p ? [...p.points] : magasin.lignes.points_rapport.map((x) => x.id);
  }
  let selection = $state<string[]>(selectionDeDepart());
  $effect(() => { try { localStorage.setItem(CLE, JSON.stringify(selection)); } catch { /* stockage indisponible */ } });

  const ids = $derived(new Set(points.map((p) => p.point.id)));
  const choisis = $derived(points.filter((p) => selection.includes(p.point.id)));
  const memeEnsemble = (a: string[]) => { const b = a.filter((x) => ids.has(x)); return b.length === choisis.length && b.every((x) => selection.includes(x)); };
  const presetActif = $derived(presets.find((p) => memeEnsemble(p.points)));

  const texte = $derived(texteDuRapport({ periode, nom, langue, points: choisis }));
  let copie = $state(false);
  let nomPreset = $state<string | null>(null);

  function basculer(id: string): void { selection = selection.includes(id) ? selection.filter((x) => x !== id) : [...selection, id]; copie = false; }
  function choisirPreset(pts: string[]): void { selection = [...pts]; copie = false; }

  function noterEnvoi(): void { if (periode.vue === 'jour') marquerEnvoye(periode.debut, contenuDuJour(periode.debut, points)); }

  async function copier(): Promise<void> {
    if (!choisis.length) { dire('Choisis au moins un point.'); return; }
    if (await copierTexte(texte)) { copie = true; noterEnvoi(); dire('Texte copié. Colle-le dans WhatsApp.'); } else dire('Copie impossible sur cet appareil.');
  }
  async function partager(): Promise<void> {
    if (!choisis.length) { dire('Choisis au moins un point.'); return; }
    const r = await partagerTexte(texte, libellePeriode(periode));
    if (r === 'partage') { noterEnvoi(); dire('Rapport partagé.'); }
    else if (r === 'copie') { copie = true; noterEnvoi(); dire('Partage indisponible : texte copié.'); }
    else if (r === 'echec') dire('Partage impossible sur cet appareil.');
  }
  function pdf(): void {
    if (!choisis.length) { dire('Choisis au moins un point.'); return; }
    const titre = periode.vue === 'jour' ? (langue === 'fr' ? 'Rapport du jour' : 'Daily report') : periode.vue === 'semaine' ? (langue === 'fr' ? 'Rapport de la semaine' : 'Weekly report') : (langue === 'fr' ? 'Rapport du mois' : 'Monthly report');
    const html = htmlImprimable({
      titre, sousTitre: libellePeriode(periode), nom, langue, genereLe: new Date().toLocaleString('fr-CA', { dateStyle: 'long', timeStyle: 'short' }),
      lignes: choisis.map((p, i) => ({ n: i + 1, code: p.point.code, libelle: p.point.libelle, mesures: p.mesures, ratio: p.ratio, couleur: p.couleur }))
    });
    if (!imprimer(html)) { void copier(); dire('PDF indisponible : texte copié à la place.'); }
  }
  function enregistrer(): void {
    const n = nomPreset?.trim();
    if (!n) return;
    enregistrerPreset(`${n} · ${choisis.length}`, choisis.map((p) => p.point.id));
    nomPreset = null;
    dire('Préréglage enregistré.');
  }
</script>

<div class="panneau" class:volet={entete}>
  {#if entete}
    <div class="tete">
      <h2 class="titre">Exporter</h2>
      <span class="muted compte">{choisis.length} point(s) sur {points.length}</span>
    </div>
  {:else}
    <span class="muted compte">{libellePeriode(periode)} · {choisis.length} point(s) sur {points.length}</span>
  {/if}

  {#if presets.length}
    <div class="presets">
      {#each presets as pr (pr.id)}
        <button type="button" class:actif={presetActif?.id === pr.id} aria-pressed={presetActif?.id === pr.id} onclick={() => choisirPreset(pr.points)}>{pr.nom}</button>
      {/each}
    </div>
  {/if}

  <div class="points">
    {#each points as p, i (p.point.id)}
      {@const on = selection.includes(p.point.id)}
      <button type="button" class="mono" class:on aria-pressed={on} style={styleCouleur(couleurRubrique(p.couleur ?? '#9D8CFF', theme.mode))} onclick={() => basculer(p.point.id)}>{i + 1}. {p.point.code}</button>
    {/each}
  </div>

  {#if !presetActif && choisis.length}
    {#if nomPreset === null}
      <button type="button" class="lien" onclick={() => (nomPreset = '')}><Icone nom="plus" taille={15} trait={2.4} />Enregistrer comme préréglage</button>
    {:else}
      <form class="nouveau" onsubmit={(e) => { e.preventDefault(); enregistrer(); }}>
        <input aria-label="Nom du préréglage" placeholder="Nom, ex. Mentor" bind:value={nomPreset} />
        <button type="submit" class="ok" disabled={!nomPreset?.trim()}>Enregistrer</button>
      </form>
    {/if}
  {/if}

  <div class="apercu">
    <span class="etiquette">Aperçu du message</span>
    <div class="bulle">{choisis.length ? texte : 'Aucun point choisi.'}</div>
  </div>

  <div class="actions">
    <button type="button" class="secondaire" onclick={copier}>{copie ? 'Copié ✓' : 'Copier le texte'}</button>
    <button type="button" class="principal" onclick={partager}>Partager…</button>
  </div>
  <button type="button" class="pdf" onclick={pdf}><span class="mono">PDF</span> Enregistrer en PDF</button>
</div>

<style>
  .panneau { display: flex; flex-direction: column; gap: 12px; }
  /* Feuille de la planche RapportExport : marges 16/20 et écart 12, un peu plus serrées que le Volet commun (18/22, 14). */
  .panneau.volet { margin: -2px -2px -2px; }
  .tete { display: flex; justify-content: space-between; align-items: baseline; }
  h2 { font-size: 22px; line-height: normal; }
  .compte { font-size: 13px; }
  .presets { display: flex; gap: 6px; flex-wrap: wrap; }
  /* Boutons dessinés à 40 px comme la maquette ; la zone d'appui reste à 44 px. */
  .presets button, .points button { position: relative; }
  .presets button::after, .points button::after { content: ''; position: absolute; inset: -2px 0; }
  .presets button { height: 40px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; font-size: 13px; font-weight: 600; }
  .presets button.actif { background: var(--inverse); border-color: var(--inverse); color: var(--inverse-texte); }
  .points { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; }
  .points button { height: 40px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; color: var(--muted); font-size: 12px; padding: 0 4px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .points button.on { background: var(--c-fond); border-color: var(--c); color: var(--c-encre); }
  .lien { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; min-height: 44px; border: 0; background: none; padding: 0; color: var(--accent-encre); font-size: 13px; font-weight: 600; }
  .nouveau { display: flex; gap: 6px; }
  .nouveau input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); padding: 0 12px; font-size: 15px; }
  .ok { height: 44px; padding: 0 14px; border-radius: 12px; border: 0; background: var(--accent); color: var(--accent-texte); font-weight: 600; }
  .ok:disabled { opacity: 0.45; }
  .apercu { display: flex; flex-direction: column; gap: 6px; }
  .bulle { background: var(--bulle); color: var(--bulle-texte); border-radius: 18px 18px 4px 18px; padding: 12px 14px; font-size: 14px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; }
  .actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .actions button { height: 50px; border-radius: 16px; font-size: 15px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .secondaire { border: 1px solid var(--ligne); background: var(--surface); }
  .principal { border: 0; background: var(--inverse); color: var(--inverse-texte); }
  .pdf { min-height: 46px; border-radius: 14px; border: 1px dashed var(--ligne); background: transparent; color: var(--muted); font-size: 14px; font-weight: 600; display: flex; align-items: center; justify-content: center; gap: 8px; }
  .pdf .mono { font-size: 11px; padding: 2px 6px; border: 1px solid var(--ligne); border-radius: 6px; color: var(--texte); }
</style>
