// Anti-cheat configuration - IMMUTABLE AND TAMPER-PROOF
export const ANTICHEAT_CONFIG = Object.freeze({
    checkpointRadius: 40,           // Detection radius for checkpoints
    minimumCompletion: 0.5,         // Must visit 50% of checkpoints (more lenient)
    maxSkippedCheckpoints: 5,       // Max consecutive checkpoints that can be skipped
    _integrity: 'AC_2024_SECURE'    // Integrity marker for validation
});

// Integrity validation function - prevents tampering with anti-cheat system
export function validateAntiCheatIntegrity() {
    return ANTICHEAT_CONFIG._integrity === 'AC_2024_SECURE' && 
           ANTICHEAT_CONFIG.minimumCompletion === 0.5 &&
           typeof ANTICHEAT_CONFIG.checkpointRadius === 'number' &&
           ANTICHEAT_CONFIG.checkpointRadius > 0;
}

// Anti-cheat system for preventing shortcuts and U-turns
export class AntiCheatSystem {
    constructor(game) {
        this.game = game;
        this.checkpoints = [];
        this.visitedCheckpoints = new Set();
        this.mandatoryCheckpoints = new Set();
        this.checkpointRadius = ANTICHEAT_CONFIG.checkpointRadius;
        this.isValidLap = true;
        this.minimumCheckpointsRequired = ANTICHEAT_CONFIG.minimumCompletion;
        this.maxSkippedCheckpoints = ANTICHEAT_CONFIG.maxSkippedCheckpoints;
        this.violationReasons = [];
        this.prevCarPosition = null;
        this.useLineCrossing = false; // enabled for test mode
        this.checkpointLines = []; // precomputed line endpoints
    }

    // Initialize checkpoints from track layout
    initializeCheckpoints(trackCheckpoints) {
        this.checkpoints = [];
        this.checkpointLines = [];
        this.visitedCheckpoints.clear();
        this.mandatoryCheckpoints.clear();
        this.violationReasons = [];
        this.isValidLap = true;
        this.prevCarPosition = null;

        // Apply Y-offset to match car coordinate system
        const yOffset = this.game.canvas.height * 0.12;

        // Check if test mode for line-crossing detection
        this.useLineCrossing = !!(this.game.currentTrack && this.game.currentTrack.isTestTrack);

        // Create checkpoints at each track point (except the last one which is start/finish)
        for (let i = 0; i < trackCheckpoints.length - 1; i++) {
            const checkpoint = {
                id: `checkpoint_${i}`,
                x: trackCheckpoints[i].x,
                y: trackCheckpoints[i].y + yOffset,
                order: i,
                isMandatory: true
            };

            this.checkpoints.push(checkpoint);
            this.mandatoryCheckpoints.add(checkpoint.id);
        }

        // Precompute checkpoint line segments for line-crossing detection
        if (this.useLineCrossing) {
            const scale = Math.min(this.game.canvas.width, this.game.canvas.height) / 400;
            const trackWidth = 50 * scale;
            const markerLen = trackWidth * 1.2;

            for (let i = 0; i < this.checkpoints.length; i++) {
                const pt = this.checkpoints[i];
                let angle;
                if (i === 0 && this.checkpoints.length > 1) {
                    angle = Math.atan2(this.checkpoints[1].y - pt.y, this.checkpoints[1].x - pt.x);
                } else if (i === this.checkpoints.length - 1) {
                    angle = Math.atan2(pt.y - this.checkpoints[i - 1].y, pt.x - this.checkpoints[i - 1].x);
                } else {
                    const a1 = Math.atan2(pt.y - this.checkpoints[i - 1].y, pt.x - this.checkpoints[i - 1].x);
                    const a2 = Math.atan2(this.checkpoints[i + 1].y - pt.y, this.checkpoints[i + 1].x - pt.x);
                    angle = (a1 + a2) / 2;
                }
                const perp = angle + Math.PI / 2;
                const half = markerLen / 2;
                this.checkpointLines.push({
                    x1: pt.x + Math.cos(perp) * half,
                    y1: pt.y + Math.sin(perp) * half,
                    x2: pt.x - Math.cos(perp) * half,
                    y2: pt.y - Math.sin(perp) * half
                });
            }
        }
    }

    // Update system - check for checkpoint visits
    update(carPosition) {
        if (!this.checkpoints.length) return;

        this.checkForCheckpointVisits(carPosition);
        this.prevCarPosition = { x: carPosition.x, y: carPosition.y };
    }

