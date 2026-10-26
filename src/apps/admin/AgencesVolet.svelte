<script lang="ts">
  import { app, maintenant } from '../../data/store.svelte.ts';
  import { fmt } from '../../core/argent.ts';
  import { peutEchanger } from '../../core/regles.ts';
  import { ajouterOffreAgence, derniereVerification, ErreurAdmin, libelleVol, offresDeAgence, offresPubliees, permisDe, reactiverAgence, retirerOffreAgence, statutAgence, suspendreAgence, verifierAgence, type Controles, type StatutAgence } from '../../domain/admin-drops.ts';
  import { departDuVol, volDe } from '../../domain/marche.ts';
  import Icone from '../../ui/Icone.svelte';
  import Champ from '../../ui/Champ.svelte';
  import { jour } from './DropsFormat.ts';
  /** Volet « Agences partenaires » : liste (permis, vérification, offres publiées), agence sélectionnée (contrôles, offres avec plafond, suspension / réactivation). Chaque action est consignée au journal d'audit. */
  let { acteur, horsLigne, informer }: { acteur: string; horsLigne: boolean; informer: (m: string, ton?: 'ok' | 'er') => void } = $props();

  const agences = $derived(app.monde.agences);
  let choix = $state('');
  const sel = $derived(agences.find((a) => a.id === choix) ?? agences.find((a) => statutAgence(a) === 'en_verification') ?? agences[0]);
  const statut = $derived(sel ? statutAgence(sel) : 'verifiee');
  const STATUTS: Record<StatutAgence, { texte: string; icone: string }> = { verifiee: { texte: 'Vérifiée', icone: 'verifie' }, en_verification: { texte: 'En vérification', icone: 'horloge' }, suspendue: { texte: 'Suspendue', icone: 'cadenas' } };
  const SOUS: Record<StatutAgence, string> = { verifiee: 'Vitrine ouverte', en_verification: 'Dossier en cours', suspendue: 'Vitrine retirée' };
  const NOTICE: Record<StatutAgence, string> = { verifiee: 'Permis vérifié : les offres de l’agence sont proposées au public.', en_verification: 'Permis non vérifié : aucune offre ne peut être publiée avant l’approbation de la vitrine.', suspendue: 'Vitrine suspendue : les offres de l’agence ne sont plus proposées. Elles reviennent à la réactivation.' };

  let controles = $state<Controles>({ identite: false, permis: false, cautionnement: false });
  let motif = $state(''), motifErr = $state('');
  let o = $state({ volId: '', prix: '', note: '' }), offreErr = $state('');
  const selId = $derived(sel?.id);
  $effect(() => { void selId; controles = { identite: false, permis: false, cautionnement: false }; motif = ''; motifErr = ''; o = { volId: '', prix: '', note: '' }; offreErr = ''; });
  const tousCoches = $derived(controles.identite && controles.permis && controles.cautionnement);
  const offres = $derived(sel ? offresDeAgence(sel.id) : []);
  const volsLibres = $derived(sel ? [...app.monde.vols].filter((v) => peutEchanger(departDuVol(v), maintenant()) && !offres.some((x) => x.volId === v.id)).sort((a, b) => departDuVol(a) - departDuVol(b)) : []);
  const motifSuspension = $derived(sel ? app.monde.audit.find((l) => l.action === 'Suspension d’agence' && l.cible === sel.nom)?.detail : undefined);

  function faire(f: () => string) { if (horsLigne) return; try { informer(`${f()} Action consignée au journal d’audit.`); } catch (x) { if (x instanceof ErreurAdmin) { if (x.code === 'motif') motifErr = x.message; else if (x.code === 'offre' || x.code === 'vol') offreErr = x.message; else informer(x.message, 'er'); } else throw x; } }
  const approuver = () => faire(() => { verifierAgence(acteur, sel!.id, controles); return `Vitrine de ${sel!.nom} approuvée.`; });
  const suspendre = () => { motifErr = ''; faire(() => { suspendreAgence(acteur, sel!.id, motif); motif = ''; return `Vitrine de ${sel!.nom} suspendue.`; }); };
  const reactiver = () => faire(() => { reactiverAgence(acteur, sel!.id); return `Vitrine de ${sel!.nom} réactivée.`; });
  const ajouter = (e: SubmitEvent) => { e.preventDefault(); offreErr = ''; const t = o.prix.trim().replace(',', '.'); const prix = /^\d+(\.\d{1,2})?$/.test(t) ? Number(t) : NaN; faire(() => { if (!o.volId) throw new ErreurAdmin('vol', 'Choisissez un vol.'); ajouterOffreAgence(acteur, sel!.id, o.volId, prix, o.note); o = { volId: '', prix: '', note: '' }; return `Offre ajoutée à ${sel!.nom}.`; }); };
  const retirer = (id: string) => faire(() => { retirerOffreAgence(acteur, id); return 'Offre retirée.'; });
  const dernier = (a: NonNullable<typeof sel>) => { const t = derniereVerification(a); return t === undefined ? '—' : jour(t); };
