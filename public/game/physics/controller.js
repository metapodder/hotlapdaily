export class CarController {
    constructor(scale) {
        this.controls = {
            left: false,
            right: false
        };
        this.position = {
            x: 0,
            y: 0,
            angle: 0
        };
        // Calculate car scale to be ~50% of track width
        // Track width is 50 * scale, car is 9 pixels wide
        // For car to be 50% of track, we want 9 * carScale = 25 * scale
        // Therefore carScale = (25/9) * scale ≈ 2.78 * scale
        this.scale = 2.78 * scale;
        // Define base speed and turn speed (per millisecond) for time-based movement
        this.baseSpeed = (1.82 / 16.67) * scale; // Approx 0.11 * scale
        this.baseTurnSpeed = 0.05 / 16.67; // Approx 0.003
        this.lastUpdateTime = performance.now();
    }

    setPosition(x, y, angle = 0) {
        console.debug(`[CarController] setPosition: x=${x}, y=${y}, angle=${angle}`);
        try {
            if (isNaN(x) || isNaN(y) || isNaN(angle)) {
                throw new Error(`Invalid position values: x=${x}, y=${y}, angle=${angle}`);
            }
            this.position.x = x;
            this.position.y = y;
            this.position.angle = angle;
        } catch (error) {
            console.error('Error in setPosition:', error);
            // Use fallback values to prevent game from breaking
            this.position.x = this.position.x || 0;
            this.position.y = this.position.y || 0;
            this.position.angle = this.position.angle || 0;
        }
    }

    update() {
        try {
            const currentTime = performance.now();
            // Prevent large jumps if tab was inactive
            const deltaTime = Math.min(currentTime - this.lastUpdateTime, 100); // Cap delta time to 100ms
            this.lastUpdateTime = currentTime;

            // Calculate movement amounts based on deltaTime
            const currentTurnSpeed = this.baseTurnSpeed * deltaTime;
            const currentSpeed = this.baseSpeed * deltaTime;

            // Handle steering with logging (reduced logging level)
            if (this.controls.left) {
                this.position.angle -= currentTurnSpeed; // Use time-adjusted turn speed
                console.debug('[CarController] Turning left, angle:', this.position.angle);
            }
            if (this.controls.right) {
                this.position.angle += currentTurnSpeed; // Use time-adjusted turn speed
                console.debug('[CarController] Turning right, angle:', this.position.angle);
            }

            // Update position with constant speed adjusted by deltaTime
            const previousX = this.position.x;
            const previousY = this.position.y;

            this.position.x += Math.cos(this.position.angle) * currentSpeed; // Use time-adjusted speed
            this.position.y += Math.sin(this.position.angle) * currentSpeed; // Use time-adjusted speed

            // Log significant position changes
            const positionChange = Math.hypot(this.position.x - previousX, this.position.y - previousY);
            // Adjust logging threshold based on potential max speed in one frame (100ms delta)
            if (positionChange > this.baseSpeed * 100 * 1.5) {
                console.info(`[CarController] Significant position change: ${positionChange.toFixed(2)} units (deltaTime: ${deltaTime.toFixed(2)}ms)`);
            }

            return {
                deltaTime,
                positionChange
            };
        } catch (error) {
            console.error('Error in car update:', error);
            // Return default values to prevent game from breaking
            return {
                deltaTime: 16.67, // Default to 60fps timeframe
                positionChange: 0
            };
        }
    }

    setControls(left, right) {
        try {
            // Validate inputs are boolean
            this.controls.left = Boolean(left);
            this.controls.right = Boolean(right);
        } catch (error) {
            console.error('Error in setControls:', error);
            // Reset controls on error
            this.controls.left = false;
            this.controls.right = false;
        }
    }
}


