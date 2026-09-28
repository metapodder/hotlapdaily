// First-person 3D view of the same 2D track. Purely visual: physics/collision stay 2D.
// Ground is drawn in layers (kerb underlay, then tarmac, then start line) instead of depth-sorted,
// because everything on the ground is coplanar - layer order is what the 2D view does too.

// Car model: convex parts, each a side profile in (u forward, z up) extruded across v (right).
// Units are car pixels (the 2D car is 9 long x 5 wide). Built once, reused every frame.
const circle = (cu, cz, r, n = 14) => Array.from({ length: n }, (_, k) => [cu + Math.cos(2 * Math.PI * k / n) * r, cz + Math.sin(2 * Math.PI * k / n) * r]);
const part = (profile, v0, v1, colorKey) => {
    const cap = (v) => profile.map(([u, z]) => [u, v, z]);
    const faces = [cap(v0), cap(v1)];
    for (let i = 0; i < profile.length; i++) {
        const [ua, za] = profile[i], [ub, zb] = profile[(i + 1) % profile.length];
        faces.push([[ua, v0, za], [ub, v0, zb], [ub, v1, zb], [ua, v1, za]]);
    }
    const all = faces.flat();
    const center = [0, 1, 2].map(k => all.reduce((s, p) => s + p[k], 0) / all.length);
    return { faces, center, colorKey };
};
const mirror = (profile, v0, v1, key) => [part(profile, v0, v1, key), part(profile, -v1, -v0, key)];
const CAR_PARTS = [
    part([[5.3, 0.3], [5.3, 0.5], [1.5, 0.95], [1.5, 0.3]], -0.35, 0.35, 'main'),                   // nose
    part([[1.5, 0.3], [1.5, 0.95], [-0.8, 1.25], [-3.8, 1.0], [-4.2, 0.3]], -0.8, 0.8, 'main'),     // tub + engine cover
    ...mirror([[0.8, 0.35], [0.8, 0.8], [0.2, 0.95], [-2.0, 0.8], [-2.5, 0.35]], 0.8, 1.3, 'main'), // sidepods
    part(circle(-0.1, 1.45, 0.38, 10), -0.32, 0.32, 'helmet'),
    part([[5.7, 0.12], [5.7, 0.24], [4.4, 0.42], [4.4, 0.12]], -2.5, 2.5, 'accent'),               // front wing
    ...mirror([[5.8, 0.1], [5.8, 0.6], [4.3, 0.6], [4.3, 0.1]], 2.4, 2.55, 'accent'),              // front endplates
    part([[-3.9, 1.75], [-3.9, 1.95], [-4.9, 2.15], [-4.9, 1.8]], -2.2, 2.2, 'accent'),            // rear wing
    ...mirror([[-3.7, 0.9], [-3.7, 2.25], [-5.0, 2.25], [-5.0, 0.9]], 2.2, 2.35, 'accent'),        // rear endplates
    ...mirror(circle(2.7, 0.6, 0.6), 1.3, 2.3, 'tyre'),                                             // front tyres
    ...mirror(circle(-2.8, 0.66, 0.66), 1.3, 2.45, 'tyre'),                                         // rear tyres
];
const LIGHT = (() => { const l = [0.35, -0.4, 0.85], m = Math.hypot(...l); return l.map(x => x / m); })();
const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const c = (sh) => Math.min(255, Math.round(((n >> sh) & 255) * k));
    return `rgb(${c(16)},${c(8)},${c(0)})`;
};