    // Check if car is visiting checkpoints
    checkForCheckpointVisits(carPosition) {
        if (this.useLineCrossing && this.prevCarPosition) {
            this.checkLineCrossings(carPosition);
            return;
        }

        const scale = Math.min(this.game.canvas.width, this.game.canvas.height) / 400;
        const checkRadius = this.checkpointRadius * scale;

        this.checkpoints.forEach(checkpoint => {
            if (this.visitedCheckpoints.has(checkpoint.id)) return;

            const distance = Math.hypot(
                carPosition.x - checkpoint.x,
                carPosition.y - checkpoint.y
            );

            if (distance < checkRadius) {
                this.visitedCheckpoints.add(checkpoint.id);

                // Order validation removed - reverse racing and any route is allowed
                // Only completion percentage matters (validated at lap end)
            }
        });
    }

    // Line-crossing checkpoint detection for test mode
    checkLineCrossings(carPosition) {
        const prev = this.prevCarPosition;
        for (let i = 0; i < this.checkpoints.length; i++) {
            if (this.visitedCheckpoints.has(this.checkpoints[i].id)) continue;
            const line = this.checkpointLines[i];
            if (!line) continue;
            if (this.segmentsIntersect(prev.x, prev.y, carPosition.x, carPosition.y, line.x1, line.y1, line.x2, line.y2)) {
                this.visitedCheckpoints.add(this.checkpoints[i].id);
            }
        }
    }

    // Check if two line segments intersect
    segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
        const d1 = this.cross(cx, cy, dx, dy, ax, ay);
        const d2 = this.cross(cx, cy, dx, dy, bx, by);
        const d3 = this.cross(ax, ay, bx, by, cx, cy);
        const d4 = this.cross(ax, ay, bx, by, dx, dy);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }
        return false;
    }

    cross(ax, ay, bx, by, cx, cy) {
        return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    }

    // Checkpoint order validation disabled - reverse racing allowed
    // Only completion percentage validation remains (see validateLapCompletion)
    validateCheckpointOrder(visitedCheckpoint) {
        // No order validation - players can race forward, backward, or any route
        // as long as they hit the minimum completion percentage
        return;
    }

    // Add a violation
    addViolation(reason) {
        this.violationReasons.push(reason);
        this.isValidLap = false;
        console.warn(`[AntiCheat] VIOLATION: ${reason}`);
    }

    // Validate lap completion
    validateLapCompletion() {
        const visitedMandatory = Array.from(this.visitedCheckpoints).length;
        const totalMandatory = this.mandatoryCheckpoints.size;
        const completionRatio = visitedMandatory / totalMandatory;

        // Check if enough checkpoints were visited
        if (completionRatio < this.minimumCheckpointsRequired) {
            this.addViolation(
                `Only visited ${visitedMandatory}/${totalMandatory} checkpoints (${(completionRatio * 100).toFixed(0)}% - need ${(this.minimumCheckpointsRequired * 100).toFixed(0)}%)`
            );
        }

        return this.isValidLap && completionRatio >= this.minimumCheckpointsRequired;
    }

    // Get validation summary
    getValidationSummary() {
        return {
            isValid: this.isValidLap,
            checkpointsVisited: this.visitedCheckpoints.size,
            totalCheckpoints: this.checkpoints.length,
            completionPercentage: Math.round((this.visitedCheckpoints.size / this.checkpoints.length) * 100),
            violations: this.violationReasons
        };
    }

    // Show violation warning to user
    showViolationWarning(validationSummary) {
        // Remove any existing violation modal
        const existingModal = document.querySelector('.violation-modal');
        if (existingModal) existingModal.remove();
        
        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'violation-modal';
        
        // Create modal content
        const card = document.createElement('div');
        card.className = 'violation-card';
        
        card.innerHTML = `
            <p style="font-size: 1.6em; font-weight: bold; margin: 0.5rem 0;">Yikes! Smart creative interpretation of the track though</p>
            <p>Complete the full track to record your laptime</p>
            <div class="violation-details" style="text-align: center;">
                <p><strong>Checkpoints Completed:</strong> ${validationSummary.checkpointsVisited}/${validationSummary.totalCheckpoints}</p>
            </div>
            <button class="pixel-button">Try Again</button>
            
            <button class="modal-close" aria-label="Close">
                <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M4 4L14 14M14 4L4 14" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/>
                </svg>
            </button>
        `;
        
        modal.appendChild(card);
        document.body.appendChild(modal);
        
        // Add event listeners
        const closeModal = () => {
            modal.classList.remove('visible');
            setTimeout(() => {
                if (modal.parentElement) {
                    modal.remove();
                }
            }, 300);
        };
        
        // Close button and try again button
        card.querySelector('.pixel-button').addEventListener('click', closeModal);
        card.querySelector('.modal-close').addEventListener('click', closeModal);
        
        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });
        
        // Show modal with animation
        setTimeout(() => {
            modal.classList.add('visible');
        }, 10);
        
        // Auto-close after 15 seconds
        setTimeout(() => {
            if (modal.parentElement) {
                closeModal();
            }
        }, 15000);
    }

    // Reset for new lap
    reset() {
        this.visitedCheckpoints.clear();
        this.violationReasons = [];
        this.isValidLap = true;
        this.prevCarPosition = null;
    }
}


