<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { aller } from '../../router.svelte.ts';
  import { etapesSuivi, premierPrelevement } from '../../core/auto.ts';
  import { jourCourt, jourDe } from '../../core/dates.ts';
  import { auto, monDossier, vehiculeDe } from './etat.ts';
  import { annuler, choisirCreneau, confirmerLivraison, creneauxProposes, estSigne } from './actions.ts';

  auto();
  const d = $derived(monDossier());
  const veh = $derived(vehiculeDe(d?.vehiculeId));
  const credit = $derived(d?.creditId ? app.credits.find((c) => c.id === d.creditId) : undefined);
  $effect(() => { if (!d || d.etape === 'annulee' || d.etape === 'refusee') aller(d ? '/auto/decision' : '/auto', { remplacer: true }); });
  const signe = $derived(!!d && estSigne(d));
  const livre = $derived(d?.etape === 'livree');
  const accorde = $derived(d?.etape === 'accordee' || livre);
  const premier = $derived.by(() => {
    if (credit) return credit.prochaine;
    return app.compte ? premierPrelevement(jourDe(new Date(maintenant())), app.compte.jourPaie) : '';
  });
  const etapes = $derived(d ? etapesSuivi({ signe, accorde, livre, rdv: d.rdv?.label ?? null, mensualiteAPayer: d.mensualite, premierPrelevement: premier ? jourCourt(premier) : '—', payees: credit?.payees ?? 0 }) : []);

  let creneaux = $state(false);
  let choix = $state('');
  let renoncer = $state(false);
  const slots = $derived(creneauxProposes());
  const ouvrirCreneaux = () => { choix = d?.rdv ? slots.find((s) => s.label === d.rdv!.label)?.id ?? '' : ''; creneaux = true; };
  const confirmerCreneau = () => {
    const s = slots.find((x) => x.id === choix); if (!s) return;
    const e = choisirCreneau(s); if (e) { montrer(e, 'danger'); return; }
    creneaux = false; montrer(`Créneau confirmé · ${s.label}`);
  };
  const clefs = () => { const e = confirmerLivraison(d!.id); if (e) montrer(e, 'danger'); else montrer('Clés remises, bonne route !'); };
  const renoncerOk = () => { const e = annuler(d!.id); renoncer = false; if (e) { montrer(e, 'danger'); return; } montrer('Contrat annulé, apport rendu au coffre voiture'); aller('/auto'); };
</script>

