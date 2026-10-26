<script lang="ts">
  import './compte.css';
  import Ecran from '../../ui/Ecran.svelte';
  import Champ from '../../ui/Champ.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Pic from './Pic.svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { compteCourant, deconnecter, majCompte } from '../../domain/compte.ts';
  import { fmt } from '../../core/argent.ts';
  import { choisirLangue } from '../entree/etat.ts';
  import { dateCourte } from '../solde/actions.ts';
  import { alertesDe, libelleActives } from './alertes.ts';
  import { libelleNiveau } from './notifs.ts';
  import { NIVEAUX, niveauPour, prixPass, transactionsAnnee } from './pass.ts';
  import { ajouterProche, initiales, nomCourt, prochesDe, retirerProche } from './proches.ts';

  /** Compte : profil, Pass, identité, voyageurs enregistrés (proches), argent, sécurité, préférences, langue, aide, déconnexion. */
  const compte = $derived(compteCourant());
  const proches = $derived(compte ? prochesDe(compte.id) : []);
  const actives = $derived(compte ? alertesDe(compte.id).filter((a) => a.actif).length : 0);
  const niveau = $derived(compte?.pass.actif && compte ? niveauPour(transactionsAnnee(app.monde, compte.id, maintenant())) : NIVEAUX[0]);
  const nonLues = $derived(compte ? app.monde.notifications.filter((n) => n.compteId === compte.id && !n.lu).length : 0);
  let ajout = $state(false), identifiant = $state(''), erreur = $state(''), anglais = $state(false);
  const NB = ' ';
  const lang = $derived(compte?.langue ?? 'fr');

  function ouvrirAjout() { identifiant = ''; erreur = ''; ajout = true; }
  function ajouter(e: Event) {
    e.preventDefault(); if (!compte) return;
    const r = ajouterProche(compte.id, identifiant);
    if (!r.ok) { erreur = r.message; return; }
    ajout = false; montrer(`${nomCourt(r.proche)} est dans vos proches.`);
  }
  function retirer(id: string, nom: string) { if (compte && retirerProche(compte.id, id)) montrer(`${nom} retiré(e) de vos proches.`); }
  function bascleCle(e: Event) { if (!compte) return; const on = (e.currentTarget as HTMLInputElement).checked; majCompte(compte.id, { passkey: on }); montrer(on ? 'Clé d’accès activée.' : 'Clé d’accès désactivée.'); }
  function langue(l: 'fr' | 'en') { choisirLangue(l); anglais = l === 'en'; }
  function sortir() { deconnecter(); aller('/ouverture'); }
  const va = (e: MouseEvent, chemin: string) => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); aller(chemin); };
</script>

