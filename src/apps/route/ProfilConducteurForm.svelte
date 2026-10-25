<script lang="ts">
  import { CHAMPS_ETAPE, COULEURS, erreursProfil, saisieDepuisProfil, saisieVide, type SaisieProfil } from '../../core/covoitProfil.ts';
  import { CARROSSERIES, NOM_CARROSSERIE, type Carrosserie } from '../../core/covoitTypes.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { enregistrerProfil, profilDe } from './covoitActions.ts';
  import IconeCv from './IconeCv.svelte';
  import { miniature } from './photo.ts';

  /** Profil conducteur en 4 étapes : identité (CNI recto/verso), permis, véhicule (marque, plaque, places, carrosserie), photos. Obligatoire avant de publier un trajet. */
  let { personneId, onenregistre, titreBouton = 'Enregistrer mon profil' }: { personneId: string; onenregistre: () => void; titreBouton?: string } = $props();
  const existant = profilDe(personneId);
  let s = $state<SaisieProfil>(existant ? saisieDepuisProfil(existant) : saisieVide()), etape = $state(0), vues = $state<number[]>([]), erreurPhoto = $state(''), envoi = $state(false);
  const err = $derived(erreursProfil(s, maintenant()));
  const TITRES = ['Identité', 'Permis', 'Véhicule', 'Photos'];
  const montre = (k: keyof SaisieProfil) => (vues.includes(CHAMPS_ETAPE.findIndex((e) => e.includes(k))) ? err[k] : undefined);
  const etapeOk = (i: number) => CHAMPS_ETAPE[i].every((k) => !err[k]);
  function suivant() { vues = [...new Set([...vues, etape])]; if (etapeOk(etape)) etape += 1; }
  async function photo(e: Event, cible: 'recto' | 'verso' | 'vehicule') {
    const champ = e.currentTarget as HTMLInputElement, f = champ.files?.[0]; erreurPhoto = ''; if (!f) return;
    try { const m = await miniature(f); if (cible === 'vehicule') s.photos = [...s.photos, m].slice(0, 3); else s[cible] = m; } catch (x) { erreurPhoto = x instanceof Error ? x.message : 'Photo illisible'; }
    champ.value = '';
  }
  function enregistrer() {
    vues = [0, 1, 2, 3]; if (Object.keys(err).length) { etape = CHAMPS_ETAPE.findIndex((_, i) => !etapeOk(i)); return; }
    envoi = true; try { enregistrerProfil(personneId, s); montrer('Profil enregistré · vérification en cours'); onenregistre(); } catch (x) { montrer(x instanceof Error ? x.message : 'Enregistrement impossible', 'er'); } finally { envoi = false; }
  }
  const SIL: Record<Carrosserie, string> = {
    citadine: 'M4 20L6 14Q8 8 16 8H34Q42 8 46 14L54 16Q57 17 57 20V22H4Z', berline: 'M2 20L6 15H16L22 8H38L46 15H56Q58 16 58 20V22H2Z',
    suv: 'M3 22V13Q3 11 6 10L14 9L18 4H44L52 10Q57 11 57 14V22Z', pickup: 'M2 22V14H10L15 7H30L34 14H58V22ZM36 14V10H58'
  };
</script>

