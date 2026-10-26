<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Console from './Console.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { aller, param } from '../../router.svelte.ts';
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { departDe, echeanceDe, joursAvant } from '../../core/regles.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { droitDe, volDe } from '../../domain/marche.ts';
  import { ErreurAdmin, degeler, geler, MOTIF_MAX } from '../../domain/admin.ts';
  import { STATUTS_AFFICHES, chaineDe, heure, instantComplet, jourMois, jourMoisAn, jourSemaine, fuseau, nomVol, pseudonyme, rapprochement, statutAffiche } from './DroitsDonnees.ts';
  import { pnrDe } from '../achat/actions.ts';
  import { reseau } from './DroitsReseau.svelte.ts';

  /** Fiche d'un droit (console d'administration) : résumé, chaîne de détention vérifiée, gel et dégel avec motif obligatoire et confirmation « action sensible ». */
  let { id }: { id: string } = $props();
  let instant = $state(maintenant()), attente = $state(false), erreurForcee = $state(param('etat') === 'erreur');
  let minuterie: ReturnType<typeof setTimeout> | undefined;
  onMount(() => () => clearTimeout(minuterie));
  const horsLigne = $derived(!reseau.enLigne || param('etat') === 'horsligne');
  const vue = $derived(erreurForcee ? 'erreur' : attente || param('etat') === 'chargement' ? 'chargement' : 'donnees');
  const droit = $derived(droitDe(id ?? '') ?? app.monde.droits.find((d) => d.ref.toUpperCase() === (id ?? '').trim().toUpperCase()));
  const vol = $derived(droit ? volDe(droit.volId) : undefined);
  const admin = $derived(compteCourant());
  const aff = $derived(droit ? statutAffiche(droit, instant) : 'detenu');
  const gele = $derived(droit?.statut === 'gele');
  const chaine = $derived(droit ? chaineDe(droit) : []);
  const depart = $derived(vol ? departDe(vol.jour, vol.heureDepart) : 0), ech = $derived(depart ? echeanceDe(depart) : 0);
  const actif = $derived(aff === 'anommer' || aff === 'detenu' || aff === 'envente');
  const dateGel = $derived(droit ? [...droit.chaine].reverse().find((m) => m.type === 'gel')?.quand : undefined);
  const depuis = $derived(droit ? [...droit.chaine].reverse().find((m) => m.type !== 'gel' && m.type !== 'degel' && m.type !== 'nommage')?.quand : undefined);
  const audit = $derived(droit ? app.monde.audit.filter((a) => a.cible === droit.ref).slice(0, 4) : []);
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const dans = (j: number) => (j === 0 ? 'aujourd’hui' : `dans ${j} jour${j > 1 ? 's' : ''}`);
  const sTon = (t: string) => (t === 'signal' ? 'signal' : t === 'ok' ? 'ready' : t === 'info' ? 'bleu' : '');

  // Formulaire de gel / dégel : motif -> confirmation « action sensible » -> action.
  let etape = $state<'repos' | 'motif' | 'confirmer'>('repos'), motif = $state(''), erreurMotif = $state(''), erreurAction = $state(''), notice = $state(''), champ = $state<HTMLTextAreaElement>();
  const verbe = $derived(gele ? 'dégel' : 'gel');
  async function ouvrirForm() { if (horsLigne) return; etape = 'motif'; motif = ''; erreurMotif = ''; erreurAction = ''; notice = ''; await tick(); champ?.focus(); }
  function fermer() { etape = 'repos'; motif = ''; erreurMotif = ''; erreurAction = ''; }
  function continuer() { if (!motif.trim()) { erreurMotif = `Indiquez le motif du ${verbe}.`; champ?.focus(); return; } if (motif.trim().length > MOTIF_MAX) { erreurMotif = `Le motif est limité à ${MOTIF_MAX} caractères.`; return; } erreurMotif = ''; etape = 'confirmer'; }
  function confirmer() {
    if (!droit || !admin || horsLigne) return;
    try { if (gele) degeler(droit.id, admin.id, motif); else geler(droit.id, admin.id, motif); notice = gele ? `Droit gelé. Action journalisée par ${admin.id} (vous) ; le détenteur est notifié.` : `Droit dégelé. Action journalisée par ${admin.id} (vous) ; le détenteur est notifié.`; fermer(); }
    catch (e) { if (e instanceof ErreurAdmin) { erreurAction = e.message; if (e.code === 'motif') { erreurMotif = e.message; etape = 'motif'; } } else throw e; }
  }
  function reessayer() { erreurForcee = false; attente = true; clearTimeout(minuterie); minuterie = setTimeout(() => { instant = maintenant(); attente = false; }, 450); }
  const versListe = () => aller('/admin/droits');
