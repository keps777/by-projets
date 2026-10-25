<script lang="ts">
  import { onMount } from 'svelte';
  import { aller, param } from '../../router.svelte.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Qr from '../../ui/Qr.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { billetsDe, compagnieDe, departEnMs, departParId, gare, heureLocale, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { maintenant } from '../../data/store.svelte.ts';
  import { contenuQr, sceauValide } from '../../core/sceau.ts';
  import { planSieges } from '../../core/sieges.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { codeAffiche } from '../../core/reglement.ts';
  import type { Billet } from '../../domain/types.ts';
  import { choisirBillet } from '../../core/selectionBillet.ts';
  import { paiementActifDe } from './actions.ts';
  import { billetMemorise, billetsEnCours, itemsDe, memoriserBillet } from './selection.ts';
  import SelecteurBillet from './SelecteurBillet.svelte';
  import HorsLigneContenu from './HorsLigneContenu.svelte';
  import CourseContenu from '../route/CourseContenu.svelte';
  import PartageContenu from './PartageContenu.svelte';
  import AnnuleContenu from './AnnuleContenu.svelte';
  import LitigeContenu from '../entree/LitigeContenu.svelte';

  /** Mes billets : le sélecteur « Ton bus » (tous les billets en cours et à venir, les miens et ceux achetés pour des proches), le billet choisi en hologramme (QR réel, reflet qui suit l'inclinaison),
   *  puis les actions et les billets passés. Sans réseau, Moto-taxi, Partager, Annuler et Problème s'ouvrent dans des fenêtres sur cette page (les routes `/pass/hors-ligne`, `/course`, `/proche`, `/pass/annule`, `/litige` restent valides). */
  const moi = personneCourante();
  let tic = $state(maintenant());
  onMount(() => { const t = setInterval(() => (tic = maintenant()), 1000); return () => clearInterval(t); });

  const tous = $derived(moi ? billetsDe(moi.id) : []);
  const utiles = $derived(tous.filter((b) => b.statut === 'valide' || b.statut === 'scanne' || b.statut === 'annule' || b.statut === 'rembourse'));
  const enAttente = $derived(tous.filter((b) => b.statut === 'attente_paiement' && paiementActifDe(b, tic)));
  const aVenir = $derived(moi ? billetsEnCours(moi.id) : []);
  const passes = $derived(utiles.filter((b) => !aVenir.includes(b)).sort((a, c) => departEnMs(departParId(c.departId)!) - departEnMs(departParId(a.departId)!)));
  /** Billet du lien (`?billet=`), sinon dernier choix du sélecteur s'il est encore en cours, sinon prochain départ, sinon le plus récent des billets passés. */
  const choisiId = $derived(choisirBillet({ enCours: aVenir.map((b) => b.id), tous: utiles.map((b) => b.id), demande: param('billet'), memorise: billetMemorise() }));
  const choisi = $derived(utiles.find((b) => b.id === choisiId) ?? passes[0]);
  /** Entrées du sélecteur : tous les billets en cours, plus le billet passé ou annulé quand on l'ouvre depuis la liste. */
  const items = $derived(moi ? itemsDe(choisi && !aVenir.includes(choisi) ? [choisi, ...aVenir] : aVenir, moi.id) : []);
  $effect(() => { if (param('billet') && aVenir.some((b) => b.id === param('billet'))) memoriserBillet(param('billet')!); });
  function choisirDansMenu(id: string) { memoriserBillet(id); if (param('billet')) aller(`/pass?billet=${id}`, { remplacer: true }); }
  type Fenetre = '' | 'horsligne' | 'course' | 'partage' | 'annule' | 'probleme';
  let fenetre = $state<Fenetre>('');
  const ouverte = (f: Fenetre) => fenetre === f, ferme = (f: Fenetre) => (v: boolean) => { if (!v && fenetre === f) fenetre = ''; };
  const fermer = () => (fenetre = '');
  const depart = $derived(choisi ? departParId(choisi.departId) : undefined);
  const ligne = $derived(depart ? ligneDe(depart) : undefined);
  const siege = $derived(ligne && depart && choisi?.siege ? planSieges(ligne.classe, depart.capacite).find((s) => s.id === choisi.siege) : undefined);
  const valide = $derived(choisi ? sceauValide({ code: choisi.code, departId: choisi.departId, siege: choisi.siege, nom: choisi.passager.nom, sceau: choisi.sceau }) : false);
  const actif = $derived(choisi?.statut === 'valide' || choisi?.statut === 'scanne');
  const annule = $derived(choisi?.statut === 'annule' || choisi?.statut === 'rembourse');

  // ---- inclinaison : la souris, le doigt ou les flèches du clavier ; sans effet si l'utilisateur préfère moins d'animation
  const reduit = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rx = $state(6), ry = $state(-8);
  function incline(ev: PointerEvent) {
    if (reduit) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
    rx = -((ev.clientY - r.top) / r.height - 0.5) * 24; ry = ((ev.clientX - r.left) / r.width - 0.5) * 28;
  }
  const remise = () => { rx = 6; ry = -8; };
  function touche(ev: KeyboardEvent) {
    const pas = 6; if (ev.key === 'ArrowLeft') ry = Math.max(-20, ry - pas); else if (ev.key === 'ArrowRight') ry = Math.min(20, ry + pas); else if (ev.key === 'ArrowUp') rx = Math.min(16, rx + pas); else if (ev.key === 'ArrowDown') rx = Math.max(-16, rx - pas); else if (ev.key === 'Escape') remise(); else return;
    ev.preventDefault();
  }
  const nav = (ev: Event, vers: string) => { ev.preventDefault(); aller(vers); };
  const libelleFin = (b: Billet) => (b.statut === 'annule' ? 'annulé' : b.statut === 'rembourse' ? 'remboursé' : b.statut === 'scanne' ? 'terminé' : departParId(b.departId)?.statut === 'annule' ? 'départ annulé' : 'non utilisé');
</script>

<Mobile titre="Mes billets" sous={`${aVenir.length} à venir · ${passes.length} passé${passes.length > 1 ? 's' : ''}`} sansRetour dock={dockVoyageur('billets')}>
  {#snippet droite()}
    <button type="button" class="b s sm" onclick={() => (fenetre = 'horsligne')} aria-haspopup="dialog"><svg class="ic" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9a14 14 0 0 1 8-3.6M21 9a14 14 0 0 0-3.4-2.5M6.5 12.5a9 9 0 0 1 3.5-2M17.5 12.5a9 9 0 0 0-2-1.4M10 16a4 4 0 0 1 4 0M12 19.5h.01M4 4l16 16" /></svg>Sans réseau</button>
  {/snippet}

  {#if !choisi}
    <div class="center"><span class="ill" aria-hidden="true"><Icone nom="billet" taille={56} /></span>
      <span class="ttl t20">Aucun billet pour l’instant</span>
      <span class="t14 mut" style="max-width: 30ch">Dès que tu réserves un départ, ton billet holographique apparaît ici, même sans réseau.</span>
      <a class="b p" href="/" onclick={(ev) => nav(ev, '/')}>Chercher un départ</a></div>
  {/if}

  {#if enAttente.length}
    <span class="lab">En attente de paiement</span>
    {#each enAttente as b (b.id)}
      {@const d = departParId(b.departId)!}
      <div class="tk"><span class="bub"><Icone nom="horloge" /></span>
        <span class="col grow"><span class="t14 b7">{ligneDe(d).de} → {ligneDe(d).vers} · {d.heure}</span><span class="t12 mut">Place {b.siege ?? 'libre'} · {codeAffiche(b.code)} · gardée jusqu’à {heureLocale(paiementActifDe(b, tic)?.expireLe ?? 0)}</span></span>
        <span class="pl wa">{paiementActifDe(b, tic)?.moyen === 'especes' ? 'au guichet' : 'à payer'}</span></div>
    {/each}
  {/if}

  {#if items.length}<SelecteurBillet {items} valeur={choisi?.id} onchoisir={choisirDansMenu} />{/if}

  {#if choisi && depart && ligne}
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <div class="holo" onpointermove={incline} onpointerleave={remise} onpointerup={remise} onkeydown={touche} role="group" tabindex="0" aria-label="Billet holographique {ligne.de} vers {ligne.vers}, {jourSemaineCourt(depart.jour)} à {depart.heure}, place {choisi.siege ?? 'libre'}. Flèches du clavier pour l’incliner.">
      <div class="card" class:off={annule} style="transform: rotateX({rx.toFixed(1)}deg) rotateY({ry.toFixed(1)}deg)">
        <div class="sheen" style="background-position: {Math.round(50 + ry * 4)}% 0" aria-hidden="true"></div>
        <span class="seal" aria-hidden="true"><Icone nom="ok" taille={22} trait={2.4} /></span>
        <div class="col" style="padding-right: 56px"><span class="lab">{compagnieDe(depart).nom} · {ligne.classe}</span><span class="ttl t24">{ligne.de} → {ligne.vers}</span><span class="t13 mut">{gare(ligne.gareDe)?.nom} → {gare(ligne.gareVers)?.nom} · {jourSemaineCourt(depart.jour)}</span></div>
        <div class="row sp" style="align-items: flex-end">
          <div class="col"><span class="lab">Départ</span><span class="ttl t30">{heureLocale(departEnMs(depart))}</span><span class="t12 mut">{depart.retardMin ? `retard +${depart.retardMin} min · ` : ''}embarquement {heureLocale(departEnMs(depart) - 20 * 60_000)}</span></div>
          <div class="col" style="align-items: flex-end"><span class="lab">Place</span><span class="ttl t30">{choisi.siege ?? '—'}</span><span class="t12 mut">{siege ? (siege.fenetre ? 'fenêtre' : 'couloir') + ' · ' : ''}1 valise</span></div>
        </div>
        <div class="row sp" style="margin-top: auto; align-items: flex-end">
          <div class="col"><span class="lab">{choisi.passager.nom}</span><span class="mono t16 b7">{codeAffiche(choisi.code)}</span>
            {#if annule}<span class="t12 erc">billet annulé · invalide</span>{:else if valide}<span class="t12 okc">signé · valable sans réseau</span>{:else}<span class="t12 erc">sceau invalide</span>{/if}</div>
          <div class="qr" class:gris={choisi.statut === 'scanne' || annule}>{#if !annule}<Qr texte={contenuQr(choisi.code, choisi.sceau)} taille={100} fond="#F2F4FF" libelle="Code à scanner au quai : {codeAffiche(choisi.code)}" />{:else}<span class="barre" aria-hidden="true">ANNULÉ</span>{/if}</div>
        </div>
        {#if choisi.statut === 'scanne'}<span class="cachet inf">SCANNÉ {choisi.scanneLe ? heureLocale(choisi.scanneLe) : ''}</span>{:else if annule}<span class="cachet er">{choisi.statut === 'rembourse' ? 'REMBOURSÉ' : 'ANNULÉ'}</span>{/if}
      </div>
    </div>
    <span class="t12 mut3 c">{annule ? 'Ce billet n’est plus valable.' : 'Incline le billet : l’hologramme bouge, preuve qu’il n’est pas une capture d’écran.'}</span>

    <div class="col g8">
      <a class="b p" href="/direct?billet={choisi.id}" onclick={(ev) => nav(ev, `/direct?billet=${choisi.id}`)}>Suivre ce bus</a>
      <button type="button" class="b s" disabled={!actif} aria-haspopup="dialog" onclick={() => (fenetre = 'course')}><Icone nom="moto" taille={20} />Moto-taxi vers la gare</button>
    </div>
    <div class="row g8">
      <button type="button" class="b s sm grow" aria-haspopup="dialog" onclick={() => (fenetre = 'partage')}>Partager</button>
      <button type="button" class="b s sm grow" aria-haspopup="dialog" disabled={choisi.statut !== 'valide'} onclick={() => (fenetre = 'annule')}>Annuler</button>
      <button type="button" class="b s sm grow" aria-haspopup="dialog" onclick={() => (fenetre = 'probleme')}>Problème</button>
    </div>
    <span class="t12 mut3 c">Billet payé {fmtF(choisi.prix)} · {actif ? 'à présenter au quai' : libelleFin(choisi)}</span>
  {/if}

  {#if passes.length}
    <span class="lab">Passés</span>
    {#each passes as b (b.id)}
      {@const d = departParId(b.departId)!}
      {@const l = ligneDe(d)}
      <a class="tk" class:sel={choisi?.id === b.id} href="/pass?billet={b.id}" onclick={(ev) => nav(ev, `/pass?billet=${b.id}`)} aria-current={choisi?.id === b.id ? 'true' : undefined}>
        <span class="av sm" style="background: {compagnieDe(d).couleur}">{compagnieDe(d).abrev}</span>
        <span class="col grow"><span class="t14 b7">{l.de} → {l.vers}</span><span class="t12 mut">{jourSemaineCourt(d.jour)} · {d.heure} · {fmtF(b.prix)}</span></span>
        <span class="pl {b.statut === 'annule' || b.statut === 'rembourse' ? 'er' : ''}">{libelleFin(b)}</span>
      </a>
    {/each}
  {/if}
</Mobile>

<Feuille bind:ouvert={() => ouverte('horsligne'), ferme('horsligne')} titre="Sans réseau" sous="Ton billet reste valable sans internet" hauteur="haute"><HorsLigneContenu billetId={choisi?.id} onfermer={fermer} /></Feuille>
<Feuille bind:ouvert={() => ouverte('course'), ferme('course')} titre="Moto-taxi vers la gare" sous={depart && ligne ? `Vers la gare de ${gare(ligne.gareDe)?.nom ?? ''} · bus de ${depart.heure}` : 'Moto ou taxi, au choix'} hauteur="haute"><CourseContenu departId={choisi?.departId} onfermer={fermer} /></Feuille>
<Feuille bind:ouvert={() => ouverte('partage'), ferme('partage')} titre="Partager mon billet" sous="Le code part, le billet reste à son nom" hauteur="haute">{#if choisi}<PartageContenu billetId={choisi.id} onfermer={fermer} />{/if}</Feuille>
<Feuille bind:ouvert={() => ouverte('annule'), ferme('annule')} titre="Annuler ce billet" sous="Remboursement : 10 % de frais jusqu’à 2 h avant le départ"><AnnuleContenu billetId={choisi?.id} onfermer={fermer} /></Feuille>
<Feuille bind:ouvert={() => ouverte('probleme'), ferme('probleme')} titre="Signaler un problème" sous="Réponse sous 2 h" hauteur="haute"><LitigeContenu billetId={choisi?.id} onfermer={fermer} /></Feuille>

<style>
  .holo { flex: none; perspective: 1000px; margin: 0 -4px; touch-action: none; border-radius: 28px; }
  .holo:focus-visible { outline: 2px solid #7febff; outline-offset: 4px; }
  .card { position: relative; border-radius: 28px; padding: 18px; min-height: 300px; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(150deg, #141a33, #0a0e1c 60%, #1a1030); border: 1px solid rgba(255, 255, 255, 0.26); transform-style: preserve-3d; transition: transform 0.15s; box-shadow: 0 40px 80px -40px rgba(124, 108, 255, 0.8); overflow: hidden; user-select: none; }
  .card.off { filter: grayscale(0.8); opacity: 0.8; }
  .sheen { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 30%, rgba(139, 124, 255, 0.35) 42%, rgba(61, 224, 255, 0.45) 50%, rgba(255, 91, 222, 0.35) 58%, transparent 70%); background-size: 220% 100%; mix-blend-mode: screen; pointer-events: none; border-radius: 28px; }
  .card::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(255, 255, 255, 0.03) 3px 4px); pointer-events: none; }
  .qr { position: relative; width: 112px; height: 112px; border-radius: 14px; overflow: hidden; background: #f2f4ff; transform: translateZ(20px); display: grid; place-items: center; }
  .qr :global(svg) { display: block; width: 100%; height: 100%; }
  .qr.gris :global(svg) { opacity: 0.3; }
  .barre { font: 800 14px 'Sora Variable', 'Sora', sans-serif; color: #ff6b6b; letter-spacing: 0.1em; transform: rotate(-12deg); }
  .seal { position: absolute; right: 16px; top: 16px; width: 46px; height: 46px; border-radius: 50%; background: conic-gradient(from 0deg, #8b7cff, #3de0ff, #ff5bde, #8b7cff); display: grid; place-items: center; color: #06080f; transform: translateZ(30px); animation: tourne 9s linear infinite; }
  @keyframes tourne { to { transform: translateZ(30px) rotate(360deg); } }
  .cachet { position: absolute; left: 50%; top: 52%; transform: translate(-50%, -50%) rotate(-14deg); padding: 6px 16px; border-radius: 12px; border: 3px solid currentColor; font: 800 22px 'Sora Variable', 'Sora', sans-serif; letter-spacing: 0.08em; background: rgba(5, 7, 13, 0.55); }
  .cachet.er { color: #ff6b6b; } .cachet.inf { color: #7fb8ff; }
  .tk { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.1); text-decoration: none; color: inherit; min-height: 60px; }
  .tk.sel { border-color: #8b7cff; }
  .b:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
