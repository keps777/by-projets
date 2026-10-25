<script lang="ts">
  import { aller, param } from '../../router.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { departParId, personne, personneCourante } from '../../domain/actions.ts';
  import { SUPPLEMENT_ASSURANCE, SUPPLEMENT_MOTO, TAILLES } from '../../core/colis.ts';
  import { fcfa } from '../../core/money.ts';
  import { formaterDistance, formaterTel, libelleHoraires, normaliserTel, QUARTIERS } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { arriveeDepart, envoyerColis, garantirRelais, prenomDe, prixEnvoi, prochainDepartColis, relaisDuMonde, trajetColis, validerEnvoi, type ErreursEnvoi } from './actions.ts';
  import { trancheColis, type Taille } from './etat.ts';
  import Pic from './Pic.svelte';

  garantirRelais();
  const b = trancheColis().brouillon;
  // Depuis l'accueil (mode Colis) : `?depart=` ou `?covoit=` présélectionne le trajet (et fixe le prix de la ligne), `?taille=` la taille.
  const trajet = trajetColis(param('depart'), param('covoit'));
  const tailleDemandee = param('taille');
  if (tailleDemandee === 'S' || tailleDemandee === 'M' || tailleDemandee === 'L') b.taille = tailleDemandee;
  const moi = $derived(personneCourante());
  const proches = $derived((moi?.prochesIds ?? []).map((id) => personne(id)).filter((p) => !!p));
  const dep = $derived((trajet?.departId ? departParId(trajet.departId) : undefined) ?? prochainDepartColis());
  const liste = $derived(relaisDuMonde());
  // Le relais le plus proche est proposé tant que rien n'est choisi.
  const choisi = $derived(liste.find((r) => r.personne.id === b.relaisId) ?? (b.relaisId ? undefined : liste[0]));
  const total = $derived(prixEnvoi(b, trajet));
  const prenom = $derived(b.nom.trim() ? prenomDe(b.nom) : 'Le destinataire');
  const cote: Record<Taille, number> = { S: 56, M: 84, L: 110 };
  const nomTaille: Record<Taille, string> = { S: 'S · enveloppe', M: 'M · carton', L: 'L · sac' };

  let essaye = $state(false), envoi = $state(false), erreursServeur = $state<ErreursEnvoi>({});
  let tNom = $state(false), tTel = $state(false);
  const erreurs = $derived(validerEnvoi({ ...b, relaisId: choisi?.personne.id ?? null }));
  const montrerNom = $derived((essaye || tNom) && erreurs.nom), montrerTel = $derived((essaye || tTel) && erreurs.tel);

  // Cube 3D : glisser au doigt pour le tourner (la rotation automatique continue sinon).
  let rx = $state(0), ry = $state(0), glisse: { x: number; y: number } | null = null;
  function debut(e: PointerEvent) { glisse = { x: e.clientX, y: e.clientY }; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); }
  function bouge(e: PointerEvent) { if (!glisse) return; ry += (e.clientX - glisse.x) * 0.6; rx = Math.max(-50, Math.min(50, rx - (e.clientY - glisse.y) * 0.4)); glisse = { x: e.clientX, y: e.clientY }; }
  const fin = () => { glisse = null; };

  function remplir(id: string) { const p = personne(id); if (!p) return; b.nom = `${p.prenom} ${p.nom}`; b.tel = p.tel; }
  function choisirRelais(id: string) { b.relaisId = id; }
  function valider() {
    if (envoi) return;
    essaye = true; erreursServeur = {};
    const quiPaie = prenom;
    const r = envoyerColis({ ...b, relaisId: choisi?.personne.id ?? null }, moi!.id, trajet);
    if (!r.ok) { erreursServeur = r.erreurs; if (r.erreurs.general) montrer(r.erreurs.general, 'er'); document.getElementById(r.erreurs.nom ? 'dest-nom' : r.erreurs.tel ? 'dest-tel' : 'zone-relais')?.focus(); return; }
    envoi = true;
    if (r.payer) aller(`/paiement?colis=${r.colis.id}`); else { montrer(`Colis ${r.colis.code} créé · ${quiPaie} paiera à la remise`); aller(`/colis/suivi?colis=${r.colis.id}`); }
  }
  const sous = $derived(`colis ${fcfa(trajet ? prixEnvoi({ ...b, moto: false, assurance: false }, trajet) : TAILLES[b.taille].prix)}${b.moto ? ` + moto ${fcfa(SUPPLEMENT_MOTO)}` : ''}${b.assurance ? ` + assurance ${fcfa(SUPPLEMENT_ASSURANCE)}` : ''}${dep ? ` · arrive ${arriveeDepart(dep)}` : ''}`);
</script>

