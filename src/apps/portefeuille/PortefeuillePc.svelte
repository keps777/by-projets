<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt, fmtPct, fmtSigne } from '../../core/argent.ts';
  import { departDe } from '../../core/regles.ts';
  import { compagnieDe } from '../../domain/marche.ts';
  import { heureDe, jourCourt, jourSemaine } from '../voyager/format.ts';
  import { va } from '../voyager/lien.ts';
  import { chaineDe, type Etape } from './droit.ts';
  import { historiquePf, pointsSvg } from './historique.ts';
  import Pic from './Pic.svelte';
  import { volOf, type CarteDroit, type VuePortefeuille } from './portefeuille.ts';

  /** Portefeuille, variante PC (≥ 900 px, planche WebPortefeuille) : bandeau d'échéance, résumé + courbe, tableau des droits et panneau latéral du droit sélectionné (billet, chaîne de détention, actions). */
  let { vue, maintenant, nom }: { vue: VuePortefeuille; maintenant: number; nom: string } = $props();
  const lignes = $derived<CarteDroit[]>([...vue.actifs, ...vue.revente]);
  let choisi = $state<string>('');
  const sel = $derived(lignes.find((c) => c.droitId === choisi) ?? lignes[0]);
  const ag = $derived(vue.agregat);
  const hist = $derived(historiquePf(app.monde, app.session.compteId ?? '', maintenant));
  const alerte = $derived(vue.actifs.filter((c) => c.statut === 'a_nommer').sort((a, b) => a.echeanceMs - b.echeanceMs)[0]);
  const volDe = (c: CarteDroit) => volOf(app.monde, { volId: c.volId } as never)!;
  const depart = (c: CarteDroit) => { const v = volDe(c); return departDe(v.jour, v.heureDepart); };
  const dateLongue = (ms: number) => `${jourSemaine(ms, { avecAnnee: true })}, ${heureDe(ms)}`;
  const joursRestants = (ms: number) => Math.max(0, Math.floor((ms - maintenant) / 86_400_000));
  const dans = (ms: number) => { const j = joursRestants(ms); return j === 0 ? 'aujourd’hui' : `dans ${j} jour${j > 1 ? 's' : ''}`; };
  const echeanceCourte = (ms: number) => `${jourCourt(ms)} · ${heureDe(ms)}`;
  const selVol = $derived(sel ? volDe(sel) : undefined);
  const selDroit = $derived(sel ? app.monde.droits.find((d) => d.id === sel.droitId) : undefined);
  const chaine = $derived<Etape[]>(selDroit ? chaineDe(app.monde, selDroit, maintenant).filter((e) => e.repere !== 'depart' && e.repere !== 'aujourdhui') : []);
  const ville = (code: string) => app.monde.aeroports.find((a) => a.code === code)?.ville ?? code;
  const sensDe = (c: CarteDroit) => (c.ecart.sens === 'hausse' ? 'hausse' : c.ecart.sens === 'baisse' ? 'baisse' : 'stable');
  const nbDetenus = $derived(vue.actifs.length);
  const enVenteLib = $derived(vue.revente.length ? ` · ${vue.revente.length} en vente` : '');
  const duree = (v: NonNullable<typeof selVol>) => `${v.escales.length ? `${v.escales.length} escale${v.escales.length > 1 ? 's' : ''}` : 'Direct'} · ${Math.floor(v.dureeMin / 60)} h${v.dureeMin % 60 ? ` ${String(v.dureeMin % 60).padStart(2, '0')}` : ''}`;
</script>

