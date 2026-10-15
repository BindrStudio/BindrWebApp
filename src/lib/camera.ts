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
