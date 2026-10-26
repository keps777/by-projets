<script lang="ts">
  import Ecran from '../../ui/Ecran.svelte';
  import Icone from '../../ui/Icone.svelte';
  import { app } from '../../data/store.svelte.ts';
  import { fmt, fmtPct, fmtSigne } from '../../core/argent.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { compteCourant } from '../../domain/compte.ts';
  import { jourCourt } from '../voyager/format.ts';
  import { va } from '../voyager/lien.ts';
  import { pointsLigne, serieValeur } from '../voyager/portefeuille.ts';
  import { reseau, tempsReel } from '../voyager/temps.svelte.ts';
  import CarteBillet from './CarteBillet.svelte';
  import Pic from './Pic.svelte';
  import { vuePortefeuille, type OngletPf } from './portefeuille.ts';

  /** Portefeuille (verso, nuit) : prix équivalent total des droits actifs, onglets Actifs / En revente / Historique, calendrier, solde, import. */
  const compte = $derived(compteCourant());
  const temps = tempsReel(60_000);
  const vue = $derived(compte ? vuePortefeuille(app.monde, compte.id, temps.maintenant) : undefined);
  const ligne = $derived(compte ? pointsLigne(serieValeur(app.monde, compte.id, temps.maintenant), 110, 48, 6) : null);
  const choisi = param('onglet');
  let onglet = $state<OngletPf>(choisi === 'revente' || choisi === 'historique' ? choisi : 'actifs');
  const ag = $derived(vue?.agregat);
  const ONGLETS: { id: OngletPf; lib: string }[] = [{ id: 'actifs', lib: 'Actifs' }, { id: 'revente', lib: 'En revente' }, { id: 'historique', lib: 'Historique' }];
  const compteur = (id: OngletPf): number | undefined => (id === 'actifs' ? vue?.actifs.length : id === 'revente' ? vue?.nbRevente : undefined);
  const versVoyager = () => { app.session.face = 'voyage'; aller('/'); };
  const dernierRetrait = $derived(vue?.revente.length ? vue.revente[0].retrait : '');
</script>

