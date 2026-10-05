<script lang="ts">
  // Réglages (planches Reglages, JourReglages) : profil, points du rapport, exports, notifications, rappels, apparence, compte.
  import { tick, untrack } from 'svelte';
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import Puces from '../../ui/Puces.svelte';
  import { dire } from '../../ui/toast.svelte.ts';
  import { theme, type Apparence } from '../../ui/theme.svelte.ts';
  import { routeur } from '../../routeur.svelte.ts';
  import { magasin } from '../../data/magasin.svelte.ts';
  import { session } from '../../data/auth.svelte.ts';
  import { modeServeur } from '../../data/config.ts';
  import { aujourdhui } from '../../data/temps.svelte.ts';
  import { profil } from '../../data/requetes.ts';
  import { ajouterPoint, changerDelaiDefaut, majProfil, modifierPoint, retirerPreset } from '../../data/actions/reglages.ts';
  import { formaterMesures } from '@core/rapport.ts';
  import { calculerPoint, preparer } from '../rapports/calcul.ts';
  import { donneesRapport } from '../rapports/donnees.ts';
  import { etatNotifications, type EtatNotifications } from '../accueil/push.ts';
  import LignePoint from './LignePoint.svelte';
  import { rappelsRecus, reprendreAnciensChoix, type TypeRappelChoisi } from './rappels.svelte.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const p = $derived(profil());
  const prenom = $derived(p?.prenom ?? '');
  const initiales = $derived(`${(prenom.trim().charAt(0) || 'M').toUpperCase()}L`);

  function champProfil(e: Event, champ: 'prenom' | 'nom_rapport'): void {
    const v = (e.currentTarget as HTMLInputElement).value.trim();
    if (champ === 'prenom' && !v) { (e.currentTarget as HTMLInputElement).value = prenom; return; }
    if (p && v !== p[champ]) majProfil({ [champ]: v });
  }

  // ------------------------------------------------------------------ points du rapport
  const points = $derived([...magasin.lignes.points_rapport].sort((a, b) => a.ordre - b.ordre));
  let ouvert = $state<string | null>(null);
  const exemples = $derived.by(() => {
    if (!ouvert) return new Map<string, string>();
    const d = donneesRapport();
    const pp = preparer({ ...d, points: d.points.filter((x) => x.id === ouvert).map((x) => ({ ...x, actif: true })) })[0];
    const jour = aujourdhui();
    return new Map(pp ? [[pp.point.id, formaterMesures(calculerPoint(pp, d, jour, jour).mesures, p?.langue_rapport ?? 'fr')]] : []);
  });

  function deplacer(id: string, sens: -1 | 1): void {
    const l = [...points];
    const i = l.findIndex((x) => x.id === id), j = i + sens;
    if (i < 0 || j < 0 || j >= l.length) return;
    [l[i], l[j]] = [l[j], l[i]];
    l.forEach((x, k) => { if (x.ordre !== k) modifierPoint(x.id, { ordre: k }); });
  }
  function nouveauPoint(): void {
    ouvert = ajouterPoint('NOUVEAU', 'Nouveau point', null, [{ cle: 'temps', sous_projet_id: null }]);
  }

  // ------------------------------------------------------------------ exports enregistrés
  const presets = $derived([...magasin.lignes.presets_export].sort((a, b) => a.ordre - b.ordre));
  function codesDe(ids: string[]): string {
    const codes = points.filter((x) => ids.includes(x.id)).map((x) => x.code);
    return codes.length && codes.length === points.length ? 'Tous les points' : codes.join(' · ') || 'Aucun point';
  }
  let presetARetirer = $state<string | null>(null);
  function retirer(id: string): void {
    if (presetARetirer !== id) { presetARetirer = id; setTimeout(() => { if (presetARetirer === id) presetARetirer = null; }, 4000); return; }
    retirerPreset(id);
    presetARetirer = null;
  }

  // ------------------------------------------------------------------ notifications
  const notif = $derived<EtatNotifications>(etatNotifications(magasin.lignes.abonnements_push));
  const appareil = typeof navigator !== 'undefined' && /iPhone/.test(navigator.userAgent) ? 'Cet iPhone' : 'Cet appareil';
  const BADGE: Record<EtatNotifications['statut'], string> = { actif: 'Actif', autorise: 'Autorisé', a_activer: 'À activer', bloque: 'Bloqué', indisponible: 'Indisponible' };
  const titres = $derived(p?.titres_visibles ?? true);
  const delai = $derived(p?.rappel_defaut_min ?? 10);

  $effect(() => { if (p) untrack(reprendreAnciensChoix); });

  const RAPPELS: { t: TypeRappelChoisi; label: string }[] = [
    { t: 'bloc', label: 'Avant chaque bloc' }, { t: 'rapport', label: 'Rapport du soir' },
    { t: 'recap_semaine', label: 'Récap de la semaine' }, { t: 'recap_mois', label: 'Récap du mois' }
  ];
  const aide = (t: TypeRappelChoisi) => t === 'bloc' ? (delai ? `${delai} min avant · bouton Lancer` : 'à l’heure · bouton Lancer')
    : t === 'rapport' ? 'chaque jour à' : t === 'recap_semaine' ? 'dimanche à 20:00' : 'le 1er à 08:00';

  // ------------------------------------------------------------------ données et compte
  function exporterDonnees(): void {
    const blob = new Blob([JSON.stringify({ exporte_le: new Date().toISOString(), ...magasin.lignes }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `luther-life-${aujourdhui()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
    dire('Export de tes données prêt.');
  }
  async function deconnexion(): Promise<void> {
    await session.deconnecter();
    routeur.aller('/connexion', true);
  }

  // Ancres #notifications et #points (depuis Rapports et le parcours de départ).
  $effect(() => {
    const h = routeur.hash.slice(1);
    if (!h) return;
    void tick().then(() => document.getElementById(h)?.scrollIntoView({ block: 'start' }));
  });
</script>

<EcranPage gap={18}>
  <h1 class="titre">Réglages</h1>

  <section class="carte profil">
    <div class="identite">
      <span class="avatar titre">{initiales}</span>
      <span class="col">
        <span class="muted petit">Titre de l’application</span>
        <span class="titre app">{(prenom.trim() || 'Mon')} Life</span>
      </span>
    </div>
    <div class="deux">
      <label>Prénom<input value={prenom} autocomplete="given-name" onchange={(e) => champProfil(e, 'prenom')} /></label>
      <label>Nom dans le rapport<input value={p?.nom_rapport ?? ''} onchange={(e) => champProfil(e, 'nom_rapport')} /></label>
    </div>
    <div class="rangee">
      <span class="fort">Langue du rapport</span>
      <span class="choix">
        {#each [['en', 'English'], ['fr', 'Français']] as [v, l] (v)}
          <button type="button" class:actif={p?.langue_rapport === v} aria-pressed={p?.langue_rapport === v} onclick={() => majProfil({ langue_rapport: v as 'en' | 'fr' })}>{l}</button>
        {/each}
      </span>
    </div>
  </section>

  <section class="groupe" id="points">
    <div class="tete"><span class="etiquette">Points du rapport · {points.length}</span><span class="muted petit">touche pour modifier</span></div>
    <div class="carte liste">
      {#each points as pt, i (pt.id)}
        <LignePoint point={pt} n={i + 1} ouvert={ouvert === pt.id} exemple={exemples.get(pt.id) ?? ''} premier={i === 0} dernier={i === points.length - 1}
          onbasculer={() => (ouvert = ouvert === pt.id ? null : pt.id)} ondeplacer={(s) => deplacer(pt.id, s)} />
      {/each}
      <button type="button" class="ajouter" onclick={nouveauPoint}><Icone nom="plus" taille={16} trait={2.4} />Ajouter un point</button>
    </div>
  </section>

  <section class="groupe">
    <span class="etiquette">Exports enregistrés</span>
    <div class="carte liste">
      {#each presets as pr (pr.id)}
        <div class="ligne">
          <span class="col grow"><span class="fort">{pr.nom}</span><span class="mono muted codes">{codesDe(pr.points)}</span></span>
          <span class="muted petit">{pr.points.length} points</span>
          <button type="button" class="poubelle" class:confirmer={presetARetirer === pr.id} aria-label={presetARetirer === pr.id ? `Confirmer le retrait de ${pr.nom}` : `Retirer ${pr.nom}`} onclick={() => retirer(pr.id)}>
            {#if presetARetirer === pr.id}Retirer ?{:else}<Icone nom="poubelle" taille={16} />{/if}
          </button>
        </div>
      {:else}
        <p class="muted petit vide">Aucun préréglage. Crée-en un depuis « Exporter le rapport ».</p>
      {/each}
    </div>
  </section>

  <section class="groupe" id="notifications">
    <span class="etiquette">Notifications</span>
    <div class="carte liste">
      <div class="ligne haute">
        <span class="icone"><Icone nom="telephone" taille={18} /></span>
        <span class="col grow"><span class="fort">{appareil}</span><span class="muted petit">{notif.detail}</span></span>
        {#if notif.statut === 'actif'}
          <span class="badge bon">{BADGE[notif.statut]}</span>
        {:else}
          <a class="badge action" href="/autoriser-notifications">{notif.statut === 'bloque' || notif.statut === 'indisponible' ? BADGE[notif.statut] : 'Activer'}</a>
        {/if}
      </div>
      <div class="ligne haute">
        <span class="col grow"><span class="fort">Afficher les titres à l’écran verrouillé</span>
          <span class="muted petit">{titres ? `Ex. : Dans ${delai} min · RDQD du matin` : `Ex. : ${prenom || 'Mon'} Life · un bloc commence dans ${delai} min`}</span></span>
        <Interrupteur actif={titres} label="Afficher les titres à l’écran verrouillé" onchange={(v) => majProfil({ titres_visibles: v })} />
      </div>
      <div class="ligne colonne delais">
        <span class="fort">Me prévenir par défaut</span>
        <Puces colonnes={4} petit options={[{ valeur: 0, label: 'À l’heure' }, { valeur: 5, label: '5 min' }, { valeur: 10, label: '10 min' }, { valeur: 15, label: '15 min' }]}
          valeur={delai} onchoisir={(v) => changerDelaiDefaut(v)} couleur="var(--accent)" texte="var(--accent-texte)" />
      </div>
      <div class="ligne colonne">
        <span class="fort">En touchant une notification</span>
        <span class="muted petit">Rappel d’un bloc : ouvre l’écran Lancer · Reporter. Rapport du jour : ouvre Relire · Envoyer.</span>
      </div>
    </div>
    <p class="muted petit note">Rien n’est envoyé par e-mail : tes données spirituelles et financières restent dans l’app. Les rappels passent uniquement par les notifications.</p>
  </section>

  <section class="groupe">
    <span class="etiquette">Quels rappels recevoir</span>
    <div class="carte liste">
      {#each RAPPELS as r (r.t)}
        <div class="ligne">
          <span class="col grow">
            <span class="fort">{r.label}</span>
            <span class="muted petit">{aide(r.t)}
              {#if r.t === 'rapport'}<input class="heure mono" type="time" aria-label="Heure du rapport" value={p?.heure_rapport ?? '21:15'}
                onchange={(e) => { const v = (e.currentTarget as HTMLInputElement).value; if (/^\d{2}:\d{2}$/.test(v)) majProfil({ heure_rapport: v }); }} />{/if}
            </span>
          </span>
          <Interrupteur actif={rappelsRecus.choix[r.t]} label={r.label} onchange={() => rappelsRecus.basculer(r.t)} />
        </div>
      {/each}
    </div>
  </section>

  <div class="rangee">
    <span class="fort">Apparence</span>
    <span class="choix">
      {#each [['nuit', 'Nuit'], ['jour', 'Jour'], ['auto', 'Auto']] as [v, l] (v)}
        <button type="button" class:actif={theme.apparence === v} aria-pressed={theme.apparence === v} onclick={() => theme.choisir(v as Apparence)}>{l}</button>
      {/each}
    </span>
  </div>

  <section class="groupe">
    <span class="etiquette">Mes données</span>
    <div class="carte liste">
      <button type="button" class="ligne bouton" onclick={exporterDonnees}><Icone nom="copier" taille={18} /><span class="grow">Exporter toutes mes données (JSON)</span></button>
      {#if modeServeur}
        <button type="button" class="ligne bouton danger" onclick={deconnexion}><Icone nom="retour" taille={18} /><span class="grow">Se déconnecter{session.email ? ` (${session.email})` : ''}</span></button>
      {:else}
        <div class="ligne"><Icone nom="cadenas" taille={18} /><span class="muted petit grow">Mode local : tes données restent sur cet appareil, sans compte.</span></div>
      {/if}
    </div>
    <p class="muted petit note">Pour supprimer ton compte et toutes tes données, demande-le à l’administrateur : la suppression se fait depuis Supabase.</p>
  </section>
</EcranPage>

<style>
  h1 { font-size: 30px; }
  .petit { font-size: 12px; }
  .fort { font-size: 14px; font-weight: 600; }
  .col { display: flex; flex-direction: column; }
  .grow { flex: 1; min-width: 0; }
  .profil { border-radius: 22px; padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .identite { display: flex; align-items: center; gap: 12px; }
  .avatar { width: 52px; height: 52px; border-radius: 16px; background: var(--accent); color: var(--accent-texte); font-size: 20px; display: flex; align-items: center; justify-content: center; flex: none; }
  .app { font-size: 24px; }
  .deux { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--muted); }
  label input { height: 44px; min-width: 0; border-radius: 12px; border: 1px solid var(--ligne); background: var(--champ); font-size: 15px; padding: 0 12px; }
  .rangee { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .choix { display: flex; background: var(--surface-2); border-radius: 12px; padding: 3px; }
  .choix button { min-height: 44px; padding: 0 14px; border: 0; border-radius: 10px; background: transparent; color: var(--muted); font-size: 13px; font-weight: 600; }
  .choix button.actif { background: var(--surface); color: var(--texte); }
  .groupe { display: flex; flex-direction: column; gap: 8px; scroll-margin-top: 16px; }
  .tete { display: flex; justify-content: space-between; align-items: baseline; }
  .liste { border-radius: 22px; overflow: hidden; }
  .ligne { display: flex; align-items: center; gap: 10px; padding: 12px 14px; min-height: 52px; }
  .ligne + .ligne { border-top: 1px solid var(--ligne); }
  .ligne.haute { min-height: 56px; }
  .ligne.colonne { flex-direction: column; align-items: stretch; gap: 6px; }
  .codes { font-size: 11px; }
  .vide { padding: 14px; }
  .icone { flex: none; width: 36px; height: 36px; border-radius: 12px; background: var(--surface-2); display: flex; align-items: center; justify-content: center; }
  .badge { flex: none; font-size: 11px; font-weight: 600; padding: 4px 8px; border-radius: 8px; }
  .badge.bon { background: var(--bon-fond); color: var(--bon); }
  .badge.action { background: var(--accent-fond); color: var(--accent-encre); min-height: 32px; display: flex; align-items: center; padding: 0 10px; }
  .note { line-height: 1.45; }
  .delais :global(.puces button) { padding: 0 4px; font-size: 12px; }
  .ajouter { width: 100%; border: 0; background: transparent; color: var(--accent-encre); font-size: 14px; font-weight: 600; min-height: 52px; display: flex; align-items: center; justify-content: center; gap: 6px; }
  .poubelle { flex: none; min-width: 44px; height: 44px; border-radius: 12px; border: 1px solid var(--ligne); background: transparent; color: var(--muted); display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 600; padding: 0 8px; }
  .poubelle.confirmer { color: var(--mauvais); border-color: var(--mauvais); }
  .heure { margin-left: 4px; height: 32px; border-radius: 8px; border: 1px solid var(--ligne); background: var(--champ); font-size: 12px; padding: 0 6px; }
  .bouton { width: 100%; border: 0; background: transparent; text-align: left; font-size: 14px; font-weight: 600; }
  .bouton + .bouton, .bouton + .ligne { border-top: 1px solid var(--ligne); }
  .danger { color: var(--mauvais); }
</style>
