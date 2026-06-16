import { lightenColor, darkenColor } from '/game/render/colors.js';

export function drawTrack(ctx, checkpoints, canvas) {
    if (!checkpoints || checkpoints.length < 2) {
        console.error('[Draw] No valid track checkpoints found:', checkpoints);
        return;
    }

    const scale = Math.min(canvas.width, canvas.height) / 400;
    const trackWidth = 50 * scale;
    console.debug('[Draw] Drawing track with width:', trackWidth, 'scale:', scale);

    ctx.strokeStyle = '#E5E5E5';
    ctx.lineWidth = trackWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#E5E5E5');
    gradient.addColorStop(1, '#F0F0F0');
    ctx.strokeStyle = gradient;

    try {
        ctx.beginPath();
        ctx.moveTo(checkpoints[0].x, checkpoints[0].y);
        for (let i = 1; i < checkpoints.length; i++) {
            const point = checkpoints[i];
            if (point && typeof point.x === 'number' && typeof point.y === 'number') {
                ctx.lineTo(point.x, point.y);
            } else {
                console.error(`[Draw] Invalid checkpoint at index ${i}:`, point);
            }
        }
        ctx.stroke();
    } catch (error) {
        console.error('[Draw] Error drawing track:', error);
    }

    for (let i = 0; i < checkpoints.length - 1; i++) {
        const start = checkpoints[i];
        const end = checkpoints[i + 1];
        if (!start || !end || typeof start.x !== 'number' || typeof start.y !== 'number' || typeof end.x !== 'number' || typeof end.y !== 'number') {
            console.error(`[Draw] Invalid checkpoint pair at index ${i}:`, { start, end });
            continue;
        }
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
        const arrowSpacing = 80 * scale;
        const numArrows = Math.max(1, Math.floor(segmentLength / arrowSpacing));
        for (let j = 1; j <= numArrows; j++) {
            const t = j / (numArrows + 1);
            const arrowX = start.x + (end.x - start.x) * t;
            const arrowY = start.y + (end.y - start.y) * t;
            drawDirectionArrow(ctx, arrowX, arrowY, angle, scale);
        }
    }

    ctx.strokeStyle = '#D1D1D1';
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    const start = checkpoints[0];
    const flagWidth = 40 * scale;
    const flagHeight = 10 * scale;
    for (let i = 0; i < 8; i++) {
        for (let j = 0; j < 2; j++) {
            ctx.fillStyle = (i + j) % 2 === 0 ? '#1A1A1A' : '#FFFFFF';
            ctx.fillRect(
                start.x - flagWidth / 2 + (i * flagWidth / 8),
                start.y - flagHeight + (j * flagHeight),
                flagWidth / 8,
                flagHeight
            );
        }
    }
}

export function drawPixelCar(ctx, x, y, angle, teamColor, scale) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    const mainColor = teamColor.main;
    const accentColor = teamColor.accent;

    const pixels = [
        { x: 4, y: -2, color: accentColor },
        { x: 4, y: 2, color: accentColor },
        { x: 4, y: -1, color: accentColor },
        { x: 4, y: 1, color: accentColor },
        { x: 3, y: -2, color: accentColor },
        { x: 3, y: 2, color: accentColor },
        ...Array(7).fill().map((_, i) => ({ x: -3 + i, y: 0, color: mainColor })),
        { x: 3, y: 0, color: lightenColor(mainColor, 20) },
        { x: 3, y: -1, color: darkenColor(mainColor, 20) },
        { x: 3, y: 1, color: darkenColor(mainColor, 20) },
        { x: 0, y: 0, color: '#000000' },
        { x: -1, y: 0, color: '#000000' },
        { x: -4, y: -2, color: accentColor },
        { x: -4, y: 2, color: accentColor },
        { x: -3, y: -2, color: accentColor },
        { x: -3, y: 2, color: accentColor },
        { x: 2, y: -2, color: '#000000' },
        { x: 2, y: 2, color: '#000000' },
        { x: -2, y: -2, color: '#000000' },
        { x: -2, y: 2, color: '#000000' },
        { x: 0, y: -1, color: lightenColor(mainColor, 20) },
        { x: 0, y: 1, color: lightenColor(mainColor, 20) },
        { x: -1, y: -1, color: lightenColor(mainColor, 20) },
        { x: -1, y: 1, color: lightenColor(mainColor, 20) }
    ];

    ctx.imageSmoothingEnabled = false;
    pixels.forEach(pixel => {
        ctx.fillStyle = pixel.color;
        ctx.fillRect(pixel.x * scale, pixel.y * scale, scale, scale);
    });

    ctx.restore();
}

export function drawDirectionArrow(ctx, x, y, angle, scale) {
    const arrowSize = 12 * scale;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-arrowSize / 2, -arrowSize / 4);
    ctx.lineTo(arrowSize / 2, 0);
    ctx.lineTo(-arrowSize / 2, arrowSize / 4);
    ctx.fillStyle = isDark ? 'rgba(255, 255, 255, 0.2)' : 'rgba(26, 26, 26, 0.2)';
    ctx.fill();
    ctx.restore();
}

export function drawGrid(ctx, canvas) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.lineWidth = 1.2;
    for (let x = 0; x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
    }
    for (let y = 0; y < canvas.height; y += 40) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
    }
}


