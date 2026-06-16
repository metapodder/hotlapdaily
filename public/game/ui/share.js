import { getComplementaryColor } from '/game/render/colors.js';

export function initializeShareButton(game) {
    game.shareButton = document.getElementById('shareButton');
    if (game.shareButton) {
        game.shareButton.style.display = 'none';
        game.shareButton.addEventListener('click', () => generateShareCard(game));
    }
}

export function initializeShareModal(game) {
    game.shareModal = document.getElementById('shareModal');
    game.sharePreview = document.getElementById('sharePreview');
    game.downloadButton = document.getElementById('downloadShare');
    game.lapDropShareButton = document.getElementById('lapDropShare');
    game.cancelShareButton = document.getElementById('cancelShare');
    game.closeModalButton = document.getElementById('closeModal');

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && game.shareModal && game.shareModal.classList.contains('visible')) {
            closeShareModal(game);
        }
    });

    if (game.closeModalButton) game.closeModalButton.addEventListener('click', () => closeShareModal(game));
    if (game.cancelShareButton) game.cancelShareButton.addEventListener('click', () => closeShareModal(game));
    if (game.downloadButton) game.downloadButton.addEventListener('click', () => downloadShareCard(game));
    if (game.lapDropShareButton) game.lapDropShareButton.addEventListener('click', () => shareLapDrop(game));
}

export function getTeamComplementaryColor(teamName, teamColors) {
    const complementaryColors = {
        'red_bull': '#FFD300',
        'mercedes': '#C0C0C0',
        'ferrari': '#FFEA00',
        'mclaren': '#FFFFFF',
        'aston_martin': '#D4AF37',
        'alpine': '#FF69B4',
        'williams': '#00008B',
        'visa_rb': '#00FFFF',
        'audi': '#FF0000',
        'haas': '#FFFFFF',
        'cadillac': '#D4AF37'
    };
    const team = teamColors && teamColors[teamName];
    return complementaryColors[teamName] || (team ? getComplementaryColor(team.main) : '#FFFFFF');
}

export function initializeConstructorNames(game) {
    game.constructorDisplayNames = {
        'ferrari': 'PRANCING\nHORSE',
        'red_bull': 'ENERGY DRINK\nRACERS',
        'mercedes': 'SILVER\nARROWS',
        'mclaren': 'PAPAYA\nWONDERS',
        'aston_martin': 'TEAM\nSTROLLED',
        'alpine': 'FRENCH\nMADNESS',
        'williams': 'GO\nWEEYUMS',
        'visa_rb': 'SISTER\nBULL',
        'audi': '4\nCIRCLES',
        'haas': 'STEINER\nSQUAD',
        'cadillac': 'AND READY\'S\nDREAM'
    };
}

function drawFunkyQuad(ctx, x, y, width, height, variance = 10) {
    const corners = [
        { x: x + (Math.random() * variance), y: y + (Math.random() * variance) },
        { x: x + width + (Math.random() * variance), y: y + (Math.random() * variance) },
        { x: x + width + (Math.random() * variance), y: y + height + (Math.random() * variance) },
        { x: x + (Math.random() * variance), y: y + height + (Math.random() * variance) }
    ];
    ctx.beginPath();
    ctx.moveTo(corners[0].x, corners[0].y);
    ctx.lineTo(corners[1].x, corners[1].y);
    ctx.lineTo(corners[2].x, corners[2].y);
    ctx.lineTo(corners[3].x, corners[3].y);
    ctx.closePath();
    ctx.fill();
}

