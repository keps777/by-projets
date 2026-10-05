<script lang="ts">
  import { untrack } from 'svelte';
  import { fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { aujourdhui as jourCourant } from '../../data/temps.svelte.ts';
  import { ajouterNote, modifierNote, notesDuJour, pagesDuCarnet, supprimerNote, toutesLesNotes } from '../../data/actions/notes.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { dire } from '../../ui/toast.svelte.ts';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Volet from '../../ui/Volet.svelte';
  import { cap, dateLongue } from '../fil/format.ts';
  import { jourValide } from '../fil/navigation.ts';
  import { joursDePages, numerosDePage, pageVoisine, provenance } from './carnet.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const aujourdhui = $derived(jourCourant());
  const jour = $derived(jourValide(routeur.params.get('jour')) ?? aujourdhui);
  const toutes = $derived(toutesLesNotes());
  const jours = $derived(joursDePages(toutes, aujourdhui));
  const notes = $derived(notesDuJour(jour));
  const precedente = $derived(pageVoisine(jours, jour, -1));
  const suivante = $derived(pageVoisine(jours, jour, 1));
  const sommaire = $derived(pagesDuCarnet());
  const total = $derived(toutes.length);

  let sens = $state(1);
  function ouvrirPage(j: string | null) {
    if (!j) return;
    sens = j >= jour ? 1 : -1;
    routeur.definir('jour', j === aujourdhui ? null : j);
    enEdition = null;
  }

  // Écriture d'une note libre : toujours ajoutée au livre, avec le numéro suivant, à la date d'aujourd'hui.
  let brouillon = $state('');
  let champ: HTMLTextAreaElement | undefined = $state();
  function ecrire() {
    const n = ajouterNote({ texte: brouillon, origine: 'libre' });
    if (!n) return;
    brouillon = '';
    if (jour !== aujourdhui) ouvrirPage(aujourdhui);
    dire(`Note n° ${n.numero} ajoutée au Carnet`);
    if (champ) champ.style.height = '';
  }
  function grandir() { if (champ) { champ.style.height = 'auto'; champ.style.height = Math.min(140, champ.scrollHeight) + 'px'; } }
  $effect(() => {
    if (champ && untrack(() => routeur.params.get('ecrire')) === '1') { champ.focus(); routeur.definir('ecrire', null); }
  });

  // Corriger ou supprimer une note.
  let enEdition = $state<string | null>(null);
  let texteEdition = $state('');
  function editer(id: string, texte: string) { enEdition = id; texteEdition = texte; }
  function enregistrer() { if (enEdition) modifierNote(enEdition, texteEdition); enEdition = null; }
  function retirer() { if (enEdition) { supprimerNote(enEdition); dire('Note supprimée · son numéro reste vacant'); } enEdition = null; }

  /** Le bloc d'une note, s'il existe encore. */
  const lienBloc = (occId: string | null) => {
    const o = occId ? magasin.trouver('occurrences', occId) : undefined;
    return o ? `/?jour=${o.jour}&bloc=${o.id}` : null;
  };

  // Glisser la page : vers la gauche = page suivante (plus récente), vers la droite = page précédente.
  let depart: { x: number; y: number; t: number } | null = null;
  let pan: HTMLDivElement | undefined = $state();
  function toucheDebut(e: TouchEvent) { const t = e.touches[0]; depart = e.touches.length === 1 ? { x: t.clientX, y: t.clientY, t: Date.now() } : null; }
  function toucheFin(e: TouchEvent) {
    const d = depart; depart = null;
    const t = e.changedTouches[0];
    if (!d || !t || enEdition) return;
    const dx = t.clientX - d.x, dy = t.clientY - d.y;
    if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.6 || Date.now() - d.t > 700) return;
    ouvrirPage(dx < 0 ? suivante : precedente);
  }
  $effect(() => {
    const el = pan;
    if (!el) return;
    const bloquer = (e: TouchEvent) => {
      const t = e.touches[0];
      if (depart && t && e.cancelable && Math.abs(t.clientX - depart.x) > 12 && Math.abs(t.clientX - depart.x) > Math.abs(t.clientY - depart.y) * 1.6) e.preventDefault();
    };
    el.addEventListener('touchmove', bloquer, { passive: false });
    return () => el.removeEventListener('touchmove', bloquer);
  });

  let sommaireOuvert = $state(false);
