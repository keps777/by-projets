// Textes de l'écran explicatif quand un droit ne peut pas être revendu (nommé, gelé, échéance passée, déjà cédé…).
import type { Blocage } from '../../domain/revente.ts';
export interface TexteBlocage { titre: string; message: string; details: string[] }
export function texteBlocage(b: Blocage): TexteBlocage {
  switch (b) {
    case 'nomme': return { titre: 'Voyageur déjà nommé', message: 'Ce droit est nominatif : le voyageur est nommé, donc il ne peut plus être vendu ni transféré.', details: ['Seul un droit non nommé peut être revendu. Le voyageur se nomme au plus tard à J-1.'] };
    case 'gele': return { titre: 'Droit gelé', message: 'Ce droit est gelé par l’administration : aucune vente n’est possible pour l’instant.', details: ['Contactez l’assistance pour connaître la démarche à suivre.'] };
    case 'echeance': return { titre: 'Échéance passée', message: 'L’échéance de ce vol (J-1) est passée : plus aucune vente ni aucun transfert n’est possible.', details: ['Les annonces sont retirées automatiquement à J-1 et le voyageur est nommé par défaut.'] };
    case 'autre': return { titre: 'Ce droit n’est pas à vous', message: 'Ce droit de voyage n’est pas dans votre portefeuille : vous ne pouvez pas le revendre.', details: [] };
    case 'indisponible': return { titre: 'Droit indisponible', message: 'Ce droit a déjà été vendu, transféré, racheté ou utilisé : il n’est plus à vendre.', details: [] };
    default: return { titre: 'Droit introuvable', message: 'Ce droit de voyage n’existe pas.', details: [] };
  }
}
