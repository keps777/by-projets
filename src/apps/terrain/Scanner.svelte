<script lang="ts">
  import Icone from '../../ui/Icone.svelte';
  /** Scanner de billets : caméra + `BarcodeDetector` quand le navigateur les offre ; sinon (ou en plus) saisie du code et liste « simuler un scan ». */
  type Choix = { id: string; libelle: string; contenu: string; code?: string };
  let { onscan, onfermer, titre = 'Scanner un billet', valides = [], essais = [] }: { onscan: (contenu: string, via: 'qr' | 'code' | 'liste') => void; onfermer: () => void; titre?: string; valides?: Choix[]; essais?: Choix[] } = $props();

  let video = $state<HTMLVideoElement>(), saisie = $state(''), camera = $state<'attente' | 'ok' | 'refusee' | 'absente'>('attente');
  const BD = typeof window !== 'undefined' ? (window as unknown as { BarcodeDetector?: new (o?: { formats: string[] }) => { detect: (v: HTMLVideoElement) => Promise<{ rawValue: string }[]> } }).BarcodeDetector : undefined;

  $effect(() => {
    if (!video) return;
    if (!BD || !navigator.mediaDevices?.getUserMedia) { camera = 'absente'; return; }
    let flux: MediaStream | undefined, timer: ReturnType<typeof setInterval> | undefined, arrete = false, dernier = '', dernierTs = 0;
    const detecteur = new BD({ formats: ['qr_code'] });
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then((f) => {
      if (arrete) { f.getTracks().forEach((t) => t.stop()); return; }
      flux = f; video!.srcObject = f; void video!.play().catch(() => {}); camera = 'ok';
      timer = setInterval(async () => {
        if (!video || video.readyState < 2) return;
        try { const r = await detecteur.detect(video); const v = r[0]?.rawValue; if (v && (v !== dernier || Date.now() - dernierTs > 3000)) { dernier = v; dernierTs = Date.now(); onscan(v, 'qr'); } } catch { /* image illisible : on réessaie */ }
      }, 300);
    }).catch(() => { camera = 'refusee'; });
    return () => { arrete = true; clearInterval(timer); flux?.getTracks().forEach((t) => t.stop()); };
  });
  function valider(e: SubmitEvent) { e.preventDefault(); const v = saisie.trim(); if (v) { onscan(v, 'code'); saisie = ''; } }
  const texteCamera = $derived(camera === 'ok' ? 'Cadre le QR du billet dans le carré.' : camera === 'attente' ? 'Ouverture de la caméra…' : camera === 'refusee' ? 'Caméra refusée : saisis le code ou simule un scan.' : 'Caméra ou lecture de QR indisponible sur cet appareil : saisis le code ou simule un scan.');
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && onfermer()} />
<div class="voile" role="presentation" onclick={onfermer}></div>
<div class="sheet sc-sheet" role="dialog" aria-modal="true" aria-label={titre}>
  <span class="grab"></span>
  <div class="row sp"><span class="ttl t18">{titre}</span><button type="button" class="ib" aria-label="Fermer" onclick={onfermer}><Icone nom="fermer" /></button></div>
  <div class="vue" class:vide={camera !== 'ok'}>
    <video bind:this={video} playsinline muted aria-label="Image de la caméra"></video>
    <span class="cadre" aria-hidden="true"></span>
    {#if camera !== 'ok'}<span class="msg"><Icone nom="scan" taille={30} /></span>{/if}
  </div>
  <span class="t13 mut" role="status">{texteCamera}</span>
  <form class="row g8" onsubmit={valider}>
    <label class="fld grow" style="gap: 4px"><span class="lab">Code du billet</span>
      <input class="inp" style="min-height: 48px" bind:value={saisie} autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="AM-7F3K-22" aria-label="Code du billet" /></label>
    <button type="submit" class="b p" style="flex: none; width: 110px; align-self: flex-end" disabled={!saisie.trim()}>Valider</button>
  </form>
  {#if valides.length || essais.length}
    <details>
      <summary class="b s sm" style="width: 100%">Simuler un scan</summary>
      <div class="col g6 liste">
        {#each valides as v (v.id)}<button type="button" class="bn" onclick={() => onscan(v.contenu, 'liste')}><span class="pl ok">valide</span><span class="col grow"><span class="t14 b7 ell">{v.libelle}</span><span class="t12 mut mono">{v.code}</span></span></button>{/each}
        {#each essais as v (v.id)}<button type="button" class="bn" onclick={() => onscan(v.contenu, 'liste')}><span class="pl wa">essai</span><span class="col grow"><span class="t14 b7 ell">{v.libelle}</span><span class="t12 mut mono">{v.code}</span></span></button>{/each}
      </div>
    </details>
  {/if}
</div>

<style>
  .voile { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); z-index: 40; }
  .sc-sheet { position: fixed; left: 50%; bottom: 0; transform: translateX(-50%); width: min(100%, 460px); max-height: 92dvh; overflow-y: auto; z-index: 41; margin: 0; }
  .vue { position: relative; height: 200px; border-radius: 22px; overflow: hidden; background: #0b1020; border: 1px solid rgba(255, 255, 255, 0.14); }
  video { width: 100%; height: 100%; object-fit: cover; }
  .vide video { visibility: hidden; }
  .cadre { position: absolute; inset: 28px 80px; border-radius: 18px; border: 2px solid #3de0ff; box-shadow: 0 0 0 999px rgba(5, 7, 13, 0.35); }
  .msg { position: absolute; inset: 0; display: grid; place-items: center; color: #8e99bb; }
  summary { list-style: none; cursor: pointer; }
  summary::-webkit-details-marker { display: none; }
  .liste { margin-top: 8px; max-height: 34dvh; overflow-y: auto; }
</style>
