// Camera, QR-codes lezen (jsQR, Apache-2.0, in public/vendor) en foto's nemen.
import { normaliseerCode } from "./code";

declare global {
  interface Window {
    jsQR?: (data: Uint8ClampedArray, w: number, h: number, opts?: { inversionAttempts?: string }) => { data: string } | null;
  }
}

export async function startCamera(video: HTMLVideoElement): Promise<MediaStream> {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Deze browser geeft geen toegang tot de camera.");
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    audio: false,
  });
  video.srcObject = stream;
  video.setAttribute("playsinline", "true");
  video.muted = true;
  await video.play();
  return stream;
}

export function stopCamera(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Zoekt een Bind'r-QR-code in het huidige camerabeeld. Geeft de code terug of null. */
export function leesQr(video: HTMLVideoElement, canvas: HTMLCanvasElement): { code: string | null; ruw: string | null } {
  if (!window.jsQR || video.readyState < 2) return { code: null, ruw: null };
  const max = 720;
  const schaal = Math.min(1, max / Math.max(video.videoWidth, video.videoHeight));
  const w = Math.round(video.videoWidth * schaal);
  const h = Math.round(video.videoHeight * schaal);
  if (!w || !h) return { code: null, ruw: null };
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  const res = window.jsQR(img.data, w, h, { inversionAttempts: "dontInvert" });
  if (!res) return { code: null, ruw: null };
  return { code: normaliseerCode(res.data), ruw: res.data };
}

/** Neemt een scherpe foto uit de video (volle resolutie). */
export function fotoUitVideo(video: HTMLVideoElement): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = video.videoWidth;
  c.height = video.videoHeight;
  c.getContext("2d")!.drawImage(video, 0, 0);
  return c;
}

/**
 * Neemt een foto van enkel het kaartkader in het midden van het beeld (zoals de hoekjes op het scherm).
 * De video vult het vak met object-fit: cover, dus we rekenen terug naar de pixels van de camera.
 * `breedte` is het deel van de breedte van het vak dat het kader inneemt.
 */
export function fotoUitKader(video: HTMLVideoElement, breedte = 0.72, marge = 0.06): HTMLCanvasElement {
  const vw = video.videoWidth, vh = video.videoHeight;
  const bw = video.clientWidth || vw, bh = video.clientHeight || vh;
  const schaal = Math.max(bw / vw, bh / vh);
  const offX = (vw * schaal - bw) / 2, offY = (vh * schaal - bh) / 2;
  let fw = bw * breedte, fh = (fw * 88) / 63;
  if (fh > bh) { fh = bh; fw = (fh * 63) / 88; }
  fw *= 1 + marge; fh *= 1 + marge;
  const sx = Math.max(0, ((bw - fw) / 2 + offX) / schaal), sy = Math.max(0, ((bh - fh) / 2 + offY) / schaal);
  const sw = Math.min(vw - sx, fw / schaal), sh = Math.min(vh - sy, fh / schaal);
  const c = document.createElement("canvas");
  c.width = Math.round(sw);
  c.height = Math.round(sh);
  c.getContext("2d")!.drawImage(video, sx, sy, sw, sh, 0, 0, c.width, c.height);
  return c;
}

/** Een piepklein grijs beeldje (32 × 24) om te zien of de camera stilstaat en of er iets in beeld is. */
const duimCanvas = typeof document !== "undefined" ? document.createElement("canvas") : null;
export function duimnagel(video: HTMLVideoElement): Uint8Array | null {
  if (!duimCanvas || video.readyState < 2) return null;
  duimCanvas.width = 32;
  duimCanvas.height = 24;
  const ctx = duimCanvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(video, 0, 0, 32, 24);
  const d = ctx.getImageData(0, 0, 32, 24).data;
  const uit = new Uint8Array(32 * 24);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) uit[j] = (d[i] * 77 + d[i + 1] * 150 + d[i + 2] * 29) >> 8;
  return uit;
}

/** Gemiddeld verschil tussen twee duimnagels (0 = identiek, 255 = alles anders). */
export function beeldVerschil(a: Uint8Array | null, b: Uint8Array | null): number {
  if (!a || !b || a.length !== b.length) return 255;
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

/** Hoeveel detail er in beeld is (spreiding van de grijswaarden); een lege tafel geeft weinig. */
export function beeldDetail(a: Uint8Array | null): number {
  if (!a) return 0;
  let som = 0, kw = 0;
  for (let i = 0; i < a.length; i++) { som += a[i]; kw += a[i] * a[i]; }
  const m = som / a.length;
  return Math.sqrt(Math.max(0, kw / a.length - m * m));
}

/** Leest een gekozen afbeeldingsbestand in een canvas (max. 1600 px). */
export async function bestandNaarCanvas(file: File): Promise<HTMLCanvasElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const schaal = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * schaal);
    c.height = Math.round(img.naturalHeight * schaal);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function tril(ms = 30) {
  try { navigator.vibrate?.(ms); } catch { /* iPhone heeft geen trilfunctie in de browser */ }
}
