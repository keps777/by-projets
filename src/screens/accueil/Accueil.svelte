<script lang="ts">
  import { app, maintenant, nonLues } from '../../data/store.svelte.ts';
  import { lignesDe, prochaine } from '../../data/paie.ts';
  import { param, aller } from '../../router.svelte.ts';
  import { jourCourt, quand } from '../../core/dates.ts';
  import { fcfa, fcfaSigne } from '../../core/money.ts';
  import { niveauDuScore, SEUILS_NIVEAU } from '../../core/credit.ts';
  import { SCORE_MAX, SCORE_MIN, prochainNiveau } from '../../core/score.ts';
  import { totalPrelevement } from '../../core/prelevement.ts';
  import { PILIERS, etatPilier, NOM_NIVEAU } from '../../core/piliers.ts';
  import Icone from '../../ui/Icone.svelte';
  import Carte from '../../ui/Carte.svelte';
  import Ligne from '../../ui/Ligne.svelte';
  import Bouton from '../../ui/Bouton.svelte';
  import Panneau from './Panneau.svelte';
  import FeuilleRecharge from './FeuilleRecharge.svelte';
  import ListeNotifs from './ListeNotifs.svelte';
  import Pict from './Pict.svelte';
  import { facturesAPayer } from './etat.ts';
  import { repartitionFacture } from './actions.ts';

  let recharge = $state(false), historique = $state(false), notifs = $state(false);
  let montantInitial = $state(0);
  // Arrivée depuis un paiement refusé : /?recharger=1&manque=3200 ouvre la feuille avec le bon montant.
  $effect(() => {
    if (param('recharger')) {
      const m = Number(param('manque')) || 0;
      montantInitial = m > 0 ? Math.ceil(m / 1000) * 1000 : 0;
      recharge = true;
      aller('/', { remplacer: true });
    }
  });

  const c = $derived(app.compte);
  const score = $derived(app.score.valeur);
  const niveau = $derived(niveauDuScore(score));
  const suivant = $derived(prochainNiveau(score));
  const hist = $derived(app.score.historique);
  const evolution = $derived(hist.length >= 2 ? hist[hist.length - 1].valeur - hist[hist.length - 2].valeur : null);
  const anneau = $derived(Math.round(((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100));
  const mouvements = $derived([...app.mouvements].sort((a, b) => b.ts - a.ts));
  const cinq = $derived(mouvements.slice(0, 5));
  const nonLu = $derived(nonLues());
  const aPayer = $derived(facturesAPayer());
  const salaireRecent = $derived(mouvements.find((m) => m.categorie === 'salaire' && maintenant() - m.ts < 3 * 86_400_000));
  const paie = $derived(prochaine());
  const lignes = $derived(paie ? lignesDe(paie).filter((l) => !l.reporte) : []);
  const totalPreleve = $derived(totalPrelevement(lignes));
  const vierge = $derived(app.mouvements.length === 0 && app.credits.length === 0);
  const COULEUR = { pass: 'var(--pale)', credit: 'var(--primaire)', coffre: 'var(--bon)' } as const;
  const initiales = $derived(c ? `${c.prenom[0] ?? ''}${c.nom[0] ?? ''}`.toUpperCase() : '·');
  const apercu = PILIERS.slice(0, 9);
  const SERVICES = [
    { nom: 'Diaspora', vers: '/diaspora', icone: 'diaspora', couleur: 'var(--primaire-clair)' }, { nom: 'Commerce', vers: '/commerce', icone: 'commerce', couleur: 'var(--alerte)' },
    { nom: 'Protection', vers: '/protection', icone: 'protection', couleur: 'var(--bon)' }, { nom: 'Énergie', vers: '/energie', icone: 'solaire', couleur: 'var(--alerte)' }
  ];
  const ETAPES = [
    { titre: 'Recharger mon solde', sous: 'Orange Money, MTN MoMo ou carte Visa', action: () => (recharge = true) },
    { titre: 'Choisir mon Pass santé', sous: 'Famille, Essentiel ou Premium', vers: '/profil' },
    { titre: 'Créer mon premier coffre', sous: "Épargne automatique sur salaire", vers: '/coffres' },
    { titre: 'Compléter mon dossier', sous: 'Un dossier vérifié fait monter le score', vers: '/score' }
  ];
</script>

<div class="page">
  <div class="halo" aria-hidden="true"></div>
  <header class="haut">
    <a class="avatar" href="/profil" aria-label="Mon profil et mes appareils" onclick={(e) => { e.preventDefault(); aller('/profil'); }}>{initiales}</a>
    <div class="qui">
      <h1>Bonjour{c ? `, ${c.prenom}` : ''}</h1>
      <span class="mono">{c?.employeur ? `${c.employeur} · ` : ''}NIVEAU {NOM_NIVEAU[niveau].toUpperCase()}</span>
    </div>
    <button type="button" class="cloche" onclick={() => (notifs = true)} aria-label={nonLu ? `Notifications, ${nonLu} non lue${nonLu > 1 ? 's' : ''}` : 'Notifications'}>
      <Icone nom="cloche" />{#if nonLu}<span class="badge mono" aria-hidden="true">{nonLu}</span>{/if}
    </button>
  </header>

  <section class="solde" aria-label="Solde">
    <div class="ligne1">
      <span class="mono lib">SOLDE DISPONIBLE</span>
      {#if salaireRecent}<a class="etat" href="/prelevement/notif" onclick={(e) => { e.preventDefault(); aller('/prelevement/notif'); }}><i></i>Salaire reçu</a>
      {:else if paie}<span class="etat"><i class="att"></i>Paie le {jourCourt(paie)}</span>{/if}
    </div>
    <div class="ligne2">
      <p class="montant mono" data-testid="solde">{fcfa(app.solde)} <span>FCFA</span></p>
      <button type="button" class="histo" onclick={() => (historique = true)}><Icone nom="historique" taille={14} />Historique</button>
    </div>
    <div class="actions">
      <button type="button" class="act" onclick={() => { montantInitial = 0; recharge = true; }}><Icone nom="plus" taille={16} trait={2.2} />Recharger</button>
      <a class="act blanc" href="/pay/scan" onclick={(e) => { e.preventDefault(); aller('/pay/scan'); }}><Icone nom="fleche" taille={16} trait={2.2} />Payer</a>
      <a class="act" href="/coffres" onclick={(e) => { e.preventDefault(); aller('/coffres'); }}><Pict nom="pile" taille={16} trait={2} />Épargner</a>
    </div>
  </section>

  {#if vierge}
    <section class="accueillir" aria-labelledby="inv">
      <h2 id="inv">Bienvenue{c ? `, ${c.prenom}` : ''}. Complétons votre compte.</h2>
      <p class="muted">Quatre gestes pour que tout soit prêt le jour de la paie.</p>
      <ol>
        {#each ETAPES as e, i (e.titre)}
          <li>
            <button type="button" onclick={() => (e.action ? e.action() : aller(e.vers!))}>
              <span class="num mono">{i + 1}</span><span class="tx"><b>{e.titre}</b><small>{e.sous}</small></span><Icone nom="suivant" taille={16} />
            </button>
          </li>
        {/each}
      </ol>
    </section>
  {/if}

  {#each aPayer as f (f.id)}
    <Carte href="/pay/facture?id={encodeURIComponent(f.id)}" accent="var(--alerte)">
      <div class="facture">
        <Icone nom="document" taille={22} />
        <span class="tx"><b>Facture {f.partenaire} à régler</b><small>{fcfa(repartitionFacture(f).patient)} à payer avant le {jourCourt(f.echeance)}</small></span>
        <Icone nom="suivant" taille={16} />
      </div>
    </Carte>
  {/each}

  <section aria-labelledby="pil">
    <div class="titre"><h2 id="pil">Vos piliers</h2><a href="/piliers" onclick={(e) => { e.preventDefault(); aller('/piliers'); }}>Tout voir</a></div>
    <div class="bande">
      {#each apercu as p (p.id)}
        {@const e = etatPilier(p.id, score)}
        <a href={e.verrouille ? '/piliers' : p.href} class="pil" class:ver={e.verrouille} style:--a={p.accent} onclick={(ev) => { ev.preventDefault(); aller(e.verrouille ? '/piliers' : p.href); }} aria-label="{p.nom}{e.verrouille ? `, verrouillé jusqu'au niveau ${NOM_NIVEAU[e.requis]}` : ''}">
          <Icone nom={p.icone} taille={22} /><span>{p.nom}</span>{#if e.verrouille}<em><Pict nom="cadenas" taille={12} /></em>{/if}
        </a>
      {/each}
    </div>
  </section>

  <a class="score" href="/score" onclick={(e) => { e.preventDefault(); aller('/score'); }}>
    <span class="anneau" style:background="conic-gradient(var(--primaire) 0 {anneau}%, var(--carte2) {anneau}% 100%)"><b class="mono">{score}</b></span>
    <span class="tx">
      <b>AssureScore · {NOM_NIVEAU[niveau]}</b>
      <small>{#if evolution != null}<span class:bon={evolution >= 0} class:dan={evolution < 0}>{evolution >= 0 ? '+' : '−'}{Math.abs(evolution)}</span> ce mois{:else}Pas encore d'évolution{/if} · {suivant ? `${NOM_NIVEAU[suivant]} dès ${SEUILS_NIVEAU[suivant]}` : 'Niveau maximum'}</small>
    </span>
    <Icone nom="suivant" taille={18} />
  </a>

  {#if paie}
    <a class="preleve" href="/prelevement" onclick={(e) => { e.preventDefault(); aller('/prelevement'); }}>
      <span class="r1"><b>Prochain prélèvement · {jourCourt(paie)}</b><span class="mono">{fcfa(totalPreleve)}</span></span>
      {#if lignes.length}
        <span class="barre" aria-hidden="true">{#each lignes as l (l.id)}<i style:flex={l.montant} style:background={COULEUR[l.type]}></i>{/each}</span>
        <span class="legende mono">{#each lignes as l (l.id)}<span>{l.libelle.split(' ')[0].toUpperCase()} {fcfa(l.montant)}</span>{/each}</span>
      {:else}
        <span class="muted vide">Aucun prélèvement prévu : le salaire arrive en entier sur votre solde.</span>
      {/if}
    </a>
  {/if}

  <section aria-labelledby="svc">
    <h2 id="svc" class="h2">Plus de services</h2>
    <div class="services">
      {#each SERVICES as s (s.nom)}
        <a href={s.vers} onclick={(e) => { e.preventDefault(); aller(s.vers); }}><span style:color={s.couleur}><Icone nom={s.icone} taille={22} /></span>{s.nom}</a>
      {/each}
    </div>
  </section>
  <div class="espace"></div>
</div>

<FeuilleRecharge bind:ouverte={recharge} initial={montantInitial} />

<Panneau bind:ouverte={historique} titre="Historique" sous={cinq.length ? `${cinq.length} DERNIER${cinq.length > 1 ? 'S' : ''} MOUVEMENT${cinq.length > 1 ? 'S' : ''}` : ''}>
  {#if cinq.length === 0}
    <p class="muted vide2">Aucun mouvement pour l'instant. Rechargez votre solde pour commencer.</p>
  {:else}
    <div>{#each cinq as m (m.id)}<Ligne ini={m.ini} titre={m.titre} sous={`${m.sous} · ${quand(m.ts, maintenant())}`} valeur={fcfaSigne(m.montant)} ton={m.montant > 0 ? 'bon' : ''} couleur={m.montant > 0 ? 'rgba(61,213,152,0.14)' : 'var(--carte2)'} />{/each}</div>
  {/if}
  <Bouton variante="secondaire" onclick={() => (historique = false)}>Fermer</Bouton>
</Panneau>

<Panneau bind:ouverte={notifs} titre="Notifications">
  <ListeNotifs onouvert={() => (notifs = false)} />
  <Bouton variante="secondaire" onclick={() => (notifs = false)}>Fermer</Bouton>
</Panneau>

<style>
  .mono { white-space: nowrap; }
  .page { position: relative; padding: calc(env(safe-area-inset-top) + 14px) 20px 0; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
  .halo { position: absolute; top: -140px; right: -100px; width: 360px; height: 360px; border-radius: 50%; background: radial-gradient(closest-side, rgba(48, 80, 255, 0.4), transparent); pointer-events: none; }
  .page > :global(*:not(.halo)) { position: relative; }
  .haut { display: flex; align-items: center; gap: 12px; min-height: 48px; }
  .avatar { width: 44px; height: 44px; border-radius: 22px; background: var(--carte); border: 2px solid var(--primaire); display: grid; place-items: center; font-weight: 600; font-size: 15px; flex: none; }
  .qui { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; } h1 { font-size: 18px; font-weight: 600; letter-spacing: -0.02em; }
  .qui span { font-size: 11px; color: var(--muted); letter-spacing: 0.04em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .cloche { width: 44px; height: 44px; border-radius: 14px; background: var(--carte); border: 1px solid var(--ligne); display: grid; place-items: center; position: relative; flex: none; }
  .badge { position: absolute; top: -4px; right: -4px; min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--alerte); color: #07090f; border: 2px solid var(--fond); font-size: 10px; font-weight: 600; display: grid; place-items: center; }
  .solde { border-radius: 24px; padding: 20px 20px 18px; display: flex; flex-direction: column; gap: 14px; background-color: #0f1733; border: 1px solid rgba(124, 147, 255, 0.28); color: #f3f5fa;
    background-image: linear-gradient(135deg, rgba(48, 80, 255, 0.55), rgba(48, 80, 255, 0) 60%), linear-gradient(rgba(255, 255, 255, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.05) 1px, transparent 1px); background-size: auto, 28px 28px, 28px 28px; }
  .ligne1, .ligne2 { display: flex; justify-content: space-between; align-items: center; gap: 10px; } .lib { font-size: 11px; letter-spacing: 0.12em; color: #c9d2ff; }
  .etat { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #c9d2ff; min-height: 24px; } .etat i { width: 7px; height: 7px; border-radius: 4px; background: var(--bon); } .etat i.att { background: var(--alerte); }
  .montant { font-weight: 500; font-size: 38px; letter-spacing: -0.03em; line-height: 1; } .montant span { font-size: 16px; color: #c9d2ff; }
  .histo { min-height: 44px; padding: 0 12px; border-radius: 22px; border: 1px solid rgba(255, 255, 255, 0.18); background: rgba(255, 255, 255, 0.08); color: #fff; font-weight: 500; font-size: 12px; display: flex; align-items: center; gap: 6px; flex: none; }
  .actions { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .act { min-height: 48px; border-radius: 14px; border: 1px solid rgba(255, 255, 255, 0.14); background: rgba(255, 255, 255, 0.1); color: #fff; font-weight: 600; font-size: 13px; display: flex; align-items: center; justify-content: center; gap: 6px; } .act.blanc { background: #fff; color: #0b0f1a; border-color: #fff; }
  .accueillir { background: var(--carte); border: 1px dashed var(--ligne-forte); border-radius: 20px; padding: 16px; display: flex; flex-direction: column; gap: 8px; } h2 { font-size: 16px; letter-spacing: -0.02em; }
  ol { list-style: none; display: flex; flex-direction: column; } ol li + li { border-top: 1px solid var(--ligne); }
  ol button { width: 100%; display: flex; align-items: center; gap: 12px; min-height: 56px; text-align: left; color: var(--muted); }
  .num { width: 28px; height: 28px; border-radius: 14px; background: var(--primaire-fond); color: var(--pale); display: grid; place-items: center; font-size: 12px; flex: none; }
  .tx { flex: 1; min-width: 0; display: flex; flex-direction: column; } .tx b { color: var(--texte); font-weight: 600; font-size: 14.5px; } .tx small { color: var(--muted); font-size: 12.5px; }
  .facture { display: flex; align-items: center; gap: 12px; color: var(--alerte); } .facture .tx b { color: var(--texte); }
  .titre { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 8px; } .titre a { color: var(--primaire-clair); font-size: 13px; font-weight: 500; min-height: 24px; padding: 6px 0; }
  .h2 { margin-bottom: 10px; }
  .bande { display: flex; gap: 8px; overflow-x: auto; margin: 0 -20px; padding: 2px 20px 4px; scrollbar-width: none; } .bande::-webkit-scrollbar { display: none; }
  .pil { flex: none; width: 86px; height: 82px; border-radius: 16px; background: var(--carte); border: 1px solid color-mix(in srgb, var(--a) 40%, transparent); color: var(--texte); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; font-size: 12px; font-weight: 500; position: relative; }
  .pil :global(svg) { color: var(--a); } .pil.ver { border-color: var(--ligne); color: var(--muted); } .pil.ver :global(svg) { color: var(--faint); }
  .pil em { position: absolute; top: 6px; right: 6px; color: var(--faint); display: grid; }
  .score { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 12px 14px; display: flex; align-items: center; gap: 14px; min-height: 76px; }
  .anneau { width: 50px; height: 50px; border-radius: 25px; display: grid; place-items: center; flex: none; } .anneau b { width: 40px; height: 40px; border-radius: 20px; background: var(--carte); display: grid; place-items: center; font-size: 13px; font-weight: 600; }
  .score .tx b { font-size: 15px; } .score .tx small { font-size: 12px; } .bon { color: var(--bon); } .dan { color: var(--danger); } .score :global(svg) { color: var(--muted); }
  .preleve { background: var(--carte); border: 1px solid var(--ligne); border-radius: 18px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .r1 { display: flex; justify-content: space-between; align-items: baseline; gap: 8px; } .r1 b { font-size: 14px; font-weight: 600; } .r1 .mono { font-size: 15px; font-weight: 500; }
  .barre { display: flex; height: 6px; border-radius: 3px; overflow: hidden; gap: 2px; } .barre i { display: block; min-width: 4px; }
  .legende { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; color: var(--muted); letter-spacing: 0.04em; flex-wrap: wrap; } .vide { font-size: 13px; }
  .services { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; }
  .services a { min-height: 82px; border-radius: 16px; background: var(--carte); border: 1px solid var(--ligne); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; font-size: 12px; font-weight: 500; }
  .espace { height: 96px; } .vide2 { padding: 18px 4px; text-align: center; }
</style>
