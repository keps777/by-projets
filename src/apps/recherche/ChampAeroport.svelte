<script lang="ts">
  import { untrack } from 'svelte';
  import type { Aeroport } from '../../domain/types.ts';
  import Pictos from './Pictos.svelte';
  import { PARTOUT, grosCode, resoudreSaisie, suggerer, texteDe, type Suggestion } from './params.ts';

  /** Champ d'aéroport avec autocomplétion (combobox ARIA 1.2) : on tape une ville, un pays ou un code ; flèches, Entrée, Échap ; « Partout » en option pour l'arrivée. */
  let { id, label, valeur = $bindable(''), brut = $bindable(''), aeroports, partout = false, exclure = '', erreur = '', placeholder = 'Ville ou aéroport', onchoisir }:
    { id: string; label: string; valeur?: string; /** Texte tel qu'il est écrit dans le champ (même s'il ne désigne aucun aéroport). */ brut?: string; aeroports: Aeroport[]; partout?: boolean; exclure?: string; erreur?: string; placeholder?: string; onchoisir?: (v: string) => void } = $props();

  let texte = $state(untrack(() => texteDe(aeroports, valeur))), ouvert = $state(false), actif = $state(0), saisi = $state(false);
  // Le texte suit la valeur quand elle change de l'extérieur (inversion départ ↔ arrivée, préremplissage).
  $effect(() => { const v = valeur; untrack(() => { if (!saisi) texte = texteDe(aeroports, v); }); });
  $effect(() => { brut = texte; });
  const liste: Suggestion[] = $derived(ouvert ? suggerer(aeroports, saisi ? texte : '', { exclure, partout }) : []);
  const idListe = $derived(`${id}-liste`), idOption = (i: number) => `${id}-opt-${i}`;

  function choisir(s: Suggestion) { valeur = s.valeur; texte = texteDe(aeroports, s.valeur); ouvert = false; saisi = false; onchoisir?.(s.valeur); }
  function saisie(e: Event & { currentTarget: HTMLInputElement }) {
    texte = e.currentTarget.value; saisi = true; ouvert = true; actif = 0;
    const v = resoudreSaisie(aeroports, texte, { partout }); valeur = v && v !== exclure ? v : ''; if (valeur) onchoisir?.(valeur);
  }
  function touche(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!ouvert) { ouvert = true; saisi = false; actif = 0; } else actif = Math.min(liste.length - 1, actif + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); actif = Math.max(0, actif - 1); }
    else if (e.key === 'Enter' && ouvert && liste[actif]) { e.preventDefault(); choisir(liste[actif]); }
    else if (e.key === 'Escape' && ouvert) { e.preventDefault(); e.stopPropagation(); ouvert = false; }
  }
  function sortie() {
    // Un texte qui désigne exactement un aéroport est accepté ; sinon on garde ce qui est écrit : la validation du formulaire le signalera.
    setTimeout(() => { ouvert = false; saisi = false; const v = resoudreSaisie(aeroports, texte, { partout }); if (v && v !== exclure) { valeur = v; texte = texteDe(aeroports, v); } }, 120);
  }
  $effect(() => { if (ouvert && liste.length) document.getElementById(idOption(Math.min(actif, liste.length - 1)))?.scrollIntoView({ block: 'nearest' }); });
</script>

<div class="champ-aero" data-erreur={erreur ? '' : undefined}>
  <div class="ligne">
    <div class="saisie">
      <label for={id}>{label}</label>
      <input {id} type="text" role="combobox" autocomplete="off" autocapitalize="off" spellcheck="false" {placeholder} value={texte} oninput={saisie} onkeydown={touche} onfocus={(e) => { ouvert = true; saisi = false; actif = 0; e.currentTarget.select(); }} onblur={sortie}
        aria-expanded={ouvert} aria-controls={idListe} aria-autocomplete="list" aria-activedescendant={ouvert && liste.length ? idOption(Math.min(actif, liste.length - 1)) : undefined} aria-invalid={erreur ? 'true' : undefined} aria-describedby={erreur ? `${id}-e` : undefined} />
    </div>
    <span class="gros" aria-hidden="true">{grosCode(valeur) || '···'}</span>
  </div>
  {#if erreur}<span class="erreur" id="{id}-e" role="alert"><Pictos nom="alerte" taille={16} />{erreur}</span>{/if}
  <ul id={idListe} role="listbox" aria-label="{label} : suggestions" class="options" hidden={!ouvert || !liste.length}>
    {#each liste as s, i (s.valeur)}
      <li id={idOption(i)} role="option" aria-selected={i === actif} class:actif={i === actif} onpointerdown={(e) => { e.preventDefault(); choisir(s); }}>
        <span class="v">{s.valeur === PARTOUT ? s.ville : `${s.ville} (${s.code})`}</span><span class="p">{s.pays}</span>
      </li>
    {/each}
  </ul>
  <p class="sr" role="status" aria-live="polite">{ouvert ? (liste.length ? `${liste.length} suggestion${liste.length > 1 ? 's' : ''}` : 'Aucune suggestion') : ''}</p>
</div>

<style>
  .champ-aero { position: relative; } .ligne { display: flex; align-items: center; gap: 12px; }
  .saisie { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  label { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  input { width: 100%; min-width: 0; height: 44px; box-sizing: border-box; padding: 0; border: 0; border-bottom: 1px solid #7a8597; border-radius: 6px; background: transparent; color: var(--ink); font: 600 18px/24px 'Barlow', sans-serif; }
  input::placeholder { color: var(--ink3); font-weight: 500; }
  input[aria-invalid='true'] { border-bottom-color: var(--err); box-shadow: 0 1px 0 var(--err); }
  .gros { flex: none; min-width: 64px; text-align: right; font: 700 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .erreur { display: flex; gap: 6px; align-items: flex-start; margin-top: 4px; font: 500 13px/18px 'Barlow', sans-serif; color: var(--err); }
  .options { position: absolute; z-index: 30; left: -6px; right: -6px; top: 100%; margin: 0; padding: 6px; list-style: none; max-height: 232px; overflow-y: auto; border-radius: 14px; background: var(--surface); border: 1px solid var(--line-strong); box-shadow: 0 12px 32px rgba(11, 27, 46, 0.2); }
  .options[hidden] { display: none; }
  li { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-height: 44px; padding: 8px 12px; border-radius: 10px; cursor: pointer; align-items: center; }
  li.actif { background: var(--accent-soft); } .v { font: 600 16px/20px 'Barlow', sans-serif; } .p { font: 400 13px/16px 'Barlow', sans-serif; color: var(--ink3); text-align: right; }
  .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); margin: 0; }
</style>