export function drawPOV(ctx, canvas, checkpoints, cam, yOffset, cockpitColor, cars = [], carScale = 1) {
    const W = canvas.width, H = canvas.height;
    const scale = Math.min(W, H) / 400;
    const half = 25 * scale;                  // track width is 50 * scale
    const kerb = 4 * scale;
    const eye = 7 * scale;                    // camera height
    const near = 2 * scale, far = 700 * scale;
    const horizon = H * 0.42;
    const focal = (W / 2) / Math.tan(Math.PI / 3.2);
    const cos = Math.cos(cam.angle), sin = Math.sin(cam.angle);

    // Sky + grass
    const sky = ctx.createLinearGradient(0, 0, 0, horizon);
    sky.addColorStop(0, '#4a90d9'); sky.addColorStop(1, '#bfe0ff');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, horizon);
    ctx.fillStyle = '#3f8f3a'; ctx.fillRect(0, horizon, W, H - horizon);

    if (!checkpoints || checkpoints.length < 2) return;

    // World (car space) -> camera: f = forward, r = right, z = up
    const toCam = (x, y, z = 0) => {
        const dx = x - cam.x, dy = y - cam.y;
        return { f: dx * cos + dy * sin, r: -dx * sin + dy * cos, z };
    };
    const project = (p) => [W / 2 + (p.r / p.f) * focal, horizon + ((eye - p.z) / p.f) * focal];

    // Clip convex polygon (camera space) to f >= near
    const clip = (poly) => {
        const out = [];
        for (let i = 0; i < poly.length; i++) {
            const a = poly[i], b = poly[(i + 1) % poly.length];
            const ain = a.f >= near, bin = b.f >= near;
            if (ain) out.push(a);
            if (ain !== bin) {
                const t = (near - a.f) / (b.f - a.f);
                out.push({ f: near, r: a.r + (b.r - a.r) * t, z: a.z + (b.z - a.z) * t });
            }
        }
        return out;
    };
    const fillPoly = (camPoly, color, seams = true) => {
        if (camPoly.every(c => c.f < near) || camPoly.every(c => c.f > far)) return;
        const poly = clip(camPoly);
        if (poly.length < 3) return;
        ctx.fillStyle = color;
        ctx.strokeStyle = color; // hairline stroke hides seams between neighbours
        ctx.beginPath();
        poly.forEach((p, i) => { const [x, y] = project(p); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
        ctx.closePath();
        ctx.fill();
        if (seams) ctx.stroke(); // would show as lines on translucent faces
    };
    const ground = (pts, color) => fillPoly(pts.map(p => toCam(p.x, p.y)), color);

    // Centerline in car space (track points live at y + yOffset) with unit normals per segment
    const pts = checkpoints.map(p => ({ x: p.x, y: p.y + yOffset }));
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) {
        const a = pts[i], b = pts[i + 1];
        const len = Math.hypot(b.x - a.x, b.y - a.y);
        if (len < 1e-6) continue;
        segs.push({ a, b, len, nx: -(b.y - a.y) / len, ny: (b.x - a.x) / len });
    }

    ctx.lineWidth = 1;
    const chunk = 12 * scale;
    // Rectangle across a segment chunk at lateral offsets [w0, w1]
    const band = (s, t0, t1, w0, w1) => {
        const p0 = { x: s.a.x + (s.b.x - s.a.x) * t0, y: s.a.y + (s.b.y - s.a.y) * t0 };
        const p1 = { x: s.a.x + (s.b.x - s.a.x) * t1, y: s.a.y + (s.b.y - s.a.y) * t1 };
        const at = (p, w) => ({ x: p.x + s.nx * w, y: p.y + s.ny * w });
        return [at(p0, w0), at(p0, w1), at(p1, w1), at(p1, w0)];
    };
    // Round joints like the 2D lineJoin: 12-gon at each checkpoint
    const disc = (c, r) => Array.from({ length: 12 }, (_, k) => ({ x: c.x + Math.cos(k * Math.PI / 6) * r, y: c.y + Math.sin(k * Math.PI / 6) * r }));
    const eachChunk = (fn) => {
        let stripe = 0;
        for (const s of segs) {
            const steps = Math.max(1, Math.ceil(s.len / chunk));
            for (let k = 0; k < steps; k++) fn(s, k / steps, (k + 1) / steps, stripe++);
        }
    };

    // Layer 1: kerbs (full width). Layer 2: tarmac on top, so kerbs only survive at the edges.
    for (const p of pts) ground(disc(p, half), '#d62828');
    eachChunk((s, t0, t1, i) => ground(band(s, t0, t1, -half, half), i % 2 ? '#ffffff' : '#d62828'));
    for (const p of pts) ground(disc(p, half - kerb), '#6b6b6b');
    eachChunk((s, t0, t1, i) => ground(band(s, t0, t1, -half + kerb, half - kerb), i % 2 ? '#6b6b6b' : '#727272'));

    // Layer 3: checkered start/finish band
    if (segs.length) {
        const s0 = segs[0], dir = { x: s0.ny, y: -s0.nx }, depth = 5 * scale, cells = 8;
        for (let c = 0; c < cells; c++) {
            for (let r = 0; r < 2; r++) {
                const w0 = -half + (2 * half * c) / cells, w1 = -half + (2 * half * (c + 1)) / cells;
                const d0 = (r - 1) * depth, d1 = r * depth;
                const at = (w, d) => ({ x: s0.a.x + s0.nx * w + dir.x * d, y: s0.a.y + s0.ny * w + dir.y * d });
                ground([at(w0, d0), at(w1, d0), at(w1, d1), at(w0, d1)], (c + r) % 2 ? '#111111' : '#ffffff');
            }
        }
    }

    // Other cars (ghosts): back-face culled, lit per face, sorted far-to-near
    const faces = [];
    const camW = [cam.x, cam.y, eye];
    for (const car of cars) {
        if (Math.hypot(car.x - cam.x, car.y - cam.y) < 6 * carScale) continue; // overlapping the camera
        const ca = Math.cos(car.angle), sa = Math.sin(car.angle);
        const colors = { main: car.color.main, accent: car.color.accent, helmet: '#ffd300', tyre: '#1c1c1c' };
        const toWorld = ([u, v, z]) => [car.x + (ca * u - sa * v) * carScale, car.y + (sa * u + ca * v) * carScale, z * carScale];
        for (const pt of CAR_PARTS) {
            const center = toWorld(pt.center);
            for (const face of pt.faces) {
                const wv = face.map(toWorld);
                const c = [0, 1, 2].map(k => wv.reduce((s, p) => s + p[k], 0) / wv.length);
                const e1 = [0, 1, 2].map(k => wv[1][k] - wv[0][k]), e2 = [0, 1, 2].map(k => wv[2][k] - wv[0][k]);
                let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
                const len = Math.hypot(...n) || 1;
                n = n.map(x => x / len);
                if (n.reduce((s, x, k) => s + x * (c[k] - center[k]), 0) < 0) n = n.map(x => -x); // point outward
                if (n.reduce((s, x, k) => s + x * (c[k] - camW[k]), 0) >= 0) continue;            // faces away
                // Light dir is in (x, y-down, z-up) world space
                const lit = 0.5 + 0.6 * Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
                faces.push({
                    d: Math.hypot(c[0] - camW[0], c[1] - camW[1], c[2] - camW[2]),
                    poly: wv.map(([x, y, z]) => toCam(x, y, z)),
                    color: shade(colors[pt.colorKey], lit),
                    alpha: car.alpha ?? 1,
                });
            }
        }
    }
    faces.sort((a, b) => b.d - a.d);
    for (const f of faces) {
        ctx.globalAlpha = f.alpha;
        fillPoly(f.poly, f.color, f.alpha >= 1);
    }
    ctx.globalAlpha = 1;

    drawCockpit(ctx, W, H, cockpitColor);
}

