<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant, nouvelId } from '../../data/store.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { niveauDuScore } from '../../core/credit.ts';
  import { NOM_SIGNAL, pointsPourNiveau, prochainNiveau, SCORE_MAX } from '../../core/score.ts';
  import { gainDuMois, hauteurBarreScore } from '../../core/scoreHistorique.ts';
  import { jourDe, jourSemaineCourt, heure, moisAnnee } from '../../core/dates.ts';
  import { couleurSignal, ORDRE_SIGNAUX, pctPoids, signal, valeurSignal } from './affichage.ts';
  import { synchroniserScore } from './actions.ts';

  synchroniserScore();
  const valeur = $derived(app.score.valeur);
  const niveau = $derived(niveauDuScore(valeur));
  const suivant = $derived(prochainNiveau(valeur));
  const histo = $derived(app.score.historique);
  const gain = $derived(gainDuMois(histo));
  const depuis = $derived(histo.length > 1 ? histo[histo.length - 1].valeur - histo[0].valeur : null);
  const membre = $derived(app.compte ? `AM ${app.compte.numeroMembre.replace(/^AM/, '')} ···· ${app.compte.telephone.slice(-4)}` : 'AM ···· ····');
  const depuisLe = $derived(app.compte ? moisAnnee(jourDe(new Date(app.compte.cree))) : '');

  // Retournement : clic, touche, ou glissement latéral (la carte suit le doigt puis se cale sur le côté le plus proche).
  let angle = $state(0); let dx = $state(0); let glisse = $state(false); let debutX = 0;
  const total = $derived(angle + (glisse ? dx * 0.6 : 0));
  const verso = $derived(Math.abs(Math.round(angle / 180)) % 2 === 1);
  function bas(e: PointerEvent) { glisse = true; debutX = e.clientX; dx = 0; try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch { /* ignoré */ } }
  function deplace(e: PointerEvent) { if (glisse) dx = e.clientX - debutX; }
  function haut() {
    if (!glisse) return; glisse = false;
    angle = Math.abs(dx) < 6 ? angle + 180 : Math.round((angle + dx * 0.6) / 180) * 180; dx = 0;
  }
  const retourner = () => { angle += 180; dx = 0; glisse = false; };

  let partage = $state(false); let lien = $state('');
  function creerLien() {
    const fin = maintenant() + 48 * 3600_000;
    lien = `AS-${nouvelId('k').replace(/[^a-z0-9]/gi, '').slice(-8).toUpperCase()}`;
    try { void navigator.clipboard?.writeText(lien); } catch { /* presse-papiers indisponible */ }
    expire = `${jourSemaineCourt(jourDe(new Date(fin)))} à ${heure(fin)}`;
    montrer('Lien créé, valable 48 h');
  }
  let expire = $state('');
</script>

