<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { param } from '../../router.svelte.ts';
  import { fcfa } from '../../core/money.ts';
  import { estAtteint, montantAuto } from '../../core/coffres.ts';
  import { jourCourt } from '../../core/dates.ts';
  import { TAUX_COFFRE, pctCoffre } from '../../core/epargne.ts';
  import { coffres, etatCoffres, totalEpargne, type Coffre } from './etat.ts';
  import { accentDe, etaObjectif, jourPaieMembre, partMembre, prochaineDatePaie, sousTitre } from './affichage.ts';
  import PileCartes from './PileCartes.svelte';
  import FeuilleVerser from './FeuilleVerser.svelte';

  etatCoffres(); // crée la tranche (écriture) avant toute lecture réactive
  const liste = $derived(coffres());
  const demande = param('c');
  let courant = $state(Math.max(0, coffres().findIndex((c) => c.id === demande)));
  const cur = $derived(liste[Math.min(courant, liste.length - 1)]);
  let verser = $state(false);
  const entrees = $derived(liste.reduce((t, c) => t + (c.auto ? montantAuto(c.epargne, c.objectif, c.mensuel) : 0), 0));

  const note = (c: Coffre) => estAtteint(c.epargne, c.objectif) ? 'Objectif atteint : coffre débloqué' : !c.auto ? 'Versement automatique suspendu'
    : c.partage ? `Chacun verse ${fcfa(partMembre(c))}, retrait notifié à tous` : `Prochain versement le ${jourCourt(prochaineDatePaie())}`;
</script>

