<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Feuille from '../../ui/Feuille.svelte';
  import Icone from '../../ui/Icone.svelte';
  import Pastille from '../../ui/Pastille.svelte';
  import { aller } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { NIVEAUX, DESCRIPTION_NIVEAU, SEUILS_NIVEAU, niveauDuScore } from '../../core/credit.ts';
  import { pointsPourNiveau, prochainNiveau, SCORE_MAX } from '../../core/score.ts';
  import { fractionJauge, gainDuMois } from '../../core/scoreHistorique.ts';
  import { quand } from '../../core/dates.ts';
  import { couleurSignal, fourchette, ORDRE_SIGNAUX, paliers, pctPoids, signal, texteSignal, valeurSignal } from './affichage.ts';
  import { synchroniserScore } from './actions.ts';
  import { etatScore } from './etat.ts';

  synchroniserScore(); // aligne la courbe sur le mois en cours
  const valeur = $derived(app.score.valeur);
  const niveau = $derived(niveauDuScore(valeur));
  const suivant = $derived(prochainNiveau(valeur));
  const gain = $derived(gainDuMois(app.score.historique));
  const manque = $derived(suivant ? pointsPourNiveau(valeur, suivant) : 0);
  let choisi = $state<number | null>(null);
  const tier = $derived(NIVEAUX[choisi ?? NIVEAUX.indexOf(niveau)]);
  let ouvert = $state<string | null>(null);
  let feuille = $state<string | null>(null);
  const liste = $derived(paliers(niveau));
  const verrou = $derived(liste.find((p) => p.id === feuille));
  const journal = etatScore();
  const evenements = $derived(journal.evenements.slice(0, 5));
  const casse = (n: string) => n[0] + n.slice(1).toLowerCase();

  // Jauge en demi-cercle : centre (130, 135), rayon 110.
  const f = $derived(fractionJauge(valeur));
  const bout = $derived({ x: 130 + 110 * Math.cos(Math.PI * (1 - f)), y: 135 - 110 * Math.sin(Math.PI * (1 - f)) });
  const arc = $derived(f <= 0 ? '' : `M20 135 A110 110 0 0 1 ${bout.x.toFixed(1)} ${bout.y.toFixed(1)}`);
  const ouvrirPalier = (p: { id: string; href: string; min: string }) => { if (NIVEAUX.indexOf(niveau) >= NIVEAUX.indexOf(p.min as typeof niveau)) aller(p.href); else feuille = p.id; };
</script>

