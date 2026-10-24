<script lang="ts">
  import { aller } from '../../router.svelte.ts';
  import { connecter, personne, personneCourante } from '../../domain/actions.ts';
  import { fcfa } from '../../core/money.ts';
  import { COMMISSION_RELAIS, erreursBoutique, formaterTel, gainMensuelRelais, libelleHoraires, normaliserTel, TYPES_BOUTIQUE, type TypeBoutique } from '../../core/relais.ts';
  import Mobile from '../../ui/Mobile.svelte';
  import { dockVoyageur } from '../../ui/dockVoyageur.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { candidatureDe, candidaterRelais, erreursFicheRelais, modifierBoutique, repondreCandidature, type ErreursFiche } from './actions.ts';
  import { boutiqueDe, type Candidature, type FicheRelais } from './etat.ts';
  import Pic from './Pic.svelte';

  const moi = personneCourante();
  const modifier = moi?.role === 'relais';
  const existante = modifier ? boutiqueDe(moi!.id) : undefined;
  const deja = $derived(modifier ? undefined : candidatureDe(moi?.id, 'relais'));

  let etape = $state(0), envoyee = $state<Candidature | undefined>(undefined), pin = $state('');
  let nom = $state(existante?.nom ?? ''), type = $state<TypeBoutique>(existante?.type ?? 'Boutique'), adresse = $state(existante?.adresse ?? '');
  let ouverture = $state(existante?.ouverture ?? 7), fermeture = $state(existante?.fermeture ?? 21), h24 = $state(existante?.h24 ?? false), jours = $state<number[]>(existante?.jours ?? [1, 2, 3, 4, 5, 6]);
  let editHoraires = $state(false);
  let photos = $state<boolean[]>(modifier ? [true, true, true] : [false, false, false]), cni = $state(modifier);
  let titulaire = $state(moi ? `${moi.prenom} ${moi.nom}`.trim() : ''), moyen = $state<'momo' | 'om'>('momo'), tel = $state(modifier ? moi!.tel : ''), colisParJour = $state(8), charte = $state(modifier);
  let tente = $state([false, false, false]), erreurGenerale = $state('');

  const boutique = $derived({ nom, type, adresse, ouverture, fermeture, h24, jours });
  const fiche = $derived<FicheRelais>({ boutique, titulaire, moyen, tel, photos: photos.filter(Boolean).length, cni, colisParJour });
  const toutes = $derived<ErreursFiche>({ ...erreursFicheRelais(fiche), charte: charte ? undefined : 'Accepte la charte relais pour continuer' });
  /** Les erreurs ne s'affichent qu'après un premier essai de l'étape, puis se corrigent en direct. */
  const erreurs = $derived<ErreursFiche>(tente[etape] ? toutes : {});
  const pasDe = (e: number): ErreursFiche => (e === 0 ? { boutique: toutes.boutique } : e === 1 ? { photos: toutes.photos, cni: toutes.cni } : { tel: toutes.tel, titulaire: toutes.titulaire, charte: toutes.charte });
  const TITRES = ['Ta boutique', 'Photos et identité', 'Paiement'];
  const NOMS_JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'], ORDRE_JOURS = [1, 2, 3, 4, 5, 6, 0];
  const PHOTOS = ['devanture', 'intérieur', 'rangement'];

  function basculerJour(j: number) { jours = jours.includes(j) ? jours.filter((x) => x !== j) : [...jours, j]; }
  function precedent() { erreurGenerale = ''; etape = Math.max(0, etape - 1); }
  function suivante() {
    erreurGenerale = ''; tente[etape] = true;
    if (Object.values(pasDe(etape)).some(Boolean)) { if (etape === 0 && toutes.boutique?.horaires) editHoraires = true; return; }
    if (etape < 2) { etape++; return; }
    envoyer();
  }
  function envoyer() {
    if (modifier) {
      const r = modifierBoutique(moi!.id, boutique);
      if (r.ok) { montrer('Fiche relais enregistrée'); aller('/relais/app'); } else { tente[0] = true; etape = 0; }
      return;
    }
    const r = candidaterRelais(moi!.id, fiche);
    if ('candidature' in r) { envoyee = r.candidature; montrer('Fiche envoyée · réponse sous 48 h'); }
    else if ('erreurs' in r) { etape = r.erreurs.boutique ? 0 : r.erreurs.photos || r.erreurs.cni ? 1 : 2; tente[etape] = true; }
    else erreurGenerale = r.message;
  }
  const suivi = $derived(envoyee ?? deja);
  const compte = $derived(suivi ? personne(suivi.personneId) : undefined);
  function reponse(ok: boolean) { if (!suivi) return; const r = repondreCandidature(suivi.id, ok); if (r.ok && r.pin) pin = r.pin; else if (!r.ok) montrer(r.message, 'er'); }
  function entrer() { if (!compte) return; connecter(compte.id); aller('/relais/app'); }
  const lien = (e: MouseEvent, vers: string) => { e.preventDefault(); aller(vers); };
  const ficheSuivi = $derived(suivi?.fiche as FicheRelais | undefined);
