<script lang="ts">
  // Autorisation des notifications (planches AutoriserNotifications et Notifications) : aperçu, délai, titres visibles,
  // puis la demande du système, déclenchée par un appui.
  import EcranPage from '../../ui/EcranPage.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Interrupteur from '../../ui/Interrupteur.svelte';
  import Puces from '../../ui/Puces.svelte';
  import { profil } from '../../data/requetes.ts';
  import { activerNotifications, estInstallee, raisonEchecActivation, type ResultatActivation } from './push.ts';

  let { params: _ = {} }: { params?: Record<string, string> } = $props();

  const p = profil();
  let delai = $state(p?.rappel_defaut_min ?? 10);
  let titres = $state(p?.titres_visibles ?? true);
  let resultat = $state<ResultatActivation | null>(typeof Notification !== 'undefined' && Notification.permission === 'granted' ? 'accorde' : null);
  let occupe = $state(false);
  const nomApp = $derived(`${profil()?.prenom || 'Luther'} Life`);

  const titreApercu = $derived(titres ? (delai === 0 ? 'RDQD du matin · maintenant' : `Dans ${delai} min : RDQD du matin`) : `Un bloc commence ${delai === 0 ? 'maintenant' : `dans ${delai} min`}`);
  const jourRapport = new Intl.DateTimeFormat('fr-CA', { day: 'numeric', month: 'long' }).format(new Date());
  // Aperçus d'écran verrouillé (planche Notifications), en version compacte.
  const EXEMPLES: [string, string][] = [
    [`Ton rapport du ${jourRapport} est prêt`, 'Toucher pour relire et envoyer'],
    ['Récap de la semaine', 'Ton score, ton meilleur point et celui à renforcer, le dimanche à 20:00'],
    ['Récap du mois', 'Ton score du mois, le 1er à 08:00']
  ];
  const sousApercu = $derived(titres ? '05:00 – 05:30 · Ma relation avec Dieu' : 'Ouvre l’app pour voir lequel');

  async function autoriser(): Promise<void> {
    occupe = true;
    try { resultat = await activerNotifications(delai, titres); } finally { occupe = false; }
  }
</script>

