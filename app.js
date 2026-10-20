"use strict";

/* ===== 段階の定義（左から順） ===== */
const LEVELS = [
    { label: "興味なし", fill: 0 },
    { label: "少し興味あり", fill: 0.2 },
    { label: "興味あり", fill: 0.5 },
    { label: "好き", fill: 0.9 },
    { label: "大好き", fill: 1 }, // やや溢れる
];
const LOVE = 4, DEFAULT_LEVEL = 0;

/* ===== 明るさの3段階（白・黒に寄りすぎて見えなくならない範囲に固定） ===== */
const TONES = [
    { label: "明るい", s: 0.85, l: 0.7 },
    { label: "ふつう", s: 0.75, l: 0.5 },
    { label: "暗い", s: 0.70, l: 0.3 },
];
const DEFAULT_TONE = 1;

/* ===== どのときの自分として ===== */
const ROLES = ["ぐり", "ぐら", "両刀"];
const DEFAULT_ROLE = 0;

const SETTINGS = Object.assign({ title: "({role}) #くすぐり性癖の瓶", columns: 8 }, typeof JAR_SETTINGS === "object" ? JAR_SETTINGS : {});
const INK = "#1f1d1b";
const FONT_UI = '"Zen Kaku Gothic New", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif';
const FONT_HAND = '"Zen Kaku Gothic New", "Yu Gothic", sans-serif';
const STORE_KEY = "tickling-jars";

/* ===== 状態（ブラウザ内にだけ保存） ===== */
let state = { name: "", color: { h: 214, tone: DEFAULT_TONE }, role: DEFAULT_ROLE, answers: {} };
try {
    const s = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (s && typeof s === "object") {
        const h = Number.isFinite(s.color?.h) ? s.color.h : Number.isFinite(s.hsv?.h) ? s.hsv.h : state.color.h;
        const tone = Number.isInteger(s.color?.tone) && TONES[s.color.tone] ? s.color.tone : DEFAULT_TONE;
        const role = Number.isInteger(s.role) && ROLES[s.role] ? s.role : DEFAULT_ROLE;
        state = { name: typeof s.name === "string" ? s.name : "", color: { h, tone }, role, answers: { ...s.answers } };
    }
} catch (e) { }
const persist = () => { try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { } };
const levelOf = key => {
    const v = state.answers[key];
    return Number.isInteger(v) && v >= 0 && v < LEVELS.length ? v : DEFAULT_LEVEL;
};
const displayName = label => label.replace(/\n/g, "");
const posterTitle = () => (SETTINGS.title || "").replace(/\{role\}/g, ROLES[state.role]);

