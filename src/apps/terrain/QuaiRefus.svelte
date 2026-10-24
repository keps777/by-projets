<script lang="ts">
  import Mobile from '../../ui/Mobile.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { codeAffiche } from '../../core/terrain.ts';
  import { billetParId, departParId, heureLocale, ligneDe, personne, personneCourante, placesLibres, prixDuDepart } from '../../domain/actions.ts';
  import type { StatutScan } from '../../domain/actions.ts';
  import { appelerSuperviseur, numeroQuai, passageParId, refuserAcces, verifierIdentite } from './actions.ts';
  import { fcfaF, libelleDepart, superviseursDe } from './commun.ts';
  import { dockDuRole } from '../_socle/dockRole.ts';
  import { app } from '../../data/store.svelte.ts';

  const agent = $derived(personneCourante());
  const passage = $derived(passageParId(param('passage')));
  const billet = $derived(passage?.billetId ? billetParId(passage.billetId) : undefined);
  const depart = $derived(passage ? departParId(passage.departId) : undefined);
  const premier = $derived(billet?.scanneLe ? personne(billet.scannePar) : undefined);
  const sup = $derived(superviseursDe(agent?.gareId));
  const tel = (t: string) => (t.length === 9 ? `${t[0]} ${t.slice(1, 3)} ${t.slice(3, 5)} ${t.slice(5, 7)} ${t.slice(7)}` : t || 'numéro inconnu');
  const siegeTxt = $derived(billet?.siege ? `Billet ${billet.siege}` : 'Billet');
  const TITRES: Record<StatutScan, string> = { ok: 'Billet valide', deja_scanne: 'Déjà scanné', annule: 'Billet annulé', faux: 'Billet falsifié', mauvais_depart: 'Autre départ', inconnu: 'Billet inconnu', non_paye: 'Paiement en attente' };
  const grand = $derived(!passage ? '' : passage.statut === 'deja_scanne' ? `${siegeTxt} déjà utilisé` : passage.statut === 'annule' ? `${siegeTxt} annulé` : passage.statut === 'faux' ? 'Sceau invalide' : passage.statut === 'mauvais_depart' ? 'Ce n’est pas ce départ' : passage.statut === 'inconnu' ? 'Aucun billet à ce code' : 'Paiement non confirmé');
  const explication = $derived.by(() => {
    if (!passage || !depart) return '';
    if (passage.statut === 'deja_scanne' && billet?.scanneLe) return `Scanné à ${heureLocale(billet.scanneLe)}${premier ? ` par ${premier.prenom}` : ''}, quai ${numeroQuai(depart)}. Ce code a déjà servi : une copie ou une capture d’écran ne passe pas.`;
    if (passage.statut === 'annule') return billet?.statut === 'rembourse' ? 'Ce billet a été annulé et remboursé : la place a été libérée.' : 'Ce billet n’est plus valable (annulé ou expiré).';
    if (passage.statut === 'faux') return 'Le sceau ne correspond pas au billet : il n’a pas été émis par la compagnie.';
    if (passage.statut === 'mauvais_depart') { const d = billet ? departParId(billet.departId) : undefined; return d ? `Ce billet est pour le départ de ${d.heure} vers ${ligneDe(d).vers}, le ${jourSemaineCourt(d.jour)}.` : 'Ce billet est pour un autre départ.'; }
    if (passage.statut === 'inconnu') return 'Vérifie la saisie. Sinon demande la preuve d’achat et une pièce d’identité.';
    return 'Le paiement n’est pas encore confirmé. Réessaie dans un instant ou envoie le voyageur au guichet.';
  });
  let identite = $state(false);

  function appeler() { if (!agent || !passage) return; const s = appelerSuperviseur(passage.id, agent.id); montrer(s.length ? `${s[0].prenom} est prévenu` : 'Aucun superviseur dans cette gare', s.length ? 'ok' : 'wa'); }
  function refuser() { if (agent && passage) refuserAcces(passage.id, agent.id); aller('/quai'); }
  function verifier(conforme: boolean) { if (agent && passage) { verifierIdentite(passage.id, conforme, agent.id); montrer(conforme ? 'Identité confirmée · décision au superviseur' : 'Identité non conforme · accès refusé', conforme ? 'ok' : 'er'); } }
</script>

