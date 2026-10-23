<script lang="ts">
  import Feuille from '../../ui/Feuille.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { tailleLisible } from '../../core/miniature.ts';
  import { MAX_PHOTOS, ajouterPiece, retirerPiece } from './actions.ts';
  import { logement, type Piece } from './etat.ts';

  type Cle = 'bail' | 'cni' | 'photos';
  let { ouverte = $bindable(false), cle }: { ouverte?: boolean; cle: Cle } = $props();
  const l = logement();
  const d = $derived(l.dossier);
  const nbPhotos = $derived(d?.photos.length ?? 0);
  const TEXTES: Record<Cle, { titre: string; aide: string }> = {
    bail: { titre: 'Bail signé', aide: 'Photographiez ou importez toutes les pages du bail, signées par vous et le bailleur (PDF ou photo).' },
    cni: { titre: 'CNI du bailleur', aide: "Recto de la carte d'identité du bailleur : le nom doit être lisible et correspondre au titulaire du compte." },
    photos: { titre: 'Photos du logement', aide: `Jusqu'à ${MAX_PHOTOS} photos : entrée, pièces principales, compteurs. Elles servent d'état des lieux.` }
  };
  const pieces = $derived<Piece[]>(!d ? [] : cle === 'photos' ? d.photos : d[cle] ? [d[cle] as Piece] : []);
  let erreur = $state('');
  let occupe = $state(false);

  async function choisi(e: Event) {
    const champ = e.currentTarget as HTMLInputElement;
    const fichiers = [...(champ.files ?? [])];
    champ.value = '';
    erreur = ''; occupe = true;
    for (const f of fichiers) {
      const r = await ajouterPiece(cle, f);
      if (r) { erreur = r; break; }
    }
    occupe = false;
  }
</script>

<Feuille bind:ouverte titre={TEXTES[cle].titre} sous={cle === 'photos' ? `${nbPhotos} / ${MAX_PHOTOS}` : ''}>
  <p class="muted">{TEXTES[cle].aide}</p>
  {#if pieces.length}
    <ul class="apercus" aria-label="Pièces ajoutées">
      {#each pieces as p, i (p.ajoute + p.nom + i)}
        <li>
          {#if p.miniature}<img src={p.miniature} alt="Aperçu de {p.nom}" />{:else}<span class="doc"><Icone nom="document" taille={28} /></span>{/if}
          <span class="nom">{p.nom}<small class="muted">{tailleLisible(p.taille)}</small></span>
          <button type="button" class="x" aria-label="Retirer {p.nom}" onclick={() => retirerPiece(cle, i)}><Icone nom="fermer" taille={16} trait={2.2} /></button>
        </li>
      {/each}
    </ul>
  {/if}
  {#if erreur}<p class="err" role="alert">{erreur}</p>{/if}
  {#if cle !== 'photos' || nbPhotos < MAX_PHOTOS}
    <div class="import" aria-busy={occupe}>
      <label class="b primaire"><Icone nom="camera" taille={18} />Prendre une photo<input type="file" accept="image/*" capture="environment" onchange={choisi} /></label>
      <label class="b secondaire"><Icone nom="photo" taille={18} />Choisir un fichier<input type="file" accept={cle === 'photos' ? 'image/*' : 'image/*,application/pdf'} multiple={cle === 'photos'} onchange={choisi} /></label>
    </div>
    {#if occupe}<p class="muted" role="status">Lecture du fichier…</p>{/if}
  {/if}
  <Bouton variante={pieces.length ? 'primaire' : 'discret'} onclick={() => (ouverte = false)}>{pieces.length ? 'Terminé' : 'Fermer'}</Bouton>
</Feuille>

<style>
  .apercus { list-style: none; display: flex; flex-direction: column; gap: 8px; }
  li { display: flex; align-items: center; gap: 12px; padding: 8px; border-radius: 14px; background: var(--carte2); border: 1px solid var(--ligne); }
  img, .doc { width: 56px; height: 56px; border-radius: 10px; object-fit: cover; flex: none; background: var(--carte); display: grid; place-items: center; color: var(--muted); }
  .nom { flex: 1; min-width: 0; display: flex; flex-direction: column; font-size: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } .nom small { font-size: 12px; }
  .x { width: 44px; height: 44px; border-radius: 22px; display: grid; place-items: center; color: var(--muted); flex: none; }
  .import { display: flex; flex-direction: column; gap: 8px; }
  .b { position: relative; display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; border-radius: 16px; font-weight: 650; font-size: 15.5px; cursor: pointer; }
  .primaire { background: var(--primaire); color: var(--sur-primaire); } .secondaire { background: var(--carte2); border: 1px solid var(--ligne-forte); }
  .b input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; font-size: 0; } .b:focus-within { outline: 2px solid var(--primaire-clair); outline-offset: 2px; }
  .err { color: var(--danger); font-size: 13px; }
</style>
