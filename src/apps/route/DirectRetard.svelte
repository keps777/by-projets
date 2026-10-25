<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import Feuille from '../../ui/Feuille.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { compagnieDe, departEnMs, departParId, heureLocale, ligneDe, notificationsDe, personneCourante, placesLibres } from '../../domain/actions.ts';
  import { gesteRetard, hhmm, minutes } from '../../core/retard.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Icone from '../../ui/Icone.svelte';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { alternativeAuRetard, billetASuivre, choisirRetard } from './actions.ts';
  import { cagnotteDe, lire, type ChoixRetard } from './etat.ts';
  import { nav } from './nav.ts';
  import { billetChoisi } from '../reglement/selection.ts';
  import PartageContenu from '../reglement/PartageContenu.svelte';

  const MOYEN: Record<string, string> = { momo: 'MoMo', om: 'Orange Money', carte: 'ta carte', visage: 'ton compte', especes: 'espèces', proche: 'ton proche' };
  const moi = $derived(personneCourante());
  const billet = $derived((moi ? billetChoisi(moi.id, param('billet')) : undefined) ?? (moi ? billetASuivre(moi.id) : undefined)); // le bus choisi dans « Ton bus »
  let partage = $state(false);
  const d = $derived(billet ? departParId(billet.departId) : undefined);
  const ligne = $derived(d ? ligneDe(d) : undefined);
  const alt = $derived(d && d.retardMin > 0 ? alternativeAuRetard(d) : undefined);
  const paiement = $derived(billet ? app.monde.paiements.find((p) => p.id === billet.paiementId) : undefined);
  const geste = $derived(d ? gesteRetard(d.retardMin) : 0);
  const recu = $derived(billet ? lire().gestes[billet.id] : undefined);
  const annulable = $derived(billet?.statut === 'valide');
  const prevenue = $derived(moi ? notificationsDe(moi.id).find((n) => n.type === 'retard') : undefined);
  let choix = $state<ChoixRetard>('attendre'), aConfirmer = $state(false), occupe = $state(false);

  const nouvelleArrivee = $derived(d && ligne ? hhmm(minutes(d.heure) + d.retardMin + ligne.dureeMin) : '');
  const options = $derived<{ id: ChoixRetard; titre: string; sous: string; pl: string; ton: string; bub: string; icone: string; ok: boolean }[]>(d && billet && ligne ? [
    { id: 'attendre', titre: `Garder ma place${billet.siege ? ` ${billet.siege}` : ''} à ${heureLocale(departEnMs(d))}`, sous: `Même bus, ${billet.siege ? 'même siège' : 'même billet'}, arrivée ${nouvelleArrivee}`, pl: 'gratuit', ton: 'ok', bub: 'aq', icone: 'ok', ok: true },
    { id: 'changer', titre: alt ? `Basculer sur ${compagnieDe(alt).nom} ${alt.heure}` : 'Changer de départ', sous: alt ? `${placesLibres(alt)} places · ${ligneDe(alt).gareDe === ligne.gareDe ? 'même gare' : 'autre gare'} · annulation sans frais` : 'Annulation sans frais, puis tu choisis un autre départ', pl: 'conseillé', ton: 'ac', bub: '', icone: 'direct', ok: annulable },
    { id: 'rembourser', titre: 'Annuler · remboursement total', sous: `${fmtF(billet.prix)} sur ${MOYEN[paiement?.moyen ?? 'momo']} en 5 min, sans frais`, pl: '100 %', ton: 'inf', bub: '', icone: 'fermer', ok: annulable }
  ] : []);
  const cta = $derived(choix === 'attendre' ? 'Garder · voir mon billet' : choix === 'changer' ? 'Changer de départ' : 'Annuler et me rembourser');

  function choisir(c: ChoixRetard) { choix = c; aConfirmer = false; }
  function valider() {
    if (!billet) return;
    if (choix !== 'attendre' && !aConfirmer) { aConfirmer = true; return; }
    occupe = true;
    try {
      const r = choisirRetard(billet.id, choix);
      montrer(r.geste ? `${choix === 'attendre' ? 'Place gardée' : 'Billet annulé sans frais'} · ${fmtF(r.geste)} crédités sur ta cagnotte` : choix === 'attendre' ? 'Place gardée' : `Billet annulé sans frais · ${fmtF(r.rembourse)} remboursés`);
      aller(r.redirection);
    } catch (e) {
      montrer(e instanceof Error && e.message === 'billet_non_remboursable' ? 'Ce billet ne peut plus être annulé.' : 'Action impossible pour le moment.', 'er'); aConfirmer = false;
    } finally { occupe = false; }
  }
</script>