<Ecran face="nuit" onglet="portefeuille">
  <div class="bascule" role="group" aria-label="Face de l’application">
    <button type="button" aria-pressed="false" onclick={versVoyager}><Icone nom="soleil" taille={16} trait={2} />Voyager</button>
    <button type="button" aria-pressed="true" aria-current="page"><Icone nom="lune" taille={16} trait={2} />Mes actifs</button>
  </div>
  <h1 class="titre-ecran">Portefeuille</h1>
  {#if !reseau.enLigne}<p class="hors" role="status"><Icone nom="hors_ligne" taille={18} />Hors ligne : prix indicatifs du dernier relevé enregistré sur cet appareil.</p>{/if}

  {#if vue && ag}
    <section class="resume" aria-labelledby="pf-titre">
      <div class="haut"><h2 id="pf-titre" class="t-sur">{vue.titre}</h2><span class="puce"><Icone nom="info" taille={14} trait={2} />Indicatif</span></div>
      {#if ag.nb}
        <div class="valeur">
          <div class="col g2"><span class="lib">Prix équivalent aujourd’hui</span><span class="gros" data-testid="equivalent-total">{fmt(ag.equivalent)}</span>
            <span class="paye">Payé <span data-testid="paye-total">{fmt(ag.paye)}</span> · écart
              <span class="ecart {ag.ecart.sens}" data-testid="ecart-total"><Pic nom={ag.ecart.sens === 'baisse' ? 'baisse' : 'hausse'} taille={14} trait={2.25} />{fmtSigne(ag.ecart.abs)}</span></span></div>
          {#if ligne}<svg width="110" height="48" viewBox="0 0 110 48" aria-hidden="true" class="spark"><polyline points={ligne.points} fill="none" stroke="var(--up)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><circle cx={ligne.dernier.x} cy={ligne.dernier.y} r="3.5" fill="var(--up)" /></svg>{/if}
        </div>
      {:else}
        <p class="vide-resume">Achetez un billet neuf ou en revente : votre premier droit de voyage apparaîtra ici, avec son prix équivalent du jour.</p>
      {/if}
      <p class="note">Somme des prix d’un billet neuf équivalent, pour vos droits actifs. Indicatif : ce n’est ni une offre de rachat ni un gain garanti.</p>
    </section>

    <div class="liens">
      <a href="/echeances" onclick={(e) => va(e, '/echeances')}><Icone nom="calendrier" taille={22} />Calendrier des échéances</a>
      <a href="/solde" onclick={(e) => va(e, '/solde')}><Icone nom="portefeuille" taille={22} />Solde et versements</a>
    </div>

    <div class="onglets" role="group" aria-label="Afficher mes droits de voyage">
      {#each ONGLETS as o (o.id)}
        <button type="button" aria-pressed={onglet === o.id} onclick={() => (onglet = o.id)}>{o.lib}{#if compteur(o.id) !== undefined}<span class="n">({compteur(o.id)})</span>{/if}</button>
      {/each}
    </div>

    {#if onglet === 'actifs'}
      <section class="liste" aria-label="Droits actifs, triés par date de départ">
        {#each vue.actifs as c (c.droitId)}
          <div class="groupe">
            <CarteBillet carte={c} />
            {#if c.statut === 'a_nommer'}
              <a class="echeance" href="/nommer/{c.droitId}" onclick={(e) => va(e, `/nommer/${c.droitId}`)}><Icone nom="horloge" taille={18} trait={2} /><span class="grow">Nommez le voyageur avant le {c.echeance}</span><span class="j">{c.jEcheance}</span><Pic nom="chevron" taille={18} trait={1.75} /></a>
            {/if}
          </div>
        {:else}
          <div class="vide"><span class="ico"><Icone nom="billet" taille={20} /></span><span class="col g4"><span class="v-t">Aucun droit de voyage actif</span><span class="v-s">Un billet neuf ou acheté en revente devient un droit de voyage : il apparaît ici avec son prix équivalent du jour.</span></span></div>
          <a class="btn" href="/rechercher" onclick={(e) => va(e, '/rechercher')}>Chercher un voyage</a>
        {/each}
      </section>
    {:else if onglet === 'revente'}
      <section class="liste" aria-label="Droits en revente">
        {#each vue.revente as c (c.droitId)}<CarteBillet carte={c} revente />{/each}
        {#if vue.revente.length}
          <p class="info"><Icone nom="info" taille={16} trait={1.75} /><span>Retrait automatique de l’annonce à J-1 ({dernierRetrait}). Commission prélevée seulement si la vente a lieu — taux en hypothèse.</span></p>
        {:else if !vue.bagages.length}
          <div class="vide"><span class="ico"><Pic nom="etiquette" taille={20} /></span><span class="col g4"><span class="v-t">Aucune annonce en cours</span><span class="v-s">Ouvrez un droit et choisissez « Revendre » : vous fixez le prix, sous le plafond du prix équivalent neuf.</span></span></div>
        {/if}
        {#if vue.bagages.length}
          <div class="bagages">
            <h2 class="t-sur">Droit de bagage · même vol</h2>
            {#each vue.bagages as b (b.bagageId)}
              <a class="etiquette" href="/bagages/vendre" onclick={(e) => va(e, '/bagages/vendre')} aria-label={`Bagage en soute ${b.numeroVol}, ${b.vers}, ${b.kg} kg, en vente ${fmt(b.prix)}`}>
                <span class="oeillet" aria-hidden="true"></span>
                <span class="e-corps">
                  <span class="e-ent">Bagage en soute · {b.jour}</span>
                  <span class="e-ligne"><span class="e-vers">{b.vers}</span><span class="e-num">{b.numeroVol} · {b.kg} kg</span></span>
                  <span class="e-statut"><Pic nom="etiquette" taille={14} />En vente <span class="m">{fmt(b.prix)}</span></span>
                </span>
                <span class="barres" aria-hidden="true"></span>
              </a>
              <p class="info"><Icone nom="info" taille={16} trait={1.75} /><span>{b.note}</span></p>
            {/each}
          </div>
        {/if}
      </section>
    {:else}
      <section class="liste" aria-label="Historique des transactions">
        {#if vue.transactions.length}
          <ol class="trans">
            {#each vue.transactions as t (t.id)}
              <li><span class="t-date">{t.date}</span><span class="col g2"><span class="t-titre">{t.titre}</span><span class="t-sous">{t.sous}</span></span><span class="t-montant">{t.montant}</span></li>
            {/each}
          </ol>
        {/if}
        {#each vue.cedes as c (c.droitId)}
          <article class="cede" aria-label={`${c.de} vers ${c.vers}, ${c.natureLib.toLowerCase()}`}>
            <span class="c-haut"><span class="c-route">{c.de} → {c.vers}</span><span class="puce">{c.natureLib}</span></span>
            <span class="t-sous">{c.date}</span>
            <span class="t-sous">Payé {fmt(c.prixPaye)}{#if c.prixCession !== undefined} · {c.natureLib.toLowerCase()} {fmt(c.prixCession)}{/if} · {c.detenteurs} détenteur{c.detenteurs > 1 ? 's' : ''} dans la chaîne</span>
            {#if c.ouvrable}<a class="c-lien" href="/droit/{c.droitId}" onclick={(e) => va(e, `/droit/${c.droitId}`)}>Voir le droit<Pic nom="chevron" taille={16} /></a>{/if}
          </article>
        {:else}
          <div class="vide"><span class="ico"><Icone nom="billet" taille={20} /></span><span class="col g4"><span class="v-t">Aucun billet cédé ni voyagé pour l’instant</span><span class="v-s">Vos billets cédés et voyagés apparaîtront ici, avec leur chaîne de détention.</span></span></div>
        {/each}
      </section>
    {/if}

    <div class="importer">
      <a class="btn-imp" href="/importer" onclick={(e) => va(e, '/importer')}><Pic nom="importer" taille={20} />Importer un billet acheté ailleurs</a>
      <p class="aide-c">Acheté directement chez une compagnie ? Confiez-le à NexG-TT, selon les compagnies partenaires.</p>
    </div>
    <p class="aide-c">Prix indicatifs. Un droit de voyage n’est pas un placement financier.</p>
  {/if}
</Ecran>

<style>
  .bascule { display: flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface2); border: 1px solid var(--line); margin-top: -4px; }
  .bascule button { flex: 1; min-height: 44px; padding: 0 14px; border: 0; border-radius: 999px; display: flex; align-items: center; justify-content: center; gap: 6px; background: transparent; color: var(--ink2); font: 700 13px/1 'Barlow', sans-serif; letter-spacing: 0.08em; text-transform: uppercase; cursor: pointer; }
  .bascule button[aria-pressed='true'] { background: var(--signal); color: #0d0e11; }
  .titre-ecran { font: 600 34px/36px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; text-transform: uppercase; margin-top: -6px; }
  .hors { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; background: var(--surface2); font: 500 13px/18px 'Barlow', sans-serif; color: var(--ink2); }
  .col { display: flex; flex-direction: column; min-width: 0; } .g2 { gap: 2px; } .g4 { gap: 4px; } .grow { flex: 1; min-width: 0; }
  .resume { display: flex; flex-direction: column; gap: 14px; padding: 18px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .haut { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 28px; }
  .valeur { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
  .lib { font-size: 13px; color: var(--ink2); }
  .gros { font: 600 clamp(26px, 8.5vw, 30px)/34px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .paye { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 6px; font-size: 13px; color: var(--ink2); }
  .ecart { display: inline-flex; align-items: center; gap: 3px; font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .ecart.hausse { color: var(--up); } .ecart.baisse { color: var(--down); } .ecart.stable { color: var(--ink2); }
  .spark { flex: 0 1 110px; min-width: 0; max-width: 30%; height: auto; }
  .note { padding-top: 12px; border-top: 1px solid var(--line); font-size: 12px; line-height: 17px; color: var(--ink3); }
  .vide-resume { font-size: 14px; line-height: 20px; color: var(--ink2); }
  .liens { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin-top: -8px; }
  .liens a { display: flex; align-items: center; gap: 10px; min-height: 52px; padding: 8px 12px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); font: 600 14px/18px 'Barlow', sans-serif; }
  .liens a :global(svg) { color: var(--accent); flex: none; }
  .onglets { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
  .onglets button { display: flex; align-items: center; justify-content: center; gap: 5px; min-height: 44px; border: 0; border-radius: 10px; background: transparent; color: var(--ink2); font: 700 14px/1.1 'Barlow', sans-serif; cursor: pointer; padding: 0 4px; }
  .onglets button[aria-pressed='true'] { background: var(--ink); color: #0d0e11; }
  .n { font: 500 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .liste { display: flex; flex-direction: column; gap: 18px; padding-top: 4px; }
  .groupe { display: flex; flex-direction: column; gap: 8px; }
  .echeance { display: flex; align-items: center; gap: 10px; min-height: 48px; padding: 8px 12px; border-radius: 12px; background: var(--signal-soft); color: var(--accent); font: 600 14px/18px 'Barlow', sans-serif; }
  .echeance .j { font: 600 13px/1 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .info { display: flex; align-items: flex-start; gap: 8px; font-size: 13px; line-height: 18px; color: var(--ink2); } .info :global(svg) { margin-top: 1px; }
  .vide { display: flex; align-items: flex-start; gap: 12px; padding: 16px; border-radius: 16px; border: 1px dashed var(--line-strong); }
  .ico { width: 40px; height: 40px; flex: none; border-radius: 12px; background: var(--surface2); color: var(--ink2); display: grid; place-items: center; }
  .v-t { font-size: 15px; font-weight: 600; } .v-s { font-size: 13px; line-height: 18px; color: var(--ink2); }
  .bagages { display: flex; flex-direction: column; gap: 10px; padding-top: 8px; }
  .etiquette { position: relative; display: flex; min-height: 108px; margin-left: 14px; border-radius: 0 16px 16px 0; background: #fff; color: #121418; clip-path: polygon(20px 0, 100% 0, 100% 100%, 20px 100%, 0 calc(100% - 20px), 0 20px); }
  .etiquette:focus-visible { outline: 3px solid var(--focus); outline-offset: 2px; }
  .oeillet { position: relative; width: 44px; flex: none; background: #f1f2f4; border-right: 2px dashed #e2e4e9; }
  .oeillet::after { content: ''; position: absolute; left: 13px; top: calc(50% - 8px); width: 16px; height: 16px; box-sizing: border-box; border-radius: 999px; background: var(--bg); border: 3px solid #c9cdd5; }
  .e-corps { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 12px 10px 12px 14px; }
  .e-ent { font: 700 11px/14px 'Barlow', sans-serif; letter-spacing: 0.12em; text-transform: uppercase; color: #555c6b; }
  .e-ligne { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; } .e-vers { font: 700 40px/38px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.02em; }
  .e-num { font: 600 13px/16px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
  .e-statut { align-self: flex-start; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; background: #e3f1fa; color: #0b6fa4; font: 700 12px/1 'Barlow', sans-serif; letter-spacing: 0.06em; text-transform: uppercase; }
  .e-statut .m { font-family: 'IBM Plex Mono', ui-monospace, monospace; letter-spacing: 0; font-variant-numeric: tabular-nums; }
  .barres { width: 22px; flex: none; margin: 14px 14px 14px 0; background: repeating-linear-gradient(0deg, #121418 0 2px, transparent 2px 4px, #121418 4px 5px, transparent 5px 8px); }
  .trans { list-style: none; margin: 0; padding: 0 16px; border-radius: 20px; background: var(--surface); border: 1px solid var(--line); }
  .trans li { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-height: 64px; padding: 6px 0; } .trans li + li { border-top: 1px solid var(--line); }
  .t-date { font: 400 12px/16px 'IBM Plex Mono', ui-monospace, monospace; color: var(--ink2); font-variant-numeric: tabular-nums; }
  .t-titre { font-size: 15px; font-weight: 600; } .t-sous { font-size: 13px; line-height: 18px; color: var(--ink3); }
  .t-montant { font: 600 15px/18px 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; text-align: right; }
  .cede { display: flex; flex-direction: column; gap: 4px; padding: 14px 16px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .c-haut { display: flex; align-items: center; justify-content: space-between; gap: 8px; } .c-route { font: 700 24px/26px 'Barlow Condensed', 'Arial Narrow', sans-serif; letter-spacing: 0.03em; }
  .c-lien { display: inline-flex; align-items: center; gap: 4px; min-height: 44px; font: 600 14px/1 'Barlow', sans-serif; color: var(--accent); }
  .importer { display: flex; flex-direction: column; gap: 8px; }
  .btn-imp { display: flex; align-items: center; justify-content: center; gap: 8px; min-height: 52px; border-radius: 14px; background: var(--surface2); color: var(--ink); border: 1px solid var(--line-strong); font: 700 16px/1.2 'Barlow', sans-serif; text-align: center; padding: 0 12px; }
  .aide-c { text-align: center; font-size: 12px; line-height: 17px; color: var(--ink3); }
</style>