<Ecran titre="Compte" face="nuit" onglet="compte" sansRetour large>
  {#if compte}
  <div class="cp page pc-1344">
    <div class="titre-pc pc-seul"><p class="gt">Compte</p><p class="st">{nomCourt(compte)} · espace Mes actifs</p></div>
    <div role="group" aria-label="Face de l’application" class="bascule mob-seul">
      <button type="button" aria-pressed="false" onclick={() => { app.session.face = 'voyage'; aller('/'); }}><Icone nom="soleil" taille={16} trait={2} />Voyager</button>
      <button type="button" aria-pressed="true" aria-current="page"><Icone nom="lune" taille={16} trait={2} />Mes actifs</button>
    </div>

    <section aria-labelledby="me-name" class="moi">
      <span class="avatar" aria-hidden="true">{initiales(compte)}</span>
      <div class="col g8 grow"><h1 id="me-name">{nomCourt(compte)}</h1>
        {#if compte.pass.actif}<span class="cp-puce jaune"><Pic nom="eclair" taille={14} trait={2} />{niveau.nom} (exemple)</span>
        {:else}<a class="cp-puce" href="/pass" onclick={(e) => va(e, '/pass')}>Sans Pass · découvrir</a>{/if}</div>
    </section>

    {#if compte.identiteVerifiee}
      <section class="kyc" aria-labelledby="kyc-t"><span class="cadre"><Pic nom="identite" taille={22} /></span>
        <div class="col g4"><h2 id="kyc-t"><Pic nom="ok" taille={16} trait={2} />Identité vérifiée</h2><p>Requise pour revendre un billet et recevoir vos versements.</p><p class="t-sec">Vérifiée le {dateCourte(compte.identiteVerifiee)}</p></div></section>
    {:else}
      <section class="kyc non" aria-labelledby="kyc-t"><span class="cadre"><Pic nom="identite" taille={22} /></span>
        <div class="col g4"><h2 id="kyc-t">Identité à vérifier</h2><p>Requise pour revendre un billet et recevoir vos versements. Seulement quand il le faut.</p><a class="cp-lien g" href="/identite?retour=/compte" onclick={(e) => va(e, '/identite?retour=/compte')}>Vérifier mon identité</a></div></section>
    {/if}

    <section class="cp-groupe" aria-labelledby="g-trav"><h2 id="g-trav" class="cp-sur">Voyageurs enregistrés</h2>
      <ul class="cp-liste">
        <li class="cp-ligne"><span class="cp-ico" aria-hidden="true">{initiales(compte)}</span><span class="cp-txt"><span class="cp-t">{nomCourt(compte)}</span><span class="cp-s">Vous · {compte.identiteVerifiee ? 'pièce d’identité enregistrée' : 'pièce d’identité à enregistrer'}</span></span></li>
        {#each proches as p (p.id)}
          <li class="cp-ligne"><span class="cp-ico" aria-hidden="true">{initiales(p)}</span><span class="cp-txt"><span class="cp-t">{nomCourt(p)}</span><span class="cp-s">Proche · compte NexG-TT</span></span>
            <button type="button" class="retirer" aria-label={`Retirer ${nomCourt(p)} de mes proches`} onclick={() => retirer(p.id, nomCourt(p))}><Pic nom="fermer" taille={18} /></button></li>
        {/each}
        <li><button type="button" class="cp-ligne ajout" onclick={ouvrirAjout}><span class="cp-ico pointille" aria-hidden="true"><Pic nom="plus" taille={18} trait={2} /></span><span class="cp-txt"><span class="cp-t">Ajouter un proche</span><span class="cp-s">Pour le nommer voyageur sur un billet</span></span><Pic nom="chevron" taille={18} /></button></li>
      </ul>
    </section>

    <section class="cp-groupe" aria-labelledby="g-money"><h2 id="g-money" class="cp-sur">Billets et argent</h2>
      <ul class="cp-liste">
        <li><a class="cp-ligne" href="/solde" onclick={(e) => va(e, '/solde')}><Pic nom="portefeuille" /><span class="cp-txt"><span class="cp-t">Solde et versements</span><span class="cp-s">Solde {fmt(compte.solde, { centimes: true })} · compte <span class="mono">•••• {compte.carte4 ?? '4821'}</span> (fictif)</span></span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a></li>
        <li><a class="cp-ligne" href="/carte" onclick={(e) => va(e, '/carte?retour=/compte')}><Pic nom="carte" /><span class="cp-txt"><span class="cp-t">Carte de paiement</span><span class="cp-s">{compte.carte4 ? `Carte de test •••• ${compte.carte4}` : 'Aucune carte · facultative'}</span></span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a></li>
        <li><a class="cp-ligne" href="/importer" onclick={(e) => va(e, '/importer')}><Pic nom="telecharger" /><span class="cp-txt"><span class="cp-t">Importer un billet acheté ailleurs</span><span class="cp-s">Le confier à NexG-TT pour le revendre</span></span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a></li>
        <li><a class="cp-ligne" href="/alertes" onclick={(e) => va(e, '/alertes')}><Pic nom="cloche" /><span class="cp-t grow">Mes alertes</span><span class="t-sec">{actives === 0 ? 'Aucune active' : libelleActives(actives)}</span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a></li>
        <li><a class="cp-ligne" href="/pass" onclick={(e) => va(e, '/pass')}><Pic nom="eclair" /><span class="cp-txt"><span class="cp-t">Pass NexG</span>{#if compte.pass.actif}<span class="cp-s">Niveau du Pass{NB}: {niveau.nom} — commission {niveau.commission}</span>{/if}<span class="cp-s">{prixPass()} / mois · indicatif</span></span>{#if compte.pass.actif}<span class="cp-puce jaune pt">Actif</span>{/if}<span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a></li>
      </ul>
    </section>

    <div class="droite">
    <section class="cp-groupe" aria-labelledby="g-pref"><h2 id="g-pref" class="cp-sur">Sécurité et préférences</h2>
      <ul class="cp-liste">
        <li><label class="cp-ligne cle"><Pic nom="cle" /><span class="cp-txt"><span class="cp-t">Sécurité · clé d’accès</span><span class="cp-s" class:vert={compte.passkey}>{#if compte.passkey}<Pic nom="ok" taille={14} trait={2} />Clé d’accès activée{:else}Clé d’accès non activée{/if}</span></span>
          <span class="cp-sw"><input type="checkbox" role="switch" checked={compte.passkey} onchange={bascleCle} aria-label="Clé d’accès" /><span aria-hidden="true"></span></span></label></li>
        <li><a class="cp-ligne" href="/notifications/preferences" onclick={(e) => va(e, '/notifications/preferences')}><Pic nom="cloche" /><span class="cp-txt"><span class="cp-t">Notifications</span><span class="cp-s">Niveau{NB}: {libelleNiveau(compte.prefsNotif)}{nonLues ? ` · ${nonLues} non lue${nonLues > 1 ? 's' : ''}` : ''}</span></span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a></li>
        <li class="langue"><div class="rang"><Pic nom="globe" /><span id="lang-label" class="cp-t grow">Langue</span>
          <div role="group" aria-labelledby="lang-label" class="seg"><button type="button" lang="fr" aria-pressed={lang === 'fr'} onclick={() => langue('fr')}>Français</button><button type="button" lang="en" aria-pressed={lang === 'en'} onclick={() => langue('en')}>English</button></div></div>
          {#if lang === 'en' || anglais}<p class="t-sec" role="status">La version anglaise n’est pas incluse dans ce prototype.</p>{/if}</li>
        <li><button type="button" class="cp-ligne" onclick={() => montrer('Données et consentements : écran à venir.')}><Pic nom="bouclier" /><span class="cp-txt"><span class="cp-t">Données et consentements</span><span class="cp-s">Ce que nous conservons, vos choix</span></span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></button></li>
        <li><a class="cp-ligne" href="/aide" onclick={(e) => va(e, '/aide')}><Pic nom="info" /><span class="cp-t grow">Aide</span><span class="cp-chev"><Pic nom="chevron" taille={18} /></span></a></li>
      </ul>
    </section>

    <button type="button" class="sortir" onclick={sortir}><Pic nom="quitter" taille={20} />Se déconnecter</button>
    <p class="version pc-seul">NexG-TT 4.0 · prototype — toutes les données sont fictives</p>
    </div>
  </div>

  <Feuille bind:ouvert={ajout} titre="Ajouter un proche" sous="Il pourra être nommé voyageur sur vos billets.">
    <form class="cp col g12" onsubmit={ajouter} novalidate>
      <Champ id="proche-id" label="Courriel ou téléphone de votre proche" bind:valeur={identifiant} inputmode="text" autocomplete="off" aide="Il doit déjà avoir un compte NexG-TT." {erreur} onsaisie={() => (erreur = '')} />
      <button class="btn" type="submit">Ajouter ce proche</button>
    </form>
  </Feuille>
  {/if}
</Ecran>

<style>
  .page { display: flex; flex-direction: column; gap: 22px; }
  .bascule { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface2); border: 1px solid var(--line); align-self: flex-start; }
  .bascule button { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--ink2); font: 700 13px/1 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
  .bascule button[aria-pressed='true'] { background: var(--signal); color: #0D0E11; cursor: default; }
  .moi { display: flex; align-items: center; gap: 16px; } .avatar { width: 64px; height: 64px; flex: none; border-radius: 999px; background: #F3F4F6; color: #0D0E11; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 22px; letter-spacing: 0.04em; }
  h1 { margin: 0; font: 600 clamp(28px, 9vw, 34px) / 32px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.02em; overflow-wrap: anywhere; } .moi .cp-puce { align-self: flex-start; text-decoration: none; }
  .kyc { display: flex; align-items: flex-start; gap: 14px; padding: 16px 18px; border-radius: 20px; background: var(--ok-soft); border: 1px solid rgba(124, 227, 181, 0.4); }
  .kyc.non { background: var(--signal-soft); border-color: rgba(255, 210, 63, 0.45); } .kyc.non .cadre { background: rgba(255, 210, 63, 0.16); color: var(--accent); } .kyc.non h2 { color: var(--accent); }
  .cadre { width: 44px; height: 44px; flex: none; border-radius: 12px; background: rgba(124, 227, 181, 0.16); color: var(--ok); display: flex; align-items: center; justify-content: center; }
  .kyc h2 { margin: 0; display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 700; color: var(--ok); } .kyc p { margin: 0; font-size: 14px; line-height: 20px; } .kyc p.t-sec { font-size: 13px; } .g { align-self: flex-start; padding-left: 0; }
  .ajout { color: var(--accent); } .ajout .cp-s { color: var(--ink3); } .pointille { background: transparent; border: 1.5px dashed var(--accent); color: var(--accent); box-sizing: border-box; }
  .retirer { width: 44px; height: 44px; margin-right: -10px; flex: none; border-radius: 999px; border: 0; background: transparent; color: var(--ink3); display: grid; place-items: center; cursor: pointer; } .retirer:hover { background: var(--surface2); color: var(--ink); }
  .pt { flex: none; height: 24px; font-size: 11px; } .cle { cursor: pointer; } .vert { color: var(--ok); display: inline-flex; align-items: center; gap: 4px; }
  .langue { padding: 10px 16px; display: flex; flex-direction: column; gap: 6px; } .rang { display: flex; align-items: center; gap: 14px; min-height: 44px; } .langue .t-sec { margin: 0 0 4px 36px; }
  .seg { display: flex; gap: 2px; padding: 3px; border-radius: 12px; background: var(--surface2); border: 1px solid var(--line); } .seg button { min-height: 44px; min-width: 44px; padding: 0 12px; border-radius: 9px; border: 0; background: transparent; color: var(--ink2); font-size: 14px; font-weight: 700; cursor: pointer; }
  .seg button[aria-pressed='true'] { background: var(--signal); color: #0D0E11; }
  .sortir { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: 14px; border: 1px solid var(--line-strong); background: transparent; color: var(--ink); font: 600 15px/1 'Barlow', sans-serif; cursor: pointer; }
  .droite { display: contents; } .titre-pc .gt { font: 600 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; } .titre-pc .st { margin-top: 6px; font-size: 13px; font-weight: 600; color: var(--ink2); } .version { text-align: center; font-size: 13px; color: var(--ink3); }
  @media (min-width: 900px) {
    .page { display: grid; grid-template-columns: minmax(0, 1fr) 400px; column-gap: 24px; row-gap: 18px; align-items: start; grid-auto-flow: row; }
    .page > :global(*) { grid-column: 1; } .titre-pc { grid-column: 1 / -1; } .moi { padding: 20px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
    .droite { display: flex; flex-direction: column; gap: 18px; grid-column: 2; grid-row: 2 / span 4; } .moi h1 { font-size: 40px; line-height: 40px; }
    .droite .cp-sur { padding-top: 0; }
  }
  @media (max-width: 340px) { .rang { gap: 8px; } .seg button { padding: 0 8px; font-size: 13px; } .langue .t-sec { margin-left: 0; } }
</style>