<Mobile titre="Retard annoncé" retourVers="/direct" dock={dockVoyageur('billets')}>
  {#snippet droite()}{#if d && d.retardMin > 0}<span class="pl wa"><span class="dot"></span>+{d.retardMin} min</span>{/if}{/snippet}

  {#if !billet || !d || !ligne}
    <div class="center">
      <div class="ill" aria-hidden="true"><Icone nom="billet" taille={64} trait={1.6} /></div>
      <span class="ttl t20">Pas de billet à suivre</span><span class="t14 mut">Tu seras prévenue ici dès qu’un de tes bus a du retard.</span>
    </div>
    <a class="b p" href="/" use:nav>Voir les départs</a>
  {:else if d.retardMin <= 0}
    <div class="center">
      <div class="ill ok" aria-hidden="true"><Icone nom="ok" taille={64} trait={1.8} /></div>
      <span class="ttl t20">Ton bus est à l’heure</span><span class="t14 mut">{compagnieDe(d).nom} · {ligne.de} → {ligne.vers} · départ {d.heure}. On te prévient ici s’il y a du retard.</span>
    </div>
    <a class="b p" href="/direct" use:nav>Suivre mon bus</a>
  {:else}
    <div class="gl" style="border-color: rgba(255,194,75,.5)">
      <div class="row sp">
        <div class="col"><span class="lab">Nouveau départ</span><span class="big wac">{heureLocale(departEnMs(d))}</span><span class="t13 mut">au lieu de {d.heure} · {compagnieDe(d).nom}</span></div>
        <span class="ringp" style="--p: {Math.min(100, Math.round((d.retardMin / 60) * 100))}%"><span class="t13 b7">{d.retardMin}’</span></span>
      </div>
      <p class="t13 mut" style="margin: 10px 0 0">{compagnieDe(d).nom} a annoncé {d.retardMin} min de retard sur le départ de {d.heure}{prevenue ? ` · on t’a prévenue à ${new Date(prevenue.ts).toTimeString().slice(0, 5)}` : ''}. Nouvelle arrivée estimée à {nouvelleArrivee}.</p>
    </div>

    <span class="lab" id="choix-lab">Tu choisis</span>
    <div class="col g8" role="radiogroup" aria-labelledby="choix-lab">
      {#each options as o (o.id)}
        <button type="button" role="radio" aria-checked={choix === o.id} class="opt" class:on={choix === o.id} disabled={!o.ok} onclick={() => choisir(o.id)}>
          <span class="bub {o.bub}"><Icone nom={o.icone} taille={20} trait={2} /></span>
          <span class="col grow"><span class="t15 b7">{o.titre}</span><span class="t12 mut">{o.ok ? o.sous : 'Impossible : ce billet a déjà été utilisé.'}</span></span>
          <span class="pl {o.ton}">{o.pl}</span>
        </button>
      {/each}
    </div>

    {#if geste > 0}
      <div class="toast"><span class="bub aq"><Icone nom="cloche" taille={18} /></span>
        <span class="t13 grow">{recu && recu.montant > 0 ? `Geste commercial reçu : ${fmtF(recu.montant)} sur ta cagnotte (${fmtF(cagnotteDe(moi?.id))} en tout).` : `Geste commercial : ${fmtF(geste)} crédités sur ta cagnotte quel que soit ton choix.`}</span></div>
    {:else}
      <div class="toast"><span class="bub aq"><Icone nom="info" taille={18} /></span><span class="t13 grow">Un geste commercial de {fmtF(gesteRetard(30))} est offert dès 30 min de retard.</span></div>
    {/if}
    {#if aConfirmer}
      <div class="gl" style="border-color: rgba(255,107,107,.5)" role="alert"><span class="t13">{choix === 'changer' ? 'Ton billet sera annulé sans frais et tu choisiras un autre départ.' : `Ton billet sera annulé et ${fmtF(billet.prix)} te seront remboursés.`} Confirmer ?</span></div>
    {/if}
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" class:d={aConfirmer} onclick={valider} disabled={occupe}>{aConfirmer ? `Oui, ${choix === 'changer' ? 'changer de départ' : 'annuler et rembourser'}` : cta}</button>
      {#if aConfirmer}<button type="button" class="b s" onclick={() => (aConfirmer = false)}>Non, revenir</button>{/if}
      <button type="button" class="b g" aria-haspopup="dialog" onclick={() => (partage = true)}>Prévenir mes proches</button>
    </div>
  {/if}
</Mobile>

<Feuille bind:ouvert={partage} titre="Prévenir mes proches" sous="Envoie-leur le code de ton billet et le nouvel horaire" hauteur="haute">{#if billet}<PartageContenu billetId={billet.id} onfermer={() => (partage = false)} />{/if}</Feuille>

<style>
  .opt { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 64px; }
  .opt.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .opt:disabled { opacity: 0.5; cursor: not-allowed; }
  .t15 { font-size: 15px; }
  button:disabled { opacity: 0.6; }
</style>