<Mobile titre={passage ? TITRES[passage.statut] : 'Refus'} retourVers="/quai" dock={dockDuRole(app.session.role, { guichet: 'quai', terrain: 'quai' })}>
  {#snippet droite()}<span class="pl er">refus</span>{/snippet}
  {#if !passage || !depart}
    <div class="center"><div class="ill" aria-hidden="true"><Icone nom="scan" taille={56} /></div><span class="ttl t20">Aucun refus à afficher</span><span class="t14 mut">Les billets refusés au scan s’affichent ici.</span></div>
    <a class="b p" href="/quai" onclick={(e) => { e.preventDefault(); aller('/quai'); }}>Retour au radar</a>
  {:else}
    <div class="center" style="flex: none; padding: 16px 0 0">
      <div class="rond" aria-hidden="true"><Icone nom="fermer" taille={60} trait={2.6} /></div>
      <span class="ttl t24" role="alert">{grand}</span>
      <span class="t14 mut" style="max-width: 32ch">{explication}</span>
    </div>
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14">Code</span><span class="mono b7">{codeAffiche(passage.code)}</span></div>
      {#if billet}
        <div class="li"><span class="grow t14">{passage.statut === 'faux' ? 'Titulaire' : 'Acheté par'}</span><span class="t14 b7 c">{billet.passager.nom || 'Sans nom'} · {tel(billet.passager.tel)}</span></div>
        {#if passage.statut === 'deja_scanne' && billet.scanneLe}<div class="li"><span class="grow t14">Première montée</span><span class="t14 b7 c">{heureLocale(billet.scanneLe)}{billet.siege ? ` · place ${billet.siege} occupée` : ''}</span></div>{/if}
        {#if passage.statut === 'mauvais_depart'}{@const d = departParId(billet.departId)}{#if d}<div class="li"><span class="grow t14">Son départ</span><span class="t14 b7">{libelleDepart(d)}</span></div>{/if}{/if}
      {:else}<div class="li"><span class="grow t14">Départ en cours</span><span class="t14 b7">{libelleDepart(depart)}</span></div>{/if}
    </div>
    <span class="lab">Que faire</span>
    <div class="row g8">
      <button class="b s grow" type="button" aria-expanded={identite} onclick={() => (identite = !identite)}>{passage.identite === 'ok' ? 'Identité confirmée' : passage.identite === 'non' ? 'Identité non conforme' : 'Vérifier l’identité'}</button>
      <button class="b s grow" type="button" onclick={appeler} disabled={!!passage.superviseurAppele}>{passage.superviseurAppele ? 'Superviseur prévenu' : 'Appeler le superviseur'}</button>
    </div>
    {#if identite}
      <div class="gl col g8">
        <span class="t14">Compare la pièce d’identité avec <b>{billet ? billet.passager.nom || 'le titulaire' : 'la personne'}</b>{billet?.passager.tel ? ` · ${tel(billet.passager.tel)}` : ''}.</span>
        <div class="row g8"><button type="button" class="b s" onclick={() => verifier(true)}>Identité conforme</button><button type="button" class="b d" onclick={() => verifier(false)}>Non conforme</button></div>
      </div>
    {/if}
    {#if passage.superviseurAppele && sup[0]}<a class="b g" href="tel:+237{sup[0].tel}">Appeler {sup[0].prenom} · {tel(sup[0].tel)}</a>{/if}
    <div class="col g8" style="margin-top: auto">
      <p class="gl t13 mut" style="margin: 0" data-testid="orienter">Pas de billet valable : oriente la personne vers le guichet ({placesLibres(depart)} place{placesLibres(depart) > 1 ? 's' : ''} libre{placesLibres(depart) > 1 ? 's' : ''} à {fcfaF(prixDuDepart(depart))}).</p>
      <button class="b g" type="button" onclick={refuser}>Refuser l’accès · retour au radar</button>
    </div>
  {/if}
</Mobile>

<style>
  .rond { position: relative; width: 124px; height: 124px; margin: 0 auto; border-radius: 50%; display: grid; place-items: center; color: #06080f; background: #ff6b6b; box-shadow: 0 0 0 10px rgba(255, 107, 107, 0.18), 0 30px 60px -20px rgba(255, 107, 107, 0.8); animation: shake 0.5s; }
  @keyframes shake { 20% { transform: translateX(-8px); } 40% { transform: translateX(8px); } 60% { transform: translateX(-6px); } 80% { transform: translateX(5px); } }
</style>
