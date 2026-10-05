// Authentification (e-mail + mot de passe) et ouverture de la base locale de l'utilisateur.
import { ID_LOCAL, modeServeur } from './config.ts';
import { magasin } from './magasin.svelte.ts';
import { supabase } from './supabase.ts';
import { donneesDeDepart } from './seed.ts';

class Session {
  /** 'demarrage' → 'deconnecte' ou 'connecte'. */
  etat = $state<'demarrage' | 'deconnecte' | 'connecte'>('demarrage');
  erreur = $state<string | null>(null);
  email = $state<string | null>(null);

  async demarrer(): Promise<void> {
    if (!modeServeur) { await this.#ouvrirLocal(); return; }
    const sb = supabase()!;
    const { data } = await sb.auth.getSession();
    if (data.session) await this.#ouvrir(data.session.user.id, data.session.user.email ?? null);
    else {
      // Hors ligne avec une session expirée : on garde l'accès aux données déjà présentes sur l'appareil.
      const dernier = localStorage.getItem('luther-life:dernier-utilisateur');
      if (dernier && typeof navigator !== 'undefined' && !navigator.onLine) await this.#ouvrir(dernier, null);
      else this.etat = 'deconnecte';
    }
    sb.auth.onAuthStateChange((evt) => { if (evt === 'SIGNED_OUT') { void magasin.fermer(); this.etat = 'deconnecte'; } });
  }

  async connecter(email: string, motDePasse: string): Promise<boolean> {
    this.erreur = null;
    const { data, error } = await supabase()!.auth.signInWithPassword({ email, password: motDePasse });
    if (error || !data.user) { this.erreur = traduire(error?.message); return false; }
    await this.#ouvrir(data.user.id, data.user.email ?? email);
    return true;
  }

  async creerCompte(prenom: string, email: string, motDePasse: string): Promise<boolean> {
    this.erreur = null;
    if (motDePasse.length < 12) { this.erreur = 'Le mot de passe doit contenir au moins 12 caractères.'; return false; }
    const sb = supabase()!;
    const { data, error } = await sb.auth.signUp({ email, password: motDePasse, options: { data: { prenom } } });
    if (error || !data.user) { this.erreur = traduire(error?.message); return false; }
    if (!data.session) { this.erreur = 'Le compte est créé, mais la confirmation d’adresse est encore activée dans Supabase.'; return false; }
    const r = await sb.rpc('initialiser_compte', { p_prenom: prenom });
    if (r.error) { this.erreur = traduire(r.error.message); return false; }
    await this.#ouvrir(data.user.id, email);
    return true;
  }

  async deconnecter(): Promise<void> {
    await supabase()?.auth.signOut();
    await magasin.fermer();
    this.etat = 'deconnecte';
  }

  async #ouvrir(userId: string, email: string | null): Promise<void> {
    localStorage.setItem('luther-life:dernier-utilisateur', userId);
    this.email = email;
    await magasin.ouvrir(userId);
    this.etat = 'connecte';
  }

  async #ouvrirLocal(): Promise<void> {
    await magasin.ouvrir(ID_LOCAL);
    if (!magasin.lignes.profils.length) {
      const d = donneesDeDepart(ID_LOCAL, 'Luther');
      magasin.ecrire('profils', d.profil);
      for (const r of d.rubriques) magasin.ecrire('rubriques', r);
      for (const p of d.projets) magasin.ecrire('projets', p);
      for (const p of d.points) magasin.ecrire('points_rapport', p);
      for (const p of d.presets) magasin.ecrire('presets_export', p);
      await magasin.terminerEcritures();
    }
    this.etat = 'connecte';
  }
}

function traduire(message?: string): string {
  if (!message) return 'Une erreur est survenue.';
  if (/invalid login/i.test(message)) return 'Adresse e-mail ou mot de passe incorrect.';
  if (/already registered|already been registered/i.test(message)) return 'Cette adresse a déjà un compte.';
  if (/signups? not allowed|disabled/i.test(message)) return 'Les inscriptions sont fermées.';
  if (/network|fetch/i.test(message)) return 'Pas de connexion réseau.';
  return message;
}

export const session = new Session();
