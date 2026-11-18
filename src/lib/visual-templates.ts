// Görsel şablon motoru. Yazı, logo ve marka renkleri kodla çizilir (yapay zekâ
// görsellerinde Türkçe karakterler ve logolar sık bozulduğu için); yapay zekâ
// yalnızca yazısız arka plan üretir. Saf yardımcılar Node'da test edilebilir.

export type TemplateId = "duz" | "gradyan" | "cerceve" | "serit" | "fotograf";
export type FormatId = "post" | "story" | "campaign";

export const TEMPLATES: Array<{ id: TemplateId; label: string }> = [
  { id: "duz", label: "Düz renk" },
  { id: "gradyan", label: "Gradyan" },
  { id: "cerceve", label: "Çerçeve" },
  { id: "serit", label: "Şerit" },
  { id: "fotograf", label: "Fotoğraflı" },
];

export const FORMATS: Record<
  FormatId,
  { label: string; width: number; height: number; aspect: string }
> = {
  post: { label: "Instagram gönderisi (1:1)", width: 1080, height: 1080, aspect: "1:1" },
  story: { label: "Hikâye (9:16)", width: 1080, height: 1920, aspect: "9:16" },
  campaign: { label: "Kampanya görseli (4:5)", width: 1080, height: 1350, aspect: "4:5" },
};

const DEFAULT_COLORS = ["#1f2937", "#f59e0b"];
const FONT = '"Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif';

// ------------------------------------------------------------ renk yardımcıları

export function normalizeHex(input: string): string | null {
  const m = /^#?([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec((input ?? "").trim());
  if (!m) return null;
  let h = m[1].toLowerCase();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return "#" + h;
}

export function hexToRgb(hex: string): [number, number, number] {
  const h = normalizeHex(hex) ?? "#000000";
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

// WCAG göreli parlaklık
export function luminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

// Zemin üzerinde daha okunaklı olan beyaz veya siyah
export function contrastText(bg: string): "#ffffff" | "#111111" {
  const l = luminance(bg);
  const white = 1.05 / (l + 0.05);
  const black = (l + 0.05) / (luminance("#111111") + 0.05);
  return white >= black ? "#ffffff" : "#111111";
}

export function mix(a: string, b: string, t: number): string {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const c = x.map((v, i) => Math.round(v + (y[i] - v) * t));
  return "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
}

export interface Palette {
  primary: string;
  secondary: string;
  onPrimary: string;
  onSecondary: string;
}

export function resolvePalette(colors: string[] | undefined): Palette {
  const valid = (colors ?? []).map(normalizeHex).filter((c): c is string => Boolean(c));
  const primary = valid[0] ?? DEFAULT_COLORS[0];
  let secondary = valid[1];
  if (!secondary) {
    secondary = valid[0]
      ? mix(primary, contrastText(primary) === "#ffffff" ? "#ffffff" : "#000000", 0.35)
      : DEFAULT_COLORS[1];
  }
  return {
    primary,
    secondary,
    onPrimary: contrastText(primary),
    onSecondary: contrastText(secondary),
  };
}

// ------------------------------------------------------------ yerleşim yardımcıları

// Greedy satır kırma; sığmayan çok uzun kelime karakterden bölünür.
export function wrapLines(measure: (s: string) => number, text: string, maxWidth: number): string[] {
  const out: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      continue;
    }
    let line = "";
    const push = () => {
      if (line) out.push(line);
      line = "";
    };
    for (const word of words) {
      const candidate = line ? line + " " + word : word;
      if (measure(candidate) <= maxWidth) {
        line = candidate;
        continue;
      }
      push();
      if (measure(word) <= maxWidth) {
        line = word;
        continue;
      }
      // tek kelime çok uzun: karakter karakter böl
      let chunk = "";
      for (const ch of Array.from(word)) {
        if (measure(chunk + ch) > maxWidth && chunk) {
          out.push(chunk);
          chunk = ch;
        } else {
          chunk += ch;
        }
      }
      line = chunk;
    }
    push();
  }
  return out;
}

// Kaynak görseli hedefe "cover" olarak oturtan kırpma dikdörtgeni
export function coverRect(srcW: number, srcH: number, dstW: number, dstH: number) {
  const scale = Math.max(dstW / srcW, dstH / srcH);
  const sw = dstW / scale;
  const sh = dstH / scale;
  return { sx: (srcW - sw) / 2, sy: (srcH - sh) / 2, sw, sh };
}