</script>

<section aria-labelledby="ag-titre" class="volet">
  <div class="col g4"><h2 id="ag-titre" class="t-section htitre">Agences partenaires</h2><p class="t-sec">Agences fictives, suivies de « (exemple) » dans le permis. Sélectionnez une agence pour la vérifier ou gérer ses offres.</p></div>
  {#if agences.length === 0}
    <div class="carte vide"><h3 class="h3">Aucune agence partenaire</h3><p class="t-sec">Aucune agence n’est inscrite pour le moment.</p></div>
  {:else if sel}
    <div class="duo">
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <div class="tableau" role="region" aria-label="Liste des agences" tabindex="0">
        <table>
          <caption class="sr">Agences partenaires : agence, permis d’agent de voyages, vérification, offres publiées et dernière vérification.</caption>
          <thead><tr><th scope="col" class="p16">Agence</th><th scope="col">Permis d’agent de voyages</th><th scope="col">Vérification</th><th scope="col">Offres publiées</th><th scope="col">Dernière vérification</th></tr></thead>
          <tbody>
            {#each agences as a (a.id)}
              {@const s = statutAgence(a)}
              <tr class:actif={a.id === sel.id}>
                <th scope="row"><button type="button" class="selection" aria-pressed={a.id === sel.id} onclick={() => (choix = a.id)}><span class="nom" class:on={a.id === sel.id}>{a.nom}</span><span class="t-sec">{a.ville} · {SOUS[s]}</span></button></th>
                <td class="mono nowrap">{permisDe(a)}</td>
                <td>{@render puce(s)}</td>
                <td class="mono val">{offresPubliees(a)}{#if a.suspendue && offresDeAgence(a.id).length}<span class="t-aide"> ({offresDeAgence(a.id).length} masquée{offresDeAgence(a.id).length > 1 ? 's' : ''})</span>{/if}</td>
                <td class="nowrap">{dernier(a)}</td>
              </tr>
            {/each}
          </tbody>
        </table>
      </div>

      <aside class="carte panneau" aria-labelledby="ag-aside-titre">
        <p class="t-sur">Vérification de l’agence</p>
        <h3 id="ag-aside-titre" class="nomg">{sel.nom}</h3>
        <div>{@render puce(statut)}</div>
        <p class="t-sec" role="status">{NOTICE[statut]}</p>
        <dl class="infos">
          <div class="large"><dt>Permis d’agent de voyages</dt><dd class="mono">{permisDe(sel)}</dd></div>
          <div><dt>Offres publiées</dt><dd class="mono">{offresPubliees(sel)}</dd></div>
          <div><dt>Dernière vérification</dt><dd class="mono">{dernier(sel)}</dd></div>
          {#if statut === 'suspendue' && motifSuspension}<div class="large"><dt>Motif</dt><dd>{motifSuspension}</dd></div>{/if}
        </dl>

        {#if statut === 'en_verification'}
          <div class="filet"></div>
          <fieldset class="controles"><legend class="t-sur">Contrôles</legend>
            <label class="ctl"><input type="checkbox" bind:checked={controles.identite} />Identité de l’entreprise vérifiée</label>
            <label class="ctl"><input type="checkbox" bind:checked={controles.permis} />Permis d’agent de voyages vérifié auprès de l’OPC</label>
            <label class="ctl"><input type="checkbox" bind:checked={controles.cautionnement} />Cautionnement reçu</label>
          </fieldset>
          <p class="t-aide">Vérification d’une agence : processus à définir. Trois contrôles proposés ; NexG-TT exige le permis des agences partenaires.</p>
          <button type="button" class="btn sm" aria-disabled={horsLigne || !tousCoches} onclick={() => tousCoches && approuver()}><Icone nom="verifie" taille={18} trait={2} />Approuver la vitrine</button>
          {#if !tousCoches}<p class="t-aide">Cochez les trois contrôles pour approuver la vitrine.</p>{/if}
        {/if}

        {#if statut !== 'en_verification'}
          <div class="filet"></div>
          <div class="col g12">
            <p class="t-sur">Offres de l’agence</p>
            {#if offres.length}
              <ul class="offres">{#each offres as x (x.id)}{@const v = volDe(x.volId)}
                <li><div class="col"><span class="fort">{v ? `${libelleVol(v)} · ${v.de} → ${v.vers}` : x.volId}</span><span class="t-aide">{fmt(x.prix)}{v ? ` · plafond ${fmt(v.prixNeuf)} (prix équivalent neuf)` : ''}{x.note ? ` · ${x.note}` : ''}</span></div>
                  <button type="button" class="btn sec sm" aria-disabled={horsLigne} aria-label={`Retirer l’offre ${v?.numero ?? ''} de ${sel.nom}`} onclick={() => retirer(x.id)}>Retirer</button></li>{/each}</ul>
            {:else}<p class="t-aide">Aucune offre publiée par cette agence.</p>{/if}
          </div>
          {#if statut === 'verifiee'}
            <form class="col g12 carte2" onsubmit={ajouter} novalidate aria-label="Ajouter une offre d’agence">
              <p class="t-sur">Ajouter une offre</p>
              <div class="champ"><label for="of-vol">Vol</label>
                <select id="of-vol" bind:value={o.volId}><option value="">Choisir un vol</option>{#each volsLibres as v (v.id)}<option value={v.id}>{libelleVol(v)} · {v.de} → {v.vers} · {v.jour} · plafond {fmt(v.prixNeuf)}</option>{/each}</select></div>
              <Champ id="of-prix" label="Prix de l’offre ($, au plus le prix équivalent neuf)" bind:valeur={o.prix} inputmode="numeric" erreur={offreErr} onsaisie={() => (offreErr = '')} />
              <Champ id="of-note" label="Note (facultatif)" bind:valeur={o.note} maxlength={60} />
              <button type="submit" class="btn sm" aria-disabled={horsLigne}><Icone nom="plus" taille={18} trait={2} />Ajouter l’offre</button>
            </form>
          {/if}
        {/if}

        <div class="filet"></div>
        {#if statut === 'suspendue'}
          <button type="button" class="btn sm" aria-disabled={horsLigne} onclick={reactiver}>Réactiver la vitrine</button>
        {:else}
          <Champ id="ag-motif" label="Motif de la suspension (conservé dans le journal d’audit)" bind:valeur={motif} erreur={motifErr} onsaisie={() => (motifErr = '')} />
          <button type="button" class="btn sec sm" aria-disabled={horsLigne} onclick={suspendre}><Icone nom="cadenas" taille={18} />Suspendre la vitrine</button>
        {/if}
        <p class="t-aide">{horsLigne ? 'Hors ligne : les actions d’administration sont indisponibles.' : 'Action sensible, journalisée.'}</p>
      </aside>
    </div>
  {/if}
</section>

{#snippet puce(s: StatutAgence)}<span class="chip {s}"><Icone nom={STATUTS[s].icone} taille={14} trait={2} />{STATUTS[s].texte}</span>{/snippet}

<style>
  .volet { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
  .htitre { font-size: 24px; letter-spacing: 0.04em; text-transform: uppercase; }
  .h3 { font: 700 18px/24px 'Barlow', sans-serif; }
  .vide { display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 40px 24px; }
  .duo { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: start; }
  @media (min-width: 1100px) { .duo { grid-template-columns: minmax(0, 1fr) 380px; } }
  .tableau { overflow-x: auto; background: var(--surface); border: 1px solid var(--line); border-radius: 20px; }
  table { width: 100%; min-width: 720px; border-collapse: collapse; }
  th[scope='col'] { padding: 12px 8px 10px; text-align: left; font: 700 11px/16px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); white-space: nowrap; }
  th.p16 { padding-left: 16px; }
  tbody tr { border-top: 1px solid var(--line); } tbody tr.actif { background: var(--surface2); }
  td, tbody th { padding: 8px; vertical-align: middle; text-align: left; font-weight: inherit; } tbody th { padding: 0; }
  .selection { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; width: 100%; min-height: 64px; padding: 8px 8px 8px 16px; background: transparent; border: 0; color: var(--ink); text-align: left; cursor: pointer; font: inherit; }
  .nom { font: 700 17px/20px 'Barlow', sans-serif; } .nom.on { color: var(--accent); }
  .nowrap { white-space: nowrap; } .val { font-weight: 600; font-size: 15px; }
  .chip { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
  .chip.verifiee { background: var(--ok-soft); color: var(--ok); } .chip.en_verification { background: var(--signal-soft); color: var(--signal-ink); } .chip.suspendue { background: var(--err-soft); color: var(--err); }
  .panneau { display: flex; flex-direction: column; gap: 16px; padding: 18px; min-width: 0; }
  .nomg { font: 700 24px/28px 'Barlow', sans-serif; }
  .infos { margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 12px 16px; } .infos .large { grid-column: 1 / -1; }
  .infos dt { font: 400 13px/18px 'Barlow', sans-serif; color: var(--ink2); } .infos dd { margin: 0; font-weight: 600; font-size: 14px; line-height: 20px; }
  .controles { border: 0; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; } .controles legend { padding: 0 0 8px; }
  .ctl { display: flex; align-items: center; gap: 12px; min-height: 44px; padding: 0 12px; border-radius: 12px; border: 1px solid var(--line-strong); background: var(--surface2); font-weight: 600; cursor: pointer; }
  .ctl input { width: 20px; height: 20px; accent-color: var(--signal); flex: none; }
  .offres { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
  .offres li { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 10px 12px; border-radius: 12px; background: var(--surface2); }
  .fort { font-weight: 700; }

</style>
