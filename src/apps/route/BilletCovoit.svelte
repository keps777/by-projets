<script lang="ts">
  import { initiales, nomCourt, nomVehicule } from '../../core/covoit.ts';
  import { heureArrivee, texteDuree } from '../../core/covoitPrix.ts';
  import { noteTexte } from '../../core/covoitRegles.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { fmtF } from '../../core/tarif.ts';
  import { personne } from '../../domain/actions.ts';
  import Qr from '../../ui/Qr.svelte';
  import { dureeOffre, estMonte, profilDe, type Resa } from './covoitActions.ts';
  import IconeCv from './IconeCv.svelte';

  /** Le billet de covoiturage, dans l'esprit du billet holographique : trajet, heure, conducteur et véhicule, plaque, point de rencontre, places, code de prise en charge + QR, statut. S'incline au doigt ou aux flèches. */
  let { resa }: { resa: Resa } = $props();
  const o = $derived(resa.offre), c = $derived(personne(o.conducteurId)), pr = $derived(profilDe(o.conducteurId));
  const duree = $derived(dureeOffre(o)), arrivee = $derived(heureArrivee(o.heure, duree));
  const STATUT = { a_venir: ['Confirmé', 'ok'], en_route: ['En route', 'ac'], terminee: ['Terminé', ''], passee: ['Passé', ''] } as const;
  const [txt, ton] = $derived(STATUT[resa.phase]);
  const fini = $derived(resa.phase === 'terminee' || resa.phase === 'passee');
  const reduit = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let rx = $state(5), ry = $state(-7);
  function incline(ev: PointerEvent) { if (reduit) return; const r = (ev.currentTarget as HTMLElement).getBoundingClientRect(); rx = -((ev.clientY - r.top) / r.height - 0.5) * 22; ry = ((ev.clientX - r.left) / r.width - 0.5) * 26; }
  const remise = () => { rx = 5; ry = -7; };
  function touche(ev: KeyboardEvent) {
    if (ev.key === 'ArrowLeft') ry = Math.max(-20, ry - 6); else if (ev.key === 'ArrowRight') ry = Math.min(20, ry + 6); else if (ev.key === 'ArrowUp') rx = Math.min(16, rx + 6); else if (ev.key === 'ArrowDown') rx = Math.max(-16, rx - 6); else if (ev.key === 'Escape') remise(); else return;
    ev.preventDefault();
  }
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div class="holo" onpointermove={incline} onpointerleave={remise} onpointerup={remise} onkeydown={touche} role="group" tabindex="0" aria-label="Billet de covoiturage {o.de} vers {o.vers}, {jourSemaineCourt(o.jour)} à {o.heure}, {resa.places} place{resa.places > 1 ? 's' : ''}, code de prise en charge {resa.code}. Flèches du clavier pour l’incliner.">
  <div class="card" class:off={fini} style="transform: rotateX({rx.toFixed(1)}deg) rotateY({ry.toFixed(1)}deg)">
    <div class="sheen" style="background-position: {Math.round(50 + ry * 4)}% 0" aria-hidden="true"></div>
    <span class="seal" aria-hidden="true"><IconeCv nom="voiture" taille={22} trait={2.2} /></span>
    <div class="col" style="padding-right: 56px"><span class="lab">Covoiturage · {nomVehicule(o.vehicule)}</span><span class="ttl t24">{o.de} → {o.vers}</span><span class="t13 mut">Rencontre : {o.depart} · {jourSemaineCourt(o.jour)}</span></div>
    <div class="row sp" style="align-items: flex-end">
      <div class="col"><span class="lab">Départ</span><span class="ttl t30">{o.heure}</span><span class="t12 mut">arrivée ≈ {arrivee.heure} · {texteDuree(duree)}</span></div>
      <div class="col" style="align-items: flex-end"><span class="lab">Places</span><span class="ttl t30">{resa.places}</span><span class="t12 mut">{fmtF(resa.montant)} payés</span></div>
    </div>
    <div class="cond"><span class="av">{initiales(c?.prenom ?? '?', c?.nom)}</span>
      <span class="col grow"><span class="t14 b7 ell">{c ? nomCourt(c.prenom, c.nom) : 'Conducteur'} <span class="cv-etoile"><IconeCv nom="etoile" taille={12} />{noteTexte(c?.note)}</span></span><span class="t12 mut ell">{pr ? `${pr.vehicule.couleur} · ` : ''}{nomVehicule(o.vehicule)}</span></span>
      {#if pr}<span class="plaque mono">{pr.vehicule.plaque}</span>{/if}</div>
    <div class="row sp" style="margin-top: auto; align-items: flex-end">
      <div class="col"><span class="lab">Code de prise en charge</span><span class="code mono" aria-label="Code {resa.code.split('').join(' ')}">{resa.code}</span>
        <span class="t12 {estMonte(o.id, resa.voyageurId) ? 'okc' : 'mut'}">{fini ? 'trajet terminé' : estMonte(o.id, resa.voyageurId) ? 'code validé : tu es monté' : 'à donner au conducteur en montant'}</span></div>
      <div class="qr" class:gris={fini}><Qr texte={`AMCV|${o.id}|${resa.code}`} taille={92} fond="#F2F4FF" libelle="QR de prise en charge, code {resa.code}" /></div>
    </div>
    <span class="statut cv-badge {ton}">{txt}</span>
  </div>
</div>

<style>
  .holo { flex: none; perspective: 1000px; margin: 0 -4px; touch-action: pan-y; border-radius: 28px; }
  .holo:focus-visible { outline: 2px solid #7febff; outline-offset: 4px; }
  .card { position: relative; border-radius: 28px; padding: 18px; min-height: 340px; display: flex; flex-direction: column; gap: 12px; background: linear-gradient(150deg, #141a33, #0a0e1c 60%, #1a1030); border: 1px solid rgba(255, 255, 255, 0.26); transform-style: preserve-3d; transition: transform 0.15s; box-shadow: 0 40px 80px -40px rgba(124, 108, 255, 0.8); overflow: hidden; user-select: none; }
  .card.off { filter: grayscale(0.7); opacity: 0.85; }
  .sheen { position: absolute; inset: 0; background: linear-gradient(115deg, transparent 30%, rgba(139, 124, 255, 0.35) 42%, rgba(61, 224, 255, 0.45) 50%, rgba(255, 91, 222, 0.35) 58%, transparent 70%); background-size: 220% 100%; mix-blend-mode: screen; pointer-events: none; border-radius: 28px; }
  .card::after { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(0deg, transparent 0 3px, rgba(255, 255, 255, 0.03) 3px 4px); pointer-events: none; }
  .seal { position: absolute; right: 16px; top: 16px; width: 46px; height: 46px; border-radius: 50%; background: conic-gradient(from 0deg, #8b7cff, #3de0ff, #ff5bde, #8b7cff); display: grid; place-items: center; color: #06080f; transform: translateZ(30px); }
  .cond { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: 16px; background: rgba(255, 255, 255, 0.07); border: 1px solid rgba(255, 255, 255, 0.1); transform: translateZ(10px); }
  .cond .av { width: 38px; height: 38px; font-size: 13px; }
  .plaque { flex: none; padding: 3px 8px; border-radius: 7px; background: #f2f4ff; color: #06080f; font-weight: 700; font-size: 12px; letter-spacing: 0.06em; border: 2px solid #8b7cff; }
  .code { font-size: 34px; font-weight: 700; letter-spacing: 0.22em; background: linear-gradient(90deg, #b3a8ff, #7febff); -webkit-background-clip: text; background-clip: text; color: transparent; line-height: 1.1; transform: translateZ(18px); }
  .qr { position: relative; width: 100px; height: 100px; border-radius: 14px; overflow: hidden; background: #f2f4ff; transform: translateZ(20px); display: grid; place-items: center; }
  .qr :global(svg) { display: block; width: 100%; height: 100%; } .qr.gris :global(svg) { opacity: 0.3; }
  .statut { position: absolute; right: 16px; top: 68px; transform: translateZ(24px); }
</style>