<Ecran titre="Coffres" sur="{liste.length} coffre{liste.length > 1 ? 's' : ''} · {(TAUX_COFFRE * 100).toLocaleString('fr-FR')} % / an" sansRetour>
  {#if liste.length === 0}
    <div class="vide">
      <span class="ico"><Icone nom="coffre" taille={34} /></span>
      <h2>Aucun coffre pour l'instant</h2>
      <p class="muted">Mettez de côté pour la rentrée, une voiture, un mariage… Le versement part tout seul le jour de paie et rapporte {(TAUX_COFFRE * 100).toLocaleString('fr-FR')} % par an.</p>
      <Bouton href="/coffres/nouveau">Créer mon premier coffre</Bouton>
    </div>
  {:else if cur}
    <div class="halo" aria-hidden="true" style:background="radial-gradient(closest-side, {accentDe(cur.genre).glow}, transparent)"></div>
    <div class="total">
      <div><small class="mono">ÉPARGNE TOTALE</small><strong class="mono">{fcfa(totalEpargne())} <em>FCFA</em></strong></div>
      {#if entrees > 0}<span class="mono bon">+{fcfa(entrees)} le {jourPaieMembre()}</span>{/if}
    </div>

    <PileCartes items={liste} bind:courant hauteur={286} libelle="Vos coffres">
      {#snippet carte(c: Coffre)}
        {@const pct = pctCoffre(c.epargne, c.objectif)}
        {@const a = accentDe(c.genre)}
        <article class="cof" style:--glow={a.glow} style:--accent={a.accent} aria-label="Coffre {c.nom}">
          <div class="haut">
            <div><span class="mono kind">{sousTitre(c)}</span><h2>{c.nom}</h2></div>
            <span class="mono pct">{pct} %</span>
          </div>
          <div class="mid">
            <div class="sommes"><span class="mono grand">{fcfa(c.epargne)}</span><span class="mono">/ {fcfa(c.objectif)}</span></div>
            <div class="barre" role="progressbar" aria-label="Progression du coffre {c.nom}" aria-valuenow={pct} aria-valuemin="0" aria-valuemax="100"><i style:width="{pct}%"></i></div>
          </div>
          <div class="deux">
            <div><span>Versement auto, le {jourPaieMembre()}</span><b class="mono">{c.auto ? `${fcfa(c.mensuel)} / mois` : 'Suspendu'}</b></div>
            <div><span>Objectif atteint</span><b class="mono">{etaObjectif(c)}</b></div>
          </div>
          <div class="pied"><span class="note"><Icone nom="ok" taille={14} trait={2.4} />{note(c)}</span><a href="/coffres/{c.id}" class="voir" aria-label="Détail du coffre {c.nom}">Détail<Icone nom="suivant" taille={14} trait={2.2} /></a></div>
        </article>
      {/snippet}
    </PileCartes>

    <p class="aide mono" aria-hidden="true">← GLISSEZ POUR CHANGER DE COFFRE →</p>
    <div class="actions">
      <button class="rond" onclick={() => (courant = (courant - 1 + liste.length) % liste.length)} aria-label="Coffre précédent" disabled={liste.length < 2}><Icone nom="retour" taille={18} trait={2.2} /></button>
      <button class="verser" onclick={() => (verser = true)} disabled={estAtteint(cur.epargne, cur.objectif)}>{estAtteint(cur.epargne, cur.objectif) ? 'Objectif atteint' : `Verser maintenant dans ${cur.nom}`}</button>
      <button class="rond" onclick={() => (courant = (courant + 1) % liste.length)} aria-label="Coffre suivant" disabled={liste.length < 2}><Icone nom="suivant" taille={18} trait={2.2} /></button>
    </div>
    <p class="regle"><Icone nom="verrou" taille={16} /><span>Bloqué jusqu'à l'objectif. En urgence : un retrait sans frais par an, ensuite 2 % de frais.</span></p>
    <Bouton variante="secondaire" href="/coffres/nouveau"><Icone nom="plus" taille={18} trait={2.2} />Créer un coffre</Bouton>
    <FeuilleVerser bind:ouverte={verser} coffreId={cur.id} />
  {/if}
  <div class="espace"></div>
</Ecran>

<style>
  .halo { position: absolute; top: 90px; left: 50%; width: 440px; height: 440px; margin-left: -220px; opacity: 0.45; pointer-events: none; transition: opacity 0.4s; z-index: -1; }
  .total { display: flex; justify-content: space-between; align-items: baseline; padding: 0 2px; margin-bottom: 10px; }
  .total small { display: block; font-size: 10px; letter-spacing: 0.1em; color: var(--muted); }
  .total strong { font-size: 30px; font-weight: 500; letter-spacing: -0.03em; } .total em { font-style: normal; font-size: 13px; color: var(--muted); } .bon { font-size: 12px; color: var(--bon); }
  .cof { height: 100%; border-radius: 26px; padding: 22px; display: flex; flex-direction: column; gap: 14px; overflow: hidden; border: 1px solid var(--ligne-forte); box-shadow: 0 30px 60px -28px var(--glow); color: #f3f5fa;
    background-color: #0f1733; background-image: linear-gradient(135deg, var(--glow), transparent 62%), linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px); background-size: auto, 28px 28px, 28px 28px; }
  .haut { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; } .kind { display: block; font-size: 10px; letter-spacing: 0.12em; color: #c9d2ff; margin-bottom: 4px; }
  h2 { font-size: 24px; font-weight: 600; letter-spacing: -0.03em; } .pct { font-size: 12px; padding: 6px 10px; border-radius: 99px; background: rgba(255, 255, 255, 0.1); border: 1px solid rgba(255, 255, 255, 0.14); }
  .mid { display: flex; flex-direction: column; gap: 8px; } .sommes { display: flex; justify-content: space-between; align-items: baseline; color: #c9d2ff; font-size: 13px; } .grand { font-size: 34px; font-weight: 500; letter-spacing: -0.03em; color: #f3f5fa; }
  .barre { height: 8px; border-radius: 4px; background: rgba(255, 255, 255, 0.14); overflow: hidden; } .barre i { display: block; height: 8px; border-radius: 4px; background: var(--accent); box-shadow: 0 0 18px var(--accent); transition: width 0.5s; }
  .deux { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; } .deux div { display: flex; flex-direction: column; gap: 2px; } .deux span { font-size: 11px; color: #c9d2ff; } .deux b { font-size: 15px; font-weight: 500; }
  .pied { margin-top: auto; display: flex; justify-content: space-between; align-items: center; gap: 8px; font-size: 12px; color: #c9d2ff; }
  .note { display: flex; align-items: center; gap: 6px; min-width: 0; } .voir { display: inline-flex; align-items: center; gap: 2px; min-height: 44px; padding: 0 4px 0 10px; margin: -12px -6px -12px 0; color: #f3f5fa; font-weight: 600; flex: none; }
  .aide { text-align: center; font-size: 10px; letter-spacing: 0.1em; color: var(--faint); margin-top: 6px; }
  .actions { display: grid; grid-template-columns: 52px 1fr 52px; gap: 10px; }
  .rond, .verser { height: 52px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; } .verser { border-color: var(--ligne-forte); font-weight: 500; font-size: 14px; padding: 0 8px; }
  button:disabled { opacity: 0.45; cursor: default; }
  .regle { display: flex; gap: 10px; align-items: flex-start; padding: 12px 14px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); color: var(--muted); font-size: 12.5px; } .regle :global(svg) { flex: none; margin-top: 1px; }
  .vide { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 14px; padding: 48px 8px 8px; } .vide h2 { font-size: 20px; } .vide p { max-width: 320px; }
  .ico { width: 72px; height: 72px; border-radius: 24px; display: grid; place-items: center; background: var(--primaire-fond); color: var(--pale); }
  .espace { height: 86px; }
</style>