<Ecran titre="Ma carte" sur={verso ? 'Verso · comment le score est calculé' : 'Recto · votre carte à partager'} retourVers="/score">
  <div class="scene">
    <div class="carte" role="button" tabindex="-1" aria-label="Carte AssureScore, touchez pour la retourner" style:transform="rotateY({total.toFixed(1)}deg)" style:transition={glisse ? 'none' : 'transform 0.6s cubic-bezier(0.3, 0.8, 0.2, 1)'} style:cursor={glisse ? 'grabbing' : 'grab'}
      onpointerdown={bas} onpointermove={deplace} onpointerup={haut} onpointercancel={haut}>
      <div class="face recto" inert={verso} aria-hidden={verso}>
        <div class="marque"><span class="logo"><Icone nom="protection" taille={18} /></span><b>Assure<span>Score</span></b><em class="mono">NIVEAU {niveau}</em></div>
        <div class="grand"><span class="mono n">{valeur}</span><span class="mono sous">SUR {SCORE_MAX}{gain !== null ? ` · ${gain >= 0 ? '+' : '−'}${Math.abs(gain)} CE MOIS` : ''}</span></div>
        <div class="bas mono"><span>{membre}</span><span>Membre depuis {depuisLe}</span></div>
      </div>
      <div class="face verso" inert={!verso} aria-hidden={!verso}>
        <div class="entete mono"><span>CE QUI COMPTE DANS VOTRE {valeur}</span><span>POIDS</span></div>
        <ul>{#each ORDRE_SIGNAUX as k (k)}
          <li><div><span>{NOM_SIGNAL[k]}</span><span class="mono">{valeurSignal(k)} · {pctPoids(k)} %</span></div><i><u style:width="{signal(k)}%" style:background={couleurSignal(signal(k))}></u></i></li>
        {/each}</ul>
      </div>
    </div>
  </div>
  <p class="aide mono" aria-hidden="true">TOUCHEZ OU GLISSEZ LA CARTE POUR LA RETOURNER</p>
  <Bouton variante="secondaire" onclick={retourner}><Icone nom="historique" taille={18} />{verso ? 'Retourner : voir la carte' : "Retourner : comment c'est calculé"}</Bouton>

  <section aria-labelledby="h-6m">
    <div class="titre"><h2 id="h-6m">{histo.length} dernier{histo.length > 1 ? 's' : ''} mois</h2>{#if depuis !== null}<span class="mono" class:bon={depuis >= 0} class:danger={depuis < 0}>{depuis >= 0 ? '+' : '−'}{Math.abs(depuis)} depuis {histo[0].mois.replace('.', '')}</span>{/if}</div>
    <ul class="barres">{#each histo as h, i (h.mois + i)}
      <li class:dernier={i === histo.length - 1}><span class="mono v">{h.valeur}</span><i style:height="{hauteurBarreScore(h.valeur)}px"></i><span class="mono l">{h.mois.replace('.', '').toUpperCase()}</span></li>
    {/each}</ul>
  </section>

  <button class="partager" onclick={() => { lien = ''; partage = true; }}>
    <Icone nom="document" taille={20} />
    <span><b>Partager ma carte</b><small>À un bailleur ou un vendeur · lien 48 h · sans montrer vos revenus</small></span>
    <Icone nom="suivant" taille={14} trait={2.2} />
  </button>
  <Bouton href="/score/conseils">{suivant ? `Passer ${suivant[0] + suivant.slice(1).toLowerCase()} : ${pointsPourNiveau(valeur, suivant)} points` : 'Voir les conseils'}<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  <div class="espace"></div>
</Ecran>

<Feuille bind:ouverte={partage} titre="Partager ma carte" sous="Lien 48 h">
  <p class="muted">Le destinataire voit votre niveau ({niveau}), votre score ({valeur}) et la note de chaque signal. Jamais vos revenus, votre solde ni vos coffres.</p>
  {#if lien}
    <div class="lien" role="status"><span class="muted">Code de partage</span><b class="mono">{lien}</b><span class="muted">Expire {expire}</span></div>
    <Bouton variante="secondaire" onclick={() => { partage = false; aller('/score'); }}>Terminé</Bouton>
  {:else}
    <Bouton onclick={creerLien}>Créer le lien (48 h)</Bouton>
    <Bouton variante="discret" onclick={() => (partage = false)}>Annuler</Bouton>
  {/if}
</Feuille>

<style>
  .scene { perspective: 1100px; } .carte { position: relative; height: 230px; transform-style: preserve-3d; touch-action: pan-y; user-select: none; }
  .face { position: absolute; inset: 0; backface-visibility: hidden; -webkit-backface-visibility: hidden; border-radius: 24px; padding: 20px; display: flex; flex-direction: column; justify-content: space-between; border: 1px solid rgba(124, 147, 255, 0.4); color: #f3f5fa; box-shadow: 0 28px 60px -30px rgba(48, 80, 255, 0.7);
    background-color: #0f1733; background-image: linear-gradient(135deg, rgba(48, 80, 255, 0.55), transparent 65%), linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px); background-size: auto, 28px 28px, 28px 28px; }
  .verso { transform: rotateY(180deg); justify-content: flex-start; gap: 16px; }
  .marque { display: flex; align-items: center; gap: 8px; } .logo { width: 28px; height: 28px; border-radius: 9px; display: grid; place-items: center; background: var(--primaire); } .marque b { font-size: 17px; font-weight: 600; letter-spacing: -0.02em; flex: 1; } .marque span { color: #a3b3ff; font-weight: 500; } .marque em { font-style: normal; font-size: 10.5px; letter-spacing: 0.1em; padding: 5px 10px; border-radius: 99px; background: rgba(255, 255, 255, 0.12); }
  .grand { display: flex; flex-direction: column; gap: 4px; } .n { font-size: 66px; line-height: 1; font-weight: 500; letter-spacing: -0.04em; } .sous { font-size: 11px; letter-spacing: 0.1em; color: #c9d2ff; }
  .bas { display: flex; justify-content: space-between; font-size: 11px; color: #c9d2ff; letter-spacing: 0.04em; flex-wrap: wrap; gap: 4px; }
  .entete { display: flex; justify-content: space-between; font-size: 10px; letter-spacing: 0.1em; color: #c9d2ff; gap: 8px; }
  .verso ul { list-style: none; display: flex; flex-direction: column; gap: 11px; } .verso li div { display: flex; justify-content: space-between; font-size: 13px; gap: 8px; margin-bottom: 5px; } .verso li div .mono { font-size: 11.5px; color: #c9d2ff; text-align: right; }
  .verso i { display: block; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.14); overflow: hidden; } .verso u { display: block; height: 100%; border-radius: 3px; }
  .aide { text-align: center; font-size: 10px; letter-spacing: 0.1em; color: var(--faint); }
  .titre { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; } h2 { font-size: 16px; font-weight: 650; } .titre .mono { font-size: 12.5px; } .bon { color: var(--bon); } .danger { color: var(--danger); }
  .barres { list-style: none; display: grid; grid-template-columns: repeat(6, 1fr); gap: 8px; align-items: end; background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 14px 12px 10px; }
  .barres li { display: flex; flex-direction: column; align-items: center; gap: 6px; justify-content: flex-end; } .barres i { width: 100%; max-width: 34px; border-radius: 6px; background: var(--carte2); border: 1px solid var(--ligne); } .barres .dernier i { background: var(--primaire); border-color: var(--primaire); }
  .v { font-size: 11px; color: var(--muted); } .l { font-size: 10px; color: var(--faint); letter-spacing: 0.06em; } .dernier .v, .dernier .l { color: var(--texte); }
  .partager { display: flex; align-items: center; gap: 12px; text-align: left; min-height: 64px; padding: 12px 16px; border-radius: 18px; background: var(--carte); border: 1px solid var(--ligne); } .partager span { flex: 1; display: flex; flex-direction: column; gap: 2px; } .partager small { color: var(--muted); font-size: 12.5px; }
  .lien { display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: 14px; background: var(--carte2); align-items: center; } .lien b { font-size: 22px; letter-spacing: 0.08em; }
  .espace { height: 86px; }
</style>