</script>

<Mobile titre={suivi ? 'Ma candidature' : TITRES[etape]} sous={suivi ? 'Point relais' : `${etape + 1} / 3`} retourVers="/relais/devenir" dock={modifier ? undefined : dockVoyageur('moi')}>
  {#if suivi && ficheSuivi}
    <div class="center" style="flex: none">
      <span class="ill {suivi.statut === 'acceptee' ? 'ok' : suivi.statut === 'refusee' ? 'er' : ''}"><Pic nom={suivi.statut === 'refusee' ? 'info' : suivi.statut === 'acceptee' ? 'ok' : 'maison'} taille={60} trait={1.8} /></span>
      <span class="ttl t18" role="status">{suivi.statut === 'attente' ? 'Fiche envoyée' : suivi.statut === 'acceptee' ? 'Compte relais activé' : 'Candidature refusée'}</span>
      <span class="t14 mut">{suivi.statut === 'attente' ? 'Notre équipe vérifie ta boutique et ta pièce d’identité. Réponse sous 48 h, par notification.' : suivi.statut === 'acceptee' ? 'Bienvenue dans le réseau AfriMove. Ton code PIN t’est envoyé par SMS (simulé).' : 'Ta fiche n’a pas pu être retenue pour l’instant. Tu peux en déposer une nouvelle.'}</span>
    </div>
    <div class="gl col" style="gap: 0">
      <div class="li"><span class="grow t14">Boutique</span><span class="t14 b7">{ficheSuivi.boutique.nom}</span></div>
      <div class="li"><span class="grow t14">Adresse</span><span class="t14 b7">{ficheSuivi.boutique.adresse}</span></div>
      <div class="li"><span class="grow t14">Horaires</span><span class="t13 b7">{libelleHoraires({ ...ficheSuivi.boutique, est: 0, nord: 0 })}</span></div>
      <div class="li"><span class="grow t14">Commission</span><span class="t14 b7">{COMMISSION_RELAIS} F / colis</span></div>
      <div class="li"><span class="grow t14">Statut</span><span class="pl {suivi.statut === 'acceptee' ? 'ok' : suivi.statut === 'refusee' ? 'er' : 'wa'}">{suivi.statut === 'attente' ? 'en attente' : suivi.statut === 'acceptee' ? 'acceptée' : 'refusée'}</span></div>
    </div>
    {#if suivi.statut === 'attente'}
      <div class="gl col g8"><span class="lab">Démonstration</span><span class="t13 mut">Dans la vraie vie, c’est l’équipe AfriMove qui répond. Ici, tu peux simuler sa réponse.</span>
        <div class="row g8"><button type="button" class="b p sm" onclick={() => reponse(true)}>Simuler l’acceptation</button><button type="button" class="b s sm" onclick={() => reponse(false)}>Simuler un refus</button></div></div>
    {:else if suivi.statut === 'acceptee'}
      {#if pin}<div class="gl ac c"><span class="lab">Ton code PIN</span><span class="ttl t30" aria-label="PIN {pin}">{pin}</span></div>{/if}
      <button type="button" class="b p" onclick={entrer}>Entrer dans l’app relais (démo)</button>
    {:else}
      <button type="button" class="b p" onclick={() => { envoyee = undefined; etape = 0; tente = [false, false, false]; }}>Déposer une nouvelle fiche</button>
    {/if}
    <a class="b g" href="/" onclick={(e) => lien(e, '/')}>Retour à l’accueil</a>
  {:else}
    <div class="steps" role="img" aria-label="Étape {etape + 1} sur 3"><span class="on"></span><span class:on={etape >= 1}></span><span class:on={etape >= 2}></span></div>

    {#if etape === 0}
      <div class="fld"><label class="lab" for="b-nom">Nom de la boutique</label>
        <input id="b-nom" class="inp" class:err={erreurs.boutique?.nom} bind:value={nom} placeholder="Boutique Chez Mado" maxlength="50" autocomplete="off" aria-invalid={!!erreurs.boutique?.nom} />
        {#if erreurs.boutique?.nom}<span class="t12 erc" role="alert">{erreurs.boutique.nom}</span>{/if}</div>
      <div class="fld"><span class="lab" id="lab-type">Type</span>
        <div class="chips" role="radiogroup" aria-labelledby="lab-type">{#each TYPES_BOUTIQUE as t (t)}<button type="button" role="radio" aria-checked={type === t} class="ch" class:on={type === t} onclick={() => (type = t)}>{t}</button>{/each}</div></div>
      <div class="fld"><label class="lab" for="b-adr">Adresse</label>
        <input id="b-adr" class="inp" class:err={erreurs.boutique?.adresse} bind:value={adresse} placeholder="Akwa, rue Joffre, face pharmacie" maxlength="90" autocomplete="off" aria-invalid={!!erreurs.boutique?.adresse} />
        {#if erreurs.boutique?.adresse}<span class="t12 erc" role="alert">{erreurs.boutique.adresse}</span>{/if}</div>
      <div class="fld"><span class="lab">Horaires</span>
        <div class="gl row g12"><span class="col grow"><span class="t14 b6">{libelleHoraires({ ...boutique, est: 0, nord: 0 })}</span></span><button type="button" class="t13 aq lien" aria-expanded={editHoraires} onclick={() => (editHoraires = !editHoraires)}>{editHoraires ? 'fermer' : 'modifier'}</button></div>
        {#if editHoraires}
          <div class="gl col g12">
            <div class="li" style="padding: 0"><span class="grow t14 b6" id="l-24">Ouvert 24 h/24</span><button type="button" role="switch" aria-checked={h24} aria-labelledby="l-24" class="sw" class:on={h24} onclick={() => (h24 = !h24)}></button></div>
            {#if !h24}
              <div class="row g8"><label class="col grow g4"><span class="lab">Ouvre</span><select class="inp" bind:value={ouverture}>{#each Array.from({ length: 18 }, (_, i) => i + 4) as h (h)}<option value={h}>{h} h</option>{/each}</select></label>
                <label class="col grow g4"><span class="lab">Ferme</span><select class="inp" bind:value={fermeture}>{#each Array.from({ length: 15 }, (_, i) => i + 10) as h (h)}<option value={h}>{h} h</option>{/each}</select></label></div>
              <div class="chips" role="group" aria-label="Jours d’ouverture">{#each ORDRE_JOURS as j (j)}<button type="button" class="ch" class:on={jours.includes(j)} aria-pressed={jours.includes(j)} onclick={() => basculerJour(j)}>{NOMS_JOURS[j]}</button>{/each}</div>
            {/if}
          </div>
        {/if}
        {#if erreurs.boutique?.horaires}<span class="t12 erc" role="alert">{erreurs.boutique.horaires}</span>{/if}
        {#if !erreursBoutique(boutique).horaires}<span class="t12 mut">Ouvert au moins 6 jours sur 7 et 6 h par jour.</span>{/if}</div>

    {:else if etape === 1}
      <div class="fld"><span class="lab">Photos de la boutique</span>
        <div class="photo">{#each PHOTOS as p, i (p)}<button type="button" class:ok={photos[i]} aria-pressed={photos[i]} aria-label="Photo {p}{photos[i] ? ' ajoutée' : ' à prendre'}" onclick={() => (photos[i] = !photos[i])}><span class="col" style="align-items: center; gap: 4px"><Pic nom={photos[i] ? 'ok' : 'photo'} taille={24} /><span class="t12">{p}</span></span></button>{/each}</div>
        {#if erreurs.photos}<span class="t12 erc" role="alert">{erreurs.photos}</span>{/if}</div>
      <div class="fld"><span class="lab">Pièce d’identité</span>
        <div class="gl row g12"><span class="bub aq"><Pic nom="carteid" /></span><span class="col grow"><span class="t14 b7">CNI · {titulaire || 'ton nom'}</span><span class="t12 mut">{cni ? 'scannée · vérifiée par le visage' : 'pas encore scannée'}</span></span>
          {#if cni}<span class="pl ok">ok</span>{:else}<button type="button" class="b p sm" onclick={() => (cni = true)}>Scanner</button>{/if}</div>
        {#if erreurs.cni}<span class="t12 erc" role="alert">{erreurs.cni}</span>{/if}</div>

    {:else}
      <div class="fld"><span class="lab">Où recevoir l’argent</span>
        <div class="seg2" role="radiogroup" aria-label="Moyen de versement"><button type="button" role="radio" aria-checked={moyen === 'momo'} class:on={moyen === 'momo'} onclick={() => (moyen = 'momo')}>MoMo</button><button type="button" role="radio" aria-checked={moyen === 'om'} class:on={moyen === 'om'} onclick={() => (moyen = 'om')}>Orange Money</button></div>
        <label class="lab" for="b-tit">Titulaire (au même nom que la CNI)</label>
        <input id="b-tit" class="inp" bind:value={titulaire} autocomplete="name" maxlength="60" aria-invalid={!!erreurs.titulaire} />
        {#if erreurs.titulaire}<span class="t12 erc" role="alert">{erreurs.titulaire}</span>{/if}
        <label class="lab" for="b-tel">Numéro {moyen === 'momo' ? 'MoMo' : 'Orange Money'}</label>
        <input id="b-tel" class="inp" class:err={erreurs.tel} type="tel" inputmode="tel" bind:value={tel} placeholder="6 77 45 00 12" autocomplete="tel" aria-invalid={!!erreurs.tel} />
        {#if erreurs.tel}<span class="t12 erc" role="alert">{erreurs.tel}</span>{:else if normaliserTel(tel)}<span class="t12 okc">{formaterTel(normaliserTel(tel)!)} · versement chaque lundi</span>{/if}</div>
      <div class="gl col" style="gap: 0">
        <div class="li"><span class="grow t14" id="l-cpj">Colis par jour estimés</span><span class="row g8" role="group" aria-labelledby="l-cpj"><button type="button" class="ib pm" aria-label="Moins" disabled={colisParJour <= 1} onclick={() => (colisParJour = Math.max(1, colisParJour - 1))}>−</button><span class="ttl t18" aria-live="polite">{colisParJour}</span><button type="button" class="ib pm" aria-label="Plus" disabled={colisParJour >= 40} onclick={() => (colisParJour = Math.min(40, colisParJour + 1))}>+</button></span></div>
        <div class="li"><span class="grow t14">Commission par colis</span><span class="t14 b7">{COMMISSION_RELAIS} F</span></div>
        <div class="li"><span class="grow t14">Gain mensuel estimé</span><span class="ttl t18 okc">{fcfa(gainMensuelRelais(colisParJour))} F</span></div>
      </div>
      <div class="row g12"><button type="button" role="checkbox" aria-checked={charte} aria-labelledby="l-charte" class="case" class:on={charte} onclick={() => (charte = !charte)}>{#if charte}<Pic nom="ok" taille={16} trait={3} />{/if}</button><span class="t13 mut" id="l-charte">En touchant « {modifier ? 'Enregistrer' : 'Envoyer'} », tu acceptes la charte relais : colis gardés 7 jours, remise contre code uniquement.</span></div>
      {#if erreurs.charte}<span class="t12 erc" role="alert">{erreurs.charte}</span>{/if}
    {/if}

    {#if erreurGenerale}<span class="t13 erc" role="alert">{erreurGenerale}</span>{/if}
    <div class="col g8" style="margin-top: auto">
      <button type="button" class="b p" onclick={suivante}>{etape < 2 ? 'Continuer' : modifier ? 'Enregistrer ma fiche' : 'Envoyer ma fiche'}</button>
      {#if etape > 0}<button type="button" class="b g" onclick={precedent}>Précédent</button>{/if}
    </div>
  {/if}
</Mobile>

<style>
  .steps { display: flex; gap: 6px; } .steps span { flex: 1; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); } .steps span.on { background: linear-gradient(90deg, #8b7cff, #3de0ff); }
  .photo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .photo button { aspect-ratio: 1; min-height: 88px; border-radius: 14px; border: 1px dashed rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.04); color: #8e99bb; cursor: pointer; display: grid; place-items: center; }
  .photo .ok { border-style: solid; background: linear-gradient(135deg, rgba(139, 124, 255, 0.3), rgba(61, 224, 255, 0.2)); color: #7febff; }
  .inp.err { border-color: #ff6b6b; }
  select.inp { appearance: none; }
  .lien { background: none; border: 0; min-height: 44px; padding: 0 6px; cursor: pointer; }
  .pm { width: 44px; height: 44px; font-size: 22px; } .pm:disabled { opacity: 0.4; }
  .case { flex: none; width: 28px; height: 28px; margin: 8px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.06); display: grid; place-items: center; cursor: pointer; color: #06080f; position: relative; }
  .case::after { content: ''; position: absolute; inset: -10px; } .case.on { background: #3de0ff; border-color: #3de0ff; }
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible { outline: 2px solid #7febff; outline-offset: 2px; }
</style>
