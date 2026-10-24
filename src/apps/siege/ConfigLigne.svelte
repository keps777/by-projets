<script lang="ts">
  import { untrack } from 'svelte';
  import { concurrence } from '../../core/analyses.ts';
  import { fcfa } from '../../core/money.ts';
  import { app } from '../../data/store.svelte.ts';
  import { personneCourante } from '../../domain/actions.ts';
  import type { ClasseBus, Ligne } from '../../domain/types.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { creerLigne, departsFuturs, ErreurValidation, groupeLigne, modifierLigne, optionsLigne, validerLigne, validerNouvelleLigne, PRIX_MAX, PRIX_MIN, type PatchLigne } from './actions.ts';
  import Defile from './Defile.svelte';
  import { gareParId, nomGare } from './format.ts';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  interface Brouillon { prix: Record<string, number>; actif: Record<string, boolean>; horaires: Record<string, string[]>; jours: boolean[]; arrets: boolean; colis: boolean }
  const moi = personneCourante();
  const id = $derived(param('ligne')), nouvelle = $derived(param('nouvelle') === '1' || !id);
  const groupe = $derived<Ligne[]>(id ? groupeLigne(id) : []);
  let brouillon = $state<Brouillon | null>(null), modifie = $state(false), erreurs = $state<Record<string, string>>({}), confirmer = $state(false);
  let ajout = $state(false), heureNouvelle = $state('10:00'), classeNouvelle = $state<ClasseBus>('Classique');

  function initialiser(g: Ligne[], prixDemande: string | null) {
    if (!g.length) { brouillon = null; return; }
    const o = optionsLigne(g[0].id);
    brouillon = { prix: Object.fromEntries(g.map((l) => [l.id, l.prix])), actif: Object.fromEntries(g.map((l) => [l.id, l.actif])), horaires: Object.fromEntries(g.map((l) => [l.id, [...l.horaires]])), jours: [...o.jours], arrets: o.arrets, colis: o.colis };
    modifie = false; erreurs = {}; confirmer = false;
    const p = Number(prixDemande), cible = g.find((l) => l.id === id);
    if (prixDemande && Number.isFinite(p) && cible && p !== cible.prix) { brouillon.prix[cible.id] = p; modifie = true; }
  }
  $effect(() => { const g = groupe, p = param('prix'); untrack(() => initialiser(g, p)); });

  const classique = $derived(groupe.find((l) => l.classe === 'Classique')), vip = $derived(groupe.find((l) => l.classe === 'VIP'));
  const tete = $derived(groupe[0]);
  const lignesTab = $derived(brouillon ? groupe.flatMap((l) => brouillon!.horaires[l.id].map((h) => ({ h, l }))).sort((a, b) => a.h.localeCompare(b.h)) : []);
  const busDe = (l: Ligne, h: string) => { const d = app.monde.departs.find((x) => x.ligneId === l.id && x.heure === h); return d ? (app.monde.bus.find((b) => b.id === d.busId)?.immat ?? d.busId) : 'à affecter'; };
  const nbBus = $derived(new Set(app.monde.departs.filter((d) => groupe.some((l) => l.id === d.ligneId)).map((d) => d.busId)).size);
  const joursTxt = $derived(brouillon ? (brouillon.jours.every(Boolean) ? 'tous les jours' : JOURS.filter((_, i) => brouillon!.jours[i]).join(' ')) : '');
  const duree = $derived(tete ? `${Math.floor(tete.dureeMin / 60)} h${tete.dureeMin % 60 ? ` ${String(tete.dureeMin % 60).padStart(2, '0')}` : ''}` : '');
  const conc = $derived(classique ? concurrence(app.monde.lignes, classique) : null);
  const compagnie = (cid: string) => app.monde.compagnies.find((c) => c.id === cid)?.nom ?? cid;

  /** Effet de l'enregistrement sur les départs à venir et les billets vendus (pour demander confirmation). */
  const apercu = $derived.by(() => {
    if (!brouillon) return { departs: 0, billets: 0 };
    let departs = 0, billets = 0;
    for (const l of groupe) {
      const retires = l.horaires.filter((h) => !brouillon!.horaires[l.id].includes(h)), suspendre = l.actif && !brouillon.actif[l.id];
      for (const d of departsFuturs(l.id)) {
        const jourOff = !brouillon.jours[(new Date(`${d.jour}T12:00:00`).getDay() + 6) % 7];
        if (d.statut === 'annule' || !(suspendre || retires.includes(d.heure) || (jourOff && l.actif))) continue;
        departs++; billets += app.monde.billets.filter((b) => b.departId === d.id && b.statut === 'valide').length;
      }
    }
    return { departs, billets };
  });

  const marquer = () => { modifie = true; confirmer = false; };
  function pas(lid: string, delta: number) {
    if (!brouillon) return;
    const b = brouillon, c = classique?.id, v = vip?.id;
    let nv = Math.max(PRIX_MIN, Math.min(PRIX_MAX, b.prix[lid] + delta));
    if (lid === v && c) nv = Math.max(nv, b.prix[c]);
    b.prix[lid] = nv; if (lid === c && v && b.prix[v] < nv) b.prix[v] = nv; marquer();
  }
  function retirer(lid: string, h: string) { brouillon!.horaires[lid] = brouillon!.horaires[lid].filter((x) => x !== h); marquer(); }
  function ajouterDepart() {
    if (!brouillon) return;
    const cible = groupe.find((l) => l.classe === classeNouvelle) ?? groupe[0], e = validerLigne({ horaires: [...brouillon.horaires[cible.id], heureNouvelle] });
    if (e.horaires) { erreurs = { ...erreurs, horaires: e.horaires }; return; }
    const { horaires: _h, ...reste } = erreurs; void _h; erreurs = reste; brouillon.horaires[cible.id] = [...brouillon.horaires[cible.id], heureNouvelle].sort(); ajout = false; marquer();
  }
  function enregistrer() {
    if (!brouillon) return;
    const b = brouillon, patchs: [string, PatchLigne][] = groupe.map((l) => [l.id, { prix: b.prix[l.id], actif: b.actif[l.id], horaires: b.horaires[l.id], options: { jours: b.jours, arrets: b.arrets, colis: b.colis } }]);
    for (const [, p] of patchs) { const e = validerLigne(p); if (Object.keys(e).length) { erreurs = e; return; } }
    if (apercu.billets > 0 && !confirmer) { confirmer = true; return; }
    try {
      let annules = 0, rembourses = 0, crees = 0;
      for (const [lid, p] of patchs) { const r = modifierLigne(lid, p, moi?.id); annules += r.annules; rembourses += r.rembourses; crees += r.crees; }
      initialiser(groupeLigne(id!), null);
      montrer(`Ligne enregistrée · visible par les gares en 1 min${annules ? ` · ${annules} départ(s) annulé(s), ${rembourses} billet(s) remboursé(s)` : ''}${crees ? ` · ${crees} départ(s) créé(s)` : ''}`);
      if (param('prix')) aller(`/siege/config/ligne?ligne=${id}`, { remplacer: true });
    } catch (e) { if (e instanceof ErreurValidation) erreurs = e.champs; else throw e; }
  }

  // ---- création d'une ligne
  const villes = $derived([...new Set(app.monde.gares.map((g) => g.ville))]);
  let n = $state({ compagnieId: moi?.compagnieId ?? 'BX', classe: 'Classique' as ClasseBus, de: 'Yaoundé', vers: 'Douala', gareDe: 'mvan', gareVers: 'akwa', prix: 6000, dureeMin: 210, horaires: [] as string[], heure: '08:00' });
  const garesDe = $derived(app.monde.gares.filter((g) => g.ville === n.de)), garesVers = $derived(app.monde.gares.filter((g) => g.ville === n.vers));
  function choisirVille(sens: 'de' | 'vers', ville: string) { n[sens] = ville; const g = app.monde.gares.find((x) => x.ville === ville); if (g) n[sens === 'de' ? 'gareDe' : 'gareVers'] = g.id; }
  function creer() {
    const spec = { compagnieId: n.compagnieId, de: n.de, vers: n.vers, gareDe: n.gareDe, gareVers: n.gareVers, classe: n.classe, prix: n.prix, dureeMin: n.dureeMin, horaires: n.horaires };
    erreurs = validerNouvelleLigne(spec); if (Object.keys(erreurs).length) return;
    try { const l = creerLigne(spec, moi?.id); montrer(`Ligne ${l.de} → ${l.vers} créée`); aller(`/siege/config/ligne?ligne=${l.id}`); } catch (e) { if (e instanceof ErreurValidation) erreurs = e.champs; else throw e; }
  }
  function ajouterHoraire() { const e = validerLigne({ horaires: [...n.horaires, n.heure] }); if (e.horaires) { erreurs = { ...erreurs, horaires: e.horaires }; return; } n.horaires = [...n.horaires, n.heure].sort(); delete erreurs.horaires; }