export async function generateShareCard(game) {
    try {
        if (!game.shareModal || !game.sharePreview) {
            console.error('Share modal or preview canvas not found');
            initializeShareModal(game);
            if (!game.shareModal || !game.sharePreview) {
                alert('Could not generate share card. Please try again.');
                return;
            }
        }

        const fontPromises = ['Roboto Mono', 'Kanit', 'Oswald', 'IBM Plex Mono'].map(font => document.fonts.load(`16px "${font}"`));
        try { await Promise.all(fontPromises); } catch {}

        const cardCanvas = document.getElementById('sharePreview');
        if (!cardCanvas || !(cardCanvas instanceof HTMLCanvasElement)) {
            console.error('Invalid canvas element:', cardCanvas);
            throw new Error('Share canvas not found');
        }
        cardCanvas.width = 1200;
        cardCanvas.height = 1200;
        const ctx = cardCanvas.getContext('2d');
        if (!ctx) throw new Error('Canvas context creation failed');
        ctx.imageSmoothingEnabled = true;

        const playerName = document.getElementById('playerName')?.value || game.getRandomDriverName();
        const selectedTeam = document.getElementById('teamSelect')?.value || 'ferrari';
        const teamColor = game.teamColors[selectedTeam] || game.teamColors.ferrari;
        const complementaryColor = getTeamComplementaryColor(selectedTeam, game.teamColors);
        const bestLapTime = game.bestLapTime !== null ? game.bestLapTime : (game.lapTimes.length > 0 ? Math.min(...game.lapTimes.map(lap => lap.time)) : null);

        ctx.fillStyle = '#101010';
        ctx.fillRect(0, 0, 1200, 1200);
        const padding = 20;
        const textHeight = 80;
        const grid = {
            teamImage: { x: 0, y: 0, width: 700, height: 700 },
            driverName: { x: 700, y: 0, width: 500, height: 350 },
            constructor: { x: 700, y: 350, width: 500, height: 350 },
            lapTime: { x: 0, y: 700, width: 1200, height: 400 },
            message: { x: 0, y: 1100, width: 1200, height: 100 }
        };

        const bgImg = new Image();
        let teamPathName = selectedTeam;
        if (selectedTeam === 'red_bull') teamPathName = 'redbull';
        else if (selectedTeam === 'visa_rb') teamPathName = 'vcarb';
        else if (selectedTeam === 'aston_martin') teamPathName = 'am';
        bgImg.src = `./assets/ShareCard/${teamPathName}.jpg`;

        try {
            await new Promise((resolve, reject) => {
                bgImg.onload = resolve;
                bgImg.onerror = (e) => reject(new Error(`Failed to load image: ${bgImg.src}`));
                setTimeout(() => { if (!bgImg.complete) reject(new Error(`Image load timed out: ${bgImg.src}`)); }, 5000);
            });
            const imgRatio = bgImg.width / bgImg.height;
            const sectionRatio = grid.teamImage.width / grid.teamImage.height;
            let drawWidth, drawHeight, offsetX = 0, offsetY = 0;
            if (imgRatio > sectionRatio) {
                drawHeight = grid.teamImage.height;
                drawWidth = drawHeight * imgRatio;
                offsetX = (grid.teamImage.width - drawWidth) / 2;
            } else {
                drawWidth = grid.teamImage.width;
                drawHeight = drawWidth / imgRatio;
                offsetY = (grid.teamImage.height - drawHeight) / 2;
            }
            ctx.drawImage(bgImg, grid.teamImage.x + offsetX, grid.teamImage.y + offsetY, drawWidth, drawHeight);
        } catch {
            ctx.fillStyle = teamColor.main;
            ctx.fillRect(grid.teamImage.x, grid.teamImage.y, grid.teamImage.width, grid.teamImage.height);
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.font = 'bold 80px "Kanit", sans-serif';
            ctx.fillStyle = complementaryColor;
            const label = game.constructorDisplayNames?.[selectedTeam]?.split('\n')[0] || selectedTeam.toUpperCase();
            ctx.fillText(label, grid.teamImage.x + grid.teamImage.width/2, grid.teamImage.y + grid.teamImage.height/2);
            ctx.restore();
        }

        ctx.fillStyle = teamColor.main;
        ctx.fillRect(grid.driverName.x, grid.driverName.y, grid.driverName.width, grid.driverName.height);
        const calculateFontSize = (text, maxWidth) => {
            try {
                let fontSize = 120;
                ctx.font = `900 ${fontSize}px "Kanit", sans-serif`;
                let textWidth = ctx.measureText(text).width;
                while (textWidth > maxWidth - 60 && fontSize > 40) {
                    fontSize -= 5;
                    ctx.font = `900 ${fontSize}px "Kanit", sans-serif`;
                    textWidth = ctx.measureText(text).width;
                }
                return fontSize;
            } catch { return 60; }
        };

        const hasSpaces = (playerName || '').includes(' ');
        const words = (playerName || '').split(' ');
        const firstPart = hasSpaces ? words.slice(0, Math.ceil(words.length/2)).join(' ') : (playerName || '');
        const secondPart = hasSpaces ? words.slice(Math.ceil(words.length/2)).join(' ') : '';
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        if (hasSpaces) {
            const fontSize1 = calculateFontSize(firstPart.toUpperCase(), grid.driverName.width);
            const fontSize2 = calculateFontSize(secondPart.toUpperCase(), grid.driverName.width);
            const finalFontSize = Math.min(fontSize1, fontSize2);
            ctx.font = `900 ${finalFontSize}px "Kanit", sans-serif`;
            ctx.fillStyle = complementaryColor;
            ctx.fillText(firstPart.toUpperCase(), grid.driverName.x + grid.driverName.width/2, grid.driverName.y + grid.driverName.height/2 - textHeight/2);
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText(secondPart.toUpperCase(), grid.driverName.x + grid.driverName.width/2, grid.driverName.y + grid.driverName.height/2 + textHeight/2);
        } else {
            const fontSize = calculateFontSize(firstPart.toUpperCase(), grid.driverName.width);
            ctx.font = `900 ${fontSize}px "Kanit", sans-serif`;
            ctx.fillStyle = complementaryColor;
            ctx.fillText(firstPart.toUpperCase(), grid.driverName.x + grid.driverName.width/2, grid.driverName.y + grid.driverName.height/2);
        }
        ctx.restore();

        const constructorName = game.constructorDisplayNames?.[selectedTeam] || selectedTeam.toUpperCase().replace('_', ' ');
        const [topText, ...bottomTextParts] = constructorName.split('\n');
        const bottomText = bottomTextParts.join(' ');
        ctx.fillStyle = complementaryColor;
        ctx.fillRect(grid.constructor.x, grid.constructor.y, grid.constructor.width, grid.constructor.height);
        ctx.fillStyle = '#FFFFFF';
        drawFunkyQuad(ctx, grid.constructor.x + padding, grid.constructor.y + grid.constructor.height/2 - textHeight, grid.constructor.width - padding * 2, textHeight);
        ctx.fillStyle = '#000000';
        drawFunkyQuad(ctx, grid.constructor.x + padding, grid.constructor.y + grid.constructor.height/2, grid.constructor.width - padding * 2, textHeight);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = `900 54px "Kanit", sans-serif`;
        ctx.fillStyle = '#000000';
        ctx.fillText(topText, grid.constructor.x + grid.constructor.width/2, grid.constructor.y + grid.constructor.height/2 - textHeight/2);
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(bottomText || 'F1 TEAM', grid.constructor.x + grid.constructor.width/2, grid.constructor.y + grid.constructor.height/2 + textHeight/2);
        ctx.restore();

        ctx.fillStyle = '#000000';
        ctx.fillRect(grid.lapTime.x, grid.lapTime.y, grid.lapTime.width, grid.lapTime.height);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 36px "Oswald", sans-serif`;
        ctx.fillText('BEST LAP TIME', grid.lapTime.x + grid.lapTime.width/2, grid.lapTime.y + 100);
        if (bestLapTime !== null) {
            ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
            ctx.shadowBlur = 8; ctx.shadowOffsetX = 3; ctx.shadowOffsetY = 3;
            ctx.font = `italic bold 120px "Oswald", sans-serif`;
            ctx.fillText(bestLapTime.toFixed(3), grid.lapTime.x + grid.lapTime.width/2, grid.lapTime.y + 240);
            ctx.shadowBlur = 0; ctx.shadowOffsetX = 0; ctx.shadowOffsetY = 0;
            ctx.font = `italic 36px "Oswald", sans-serif`;
            ctx.fillText('SECONDS', grid.lapTime.x + grid.lapTime.width/2, grid.lapTime.y + 300);
        } else {
            ctx.font = `italic bold 120px "Oswald", sans-serif`;
            ctx.fillText('---.---', grid.lapTime.x + grid.lapTime.width/2, grid.lapTime.y + 240);
            ctx.font = `italic 36px "Oswald", sans-serif`;
            ctx.fillText('SECONDS', grid.lapTime.x + grid.lapTime.width/2, grid.lapTime.y + 300);
        }
        ctx.restore();

        ctx.fillStyle = teamColor.main;
        ctx.fillRect(grid.message.x, grid.message.y, grid.message.width, grid.message.height);
        ctx.save();
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFFFFF';
        ctx.font = `bold 32px "IBM Plex Mono", monospace`;
        ctx.fillText(`${game.currentTrack?.name || 'Unknown Track'} - HOTLAPDAILY.COM`, grid.message.x + grid.message.width/2, grid.message.y + grid.message.height/2 + 10);
        ctx.restore();

        if (game.shareModal) {
            game.shareModal.style.display = 'flex';
            void game.shareModal.offsetHeight;
            game.shareModal.classList.add('visible');
        }
    } catch (error) {
        console.error('Error creating share card:', error);
        try {
            const playerName = document.getElementById('playerName')?.value || game.getRandomDriverName();
            const selectedTeam = document.getElementById('teamSelect')?.value || 'ferrari';
            const teamColor = game.teamColors[selectedTeam] || game.teamColors.ferrari;
            const bestLapTime = game.bestLapTime;
            let cardCanvas = document.getElementById('sharePreview');
            if (!cardCanvas) {
                cardCanvas = document.createElement('canvas');
                cardCanvas.id = 'sharePreview';
                cardCanvas.className = 'share-card-preview';
                document.querySelector('.share-card')?.insertBefore(cardCanvas, document.querySelector('.share-card-buttons'));
            }
            cardCanvas.width = 1200; cardCanvas.height = 1200;
            const ctx = cardCanvas.getContext('2d');
            if (!ctx) throw new Error('Failed to get fallback canvas context');
            ctx.fillStyle = teamColor.main || '#1A1A1A';
            ctx.fillRect(0, 0, 1200, 1200);
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'center';
            ctx.font = 'bold 72px sans-serif';
            ctx.fillText('F1 HOTLAP', 600, 200);
            ctx.font = 'bold 64px sans-serif';
            ctx.fillText(playerName, 600, 400);
            if (bestLapTime !== null) { ctx.font = 'bold 80px sans-serif'; ctx.fillText(bestLapTime.toFixed(3) + 's', 600, 600); }
            else { ctx.font = 'bold 80px sans-serif'; ctx.fillText('No lap time', 600, 600); }
            ctx.font = 'bold 32px sans-serif';
            ctx.fillText('HOTLAPDAILY.COM', 600, 1000);
            if (!game.shareModal) initializeShareModal(game);
            if (game.shareModal) { game.shareModal.style.display = 'flex'; void game.shareModal.offsetHeight; game.shareModal.classList.add('visible'); }
            else { alert('Share card created with limited functionality. Please check console for details.'); }
        } catch (fallbackError) {
            console.error('Even fallback share card creation failed:', fallbackError);
            alert('Could not create share card. Please try again later.');
        }
    }
}

export function closeShareModal(game) {
    if (!game.shareModal) return;
    game.shareModal.classList.remove('visible');
    setTimeout(() => { if (game.shareModal) game.shareModal.style.display = 'none'; }, 300);
}

export function downloadShareCard(game, closeModalAfterDownload = true) {
    if (!game.sharePreview) return;
    const dataUrl = game.sharePreview.toDataURL('image/png');
    const currentDate = new Date().toISOString().split('T')[0];
    const link = document.createElement('a');
    link.download = `Lap_Drop_${currentDate}.png`;
    link.href = dataUrl;
    link.click();
    if (closeModalAfterDownload) closeShareModal(game);
}

export function showShareMessage(game, message) {
    try {
        let messageEl = document.getElementById('shareMessage');
        if (!messageEl) {
            messageEl = document.createElement('div');
            messageEl.id = 'shareMessage';
            messageEl.style.cssText = `
                position: fixed;
                bottom: 20px;
                left: 50%;
                transform: translateX(-50%);
                background: var(--bg-primary);
                color: var(--text-primary);
                padding: 10px 20px;
                border-radius: 5px;
                border: 2px solid var(--border);
                z-index: 1000;
                opacity: 0;
                transition: opacity 0.3s ease, transform 0.3s ease;
                font-weight: bold;
                min-width: 200px;
                text-align: center;
                pointer-events: none;
                box-shadow: 0 3px 10px rgba(0,0,0,0.2);
            `;
            document.body.appendChild(messageEl);
        }
        if (messageEl._hideTimer) clearTimeout(messageEl._hideTimer);
        messageEl.textContent = message;
        messageEl.style.transform = 'translateX(-50%) translateY(20px)';
        messageEl.style.opacity = '0';
        void messageEl.offsetWidth;
        messageEl.style.opacity = '1';
        messageEl.style.transform = 'translateX(-50%) translateY(0)';
        messageEl._hideTimer = setTimeout(() => {
            messageEl.style.opacity = '0';
            messageEl.style.transform = 'translateX(-50%) translateY(20px)';
        }, 3000);
    } catch (e) { console.error('Error showing share message:', e); }
}

export function shareLapDrop(game) {
    // Get the global game instance to ensure we have the latest raceId
    const globalGame = window.__hotlapGameInstance || game;
    const bestTime = globalGame.bestLapTime ? globalGame.bestLapTime.toFixed(3) : 'N/A';
    const generateSparkline = (attempts) => {
        const BLOCKS = ['▂', '▃', '▅', '▆'];
        const SPARKLINE_WIDTH = 5;
        const completedAttempts = attempts.filter(lap => lap.status === 'completed');
        if (completedAttempts.length === 0) return '';
        const allTimeBestLap = completedAttempts.reduce((best, current) => current.time < best.time ? current : best);
        let recentAttempts = [...completedAttempts].slice(-SPARKLINE_WIDTH);
        const bestLapIndex = completedAttempts.findIndex(lap => lap.time === allTimeBestLap.time);
        const bestLap = completedAttempts[bestLapIndex];
        if (!recentAttempts.includes(bestLap)) { recentAttempts.shift(); recentAttempts.unshift(bestLap); }
        const sparkArray = recentAttempts.map(lap => {
            if (allTimeBestLap && lap.time === allTimeBestLap.time) return '▇';
            const recentCompletedTimes = recentAttempts.filter(a => a.status === 'completed' && (!allTimeBestLap || a.time !== allTimeBestLap.time)).map(a => a.time);
            const worstTime = Math.max(...recentCompletedTimes);
            const normalizedTime = (worstTime - lap.time) / (worstTime - allTimeBestLap.time);
            const index = Math.floor(normalizedTime * (BLOCKS.length - 0.001));
            return BLOCKS[Math.max(0, Math.min(index, BLOCKS.length - 1))];
        });
        while (sparkArray.length > SPARKLINE_WIDTH) { sparkArray.shift(); }
        return sparkArray.join(' ');
    };

    const trackName = globalGame.currentTrack?.name || 'Unknown Track';
    const sparkline = generateSparkline(globalGame.allAttempts);
    const baseUrl = 'hotlapdaily.com';
    const raceId = globalGame.currentRaceId;
    const raceUrl = raceId ? `?raceId=${raceId}` : '';
    const shareText = `${trackName} 🏁 Fastest Lap: ${bestTime}s\n${sparkline}\n🔗 Race against me at https://${baseUrl}${raceUrl}`;

    // Debug info
    console.log('[Share] Race ID:', raceId, 'Share text:', shareText);

    let clipboardFallback = document.getElementById('clipboardFallback');
    if (!clipboardFallback) {
        clipboardFallback = document.createElement('textarea');
        clipboardFallback.id = 'clipboardFallback';
        clipboardFallback.style.position = 'fixed';
        clipboardFallback.style.opacity = '0';
        clipboardFallback.style.pointerEvents = 'none';
        clipboardFallback.style.left = '0';
        clipboardFallback.style.top = '0';
        clipboardFallback.style.width = '100%';
        clipboardFallback.style.height = '0';
        clipboardFallback.setAttribute('readonly', 'readonly');
        clipboardFallback.setAttribute('aria-hidden', 'true');
        document.body.appendChild(clipboardFallback);
    }
    clipboardFallback.value = shareText;

    const handleShare = async () => {
        const isMobile = /mobile|android|ios|iphone|ipad/i.test(navigator.userAgent.toLowerCase());
        const canShare = !!navigator.share;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
        if (isMobile && canShare) {
            try {
                await navigator.share({ title: 'HOTLAP Daily', text: shareText });
                showShareMessage(game, 'Shared successfully!');
                return;
            } catch (shareError) {
                if (shareError.name === 'AbortError') return;
            }
        }
        try {
            await navigator.clipboard.writeText(shareText);
            showShareMessage(game, 'Successfully copied to clipboard!');
            return;
        } catch {}
        try {
            clipboardFallback.style.opacity = '1';
            clipboardFallback.style.pointerEvents = 'auto';
            clipboardFallback.style.height = '100px';
            clipboardFallback.style.zIndex = '10000';
            setTimeout(() => {
                try {
                    clipboardFallback.focus();
                    clipboardFallback.select();
                    if (isIOS) {
                        clipboardFallback.setSelectionRange(0, 99999);
                        if (document.execCommand('copy')) { hideTextarea(); showShareMessage(game, 'Successfully copied to clipboard!'); return; }
                    }
                    const successful = document.execCommand('copy');
                    hideTextarea();
                    if (successful) showShareMessage(game, 'Successfully copied to clipboard!');
                    else throw new Error('execCommand copy failed');
                } catch (innerError) {
                    console.error('[Share] Error during text selection:', innerError);
                    hideTextarea();
                    throw innerError;
                }
            }, 100);
            const hideTextarea = () => {
                clipboardFallback.style.opacity = '0';
                clipboardFallback.style.pointerEvents = 'none';
                clipboardFallback.style.height = '0';
                clipboardFallback.style.zIndex = '-1';
            };
        } catch (execError) {
            console.error('[Share] All clipboard methods failed:', execError);
            const shareDialog = document.createElement('div');
            shareDialog.className = 'share-fallback-dialog';
            shareDialog.innerHTML = `
                <div class="share-fallback-content">
                    <h3>Copy this text</h3>
                    <p>Tap and hold to select all or use the button below:</p>
                    <div class="share-text">${shareText.replace(/\n/g, '<br>')}</div>
                    <div class="share-fallback-buttons">
                        <button id="copyShareFallback">Copy Text</button>
                        <button id="dismissShareFallback">Done</button>
                    </div>
                </div>
            `;
            const style = document.createElement('style');
            style.textContent = `
                .share-fallback-dialog { position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.8); display: flex; align-items: center; justify-content: center; z-index: 10000; }
                .share-fallback-content { background: white; padding: 24px; border-radius: 8px; max-width: 90%; text-align: center; box-shadow: 0 3px 10px rgba(0,0,0,0.3); }
                .share-text { background: #f0f0f0; padding: 20px; margin: 15px 0; font-family: monospace; border-radius: 4px; user-select: all; text-align: left; white-space: pre-wrap; font-size: 16px; line-height: 1.5; }
                .share-fallback-buttons { display: flex; justify-content: center; gap: 16px; margin-top: 16px; }
                #copyShareFallback, #dismissShareFallback { background: #333; color: white; border: none; padding: 10px 20px; border-radius: 4px; cursor: pointer; font-weight: bold; }
                #copyShareFallback { background: #0066cc; }
            `;
            document.head.appendChild(style);
            document.body.appendChild(shareDialog);
            document.getElementById('copyShareFallback').addEventListener('click', () => {
                const tempTextarea = document.createElement('textarea');
                tempTextarea.style.position = 'fixed'; tempTextarea.style.opacity = '0';
                tempTextarea.value = shareText; document.body.appendChild(tempTextarea);
                tempTextarea.focus(); tempTextarea.select();
                try {
                    const copySuccessful = document.execCommand('copy');
                    if (copySuccessful) showShareMessage(game, 'Successfully copied to clipboard!');
                    else showShareMessage(game, 'Copy failed, please try manual selection');
                } catch (e) {
                    console.error('[Share] Copy button failed:', e);
                    showShareMessage(game, 'Copy failed, please try manual selection');
                }
                document.body.removeChild(tempTextarea);
            });
            document.getElementById('dismissShareFallback').addEventListener('click', () => {
                document.body.removeChild(shareDialog);
            });
            showShareMessage(game, 'Select and copy the text manually');
        }
    };
    handleShare();
}