/* ===== 色ユーティリティ ===== */
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function hslToRgb(h, s, l) {
    const a = s * Math.min(l, 1 - l);
    const f = n => { const k = (n + h / 30) % 12; return 255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))); };
    return [f(0), f(8), f(4)];
}
const toneRgb = (h, tone) => hslToRgb(h, TONES[tone].s, TONES[tone].l);
const colorRgb = () => toneRgb(state.color.h, state.color.tone);
const rgbToHex = a => "#" + a.map(v => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0")).join("");
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const css = (a, alpha = 1) => `rgba(${a.map(Math.round).join(",")},${alpha})`;
const lighten = (a, t) => css(mix(a, [255, 255, 255], t));
const darken = (a, t) => css(mix(a, [0, 0, 0], t));
const luminance = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;

/* 項目名から決まる乱数（同じ項目はいつも同じ見た目になる） */
function hashStr(str) { let h = 2166136261; for (const ch of str) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) { return () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* ===== 瓶の描画（ローカル座標：幅100 × 高さ180、上端がフタ） ===== */
const BODY_TOP = 34, BODY_BOTTOM = 180;

function roundRectPath(c, x, y, w, h, r) {
    c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath();
}
function bodyPath(c) {
    c.beginPath(); c.moveTo(20, BODY_TOP);
    c.quadraticCurveTo(6, 37, 6, 60); c.lineTo(6, 154); c.quadraticCurveTo(6, 180, 32, 180);
    c.lineTo(68, 180); c.quadraticCurveTo(94, 180, 94, 154); c.lineTo(94, 60); c.quadraticCurveTo(94, 37, 80, BODY_TOP);
    c.closePath();
}
function drawLid(c, rgb, dx, dy, rot) {
    c.save(); c.translate(50 + dx, 13 + dy); c.rotate(rot); c.translate(-50, -13);
    c.beginPath(); roundRectPath(c, 10, 2, 80, 22, 6);
    c.fillStyle = lighten(rgb, 0.82); c.fill(); c.lineWidth = 4.5; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 2.2; c.beginPath();
    for (const y of [9, 16]) { c.moveTo(15, y); c.lineTo(85, y); }
    c.stroke(); c.restore();
}

/* strength: 溢れ量（0〜1）。乱数は位置・太さ・長さのわずかな揺らぎにだけ使う */
function makeSpill(r, strength = 0.8) {
    const j = 2;
    const base = 45;                          // 口の位置は固定
    const n = 4;                              // しずくの本数は固定
    const profile = [0.55, 0.9, 0.4, 0.75];   // 各しずくの長さの比率（固定）
    const maxL = 8 + strength * 52;           // 溢れ量から全体の長さが決まる
    const span = 84 / n;
    const drips = [];

    for (let i = 0; i < n; i++) {
        // 乱数は必ず引く（j が 0 でも引く順番が変わらないように）
        const w = 11 + (r() - 0.5) * 1.5 * j;
        drips.push({
            cx: 8 + span * (i + 0.5) + (r() - 0.5) * span * 0.2 * j,
            w,
            L: maxL * profile[i] * (1 + (r() - 0.5) * 0.06 * j),
        });
    }

    const spill = { base, drips, puddle: null };

    // 溢れ量が閾値を超えたら、最も長いしずくが床まで垂れて水たまりになる
    if (strength >= 0.8) {
        const longest = drips.reduce((a, b) => (a.L > b.L ? a : b));
        longest.L = 999;
        spill.puddle = { cx: 50 + (r() - 0.5) * 6 * j, rx: 44, ry: 7 };
    }

    for (const d of drips) d.L = Math.min(d.L, BODY_BOTTOM - base - d.w * 0.55);
    return spill;
}

function spillPath(c, { base, drips }) {
    c.moveTo(2, base);
    c.quadraticCurveTo(0, 26, 8, 20);
    c.quadraticCurveTo(20, 8, 32, 15); c.quadraticCurveTo(46, 6, 60, 14); c.quadraticCurveTo(76, 6, 92, 20);
    c.quadraticCurveTo(100, 26, 98, base);
    for (const d of [...drips].sort((a, b) => b.cx - a.cx)) {
        const hw = d.w / 2;
        c.lineTo(d.cx + hw + 4, base); c.quadraticCurveTo(d.cx + hw, base, d.cx + hw, base + 5);
        c.lineTo(d.cx + hw * 0.85, base + d.L);
        c.arc(d.cx, base + d.L, hw * 1.05, 0, Math.PI, false);
        c.lineTo(d.cx - hw, base + 5); c.quadraticCurveTo(d.cx - hw, base, d.cx - hw - 4, base);
    }
    c.closePath();
}

function drawJar(c, key, level, rgb) {
    // 乱数は毎回同じ順番で引く（段階によって見た目がブレないように）
    const r = rng(hashStr(key));
    const phase = r() * Math.PI * 2, side = r() < 0.5 ? -1 : 1, tilt = side * (0.08 + r() * 0.08);
    const bubbles = Array.from({ length: 6 }, () => [20 + r() * 60, r(), 1.6 + r() * 2.4]);
    const spill = makeSpill(r, 0.8);
    const over = level === LOVE, fill = css(rgb);

    c.save(); c.lineJoin = "round"; c.lineCap = "round";

    // 水たまり（瓶の下）
    if (over && spill.puddle) {
        const p = spill.puddle;
        c.beginPath(); c.ellipse(p.cx, BODY_BOTTOM + 1, p.rx, p.ry, 0, 0, Math.PI * 2);
        c.lineWidth = 7; c.strokeStyle = INK; c.stroke(); c.fillStyle = fill; c.fill();
        c.beginPath(); c.ellipse(p.cx - p.rx * 0.55, BODY_BOTTOM, p.rx * 0.18, 1.8, 0, 0, Math.PI * 2);
        c.fillStyle = "rgba(255,255,255,.6)"; c.fill();
    }

    // 中身
    c.save(); bodyPath(c); c.fillStyle = "#fff"; c.fill(); c.clip();
    const frac = LEVELS[level].fill;
    if (frac > 0) {
        const ly = over ? 20 : BODY_BOTTOM - (BODY_BOTTOM - BODY_TOP) * frac, amp = over ? 0 : 2;
        const g = c.createLinearGradient(0, ly, 0, BODY_BOTTOM);
        g.addColorStop(0, lighten(rgb, 0.12)); g.addColorStop(1, darken(rgb, 0.18));
        const surface = () => { for (let x = -4; x <= 104; x += 4) c.lineTo(x, ly + Math.sin(x * 0.11 + phase) * amp); };
        c.beginPath(); c.moveTo(-4, ly); surface(); c.lineTo(104, 190); c.lineTo(-4, 190); c.closePath(); c.fillStyle = g; c.fill();
        if (!over) { c.beginPath(); c.moveTo(-4, ly); surface(); c.strokeStyle = lighten(rgb, 0.45); c.lineWidth = 3; c.stroke(); }
        const room = BODY_BOTTOM - ly - 20;
        if (room > 6) {
            c.strokeStyle = css(mix(rgb, [255, 255, 255], 0.6), 0.85); c.lineWidth = 1.6;
            for (const [bx, t, br] of bubbles.slice(0, level + 1)) { c.beginPath(); c.arc(bx, ly + 10 + t * room, br, 0, Math.PI * 2); c.stroke(); }
        }
    }
    c.fillStyle = "rgba(255,255,255,.55)";
    c.beginPath(); roundRectPath(c, 13, 56, 6, 74, 3); roundRectPath(c, 13, 136, 6, 10, 3); c.fill();
    c.restore();

    // ガラス
    bodyPath(c); c.lineWidth = 4.5; c.strokeStyle = INK; c.stroke();
    c.lineWidth = 2.4; c.beginPath();
    c.moveTo(20, 168); c.quadraticCurveTo(28, 173, 40, 172); c.moveTo(60, 172); c.quadraticCurveTo(72, 173, 80, 168); c.stroke();
    c.beginPath(); roundRectPath(c, 14, 22, 72, 14, 4); c.fillStyle = over ? fill : "#fff"; c.fill(); c.lineWidth = 4; c.stroke();

    // 溢れ
    if (over) {
        c.beginPath(); spillPath(c, spill); c.lineWidth = 7; c.strokeStyle = INK; c.stroke(); c.fillStyle = fill; c.fill();
        c.strokeStyle = "rgba(255,255,255,.6)"; c.lineWidth = 2.5; c.beginPath();
        c.moveTo(5, spill.base - 10); c.quadraticCurveTo(5, 26, 12, 22);
        for (const d of spill.drips) if (d.L > 20) { c.moveTo(d.cx - d.w * 0.2, spill.base + 6); c.lineTo(d.cx - d.w * 0.2, spill.base + d.L - 5); }
        c.stroke();
    }

    if (over) drawLid(c, rgb, side * 3, -7, tilt); else drawLid(c, rgb, 0, 0, 0);
    c.restore();
}

/* 小さいプレビュー用（CSSで 64×116 表示） */
function drawMini(canvas, key, level, rgb) {
    const W = 64, H = 116, dpr = window.devicePixelRatio || 1, k = H / 206;
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    const c = canvas.getContext("2d");
    c.setTransform(dpr * k, 0, 0, dpr * k, dpr * (W - 100 * k) / 2, dpr * 16 * k);
    drawJar(c, key, level, rgb);
}

/* ===== 画像（ポスター） ===== */
function fitLabel(c, text, maxW, maxSize, minSize) {
    const forced = text.split("\n");
    const breakLine = line => {
        const out = []; let cur = "";
        for (const ch of line) {
            if (cur && c.measureText(cur + ch).width > maxW) { out.push(cur); cur = ch; } else cur += ch;
        }
        return out.concat(cur);
    };
    let lines = forced;
    for (let size = maxSize; size >= minSize; size--) {
        c.font = `500 ${size}px ${FONT_UI}`;
        if (forced.every(l => c.measureText(l).width <= maxW)) return { size, lines: forced };
    }
    lines = forced.flatMap(breakLine);
    return { size: minSize, lines };
}

function drawPoster(canvas, scale) {
    const rgb = colorRgb();
    const cols = clamp(Math.floor(SETTINGS.columns) || 7, 1, Math.max(1, JARS.length));
    const CELL_W = 160, CELL_H = 300, GRID_TOP = 230;
    const PW = Math.max(1040, cols * CELL_W + 120);
    const rows = Math.ceil(JARS.length / cols);
    const PH = GRID_TOP + rows * CELL_H + 80;

    canvas.width = PW * scale; canvas.height = PH * scale;
    const c = canvas.getContext("2d");
    c.setTransform(scale, 0, 0, scale, 0, 0);
    c.fillStyle = "#fff"; c.fillRect(0, 0, PW, PH);

    // 名前 + タイトル
    const name = state.name.trim(), title = posterTitle();
    c.textBaseline = "alphabetic";
    c.font = `500 46px ${FONT_UI}`;
    const titleW = c.measureText(title).width, gap = 30, BASE = 150;
    let nameSize = 88, nameW;
    if (name) {
        for (; nameSize > 30; nameSize -= 2) {
            c.font = `${nameSize}px ${FONT_HAND}`; nameW = c.measureText(name).width;
            if (nameW <= PW - 160 - titleW - gap) break;
        }
    } else nameW = 300;
    const x0 = (PW - nameW - gap - titleW) / 2;
    c.strokeStyle = css(rgb); c.lineWidth = 12; c.lineCap = "round";
    c.beginPath(); c.moveTo(x0 + 4, BASE + 16); c.lineTo(x0 + nameW - 4, BASE + 16); c.stroke();
    c.fillStyle = INK; c.textAlign = "left";
    if (name) { c.font = `${nameSize}px ${FONT_HAND}`; c.fillText(name, x0, BASE); }
    c.font = `500 46px ${FONT_UI}`; c.fillText(title, x0 + nameW + gap, BASE);

    // 瓶の一覧（最後の行は中央寄せ）
    JARS.forEach((label, i) => {
        const row = Math.floor(i / cols), col = i % cols;
        const inRow = Math.min(cols, JARS.length - row * cols);
        const cx = PW / 2 + (col - (inRow - 1) / 2) * CELL_W, top = GRID_TOP + row * CELL_H;
        c.save(); c.translate(cx - 50, top + 22); drawJar(c, label, levelOf(label), rgb); c.restore();
        const { size, lines } = fitLabel(c, label, CELL_W + 24, 22, 18);
        c.font = `500 ${size}px ${FONT_UI}`; c.fillStyle = INK; c.textAlign = "center";
        lines.forEach((l, k) => c.fillText(l, cx, top + 22 + 180 + 44 + k * (size + 6)));
    });

    // 下部のクレジット
    c.font = `400 26px ${FONT_UI}`;
    c.fillStyle = "#8a8580";
    c.textAlign = "center";
    c.fillText("製作：れー(@ray_tkl)", PW / 2, PH - 30);
}

/* ===== UI ===== */
const $ = id => document.getElementById(id);

// 興味関心のスライダー
const itemsEl = $("items");
const items = JARS.map(label => {
    const el = document.createElement("div");
    el.className = "item";
    el.innerHTML =
        `<canvas class="mini" aria-hidden="true"></canvas>` +
        `<div><div class="item-head"><span class="item-name"></span></div>` +
        `<input type="range" class="level" min="0" max="${LEVELS.length - 1}" step="1">` +
        `<div class="ends" aria-hidden="true"><span>興味なし</span><span>大好き</span></div></div>`;
    el.querySelector(".item-name").textContent = displayName(label);
    const slider = el.querySelector(".level");
    slider.setAttribute("aria-label", displayName(label));
    slider.addEventListener("input", () => { state.answers[label] = +slider.value; persist(); renderItem(item); });
    itemsEl.appendChild(el);
    const item = { label, el, slider, canvas: el.querySelector(".mini") };
    return item;
});
function renderItem(item, rgb = colorRgb()) {
    const lv = levelOf(item.label), text = LEVELS[lv].label;
    item.slider.value = lv;
    item.slider.style.setProperty("--pct", (lv / (LEVELS.length - 1)) * 100 + "%");
    item.slider.setAttribute("aria-valuetext", text);
    drawMini(item.canvas, item.label, lv, rgb);
}

// 名前
$("name").value = state.name;
$("name").addEventListener("input", e => { state.name = e.target.value; persist(); });

// 色（色相バー + 明るさ3段階）
const toneEl = $("tones");
const toneButtons = TONES.map((t, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tone-dot";
    b.innerHTML = `<span class="tone-swatch"></span>`;
    b.setAttribute("aria-label", t.label);
    b.addEventListener("click", () => setColor({ ...state.color, tone: i }));
    toneEl.appendChild(b);
    return b;
});
function setColor(color) {
    state.color = { h: clamp(color.h, 0, 360), tone: color.tone };
    persist(); renderColor();
}
$("hue").addEventListener("input", e => setColor({ ...state.color, h: +e.target.value }));

// どのときの自分として
const roleButtons = ROLES.map((label, i) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "tone"; b.textContent = label;
    b.addEventListener("click", () => { state.role = i; persist(); renderRole(); });
    $("roles").appendChild(b);
    return b;
});
function renderRole() { roleButtons.forEach((b, i) => b.setAttribute("aria-pressed", i === state.role)); }

let colorQueued = false;
function renderColor() {
    const { h, tone } = state.color, rgb = colorRgb(), hex = rgbToHex(rgb);
    const root = document.documentElement.style;
    root.setProperty("--c", hex);
    root.setProperty("--on-c", luminance(rgb) > 0.62 ? INK : "#fff");
    $("hue").value = Math.round(h); $("hue").style.setProperty("--hue-c", `hsl(${h} 100% 50%)`);
    toneButtons.forEach((b, i) => {
        b.setAttribute("aria-pressed", i === tone);
        b.firstChild.style.background = rgbToHex(toneRgb(h, i));
    });
    // 瓶の再描画はまとめて1フレームに1回
    if (colorQueued) return;
    colorQueued = true;
    requestAnimationFrame(() => {
        colorQueued = false;
        const c = colorRgb();
        drawMini($("pv1"), "preview-1", 1, c); drawMini($("pv2"), "preview-2", 3, c); drawMini($("pv3"), "preview-3", 4, c);
        items.forEach(it => renderItem(it, c));
    });
}

// 画像を生成
let resultUrl = null;
async function generate() {
    const btn = $("generate");
    btn.disabled = true; btn.textContent = "生成中…";
    try {
        const name = state.name.trim();
        const labelText = JARS.join("") + posterTitle();
        await Promise.all([
            document.fonts.load(`500 28px "Zen Kaku Gothic New"`, labelText),
            document.fonts.load(`500 46px "Zen Kaku Gothic New"`, labelText),
            name ? document.fonts.load(`88px "Zen Kaku Gothic New"`, name) : null,
        ]).catch(() => { });
        const out = document.createElement("canvas");
        drawPoster(out, 2);
        const blob = await new Promise(res => out.toBlob(res, "image/png"));
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        resultUrl = URL.createObjectURL(blob);
        const safe = name.replace(/[\\/:*?"<>|\s]+/g, "_");
        $("resultImg").src = resultUrl;
        $("download").href = resultUrl;
        $("download").download = (safe ? safe + "_" : "") + "tickling_jars.png";
        const creatorCard = $("creatorCard");
        const slot = $("creatorSlotAfterResult");
        if (creatorCard && slot) slot.appendChild(creatorCard);
        $("result").hidden = false;
        $("result").scrollIntoView({ behavior: "smooth", block: "start" });
    } finally {
        btn.disabled = false; btn.textContent = "画像を生成";
    }
}
$("generate").addEventListener("click", generate);

renderColor();
renderRole();
