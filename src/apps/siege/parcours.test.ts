import { describe, expect, it } from 'vitest';
import { GROUPES, PARCOURS, PLANCHES } from './parcours.ts';

// Chemins fixes de CONTRIBUER.md (liens entre applications).
const FIXES = new Set(`/splash /tuto /connexion /connexion/code / /filtres /ville /voix /orbe /destination /calendrier /siege /paiement /paiement/attente /paiement/refus /pass /pass/hors-ligne /pass/annule /groupe /proche /direct /direct/ilot /direct/retard /reseau /course /arret /covoit /covoit/ville /covoit/conduire /ussd /colis/envoi /colis/suivi /relais /livraison /notifications /litige /moi /moi/fidelite /moi/proches /reglages /autorisations /relais/devenir /relais/inscription /livreur/devenir /erreur /maintenance
/guichet /vente /vente/ticket /cadence /cadence/billet /cadence/quai /guichet/colis /depot /caisse /quai /quai/ok /quai/refus /convoyeur /chauffeur /chauffeur/arret /controleur /superviseur /superviseur/voir /superviseur/valider /superviseur/equipe /superviseur/debloquer /rapport-soir
/patron /patron/equipe /patron/gare /patron/personne /assistant /assistant/reponse /modules /financement /financement/demande /inter-agences /inter-agences/convention
/siege/analyses /siege/analyses/ligne /siege/analyses/bus /siege/comptable /siege/comptable/rapprochement /siege/config /siege/config/ligne /siege/config/personne /siege/controle /siege/controle/sante /parcours /relais/app /livreur /conducteur /vendeur /entree`.split(/\s+/));

describe('parcours', () => {
  it('chaque étape pointe vers un chemin fixe du contrat', () => {
    for (const f of PARCOURS) for (const e of f.etapes) expect(FIXES.has(e.chemin), `${f.titre} · ${e.nom} → ${e.chemin}`).toBe(true);
    for (const [planche, chemin] of Object.entries(PLANCHES)) expect(FIXES.has(chemin), `${planche} → ${chemin}`).toBe(true);
  });
  it('20 parcours (maquette), 4 groupes de rôles, au moins un joueur chacun avec une étape de départ valide', () => {
    expect(PARCOURS).toHaveLength(20); expect(GROUPES).toHaveLength(5); expect(new Set(PARCOURS.map((f) => f.groupe))).toEqual(new Set([1, 2, 3, 4]));
    for (const f of PARCOURS) { expect(f.joueurs.length).toBeGreaterThan(0); for (const j of f.joueurs) expect(j.depuis ?? 0).toBeLessThan(f.etapes.length); }
  });
});