</script>

<Siege actif="config">
  {#if nouvelle}
    <div class="top">
      <div class="row g12"><Lien href="/siege/config" class="ib" aria-label="Retour à la configuration"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Lien><div class="col"><h1 class="ttl">Nouvelle ligne</h1><span class="t13 mut">La ligne et ses départs apparaissent dans l’app voyageur dès l’enregistrement.</span></div></div>
      <button type="button" class="b p sm" onclick={creer}>Créer la ligne</button>
    </div>
    {#if Object.keys(erreurs).length}<p class="alerte" role="alert">{Object.values(erreurs)[0]}</p>{/if}
    <form class="c2" onsubmit={(e) => { e.preventDefault(); creer(); }} novalidate>
      <div class="gl col g12">
        <div class="fld"><label for="n-co">Compagnie</label><select id="n-co" class="in" bind:value={n.compagnieId}>{#each app.monde.compagnies as c (c.id)}<option value={c.id}>{c.nom}</option>{/each}</select></div>
        <div class="fld"><span class="etq" id="n-cl">Classe</span><div class="row g6" role="group" aria-labelledby="n-cl">{#each ['Classique', 'VIP'] as c (c)}<button type="button" class="ch {n.classe === c ? 'on' : ''}" aria-pressed={n.classe === c} onclick={() => (n.classe = c as ClasseBus)}>{c}</button>{/each}</div></div>
        <div class="gridp">
          <div class="fld"><label for="n-de">Ville de départ</label><select id="n-de" class="in" value={n.de} onchange={(e) => choisirVille('de', e.currentTarget.value)}>{#each villes as v (v)}<option>{v}</option>{/each}</select></div>
          <div class="fld"><label for="n-gde">Gare de départ</label><select id="n-gde" class="in" aria-invalid={!!erreurs.gareDe} bind:value={n.gareDe}>{#each garesDe as g (g.id)}<option value={g.id}>{nomGare(g)}</option>{/each}</select>{#if erreurs.gareDe}<span class="err">{erreurs.gareDe}</span>{/if}</div>
          <div class="fld"><label for="n-vers">Ville d’arrivée</label><select id="n-vers" class="in" aria-invalid={!!erreurs.vers} value={n.vers} onchange={(e) => choisirVille('vers', e.currentTarget.value)}>{#each villes as v (v)}<option>{v}</option>{/each}</select>{#if erreurs.vers}<span class="err">{erreurs.vers}</span>{/if}</div>
          <div class="fld"><label for="n-gvers">Gare d’arrivée</label><select id="n-gvers" class="in" aria-invalid={!!erreurs.gareVers} bind:value={n.gareVers}>{#each garesVers as g (g.id)}<option value={g.id}>{nomGare(g)}</option>{/each}</select>{#if erreurs.gareVers}<span class="err">{erreurs.gareVers}</span>{/if}</div>
        </div>
      </div>
      <div class="gl col g12">
        <div class="gridp">
          <div class="fld"><label for="n-prix">Prix (F)</label><input id="n-prix" class="in" type="number" inputmode="numeric" min={PRIX_MIN} max={PRIX_MAX} step="500" aria-invalid={!!erreurs.prix} bind:value={n.prix} />{#if erreurs.prix}<span class="err">{erreurs.prix}</span>{/if}</div>
          <div class="fld"><label for="n-duree">Durée (minutes)</label><input id="n-duree" class="in" type="number" inputmode="numeric" min="30" max="1440" step="5" aria-invalid={!!erreurs.dureeMin} bind:value={n.dureeMin} />{#if erreurs.dureeMin}<span class="err">{erreurs.dureeMin}</span>{/if}</div>
        </div>
        <div class="fld"><label for="n-heure">Départs de la journée</label>
          <div class="row g8"><input id="n-heure" class="in" type="time" bind:value={n.heure} style="width: 140px" /><button type="button" class="b s sm" onclick={ajouterHoraire}>+ Ajouter</button></div>
          {#if erreurs.horaires}<span class="err" role="alert">{erreurs.horaires}</span>{/if}
          <div class="row g6 wrapf" style="margin-top: 6px">{#each n.horaires as h (h)}<button type="button" class="ch on" aria-label="Retirer le départ de {h}" onclick={() => (n.horaires = n.horaires.filter((x) => x !== h))}>{h} ✕</button>{:else}<span class="t12 mut">Aucun départ pour l’instant : tu pourras en ajouter après la création.</span>{/each}</div></div>
      </div>
    </form>
  {:else if !tete || !brouillon}
    <div class="gl vide-etat"><p>Cette ligne n’existe pas (ou plus).</p><Lien href="/siege/config" class="b p sm" style="margin-top: 10px">Retour aux lignes</Lien></div>
  {:else}
    <div class="top">
      <div class="row g12"><Lien href="/siege/config" class="ib" aria-label="Retour à la configuration"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Lien>
        <div class="col"><h1 class="ttl">{tete.de} → {tete.vers}</h1><span class="t13 mut">{compagnie(tete.compagnieId)} · {nomGare(gareParId(tete.gareDe))} → {nomGare(gareParId(tete.gareVers))} · {duree} · {nbBus} bus affectés</span></div></div>
      <div class="row g8 wrapf"><span class="pl {modifie ? 'wa' : 'ok'}" role="status">{modifie ? 'modifié' : 'enregistré'}</span><button type="button" class="b p sm" disabled={!modifie} onclick={enregistrer}>{!modifie ? 'Enregistré ✓' : confirmer ? `Confirmer · ${apercu.billets} billet(s) remboursé(s)` : 'Enregistrer · visible en 1 min'}</button></div>
    </div>
    {#if Object.keys(erreurs).length}<p class="alerte" role="alert">{Object.values(erreurs).join(' ')}</p>{/if}
    {#if apercu.departs > 0}<p class="info" role="status">À l’enregistrement, {apercu.departs} départ{apercu.departs > 1 ? 's' : ''} à venir {apercu.departs > 1 ? 'seront annulés' : 'sera annulé'}{apercu.billets ? ` et ${apercu.billets} billet${apercu.billets > 1 ? 's' : ''} vendu${apercu.billets > 1 ? 's' : ''} remboursé${apercu.billets > 1 ? 's' : ''} intégralement` : ''}.</p>{/if}

    <div class="c2">
      <div class="gl">
        <div class="row sp wrapf"><span class="t15 b7">Départs</span><button type="button" class="b s sm" aria-expanded={ajout} onclick={() => (ajout = !ajout)}>+ Ajouter un départ</button></div>
        {#if ajout}<div class="row g8 wrapf" style="margin-top: 10px"><label class="sr" for="h-new">Heure du départ</label><input id="h-new" class="in" type="time" bind:value={heureNouvelle} style="width: 130px" />
          <label class="sr" for="c-new">Classe</label><select id="c-new" class="in" style="width: auto" bind:value={classeNouvelle}>{#each groupe as l (l.id)}<option value={l.classe}>{l.classe}</option>{/each}</select><button type="button" class="b p sm" onclick={ajouterDepart}>Ajouter</button></div>{/if}
        <Defile label="Départs de la ligne"><table class="tbl" style="margin-top: 8px"><thead><tr><th scope="col">Heure</th><th scope="col">Classe</th><th scope="col">Bus</th><th scope="col">Jours</th><th scope="col"><span class="sr">Action</span></th></tr></thead><tbody>
          {#each lignesTab as r (r.l.id + r.h)}<tr><td class="mono b7">{r.h}</td><td>{r.l.classe}</td><td class="t13 mut">{busDe(r.l, r.h)}</td><td class="t13 mut">{joursTxt}</td><td class="r"><button type="button" class="b g sm xs" aria-label="Retirer le départ de {r.h} ({r.l.classe})" onclick={() => retirer(r.l.id, r.h)}>retirer</button></td></tr>
          {:else}<tr><td colspan="5" class="vide-etat">Aucun départ : la ligne n’a pas d’horaires.</td></tr>{/each}
        </tbody></table></Defile>
      </div>
      <div class="col g12">
        <div class="gl"><span class="t15 b7">Tarifs</span>
          <div class="col" style="gap: 0; margin-top: 6px">
            {#each groupe as l (l.id)}<div class="li"><span class="col grow"><span class="t14 b6">{l.classe}</span><span class="t12 mut">{l.classe === 'VIP' ? '3 sièges par rangée · clim' : conc ? (brouillon.prix[l.id] <= conc.prix ? `aligné sur ${compagnie(conc.compagnieId)} (${fcfa(conc.prix)} F)` : `${compagnie(conc.compagnieId)} est à ${fcfa(conc.prix)} F`) : 'aucune concurrence sur cette liaison'}</span></span>
              <div class="stp"><button type="button" aria-label="Baisser le prix {l.classe} de 500 F" onclick={() => pas(l.id, -500)}>−</button><b aria-live="polite">{fcfa(brouillon.prix[l.id])} F</b><button type="button" aria-label="Augmenter le prix {l.classe} de 500 F" onclick={() => pas(l.id, 500)}>+</button></div></div>{/each}
            <div class="li"><span class="col grow"><span class="t14 b6">Enfant − 5 ans</span></span><span class="mono b7">gratuit sur genoux</span></div>
          </div>
          <p class="t12 mut3" style="margin-top: 6px">Le nouveau prix s’applique aux départs à venir ; les billets déjà vendus gardent leur prix.</p>
        </div>
        <div class="gl"><span class="t15 b7">Jours et options</span>
          <div class="row g6 wrapf" style="margin-top: 8px" role="group" aria-label="Jours de circulation">{#each JOURS as j, i (j)}<button type="button" class="ch {brouillon.jours[i] ? 'on' : ''}" aria-pressed={brouillon.jours[i]} onclick={() => { brouillon!.jours[i] = !brouillon!.jours[i]; marquer(); }}>{j}</button>{/each}</div>
          <div class="col" style="gap: 0; margin-top: 6px">
            {#each groupe as l (l.id)}<div class="li"><span class="grow t14">Ligne {l.classe} active</span><button type="button" class="sw {brouillon.actif[l.id] ? 'on' : ''}" role="switch" aria-checked={brouillon.actif[l.id]} aria-label="Ligne {l.classe} active" onclick={() => { brouillon!.actif[l.id] = !brouillon!.actif[l.id]; marquer(); }}></button></div>{/each}
            <div class="li"><span class="grow t14">Arrêts en route vendables (convoyeur)</span><button type="button" class="sw {brouillon.arrets ? 'on' : ''}" role="switch" aria-checked={brouillon.arrets} aria-label="Arrêts vendables" onclick={() => { brouillon!.arrets = !brouillon!.arrets; marquer(); }}></button></div>
            <div class="li"><span class="grow t14">Colis acceptés en soute</span><button type="button" class="sw {brouillon.colis ? 'on' : ''}" role="switch" aria-checked={brouillon.colis} aria-label="Colis" onclick={() => { brouillon!.colis = !brouillon!.colis; marquer(); }}></button></div>
          </div>
        </div>
      </div>
    </div>
  {/if}
</Siege>
