<script lang="ts">
  import { agreger, entre } from '../../core/analyses.ts';
  import { jourCourt, moisAnnee, nomMois } from '../../core/dates.ts';
  import { fcfa } from '../../core/money.ts';
  import { totalEcarts } from '../../core/rapprochement.ts';
  import { app, aujourdhui } from '../../data/store.svelte.ts';
  import { consigner, personneCourante } from '../../domain/actions.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import Defile from './Defile.svelte';
  import { ventesDu } from './donnees.ts';
  import { injecterDemo } from './demo.ts';
  import { etatSiege, lireSiege } from './etat.ts';
  import { exporterCsv, nomFichier, nombreLignes, TYPES_EXPORT, type TypeExport } from './exports.ts';
  import { heureCourte, mf, nomGare, gareParId } from './format.ts';
  import Lien from './Lien.svelte';
  import { etatRapprochement } from './rapprochementMonde.ts';
  import Siege from './Siege.svelte';
  import { telecharger } from './telecharger.ts';

  injecterDemo();
  const moi = personneCourante();
  type Mode = 'tout' | 'especes' | 'momo' | 'om';
  let mode = $state<Mode>('tout'), limite = $state(12), depuis = $state<'tout' | 'mois'>('tout'), faits = $state<Partial<Record<TypeExport, number>>>({});

  const auj = $derived(aujourdhui()), mois = $derived(auj.slice(0, 7));
  const debutMois = $derived(new Date(`${mois}-01T00:00:00`).getTime());
  const analyse = $derived(agreger(entre(ventesDu(`${mois}-01`, auj).filter((v) => v.compagnieId === (moi?.compagnieId ?? 'BX')), `${mois}-01`, auj)));
  const moyenDe = (paiementId: string) => app.monde.paiements.find((p) => p.id === paiementId)?.moyen ?? '';
  const billetsMois = $derived(app.monde.billets.filter((b) => (b.statut === 'valide' || b.statut === 'scanne') && b.creeLe >= debutMois));
  const reelMobile = $derived(billetsMois.filter((b) => ['momo', 'om'].includes(moyenDe(b.paiementId))).reduce((s, b) => s + b.prix, 0));
  const part = $derived(Math.max(0, analyse.recette - analyse.recetteReelle));
  const mobile = $derived(Math.round(reelMobile + 0.4 * part)), especes = $derived(analyse.recette - mobile);
  const caisses = $derived(app.monde.caisses.filter((c) => c.jour.startsWith(mois)));
  const caissesValidees = $derived(caisses.filter((c) => c.statut === 'validee').length), caissesAValider = $derived(caisses.filter((c) => c.statut === 'fermee').length), caissesOuvertes = $derived(caisses.filter((c) => c.statut === 'ouverte' || c.statut === 'bloquee').length);
  const rap = $derived(etatRapprochement());
  const refsEcart = $derived(new Set(rap.ecarts.map((e) => e.tx.paiementRef)));

  const caisseDe = (id?: string) => app.monde.caisses.find((c) => c.id === id);
  const journal = $derived(app.monde.billets.filter((b) => ['valide', 'scanne', 'rembourse'].includes(b.statut)).sort((a, b) => b.creeLe - a.creeLe)
    .map((b) => {
      const p = app.monde.paiements.find((x) => x.id === b.paiementId), c = caisseDe(b.caisseId), agent = app.monde.personnes.find((x) => x.id === c?.agentId), vendeur = app.monde.personnes.find((x) => x.id === b.acheteurId);
      const moyen = p?.moyen ?? '', libMode = moyen === 'especes' ? 'espèces' : moyen === 'momo' ? 'MoMo' : moyen === 'om' ? 'OM' : moyen || '—';
      let rapproche = { txt: 'ok', ton: 'ok' };
      if (b.statut === 'rembourse') rapproche = { txt: 'remboursé', ton: 'inf' };
      else if (moyen === 'momo' || moyen === 'om') rapproche = p && refsEcart.has(p.ref) ? { txt: 'manque', ton: 'er' } : p?.statut === 'ok' ? { txt: 'ok', ton: 'ok' } : { txt: 'en attente', ton: 'wa' };
      else if (moyen === 'especes') rapproche = !c ? { txt: 'ok', ton: 'ok' } : c.statut === 'validee' ? { txt: 'ok', ton: 'ok' } : c.statut === 'ouverte' ? { txt: 'caisse ouverte', ton: 'inf' } : { txt: 'à valider', ton: 'wa' };
      const jour = new Date(b.creeLe).toISOString().slice(0, 10) === auj;
      return { id: b.id, quand: jour ? heureCourte(b.creeLe) : `${jourCourt(new Date(b.creeLe).toISOString().slice(0, 10))} ${heureCourte(b.creeLe)}`, gare: c ? `${nomGare(gareParId(c.gareId))}${agent ? ` · ${agent.prenom}` : ''}` : b.canal === 'app' ? 'App voyageur' : vendeur?.gareId ? `${nomGare(gareParId(vendeur.gareId))} · ${vendeur.prenom}` : b.canal, piece: b.code, moyen, mode: libMode, montant: b.prix, rapproche };
    }).filter((l) => mode === 'tout' || l.moyen === mode));
  const modes: [Mode, string][] = [['tout', 'tout'], ['especes', 'espèces'], ['momo', 'MoMo'], ['om', 'OM']];

  const NOMS = ['Journal verrouillé au 31 oct', 'Bordereaux de dépôt rapprochés', 'MoMo / OM rapprochés', 'Export vers Sage envoyé'];
  const etapes = $derived.by(() => { const base = lireSiege().cloture[mois] ?? [true, true, false, false]; const e = [...base]; e[2] = rap.ecarts.length === 0; return e; });
  const avancement = $derived(etapes.filter(Boolean).length * 25);
  function basculer(i: number) {
    const e = etatSiege(), base = [...(e.cloture[mois] ?? [true, true, false, false])]; base[i] = !base[i]; e.cloture[mois] = base;
    consigner('cloture', `Clôture de ${nomMois(auj)} : « ${NOMS[i]} » ${base[i] ? 'fait' : 'à refaire'}`, moi?.id);
  }
  function exporter(type: TypeExport) {
    const filtre = depuis === 'mois' ? { depuis: debutMois } : {}, n = nombreLignes(type, app.monde, filtre);
    telecharger(nomFichier(type, auj), exporterCsv(type, app.monde, filtre)); faits[type] = n;
    montrer(`${n} ligne${n > 1 ? 's' : ''} exportée${n > 1 ? 's' : ''} · ${nomFichier(type, auj)}`);
  }