<Mobile titre="Envoyer un colis" sous={trajet?.covoitId ? `Yaoundé → Douala · covoiturage de ${trajet.heure}` : dep ? `Yaoundé → Douala · bus de ${dep.heure}` : 'Yaoundé → Douala'} retourVers="/" dock={dockVoyageur('voyager')}>
  {#snippet droite()}<a class="pl ac" href="/colis/suivi" onclick={(e) => { e.preventDefault(); aller('/colis/suivi'); }}>suivre</a>{/snippet}

  <div class="gl cadre">
    <div class="box" aria-hidden="true" onpointerdown={debut} onpointermove={bouge} onpointerup={fin} onpointercancel={fin}>
      <div class="tourne"><div class="cube" style="width: {cote[b.taille]}px; height: {cote[b.taille]}px; transform: rotateX({-24 + rx}deg) rotateY({36 + ry}deg)">
        {#each ['translateZ', 'rotateY(90deg) translateZ', 'rotateY(180deg) translateZ', 'rotateY(-90deg) translateZ', 'rotateX(90deg) translateZ', 'rotateX(-90deg) translateZ'] as t, i (i)}<i style="transform: {t}({cote[b.taille] / 2}px)">{#if i === 0}{b.taille}{/if}</i>{/each}
      </div></div>
    </div>
    <div class="seg2" role="group" aria-label="Taille du colis">
      {#each ['S', 'M', 'L'] as t (t)}<button type="button" class:on={b.taille === t} aria-pressed={b.taille === t} onclick={() => (b.taille = t as Taille)}>{nomTaille[t as Taille]}</button>{/each}
    </div>
  </div>

  <div class="fld">
    <label class="lab" for="dest-nom">Destinataire</label>
    {#if proches.length}
      <div class="chips" role="group" aria-label="Mes proches">
        {#each proches as p (p!.id)}<button type="button" class="ch" class:on={normaliserTel(b.tel) === p!.tel} aria-pressed={normaliserTel(b.tel) === p!.tel} onclick={() => remplir(p!.id)}><span class="av sm hot" aria-hidden="true">{p!.prenom[0]}</span>{p!.prenom} · {p!.ville ?? ''}</button>{/each}
      </div>
    {/if}
    <input id="dest-nom" class="inp" class:err={montrerNom} placeholder="Nom du destinataire (ex. Maman)" autocomplete="off" maxlength="60" bind:value={b.nom} onblur={() => (tNom = true)} aria-invalid={!!montrerNom} aria-describedby={montrerNom ? 'e-nom' : undefined} />
    {#if montrerNom}<span id="e-nom" class="t12 erc" role="alert">{erreurs.nom}</span>{/if}
    <input id="dest-tel" class="inp" class:err={montrerTel} type="tel" inputmode="tel" placeholder="Téléphone (ex. 6 77 10 22 33)" autocomplete="off" bind:value={b.tel} onblur={() => (tTel = true)} aria-invalid={!!montrerTel} aria-describedby={montrerTel ? 'e-tel' : undefined} />
    {#if montrerTel}<span id="e-tel" class="t12 erc" role="alert">{erreurs.tel}</span>
    {:else if normaliserTel(b.tel)}<span class="t12 okc">{formaterTel(normaliserTel(b.tel)!)} · numéro valide</span>{/if}
  </div>

  <span class="lab">Remise à l’arrivée</span>
  <button type="button" class="opt" class:on={!b.moto} aria-pressed={!b.moto} onclick={() => (b.moto = false)}>
    <span class="bub aq"><Pic nom="maison" /></span>
    <span class="col grow"><span class="t15 b7">Point relais{choisi ? ` · ${choisi.boutique.nom}` : ''}</span><span class="t12 mut">{choisi ? `${choisi.boutique.adresse}, ${formaterDistance(choisi.distance)} de la gare · ${libelleHoraires(choisi.boutique)}` : 'Choisis un relais ci-dessous'}</span></span>
    <span class="t14 b7">+0 F</span>
  </button>
  <button type="button" class="opt" class:on={b.moto} aria-pressed={b.moto} onclick={() => (b.moto = true)}>
    <span class="bub"><Pic nom="moto" /></span>
    <span class="col grow"><span class="t15 b7">Livraison moto chez {b.nom.trim() ? prenom : 'lui / elle'}</span><span class="t12 mut">{b.moto ? b.quartier : 'à domicile'} · dans l’heure après l’arrivée</span></span>
    <span class="t14 b7">+{fcfa(SUPPLEMENT_MOTO)} F</span>
  </button>
  {#if b.moto}
    <div class="fld"><label class="lab" for="quartier">Quartier de livraison</label>
      <select id="quartier" class="inp" bind:value={b.quartier}>{#each QUARTIERS as q (q.nom)}<option value={q.nom}>{q.nom} · {q.km} km</option>{/each}</select>
    </div>
  {/if}

  <div class="fld" id="zone-relais" tabindex="-1">
    <div class="row sp"><span class="lab" id="lab-relais">Relais d’arrivée</span><a class="t13 aq" href="/relais" onclick={(e) => { e.preventDefault(); aller('/relais'); }}>voir la carte</a></div>
    <div class="chips" role="radiogroup" aria-labelledby="lab-relais">
      {#each liste as r (r.personne.id)}
        <button type="button" role="radio" aria-checked={choisi?.personne.id === r.personne.id} class="ch" class:on={choisi?.personne.id === r.personne.id} onclick={() => choisirRelais(r.personne.id)}>{r.boutique.nom} · {formaterDistance(r.distance)}{#if !r.ouverture.ouvert}<span class="pl er">{r.ouverture.libelle}</span>{/if}</button>
      {:else}<span class="t13 erc" role="alert">Aucun point relais actif pour l’instant.</span>{/each}
    </div>
    {#if erreursServeur.relais || (essaye && erreurs.relais)}<span class="t12 erc" role="alert">{erreurs.relais}</span>{/if}
    {#if choisi && !choisi.ouverture.ouvert}<span class="t12 wac">Ce relais est fermé en ce moment : le colis sera retiré à son ouverture.</span>{/if}
  </div>

  <div class="gl col" style="gap: 0">
    <div class="li"><span class="col grow"><span class="t14 b6" id="l-ass">Assurance jusqu’à 50 000 F</span><span class="t12 mut">+{SUPPLEMENT_ASSURANCE} F</span></span><button type="button" role="switch" aria-checked={b.assurance} aria-labelledby="l-ass" class="sw" class:on={b.assurance} onclick={() => (b.assurance = !b.assurance)}></button></div>
    <div class="li"><span class="col grow"><span class="t14 b6" id="l-cod">Le destinataire paie</span><span class="t12 mut">{b.cod ? `${prenom} règle ${fcfa(total)} F à la remise · rien à payer maintenant` : 'contre-remboursement : tu ne paies rien à l’envoi'}</span></span><button type="button" role="switch" aria-checked={b.cod} aria-labelledby="l-cod" class="sw" class:on={b.cod} onclick={() => (b.cod = !b.cod)}></button></div>
  </div>

  <div class="sheet">
    <div class="row sp">
      <span class="col"><span class="lab">Total</span><span class="ttl t24" aria-live="polite">{fcfa(total)} F</span><span class="t13 mut">{sous}</span></span>
      <span class="ringp" style="--p: 100%"><span class="t12 b7">AM-C</span></span>
    </div>
    {#if app.session.hors_ligne}<span class="t12 wac" role="status">Hors ligne : reconnecte-toi pour créer le colis.</span>{/if}
    <button type="button" class="b p" onclick={valider} disabled={envoi} aria-disabled={envoi}>{b.cod ? `Créer le colis · ${prenom} paie ${fcfa(total)} F` : `Payer ${fcfa(total)} F et déposer au guichet`}</button>
  </div>
</Mobile>

<style>
  .cadre { padding: 8px 14px; flex: none; } .cadre :global(.seg2 button) { padding: 0 4px; font-size: 13px; white-space: nowrap; }
  .box { position: relative; height: 150px; perspective: 600px; display: grid; place-items: center; touch-action: pan-y; cursor: grab; }
  .tourne { transform-style: preserve-3d; animation: tour 14s linear infinite; }
  .cube { position: relative; transform-style: preserve-3d; transition: width 0.3s, height 0.3s; }
  .cube i { position: absolute; inset: 0; border: 1px solid rgba(255, 255, 255, 0.35); background: linear-gradient(135deg, rgba(139, 124, 255, 0.35), rgba(61, 224, 255, 0.2)); backdrop-filter: blur(2px); display: grid; place-items: center; font: 700 22px 'Unbounded Variable', 'Unbounded', sans-serif; font-style: normal; color: rgba(255, 255, 255, 0.85); transition: transform 0.3s; }
  @keyframes tour { to { transform: rotateY(360deg); } }
  .opt { flex: none; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-radius: 18px; border: 1px solid rgba(255, 255, 255, 0.12); background: rgba(255, 255, 255, 0.06); color: #f2f4ff; cursor: pointer; font: inherit; text-align: left; width: 100%; min-height: 60px; }
  .opt.on { background: linear-gradient(135deg, rgba(139, 124, 255, 0.25), rgba(61, 224, 255, 0.15)); border-color: #8b7cff; }
  .t15 { font-size: 15px; }
  .inp.err { border-color: #ff6b6b; }
  select.inp { appearance: none; }
  button:disabled { opacity: 0.6; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, #zone-relais:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
