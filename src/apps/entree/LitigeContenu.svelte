<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { maintenant } from '../../data/store.svelte.ts';
  import { app } from '../../data/store.svelte.ts';
  import { billetsDe, compagnieDe, departParId, heureLocale, ligneDe, personneCourante } from '../../domain/actions.ts';
  import { jourSemaineCourt } from '../../core/dates.ts';
  import { avancerLitiges, CATEGORIES_LITIGE, ErreurLitige, EXEMPLES_LITIGE, LIBELLE_STATUT_LITIGE, litigesDe, signalerProbleme } from './actions.ts';
  import { codeLisible } from './ussd.ts';
  import type { Litige } from '../../domain/types.ts';
  import { nav } from './lien.ts';

  /** « Signaler un problème » : ouvre un dossier lié à un billet ou un colis (ou à son départ) et en suit le statut.
   *  Contenu partagé par la page `/litige` et par la fenêtre « Problème » de la page Billets (et de l'écran Direct). */
  let { billetId = null, colisId = null, onfermer, fait = $bindable(null) }: { billetId?: string | null; colisId?: string | null; onfermer?: () => void; fait?: Litige | null } = $props();
  interface Cible { cle: string; type: 'billet' | 'colis'; id: string; departId?: string; titre: string; sous: string }
  const moi = $derived(personneCourante());
  const cibles = $derived.by<Cible[]>(() => {
    if (!moi) return [];
    const bs = billetsDe(moi.id).map<Cible>((b) => {
      const d = departParId(b.departId), l = d && ligneDe(d);
      return { cle: `billet:${b.id}`, type: 'billet', id: b.id, departId: b.departId, titre: l ? `${l.de} → ${l.vers} · ${b.siege ?? 'libre'} · ${codeLisible(b.code)}` : codeLisible(b.code), sous: d ? `${compagnieDe(d).nom} · ${jourSemaineCourt(d.jour)} · ${d.heure}` : '' };
    });
    const cs = app.monde.colis.filter((c) => c.expediteurId === moi.id).map<Cible>((c) => ({ cle: `colis:${c.id}`, type: 'colis', id: c.id, titre: `Colis ${c.code}`, sous: `${c.depart} → ${c.arrivee}` }));
    return [...bs, ...cs];
  });
  const demande = $derived(billetId ? `billet:${billetId}` : colisId ? `colis:${colisId}` : '');
  let manuel = $state<string | null>(null), liste = $state(false), cat = $state(0), texte = $state(''), photos = $state([false, false, false]), erreur = $state('');
  const choix = $derived(manuel ?? demande);
  const cible = $derived(cibles.find((c) => c.cle === choix) ?? cibles.find((c) => c.type === 'billet' && billetsDe(moi?.id ?? '').find((b) => b.id === c.id)?.statut === 'valide') ?? cibles[0]);
  const dossiers = $derived(moi ? litigesDe(moi.id) : []);
  const nPhotos = $derived(photos.filter(Boolean).length);

  function envoyer() {
    if (!moi || !cible) return;
    const categorie = CATEGORIES_LITIGE[cat], surDepart = cible.type === 'billet' && cible.departId && ['Retard', 'Bus annulé', 'Chauffeur'].includes(categorie);
    try {
      fait = signalerProbleme({ auteurId: moi.id, categorie, objet: surDepart ? { type: 'depart', id: cible.departId! } : { type: cible.type, id: cible.id }, texte, photos: nPhotos });
      erreur = '';
    } catch (e) { if (e instanceof ErreurLitige) erreur = e.code === 'texte_court' ? 'Raconte en une phrase ce qui s’est passé (5 lettres au moins).' : 'Billet ou colis introuvable.'; else throw e; }
  }
  function recommencer() { fait = null; cat = 0; texte = ''; photos = [false, false, false]; }
  const nomCompagnie = (l: Litige) => { const d = l.objet.type === 'depart' ? departParId(l.objet.id) : l.objet.type === 'billet' ? departParId(app.monde.billets.find((b) => b.id === l.objet.id)?.departId ?? '') : undefined; return d ? compagnieDe(d).nom : 'AfriMove'; };
  const reponseAvant = (l: Litige) => heureLocale(l.ts + 2 * 3_600_000);
  const etapes = ['ouvert', 'en_cours', 'resolu'] as const;
  let id: ReturnType<typeof setInterval> | undefined;
  onMount(() => { avancerLitiges(maintenant()); id = setInterval(() => avancerLitiges(maintenant()), 20_000); });
  onDestroy(() => clearInterval(id));
