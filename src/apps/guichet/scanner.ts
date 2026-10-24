// Lecture d'un QR à la caméra (BarcodeDetector) quand le navigateur sait le faire ; sinon l'agent tape le code.
interface DetecteurQr { detect(source: CanvasImageSource): Promise<{ rawValue: string }[]> }
export const scanDisponible = (): boolean => typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia;

/** Ouvre la caméra arrière dans `video` et appelle `surCode` au premier QR lu. Retourne la fonction qui arrête tout. */
export async function lancerScan(video: HTMLVideoElement, surCode: (texte: string) => void, surErreur: (message: string) => void): Promise<() => void> {
  let actif = true, flux: MediaStream | null = null, minuteur: ReturnType<typeof setTimeout> | undefined;
  const arreter = () => { actif = false; clearTimeout(minuteur); flux?.getTracks().forEach((t) => t.stop()); video.srcObject = null; };
  try {
    const Detecteur = (window as unknown as { BarcodeDetector: new (o: { formats: string[] }) => DetecteurQr }).BarcodeDetector, detecteur = new Detecteur({ formats: ['qr_code'] });
    flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    if (!actif) { arreter(); return arreter; }
    video.srcObject = flux; await video.play();
    const boucle = async () => {
      if (!actif) return;
      try { const trouves = await detecteur.detect(video); if (trouves[0]?.rawValue) { arreter(); surCode(trouves[0].rawValue); return; } } catch { /* image pas encore prête */ }
      minuteur = setTimeout(boucle, 250);
    };
    boucle();
  } catch { arreter(); surErreur('Caméra indisponible ou refusée : tape le code à la main.'); }
  return arreter;
}