{#snippet pied()}
  <div class="bas">
  {#if resultat === 'accorde'}
    <a class="cta inverse" href="/">Ouvrir mon Fil</a>
  {:else}
    <button type="button" class="cta" disabled={occupe} onclick={autoriser}>{occupe ? 'Un instant…' : resultat === 'refuse' ? 'Réessayer' : 'Autoriser les notifications'}</button>
  {/if}
  <a class="plus-tard" href="/">Plus tard dans les Réglages</a>
  </div>
{/snippet}

<EcranPage onglets={false} gap={18} {pied}>
  <div class="tete">
    <span class="etape">Étape 2 sur 2</span>
    <h1 class="titre">Reçois tes rappels au bon moment</h1>
    <p class="intro">Une notification avant chaque bloc, un bouton pour le lancer ou le reporter, et ton rapport prêt chaque soir.</p>
  </div>

  <div class="notif">
    <div class="app"><span class="logo titre">LL</span><span class="nom">{nomApp}</span><span class="muted quand">maintenant</span></div>
    <div class="corps"><span class="t">{titreApercu}</span><span class="s">{sousApercu}</span></div>
    <span class="astuce">Toucher la notification ouvre directement le bloc : Lancer ou Reporter en un geste.</span>
  </div>

  <div class="reglage">
    <span class="muted libelle">Me prévenir</span>
    <Puces colonnes={4} options={[{ valeur: 0, label: 'À l’heure' }, { valeur: 5, label: '5 min' }, { valeur: 10, label: '10 min' }, { valeur: 15, label: '15 min' }]}
      valeur={delai} onchoisir={(v) => (delai = v)} couleur="var(--accent)" texte="var(--accent-texte)" />
    <div class="titres">
      <span class="textes"><span class="fort">Afficher les titres à l’écran verrouillé</span><span class="muted petit">Désactivé : « un bloc commence {delai === 0 ? 'maintenant' : `dans ${delai} min`} »</span></span>
      <Interrupteur actif={titres} label="Afficher les titres" onchange={(v) => (titres = v)} />
    </div>
  </div>

  {#if resultat === 'accorde'}
    <div class="bandeau bon"><Icone nom="coche" taille={18} trait={2.6} />Notifications activées sur cet appareil</div>
  {:else if resultat === 'refuse'}
    <div class="bandeau alerte">Notifications refusées. Pour les réactiver : Réglages du téléphone › Notifications › {nomApp}.</div>
  {:else if resultat === 'indisponible'}
    <div class="bandeau alerte">{raisonEchecActivation() || (estInstallee() ? 'Les notifications ne sont pas disponibles ici.' : 'Ouvre l’app depuis son icône d’écran d’accueil (iOS 16.4 ou plus), puis réessaie.')}</div>
  {/if}

  <div class="exemples">
    <span class="etiquette">Ce que tu recevras</span>
    {#each EXEMPLES as [t, s], i (t)}
      <div class="exemple" style:--a="{0.62 - i * 0.06}"><span class="logo titre">LL</span><span class="textes"><span class="fort">{t}</span><span class="sous">{s}</span></span></div>
    {/each}
    <p class="note">Sur iPhone, une notification d’app web s’ouvre d’un appui : pas de boutons sur l’écran verrouillé.</p>
  </div>
</EcranPage>

<style>
  /* Marges de la maquette : 56 px en haut, 20 px sur les côtés (la coque en donne 20 et 16). */
  .tete { display: flex; flex-direction: column; gap: 8px; padding-top: 36px; }
  .tete, .notif, .reglage, .bandeau, .exemples { margin: 0 4px; }
  .bas { display: flex; flex-direction: column; gap: 8px; margin: 0 4px 8px; }
  .etape { font-size: 12px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent-encre); }
  h1 { font-size: 32px; line-height: 1.08; }
  .intro { font-size: 15px; line-height: 1.45; color: color-mix(in srgb, var(--texte) 50%, var(--muted)); }
  /* Notification façon écran verrouillé : verre légèrement violet (rgba(40,40,58,.78) en nuit), liseré clair. */
  .notif { background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border: 1px solid color-mix(in srgb, var(--texte) 8%, transparent); border-radius: 22px; padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; }
  .app { display: flex; align-items: center; gap: 8px; }
  .logo { flex: none; width: 22px; height: 22px; border-radius: 6px; background: var(--accent); color: var(--accent-texte); font-size: 10px; display: flex; align-items: center; justify-content: center; }
  .logo { line-height: normal; }
  .nom { flex: 1; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: color-mix(in srgb, var(--texte) 50%, var(--muted)); }
  .quand { font-size: 12px; }
  .corps { display: flex; flex-direction: column; gap: 2px; }
  .t { font-size: 15px; font-weight: 600; }
  .s { font-size: 14px; color: color-mix(in srgb, var(--texte) 50%, var(--muted)); }
  .astuce { font-size: 13px; font-weight: 600; color: var(--accent-encre); }
  .reglage { display: flex; flex-direction: column; gap: 8px; }
  .reglage :global(.puces button) { padding: 0 4px; font-size: 12px; border-radius: 12px; }
  .libelle { font-size: 13px; font-weight: 600; }
  .titres { box-sizing: content-box; display: flex; align-items: center; justify-content: space-between; gap: 10px; background: color-mix(in srgb, var(--surface) 60%, var(--fond)); border: 1px solid color-mix(in srgb, var(--ligne) 60%, var(--surface)); border-radius: 16px; padding: 10px 14px; min-height: 56px; }
  .textes { display: flex; flex-direction: column; min-width: 0; }
  .fort { font-size: 14px; font-weight: 600; }
  .petit { font-size: 12px; }
  .bandeau { display: flex; align-items: center; gap: 10px; border-radius: 16px; padding: 12px 14px; font-size: 14px; font-weight: 600; }
  .bandeau.bon { background: var(--bon-fond); color: var(--bon); }
  .bandeau.alerte { background: var(--alerte-fond); color: var(--alerte); }
  .exemples { display: flex; flex-direction: column; gap: 8px; }
  .exemple { display: flex; align-items: center; gap: 10px; border-radius: 22px; padding: 12px 14px;
    background: color-mix(in srgb, color-mix(in srgb, var(--accent) 8%, var(--surface)) calc(var(--a) * 100%), var(--fond)); border: 1px solid color-mix(in srgb, var(--texte) 6%, transparent); }
  .exemple .textes { gap: 1px; }
  .sous { font-size: 13px; color: color-mix(in srgb, var(--texte) 50%, var(--muted)); }
  .note { font-size: 12px; color: var(--faint); text-align: center; margin-top: 4px; }
  .cta { height: 56px; border-radius: 18px; border: 0; background: var(--accent); color: var(--accent-texte); font-size: 16px; font-weight: 600; display: flex; align-items: center; justify-content: center; }
  .cta.inverse { background: var(--inverse); color: var(--inverse-texte); }
  .cta:disabled { opacity: 0.5; }
  .plus-tard { color: var(--muted); font-size: 13px; min-height: 44px; display: flex; align-items: center; justify-content: center; }
</style>