interface Fit {
  size: number;
  lines: string[];
  height: number;
}

const LINE_HEIGHT = 1.18;

function fitText(
  ctx: CanvasRenderingContext2D,
  text: string,
  boxW: number,
  boxH: number,
  maxSize: number,
  minSize: number,
  weight: number
): Fit {
  for (let size = Math.round(maxSize); size >= minSize; size -= 4) {
    ctx.font = `${weight} ${size}px ${FONT}`;
    const lines = wrapLines((s) => ctx.measureText(s).width, text, boxW);
    const height = lines.length * size * LINE_HEIGHT;
    if (height <= boxH) return { size, lines, height };
  }
  const size = minSize;
  ctx.font = `${weight} ${size}px ${FONT}`;
  let lines = wrapLines((s) => ctx.measureText(s).width, text, boxW);
  const maxLines = Math.max(1, Math.floor(boxH / (size * LINE_HEIGHT)));
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last.length > 1 && ctx.measureText(last + "…").width > boxW) last = last.slice(0, -1);
    lines[maxLines - 1] = last + "…";
  }
  return { size, lines, height: lines.length * size * LINE_HEIGHT };
}

// ------------------------------------------------------------ çizim

export interface VisualSpec {
  width: number;
  height: number;
  template: TemplateId;
  headline: string;
  subline: string;
  brandName: string;
  colors: string[];
  logo: CanvasImageSource | null;
  logoSize?: { w: number; h: number };
  background: CanvasImageSource | null;
  backgroundSize?: { w: number; h: number };
}

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  spec: VisualSpec,
  box: Box,
  headColor: string,
  subColor: string,
  valign: "middle" | "bottom"
): number | null {
  const head = spec.headline.trim();
  const sub = spec.subline.trim();
  if (!head && !sub) return null;
  const gap = sub && head ? Math.round(spec.width * 0.03) : 0;

  const headFit = head
    ? fitText(ctx, head, box.w, sub ? box.h * 0.72 : box.h, spec.width * 0.115, 40, 800)
    : null;
  const remaining = box.h - (headFit ? headFit.height : 0) - gap;
  const subFit = sub && remaining > 40
    ? fitText(ctx, sub, box.w, remaining, spec.width * 0.05, 26, 500)
    : null;

  const total = (headFit?.height ?? 0) + (subFit ? gap + subFit.height : 0);
  let y = valign === "bottom" ? box.y + box.h - total : box.y + (box.h - total) / 2;
  const startY = y;

  ctx.textBaseline = "top";
  ctx.textAlign = "left";
  if (headFit) {
    ctx.font = `800 ${headFit.size}px ${FONT}`;
    ctx.fillStyle = headColor;
    for (const line of headFit.lines) {
      ctx.fillText(line, box.x, y);
      y += headFit.size * LINE_HEIGHT;
    }
  }
  if (subFit) {
    y += gap;
    ctx.font = `500 ${subFit.size}px ${FONT}`;
    ctx.fillStyle = subColor;
    for (const line of subFit.lines) {
      ctx.fillText(line, box.x, y);
      y += subFit.size * LINE_HEIGHT;
    }
  }
  return startY; // yazı bloğunun üst kenarı (süs çizgisi için)
}

// Logo (varsa) + işletme adı; (x, centerY) sol-orta noktası
function drawBrand(
  ctx: CanvasRenderingContext2D,
  spec: VisualSpec,
  x: number,
  centerY: number,
  height: number,
  color: string
) {
  let cx = x;
  if (spec.logo && spec.logoSize && spec.logoSize.w > 0 && spec.logoSize.h > 0) {
    const ratio = spec.logoSize.w / spec.logoSize.h;
    const h = height;
    const w = Math.min(h * ratio, spec.width * 0.28);
    ctx.drawImage(spec.logo, cx, centerY - h / 2, w, w / ratio);
    cx += w + height * 0.3;
  }
  const name = spec.brandName.trim();
  if (name) {
    const size = Math.round(height * 0.5);
    ctx.font = `700 ${size}px ${FONT}`;
    ctx.fillStyle = color;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let shown = name;
    const maxW = spec.width - cx - spec.width * 0.08;
    while (shown.length > 1 && ctx.measureText(shown).width > maxW) shown = shown.slice(0, -1);
    ctx.fillText(shown === name ? shown : shown + "…", cx, centerY);
  }
}

