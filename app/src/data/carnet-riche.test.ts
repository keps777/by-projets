// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';
import { magasin } from './magasin.svelte.ts';
import { session } from './auth.svelte.ts';
import { horloge } from './temps.svelte.ts';
import { ajouterNote, ajouterNoteRiche, mediasCites, modifierNoteRiche, notesDuJour, supprimerNote } from './actions/notes.ts';
import { compterAttente, enregistrerMedia, etatMedias, ramasserMedias, urlMedia, VIDEO_MAX } from './media.svelte.ts';

describe('notes riches et médias du Carnet', () => {
  beforeEach(async () => {
    await magasin.fermer();
    await Dexie.delete('luther-life-00000000-0000-4000-8000-000000000001');
    horloge.maintenant = Date.parse('2026-10-12T13:00:00Z');
    (URL as unknown as { createObjectURL: (b: Blob) => string }).createObjectURL = () => `blob:test/${Math.random().toString(16).slice(2)}`;
    (URL as unknown as { revokeObjectURL: (u: string) => void }).revokeObjectURL = () => undefined;
    await session.demarrer();
  });

  it('une note riche garde son contenu nettoyé et son texte brut ; elle prend le numéro suivant', () => {
    ajouterNote({ texte: 'Une note simple', origine: 'libre' });
    const n = ajouterNoteRiche('<h1>Culte</h1><div>Premier <b>paragraphe</b><script>x()</script></div><ul><li>un</li></ul>')!;
    expect(n.numero).toBe(2);
    expect(n.contenu).toBe('<h1>Culte</h1><p>Premier <strong>paragraphe</strong></p><ul><li>un</li></ul>');
    expect(n.texte).toBe('Culte\nPremier paragraphe\n• un');
    expect(notesDuJour(n.jour).map((x) => x.numero)).toEqual([1, 2]);
  });

  it('une note riche vide n’est pas ajoutée ; la corriger en vide la supprime', () => {
    expect(ajouterNoteRiche('<p><br></p>')).toBeUndefined();
    const n = ajouterNoteRiche('<p>Bonjour</p>')!;
    modifierNoteRiche(n.id, '<p>Bonjour <em>à tous</em></p>');
    expect(magasin.trouver('notes', n.id)?.texte).toBe('Bonjour à tous');
    expect(magasin.trouver('notes', n.id)?.numero).toBe(1);
    modifierNoteRiche(n.id, '<p><br></p>');
    expect(magasin.trouver('notes', n.id)).toBeUndefined();
  });

  it('les médias se gardent sur l’appareil et se relisent', async () => {
    const id = await enregistrerMedia(new Blob(['abc'], { type: 'image/jpeg' }), 'image');
    expect(await urlMedia(id)).toMatch(/^blob:/);
    expect(await urlMedia(id)).toBe(await urlMedia(id)); // gardée en mémoire
    expect(await urlMedia('00000000-0000-4000-8000-0000000000aa')).toBeNull(); // inconnu, pas de serveur en mode local
    const m = await magasin.db!.media.get(id);
    expect(m).toMatchObject({ type: 'image', mime: 'image/jpeg', taille: 3, envoye: 0 });
    await compterAttente();
    expect(etatMedias.attente).toBe(0); // mode local : rien à envoyer
  });

  it('refuse une vidéo trop lourde', async () => {
    const lourde = { size: VIDEO_MAX + 1, type: 'video/mp4' } as Blob;
    await expect(enregistrerMedia(lourde, 'video')).rejects.toThrow(/50 Mo/);
  });

  it('ramasse les médias que plus aucune note ne cite, après 24 h seulement', async () => {
    const garde = await enregistrerMedia(new Blob(['a'], { type: 'image/jpeg' }), 'image');
    const orphelin = await enregistrerMedia(new Blob(['b'], { type: 'image/jpeg' }), 'image');
    const frais = await enregistrerMedia(new Blob(['c'], { type: 'image/jpeg' }), 'image');
    await magasin.db!.media.update(garde, { cree: Date.now() - 48 * 3600_000 });
    await magasin.db!.media.update(orphelin, { cree: Date.now() - 48 * 3600_000 });
    const n = ajouterNoteRiche(`<figure><img data-media="${garde}"></figure><p>légende</p>`)!;
    expect(mediasCites()).toEqual(new Set([garde]));
    expect(await ramasserMedias(mediasCites())).toBe(1);
    expect(await magasin.db!.media.get(orphelin)).toBeUndefined();
    expect(await magasin.db!.media.get(garde)).toBeDefined();
    expect(await magasin.db!.media.get(frais)).toBeDefined(); // brouillon récent : intact
    supprimerNote(n.id);
    expect(mediasCites().size).toBe(0);
  });
});
