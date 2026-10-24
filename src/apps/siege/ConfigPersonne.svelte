<script lang="ts">
  import { untrack } from 'svelte';
  import { NOM_ROLE, ROLES_EQUIPE } from '../../domain/acces.ts';
  import { app } from '../../data/store.svelte.ts';
  import { personne, personneCourante } from '../../domain/actions.ts';
  import type { Role } from '../../domain/types.ts';
  import { aller, param } from '../../router.svelte.ts';
  import { montrer } from '../../ui/toast.svelte.ts';
  import { changerActivation, creerPersonne, ErreurValidation, fixerPermission, formaterTel, modifierPersonne, permission, PERMISSIONS, pinAleatoire, roleSansPin, ROLES_A_GARE, validerPersonne, type FichePersonne } from './actions.ts';
  import { lireSiege } from './etat.ts';
  import { initiales, nomGare } from './format.ts';
  import Lien from './Lien.svelte';
  import Siege from './Siege.svelte';

  const DESC: Partial<Record<Role, string>> = {
    superviseur: 'Voit toute la gare, valide les clôtures, débloque les guichets.', guichet: 'Vend, encaisse, imprime, dépose les colis. Ne voit pas les autres caisses.', quai: 'Scanne et compte au quai. Peut refuser une montée.',
    convoyeur: 'Vend en route, synchronise au prochain réseau.', chauffeur: 'Feuille de route, arrêts, SOS. Vitesse suivie.', comptable: 'Lecture seule sur toutes les gares, exports.', controleur: 'Contrôles inopinés : compte les passagers et vérifie les billets.'
  };
  const moi = personneCourante();
  const id = $derived(param('personne')), nouvelle = $derived(param('nouvelle') === '1' || !id);
  const existante = $derived(id ? personne(id) : undefined);
  const soi = $derived(!!existante && existante.id === moi?.id);
  const roles = $derived<Role[]>([...ROLES_EQUIPE, 'comptable', ...(existante && !([...ROLES_EQUIPE, 'comptable'] as Role[]).includes(existante.role) ? [existante.role] : [])]);

  let f = $state<FichePersonne>({ prenom: '', nom: '', tel: '', role: 'guichet', gareId: 'mvan', pin: '', visage: false });
  let actif = $state(true), perms = $state<Record<string, boolean>>({}), modifie = $state(false), erreurs = $state<Record<string, string>>({}), voirPin = $state(false), pinDemo = $state('');

  const permsDe = (r: Role) => Object.fromEntries(PERMISSIONS.map((p) => [p.cle, permission(r, p.cle)]));
  function initialiser(p: ReturnType<typeof personne>) {
    if (p) { f = { prenom: p.prenom, nom: p.nom, tel: p.tel, role: p.role, gareId: p.gareId, pin: p.actif ? (p.pin ?? '') : (lireSiege().pinsSuspendus[p.id] ?? ''), visage: !!p.visage }; actif = p.actif; }
    else { f = { prenom: '', nom: '', tel: '', role: 'guichet', gareId: 'mvan', pin: '', visage: false }; actif = true; }
    perms = permsDe(f.role); modifie = false; erreurs = {}; pinDemo = '';
  }
  $effect(() => { const p = existante; untrack(() => initialiser(p)); });

  const marquer = () => { modifie = true; };
  function choisirRole(r: Role) { f.role = r; if (!ROLES_A_GARE.includes(r)) f.gareId = undefined; else f.gareId ??= existante?.gareId ?? 'mvan'; perms = permsDe(r); marquer(); }
  function nouveauPin() { f.pin = pinAleatoire(existante ? app.monde.personnes.indexOf(existante) : app.monde.personnes.length); voirPin = true; pinDemo = f.pin; marquer(); }
  function enregistrer() {
    erreurs = validerPersonne(f, existante?.id);
    if (Object.keys(erreurs).length) { montrer('Corrige les champs en rouge', 'er'); return; }
    try {
      if (existante) {
        modifierPersonne(existante.id, f, moi?.id); if (actif !== existante.actif) changerActivation(existante.id, actif, moi?.id);
        for (const p of PERMISSIONS) if (perms[p.cle] !== permission(f.role, p.cle)) fixerPermission(f.role, p.cle, perms[p.cle], moi?.id);
        initialiser(personne(existante.id)); montrer('Fiche enregistrée');
      } else { const p = creerPersonne(f, moi?.id); montrer(`${p.prenom} ${p.nom} ajouté(e) · PIN envoyé par SMS`); aller(`/siege/config/personne?personne=${p.id}`); }
    } catch (e) { if (e instanceof ErreurValidation) { erreurs = e.champs; montrer(Object.values(e.champs)[0], 'er'); } else throw e; }
  }
  const telFormate = $derived(f.tel.replace(/\D/g, '').length === 9 ? formaterTel(f.tel.replace(/\D/g, '')) : f.tel);
  const aGare = $derived(ROLES_A_GARE.includes(f.role));
