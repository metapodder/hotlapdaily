export function updateInGameLeaderboard(game) {
    const container = document.getElementById('in-game-lap-times');
    let html = '';

    const generateSparkline = (attempts) => {
        const BLOCKS = ['▂', '▃', '▅', '▆'];
        const BEST_BLOCK = '▇';
        const EMPTY_BLOCK = ' ';
        const SPARKLINE_WIDTH = 5;

        if (attempts.length === 0) {
            return { text: Array(SPARKLINE_WIDTH).fill(EMPTY_BLOCK).join(' '), bestIndex: -1 };
        }
        const completedAttempts = attempts.filter(lap => lap.status === 'completed');
        const allTimeBestLap = completedAttempts.length > 0 ? completedAttempts.reduce((best, current) => current.time < best.time ? current : best) : null;
        const recentCompletedAttempts = attempts.filter(lap => lap.status === 'completed');
        let recentAttempts = [...recentCompletedAttempts].slice(-SPARKLINE_WIDTH);
        const bestLapIndex = recentCompletedAttempts.findIndex(lap => allTimeBestLap && lap.time === allTimeBestLap.time);
        if (allTimeBestLap && !recentAttempts.includes(recentCompletedAttempts[bestLapIndex])) {
            recentAttempts.shift();
            recentAttempts.unshift(recentCompletedAttempts[bestLapIndex]);
        }
        if (recentCompletedAttempts.length === 0) {
            return { text: '', bestIndex: -1 };
        }
        const sparkArray = recentAttempts.map(lap => {
            if (allTimeBestLap && lap.time === allTimeBestLap.time) return BEST_BLOCK;
            const recentCompletedTimes = recentAttempts.filter(a => a.status === 'completed' && (!allTimeBestLap || a.time !== allTimeBestLap.time)).map(a => a.time);
            const worstTime = Math.max(...recentCompletedTimes);
            const normalizedTime = (worstTime - lap.time) / (worstTime - allTimeBestLap.time);
            const index = Math.floor(normalizedTime * (BLOCKS.length - 0.001));
            return BLOCKS[Math.max(0, Math.min(index, BLOCKS.length - 1))];
        });
        while (sparkArray.length < SPARKLINE_WIDTH) {
            sparkArray.unshift(EMPTY_BLOCK);
        }
        const bestLapIndexInArray = sparkArray.indexOf(BEST_BLOCK);
        return { text: sparkArray.join(' '), bestIndex: bestLapIndexInArray };
    };

    if (game.bestLapTime !== null) {
        if (Number.isFinite(game.currentRank) && game.currentRank > 0) {
            html += `<div class="in-game-best-lap">Best: ${game.bestLapTime.toFixed(3)}s <span class="in-game-rank">(Rank #${game.currentRank})</span></div>`;
        } else {
            html += `<div class="in-game-best-lap">Best: ${game.bestLapTime.toFixed(3)}s</div>`;
        }
    }

    if (game.lapTimes.length > 0) {
        const previousLap = game.lapTimes[game.lapTimes.length - 1];
        html += `<div class=\"in-game-previous-lap\">Previous: ${previousLap.time}s</div>`;
    }

    if (game.bestLapTime !== null) {
        const sparklineResult = generateSparkline(game.allAttempts);
        const sparklineHtml = sparklineResult.text.split('').map((char, index) => {
            if (index === sparklineResult.bestIndex * 2) {
                return `<span style=\"color: purple\">${char}</span>`;
            }
            return `<span style=\"color: #A9A9A9\">${char}</span>`;
        }).join('');
        html += `<div class=\"in-game-sparkline\">${sparklineHtml}</div>`;
    }

    if (container) container.innerHTML = html;
}