</script>

{#snippet lien(cls: string)}<a class={cls} href="/admin/droits" onclick={(e) => { e.preventDefault(); versListe(); }}>Retour à la liste</a>{/snippet}

<Console actif="droits" titre={droit && vol ? `${droit.ref} · ${vol.de} → ${vol.vers}` : 'Chaîne de détention'} sous={`Fiche d’un droit de voyage · registre interne · données du ${instantComplet(instant)}`}>
  <nav aria-label="Fil d’Ariane"><ol class="ariane"><li><a href="/admin/droits" onclick={(e) => { e.preventDefault(); versListe(); }}>Droits de voyage</a></li><li class="sep" aria-hidden="true"><Icone nom="suivant" taille={16} /></li><li aria-current="page" class="mono cur">{droit?.ref ?? id}</li></ol></nav>
  {#if horsLigne}<div class="avis" role="status"><Icone nom="info" taille={20} trait={2} /><span>Hors ligne. Dernières données reçues le {instantComplet(instant).replace(', ', ' à ')}. Lecture seule : consultation seulement ; les actions d’administration sont indisponibles.</span></div>{/if}

  {#if vue === 'erreur'}
    <div class="carte erreur" role="alert">
      <div class="row g12 err"><Icone nom="alerte" taille={24} trait={2} /><h2>Impossible de charger ce droit.</h2></div>
      <p class="corps-p">Le serveur n’a pas répondu. Aucune donnée n’a été modifiée.</p>
      <p class="t-aide">Code de corrélation : <span class="mono code">ERR-DEMO-7C91</span></p>
      <div class="row g8 wrap"><button type="button" class="btn sm" onclick={reessayer}>Réessayer</button>{@render lien('btn sec sm')}</div>
    </div>
  {:else if vue === 'chargement'}
    <div aria-busy="true" class="col g16"><p role="status" class="chg">Chargement de la fiche du droit…</p>
      <div class="carte sq-bloc" aria-hidden="true">{#each [0, 1, 2, 3] as r (r)}<div class="sq-l"><span class="sq" style="width:16%;height:14px"></span><span class="sq" style="width:30%;height:14px"></span><span class="sq" style="width:20%;height:14px"></span></div>{/each}</div></div>
  {:else if !droit || !vol}
    <div class="carte vide"><span class="loupe-v" aria-hidden="true"><Icone nom="chercher" taille={32} trait={1.5} /></span><h2>Aucun droit ne porte cette référence</h2>
      <p class="corps-p">La référence <span class="mono code">{id}</span> n’existe pas dans le registre, ou vous n’avez pas accès à ce droit. Aucune donnée n’a été modifiée.</p>{@render lien('btn sec sm')}</div>
  {:else}
    <div class="deux">
      <div class="principal">
        {#if gele}<div class="gel-bandeau" role="status"><Icone nom="cadenas" taille={20} trait={2} /><span>Ce droit est gelé depuis le {dateGel ? instantComplet(dateGel) : 'une date antérieure'}. Aucune vente, aucun transfert ni nommage n’est possible tant qu’il n’est pas dégelé <span class="h">[H]</span>.</span></div>{/if}

        <section class="carte bloc" aria-labelledby="resume-t">
          <h2 id="resume-t" class="sur">Résumé du droit</h2>
          <dl class="resume">
            <div><dt>Vol</dt><dd>{nomVol(vol)}<span class="sd">{ville(vol.de)} ({vol.de}) → {ville(vol.vers)} ({vol.vers}) · {vol.escales.length ? `${vol.escales.length} escale${vol.escales.length > 1 ? 's' : ''} (${vol.escales.join(', ')})` : 'vol direct'}</span></dd></div>
            <div><dt>Départ</dt><dd>{jourSemaine(depart)} {jourMoisAn(depart)}<span class="sd">{heure(depart)} · {fuseau(depart)}</span></dd></div>
            <div><dt>Détenteur actuel</dt><dd><span class="mono">{pseudonyme(droit.detenteurId)}</span>{#if depuis}<span class="sd">depuis le {jourMoisAn(depuis)}</span>{/if}</dd></div>
            <div><dt>Voyageur</dt><dd>{droit.voyageur || aff === 'nomme' ? 'Nommé' : 'À nommer'}<span class="sd">{droit.voyageur || aff === 'nomme' ? 'Identité masquée dans la console' : 'Identité masquée après nommage'}</span></dd></div>
            <div><dt>Échéance de nommage</dt><dd>{#if actif}{jourMois(ech)} {new Date(ech).getFullYear()} · {heure(ech)}<span class="sd">{fuseau(ech)} · {instant >= ech ? 'échéance passée' : dans(joursAvant(ech, instant))}</span>{:else}—<span class="sd">{aff === 'nomme' ? 'Voyageur déjà nommé' : 'Sans objet'}</span>{/if}</dd></div>
            <div><dt>Statut</dt><dd><span class="statuts"><span class="puce {sTon(STATUTS_AFFICHES[aff].ton)}">{STATUTS_AFFICHES[aff].label}</span>{#if gele}<span class="puce err"><Icone nom="cadenas" taille={14} trait={2} />Gelé</span>{/if}</span></dd></div>
            <div><dt>Version de projection</dt><dd><span class="mono">{chaine.length}</span><span class="sd">égale au dernier n° d’événement</span></dd></div>
            <div><dt>Réservation</dt><dd><span class="mono">PNR {pnrDe(droit)}</span><span class="sd">Fournisseur : bac à sable (démo) · canal {droit.origine === 'drop' ? 'drop' : droit.origine === 'agence' ? 'agence' : 'primaire'}</span></dd></div>
          </dl>
          <p class="pied-b">À l’échéance, si aucun voyageur n’est nommé, le détenteur est nommé voyageur par défaut <span class="h2">[C]</span>. Données de démo : échéance J-1, à revoir si J-3 est retenu.</p>
        </section>

        <section aria-labelledby="chaine-t" class="col g12">
          <div class="entete-chaine"><div class="row g12 wrap"><h2 id="chaine-t" class="t-chaine">Chaîne de détention</h2><span class="puce clair"><Icone nom="cadenas" taille={14} trait={2} />Ajout seul</span></div>
            <span class="puce ready"><Icone nom="ok" taille={14} trait={2} />Chaîne vérifiée · {chaine.length} événement{chaine.length > 1 ? 's' : ''} · {rapprochement(instant)}</span></div>
          <div class="boite">
            <table>
              <caption class="sr">Événements du registre pour le droit {droit.ref}, du plus ancien au plus récent : numéro, événement, date, de vers à, montant, empreinte et empreinte précédente.</caption>
              <thead><tr><th scope="col" class="n">N°</th><th scope="col">Événement</th><th scope="col">Date</th><th scope="col">De → à</th><th scope="col">Montant</th><th scope="col">Empreinte</th><th scope="col">Empreinte précédente</th></tr></thead>
              <tbody>
                {#each chaine as m, i (m.id)}
                  <tr data-rang={m.rang}>
                    <th scope="row" class="rang"><span class="rail"><span class="fil" class:premier={i === 0} class:dernier={i === chaine.length - 1} class:seul={chaine.length === 1} aria-hidden="true"></span><span class="rond" class:gel={m.type === 'gel'} class:degel={m.type === 'degel'}>{m.rang}</span></span></th>
                    <td><span class="v">{m.label}</span><span class="s">{m.sous}</span></td>
                    <td class="nw"><span class="v">{m.date}</span><span class="s">{m.heure}</span></td>
                    <td class="nw"><span class="mono pd">{#if m.avecDe}{m.de}<span class="fl" aria-hidden="true">→</span>{/if}{m.vers}</span></td>
                    <td class="nw">{#if m.prix !== null}<span class="mono montant">{fmt(m.prix)}</span>{#if m.commission}<span class="s bl">commission {fmt(m.commission)}</span>{/if}{:else}<span class="mono montant">—</span>{/if}</td>
                    <td class="nw"><span class="mono emp" title={m.empreinte}><Icone nom="empreinte" taille={14} />{m.empreinte}…</span></td>
                    <td class="nw"><span class="mono emp2" title={m.precedente}>{m.precedente}…</span><span class="s bl">{m.precedenteSous}</span></td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
          {#if droit.annonce}<p class="t-sec">Annonce de revente en cours : <span class="mono">{fmt(droit.annonce.prix)}</span> depuis le {jourMoisAn(droit.annonce.depuis)}. La vente ne sera inscrite à la chaîne qu’à son exécution.</p>{/if}
          <p class="t-sec note">Chaque empreinte est calculée à partir de l’événement et de l’empreinte précédente : toute modification casserait la chaîne. Aucun événement n’est modifié ni supprimé ; une erreur se corrige par une écriture compensatoire.</p>
          <p class="t-aide note">{#if actif}Prochain événement attendu : nommage du voyageur avant le {jourMoisAn(ech)}, {heure(ech)} ({fuseau(ech)}).{' '}{/if}Montants en dollars canadiens, enregistrés en unités mineures. Le gel et le dégel sont inscrits à la chaîne ; l’indicateur « Gelé » reste distinct du statut <span class="h">[H]</span>.</p>
        </section>
      </div>

      <aside aria-label="Actions et contexte du droit" class="lateral">
        <section class="carte bloc act" aria-labelledby="act-t">
          <h2 id="act-t" class="sur">Actions d’administration</h2>
          {#if notice}<p class="notice" role="status"><Icone nom="ok" taille={18} trait={2} /><span>{notice}</span></p>{/if}
          {#if gele}
            <span class="puce err gel-p"><Icone nom="cadenas" taille={14} trait={2} />Gelé</span>
            <dl class="mini"><div><dt>Gel inscrit le</dt><dd>{dateGel ? instantComplet(dateGel) : '—'}</dd></div><div><dt>Motif</dt><dd>{droit.gelRaison ?? '—'}</dd></div></dl>
            <p class="p14">Aucune transaction n’est possible sur ce droit : vente, transfert et nommage sont bloqués <span class="h">[H]</span>.</p>
          {:else}
            <p class="p14">Geler un droit bloque toute transaction (vente, transfert, nommage) jusqu’au dégel <span class="h">[H]</span>. Action sensible : journalisée au nom de l’administrateur, confirmation requise.</p>
          {/if}

          {#if etape === 'repos'}
            <button id="gel-ouvrir" type="button" class="btn-gel" class:degel={gele} aria-disabled={horsLigne} onclick={ouvrirForm}><Icone nom={gele ? 'ok' : 'cadenas'} taille={20} trait={2} />{gele ? 'Dégeler ce droit' : 'Geler ce droit'}</button>
            {#if horsLigne}<p class="hors">Hors ligne : les actions d’administration sont indisponibles.</p>{/if}
            {#if gele}<p class="t-aide">Le dégel est journalisé et demande aussi un motif <span class="h">[R]</span>.</p>{/if}
          {:else if etape === 'motif'}
            <form class="form" onsubmit={(e) => { e.preventDefault(); continuer(); }} novalidate>
              <label for="gel-motif">Motif du {verbe}</label>
              <textarea id="gel-motif" name="motif" rows="3" bind:this={champ} bind:value={motif} maxlength={MOTIF_MAX + 20} aria-invalid={erreurMotif ? 'true' : undefined} aria-describedby={erreurMotif ? 'gel-motif-aide gel-motif-err' : 'gel-motif-aide'} class:inv={!!erreurMotif}></textarea>
              <span id="gel-motif-aide" class="aide">Conservé dans le journal d’audit. N’y inscrivez aucune donnée de voyageur.</span>
              {#if erreurMotif}<p id="gel-motif-err" class="erreur-l" role="alert"><Icone nom="alerte" taille={16} trait={2} />{erreurMotif}</p>{/if}
              <div class="row g8 wrap"><button type="button" class="btn sec sm" onclick={fermer}>Annuler</button><button type="submit" class="btn sm">{gele ? 'Demander le dégel' : 'Demander le gel'}</button></div>
            </form>
          {:else}
            <div class="form confirm" role="group" aria-labelledby="conf-t">
              <p id="conf-t" class="sens"><Icone nom="alerte" taille={18} trait={2} />Action sensible</p>
              <p class="p14">{gele ? 'Dégeler' : 'Geler'} le droit <span class="mono">{droit.ref}</span> ? Il sera journalisé au nom de <span class="mono">{admin?.id}</span> (vous) et le détenteur <span class="mono">{pseudonyme(droit.detenteurId)}</span> sera notifié.</p>
              <dl class="mini"><div><dt>Motif</dt><dd>{motif.trim()}</dd></div></dl>
              {#if erreurAction}<p class="erreur-l" role="alert"><Icone nom="alerte" taille={16} trait={2} />{erreurAction}</p>{/if}
              <div class="row g8 wrap"><button type="button" class="btn sec sm" onclick={() => (etape = 'motif')}>Retour</button><button type="button" id="gel-confirmer" class="btn sm" onclick={confirmer}>{gele ? 'Confirmer le dégel' : 'Confirmer le gel'}</button></div>
            </div>
          {/if}
        </section>

        <section class="carte bloc" aria-labelledby="aud-t">
          <h2 id="aud-t" class="sur">Journal d’audit de ce droit</h2>
          <p class="p14">Les actions d’administration sur {droit.ref} sont journalisées avec leur auteur, leur résultat et leur motif.</p>
          {#if audit.length}<ul class="audit">{#each audit as a (a.id)}<li><span class="v">{a.action}</span><span class="s">{a.acteur} · {jourMois(a.quand)} {heure(a.quand)} · {a.detail}</span></li>{/each}</ul>{/if}
          <a class="btn sec sm" href="/admin/audit" onclick={(e) => { e.preventDefault(); aller('/admin/audit'); }}><Icone nom="horloge" taille={20} />Voir le journal d’audit</a>
        </section>

        <section class="carte bloc" aria-labelledby="rap-t">
          <h2 id="rap-t" class="sur">Rapprochement quotidien</h2>
          <p class="rap"><Icone nom="ok" taille={18} trait={2} /><span>Registre, grand livre, paiements et fournisseur concordent au {jourMoisAn(instant)}, {rapprochement(instant).split(' ').pop()} ({fuseau(instant)}).</span></p>
          <p class="t-aide">Tout écart déclenche une alerte et le gel du droit concerné.</p>
        </section>
      </aside>
    </div>
  {/if}
</Console>

<style>
  h2 { font: 700 20px/26px 'Barlow', sans-serif; } h2.sur { font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); }
  .ariane { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 0 8px; font-size: 14px; } .ariane a { display: inline-flex; align-items: center; min-height: 44px; color: var(--accent); font-weight: 600; }
  .sep { display: flex; color: var(--ink3); } .cur { font-weight: 600; }
  .avis { display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--accent-soft); color: var(--accent); font: 600 14px/20px 'Barlow', sans-serif; } .avis :global(svg) { margin-top: 1px; }
  .corps-p { font-size: 15px; line-height: 22px; color: var(--ink2); max-width: 640px; } .err { color: var(--err); } .code { color: var(--ink); } .wrap { flex-wrap: wrap; } .h, .h2 { color: var(--ink3); } .h { color: var(--ink2); }
  .erreur, .vide { padding: 24px; display: flex; flex-direction: column; align-items: flex-start; gap: 12px; } .vide { align-items: center; text-align: center; padding: 40px 24px; } .loupe-v { color: var(--ink3); display: flex; }
  .erreur .btn, .vide .btn { min-height: 48px; border-radius: 14px; }
  .chg { font: 600 14px/20px 'Barlow', sans-serif; color: var(--ink2); } .sq-bloc { display: flex; flex-direction: column; gap: 18px; } .sq-l { display: flex; gap: 24px; }
  .sq { display: block; max-width: 100%; border-radius: 6px; background: var(--surface3); animation: nx-pulse 1.4s ease-in-out infinite; }
  .deux { display: flex; flex-wrap: wrap; align-items: flex-start; gap: 24px; } .principal { flex: 999 1 700px; min-width: 0; display: flex; flex-direction: column; gap: 18px; } .lateral { flex: 1 1 340px; max-width: 460px; min-width: 0; display: flex; flex-direction: column; gap: 18px; }
  .bloc { padding: 20px; display: flex; flex-direction: column; gap: 16px; } .lateral .bloc { padding: 18px; gap: 12px; }
  .gel-bandeau { display: flex; align-items: flex-start; gap: 10px; padding: 14px 16px; border-radius: 14px; background: var(--err-soft); color: var(--err); font: 600 14px/20px 'Barlow', sans-serif; } .gel-bandeau :global(svg) { margin-top: 1px; flex: none; }
  .resume { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 18px 24px; } .resume > div { min-width: 0; } dt { font-size: 13px; color: var(--ink2); } dd { margin: 2px 0 0; font-size: 15px; font-weight: 600; }
  .sd { display: block; font-size: 13px; font-weight: 400; color: var(--ink2); } .statuts { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
  .pied-b { padding-top: 14px; border-top: 1px solid var(--line); font-size: 13px; line-height: 19px; color: var(--ink2); }
  .entete-chaine { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 16px; } .t-chaine { font: 600 24px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .puce.clair { background: var(--surface3); color: var(--ink); }
  .boite { position: relative; overflow-x: auto; max-width: 100%; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  table { width: 100%; min-width: 900px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  thead th { padding: 12px 8px 10px; text-align: left; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); white-space: nowrap; } thead th.n { padding-left: 16px; text-align: center; }
  td, th.rang { border-top: 1px solid var(--line); vertical-align: middle; } td { padding: 8px; font-size: 14px; } th.rang { padding: 0; width: 64px; font-weight: inherit; }
  .rail { position: relative; display: flex; align-items: center; justify-content: center; min-height: 64px; } .fil { position: absolute; left: 50%; margin-left: -1px; top: 0; bottom: 0; width: 2px; background: #6b7282; } .fil.premier { top: 50%; } .fil.dernier { bottom: 50%; } .fil.seul { display: none; }
  .rond { position: relative; display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 999px; background: var(--surface2); border: 2px solid var(--up); font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; } .rond.gel { border-color: var(--err); } .rond.degel { border-color: var(--ok); }
  .v { display: block; font-size: 14px; font-weight: 600; } .s { font-size: 12px; color: var(--ink3); } .bl { display: block; } .nw { white-space: nowrap; }
  .pd { font-size: 13px; font-weight: 400; } .fl { color: var(--ink3); margin: 0 6px; } .montant { display: block; font-weight: 600; font-size: 15px; } .emp { display: inline-flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 400; } .emp2 { font-size: 13px; font-weight: 400; }
  .note { max-width: 1000px; }
  .p14 { font-size: 14px; line-height: 20px; color: var(--ink2); } .gel-p { align-self: flex-start; }
  .mini { margin: 0; display: grid; gap: 8px; } .mini dt { font-size: 12px; } .mini dd { margin: 1px 0 0; font-size: 14px; overflow-wrap: anywhere; }
  .btn-gel { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 48px; padding: 0 18px; border-radius: 14px; background: var(--surface2); color: var(--err); border: 1px solid var(--err); font: 700 15px/1 'Barlow', sans-serif; cursor: pointer; } .btn-gel.degel { color: var(--ok); border-color: var(--ok); }
  .btn-gel[aria-disabled='true'] { color: var(--ink3); border-color: #6b7282; cursor: not-allowed; }
  .hors { font: 600 13px/19px 'Barlow', sans-serif; color: var(--accent); }
  .form { display: flex; flex-direction: column; gap: 8px; padding: 14px; border-radius: 16px; background: var(--surface2); border: 1px solid #6b7282; } .form .btn { min-height: 48px; border-radius: 14px; }
  .form label { font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); } textarea { width: 100%; min-height: 96px; padding: 12px 14px; border-radius: 12px; background: var(--surface); border: 1px solid #6b7282; color: var(--ink); font-size: 15px; line-height: 22px; resize: vertical; } textarea.inv { border-color: var(--err); box-shadow: 0 0 0 1px var(--err); }
  .aide { font-size: 12px; line-height: 17px; color: var(--ink3); } .erreur-l { display: flex; align-items: center; gap: 6px; font: 600 13px/18px 'Barlow', sans-serif; color: var(--err); }
  .sens { display: flex; align-items: center; gap: 8px; font: 700 14px/20px 'Barlow', sans-serif; color: var(--accent); text-transform: uppercase; letter-spacing: 0.08em; }
  .notice { display: flex; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--ok-soft); color: var(--ok); font: 600 14px/20px 'Barlow', sans-serif; } .notice :global(svg) { flex: none; margin-top: 1px; }
  .audit { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .audit li { padding: 8px 10px; border-radius: 10px; background: var(--surface2); display: flex; flex-direction: column; } .audit .s { overflow-wrap: anywhere; }
  .rap { display: flex; gap: 8px; color: var(--ok); font: 700 15px/22px 'Barlow', sans-serif; } .rap :global(svg) { flex: none; margin-top: 2px; }
  .lateral .btn.sec { text-decoration: none; border-radius: 14px; min-height: 48px; }
  .puce.bleu { background: rgba(98, 199, 255, 0.12); color: var(--up); }
</style>