</script>

{#snippet pied()}
  <div class="ecrire">
    <textarea bind:this={champ} bind:value={brouillon} rows="1" placeholder="Écrire une note libre…" aria-label="Écrire une note libre" oninput={grandir}></textarea>
    <button type="button" class="envoyer" disabled={!brouillon.trim()} aria-label="Ajouter au Carnet" onclick={ecrire}><Icone nom="suivant" taille={20} trait={2.4} /></button>
  </div>
{/snippet}

<EcranPage {pied} gap={14}>
  <header>
    <button type="button" class="rond" aria-label="Retour" onclick={() => routeur.retour('/')}><Icone nom="retour" taille={18} trait={2.2} /></button>
    <h1 class="titre">Carnet</h1>
    <span class="compte mono muted">{total} note{total > 1 ? 's' : ''}</span>
    <button type="button" class="rond" aria-label="Sommaire des pages" onclick={() => (sommaireOuvert = true)}><Icone nom="fil" taille={19} /></button>
  </header>

  <div class="pan" bind:this={pan} ontouchstart={toucheDebut} ontouchend={toucheFin} role="presentation">
    {#key jour}
      <section class="page" in:fly={{ x: sens * 30, duration: 230, easing: cubicOut, opacity: 0 }} aria-label="Page du {dateLongue(jour)}">
        <div class="entete-page">
          <button type="button" class="rond petit" disabled={!precedente} aria-label="Page précédente" onclick={() => ouvrirPage(precedente)}><Icone nom="retour" taille={16} trait={2.2} /></button>
          <div class="date">
            <span class="titre jour-titre">{cap(dateLongue(jour))}</span>
            <span class="serif sous">{#if notes.length}{notes.length} note{notes.length > 1 ? 's' : ''} · {numerosDePage(notes[0].numero, notes[notes.length - 1].numero)}{:else}{jour === aujourdhui ? 'Page du jour' : 'Page blanche'}{/if}</span>
          </div>
          <button type="button" class="rond petit" disabled={!suivante} aria-label="Page suivante" onclick={() => ouvrirPage(suivante)}><Icone nom="suivant" taille={16} trait={2.2} /></button>
        </div>

        {#if notes.length}
          <ol class="notes">
            {#each notes as n (n.id)}
              <li class="note">
                <span class="numero mono">{n.numero}</span>
                <div class="corps">
                  {#if enEdition === n.id}
                    <textarea class="edition" bind:value={texteEdition} rows="4" aria-label="Texte de la note {n.numero}"></textarea>
                    <div class="actions-edition">
                      <button type="button" class="ok" onclick={enregistrer}>Enregistrer</button>
                      <button type="button" class="neutre" onclick={() => (enEdition = null)}>Annuler</button>
                      <button type="button" class="danger" onclick={retirer} aria-label="Supprimer la note {n.numero}"><Icone nom="poubelle" taille={17} /></button>
                    </div>
                  {:else}
                    <button type="button" class="texte" onclick={() => editer(n.id, n.texte)} aria-label="Note {n.numero} : {n.texte}. Toucher pour modifier">{n.texte}</button>
                    {#if lienBloc(n.occurrence_id)}
                      <a class="ref" href={lienBloc(n.occurrence_id)}><Icone nom="focus" taille={13} />{provenance(n)}</a>
                    {:else}
                      <span class="ref"><Icone nom={n.origine === 'libre' ? 'crayon' : 'focus'} taille={13} />{provenance(n)}</span>
                    {/if}
                  {/if}
                </div>
              </li>
            {/each}
          </ol>
        {:else}
          <div class="blanche">
            <span class="serif">{jour === aujourdhui ? 'Rien d’écrit aujourd’hui.' : 'Cette page est blanche.'}</span>
            <span class="muted">{jour === aujourdhui ? 'Une pensée, un verset, une décision : écris-la ci-dessous. Elle prendra le prochain numéro du livre.' : 'Aucune note ce jour-là.'}</span>
          </div>
        {/if}
      </section>
    {/key}
  </div>
</EcranPage>

<Volet ouvert={sommaireOuvert} onfermer={() => (sommaireOuvert = false)} label="Sommaire du Carnet">
  <h2 class="titre">Sommaire</h2>
  {#if sommaire.length}
    <ul class="sommaire">
      {#each sommaire as p (p.jour)}
        <li><button type="button" onclick={() => { sommaireOuvert = false; ouvrirPage(p.jour); }}>
          <span class="s-date">{cap(dateLongue(p.jour))}</span>
          <span class="muted s-n">{p.notes.length} note{p.notes.length > 1 ? 's' : ''} · {numerosDePage(p.de, p.a)}</span>
        </button></li>
      {/each}
    </ul>
  {:else}
    <p class="muted">Le livre est encore vide. Ta première note portera le numéro 1.</p>
  {/if}
</Volet>

<style>
  header { display: flex; align-items: center; gap: 10px; }
  h1 { font-size: 26px; flex: 1; }
  .compte { font-size: 12px; }
  .pan { touch-action: pan-y; }
  .page { display: flex; flex-direction: column; gap: 14px; }
  .entete-page { display: flex; align-items: center; gap: 10px; }
  .rond.petit { width: 40px; height: 40px; }
  .rond:disabled { opacity: 0.35; }
  .date { flex: 1; min-width: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
  .jour-titre { font-size: 21px; }
  .sous { font-size: 16px; color: var(--muted); }
  .notes { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--ligne); border-radius: 22px; overflow: hidden; }
  .note { display: flex; gap: 12px; padding: 14px 14px 14px 12px; }
  .note + .note { border-top: 1px solid var(--ligne); }
  .numero { flex: none; min-width: 34px; height: 28px; padding: 0 8px; border-radius: 9px; background: var(--accent-fond); color: var(--accent-encre); font-size: 14px; display: inline-flex; align-items: center; justify-content: center; margin-top: 1px; }
  .corps { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
  .texte { all: unset; box-sizing: border-box; display: block; width: 100%; font-size: 16px; line-height: 1.45; white-space: pre-wrap; overflow-wrap: anywhere; cursor: text; }
  .ref { display: inline-flex; align-items: center; gap: 5px; align-self: flex-start; font-size: 12px; font-weight: 600; color: var(--muted); }
  a.ref { color: var(--accent-encre); }
  .edition { font: 16px/1.45 var(--police); background: var(--champ); border: 1px solid var(--accent); border-radius: 14px; padding: 10px 12px; resize: vertical; min-height: 90px; }
  .actions-edition { display: flex; gap: 8px; align-items: center; }
  .actions-edition button { height: 44px; border-radius: 14px; border: 1px solid var(--ligne); background: var(--surface); font-size: 14px; font-weight: 600; padding: 0 16px; }
  .actions-edition .ok { background: var(--inverse); color: var(--inverse-texte); border-color: var(--inverse); }
  .actions-edition .danger { margin-left: auto; width: 44px; padding: 0; color: var(--mauvais); display: inline-flex; align-items: center; justify-content: center; }
  .blanche { display: flex; flex-direction: column; gap: 6px; align-items: center; text-align: center; padding: 36px 20px; border: 1.5px dashed var(--ligne); border-radius: 22px; }
  .blanche .serif { font-size: 24px; }
  .blanche .muted { font-size: 14px; max-width: 28ch; }
  .ecrire { display: flex; align-items: flex-end; gap: 8px; }
  .ecrire textarea { flex: 1; min-width: 0; font: 16px/1.4 var(--police); background: var(--surface); border: 1px solid var(--ligne); border-radius: 20px; padding: 12px 16px; resize: none; max-height: 140px; }
  .ecrire textarea:focus { outline: none; border-color: var(--accent); }
  .envoyer { flex: none; width: 46px; height: 46px; border-radius: 23px; border: 0; background: var(--accent); color: var(--accent-texte); display: inline-flex; align-items: center; justify-content: center; }
  .envoyer:disabled { opacity: 0.35; }
  .sommaire { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
  .sommaire li + li { border-top: 1px solid var(--ligne); }
  .sommaire button { all: unset; box-sizing: border-box; width: 100%; min-height: 56px; display: flex; flex-direction: column; justify-content: center; gap: 2px; cursor: pointer; }
  .s-date { font-size: 16px; font-weight: 600; }
  .s-n { font-size: 13px; }
</style>