function drawCockpit(ctx, W, H, teamColor) {
    const cx = W / 2;
    // Front tyres: rounded, with a sidewall highlight
    for (const x of [cx - W * 0.34, cx + W * 0.24]) {
        ctx.fillStyle = '#141414';
        ctx.beginPath();
        ctx.roundRect(x, H * 0.82, W * 0.1, H * 0.22, W * 0.03);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.fillRect(x + W * 0.015, H * 0.84, W * 0.012, H * 0.16);
    }
    // Nose cone: curved sides, lit centre ridge
    const grad = ctx.createLinearGradient(cx - W * 0.13, 0, cx + W * 0.13, 0);
    grad.addColorStop(0, shade(teamColor.main, 0.6));
    grad.addColorStop(0.5, teamColor.main);
    grad.addColorStop(1, shade(teamColor.main, 0.6));
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.025, H * 0.79);
    ctx.quadraticCurveTo(cx, H * 0.775, cx + W * 0.025, H * 0.79);
    ctx.quadraticCurveTo(cx + W * 0.06, H * 0.9, cx + W * 0.14, H);
    ctx.lineTo(cx - W * 0.14, H);
    ctx.quadraticCurveTo(cx - W * 0.06, H * 0.9, cx - W * 0.025, H * 0.79);
    ctx.fill();
    ctx.fillStyle = teamColor.accent;
    ctx.beginPath();
    ctx.moveTo(cx - W * 0.003, H * 0.785);
    ctx.lineTo(cx + W * 0.003, H * 0.785);
    ctx.lineTo(cx + W * 0.008, H);
    ctx.lineTo(cx - W * 0.008, H);
    ctx.fill();
}

// Top-down picture-in-picture of the track with car dots, so both views are visible at once
export function drawMinimap(ctx, canvas, checkpoints, yOffset, dots) {
    if (!checkpoints || checkpoints.length < 2) return;
    const W = canvas.width;
    const size = W * 0.24, pad = W * 0.015;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of checkpoints) {
        minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y + yOffset); maxY = Math.max(maxY, p.y + yOffset);
    }
    const k = (size * 0.84) / Math.max(maxX - minX, maxY - minY, 1);
    const ox = W - pad - size + (size - (maxX - minX) * k) / 2;
    const oy = pad + (size - (maxY - minY) * k) / 2;
    const map = (x, y) => [ox + (x - minX) * k, oy + (y - minY) * k];

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(W - pad - size, pad, size, size);
    ctx.strokeStyle = '#e5e5e5';
    ctx.lineWidth = Math.max(2, 50 * (Math.min(W, canvas.height) / 400) * k);
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.beginPath();
    checkpoints.forEach((p, i) => { const [x, y] = map(p.x, p.y + yOffset); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    for (const d of dots) {
        const [x, y] = map(d.x, d.y);
        ctx.globalAlpha = d.alpha ?? 1;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(3, size * 0.025), 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}
