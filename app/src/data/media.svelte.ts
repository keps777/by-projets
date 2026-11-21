// Médias du Carnet (spec §18, nov. 2026) : images et vidéos des notes riches. Gardés sur l'appareil (IndexedDB) ; avec le serveur,
// envoyés dans le bucket privé « carnet » (dossier = identifiant de l'utilisateur) dès que le réseau le permet, retéléchargés à la demande.
import { nouvelId } from '@core/ids.ts';
import { magasin } from './magasin.svelte.ts';
import { supabase } from './supabase.ts';
import { modeServeur } from './config.ts';
import type { MediaLocal } from './db.ts';

export const BUCKET = 'carnet';
export const VIDEO_MAX = 50 * 1024 * 1024;
export const IMAGE_MAX_PX = 1600;
const GRACE_MS = 24 * 3600_000;

class EtatMedias {
  /** Médias pas encore envoyés au serveur (toujours 0 en mode local). */
  attente = $state(0);
  erreur = $state<string | null>(null);
}
export const etatMedias = new EtatMedias();

const chemin = (id: string) => `${magasin.userId}/${id}`;

export async function compterAttente(): Promise<void> {
  const db = magasin.db;
  etatMedias.attente = !db || !modeServeur ? 0 : await db.media.where('envoye').equals(0).count();
}

/** Réduit une image à 1600 px au plus (JPEG) ; un GIF ou un SVG léger reste tel quel. Lève une erreur si l'image est illisible. */
export async function preparerImage(fichier: Blob): Promise<Blob> {
  if ((fichier.type === 'image/gif' || fichier.type === 'image/svg+xml') && fichier.size <= 5 * 1024 * 1024) return fichier;
  let bitmap: ImageBitmap;
  try { bitmap = await createImageBitmap(fichier, { imageOrientation: 'from-image' }); } catch { throw new Error('Image illisible'); }
  const echelle = Math.min(1, IMAGE_MAX_PX / Math.max(bitmap.width, bitmap.height));
  const l = Math.max(1, Math.round(bitmap.width * echelle)), h = Math.max(1, Math.round(bitmap.height * echelle));
  const canvas = document.createElement('canvas');
  canvas.width = l; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Image illisible');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, l, h);
  ctx.drawImage(bitmap, 0, 0, l, h);
  bitmap.close?.();
  const sortie = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.82));
  if (!sortie) throw new Error('Image illisible');
  return sortie;
}

/** Garde un média sur l'appareil et lance son envoi. Rend son identifiant. */
export async function enregistrerMedia(blob: Blob, type: MediaLocal['type']): Promise<string> {
  const db = magasin.db;
  if (!db) throw new Error('Carnet indisponible');
  if (type === 'video' && blob.size > VIDEO_MAX) throw new Error('Vidéo trop lourde (50 Mo au plus)');
  const id = nouvelId();
  await db.media.put({ id, type, mime: blob.type || (type === 'video' ? 'video/mp4' : 'image/jpeg'), taille: blob.size, blob, envoye: 0, cree: Date.now() });
  await compterAttente();
  void envoyerMedias();
  return id;
}

const urls = new Map<string, string>();
const encours = new Map<string, Promise<string | null>>();

/** Adresse d'affichage d'un média : depuis l'appareil, sinon téléchargé du serveur (puis gardé). Null s'il est introuvable. */
export function urlMedia(id: string): Promise<string | null> {
  const connue = urls.get(id);
  if (connue) return Promise.resolve(connue);
  let p = encours.get(id);
  if (!p) {
    p = (async () => {
      const db = magasin.db;
      if (!db) return null;
      let m = await db.media.get(id);
      if (!m) {
        const sb = supabase();
        if (!sb || !magasin.userId) return null;
        const { data, error } = await sb.storage.from(BUCKET).download(chemin(id));
        if (error || !data) return null;
        const type: MediaLocal['type'] = data.type.startsWith('video/') ? 'video' : 'image';
        m = { id, type, mime: data.type, taille: data.size, blob: data, envoye: 1, cree: Date.now() };
        await db.media.put(m);
      }
      const u = URL.createObjectURL(m.blob);
      urls.set(id, u);
      return u;
    })().finally(() => encours.delete(id));
    encours.set(id, p);
  }
  return p;
}

let envoiEnCours = false;
/** Après un échec (bucket absent, réseau…), on n'insiste pas avant ce moment : une vidéo de 50 Mo ne doit pas repartir à chaque synchronisation. */
let pasAvant = 0;
/** Envoie au serveur les médias pas encore envoyés (un par un). S'arrête au premier échec de réseau ; reprend à la prochaine synchronisation. */
export async function envoyerMedias(): Promise<void> {
  const sb = supabase(), db = magasin.db;
  if (!sb || !db || !magasin.userId || envoiEnCours || Date.now() < pasAvant) return;
  envoiEnCours = true;
  try {
    for (const m of await db.media.where('envoye').equals(0).toArray()) {
      const { error } = await sb.storage.from(BUCKET).upload(chemin(m.id), m.blob, { contentType: m.mime, upsert: true });
      if (error) { etatMedias.erreur = error.message; pasAvant = Date.now() + 10 * 60_000; break; }
      etatMedias.erreur = null;
      await db.media.update(m.id, { envoye: 1 });
    }
  } catch (e) {
    etatMedias.erreur = e instanceof Error ? e.message : String(e);
    pasAvant = Date.now() + 2 * 60_000;
  } finally {
    envoiEnCours = false;
    await compterAttente();
  }
}

/** Retire les médias qu'aucune note ne cite plus (et vieux de plus de 24 h : un brouillon en cours d'écriture n'est pas touché). */
export async function ramasserMedias(cites: ReadonlySet<string>): Promise<number> {
  const db = magasin.db;
  if (!db) return 0;
  const limite = Date.now() - GRACE_MS;
  const inutiles = (await db.media.toArray()).filter((m) => !cites.has(m.id) && m.cree < limite);
  if (!inutiles.length) return 0;
  await db.media.bulkDelete(inutiles.map((m) => m.id));
  for (const m of inutiles) { const u = urls.get(m.id); if (u) { URL.revokeObjectURL(u); urls.delete(m.id); } }
  const sb = supabase();
  if (sb && magasin.userId) await sb.storage.from(BUCKET).remove(inutiles.filter((m) => m.envoye).map((m) => chemin(m.id))).catch(() => undefined);
  await compterAttente();
  return inutiles.length;
}