</script>

<Siege actif="config">
  {#if !nouvelle && !existante}
    <div class="gl vide-etat"><p>Cette personne n’existe pas (ou plus).</p><Lien href="/siege/config?onglet=equipe" class="b p sm" style="margin-top: 10px">Retour à l’équipe</Lien></div>
  {:else}
    <div class="top">
      <div class="row g12"><Lien href="/siege/config?onglet=equipe" class="ib" aria-label="Retour à l’équipe"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg></Lien>
        <span class="av hot" aria-hidden="true">{initiales(f.prenom || f.nom ? f : { prenom: '+', nom: '' })}</span>
        <div class="col"><h1 class="ttl">{existante ? `${existante.prenom} ${existante.nom}` : 'Nouvelle personne'}</h1><span class="t13 mut">{existante ? `${existante.id} · ${formaterTel(existante.tel)} · ${NOM_ROLE[existante.role]}` : 'Son PIN lui est envoyé par SMS (simulé)'}</span></div></div>
      <div class="row g8 wrapf"><span class="pl {modifie || nouvelle ? 'wa' : 'ok'}" role="status">{nouvelle ? 'nouveau' : modifie ? 'modifié' : 'enregistré'}</span><button type="button" class="b p sm" disabled={!nouvelle && !modifie} onclick={enregistrer}>{nouvelle ? 'Ajouter la personne' : modifie ? 'Enregistrer' : 'Enregistré ✓'}</button></div>
    </div>
    {#if Object.keys(erreurs).length}<p class="alerte" role="alert">{Object.values(erreurs).join(' ')}</p>{/if}

    <div class="c2">
      <div class="col g12">
        <div class="gl"><span class="t15 b7">Identité</span>
          <div class="gridp" style="margin-top: 8px">
            <div class="fld"><label for="p-prenom">Prénom</label><input id="p-prenom" class="in" autocomplete="off" aria-invalid={!!erreurs.prenom} bind:value={f.prenom} oninput={marquer} />{#if erreurs.prenom}<span class="err">{erreurs.prenom}</span>{/if}</div>
            <div class="fld"><label for="p-nom">Nom</label><input id="p-nom" class="in" autocomplete="off" aria-invalid={!!erreurs.nom} bind:value={f.nom} oninput={marquer} />{#if erreurs.nom}<span class="err">{erreurs.nom}</span>{/if}</div>
            <div class="fld" style="grid-column: 1 / -1"><label for="p-tel">Téléphone</label><input id="p-tel" class="in mono" type="tel" inputmode="tel" autocomplete="off" placeholder="6 91 22 10 08" aria-invalid={!!erreurs.tel} aria-describedby="p-tel-aide" bind:value={f.tel} oninput={marquer} /><span class="t12 mut3" id="p-tel-aide">{erreurs.tel ?? `Numéro camerounais à 9 chiffres${telFormate ? ` · ${telFormate}` : ''}`}</span></div>
          </div></div>
        <div class="gl"><span class="t15 b7" id="lib-role">Rôle</span><div class="row g6 wrapf" style="margin-top: 8px" role="group" aria-labelledby="lib-role">{#each roles as r (r)}<button type="button" class="ch {f.role === r ? 'on' : ''}" aria-pressed={f.role === r} disabled={soi && r !== f.role} onclick={() => choisirRole(r)}>{NOM_ROLE[r].replace(' de gare', '')}</button>{/each}</div>
          <p class="t12 mut" style="margin: 8px 0 0">{DESC[f.role] ?? NOM_ROLE[f.role]}{soi ? ' · Tu ne peux pas changer ton propre rôle.' : ''}</p></div>
        <div class="gl"><span class="t15 b7" id="lib-gare">Gare</span>
          {#if aGare}<div class="row g6 wrapf" style="margin-top: 8px" role="group" aria-labelledby="lib-gare">{#each app.monde.gares as g (g.id)}<button type="button" class="ch {f.gareId === g.id ? 'on' : ''}" aria-pressed={f.gareId === g.id} onclick={() => { f.gareId = g.id; marquer(); }}>{nomGare(g)}</button>{/each}</div>
            {#if erreurs.gareId}<span class="err">{erreurs.gareId}</span>{/if}
          {:else}<p class="t13 mut" style="margin: 8px 0 0">Ce rôle est rattaché au siège : pas de gare.</p>{/if}</div>
        <div class="gl"><span class="t15 b7">Accès</span><div class="col" style="gap: 0; margin-top: 6px">
          <div class="li"><span class="col grow"><span class="t14 b6">Connexion par le visage</span><span class="t12 mut">sur son téléphone pro</span></span><button type="button" class="sw {f.visage ? 'on' : ''}" role="switch" aria-checked={f.visage} aria-label="Connexion par le visage" onclick={() => { f.visage = !f.visage; marquer(); }}></button></div>
          {#if !roleSansPin(f.role)}<div class="li" style="flex-wrap: wrap"><span class="col grow"><label class="t14 b6" for="p-pin">PIN à 4 chiffres</label><span class="t12 {erreurs.pin ? 'err' : 'mut'}" id="p-pin-aide">{erreurs.pin ?? (pinDemo ? `Nouveau PIN (démo) : ${pinDemo}` : 'demandé à chaque connexion')}</span></span>
            <input id="p-pin" class="in mono" style="width: 110px" type={voirPin ? 'text' : 'password'} inputmode="numeric" maxlength="4" autocomplete="off" aria-invalid={!!erreurs.pin} aria-describedby="p-pin-aide" bind:value={f.pin} oninput={marquer} />
            <button type="button" class="b g sm xs" aria-pressed={voirPin} onclick={() => (voirPin = !voirPin)}>{voirPin ? 'Masquer' : 'Afficher'}</button><button type="button" class="b s sm xs" onclick={nouveauPin}>Nouveau PIN</button></div>{/if}
          <div class="li"><span class="col grow"><span class="t14 b6">Compte</span><span class="t12 mut">{actif ? 'actif' : 'suspendu · ne peut plus se connecter'}</span></span><button type="button" class="sw {actif ? 'on' : ''}" role="switch" aria-checked={actif} disabled={soi || nouvelle} aria-label="Compte actif" onclick={() => { actif = !actif; marquer(); }}></button></div>
          {#if soi}<p class="t12 mut3">Tu ne peux pas suspendre ton propre compte.</p>{/if}
        </div></div>
      </div>
      <div class="gl"><span class="t15 b7">Permissions du rôle</span><p class="t12 mut3" style="margin-top: 2px">Réglage commun à tous les « {NOM_ROLE[f.role]} », enregistré avec la fiche.</p>
        <div class="col" style="gap: 0; margin-top: 6px">{#each PERMISSIONS as p (p.cle)}<div class="li"><span class="col grow"><span class="t14 b6">{p.nom}</span><span class="t12 mut">{p.detail}</span></span><button type="button" class="sw {perms[p.cle] ? 'on' : ''}" role="switch" aria-checked={!!perms[p.cle]} aria-label={p.nom} onclick={() => { perms[p.cle] = !perms[p.cle]; marquer(); }}></button></div>{/each}</div>
        {#if existante}<Lien href="/patron/personne?personne={existante.id}" class="b s sm" style="margin-top: 10px">Voir la fiche et les performances</Lien>{/if}</div>
    </div>
  {/if}
</Siege>