</script>

<Siege actif="comptable" section="comptable">
  <div class="top">
    <div class="col"><h1 class="ttl">Comptabilité</h1><span class="t13 mut">{moi?.prenom ?? '—'} · cabinet Fiduciaire du Centre · {moisAnnee(auj)}</span></div>
    <div class="row g8 wrapf">
      <label class="sr" for="periode-export">Période de l’export</label>
      <select id="periode-export" class="in" style="width: auto" bind:value={depuis}><option value="tout">Tout l’historique</option><option value="mois">Mois en cours</option></select>
      {#each TYPES_EXPORT as t (t.id)}<button type="button" class="b s sm {faits[t.id] !== undefined ? 'p' : ''}" onclick={() => exporter(t.id)}>{t.nom} CSV{faits[t.id] !== undefined ? ' ✓' : ''}</button>{/each}
    </div>
  </div>
  <p class="t12 mut3">Fichiers CSV (séparateur « ; », UTF-8 avec BOM) à ouvrir dans Excel. Les cellules commençant par = + - @ sont neutralisées contre l’injection de formules.</p>

  <div class="kpis">
    <div class="gl ac"><span class="lab">Recette du mois</span><span class="ttl t24">{mf(analyse.recette)}</span><span class="t12 mut">au {jourCourt(auj)} · {mf(analyse.recetteReelle)} réels</span></div>
    <div class="gl"><span class="lab">Espèces déposées</span><span class="ttl t24">{mf(especes)}</span><span class="t12 {caissesAValider || caissesOuvertes ? 'wac' : 'okc'}">{caissesValidees} validée{caissesValidees > 1 ? 's' : ''}{caissesAValider ? ` · ${caissesAValider} à valider` : ''}{caissesOuvertes ? ` · ${caissesOuvertes} ouverte${caissesOuvertes > 1 ? 's' : ''}` : ''}</span></div>
    <div class="gl"><span class="lab">MoMo / OM</span><span class="ttl t24">{mf(mobile)}</span>{#if rap.ecarts.length}<Lien href="/siege/comptable/rapprochement" class="t12 erc">{rap.ecarts.length} sans correspondance</Lien>{:else}<span class="t12 okc">tout est rapproché</span>{/if}</div>
    <div class="gl"><span class="lab">Clôture mensuelle</span><span class="ttl t24">{avancement} %</span><div class="bar" role="img" aria-label="Clôture à {avancement} %" style="margin-top: 6px"><i style="width: {avancement}%"></i></div></div>
  </div>
  <p class="tag-demo" role="note">Démonstration : la recette reconstitue les ventes d’après les sièges déjà pris ; la part non saisie est répartie 60 % espèces / 40 % mobile.</p>

  <div class="c21">
    <div class="gl">
      <div class="row sp wrapf"><span class="t15 b7">Journal des ventes</span><div class="row g8 wrapf"><span class="pl">{journal.length} ligne{journal.length > 1 ? 's' : ''}</span><span class="t12 mut" id="lib-filtre">filtre :</span>
        <div class="row g4" role="group" aria-labelledby="lib-filtre">{#each modes as [m, n] (m)}<button type="button" class="ch {mode === m ? 'on' : ''}" aria-pressed={mode === m} onclick={() => { mode = m; limite = 12; }}>{n}</button>{/each}</div></div></div>
      <Defile label="Journal des ventes" ><table class="tbl" style="margin-top: 8px"><thead><tr><th scope="col">Heure</th><th scope="col">Gare · guichet</th><th scope="col">Pièce</th><th scope="col">Mode</th><th scope="col" class="r">Montant</th><th scope="col">Rapproché</th></tr></thead><tbody>
        {#each journal.slice(0, limite) as r (r.id)}<tr><td class="mono">{r.quand}</td><td>{r.gare}</td><td class="mono">{r.piece}</td><td>{r.mode}</td><td class="r mono">{fcfa(r.montant)}</td><td><span class="pl {r.rapproche.ton}">{r.rapproche.txt}</span></td></tr>
        {:else}<tr><td colspan="6" class="vide-etat">Aucune vente {mode === 'tout' ? '' : 'avec ce mode de paiement '}pour le moment. Les billets vendus au guichet ou dans l’application apparaissent ici.</td></tr>{/each}
      </tbody></table></Defile>
      {#if journal.length > limite}<button type="button" class="b g sm" style="margin-top: 6px" onclick={() => (limite += 25)}>Afficher plus ({journal.length - limite} restantes)</button>{/if}
    </div>
    <div class="col g12">
      <div class="gl">
        <span class="t15 b7">Rapprochement MoMo</span>
        <div class="col" style="gap: 0; margin-top: 6px">
          <div class="li"><span class="grow t13">Transactions opérateurs (MTN, Orange)</span><span class="mono b7">{fcfa(rap.total)}</span></div>
          <div class="li"><span class="grow t13">Ventes AfriMove rapprochées</span><span class="mono b7">{fcfa(rap.rapproches)}</span></div>
          <div class="li"><span class="grow t13 b7">Sans correspondance</span><span class="mono b7 {rap.ecarts.length ? 'erc' : 'okc'}">{rap.ecarts.length} · {fcfa(totalEcarts(rap.ecarts))} F</span></div>
        </div>
        <Lien href="/siege/comptable/rapprochement" class="b p sm" style="margin-top: 10px">{rap.ecarts.length ? `Traiter les ${rap.ecarts.length}` : 'Voir le rapprochement'}</Lien>
      </div>
      <div class="gl">
        <span class="t15 b7">Clôture de {nomMois(auj)}</span>
        <div class="col" style="gap: 0; margin-top: 6px">
          {#each NOMS as n, i (n)}<div class="li"><span class="pl {etapes[i] ? 'ok' : 'wa'}">{etapes[i] ? 'fait' : 'à faire'}</span><span class="grow t13">{n}</span>
            {#if i === 2}<Lien href="/siege/comptable/rapprochement" class="b g sm xs">{etapes[i] ? 'voir' : 'traiter'}</Lien>{:else}<button type="button" class="b g sm xs" aria-label="{etapes[i] ? 'Annuler' : 'Faire'} : {n}" onclick={() => basculer(i)}>{etapes[i] ? 'annuler' : 'faire'}</button>{/if}</div>{/each}
        </div>
      </div>
    </div>
  </div>
</Siege>