export function drawVisual(ctx: CanvasRenderingContext2D, spec: VisualSpec): void {
  const W = spec.width;
  const H = spec.height;
  const m = Math.round(W * 0.08);
  const tall = H / W > 1.6; // hikâye: üst ve alt arayüz alanları boş kalmalı
  const top = tall ? 250 : m;
  const bottom = tall ? 270 : m;
  const footerH = Math.round(W * 0.075);
  const footerCenter = H - bottom - footerH / 2;
  const p = resolvePalette(spec.colors);

  let template = spec.template;
  const hasBg = Boolean(spec.background && spec.backgroundSize);
  if (template === "fotograf" && !hasBg) template = "gradyan"; // arka plan yoksa güvenli yedek

  ctx.clearRect(0, 0, W, H);
  const textBottom = H - bottom - footerH - Math.round(W * 0.04);

  if (template === "duz") {
    ctx.fillStyle = p.primary;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.secondary;
    ctx.fillRect(m, top, Math.round(W * 0.14), 12);
    drawTextBlock(ctx, spec, { x: m, y: top + 50, w: W - 2 * m, h: textBottom - top - 50 }, p.onPrimary, p.onPrimary, "middle");
    drawBrand(ctx, spec, m, footerCenter, footerH, p.onPrimary);
    return;
  }

  if (template === "gradyan") {
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, p.primary);
    g.addColorStop(1, p.secondary);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    const on = contrastText(mix(p.primary, p.secondary, 0.5));
    drawTextBlock(ctx, spec, { x: m, y: top, w: W - 2 * m, h: textBottom - top }, on, on, "middle");
    drawBrand(ctx, spec, m, footerCenter, footerH, on);
    return;
  }

  if (template === "cerceve") {
    ctx.fillStyle = "#faf8f4";
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.secondary;
    ctx.beginPath();
    ctx.arc(W * 0.92, H * 0.08, W * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.primary;
    ctx.lineWidth = Math.round(W * 0.012);
    const inset = Math.round(W * 0.035);
    ctx.strokeRect(inset, inset, W - 2 * inset, H - 2 * inset);
    drawTextBlock(ctx, spec, { x: m, y: top, w: W - 2 * m, h: textBottom - top }, "#1a1a1a", "#4b4b4b", "middle");
    drawBrand(ctx, spec, m, footerCenter, footerH, "#1a1a1a");
    return;
  }

  if (template === "serit") {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, W, H);
    const bandH = tall ? 300 : Math.round(W * 0.17);
    ctx.fillStyle = p.primary;
    ctx.fillRect(0, 0, W, bandH);
    const bandCenter = tall ? bandH - 90 : bandH / 2;
    drawBrand(ctx, spec, m, bandCenter, Math.round(W * 0.075), p.onPrimary);
    const textTop = bandH + m;
    const textBottom2 = H - (tall ? bottom : m);
    ctx.fillStyle = p.secondary;
    ctx.fillRect(m, textTop, 14, textBottom2 - textTop);
    drawTextBlock(ctx, spec, { x: m + 44, y: textTop, w: W - 2 * m - 44, h: textBottom2 - textTop }, "#111111", "#4b4b4b", "middle");
    return;
  }

  // fotograf (arka plan var)
  const bg = spec.background as CanvasImageSource;
  const size = spec.backgroundSize as { w: number; h: number };
  const r = coverRect(size.w, size.h, W, H);
  ctx.drawImage(bg, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
  const shade = ctx.createLinearGradient(0, 0, 0, H);
  shade.addColorStop(0, "rgba(0,0,0,0.18)");
  shade.addColorStop(0.45, "rgba(0,0,0,0.25)");
  shade.addColorStop(1, "rgba(0,0,0,0.72)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, W, H);
  const textTopY = drawTextBlock(
    ctx,
    spec,
    { x: m, y: textBottom - Math.round(H * 0.4), w: W - 2 * m, h: Math.round(H * 0.4) },
    "#ffffff",
    "#f1f1f1",
    "bottom"
  );
  if (textTopY !== null) {
    ctx.fillStyle = p.secondary;
    ctx.fillRect(m, textTopY - 36, Math.round(W * 0.14), 12);
  }
  drawBrand(ctx, spec, m, footerCenter, footerH, "#ffffff");
}