<div class="pc-pf pc-1344">
  <section class="titre" aria-labelledby="pf-h1">
    <div class="col"><h1 id="pf-h1">Portefeuille</h1><p class="sous">{nom} · {nbDetenus} droit{nbDetenus > 1 ? 's' : ''} de voyage détenu{nbDetenus > 1 ? 's' : ''}{enVenteLib}</p></div>
    <div class="boutons">
      <a class="b-sec" href="/importer" onclick={(e) => va(e, '/importer')}><Pic nom="importer" taille={18} trait={1.75} />Importer un billet</a>
      <a class="b-sec" href="/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1" onclick={(e) => va(e, '/resultats?de=YUL&vers=CDG&jour=2026-12-18&n=1')}><Pic nom="hausse" taille={18} trait={1.75} />Voir le marché</a>
    </div>
  </section>

  <div class="zone">
    <div class="gauche">
      {#if alerte}
        <a class="bandeau" href="/nommer/{alerte.droitId}" onclick={(e) => va(e, `/nommer/${alerte.droitId}`)}>
          <Icone nom="horloge" taille={18} trait={2} />
          <span class="texte">{alerte.de} → {alerte.vers} : nommez le voyageur avant le {dateLongue(alerte.echeanceMs)} ({dans(alerte.echeanceMs)}). Après, plus aucune revente ni transfert.</span>
          <span class="cta">Nommer le voyageur<Pic nom="chevron" taille={16} /></span>
        </a>
      {/if}

      <section class="resume" aria-labelledby="sum-title">
        <div class="chiffres">
          <div class="col g2"><h2 id="sum-title" class="t-sur">Prix équivalent aujourd’hui</h2><span class="gros" data-testid="equivalent-total">{fmt(ag.equivalent)}</span></div>
          <dl>
            <div><dt>Payé</dt><dd data-testid="paye-total">{fmt(ag.paye)}</dd></div>
            <div><dt>Écart</dt><dd class="ecart {ag.ecart.sens}" data-testid="ecart-total"><Pic nom={ag.ecart.sens === 'baisse' ? 'baisse' : 'hausse'} taille={16} trait={2.25} />{fmtSigne(ag.ecart.abs)}</dd></div>
          </dl>
          <p class="indic"><span class="pastille">Indicatif</span><span>Prix d’un billet neuf équivalent aujourd’hui, pour les {ag.nb} droit{ag.nb > 1 ? 's' : ''} détenu{ag.nb > 1 ? 's' : ''} (hors billet en vente). Ni prix de revente garanti, ni gain.</span></p>
        </div>
        {#if hist}
          <div class="graphe">
            <div class="entete-g"><p class="legende-t">{hist.titre}</p>
              <div class="legende" aria-hidden="true"><span><i class="tr plein"></i>Prix équivalent</span><span><i class="tr tirets"></i>Montant payé</span></div></div>
            <div class="corps-g">
              <div class="axe-y" aria-hidden="true">{#each hist.graduations as g, i (g)}<span style="top: {i * 27.6 - 1}px">{fmt(g)}</span>{/each}</div>
              <div class="col grow">
                <svg width="100%" height="150" viewBox="0 0 1000 150" preserveAspectRatio="none" role="img" aria-label="Courbe du prix équivalent et du montant payé depuis le premier achat" style="display:block; overflow:visible">
                  {#each [6, 33.6, 61.2, 88.8, 116.4] as y (y)}<line x1="0" y1={y} x2="1000" y2={y} stroke="#1A1D23" stroke-width="1" vector-effect="non-scaling-stroke" />{/each}
                  <line x1="0" y1="144" x2="1000" y2="144" stroke="#2C303A" stroke-width="1" vector-effect="non-scaling-stroke" />
                  <polygon points="0,144 {pointsSvg(hist.equiv, hist.max)} 1000,144" fill="rgba(98,199,255,0.08)" />
                  <polyline points={pointsSvg(hist.paye, hist.max, true)} fill="none" stroke="#8C93A3" stroke-width="2" stroke-dasharray="6 5" vector-effect="non-scaling-stroke" />
                  <polyline points={pointsSvg(hist.equiv, hist.max)} fill="none" stroke="#62C7FF" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
                </svg>
                <div class="axe-x" aria-hidden="true">{#each hist.mois as m (m.pct)}<span style="left: {m.pct * 100}%">{m.lib}</span>{/each}<span style="right: 0">{jourCourt(hist.fin)}</span></div>
              </div>
            </div>
            <p class="paliers">{hist.paliers}</p>
          </div>
        {/if}
      </section>

      <section class="tableau" aria-labelledby="tbl-title">
        <div class="t-ent"><h2 id="tbl-title">Mes droits de voyage</h2><p>Sélectionnez une ligne pour voir le billet et sa chaîne de détention.</p></div>
        <div class="defile">
          <table>
            <caption class="sr">Droits de voyage de {nom} : prix payé, prix équivalent aujourd’hui, écart, statut et échéance de finalisation.</caption>
            <thead><tr><th scope="col">Trajet</th><th scope="col">Date</th><th scope="col">Compagnie</th><th scope="col" class="d">Payé</th><th scope="col" class="d">Prix équivalent</th><th scope="col" class="d">Écart</th><th scope="col">Statut</th><th scope="col">Échéance de finalisation</th><th scope="col">Actions</th></tr></thead>
            <tbody>
              {#each lignes as c (c.droitId)}
                {@const v = volDe(c)}
                <tr class:sel={sel?.droitId === c.droitId} onclick={() => (choisi = c.droitId)}>
                  <th scope="row"><button type="button" aria-pressed={sel?.droitId === c.droitId} onclick={() => (choisi = c.droitId)}><span class="route" class:signal={sel?.droitId === c.droitId}>{c.de} → {c.vers}</span><span class="ville">{c.ville}{v.escales.length ? ` · via ${v.escales.join(', ')}` : ''}</span></button></th>
                  <td class="nw"><span class="l1">{jourCourt(depart(c))} {new Date(depart(c)).getFullYear()}</span><span class="l2">{jourSemaine(depart(c)).split(' ')[0]} · {v.heureDepart}</span></td>
                  <td class="nw">{compagnieDe(v).nom}</td>
                  <td class="d mono">{fmt(c.prixPaye)}</td>
                  <td class="d mono fort">{fmt(c.equivalent)}</td>
                  <td class="d mono ecart {sensDe(c)}"><span class="l1">{fmtSigne(c.ecart.abs)}</span><span class="l2">{fmtPct(c.ecart.pct)}</span></td>
                  <td><span class="statut {c.statut}">{c.statutLib}</span>{#if c.statut === 'en_vente' && c.annonce}<span class="l2 bloc">à {fmt(c.annonce)}</span>{/if}</td>
                  <td class="nw"><span class="l1" class:signal={c.statut === 'a_nommer'}>{echeanceCourte(c.echeanceMs)}</span><span class="l2">{dans(c.echeanceMs)}</span></td>
                  <td>
                    <span class="actions">
                      {#if c.statut === 'en_vente'}<a class="mini" href="/droit/{c.droitId}" onclick={(e) => va(e, `/droit/${c.droitId}`)}>Gérer l’annonce</a>
                      {:else}
                        <a class="mini" href="/revendre/{c.droitId}" onclick={(e) => va(e, `/revendre/${c.droitId}`)}>Revendre</a>
                        <a class="mini" class:principal={c.statut === 'a_nommer'} href="/nommer/{c.droitId}" onclick={(e) => va(e, `/nommer/${c.droitId}`)}>Nommer</a>
                        <a class="mini" href="/transferer/{c.droitId}" onclick={(e) => va(e, `/transferer/${c.droitId}`)}>Transférer</a>
                      {/if}
                    </span>
                  </td>
                </tr>
              {:else}
                <tr><td colspan="9" class="vide-t">Aucun droit de voyage pour l’instant. <a href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Chercher un voyage</a></td></tr>
              {/each}
            </tbody>
          </table>
        </div>
        <p class="note-t">Écart = prix équivalent aujourd’hui − prix payé. Échéance de finalisation : 24 h avant le départ ; ensuite, plus aucune transaction sur ce droit.</p>
      </section>
    </div>

    {#if sel && selVol}
      <aside class="panneau" aria-labelledby="panel-title">
        <div class="col g4" aria-live="polite"><p class="t-sur">Droit sélectionné</p><h2 id="panel-title">{sel.de} → {sel.vers}</h2><p class="villes">{ville(sel.de)} → {sel.ville} · {compagnieDe(selVol).nom}</p></div>
        <div class="billet">
          <div class="b-haut">
            <div class="b-route"><span class="code">{sel.de}</span><span class="fil" aria-hidden="true"><i></i><Icone nom="avion" taille={18} /><i></i></span><span class="code">{sel.vers}</span></div>
            <div class="b-hor"><span class="col"><b>{selVol.heureDepart}</b>{ville(sel.de)}</span><span class="dur">{duree(selVol)}</span><span class="col fin"><b>{selVol.heureArrivee}{#if selVol.plusJours > 0} <small>(+{selVol.plusJours})</small>{/if}</b>{sel.ville}</span></div>
            <dl class="b-infos"><div><dt>Date</dt><dd>{jourSemaine(depart(sel), { avecAnnee: true })}</dd></div><div><dt>Vol</dt><dd>{compagnieDe(selVol).nom} {selVol.numero.split(' ')[1]}</dd></div><div><dt>Détenteur</dt><dd>{nom} (vous)</dd></div><div><dt>Voyageur</dt><dd>{selDroit?.voyageur ? `${selDroit.voyageur.prenom} ${selDroit.voyageur.nom[0] ?? ''}.` : 'À nommer'}</dd></div></dl>
          </div>
          <div class="perfore" aria-hidden="true"><span class="trait"></span><span class="enc g"></span><span class="enc d"></span></div>
          <div class="b-bas">
            <div class="col g6"><span class="chip {sel.statut}">{sel.statutLib}</span><span class="ref">Réf. <b>{selDroit?.ref}</b></span></div>
            <div class="col fin g2"><span class="ref">Prix équivalent · payé {fmt(sel.prixPaye)}</span><span class="b-prix">{fmt(sel.equivalent)}</span></div>
          </div>
        </div>
        <section class="chaine" aria-labelledby="chain-title">
          <h3 id="chain-title"><Icone nom="horloge" taille={16} trait={1.75} />Chaîne de détention</h3>
          <ol>
            {#each chaine as e, i (e.id)}
              <li><span class="rail" aria-hidden="true"><span class="pt" class:futur={e.repere === 'echeance'}></span>{#if i < chaine.length - 1}<span class="ligne"></span>{/if}</span>
                <span class="txt"><span class="ligne1"><span>{e.repere === 'echeance' ? 'Nommer le voyageur' : `${e.titre}${e.detail.includes('·') ? ` · ${e.detail.split(' · ')[0]}` : ''}`}</span>{#if e.repere !== 'echeance' && e.detail.includes(' · ')}<span class="m">{e.detail.split(' · ').slice(1).join(' · ')}</span>{/if}</span>
                  <span class="meta">{e.repere === 'echeance' ? `Au plus tard le ${e.date} ${new Date(selVol ? departDe(selVol.jour, selVol.heureDepart) : 0).getFullYear()}, ${e.heure}` : e.date}</span></span></li>
            {/each}
          </ol>
          <p class="note">Chaque transaction est inscrite au registre interne de NexG-TT, qui reste titulaire de la réservation auprès de la compagnie jusqu’à la finalisation.</p>
        </section>
        {#if sel.statut === 'en_vente'}
          <div class="col g8">
            <p class="info"><Icone nom="info" taille={18} trait={2} /><span>En vente à {fmt(sel.annonce ?? 0)}{selDroit?.annonce ? ` depuis le ${jourCourt(selDroit.annonce.depuis)}` : ''}. Retirez l’annonce pour nommer un voyageur ou transférer ce droit.</span></p>
            <a class="b-grand sec" href="/droit/{sel.droitId}" onclick={(e) => va(e, `/droit/${sel.droitId}`)}><Pic nom="etiquette" taille={20} trait={1.75} />Gérer l’annonce</a>
          </div>
        {:else}
          <div class="col g8">
            <a class="b-grand" href="/nommer/{sel.droitId}" onclick={(e) => va(e, `/nommer/${sel.droitId}`)}><Pic nom="identite" taille={20} trait={1.75} />Nommer le voyageur</a>
            <a class="b-grand sec" href="/revendre/{sel.droitId}" onclick={(e) => va(e, `/revendre/${sel.droitId}`)}><Pic nom="etiquette" taille={20} trait={1.75} />Revendre</a>
            <a class="b-lien" href="/transferer/{sel.droitId}" onclick={(e) => va(e, `/transferer/${sel.droitId}`)}><Pic nom="echange" taille={18} trait={1.75} />Transférer à un autre compte</a>
            <p class="note">Revente : prix plafonné (règle à définir) et commission de 10 à 20 % — hypothèses.</p>
          </div>
        {/if}
      </aside>
    {/if}
  </div>
</div>

<style>
  .col { display: flex; flex-direction: column; min-width: 0; } .g2 { gap: 2px; } .g4 { gap: 4px; } .g6 { gap: 6px; } .g8 { gap: 8px; } .grow { flex: 1; } .fin { align-items: flex-end; text-align: right; }
  .pc-pf { display: flex; flex-direction: column; gap: 18px; }
  .titre { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px 24px; }
  h1 { font: 600 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; text-transform: uppercase; letter-spacing: 0.01em; }
  .sous { font-size: 13px; font-weight: 600; color: var(--ink2); margin-top: 6px; }
  .boutons { display: flex; flex-wrap: wrap; gap: 8px; }
  .b-sec { display: inline-flex; align-items: center; justify-content: center; gap: 8px; height: 48px; padding: 0 18px; border-radius: 14px; background: var(--surface2); color: var(--ink); border: 1px solid var(--line-strong); font: 700 15px/1 'Barlow', sans-serif; }
  .zone { display: grid; grid-template-columns: minmax(0, 1fr); gap: 24px; align-items: start; }
  @media (min-width: 1240px) { .zone { grid-template-columns: minmax(0, 1fr) 300px; } .panneau { position: sticky; top: 16px; } }
  .gauche { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
  .bandeau { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; min-height: 48px; padding: 10px 14px; border-radius: 14px; background: var(--signal-soft); color: var(--accent); font: 600 14px/20px 'Barlow', sans-serif; }
  .bandeau .texte { flex: 1 1 260px; } .cta { display: inline-flex; align-items: center; gap: 6px; font-weight: 700; }
  .resume { display: flex; flex-wrap: wrap; gap: 20px 32px; padding: 20px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .chiffres { flex: 1 1 240px; min-width: 0; display: flex; flex-direction: column; gap: 14px; max-width: 320px; }
  .gros { font: 600 44px/50px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  dl { margin: 0; } .chiffres dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; padding-top: 14px; border-top: 1px solid var(--line); }
  .chiffres dt { font-size: 13px; color: var(--ink2); } .chiffres dd { margin: 0; display: flex; align-items: center; gap: 4px; font: 600 20px/26px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ecart.hausse { color: var(--up); } .ecart.baisse { color: var(--down); } .ecart.stable { color: var(--ink2); }
  .indic { display: flex; gap: 8px; font-size: 12px; line-height: 17px; color: var(--ink3); } .pastille { flex: none; align-self: flex-start; display: inline-flex; align-items: center; height: 22px; padding: 0 8px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font: 700 11px/1 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; }
  .graphe { flex: 999 1 420px; min-width: 0; display: flex; flex-direction: column; gap: 10px; }
  .entete-g { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 6px 16px; } .legende-t { font-size: 13px; font-weight: 600; color: var(--ink2); }
  .legende { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--ink2); } .legende span { display: inline-flex; align-items: center; gap: 6px; } .tr { width: 18px; height: 0; border-top: 2px solid var(--up); } .tr.tirets { border-top: 2px dashed var(--ink3); }
  .corps-g { display: flex; gap: 8px; } .axe-y { position: relative; flex: none; width: 56px; height: 150px; font: 400 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); text-align: right; } .axe-y span { position: absolute; right: 0; white-space: nowrap; }
  .axe-x { position: relative; height: 16px; margin-top: 6px; font: 400 11px/14px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink3); } .axe-x span { position: absolute; white-space: nowrap; }
  .paliers { font-size: 12px; line-height: 17px; color: var(--ink3); }
  .tableau { display: flex; flex-direction: column; gap: 10px; }
  .t-ent { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 4px 16px; } .t-ent h2 { font: 600 24px/28px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .t-ent p { font-size: 13px; color: var(--ink2); }
  .defile { overflow-x: auto; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  table { width: 100%; min-width: 960px; border-collapse: collapse; font-variant-numeric: tabular-nums; }
  thead tr { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ink3); }
  th[scope='col'] { padding: 12px 6px 8px; text-align: left; font-weight: 700; } th[scope='col']:first-child { padding-left: 16px; } th[scope='col']:last-child { padding-right: 16px; } .d { text-align: right; }
  tbody tr { cursor: pointer; } tbody tr:hover, tbody tr.sel { background: var(--surface2); } tbody td, tbody th { border-top: 1px solid var(--line); padding: 8px 6px; vertical-align: middle; font-size: 14px; text-align: left; } tbody th { padding: 0; font-weight: inherit; } tbody td.d { text-align: right; }
  tbody th button { display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; width: 100%; min-height: 64px; padding: 8px 8px 8px 16px; background: transparent; border: 0; color: var(--ink); text-align: left; cursor: pointer; }
  .route { font: 700 20px/22px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; white-space: nowrap; } .route.signal { color: var(--accent); } .ville { font-size: 13px; color: var(--ink2); }
  .nw { white-space: nowrap; } .l1 { display: block; font-size: 14px; font-weight: 600; } .l2 { font-size: 12px; color: var(--ink3); } .bloc { display: block; } .l1.signal { color: var(--accent); }
  .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-size: 15px; font-weight: 500; white-space: nowrap; } .mono.fort { font-weight: 600; } td.ecart { font-weight: 600; } td.ecart .l1 { font-size: 15px; font-family: inherit; } td.ecart .l2 { color: inherit; }
  .statut { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: var(--surface3); color: var(--ink2); font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; }
  .statut.a_nommer { background: var(--signal-soft); color: var(--accent); } .statut.en_vente { background: rgba(98, 199, 255, 0.12); color: var(--up); } .statut.nomme { background: var(--ok-soft); color: var(--ok); }
  .actions { display: flex; flex-wrap: nowrap; gap: 4px; }
  .mini { display: inline-flex; align-items: center; height: 44px; padding: 0 9px; border-radius: 10px; background: var(--surface2); border: 1px solid var(--line-strong); color: var(--ink); font: 600 13px/1 'Barlow', sans-serif; white-space: nowrap; } .mini.principal { background: var(--signal); border-color: var(--signal); color: #0d0e11; font-weight: 700; }
  .vide-t { padding: 24px 16px !important; color: var(--ink2); } .note-t { font-size: 12px; line-height: 17px; color: var(--ink3); }
  .panneau { display: flex; flex-direction: column; gap: 16px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); min-width: 0; }
  .panneau h2 { font: 600 30px/32px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.04em; text-transform: uppercase; } .villes { font-size: 13px; color: var(--ink2); }
  .billet { background: #fff; color: #121418; border-radius: 18px; position: relative; overflow: hidden; }
  .b-haut { padding: 16px 16px 14px; display: flex; flex-direction: column; gap: 10px; } .b-route { display: flex; align-items: center; gap: 8px; } .code { font: 700 44px/44px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .fil { flex: 1; display: flex; align-items: center; gap: 6px; color: #555c6b; } .fil i { flex: 1; border-top: 2px dotted #c9cdd5; }
  .b-hor { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; color: #555c6b; } .b-hor b { font: 600 15px/20px 'IBM Plex Mono', ui-monospace, monospace; color: #121418; } .b-hor small { font: 500 12px/1 'Barlow', sans-serif; } .dur { align-self: flex-end; text-align: center; }
  .b-infos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px 12px; padding: 10px 12px; border-radius: 12px; background: #f1f2f4; font-size: 12px; color: #555c6b; } .b-infos dd { margin: 0; font-size: 14px; font-weight: 600; color: #121418; }
  .perfore { position: relative; height: 2px; } .perfore .trait { position: absolute; left: 14px; right: 14px; top: 0; border-top: 2px dashed #e2e4e9; } .perfore .enc { position: absolute; top: -10px; width: 22px; height: 22px; border-radius: 999px; background: var(--surface); } .perfore .g { left: -11px; } .perfore .d { right: -11px; }
  .b-bas { padding: 14px 16px 16px; display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 10px; } .ref { font-size: 12px; color: #555c6b; } .ref b { font: 600 12px/1 'IBM Plex Mono', ui-monospace, monospace; color: #121418; } .b-prix { font: 600 24px/28px 'IBM Plex Mono', ui-monospace, monospace; }
  .chip { align-self: flex-start; display: inline-flex; align-items: center; height: 26px; padding: 0 10px; border-radius: 999px; background: #eef0f3; color: #555c6b; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; white-space: nowrap; } .chip.a_nommer { background: #ffd23f; color: #121418; } .chip.en_vente { background: #e3f1fa; color: #0b6fa4; } .chip.nomme { background: #dff3ea; color: #0b6a47; }
  .chaine h3 { display: flex; align-items: center; gap: 8px; font: 700 12px/16px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ink2); margin-bottom: 10px; } .chaine ol { list-style: none; margin: 0; padding: 0; }
  .chaine li { display: flex; gap: 10px; } .rail { flex: none; width: 12px; display: flex; flex-direction: column; align-items: center; gap: 3px; padding-top: 4px; } .pt { width: 10px; height: 10px; border-radius: 999px; background: var(--ink); border: 2px solid var(--ink); } .pt.futur { background: transparent; border-color: var(--accent); } .ligne { flex: 1; width: 2px; background: var(--line-strong); }
  .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; padding-bottom: 12px; } .ligne1 { display: flex; justify-content: space-between; gap: 8px; font-size: 14px; font-weight: 600; } .m { font: 400 13px/18px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); white-space: nowrap; } .meta { font-size: 13px; color: var(--ink3); }
  .note { font-size: 12px; line-height: 17px; color: var(--ink3); margin-top: 4px; }
  .b-grand { display: flex; align-items: center; justify-content: center; gap: 8px; height: 52px; border-radius: 14px; background: var(--signal); color: #0d0e11; font: 700 16px/1 'Barlow', sans-serif; } .b-grand.sec { background: var(--surface2); color: var(--ink); border: 1px solid var(--line-strong); }
  .b-lien { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; color: var(--accent); font: 600 15px/1.2 'Barlow', sans-serif; text-align: center; }
  .info { display: flex; gap: 8px; padding: 10px 12px; border-radius: 12px; background: rgba(98, 199, 255, 0.12); border: 1px solid rgba(98, 199, 255, 0.4); color: var(--up); font: 600 13px/18px 'Barlow', sans-serif; }
  a:focus-visible, button:focus-visible { outline: 2px solid var(--focus); outline-offset: 2px; }
</style>