{#if d}
<Ecran titre={livre ? 'Bonne route !' : `Votre ${veh?.court.replace(/^(la|le|l')\s?/, '') ?? 'véhicule'} arrive`} sur="Étape 5 / 5 · suivi" retourVers="/auto">
  {#if !signe}
    <section class="rdv" role="status">
      <Pastille ton="alerte">Contrat à signer</Pastille>
      <p>Le suivi de livraison démarre à la signature du contrat.</p>
      <Bouton href="/auto/decision" plein={false}>Voir l'offre et signer</Bouton>
    </section>
  {:else}
    <section class="rdv">
      <small>{livre ? 'Livré' : 'Livraison'}</small>
      <b class="quand">{livre ? 'Clés remises' : d.rdv?.label ?? 'Rendez-vous à choisir'}</b>
      <p class="muted">{veh?.concession ?? 'Concession partenaire'} · remise des clés et carte grise.</p>
      {#if !livre}<button class="lien" onclick={ouvrirCreneaux}>{d.rdv ? 'Changer le créneau' : 'Choisir un créneau'}</button>{/if}
    </section>
  {/if}

  <ol class="etapes" aria-label="Étapes de la livraison">
    {#each etapes as e, i (e.id)}
      <li class={e.statut}>
        <span class="point" aria-hidden="true">{#if e.statut === 'fait'}<Icone nom="ok" taille={12} trait={3} />{/if}</span>
        {#if i < etapes.length - 1}<span class="fil" aria-hidden="true"></span>{/if}
        <div><b>{e.titre}</b><small>{e.sous}</small></div>
        <span class="sr">{e.statut === 'fait' ? 'Terminé' : e.statut === 'encours' ? 'En cours' : 'À venir'}</span>
      </li>
    {/each}
  </ol>

  {#if signe && !livre}
    <div class="acts">
      <button onclick={() => montrer(d.rdv ? `Ajouté au calendrier · ${d.rdv.label}` : "Choisissez d'abord un créneau", d.rdv ? 'bon' : 'danger')}><Icone nom="calendrier" taille={18} />Calendrier</button>
      <button onclick={() => montrer(`Itinéraire ouvert vers ${veh?.concession ?? 'la concession'}`)}><Icone nom="fleche" taille={18} />Itinéraire</button>
    </div>
    <Bouton variante="secondaire" onclick={clefs} desactive={!accorde || !d.rdv}>J'ai reçu les clés</Bouton>
    <small class="aide">{!accorde ? 'Disponible quand le concessionnaire a accordé le financement.' : !d.rdv ? 'Choisissez un créneau de remise des clés.' : 'À confirmer à la concession, à la remise des clés : les prélèvements démarrent ensuite.'}</small>
    <button class="renonce" onclick={() => (renoncer = true)}>Renoncer au contrat (48 h, sans frais)</button>
  {/if}
  {#if livre && credit}<p class="muted" role="status">Mensualité {credit.payees + 1} / {credit.duree} prélevée le {jourCourt(credit.prochaine)} sur votre paie. Suivez-la dans <a href="/prelevement" onclick={(e) => { e.preventDefault(); aller('/prelevement'); }}>Mes prélèvements</a>.</p>{/if}
  <Bouton variante="discret" href="/">Retour à l'accueil</Bouton>
</Ecran>

<Feuille bind:ouverte={creneaux} titre="Choisir un créneau" sous={veh?.concession ?? 'Concession'}>
  <p class="muted">Remise des clés et carte grise.</p>
  <div class="creneaux" role="radiogroup" aria-label="Créneaux disponibles">
    {#each slots as s (s.id)}
      <button role="radio" aria-checked={choix === s.id} class:on={choix === s.id} onclick={() => (choix = s.id)}><span class="rond"></span><span><b>{s.label}</b><small>{s.sous}</small></span></button>
    {/each}
  </div>
  <Bouton onclick={confirmerCreneau} desactive={!choix}>Confirmer ce créneau</Bouton>
</Feuille>

<Feuille bind:ouverte={renoncer} titre="Renoncer au contrat ?">
  <p class="muted">Vous pouvez renoncer sans frais tant que le véhicule n'est pas livré. Le crédit est supprimé et votre apport de {d.apport.toLocaleString('fr-FR')} FCFA retourne dans le coffre voiture.</p>
  <div class="deux"><Bouton variante="secondaire" onclick={() => (renoncer = false)}>Garder</Bouton><Bouton variante="danger" onclick={renoncerOk}>Renoncer</Bouton></div>
</Feuille>
{/if}

<style>
  .rdv { padding: 16px; border-radius: 22px; background: linear-gradient(160deg, var(--primaire-fond), var(--carte) 70%); border: 1px solid color-mix(in srgb, var(--primaire) 40%, transparent); display: flex; flex-direction: column; gap: 6px; align-items: flex-start; }
  small { color: var(--muted); font: 500 10.5px var(--mono); letter-spacing: 0.08em; text-transform: uppercase; } .quand { font-size: 20px; }
  .lien { min-height: 44px; color: var(--primaire-clair); font-weight: 650; }
  .etapes { list-style: none; display: flex; flex-direction: column; padding: 6px 4px; } .etapes li { position: relative; display: flex; gap: 14px; padding: 0 0 22px 0; }
  .etapes li:last-child { padding-bottom: 0; } .etapes b { display: block; font-size: 15px; } .etapes small { display: block; margin-top: 2px; text-transform: none; font: 400 13px var(--sans); letter-spacing: 0; line-height: 1.4; }
  .point { flex: none; width: 22px; height: 22px; border-radius: 11px; display: grid; place-items: center; border: 2px solid #2a3350; color: #06281c; z-index: 1; background: var(--fond); }
  .fait .point { background: var(--bon); border-color: var(--bon); } .encours .point { background: var(--primaire); border-color: var(--primaire); box-shadow: 0 0 0 5px rgba(48, 80, 255, 0.22), 0 0 18px var(--primaire); }
  .fil { position: absolute; left: 10px; top: 22px; bottom: 0; width: 2px; background: #1e2638; } .fait .fil { background: var(--bon); }
  .afaire b { color: var(--muted); } .sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); }
  .acts { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .acts button { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); font-weight: 600; }
  .aide { text-transform: none; font: 400 12.5px var(--sans); letter-spacing: 0; text-align: center; } .renonce { min-height: 44px; color: var(--danger); font-size: 13.5px; text-decoration: underline; }
  .creneaux { display: flex; flex-direction: column; gap: 8px; } .creneaux button { display: flex; gap: 12px; align-items: center; min-height: 60px; padding: 10px 14px; text-align: left; border-radius: 16px; background: var(--carte2); border: 1px solid var(--ligne); }
  .creneaux button.on { background: var(--primaire-fond); border-color: var(--primaire); } .creneaux small { display: block; text-transform: none; font: 400 12.5px var(--sans); letter-spacing: 0; }
  .rond { width: 20px; height: 20px; border-radius: 10px; border: 2px solid #3a4566; flex: none; } .on .rond { border-color: var(--primaire); background: radial-gradient(var(--primaire) 45%, transparent 50%); }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } a { text-decoration: underline; }
</style>