</script>

  {#if fait}
    <div class="center" style="flex: none; padding: 16px 10px">
      <span class="ill ok"><svg width="70" height="70" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
      <h2 class="ttl t20" style="margin: 0" aria-live="polite">Dossier {fait.id} ouvert</h2>
      <span class="t14 mut" style="max-width: 32ch">{fait.type} · {nomCompagnie(fait)} est prévenu. Tu as la réponse par notification et WhatsApp avant {reponseAvant(fait)}.</span>
      <span class="pl ok">remboursement auto si fondé</span>
    </div>
    {#if onfermer}<button class="b p" type="button" onclick={onfermer}>Revenir à mon billet</button>{:else}<a class="b p" href="/pass" use:nav>Revenir à mon billet</a>{/if}
    <button class="b s" type="button" onclick={recommencer}>Nouveau signalement</button>
  {:else}
    {#if cible}
      <div class="gl ac row g12">
        <span class="bub aq" aria-hidden="true"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5h17v3a2 2 0 0 0 0 4v3h-17v-3a2 2 0 0 0 0-4z" /></svg></span>
        <span class="col grow"><span class="t14 b7" data-testid="cible">{cible.titre}</span><span class="t12 mut">{cible.sous}</span></span>
        {#if cibles.length > 1}<button class="b g sm" type="button" aria-expanded={liste} onclick={() => (liste = !liste)}>changer</button>{/if}
      </div>
      {#if liste}
        <ul class="gl col" style="gap: 0; list-style: none" aria-label="Choisir le billet ou le colis concerné">
          {#each cibles as c (c.cle)}<li><button type="button" class="li choix" class:sel={c.cle === cible.cle} onclick={() => { manuel = c.cle; liste = false; }}><span class="col grow"><span class="t13 b7">{c.titre}</span><span class="t12 mut">{c.sous}</span></span>{#if c.cle === cible.cle}<span class="okc" aria-hidden="true">✓</span>{/if}</button></li>{/each}
        </ul>
      {/if}

      <span class="lab" id="lbl-cat">C’est quoi le souci ?</span>
      <div class="chips wrapf" style="flex-wrap: wrap" role="group" aria-labelledby="lbl-cat">
        {#each CATEGORIES_LITIGE as c, i (c)}<button class="ch" class:on={cat === i} aria-pressed={cat === i} type="button" onclick={() => (cat = i)}>{c}</button>{/each}
      </div>
      <label class="fld"><span class="lab">Raconte</span>
        <textarea class="inp ta" rows="4" placeholder={EXEMPLES_LITIGE[cat]} bind:value={texte} aria-invalid={!!erreur} aria-describedby="err-lit"></textarea></label>
      <span id="err-lit" class="t13 erc" role="alert">{erreur}</span>
      <span class="lab">Photos (facultatif)</span>
      <div class="photo">
        {#each photos as p, i (i)}<button type="button" class:ok={p} aria-pressed={p} aria-label={p ? `Retirer la photo ${i + 1}` : 'Ajouter une photo'} onclick={() => (photos[i] = !p)}>{#if p}<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>{:else}+{/if}</button>{/each}
      </div>
      <button class="b p" type="button" onclick={envoyer} disabled={texte.trim().length < 5}>Envoyer · réponse sous 2 h</button>
      <a class="b g" href="tel:8050">Appeler plutôt le 8 050 (gratuit)</a>
    {:else}
      <div class="gl col" style="gap: 6px"><span class="t16 b7">Rien à signaler pour l’instant</span><span class="t13 mut">Tu n’as encore ni billet ni colis. Pour un souci de paiement, appelle le 8 050 (gratuit) ou utilise *123#.</span><a class="b s" href="/ussd" use:nav>Aide · *123# · WhatsApp</a></div>
    {/if}
  {/if}

  {#if dossiers.length}
    <span class="lab">Mes dossiers</span>
    <ul class="gl col" style="gap: 0; list-style: none" aria-label="Suivi de mes dossiers">
      {#each dossiers as l (l.id)}
        <li class="dos">
          <div class="row sp"><span class="t14 b7 mono">{l.id}</span><span class="pl {l.statut === 'resolu' ? 'ok' : l.statut === 'en_cours' ? 'inf' : 'wa'}" data-testid="statut-{l.id}">{LIBELLE_STATUT_LITIGE[l.statut]}</span></div>
          <span class="t13">{l.type} · {nomCompagnie(l)}</span>
          <span class="t12 mut">{l.texte}</span>
          <div class="lvl" aria-hidden="true">{#each etapes as e, i (e)}<span class:on={i <= etapes.indexOf(l.statut)}></span>{/each}</div>
          {#if l.reponse}<span class="t13 okc">{l.reponse}</span>{/if}
        </li>
      {/each}
    </ul>
  {/if}

<style>
  .ta { min-height: 110px; align-items: flex-start; padding: 12px 14px; resize: vertical; font-family: inherit; display: block; }
  .photo { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .photo button { aspect-ratio: 1; min-height: 64px; border-radius: 14px; border: 1px dashed rgba(255, 255, 255, 0.3); background: rgba(255, 255, 255, 0.04); color: #a1accb; cursor: pointer; display: grid; place-items: center; font-size: 22px; }
  .photo .ok { border-style: solid; background: linear-gradient(135deg, rgba(139, 124, 255, 0.3), rgba(61, 224, 255, 0.2)); color: #7febff; }
  .b:disabled { opacity: 0.45; pointer-events: none; }
  .choix { width: 100%; background: transparent; border: 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); text-align: left; cursor: pointer; color: inherit; font: inherit; }
  .dos { display: flex; flex-direction: column; gap: 4px; padding: 12px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.08); }
  .dos:last-child { border: 0; }
  .lvl { display: flex; gap: 6px; } .lvl span { flex: 1; height: 6px; border-radius: 3px; background: rgba(255, 255, 255, 0.12); } .lvl span.on { background: linear-gradient(90deg, #8b7cff, #3de0ff); }
  .chips.wrapf { overflow: visible; }
</style>
