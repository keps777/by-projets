// PDF d'un livre (spec §18) : couverture, sommaire avec numéros de page, chapitres (un chapitre à pages s'ouvre sur sa page, titre au centre), pages, signatures.
// Le document est construit ici (pur) ; le dessin se fait dans pdf-livre-fichier.ts avec le même moteur que le PDF de la journée.
import type { Livre } from '../../data/actions/livres.ts';
import { signatureDe, texteSignature, titreChapitre } from '../../data/actions/livres.ts';
import { blocsDeNote, nettoyer, texteVersHtml, type BlocNote } from './riche.ts';

export interface EntreeLivre {
  id: string;
  /** 0 : chapitre ; 1 et plus : pages. */
  niveau: number;
  /** « 3 », « 3.1 »… */
  numero: string;
  titre: string;
  /** Chapitre à pages : seul son titre est affiché, sur sa propre page. */
  conteneur: boolean;
  blocs: BlocNote[];
  signature: string;
}
export interface DocumentLivre { /** Nom sur la couverture. */ auteur: string; titre: string; theme: string; couleur: string; pages: number; chapitres: number; genereLe: string; entrees: EntreeLivre[] }

export function documentLivre(l: Livre, genereLe: string, auteurParDefaut = ''): DocumentLivre {
  const entrees = l.arbre.map((x): EntreeLivre => {
    const g = x.conteneur ? null : signatureDe(x.note);
    return {
      id: x.note.id, niveau: x.niveau, numero: x.numero, titre: titreChapitre(x.note), conteneur: x.conteneur,
      blocs: x.conteneur ? [] : blocsDeNote(nettoyer(x.note.contenu ?? texteVersHtml(x.note.texte))),
      signature: g ? texteSignature(g) : ''
    };
  });
  return { auteur: l.auteur || auteurParDefaut, titre: l.titre, theme: l.theme, couleur: l.couleur, pages: l.pages, chapitres: l.nbChapitres, genereLe, entrees };
}

/** Identifiants des images citées par le livre. */
export const imagesDuLivre = (d: DocumentLivre): string[] => d.entrees.flatMap((e) => e.blocs.flatMap((b) => (b.type === 'media' && b.media === 'image' ? [b.id] : [])));
export const nomFichierLivre = (titre: string): string => `${titre.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'Livre'}.pdf`;