<ol class="etapes" aria-label="Étapes du profil">{#each TITRES as t, k (t)}<li class:on={k === etape} class:fait={k < etape} aria-current={k === etape ? 'step' : undefined}><span>{k < etape ? '✓' : k + 1}</span><b>{t}</b></li>{/each}</ol>

{#if etape === 0}
  <p class="cv-note">Pour la sécurité des voyageurs, AfriMove vérifie ton identité. Tes documents ne sont jamais montrés aux passagers.</p>
  <label class="fld"><span class="lab">Numéro de carte d’identité</span><input class="inp" inputmode="numeric" autocomplete="off" placeholder="ex. 112233445" bind:value={s.cni} aria-invalid={!!montre('cni')} />{#if montre('cni')}<span class="t12 erc" role="alert">{montre('cni')}</span>{/if}</label>
  {#each [['recto', 'Recto de la carte', 'Photographier le recto'], ['verso', 'Verso de la carte', 'Photographier le verso']] as [cle, titre, bouton] (cle)}
    <div class="photo">
      {#if s[cle as 'recto' | 'verso']}<img src={s[cle as 'recto' | 'verso']} alt="Aperçu : {titre.toLowerCase()}" />{:else}<span class="vide" aria-hidden="true"><IconeCv nom="appareil" taille={26} /></span>{/if}
      <span class="col grow g4"><span class="t14 b7">{titre}</span><label class="cv-bouton petit">{s[cle as 'recto' | 'verso'] ? 'Reprendre' : bouton}<input type="file" accept="image/*" capture="environment" class="sr" aria-label={bouton} onchange={(e) => photo(e, cle as 'recto' | 'verso')} /></label>
        {#if montre(cle as 'recto' | 'verso')}<span class="t12 erc" role="alert">{montre(cle as 'recto' | 'verso')}</span>{/if}</span>
    </div>
  {/each}
{:else if etape === 1}
  <label class="fld"><span class="lab">Numéro de permis de conduire</span><input class="inp" autocomplete="off" placeholder="ex. CE-123456" bind:value={s.permis} aria-invalid={!!montre('permis')} />{#if montre('permis')}<span class="t12 erc" role="alert">{montre('permis')}</span>{/if}</label>
  <label class="fld"><span class="lab">Date de validité</span><input class="inp" type="date" bind:value={s.validite} aria-invalid={!!montre('validite')} />{#if montre('validite')}<span class="t12 erc" role="alert">{montre('validite')}</span>{/if}</label>
{:else if etape === 2}
  <div class="duo">
    <label class="fld"><span class="lab">Marque</span><input class="inp" list="marques" placeholder="Toyota" bind:value={s.marque} />{#if montre('marque')}<span class="t12 erc" role="alert">{montre('marque')}</span>{/if}</label>
    <label class="fld"><span class="lab">Modèle</span><input class="inp" placeholder="Corolla" bind:value={s.modele} />{#if montre('modele')}<span class="t12 erc" role="alert">{montre('modele')}</span>{/if}</label>
  </div>
  <datalist id="marques">{#each ['Toyota', 'Hyundai', 'Kia', 'Nissan', 'Suzuki', 'Peugeot', 'Renault', 'Dacia', 'Honda', 'Mitsubishi'] as m (m)}<option value={m}></option>{/each}</datalist>
  <label class="fld"><span class="lab">Plaque d’immatriculation</span><input class="inp mono" placeholder="LT 123 AB" autocapitalize="characters" bind:value={s.plaque} />{#if montre('plaque')}<span class="t12 erc" role="alert">{montre('plaque')}</span>{/if}</label>
  <div class="col g8"><span class="lab" id="coul">Couleur</span><div class="chips" style="flex-wrap: wrap" role="group" aria-labelledby="coul">{#each COULEURS as c (c)}<button type="button" class="ch" class:on={s.couleur === c} aria-pressed={s.couleur === c} onclick={() => (s.couleur = c)}>{c}</button>{/each}</div>{#if montre('couleur')}<span class="t12 erc" role="alert">{montre('couleur')}</span>{/if}</div>
  <div class="col g8"><span class="lab" id="carr">Type de véhicule</span>
    <div class="carros" role="radiogroup" aria-labelledby="carr">{#each CARROSSERIES as c (c)}<button type="button" role="radio" aria-checked={s.carrosserie === c} class="tuile" class:on={s.carrosserie === c} onclick={() => (s.carrosserie = c)}><svg viewBox="0 0 60 28" width="54" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d={SIL[c]} /><circle cx="15" cy="22" r="3.5" fill="#0a0e1c" /><circle cx="46" cy="22" r="3.5" fill="#0a0e1c" /></svg><span class="t13 b7">{NOM_CARROSSERIE[c]}</span></button>{/each}</div>
    {#if montre('carrosserie')}<span class="t12 erc" role="alert">{montre('carrosserie')}</span>{/if}</div>
  <div class="cv-verre row sp"><span class="col"><span class="lab">Places pour les passagers</span><span class="t12 mut">sans compter ta place</span></span>
    <span class="pas"><button type="button" aria-label="Moins de places passagers" disabled={s.places <= 1} onclick={() => (s.places -= 1)}>−</button><b aria-live="polite">{s.places}</b><button type="button" aria-label="Plus de places passagers" disabled={s.places >= 4} onclick={() => (s.places += 1)}>+</button></span></div>
{:else}
  <p class="cv-note">Ajoute 1 à 3 photos de ton véhicule (extérieur, intérieur) : les voyageurs les voient sur ta fiche.</p>
  <div class="vignettes">{#each s.photos as p, k (k)}<span class="vig"><img src={p} alt="Photo du véhicule {k + 1}" /><button type="button" aria-label="Retirer la photo {k + 1}" onclick={() => (s.photos = s.photos.filter((_, i) => i !== k))}>×</button></span>{/each}</div>
  {#if s.photos.length < 3}<label class="cv-bouton p"><IconeCv nom="appareil" taille={18} />Ajouter une photo du véhicule<input type="file" accept="image/*" capture="environment" class="sr" aria-label="Ajouter une photo du véhicule" onchange={(e) => photo(e, 'vehicule')} /></label>{/if}
  {#if montre('photos')}<span class="t12 erc" role="alert">{montre('photos')}</span>{/if}
  <div class="cv-verre col g4"><span class="lab">Récapitulatif</span><span class="t14 b7">{s.marque} {s.modele} · {s.couleur || '—'} · {s.plaque || '—'}</span><span class="t12 mut">{s.carrosserie ? NOM_CARROSSERIE[s.carrosserie] : '—'} · {s.places} place{s.places > 1 ? 's' : ''} passagers · permis {s.permis || '—'}</span></div>
{/if}
{#if erreurPhoto}<div class="cv-err" role="alert">{erreurPhoto}</div>{/if}

<div class="cv-grille nav" style="grid-template-columns: {etape ? '1fr 2fr' : '1fr'}">
  {#if etape}<button type="button" class="cv-bouton" onclick={() => (etape -= 1)}>Retour</button>{/if}
  {#if etape < 3}<button type="button" class="cv-bouton p" onclick={suivant}>Continuer</button>{:else}<button type="button" class="cv-bouton p" disabled={envoi} onclick={enregistrer}>{titreBouton}</button>{/if}
</div>

<style>
  .etapes { list-style: none; display: flex; gap: 6px; padding: 0; margin: 0; } .etapes li { flex: 1; display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 36px; border-radius: 12px; font: 600 11px 'Geist Mono', monospace; color: #a1accb; background: rgba(255, 255, 255, 0.05); }
  .etapes li b { font-weight: 600; } .etapes li span { width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; background: rgba(255, 255, 255, 0.12); font-size: 11px; flex: none; }
  .etapes li.on { color: #fff; background: rgba(139, 124, 255, 0.28); } .etapes li.on span { background: linear-gradient(135deg, #8b7cff, #3de0ff); color: #06080f; } .etapes li.fait span { background: #4ade80; color: #06080f; }
  .duo { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
  .photo { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 18px; background: rgba(255, 255, 255, 0.05); border: 1px dashed rgba(127, 235, 255, 0.4); }
  .photo img { width: 96px; height: 64px; object-fit: cover; border-radius: 12px; flex: none; } .photo .vide { width: 96px; height: 64px; border-radius: 12px; display: grid; place-items: center; background: rgba(255, 255, 255, 0.07); color: #7febff; flex: none; }
  .cv-bouton.petit { min-height: 44px; font-size: 13px; position: relative; } label.cv-bouton { cursor: pointer; }
  .sr { position: absolute; width: 1px; height: 1px; opacity: 0; overflow: hidden; }
  .carros { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; } .tuile { display: flex; flex-direction: column; align-items: center; gap: 4px; min-height: 76px; padding: 10px; border-radius: 16px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.05); color: #b7c0db; cursor: pointer; font: inherit; }
  .tuile.on { border-color: #8b7cff; background: linear-gradient(135deg, rgba(139, 124, 255, 0.28), rgba(61, 224, 255, 0.14)); color: #fff; } .tuile:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
  .pas { display: inline-flex; align-items: center; gap: 4px; } .pas b { min-width: 34px; text-align: center; font: 700 22px 'Unbounded Variable', 'Unbounded', sans-serif; }
  .pas button { width: 46px; height: 46px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.2); background: rgba(255, 255, 255, 0.08); color: #f2f4ff; font: 700 22px 'Sora Variable', sans-serif; cursor: pointer; } .pas button:disabled { opacity: 0.4; }
  .vignettes { display: flex; gap: 8px; flex-wrap: wrap; } .vig { position: relative; } .vig img { width: 100px; height: 72px; object-fit: cover; border-radius: 12px; display: block; } .vig button { position: absolute; top: -8px; right: -8px; width: 30px; height: 30px; border-radius: 50%; border: 0; background: #ff6b6b; color: #06080f; font: 700 18px sans-serif; cursor: pointer; }
  .nav { margin-top: 4px; } input.inp, select.inp { min-height: 50px; }
</style>