<Ecran titre="AssureScore" sansRetour>
  {#snippet droite()}<a class="carte-lien" href="/score/carte" onclick={(e) => { e.preventDefault(); aller('/score/carte'); }}>Ma carte</a>{/snippet}

  <div class="jauge">
    <svg role="img" aria-label="Score {valeur} sur {SCORE_MAX}, niveau {niveau}" width="260" height="150" viewBox="0 0 260 150" fill="none">
      <path d="M20 135 A110 110 0 0 1 240 135" stroke="var(--carte2)" stroke-width="14" stroke-linecap="round" />
      {#if arc}<path d={arc} stroke="var(--primaire)" stroke-width="14" stroke-linecap="round" />{/if}
      <circle cx={bout.x} cy={bout.y} r="9" fill="var(--fond)" stroke="var(--primaire-clair)" stroke-width="3" />
    </svg>
    <div class="centre"><span class="mono n" aria-hidden="true">{valeur}</span><span class="mono sur">SUR {SCORE_MAX}</span></div>
  </div>
  <div class="ligne-niveau">
    <Pastille ton="primaire">{niveau}</Pastille>
    <span class="muted">
      {#if gain !== null}<b class:bon={gain >= 0} class:danger={gain < 0}>{gain >= 0 ? '+' : '−'}{Math.abs(gain)}</b> ce mois{:else}Nouveau score{/if}
      · {suivant ? `${casse(suivant)} dès ${SEUILS_NIVEAU[suivant]}` : 'Niveau maximum'}
    </span>
  </div>

  <div class="niveaux" role="group" aria-label="Niveaux">
    {#each NIVEAUX as n, i (n)}
      <button class="tier" class:courant={tier === n} aria-label="Niveau {n}" aria-pressed={tier === n} onclick={() => (choisi = i)}>
        <i class:rempli={i <= NIVEAUX.indexOf(niveau)} class:lueur={n === niveau}></i><span>{n}</span>
      </button>
    {/each}
  </div>
  <p class="detail-niveau"><b class="mono">{tier} · {fourchette(tier)}</b><br />{DESCRIPTION_NIVEAU[tier]}{tier === niveau ? " C'est votre niveau." : ''}</p>

  <section aria-labelledby="h-comp">
    <div class="titre-sec"><h2 id="h-comp">Ce qui compose le score</h2><small class="mono">5 SIGNAUX · TOUCHER</small></div>
    <Carte>
      <ul class="signaux">
        {#each ORDRE_SIGNAUX as k (k)}
          <li>
            <button class="sig" aria-expanded={ouvert === k} onclick={() => (ouvert = ouvert === k ? null : k)}>
              <span class="tete"><span class="nom">{k === 'ponctualite' ? "Paiements à l'heure" : k === 'anciennete' ? 'Ancienneté salariale' : k === 'epargne' ? 'Épargne régulière' : k === 'endettement' ? "Taux d'endettement" : 'Dossier vérifié'}</span><span class="mono val">{valeurSignal(k)}</span><span class="chev" class:tourne={ouvert === k}><Icone nom="suivant" taille={14} trait={2.2} /></span></span>
              <span class="piste" role="progressbar" aria-label="{k}" aria-valuenow={signal(k)} aria-valuemin="0" aria-valuemax="100"><i style:width="{signal(k)}%" style:background={couleurSignal(signal(k))}></i></span>
              <span class="poids mono">POIDS {pctPoids(k)} %</span>
            </button>
            {#if ouvert === k}<p class="expl">{texteSignal(k)}</p>{/if}
          </li>
        {/each}
      </ul>
    </Carte>
  </section>

  {#if evenements.length}
    <section aria-labelledby="h-ev">
      <div class="titre-sec"><h2 id="h-ev">Derniers événements</h2></div>
      <Carte>
        <ul class="evts">{#each evenements as e (e.id)}<li><span>{e.motif}<small>{quand(e.ts, maintenant())}</small></span><b class="mono" class:bon={e.delta > 0} class:danger={e.delta < 0}>{e.delta > 0 ? '+' : '−'}{Math.abs(e.delta)}</b></li>{/each}</ul>
      </Carte>
    </section>
  {/if}

  <section aria-labelledby="h-deb">
    <div class="titre-sec"><h2 id="h-deb">Débloqué à votre niveau</h2></div>
    <Carte>
      <ul class="paliers">
        {#each liste as p (p.id)}
          {@const ok = NIVEAUX.indexOf(niveau) >= NIVEAUX.indexOf(p.min)}
          <li><button onclick={() => ouvrirPalier(p)} aria-label="{p.nom} : {ok ? p.valeur : `se débloque au niveau ${p.min}`}">
            <span class="ic" class:ok><Icone nom={ok ? 'ok' : 'verrou'} taille={16} trait={2.4} /></span>
            <span class="pn">{p.nom}</span>
            {#if ok}<span class="mono pv">{p.valeur}</span>{:else}<Pastille ton="neutre">{p.min}</Pastille>{/if}
            <Icone nom="suivant" taille={14} trait={2.2} />
          </button></li>
        {/each}
      </ul>
    </Carte>
  </section>

  <Bouton href="/score/conseils">{suivant ? `Gagner ${manque} points` : 'Voir les conseils'}<Icone nom="fleche" taille={18} trait={2.2} /></Bouton>
  <div class="espace"></div>
</Ecran>

<Feuille bind:ouverte={() => feuille !== null, (v) => { if (!v) feuille = null; }} titre={verrou ? verrou.nom : ''} sous="Niveau {verrou?.min ?? ''}">
  {#if verrou}
    {@const requis = SEUILS_NIVEAU[verrou.min]}
    <p class="muted">Se débloque au niveau {verrou.min}, à partir de {requis} points. Il vous manque {pointsPourNiveau(valeur, verrou.min)} points.</p>
    <div class="lignes">
      <div><span class="muted">Score actuel</span><b class="mono">{valeur}</b></div>
      <div><span class="muted">Score requis</span><b class="mono">{requis}</b></div>
    </div>
    <Bouton onclick={() => { feuille = null; aller('/score/conseils'); }}>Voir comment gagner {pointsPourNiveau(valeur, verrou.min)} points</Bouton>
    <Bouton variante="discret" onclick={() => (feuille = null)}>Fermer</Bouton>
  {/if}
</Feuille>

<style>
  .carte-lien { min-height: 44px; display: inline-flex; align-items: center; color: var(--primaire-clair); font-weight: 600; font-size: 14px; white-space: nowrap; margin-right: 4px; }
  .jauge { position: relative; width: 260px; height: 150px; margin: 6px auto 0; } .jauge svg { display: block; }
  .centre { position: absolute; inset: auto 0 0; display: flex; flex-direction: column; align-items: center; gap: 2px; } .n { font-size: 56px; line-height: 1; font-weight: 500; letter-spacing: -0.04em; } .sur { font-size: 11px; letter-spacing: 0.12em; color: var(--muted); }
  .ligne-niveau { display: flex; align-items: center; justify-content: center; gap: 10px; font-size: 13px; } .bon { color: var(--bon); } .danger { color: var(--danger); } .ligne-niveau b { font-weight: 600; }
  .niveaux { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; } .tier { min-height: 44px; display: flex; flex-direction: column; gap: 6px; align-items: stretch; padding-top: 4px; font: 600 11px var(--mono); letter-spacing: 0.08em; color: var(--muted); text-align: center; } .tier.courant { color: var(--texte); }
  .tier i { height: 6px; border-radius: 3px; background: var(--ligne-forte); } .tier i.rempli { background: var(--primaire); } .tier i.lueur { box-shadow: 0 0 12px rgba(48, 80, 255, 0.9); }
  .detail-niveau { font-size: 13.5px; color: var(--doux); } .detail-niveau b { font-size: 12px; letter-spacing: 0.06em; color: var(--texte); font-weight: 500; }
  .titre-sec { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; } h2 { font-size: 16px; font-weight: 650; } small.mono { font-size: 10px; letter-spacing: 0.1em; color: var(--muted); }
  ul { list-style: none; } .signaux li { border-bottom: 1px solid var(--ligne); } .signaux li:last-child { border: 0; }
  .sig { width: 100%; text-align: left; padding: 12px 0; min-height: 44px; display: flex; flex-direction: column; gap: 8px; }
  .tete { display: flex; align-items: center; gap: 8px; } .nom { flex: 1; font-weight: 550; font-size: 14.5px; } .val { font-size: 13px; color: var(--doux); } .chev { color: var(--muted); display: inline-flex; transition: transform 0.2s; } .chev.tourne { transform: rotate(90deg); }
  .piste { display: block; height: 6px; border-radius: 3px; background: var(--ligne); overflow: hidden; } .piste i { display: block; height: 100%; border-radius: 3px; transition: width 0.5s; } .poids { font-size: 10px; letter-spacing: 0.1em; color: var(--faint); }
  .expl { font-size: 13px; color: var(--doux); padding: 0 0 12px; }
  .evts li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 9px 0; border-bottom: 1px solid var(--ligne); font-size: 14px; } .evts li:last-child { border: 0; } .evts small { display: block; color: var(--muted); font-size: 12px; } .evts b { font-weight: 600; }
  .paliers button { width: 100%; min-height: 52px; display: flex; align-items: center; gap: 12px; text-align: left; color: var(--muted); } .paliers li { border-bottom: 1px solid var(--ligne); } .paliers li:last-child { border: 0; }
  .ic { width: 28px; height: 28px; border-radius: 14px; display: grid; place-items: center; background: var(--carte2); } .ic.ok { color: var(--bon); background: rgba(61, 213, 152, 0.14); } .pn { flex: 1; color: var(--doux); font-weight: 500; } .pv { color: var(--texte); font-weight: 500; font-size: 14px; }
  .lignes { background: var(--carte2); border-radius: 14px; padding: 4px 14px; } .lignes div { display: flex; justify-content: space-between; padding: 11px 0; border-bottom: 1px solid var(--ligne); } .lignes div:last-child { border: 0; }
  .espace { height: 86px; }
</style>
