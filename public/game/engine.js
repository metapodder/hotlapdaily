import { getTrackFunction, getTrackFunctionAsync } from '/game/tracks/tracks.js';
import { trackLapToClarity } from '/game/net/telemetry.js';
import { capturePhysicsValues, validatePhysicsValues } from '/game/physics/physics.js';
import { CarController } from '/game/physics/controller.js';
import { AntiCheatSystem, validateAntiCheatIntegrity } from '/game/anticheat/anticheat.js';
import { sendBestLap } from '/game/net/api.js';
import '/game/ui/ui.js';
import { drawTrack as drawTrackLib, drawPixelCar as drawPixelCarLib, drawDirectionArrow as drawDirectionArrowLib } from '/game/render/draw.js';
import { updateInGameLeaderboard } from '/game/ui/leaderboard.js';
import {
    initializeShareButton as initShareButtonLib,
    initializeShareModal as initShareModalLib,
    generateShareCard as generateShareCardLib,
    getTeamComplementaryColor as getTeamComplementaryColorLib
} from '/game/ui/share.js';
import { pointToLineDistance } from '/game/util/geometry.js';

// moved: telemetry, physics helpers imported from /lib

// moved: best-lap API client imported from /lib

// UI handlers moved to /lib/ui.js
// moved: CarController imported from /lib

// moved: AntiCheat system imported from /lib

class Game {
    constructor() {
        this.perfMetrics = {
            fps: [],
            updateTimes: [],
            renderTimes: []
        }; this.lastFrameTime = performance.now();
        this.frameCount = 0;
        this._initializeTrackFlags();  // Changed to private method
        // Note: Removed trackLayouts initialization (5/31/2025) - was never used in the track generation system
        this.init();
        this.bindEvents();
        this.startGameLoop();
        this.gamePaused = false;
        this.lapTimes = [];
        this.allAttempts = []; // New array to track all attempts (completed and failed)
        this.bestLapTime = null;
        this.currentRaceId = null; // Store race ID for sharing
        this.hasCompletedLap = false;
        this.crashed = false; // Track crash state
        this.crashTime = 0; // Store time when crashed
        this.gameName = "F1 HOTLAP";
        this.lastSelectedTeam = 'ferrari';
        // Restore last selected constructor from localStorage if available
        try {
            const savedTeam = localStorage.getItem('hotlapdaily_constructor');
            if (savedTeam && typeof savedTeam === 'string' && savedTeam.trim()) {
                this.lastSelectedTeam = savedTeam.trim();
                const teamSelect = document.getElementById('teamSelect');
                if (teamSelect) {
                    teamSelect.value = this.lastSelectedTeam;
                    teamSelect.dispatchEvent(new Event('change'));
                }
            }
        } catch { }
        this.initializeShareButton();
        this.initializeShareModal();
        this.initializeConstructorNames();
        this.initializeLeaderboardCollapse();
        this.nextTrackUpdateInterval = null; // Add interval for next track update
        // Ranking state
        this.currentRank = null;
        this.totalRanked = null;

        // Ghost car state
        this.ghostBestTrail = [];
        this.ghostLocalTrail = [];
        this.ghostCurrentTrail = [];
        // Track coordinate space of trails: 'pixel' (legacy) or 'world_norm' (normalized)
        this.ghostBestSpace = 'pixel';
        this.ghostLocalSpace = 'pixel';
        this._ghostLastSampleMs = 0;
        this._ghostSampleIntervalMs = 50; // sample every 50ms to reduce trace size
        this._ghostEnabled = false; // runtime cache of toggle

        // Race ID ghost car loading
        this.raceId = null;
        this.raceIdGhostTrail = [];
        this.raceIdGhostSpace = 'world_norm';
        this.raceIdTrackName = null;
        this.raceIdDriverName = null;

        // Initialize anti-cheat system (mandatory and always enabled)
        this.antiCheat = new AntiCheatSystem(this);

        // Listen to ghost toggle changes
        try {
            const persisted = localStorage.getItem('hotlapdaily_ghost_enabled');
            this._ghostEnabled = persisted === 'true';
        } catch { }
        // Preload any existing local ghost payload so it's ready on first render
        try { this._loadLocalPayloadFromStorage(); } catch { }
        try {
            window.addEventListener('hotlap:ghost-toggle', (e) => {
                try { this._ghostEnabled = !!(e && e.detail && e.detail.enabled); } catch { }
            });
            // Listen for local payload updates
            window.addEventListener('hotlap:ghost-local-updated', () => {
                try { this._loadLocalPayloadFromStorage(); } catch { }
            });
        } catch { }

        // Load raceId ghost car if present
        try { this._loadRaceIdGhostCar(); } catch { }

        // Auto-enable ghost car if raceId is present
        try {
            const raceId = localStorage.getItem('hotlapdaily_race_id');
            if (raceId && raceId.trim()) {
                this._ghostEnabled = true;
                // Update the UI to reflect the auto-enabled state
                try {
                    const ghostToggle = document.getElementById('ghostToggle');
                    if (ghostToggle) {
                        ghostToggle.checked = true;
                    }
                    // Dispatch event to update any ghost settings UI
                    window.dispatchEvent(new CustomEvent('hotlap:ghost-toggle', { detail: { enabled: true } }));
                } catch { }
            }
        } catch { }

        // Add test function to window for debugging
        window.testGhostError = () => {
            this._showGhostCarError('Race trace not found. This ghost car may no longer be available.');
        };
    }    // Private method to initialize track flags (using naming convention)
    _initializeTrackFlags() {
        // Define track feature flags with fixed values - only changeable in code
        // Initialize all track flags (101-264) to false
        this._trackFlags = {};
        for (let i = 101; i <= 264; i++) {
            this._trackFlags[String(i)] = false;
        }

        const today = new Date();
        const startDate = new Date('2025-05-15');

        const diffTime = Math.abs(today - startDate);
        const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

        const trackOrder = Array.from({ length: 164 }, (_, i) => String(i + 101));

        if (diffDays >= 0 && diffDays < trackOrder.length) {
            this._trackFlags[trackOrder[diffDays]] = true;
        }
    }

    _quantizeSample(sample) {
        try {
            // Round time to nearest 10ms, positions to 1 decimal, angle to 3 decimals
            const qt = Math.round(sample.t / 10) * 10;
            const qx = Math.round(sample.x * 10) / 10;
            const qy = Math.round(sample.y * 10) / 10;
            const qa = Math.round(sample.angle * 1000) / 1000;
            return { t: qt, x: qx, y: qy, angle: qa };
        } catch { return sample; }
    }

    _updateRankInUi(rank, total) {
        try {
            this.currentRank = Number.isFinite(rank) ? rank : null;
            this.totalRanked = Number.isFinite(total) ? total : null;
            updateInGameLeaderboard(this);
        } catch (e) {
            console.warn('Failed to update rank UI:', e);
        }
    }

    init() {
        this.canvas = document.getElementById('gameCanvas');
        this.ctx = this.canvas.getContext('2d');

        // Calculate initial canvas size
        const gameScreen = this.canvas.parentElement;
        const screenWidth = gameScreen.clientWidth;
        const screenHeight = gameScreen.clientHeight;

        // Set canvas dimensions to match the game screen while maintaining aspect ratio
        if (screenWidth / screenHeight > 4 / 3) {
            this.canvas.height = screenHeight;
            this.canvas.width = screenHeight * (4 / 3);
        } else {
            this.canvas.width = screenWidth;
            this.canvas.height = screenWidth * (3 / 4);
        }

        // Calculate center coordinates
        this.canvasCenterX = this.canvas.width / 2;
        this.canvasCenterY = this.canvas.height / 2;

        // Reduced divisor from 600 to 400 to make everything larger
        const scale = Math.min(this.canvas.width, this.canvas.height) / 400;        // Initialize car controller with scale for movement speed only
        this.carController = new CarController(scale);

        // Calculate the Y-offset (12% of canvas height) for consistent positioning
        const yOffset = this.canvas.height * 0.12;
        this.carController.setPosition(this.canvasCenterX, this.canvas.height - 50 + yOffset, 0);

        // Create car object for compatibility with old code
        this.car = {
            x: this.canvasCenterX,
            y: this.canvas.height - 50 + yOffset,
            angle: 0,
            speed: 1.82 * scale,
            turnSpeed: 0.05,
            scale: this.carController.scale // Use the fixed scale from controller
        };

        // Initialize track system with F1-inspired tracks
        // Generate track variations in a loop with the same complexity for all
        const baseDate = new Date('2025-05-15');
        const numTracks = 500;
        const trackComplexity = 0.8; // Set the same complexity for all tracks
        this.trackVariations = [];
        for (let i = 1; i <= numTracks; i++) {
            const date = new Date(baseDate);
            date.setUTCDate(baseDate.getUTCDate() + (i - 1));
            this.trackVariations.push({
                name: `Track ${100 + i}`,
                complexity: trackComplexity,
                turns: 8 + (i % 5), // Example: vary turns a bit for variety
                date: date.toISOString().slice(0, 10)
            });
        }
        // Add the Random Track at the end
        this.trackVariations.push({
            name: 'Random Track',
            complexity: trackComplexity,
            turns: 10,
            date: '2025-10-26'
        });
        // Generate track (async for API-fetched tracks)
        this.trackLoading = false;
        this.generateDailyTrack().catch(err => console.error('Error in generateDailyTrack:', err));

        this.controls = {
            left: false,
            right: false
        };        // Team colors
        this.teamColors = {
            'red_bull': { main: '#000B8D', accent: '#FF0000' }, // Updated main color to new blue
            'mercedes': { main: '#008080', accent: '#000000' }, // Teal for Mercedes
            'ferrari': { main: '#DC0000', accent: '#FFFF00' },
            'mclaren': { main: '#FF8700', accent: '#FFFFFF' }, // Changed accent to white
            'aston_martin': { main: '#006F62', accent: '#FFFFFF' },
            'alpine': { main: '#0090FF', accent: '#FF0000' },
            'williams': { main: '#00A0DE', accent: '#FFFFFF' },
            'visa_rb': { main: '#00293F', accent: '#FF0000' },
            'audi': { main: '#71797E', accent: '#FF0000' }, // Steel silver + red for 4circles
            'haas': { main: '#FF0000', accent: '#FFFFFF' }, // Swapped: primary is now red, accent is white
            'cadillac': { main: '#333333', accent: '#D4AF37' } // Dark gray + gold for And ready's dream
        };
    }

    generateTrackByType(track) {
        try {
            if (!track || !track.name) {
                console.error('Invalid track configuration provided');
                return getTrackFunction('101', this.canvasCenterX, this.canvasCenterY, Math.min(this.canvas.width, this.canvas.height) / 400); // Fallback
            }

            // Extract track ID from name (e.g., 'Track 117' -> '117')
            const trackId = track.name.replace('Track ', '').trim();

            const trackGenerator = trackMap[trackId];
            if (trackGenerator) {
                const checkpoints = trackGenerator();
                // load ghost trail for this track
                setTimeout(() => { try { this._loadGhostTrailForCurrentTrack(); } catch { } }, 0);
                return checkpoints;
            }

            console.warn(`No track generator found for ${trackId} (from ${track.name}), falling back to simple track`);
            return getTrackFunction('101', this.canvasCenterX, this.canvasCenterY, Math.min(this.canvas.width, this.canvas.height) / 400);
        } catch (error) {
            console.error('Error in generateTrackByType:', error);
            return getTrackFunction('101', this.canvasCenterX, this.canvasCenterY, Math.min(this.canvas.width, this.canvas.height) / 400); // Fallback to simple track on error
        }
    }

    async generateDailyTrack() {
        this.trackLoading = true;
        try {
            // Check for test track mode first - only if URL has ?testMode=true
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const urlTestMode = urlParams.get('testMode') === 'true';
                const testMode = localStorage.getItem('hotlapdaily_test_mode');
                const testTrackCode = localStorage.getItem('hotlapdaily_test_track_code');
                // Only load test track if BOTH URL param AND localStorage are set
                if (urlTestMode && testMode === 'true' && testTrackCode) {
                    // Evaluate the test track function
                    let testTrackFunction;
                    try {
                        // The stored code is a function definition, wrap it in parentheses and evaluate
                        // Example: "function generateCustomTrack(scale, centerX, centerY) { ... }"
                        // We need to extract just the function body or evaluate it properly
                        const funcWrapper = new Function('return ' + testTrackCode);
                        testTrackFunction = funcWrapper();
                    } catch (evalError) {
                        console.error('Error evaluating test track code:', evalError);
                        // Fall through to normal track generation
                    }
                    if (testTrackFunction && typeof testTrackFunction === 'function') {
                        const scale = Math.min(this.canvas.width, this.canvas.height) / 400;
                        const checkpoints = testTrackFunction(scale, this.canvasCenterX, this.canvasCenterY);
                        if (checkpoints && checkpoints.length >= 2) {
                            this.currentTrack = {
                                name: 'Test Track',
                                checkpoints: checkpoints,
                                complexity: 0.5,
                                turns: Math.floor(checkpoints.length / 2),
                                isTestTrack: true
                            };
                            // Update car position to track start
                            if (!this.lapStarted && this.currentTrack && this.currentTrack.checkpoints) {
                                const startPoint = this.currentTrack.checkpoints[0];
                                if (startPoint) {
                                    const yOffset = this.canvas.height * 0.12;
                                    this.carController.setPosition(startPoint.x, startPoint.y + yOffset, (startPoint.angle || 0) * Math.PI / 180);
                                }
                            }
                            this.updateNextTrackTime();
                            try { this._loadGhostTrailForCurrentTrack(); } catch { }
                            return;
                        }
                    }
                }
            } catch (testError) {
                console.error('Error loading test track:', testError);
                // Fall through to normal track generation
            }

            // Check for ?track=<id> or ?trackId=<id> param — practice mode (no timing submitted)
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const practiceTrackId = urlParams.get('track') || urlParams.get('trackId');
                if (practiceTrackId) {
                    const scale = Math.min(this.canvas.width, this.canvas.height) / 400;
                    const checkpoints = await getTrackFunctionAsync(practiceTrackId, this.canvasCenterX, this.canvasCenterY, scale);
                    if (checkpoints && checkpoints.length >= 2) {
                        this.currentTrack = {
                            name: `Track ${practiceTrackId}`,
                            checkpoints: checkpoints,
                            complexity: 0.5,
                            turns: Math.floor(checkpoints.length / 2),
                            isPracticeMode: true,
                            isTestTrack: true // reuse existing flag to skip lap submission
                        };
                        if (!this.lapStarted && this.currentTrack.checkpoints) {
                            const startPoint = this.currentTrack.checkpoints[0];
                            if (startPoint) {
                                const yOffset = this.canvas.height * 0.12;
                                this.carController.setPosition(startPoint.x, startPoint.y + yOffset, (startPoint.angle || 0) * Math.PI / 180);
                            }
                        }
                        this.updateNextTrackTime();
                        try { this._loadGhostTrailForCurrentTrack(); } catch { }
                        console.info(`[Game] Practice mode: loaded track ${practiceTrackId} (times will not be submitted)`);
                        return;
                    } else {
                        console.warn(`[Game] Practice track ${practiceTrackId} not found or invalid, falling back to daily track`);
                    }
                }
            } catch (practiceError) {
                console.error('Error loading practice track:', practiceError);
            }

            // Check for any enabled track flags for local testing
            const enabledTracks = Object.keys(this._trackFlags).filter(
                key => this._trackFlags[key]
            ); if (enabledTracks.length > 0) {
                // Find the first enabled track in trackVariations by extracting ID from name
                const enabledTrackConfig = this.trackVariations.find(track => {
                    const trackId = track.name.replace('Track ', '').trim();
                    return enabledTracks.includes(trackId);
                });
                if (enabledTrackConfig) {
                    const checkpoints = await getTrackFunctionAsync(enabledTrackConfig.name.replace('Track ', '').trim(), this.canvasCenterX, this.canvasCenterY, Math.min(this.canvas.width, this.canvas.height) / 400);
                    this.currentTrack = {
                        name: enabledTrackConfig.name,
                        checkpoints: checkpoints,
                        complexity: enabledTrackConfig.complexity,
                        turns: enabledTrackConfig.turns,
                        date: enabledTrackConfig.date
                    };                    // Update car position to track start
                    if (!this.lapStarted && this.currentTrack && this.currentTrack.checkpoints) {
                        const startPoint = this.currentTrack.checkpoints[0];
                        if (startPoint) {
                            const yOffset = this.canvas.height * 0.12;
                            this.carController.setPosition(startPoint.x, startPoint.y + yOffset, (startPoint.angle || 0) * Math.PI / 180);
                        }
                    }
                    this.updateNextTrackTime(); // Add this line
                    try { this._loadGhostTrailForCurrentTrack(); } catch { }
                    return;
                }
            }

            // Get current date in YYYY-MM-DD format (UTC time to match server)
            const todayObj = new Date();
            const today = [
                todayObj.getUTCFullYear(),
                String(todayObj.getUTCMonth() + 1).padStart(2, '0'),
                String(todayObj.getUTCDate()).padStart(2, '0')
            ].join('-');

            // Find the track that matches today's date
            const todaysTrack = this.trackVariations.find(track => track.date === today);

            if (todaysTrack) {
                console.info('[Game] Selected track for today:', todaysTrack.name);

                // Generate track based on selected configuration
                const checkpoints = await getTrackFunctionAsync(todaysTrack.name.replace('Track ', '').trim(), this.canvasCenterX, this.canvasCenterY, Math.min(this.canvas.width, this.canvas.height) / 400);
                if (!checkpoints || checkpoints.length < 2) {
                    console.error(`Failed to generate checkpoints for ${todaysTrack.name}, falling back to simple track`);
                    this.currentTrack = {
                        name: 'Simple Circuit',
                        checkpoints: await getTrackFunctionAsync('101', this.canvasCenterX, this.canvasCenterY, Math.min(this.canvas.width, this.canvas.height) / 400),
                        complexity: 0.2,
                        turns: 3
                    };
                } else {
                    console.info('[Game] Generated track with checkpoints:', checkpoints.length);
                    this.currentTrack = {
                        name: todaysTrack.name,
                        checkpoints: checkpoints,
                        complexity: todaysTrack.complexity,
                        turns: todaysTrack.turns,
                        date: todaysTrack.date
                    };
                    try {
                        const trackId = todaysTrack.name.replace('Track ', '').trim();
                        localStorage.setItem('hotlapdaily_todays_track_id', trackId);
                        localStorage.setItem('hotlapdaily_todays_track_name', todaysTrack.name);
                        localStorage.setItem('hotlapdaily_todays_track_date', todaysTrack.date);
                        this._loadGhostTrailForCurrentTrack();
                    } catch { }
                }
            } else {
                // If no track matches today's date, fallback to simple track
                console.warn('[Game] No track found for today\'s date, falling back to simple track'); const trackConfig = {
                    name: 'Simple Circuit',
                    complexity: 0.2,
                    turns: 3
                };
                const checkpoints = await getTrackFunctionAsync('298', this.canvasCenterX, this.canvasCenterY, Math.min(this.canvas.width, this.canvas.height) / 400);
                if (!checkpoints || checkpoints.length < 2) {
                    throw new Error('Failed to generate simple track checkpoints');
                }
                this.currentTrack = {
                    name: trackConfig.name,
                    checkpoints: checkpoints,
                    complexity: trackConfig.complexity,
                    turns: trackConfig.turns
                };
            }                    // Update car position to track start
            if (!this.lapStarted && this.currentTrack && this.currentTrack.checkpoints) {
                const startPoint = this.currentTrack.checkpoints[0];
                if (startPoint) {
                    console.debug('[Game] Setting car to start position:', startPoint);
                    // Calculate the Y-offset (12% of canvas height) to match rendering offset
                    const yOffset = this.canvas.height * 0.12;
                    // Set position with the Y-offset to align with the rendered track
                    this.carController.setPosition(startPoint.x, startPoint.y + yOffset, (startPoint.angle || 0) * Math.PI / 180);
                } else {
                    console.error('Invalid start point in track checkpoints');
                }
            }

            this.updateNextTrackTime(); // Add this line
        } catch (error) {
            console.error('Error generating daily track:', error);
            // Create emergency fallback track to prevent game from breaking
            console.warn('Creating emergency fallback track');
            const scale = Math.min(this.canvas.width, this.canvas.height) / 400;
            const centerX = this.canvasCenterX;
            const centerY = this.canvasCenterY;
            // Simple rectangular track
            const width = 200 * scale;
            const height = 150 * scale;
            const x = centerX - width / 2;
            const y = centerY - height / 2;

            this.currentTrack = {
                name: 'Emergency Track',
                checkpoints: [
                    { x: x, y: y + height / 2, angle: 0 },
                    { x: x + width, y: y + height / 2 },
                    { x: x + width, y: y - height / 2 },
                    { x: x, y: y - height / 2 },
                    { x: x, y: y + height / 2, angle: 0 }
                ],
                complexity: 0.1,
                turns: 4
            };            // Position car at start of emergency track
            const startPoint = this.currentTrack.checkpoints[0];
            // Calculate the Y-offset (12% of canvas height) to match rendering offset
            const yOffset = this.canvas.height * 0.12;
            // Set position with the Y-offset to align with the rendered track
            this.carController.setPosition(startPoint.x, startPoint.y + yOffset, (startPoint.angle || 0) * Math.PI / 180);
        } finally {
            this.trackLoading = false;
        }
    }
    updateNextTrackTime() {
        // Clear any existing interval
        if (this.nextTrackUpdateInterval) {
            clearInterval(this.nextTrackUpdateInterval);
        }

        const updateDisplay = () => {
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setUTCHours(24, 0, 0, 0); // Set to next UTC midnight

            const timeUntilNext = tomorrow - now;
            const hours = Math.floor(timeUntilNext / (1000 * 60 * 60));
            const minutes = Math.floor((timeUntilNext % (1000 * 60 * 60)) / (1000 * 60));
            const seconds = Math.floor((timeUntilNext % (1000 * 60)) / 1000);

            const nextTrackLabel = document.getElementById('next-track-label');
            if (nextTrackLabel) {
                nextTrackLabel.textContent = `Next track in: ${hours}h ${minutes}m ${seconds}s`;
            }
        };

        // Update immediately and then every second
        updateDisplay();
        this.nextTrackUpdateInterval = setInterval(updateDisplay, 1000);
    }

    update(timestamp) {
        const updateStart = performance.now();

        if (!this.lastTimestamp) this.lastTimestamp = timestamp;
        const deltaTime = timestamp - this.lastTimestamp;
        this.lastTimestamp = timestamp;

        try {
            // Don't update if game is paused
            if (this.gamePaused) return;

            if (this.lapStarted && !this.lapCompleted) {
                this.lapTime += deltaTime;

                // Update car position through controller
                this.carController.update();

                // Copy position from controller to car object for compatibility
                this.car.x = this.carController.position.x;
                this.car.y = this.carController.position.y;
                this.car.angle = this.carController.position.angle;

                // Record ghost trail sample
                try {
                    if (this.lapTime - this._ghostLastSampleMs >= this._ghostSampleIntervalMs) {
                        this._ghostLastSampleMs = this.lapTime;
                        // Record in normalized world coordinates so rendering is responsive-safe
                        const currentScale = this.carController?.scale || (Math.min(this.canvas.width, this.canvas.height) / 400);
                        const currentYOffset = this.canvas.height * 0.12;
                        const normX = this.carController.position.x / currentScale;
                        const normY = (this.carController.position.y - currentYOffset) / currentScale;
                        this.ghostCurrentTrail.push(this._quantizeSample({
                            t: this.lapTime,
                            x: normX,
                            y: normY,
                            angle: this.carController.position.angle
                        }));
                    }
                } catch { }

                // Update anti-cheat system (mandatory)
                if (this.antiCheat && validateAntiCheatIntegrity()) {
                    this.antiCheat.update(this.carController.position);
                } else if (!validateAntiCheatIntegrity()) {
                    console.error('🚨 Anti-cheat integrity check failed');
                }

                // Check collision with track boundaries
                if (this.checkCollision()) {
                    console.warn('[Game] Collision detected, ending lap');
                    this.lapStarted = false;
                    return;
                }

                // Check for lap completion
                this.checkLapCompletion();
            }

            // Performance monitoring
            const updateTime = performance.now() - updateStart;
            this.perfMetrics.updateTimes.push(updateTime);

            // Keep only last 60 samples
            if (this.perfMetrics.updateTimes.length > 60) {
                this.perfMetrics.updateTimes.shift();
            }

            // Calculate and log FPS every second
            this.frameCount++;
            const currentTime = performance.now();
            if (currentTime - this.lastFrameTime >= 1000) {
                const fps = Math.round((this.frameCount * 1000) / (currentTime - this.lastFrameTime));
                this.perfMetrics.fps.push(fps);
                if (this.perfMetrics.fps.length > 60) {
                    this.perfMetrics.fps.shift();
                }

                // Log performance metrics if they're outside expected ranges
                const avgUpdateTime = this.perfMetrics.updateTimes.reduce((a, b) => a + b, 0) / this.perfMetrics.updateTimes.length;
                if (avgUpdateTime > 16) { // More than 16ms per update (target is 60fps)
                    console.warn(`High average update time: ${avgUpdateTime.toFixed(2)}ms`);
                }
                // if (fps < 55) { // Less than 55 FPS
                //     console.warn(`Low FPS detected: ${fps}`);
                // }

                this.frameCount = 0;
                this.lastFrameTime = currentTime;
            }

        } catch (error) {
            console.error('[Game] Error in game update:', error);
            this.handleGameError(error);
        }
    }

    handleGameError(error) {
        console.error('[Game] Error:', {
            message: error.message,
            stack: error.stack,
            gameState: {
                lapStarted: this.lapStarted,
                lapCompleted: this.lapCompleted,
                carPosition: {
                    x: this.car.x,
                    y: this.car.y,
                    angle: this.car.angle
                }
            }
        });

        // If it's a critical error, pause the game
        if (error.message.includes('critical')) {
            this.gamePaused = true;
            console.error('Game paused due to critical error');
        }
    }

    bindEvents() {
        // Keyboard controls with error handling
        // Get all left and right control elements (for both portrait and landscape modes)
        const getLeftControls = () => document.querySelectorAll('.control-item.control-left');
        const getRightControls = () => document.querySelectorAll('.control-item.control-right');
        // Initial query
        let leftControls = getLeftControls();
        let rightControls = getRightControls();
        // Fallback to first/last child for backwards compatibility
        const leftControl = leftControls.length > 0 ? leftControls[0] : document.querySelector('.control-item:first-child');
        const rightControl = rightControls.length > 0 ? rightControls[0] : document.querySelector('.control-item:last-child');
        document.addEventListener('keydown', (e) => {
            try {
                switch (e.code) {
                    case 'Space':
                        if (!this.lapStarted) {
                            this.startLap();
                        }
                        break;
                    case 'ArrowLeft':
                    case 'KeyA':
                        this.carController.setControls(true, false);
                        leftControl.classList.add('pressed');
                        break;
                    case 'ArrowRight':
                    case 'KeyD':
                        this.carController.setControls(false, true);
                        rightControl.classList.add('pressed');
                        break;
                }
            } catch (error) {
                console.error('Error in keydown handler:', error);
                this.handleGameError(error);
            }
        });

        document.addEventListener('keyup', (e) => {
            try {
                switch (e.code) {
                    case 'ArrowLeft':
                    case 'KeyA':
                        this.carController.setControls(false, this.carController.controls.right);
                        leftControl.classList.remove('pressed');
                        break;
                    case 'ArrowRight':
                    case 'KeyD':
                        this.carController.setControls(this.carController.controls.left, false);
                        rightControl.classList.remove('pressed');
                        break;
                }
            } catch (error) {
                console.error('Error in keyup handler:', error);
                this.handleGameError(error);
            }
        });

        // Start button touch and click behavior
        const startButton = document.getElementById('startButton');

        // Click handler
        startButton.addEventListener('click', () => {
            if (!this.lapStarted) {
                this.startLap();
            }
        });

        // Touch events
        startButton.addEventListener('touchstart', (e) => {
            e.preventDefault();
            startButton.style.background = 'var(--highlight-blue)';
            startButton.style.color = 'var(--bg-primary)';
        });

        startButton.addEventListener('touchend', (e) => {
            e.preventDefault();
            startButton.style.background = 'var(--bg-primary)';
            startButton.style.color = 'var(--highlight-blue)';
            if (!this.lapStarted) {
                this.startLap();
            }
        });

        startButton.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            startButton.style.background = 'var(--bg-primary)';
            startButton.style.color = 'var(--highlight-blue)';
        });

        // Mouse events for visual feedback
        startButton.addEventListener('mousedown', () => {
            startButton.style.background = 'var(--highlight-blue)';
            startButton.style.color = 'var(--bg-primary)';
        });

        startButton.addEventListener('mouseup', () => {
            startButton.style.background = 'var(--bg-primary)';
            startButton.style.color = 'var(--highlight-blue)';
        });

        startButton.addEventListener('mouseleave', () => {
            startButton.style.background = 'var(--bg-primary)';
            startButton.style.color = 'var(--highlight-blue)';
        });

        // Pointer Events for universal touch/mouse support with robust state management

        const activePointers = new Map(); // pointerId -> 'left' | 'right'

        const updateControls = () => {
            let left = false;
            let right = false;

            // Determine desired state from active pointers
            for (const type of activePointers.values()) {
                if (type === 'left') left = true;
                if (type === 'right') right = true;
            }

            // Update game controller state
            // console.log('[Controls] Updating:', { left, right, activePointers: activePointers.size });
            this.carController.setControls(left, right);

            // Update visual state for ALL controls (portrait and landscape)
            const allLeftControls = document.querySelectorAll('.control-item.control-left');
            const allRightControls = document.querySelectorAll('.control-item.control-right');

            if (left) allLeftControls.forEach(c => c.classList.add('pressed'));
            else allLeftControls.forEach(c => c.classList.remove('pressed'));

            if (right) allRightControls.forEach(c => c.classList.add('pressed'));
            else allRightControls.forEach(c => c.classList.remove('pressed'));
        };

        document.addEventListener('pointerdown', (e) => {
            const leftTarget = e.target.closest('.control-item.control-left');
            const rightTarget = e.target.closest('.control-item.control-right');

            if (leftTarget) {
                e.preventDefault();
                activePointers.set(e.pointerId, 'left');
                try { leftTarget.setPointerCapture(e.pointerId); } catch (e) { }
                updateControls();
            } else if (rightTarget) {
                e.preventDefault();
                activePointers.set(e.pointerId, 'right');
                try { rightTarget.setPointerCapture(e.pointerId); } catch (e) { }
                updateControls();
            }
        }, { passive: false });

        const handlePointerRelease = (e) => {
            if (activePointers.has(e.pointerId)) {
                e.preventDefault();
                activePointers.delete(e.pointerId);
                updateControls();
            }
        };

        document.addEventListener('pointerup', handlePointerRelease);
        document.addEventListener('pointercancel', handlePointerRelease);
        // pointerleave is handled by setPointerCapture usually, but just in case:
        // If capture is lost, pointerup/cancel should fire.
    }

    resetGame() {
        console.info('[Game] Game reset');
        this.lapStarted = false;
        this.lapCompleted = false;
        this.lapTime = 0;
        this.currentCheckpoint = 0;        // Store current control state before resetting
        const wasPressingLeft = this.carController.controls.left;
        const wasPressingRight = this.carController.controls.right;

        const startCheckpoint = this.currentTrack.checkpoints[0];
        // Calculate the Y-offset (12% of canvas height) to match rendering offset
        const yOffset = this.canvas.height * 0.12;
        // Set position with the Y-offset to align with the rendered track
        this.carController.setPosition(startCheckpoint.x, startCheckpoint.y + yOffset, (startCheckpoint.angle || 0) * Math.PI / 180);
        document.getElementById('lap-timer').textContent = "0:00.000";
        this.hasLeftStartArea = false;

        // Restore control state after resetting position
        this.carController.setControls(wasPressingLeft, wasPressingRight);

        // Don't hide share button when resetting game state
        // Only hide it when starting a new lap
    }

    handleCarCrash() {
        console.warn('[Game] Car crash detected');

        // Store crash state and time we covered before crashing
        this.crashed = true;
        this.crashTime = this.lapTime; // Store the time we reached before crashing

        // Record the failed attempt for share functionality
        if (this.lapTime > 0) {
            this.allAttempts.push({
                status: 'failed',
                time: null,
                lapNumber: this.allAttempts.length + 1,
                timestamp: new Date().toISOString()
            });
        }

        // Update leaderboard immediately to reflect the crash
        updateInGameLeaderboard(this);

        // Stop the lap and add glowing effect to start button
        this.lapStarted = false;
        const startButton = document.getElementById('startButton');
        startButton.classList.remove('glow'); // Remove default glow if present
        startButton.classList.add('crash-glow'); // Add red crash glow
        startButton.style.animation = 'redGlowingButton 1.5s infinite'; // Add pulsing red animation
        startButton.style.color = '#FF0000'; // Explicitly set text color to red
        startButton.style.borderColor = '#FF0000'; // Set border color to red

        // Don't set timer to "DNF" here - let the draw method handle it with crash state

        // Only hide share button if user has never completed a lap
        if (!this.hasCompletedLap) {
            const shareButton = document.getElementById('shareButton');
            if (shareButton) {
                shareButton.style.display = 'none';
            }
        }
    }
    startLap() {
        console.info(`[Game] Lap started on track: ${this.currentTrack?.name}`);

        // Reset crash state when starting new lap
        this.crashed = false;
        this.crashTime = 0;

        // Change the start button to black (non-distracting) while racing
        const startButton = document.getElementById('startButton');
        startButton.classList.remove('glow');
        startButton.classList.remove('crash-glow');
        startButton.style.animation = 'none';  // Remove all animations
        startButton.style.color = 'var(--text-primary)'; // Use CSS variable for dark mode compatibility
        startButton.style.borderColor = 'var(--text-primary)'; // Use CSS variable for dark mode compatibility
        startButton.style.background = 'var(--bg-primary)';

        // Only hide share button if user has never completed lap
        if (!this.hasCompletedLap) {
            const shareButton = document.getElementById('shareButton');
            if (shareButton) {
                shareButton.style.display = 'none';
            }
        } else {
            // If user has completed laps before, just remove the glow effect
            const shareButton = document.getElementById('shareButton');
            if (shareButton) {
                shareButton.classList.remove('completed-glow');
            }
        }        // Store current control state before resetting
        const wasPressingLeft = this.carController.controls.left;
        const wasPressingRight = this.carController.controls.right;

        const startCheckpoint = this.currentTrack.checkpoints[0];
        // Calculate the Y-offset (12% of canvas height) to match rendering offset
        const yOffset = this.canvas.height * 0.12;
        // Set position with the Y-offset to align with the rendered track
        this.carController.setPosition(startCheckpoint.x, startCheckpoint.y + yOffset, (startCheckpoint.angle || 0) * Math.PI / 180);
        this.lapStarted = true;
        this.lapCompleted = false;
        this.lapTime = 0;
        this.hasLeftStartArea = false;
        // Reset ghost lap recording
        this.ghostCurrentTrail = [];
        this._ghostLastSampleMs = 0;

        // Restore control state after resetting position (so car starts with the direction already pressed)
        this.carController.setControls(wasPressingLeft, wasPressingRight);

        // Initialize anti-cheat system for this lap (mandatory)
        if (this.currentTrack && this.currentTrack.checkpoints && this.antiCheat && validateAntiCheatIntegrity()) {
            this.antiCheat.initializeCheckpoints(this.currentTrack.checkpoints);
            this.antiCheat.reset();
            // In test mode, apply custom checkpoint % from slider
            if (this.currentTrack.isTestTrack) {
                const savedPct = localStorage.getItem('hotlapdaily_test_checkpoint_pct');
                if (savedPct !== null) {
                    this.antiCheat.minimumCheckpointsRequired = parseInt(savedPct) / 100;
                }
            }
        } else if (!validateAntiCheatIntegrity()) {
            console.error('🚨 Anti-cheat integrity compromised - lap cannot start');
        }
    } checkCollision() {
        const track = this.currentTrack;
        const checkpoints = track.checkpoints;
        const scale = Math.min(this.canvas.width, this.canvas.height) / 400;
        // Calculate the same y-offset used for rendering
        const yOffset = this.canvas.height * 0.12;

        // // Debug logging to check track visibility
        // if (this.debugCollision) {
        //     console.log("Track checkpoints:", checkpoints.length);
        //     console.log("First checkpoint:", checkpoints[0]);
        //     console.log("Track width scale:", scale);
        //     console.log("Y-offset:", yOffset);
        // }

        // Define wheel positions relative to car center (front and rear wheels)
        const wheelOffset = 2 * this.carController.scale; // Distance of wheels from center
        const wheelSpread = 2 * this.carController.scale; // Width between left and right wheels
        // Calculate wheel positions based on car's angle, accounting for the y-offset
        const wheels = [
            // Front left wheel (index 0)
            {
                x: this.carController.position.x + Math.cos(this.carController.position.angle) * wheelOffset - Math.sin(this.carController.position.angle) * wheelSpread,
                y: this.carController.position.y + Math.sin(this.carController.position.angle) * wheelOffset + Math.cos(this.carController.position.angle) * wheelSpread - yOffset,
                position: 'front-left'
            },
            // Front right wheel (index 1)
            {
                x: this.carController.position.x + Math.cos(this.carController.position.angle) * wheelOffset + Math.sin(this.carController.position.angle) * wheelSpread,
                y: this.carController.position.y + Math.sin(this.carController.position.angle) * wheelOffset - Math.cos(this.carController.position.angle) * wheelSpread - yOffset,
                position: 'front-right'
            },
            // Rear left wheel (index 2)
            {
                x: this.carController.position.x - Math.cos(this.carController.position.angle) * wheelOffset - Math.sin(this.carController.position.angle) * wheelSpread,
                y: this.carController.position.y - Math.sin(this.carController.position.angle) * wheelOffset + Math.cos(this.carController.position.angle) * wheelSpread - yOffset,
                position: 'rear-left'
            },
            // Rear right wheel (index 3)
            {
                x: this.carController.position.x - Math.cos(this.carController.position.angle) * wheelOffset + Math.sin(this.carController.position.angle) * wheelSpread,
                y: this.carController.position.y - Math.sin(this.carController.position.angle) * wheelOffset - Math.cos(this.carController.position.angle) * wheelSpread - yOffset,
                position: 'rear-right'
            }
        ];

        // Track which wheels are off the track
        const offTrackWheels = [];

        // Check each wheel's position
        for (const wheel of wheels) {
            let wheelOnTrack = false;

            // Check if wheel is near any track segment
            for (let i = 0; i < checkpoints.length - 1; i++) {
                const p1 = checkpoints[i];
                const p2 = checkpoints[i + 1];

                const dist = this.pointToLineDistance(
                    wheel.x, wheel.y,
                    p1.x, p1.y,
                    p2.x, p2.y
                );

                if (dist < 25 * scale) {  // If wheel is within track width
                    wheelOnTrack = true;
                    break;
                }
            }

            if (!wheelOnTrack) {
                offTrackWheels.push(wheel.position);
                if (this.debugCollision) {
                    console.log(`Wheel off track: ${wheel.position}`);
                }
            }
        }

        // Check for crash conditions based on which wheels are off track
        if (offTrackWheels.length > 0) {
            // If both front wheels are off track, it's a crash
            if (offTrackWheels.includes('front-left') && offTrackWheels.includes('front-right')) {
                if (this.debugCollision) {
                    console.log("CRASH: Both front wheels off track");
                }
                this.handleCarCrash();
                return true;
            }

            // Removing the same-side check as per F1 rules (both wheels on same side can be off track)
            // This allows cars to drive with two wheels off track on the same side

            // If more than 2 wheels are off track, it's a crash
            if (offTrackWheels.length > 2) {
                if (this.debugCollision) {
                    console.log(`CRASH: ${offTrackWheels.length} wheels off track`);
                }
                this.handleCarCrash();
                return true;
            }

            // Otherwise, the car can continue with up to 2 wheels off track
            if (this.debugCollision) {
                console.log(`${offTrackWheels.length} wheel(s) off track, but still allowed to drive`);
            }
        }

        return false;
    }

    pointToLineDistance(px, py, x1, y1, x2, y2) {
        // Pure helper lives in /game/util/geometry.js; thin wrapper kept for callers.
        return pointToLineDistance(px, py, x1, y1, x2, y2);
    }

    checkLapCompletion() {
        try {
            if (!this.lapStarted || this.lapCompleted) return false;

            const startPoint = this.currentTrack.checkpoints[0];
            if (!startPoint || typeof startPoint.x !== 'number' || typeof startPoint.y !== 'number') {
                console.error('Invalid start point in checkLapCompletion:', startPoint);
                return false;
            }
            // Use the same scale as elsewhere in the code (400 not 800)
            const scale = Math.min(this.canvas.width, this.canvas.height) / 400;
            // Calculate the same y-offset used for rendering
            const yOffset = this.canvas.height * 0.12;
            // Make completion radius larger than track width detection for more forgiving completion
            const completionRadius = 30 * scale;
            // Calculate distance to start/finish line, accounting for the y-offset
            const distanceToStart = Math.hypot(
                this.carController.position.x - startPoint.x,
                (this.carController.position.y - yOffset) - startPoint.y
            );

            // Debug log for distance to finish line if needed
            console.debug(`Distance to finish line: ${distanceToStart.toFixed(2)}, completion radius: ${completionRadius.toFixed(2)}, hasLeftStartArea: ${this.hasLeftStartArea}`);

            // Only complete lap if we've moved away from start and come back
            if (distanceToStart < completionRadius && this.hasLeftStartArea) {
                console.log('Lap complete! Distance to start:', distanceToStart.toFixed(2));
                // Special handling for finish line - call this first before any collision checks
                // to ensure we always register lap completion even if we're crashing
                this.completeLap();
                return true;
            }

            // Track when car leaves start area - use a larger radius to ensure we don't complete 
            // lap immediately after starting
            if (distanceToStart > completionRadius * 2) {
                if (!this.hasLeftStartArea) {
                    console.log('Car has left start area');
                    this.hasLeftStartArea = true;
                }
            }

            return false;
        } catch (error) {
            console.error('Error in checkLapCompletion:', error);
            return false;
        }
    }

    completeLap() {
        try {
            // Prevent duplicate submissions if called multiple times in quick succession
            if (this._completingLap || this.lapCompleted) {
                return;
            }
            this._completingLap = true;
            const finalTime = (this.lapTime / 1000).toFixed(3);
            const lapSeconds = parseFloat(finalTime);

            // console.log('🏁 LAP COMPLETION STARTED:', {
            //     finalTime: parseFloat(finalTime),
            //     currentBestLap: this.bestLapTime,
            //     antiCheatEnabled: !!this.antiCheat
            // });

            // Validate lap with anti-cheat system first (only if feature flag is enabled)
            let isValidLap = true;
            let validationSummary = null;

            // MANDATORY LAP VALIDATION - Always runs, fail-safe design
            if (this.antiCheat && validateAntiCheatIntegrity()) {
                isValidLap = this.antiCheat.validateLapCompletion();
                validationSummary = this.antiCheat.getValidationSummary();

                // console.log('🔍 LAP VALIDATION (MANDATORY):', {
                //     isValidLap,
                //     validationSummary,
                //     integrityCheck: 'PASSED'
                // });
            } else {
                // Fail-safe: reject lap if anti-cheat is compromised
                console.error('� ANTI-CHEAT SYSTEM COMPROMISED - LAP REJECTED');
                isValidLap = false;
                validationSummary = {
                    isValid: false,
                    checkpointsVisited: 0,
                    totalCheckpoints: 'UNKNOWN',
                    completionPercentage: 0,
                    violations: ['Anti-cheat system integrity check failed']
                };
            }

            if (!isValidLap) {
                console.warn('[Game] LAP INVALID - Anti-cheat violations detected:', validationSummary);
                this.handleInvalidLap(lapSeconds, validationSummary);
                this._completingLap = false;
                return;
            }

            document.getElementById('lap-timer').textContent = finalTime + 's';

            // Record the lap time in our main lap times array
            this.lapTimes.push({
                status: 'completed',
                time: lapSeconds,
                lapNumber: this.lapTimes.length + 1,
                timestamp: new Date().toISOString() // Add timestamp for reference
            });

            // Also record it in our all attempts tracking array for the share feature
            this.allAttempts.push({
                status: 'completed',
                time: lapSeconds,
                lapNumber: this.allAttempts.length + 1,
                timestamp: new Date().toISOString()
            });

            // Track if this is a new best lap time
            let isNewBestLap = false;

            // Update best lap time
            if (this.bestLapTime === null || lapSeconds < this.bestLapTime) {
                this.bestLapTime = lapSeconds;
                isNewBestLap = true; // Flag that this is a new best lap
            }            // Add debug logging to track lap time values


            // Track lap time in Clarity for non-best laps only - non-blocking and fail-safe
            if (!isNewBestLap) {
                trackLapToClarity(lapSeconds * 1000); // Convert back to ms for consistency
            }
            // Send ONLY best lap data to Supabase - non-blocking and fail-safe
            if (isNewBestLap) {
                // Check if we're in test mode - don't submit lap times for test tracks
                const urlParams = new URLSearchParams(window.location.search);
                const urlTestMode = urlParams.get('testMode') === 'true';
                const isTestMode = (urlTestMode && localStorage.getItem('hotlapdaily_test_mode') === 'true') || this.currentTrack?.isTestTrack;
                if (isTestMode) {
                    console.log('[Game] Test mode active - lap time not submitted');
                    // Still persist ghost trail for test tracks
                    try { this._saveGhostTrailForCurrentTrack(); } catch { }
                    this._completingLap = false;
                    return;
                }

                // Persist ghost trail for this track
                try { this._saveGhostTrailForCurrentTrack(); } catch { }
                const bestLapForSubmission = lapSeconds;
                setTimeout(async () => {
                    try {
                        const playerName = document.getElementById('playerName')?.value || this.getRandomDriverName();
                        const trackName = this.currentTrack?.name || 'Unknown Track';
                        // Debounce: avoid duplicate sends within a 2s window for the same best time
                        try {
                            const lastSent = JSON.parse(localStorage.getItem('hotlap_last_best_sent') || 'null');
                            const now = Date.now();
                            const sameTime = lastSent && Math.abs(Number(lastSent.best) - Number(bestLapForSubmission)) < 0.001;
                            const withinWindow = lastSent && (now - Number(lastSent.ts)) < 2000;
                            if (sameTime && withinWindow) {
                                console.warn('Debounced duplicate best-lap submission');
                                return;
                            }
                            localStorage.setItem('hotlap_last_best_sent', JSON.stringify({ best: bestLapForSubmission, ts: now }));
                        } catch { }

                        // Capture and validate physics data with canvas dimensions FIRST
                        const scale = Math.min(this.canvas.width, this.canvas.height) / 400;
                        const physicsValues = capturePhysicsValues(
                            this.carController,
                            scale,
                            this.canvas.width,
                            this.canvas.height
                        );
                        const physicsData = validatePhysicsValues(physicsValues);




                        // Build compressed trace for submission (downsample + delta encoding)
                        const compressedTrace = (() => {
                            try {
                                const samples = Array.isArray(this.ghostCurrentTrail) ? this.ghostCurrentTrail : [];
                                if (samples.length < 5) return null;
                                // Downsample every 2nd sample
                                const down = [];
                                for (let i = 0; i < samples.length; i += 2) down.push(samples[i]);
                                // Delta encode from first sample to reduce entropy
                                const base = down[0];
                                const deltas = [];
                                for (let i = 1; i < down.length; i++) {
                                    const s = down[i];
                                    deltas.push([
                                        s.t - base.t,
                                        Math.round((s.x - base.x) * 10) / 10,
                                        Math.round((s.y - base.y) * 10) / 10,
                                        Math.round((s.angle - base.angle) * 1000) / 1000
                                    ]);
                                }
                                return { b: base, d: deltas };
                            } catch { return null; }
                        })();

                        // Modify physicsData to send attempt count instead of baseTurnSpeed
                        const modifiedPhysicsData = {
                            ...physicsData,
                            baseTurnSpeed: this.allAttempts.length
                        };

                        const result = await sendBestLap(
                            bestLapForSubmission,
                            playerName,
                            trackName,
                            modifiedPhysicsData,
                            validationSummary,  // Add anti-cheat summary
                            // Include compressed trace if available
                            compressedTrace
                        );

                        if (result.success) {
                            if (Number.isFinite(result.rank) && result.rank > 0) {
                                this._updateRankInUi(result.rank, result.total);
                            }
                            // Store the race ID for sharing
                            if (result.raceId) {
                                this.currentRaceId = result.raceId;
                                console.log('[Game] Stored race ID for sharing:', this.currentRaceId);

                                // Store in localStorage for UI access
                                try {
                                    localStorage.setItem('hotlapdaily_current_race_id', result.raceId);
                                    console.log('[Game] Stored race ID in localStorage:', result.raceId);
                                } catch (storageError) {
                                    console.warn('Could not store race ID in localStorage:', storageError);
                                }

                                // Dispatch event to update race ID display in ghost settings
                                try {
                                    window.dispatchEvent(new CustomEvent('hotlap:race-id-updated', {
                                        detail: { raceId: result.raceId }
                                    }));
                                    console.log('[Game] Dispatched race ID update event:', result.raceId);
                                } catch (raceIdEventError) {
                                    console.warn('Could not dispatch race ID update event:', raceIdEventError);
                                }

                                // Show share button now that we have a raceId (only if not in test mode)
                                try {
                                    const urlParams = new URLSearchParams(window.location.search);
                                    const urlTestMode = urlParams.get('testMode') === 'true';
                                    const isTestMode = urlTestMode && localStorage.getItem('hotlapdaily_test_mode') === 'true';
                                    if (!isTestMode) {
                                        const shareButton = document.getElementById('shareButton');
                                        if (shareButton) {
                                            shareButton.style.display = 'block';
                                            shareButton.classList.add('completed-glow');
                                        }
                                    }
                                } catch (shareButtonError) {
                                    console.warn('Could not show share button:', shareButtonError);
                                }
                            }
                        } else {
                            console.warn('⚠️ Best lap not recorded:', result.reason);
                        }
                    } catch (_e) {
                        // Silent failure - never break user experience
                        console.warn('Failed to send best lap to Supabase:', _e);
                    }
                }, 0);
            } else {
                console.log('📈 Lap completed but not a new best lap. Current best:', this.bestLapTime, 'This lap:', lapSeconds);
            }

            // Also track if this is a best lap and total laps completed
            if (isNewBestLap && typeof window.clarity === 'function') {
                setTimeout(() => {
                    try {
                        window.clarity("event", "new_best_lap");
                        window.clarity("set", "totalLapsCompleted", this.lapTimes.length.toString());
                    } catch { /* Silent failure */ }
                }, 0);
            }

            updateInGameLeaderboard(this);
            this.lapStarted = false;
            this.lapCompleted = true;
            this.hasCompletedLap = true;
            this._completingLap = false;

            // Make the in-game leaderboard visible after completing a lap
            try {
                document.querySelector('.in-game-leaderboard').classList.add('visible');
            } catch (uiError) {
                console.warn('Could not update leaderboard visibility:', uiError);
            }

            // Restore start button to blue color when lap is completed
            try {
                const startButton = document.getElementById('startButton');
                if (startButton) {
                    startButton.classList.remove('crash-glow');
                    startButton.style.animation = 'blueGlowingButton 2s infinite'; // Restore blue glow animation
                    startButton.style.color = 'var(--highlight-blue)'; // Restore blue text color
                    startButton.style.borderColor = 'var(--highlight-blue)'; // Restore blue border color
                    startButton.style.background = 'var(--bg-primary)';
                }
            } catch (buttonError) {
                console.warn('Could not update start button style:', buttonError);
            }

            // Show share button after completing a lap with blue glow (only if we have a best lap)
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const urlTestMode = urlParams.get('testMode') === 'true';
                const isTestMode = urlTestMode && localStorage.getItem('hotlapdaily_test_mode') === 'true';
                if (!isTestMode) {
                    const shareButton = document.getElementById('shareButton');
                    if (shareButton && this.bestLapTime !== null) {
                        shareButton.style.display = 'block';
                        shareButton.classList.add('completed-glow');
                    }
                }
            } catch (shareButtonError) {
                console.warn('Could not update share button:', shareButtonError);
            }

            // Auto-show share card popup only when setting a new best lap time
            if (isNewBestLap) {
                // Small delay to ensure UI updates first
                setTimeout(() => {
                    try {
                        this.generateShareCard();
                    } catch (shareCardError) {
                        console.error('Failed to generate share card:', shareCardError);
                    }
                }, 500);
            }
        } catch (error) {
            console.error('Error in completeLap:', error);
            // Try to recover by at least updating some basic state
            this.lapStarted = false;
            this.lapCompleted = true;
            this.hasCompletedLap = true;
        }
    }

    // Handle invalid laps due to anti-cheat violations
    handleInvalidLap(lapTime, validationSummary) {
        console.warn('[Game] Invalid lap detected - not recording time');

        // Show violation warning to user
        if (this.antiCheat && validationSummary) {
            this.antiCheat.showViolationWarning(validationSummary);
        }

        // Record as invalid attempt
        const invalidAttempt = {
            time: lapTime,
            status: 'invalid',
            reason: 'Anti-cheat violation',
            details: validationSummary,
            timestamp: new Date().toISOString()
        };

        this.allAttempts.push(invalidAttempt);

        // Reset lap state
        this.lapCompleted = true;
        this.lapStarted = false;

        // Restore start button
        const startButton = document.getElementById('startButton');
        if (startButton) {
            startButton.style.color = 'var(--highlight-blue)';
            startButton.style.borderColor = 'var(--highlight-blue)';
            startButton.style.background = 'var(--bg-primary)';
            startButton.classList.remove('glow', 'crash-glow');
            startButton.style.animation = 'none';
        }
    }

    updateLeaderboard() {
        return updateInGameLeaderboard(this);
    }

    formatTime(ms) {
        const seconds = Math.floor(ms / 1000);
        const milliseconds = Math.floor(ms % 1000);
        return `${seconds}:${milliseconds.toString().padStart(3, '0')}`;
    }
    draw() {
        // Clear canvas with background color (supports dark mode)
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        this.ctx.fillStyle = isDark ? '#1a1a1a' : '#FFFFFF';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Show loading state while track is being fetched
        if (this.trackLoading) {
            this.ctx.fillStyle = isDark ? '#cccccc' : '#333333';
            this.ctx.font = `${Math.round(this.canvas.width * 0.04)}px monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('Loading track...', this.canvas.width / 2, this.canvas.height / 2);
            return;
        }

        // Show practice mode banner
        if (this.currentTrack?.isPracticeMode) {
            this.ctx.save();
            this.ctx.fillStyle = isDark ? 'rgba(255,165,0,0.15)' : 'rgba(255,165,0,0.12)';
            const bannerH = Math.round(this.canvas.height * 0.045);
            this.ctx.fillRect(0, 0, this.canvas.width, bannerH);
            this.ctx.fillStyle = isDark ? '#ffaa33' : '#cc7700';
            this.ctx.font = `bold ${Math.round(bannerH * 0.6)}px monospace`;
            this.ctx.textAlign = 'center';
            this.ctx.fillText('PRACTICE - times will not be submitted', this.canvas.width / 2, bannerH * 0.72);
            this.ctx.restore();
        }

        // Draw grid with subtle lines
        // drawGridLib(this.ctx, this.canvas);
        this.drawGrid();

        // Calculate a 12% offset from center of canvas (updated from 5%)
        const yOffset = this.canvas.height * 0.12; // 12% of height for positioning gameplay lower
        this.ctx.save();
        this.ctx.translate(0, yOffset);

        // Draw track with darker colors for visibility
        // drawTrackLib(this.ctx, this.currentTrack.checkpoints, this.canvas);
        this.drawTrack()

        // Get selected team colors
        const teamSelectEl = document.getElementById('teamSelect');
        const selectedTeam = teamSelectEl && teamSelectEl.value ? teamSelectEl.value : (this.lastSelectedTeam || 'ferrari');
        this.lastSelectedTeam = selectedTeam;
        const teamColor = selectedTeam && this.teamColors[selectedTeam] ? this.teamColors[selectedTeam] : this.teamColors.ferrari;

        // Enable pixel-perfect rendering
        this.ctx.imageSmoothingEnabled = false;

        // Draw ghost car first (under player car)
        try { this._drawGhostCar(teamColor); } catch { }

        // Draw car
        drawPixelCarLib(
            this.ctx,
            this.carController.position.x,
            this.carController.position.y,
            this.carController.position.angle,
            teamColor,
            this.carController.scale
        );

        // Update lap timer display only
        (function (self) {
            const lapTimerEl = document.getElementById('lap-timer');
            if (!lapTimerEl) return;
            if (self.crashed) {
                const crashTimeFormatted = self.formatTime(self.crashTime);
                lapTimerEl.textContent = crashTimeFormatted + ' (DNF)';
            } else if (!self.lapStarted && !self.lapCompleted) {
                lapTimerEl.textContent = '0:000';
            } else if (self.lapCompleted) {
                const finalTime = self.formatTime(self.lapTime);
                lapTimerEl.textContent = finalTime;
            } else {
                const currentTime = self.formatTime(self.lapTime);
                lapTimerEl.textContent = currentTime;
            }
        })(this);

        // Make sure lap timer is visible on mobile
        if (window.innerWidth <= 768) {
            const lapTimer = document.getElementById('lap-timer');
            if (lapTimer) {
                lapTimer.style.display = 'block';
                lapTimer.style.opacity = '1';
            }
        }

        this.ctx.restore();
    }

    _getCurrentTrackId() {
        try {
            if (this.currentTrack && this.currentTrack.name) {
                const id = String(this.currentTrack.name).replace('Track ', '').trim();
                if (id) return id;
            }
            const fromStorage = localStorage.getItem('hotlapdaily_todays_track_id');
            if (fromStorage) return fromStorage;
        } catch { }
        return 'unknown';
    }

    _getGhostStorageKey() {
        return `hotlapdaily_ghost_trail_${this._getCurrentTrackId()}`;
    }

    getRaceIdDriverName() {
        return this.raceIdDriverName;
    }

    _saveGhostTrailForCurrentTrack() {
        try {
            if (!Array.isArray(this.ghostCurrentTrail) || this.ghostCurrentTrail.length < 5) return;
            const key = this._getGhostStorageKey();
            const payload = {
                bestTime: this.bestLapTime,
                samples: this.ghostCurrentTrail,
                meta: {
                    space: 'world_norm',
                    recordScale: this.carController?.scale || (Math.min(this.canvas.width, this.canvas.height) / 400),
                    canvasW: this.canvas?.width,
                    canvasH: this.canvas?.height,
                    yOffsetPxAtRecord: (this.canvas?.height || 0) * 0.12
                }
            };
            localStorage.setItem(key, JSON.stringify(payload));
            this.ghostBestTrail = this.ghostCurrentTrail.slice();
            this.ghostBestSpace = 'world_norm';
        } catch (e) {
            console.warn('Failed to save ghost trail:', e);
        }
    }

    _loadGhostTrailForCurrentTrack() {
        try {
            const key = this._getGhostStorageKey();
            const raw = localStorage.getItem(key);
            if (!raw) { this.ghostBestTrail = []; return; }
            const data = JSON.parse(raw);
            if (data && Array.isArray(data.samples)) {
                this.ghostBestTrail = this._normalizeTrailTimes(data.samples);
                // Respect stored coordinate space metadata when present
                try {
                    const space = data.meta && (data.meta.space === 'world_norm' ? 'world_norm' : 'pixel');
                    this.ghostBestSpace = space || 'pixel';
                } catch { this.ghostBestSpace = 'pixel'; }
            } else {
                this.ghostBestTrail = [];
                this.ghostBestSpace = 'pixel';
            }
            // Also attempt to load any local payload trail
            this._loadLocalPayloadFromStorage();
        } catch (e) {
            console.warn('Failed to load ghost trail:', e);
            this.ghostBestTrail = [];
            this.ghostBestSpace = 'pixel';
        }
    }

    _loadLocalPayloadFromStorage() {
        try {
            const raw = localStorage.getItem('localPayloadTrace');
            if (!raw || !raw.trim()) { this.ghostLocalTrail = []; return; }
            let parsed;
            try { parsed = JSON.parse(raw); } catch { this.ghostLocalTrail = []; return; }
            // Support either { samples: [...] } or compressed { b, d }
            if (parsed && Array.isArray(parsed.samples)) {
                this.ghostLocalTrail = this._normalizeTrailTimes(parsed.samples);
                try {
                    const space = parsed.meta && (parsed.meta.space === 'world_norm' ? 'world_norm' : 'pixel');
                    this.ghostLocalSpace = space || 'world_norm'; // Default to 'world_norm' for consistency
                } catch { this.ghostLocalSpace = 'world_norm'; } // Default to 'world_norm' for consistency
                return;
            }
            if (parsed && parsed.b && Array.isArray(parsed.d)) {
                const base = parsed.b;
                const out = [base];
                for (let i = 0; i < parsed.d.length; i++) {
                    const [dt, dx, dy, da] = parsed.d[i];
                    out.push({
                        t: (base.t ?? 0) + (dt ?? 0),
                        x: (base.x ?? 0) + (dx ?? 0),
                        y: (base.y ?? 0) + (dy ?? 0),
                        angle: (base.angle ?? 0) + (da ?? 0)
                    });
                }
                this.ghostLocalTrail = this._normalizeTrailTimes(out);
                // Compressed payloads are always in 'world_norm' space by default
                // (they're created by the game in normalized coordinates)
                try {
                    const space = parsed.meta && (parsed.meta.space === 'world_norm' ? 'world_norm' : 'pixel');
                    this.ghostLocalSpace = space || 'world_norm'; // Changed default to 'world_norm'
                } catch { this.ghostLocalSpace = 'world_norm'; } // Changed default to 'world_norm'
                return;
            }
            this.ghostLocalTrail = [];
            this.ghostLocalSpace = 'pixel';
        } catch { this.ghostLocalTrail = []; }
    }

    _loadRaceIdGhostCar() {
        try {
            const raceId = localStorage.getItem('hotlapdaily_race_id');
            if (!raceId || !raceId.trim()) {
                this.raceId = null;
                this.raceIdGhostTrail = [];
                return;
            }

            this.raceId = raceId.trim();
            console.log('[Game] Loading ghost car for raceId:', this.raceId);

            // Fetch ghost trace data (pass trackId from URL if present, for cross-day ghost loading)
            const urlTrackId = new URLSearchParams(window.location.search).get('trackId') || '';
            const ghostUrl = `/api/ghost-trace?id=${encodeURIComponent(this.raceId)}${urlTrackId ? `&trackId=${encodeURIComponent(urlTrackId)}` : ''}`;
            fetch(ghostUrl)
                .then(response => {
                    if (!response.ok) {
                        if (response.status === 404) {
                            // 404 is expected for non-existent raceIds, don't log as error
                            console.log('[Game] Race trace not found for raceId:', this.raceId);
                            throw new Error('Race trace not found. This ghost car may no longer be available.');
                        } else if (response.status === 400) {
                            console.warn('[Game] Invalid race ID format:', this.raceId);
                            throw new Error('Invalid race ID format.');
                        } else if (response.status >= 500) {
                            console.error('[Game] Server error loading ghost trace:', response.status, response.statusText);
                            throw new Error('Server error. Please try again later.');
                        } else {
                            console.warn('[Game] Unexpected HTTP error loading ghost trace:', response.status, response.statusText);
                            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                        }
                    }
                    return response.json().catch(() => {
                        console.error('[Game] Invalid response format from ghost trace API');
                        throw new Error('Invalid response format from server');
                    });
                })
                .then(data => {
                    console.log('[Game] Ghost trace API response:', data);
                    if (data.error) {
                        throw new Error(data.error);
                    }

                    const trace = data.trace;
                    const trackName = data.trackName;
                    const driverName = data.driverName;

                    if (!trace) {
                        throw new Error('No trace data available');
                    }

                    // Store track name and driver name for validation and display
                    this.raceIdTrackName = trackName;
                    this.raceIdDriverName = driverName;

                    // Check if the track matches the current track.
                    // Use URL trackId if present (historical leaderboard), else current game track.
                    const urlTid = new URLSearchParams(window.location.search).get('trackId');
                    const currentTrackId = urlTid || this._getCurrentTrackId();
                    const expectedTrackName = `Track ${currentTrackId}`;

                    if (trackName !== expectedTrackName) {
                        throw new Error(`Track mismatch: expected ${expectedTrackName}, got ${trackName}`);
                    }

                    // Process trace data
                    if (Array.isArray(trace)) {
                        this.raceIdGhostTrail = this._normalizeTrailTimes(trace);
                    } else if (trace && trace.b && Array.isArray(trace.d)) {
                        // Handle compressed format
                        const base = trace.b;
                        const out = [base];
                        for (let i = 0; i < trace.d.length; i++) {
                            const [dt, dx, dy, da] = trace.d[i];
                            out.push({
                                t: (base.t ?? 0) + (dt ?? 0),
                                x: (base.x ?? 0) + (dx ?? 0),
                                y: (base.y ?? 0) + (dy ?? 0),
                                angle: (base.angle ?? 0) + (da ?? 0)
                            });
                        }
                        this.raceIdGhostTrail = this._normalizeTrailTimes(out);
                    } else {
                        throw new Error('Invalid trace format');
                    }

                    this.raceIdGhostSpace = 'world_norm';
                    console.log('[Game] Successfully loaded raceId ghost car with', this.raceIdGhostTrail.length, 'samples');

                    // Auto-enable ghost car when raceId ghost is successfully loaded
                    this._ghostEnabled = true;
                    try {
                        const ghostToggle = document.getElementById('ghostToggle');
                        if (ghostToggle) {
                            ghostToggle.checked = true;
                        }
                        // Dispatch event to update any ghost settings UI
                        window.dispatchEvent(new CustomEvent('hotlap:ghost-toggle', { detail: { enabled: true } }));
                        // Dispatch event with driver name for UI display
                        window.dispatchEvent(new CustomEvent('hotlap:ghost-driver-loaded', { detail: { driverName: this.raceIdDriverName } }));
                    } catch { }

                    // Clear the raceId from localStorage after successful load
                    localStorage.removeItem('hotlapdaily_race_id');
                })
                .catch(error => {
                    // Only log as error if it's not a 404 (expected for non-existent raceIds)
                    if (error.message.includes('Race trace not found')) {
                        console.log('[Game] Ghost car not available for raceId:', this.raceId);
                    } else {
                        console.error('[Game] Failed to load raceId ghost car:', error);
                        console.error('[Game] Error details:', {
                            raceId: this.raceId,
                            errorMessage: error.message,
                            errorStack: error.stack
                        });
                    }

                    // Ensure we show the error modal
                    try {
                        this._showGhostCarError(error.message);
                    } catch (modalError) {
                        console.error('[Game] Failed to show error modal:', modalError);
                        // Fallback: show alert if modal fails
                        alert(`Ghost Car Error: ${error.message}`);
                    }

                    this.raceId = null;
                    this.raceIdGhostTrail = [];
                });
        } catch (error) {
            console.error('[Game] Error in _loadRaceIdGhostCar:', error);

            // Show error modal for unexpected errors too
            try {
                this._showGhostCarError(`Unexpected error: ${error.message}`);
            } catch (modalError) {
                console.error('[Game] Failed to show error modal:', modalError);
                alert(`Ghost Car Error: ${error.message}`);
            }

            this.raceId = null;
            this.raceIdGhostTrail = [];
        }
    }

    _showGhostCarError(message) {
        // Only log if it's not a common "not found" error
        if (!message.includes('Race trace not found')) {
            console.log('[Game] Showing ghost car error modal:', message);
        }

        // Remove any existing error modal
        const existingModal = document.querySelector('.ghost-error-modal');
        if (existingModal) {
            existingModal.remove();
        }

        // Create modal overlay
        const modal = document.createElement('div');
        modal.className = 'ghost-error-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.8);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            opacity: 0;
            visibility: hidden;
            transition: opacity 0.3s ease, visibility 0.3s ease;
        `;

        // Create modal content
        const card = document.createElement('div');
        card.className = 'ghost-error-card';
        card.style.cssText = `
            background: #fff;
            border: 3px solid #111;
            padding: 1.5rem;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 1rem;
            max-width: 500px;
            max-height: 90vh;
            border-radius: 0;
            transform: scale(0.95);
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
            text-align: center;
            position: relative;
        `;

        const raceIdInfo = this.raceId ? `<p style="font-size: 0.8rem; color: #666; margin: 0.5rem 0; font-family: 'IBM Plex Mono', monospace;">Race ID: ${this.raceId}</p>` : '';

        // Check if this is a track mismatch error and add helpful guidance
        const isTrackMismatch = message.includes('different track') || message.includes('yesterday\'s track');
        const helpfulGuidance = isTrackMismatch ? `
            <div style="background: #f8f9fa; border: 1px solid #dee2e6; padding: 1rem; margin: 1rem 0; border-radius: 4px; text-align: left;">
                <p style="font-family: 'IBM Plex Mono', monospace; font-size: 0.85rem; color: #495057; margin: 0 0 0.5rem 0; font-weight: 600;">💡 How to get today's race ID:</p>
                <p style="font-family: 'IBM Plex Mono', monospace; font-size: 0.8rem; color: #6c757d; margin: 0; line-height: 1.3;">
                    1. Go to the Global Leaderboard<br>
                    2. Look for today's races (Track ${this._getCurrentTrackId ? this._getCurrentTrackId() : '248'})<br>
                    3. Click the 🏁 button next to any driver's time
                </p>
            </div>
        ` : '';

        card.innerHTML = `
            <h3 style="font-family: 'IBM Plex Mono', monospace; font-size: 1.2rem; font-weight: 600; color: #111; margin: 0; text-transform: uppercase; letter-spacing: 0.05em;">Ghost Car Unavailable</h3>
            <p style="font-family: 'IBM Plex Mono', monospace; font-size: 0.9rem; color: #111; margin: 0; line-height: 1.4;">${message}</p>
            ${raceIdInfo}
            ${helpfulGuidance}
            <button class="pixel-button" style="width: auto; min-width: 120px; margin-top: 0.5rem; background: #007bff; color: white; border: 2px solid #007bff; padding: 8px 16px; font-family: 'IBM Plex Mono', monospace; cursor: pointer;">OK</button>
            
            <button class="modal-close" aria-label="Close" style="position: absolute; top: 10px; right: 10px; background: none; border: none; cursor: pointer; padding: 5px;">
                <svg viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" width="18" height="18">
                    <path d="M4 4L14 14M14 4L4 14" stroke="#111" stroke-width="2.2" stroke-linecap="round"/>
                </svg>
            </button>
        `;

        modal.appendChild(card);
        document.body.appendChild(modal);

        // Add event listeners
        const closeModal = () => {
            modal.style.opacity = '0';
            modal.style.visibility = 'hidden';
            setTimeout(() => {
                if (modal.parentElement) {
                    modal.remove();
                }
            }, 300);
        };

        // Close button and OK button
        const okButton = card.querySelector('.pixel-button');
        const closeButton = card.querySelector('.modal-close');

        if (okButton) {
            okButton.addEventListener('click', closeModal);
        }

        if (closeButton) {
            closeButton.addEventListener('click', closeModal);
        }

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal();
            }
        });

        // Show modal with animation
        setTimeout(() => {
            modal.style.opacity = '1';
            modal.style.visibility = 'visible';
            card.style.transform = 'scale(1)';
            card.style.opacity = '1';
        }, 10);

        // Auto-close after 15 seconds
        setTimeout(() => {
            if (modal.parentElement) {
                closeModal();
            }
        }, 15000);
    }

    _normalizeTrailTimes(trail) {
        try {
            if (!Array.isArray(trail) || trail.length === 0) return [];
            const t0 = typeof trail[0].t === 'number' ? trail[0].t : 0;
            if (!t0) return trail;
            return trail.map(s => ({ t: (s.t ?? 0) - t0, x: s.x, y: s.y, angle: s.angle }));
        } catch { return trail; }
    }

    _drawGhostCar(teamColor) {
        try {
            // Respect runtime toggle; do not render when disabled
            if (!this._ghostEnabled) return;
            // Priority: raceId ghost -> local payload -> best lap -> none
            const raceIdTrail = Array.isArray(this.raceIdGhostTrail) ? this.raceIdGhostTrail : [];
            const localTrail = Array.isArray(this.ghostLocalTrail) ? this.ghostLocalTrail : [];
            const bestTrail = Array.isArray(this.ghostBestTrail) ? this.ghostBestTrail : [];
            const trail = raceIdTrail.length > 1 ? raceIdTrail : (localTrail.length > 1 ? localTrail : bestTrail);
            if (!trail || trail.length < 2) return;
            // Determine coordinate space for current trail
            const currentSpace = raceIdTrail.length > 1 ? this.raceIdGhostSpace : (localTrail.length > 1 ? this.ghostLocalSpace : this.ghostBestSpace) || 'pixel';
            const currentScale = this.carController?.scale || (Math.min(this.canvas.width, this.canvas.height) / 400);
            const currentYOffset = this.canvas.height * 0.12;
            const t = this.lapStarted ? this.lapTime : 0;

            // Choose a constructor color that is guaranteed different from the player's
            // Prefer a complementary palette to maximize contrast
            let ghostTeamColor = teamColor;
            try {
                const teamSelectEl = document.getElementById('teamSelect');
                const selectedTeam = teamSelectEl && teamSelectEl.value ? teamSelectEl.value : (this.lastSelectedTeam || 'ferrari');
                const pickDistinctTeam = () => {
                    const teamKeys = Object.keys(this.teamColors || {});
                    // Try a fixed preferred contrasting team first
                    const preferred = ['williams', 'mclaren', 'mercedes', 'red_bull', 'aston_martin', 'alpine', 'haas', 'stake', 'visa_rb', 'ferrari'];
                    for (const key of preferred) {
                        if (key !== selectedTeam && this.teamColors[key]) return key;
                    }
                    // Fallback to any other team
                    const alt = teamKeys.find(k => k !== selectedTeam);
                    return alt || selectedTeam;
                };
                const altKey = pickDistinctTeam();
                const base = this.teamColors[altKey] || this.teamColors['williams'] || teamColor;
                // If by any chance main colors match, tweak the hue slightly for visibility
                const sameMain = base && teamColor && base.main === teamColor.main;
                if (sameMain) {
                    const tweak = (hex) => {
                        try {
                            // simple hue tweak by cycling accents if equal
                            const palette = ['#FF00FF', '#00FFFF', '#FFD300', '#00FF7F', '#FF4500'];
                            return { main: palette[Math.floor(Math.random() * palette.length)], accent: '#000000' };
                        } catch { return { main: '#0000FF', accent: '#FFFFFF' }; }
                    };
                    ghostTeamColor = tweak(base.main);
                } else {
                    ghostTeamColor = base;
                }
            } catch { }

            // Find segment for current time
            let idx = -1;
            for (let i = 0; i < trail.length; i++) {
                if (trail[i].t >= t) { idx = i; break; }
            }
            if (idx === -1) {
                // Past the end: clamp to final sample
                const last = trail[trail.length - 1];
                const px = currentSpace === 'world_norm' ? (last.x * currentScale) : last.x;
                const py = currentSpace === 'world_norm' ? (last.y * currentScale + currentYOffset) : last.y;
                this.ctx.save();
                this.ctx.globalAlpha = 0.45;
                drawPixelCarLib(this.ctx, px, py, last.angle, ghostTeamColor, this.carController.scale);
                this.ctx.restore();
                return;
            }
            if (idx === 0) {
                const p = trail[0];
                const px = currentSpace === 'world_norm' ? (p.x * currentScale) : p.x;
                const py = currentSpace === 'world_norm' ? (p.y * currentScale + currentYOffset) : p.y;
                this.ctx.save();
                this.ctx.globalAlpha = 0.45;
                drawPixelCarLib(this.ctx, px, py, p.angle, ghostTeamColor, this.carController.scale);
                this.ctx.restore();
                return;
            }
            const a = trail[idx - 1];
            const b = trail[idx];
            const span = Math.max(1, b.t - a.t);
            const u = Math.max(0, Math.min(1, (t - a.t) / span));
            const lerp = (x, y) => x + (y - x) * u;
            let x = lerp(a.x, b.x);
            let y = lerp(a.y, b.y);
            if (currentSpace === 'world_norm') {
                x = x * currentScale;
                y = y * currentScale + currentYOffset;
            }
            // Angle interpolation (simple)
            let ang = a.angle + (b.angle - a.angle) * u;
            this.ctx.save();
            this.ctx.globalAlpha = 0.45;
            drawPixelCarLib(this.ctx, x, y, ang, ghostTeamColor, this.carController.scale);
            this.ctx.restore();
        } catch (e) {
            // Never break rendering if ghost fails
        }
    }

    drawTrack() {
        const track = this.currentTrack;
        const checkpoints = track.checkpoints;

        // If no checkpoints exist, log error and return to avoid crashes
        if (!checkpoints || checkpoints.length < 2) {
            console.error('[Game] No valid track checkpoints found:', checkpoints);
            return;
        }

        // No additional offset needed here - using the main offset from draw() method

        // Scale track width based on canvas size
        const scale = Math.min(this.canvas.width, this.canvas.height) / 400;
        const trackWidth = 50 * scale;

        // Log track width calculation to debug sizing issues
        console.debug('[Game] Drawing track with width:', trackWidth, 'scale:', scale);

        // Check for dark mode
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

        // Draw track surface
        this.ctx.strokeStyle = isDark ? '#444444' : '#E5E5E5';
        this.ctx.lineWidth = trackWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';

        // Create gradient for track
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        gradient.addColorStop(0, isDark ? '#444444' : '#E5E5E5');
        gradient.addColorStop(1, isDark ? '#555555' : '#F0F0F0');
        this.ctx.strokeStyle = gradient;

        // Draw track with additional error handling
        try {
            this.ctx.beginPath();
            this.ctx.moveTo(checkpoints[0].x, checkpoints[0].y);
            for (let i = 1; i < checkpoints.length; i++) {
                if (checkpoints[i] && typeof checkpoints[i].x === 'number' && typeof checkpoints[i].y === 'number') {
                    this.ctx.lineTo(checkpoints[i].x, checkpoints[i].y);
                } else {
                    console.error(`Invalid checkpoint at index ${i}:`, checkpoints[i]);
                }
            }
            this.ctx.stroke();
        } catch (error) {
            console.error("Error drawing track:", error);
        }

        // Draw direction arrows with additional error handling
        for (let i = 0; i < checkpoints.length - 1; i++) {
            const start = checkpoints[i];
            const end = checkpoints[i + 1];

            if (!start || !end || typeof start.x !== 'number' || typeof start.y !== 'number'
                || typeof end.x !== 'number' || typeof end.y !== 'number') {
                console.error(`Invalid checkpoint pair at index ${i}:`, { start, end });
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
                drawDirectionArrowLib(this.ctx, arrowX, arrowY, angle, scale);
            }
        }

        // Draw track edges
        this.ctx.strokeStyle = '#D1D1D1';
        this.ctx.lineWidth = 2 * scale;
        this.ctx.stroke();

        // Draw start/finish line
        const start = checkpoints[0];
        const flagWidth = 40 * scale;
        const flagHeight = 10 * scale;

        // Draw checkered pattern
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 2; j++) {
                this.ctx.fillStyle = (i + j) % 2 === 0 ? '#1A1A1A' : '#FFFFFF';
                this.ctx.fillRect(
                    start.x - flagWidth / 2 + (i * flagWidth / 8),
                    start.y - flagHeight + (j * flagHeight),
                    flagWidth / 8,
                    flagHeight
                );
            }
        }

        // Draw checkpoint markers in test mode
        if (track.isTestTrack && checkpoints.length >= 2) {
            const cpOpacity = parseFloat(localStorage.getItem('hotlapdaily_test_checkpoint_opacity') || '0.5');
            if (cpOpacity > 0) {
                const markerLen = trackWidth * 1.2;
                for (let i = 0; i < checkpoints.length; i++) {
                    const pt = checkpoints[i];
                    let angle;
                    if (i === 0 && checkpoints.length > 1) {
                        angle = Math.atan2(checkpoints[1].y - pt.y, checkpoints[1].x - pt.x);
                    } else if (i === checkpoints.length - 1 && checkpoints.length > 1) {
                        angle = Math.atan2(pt.y - checkpoints[i - 1].y, pt.x - checkpoints[i - 1].x);
                    } else {
                        const a1 = Math.atan2(pt.y - checkpoints[i - 1].y, pt.x - checkpoints[i - 1].x);
                        const a2 = Math.atan2(checkpoints[i + 1].y - pt.y, checkpoints[i + 1].x - pt.x);
                        angle = (a1 + a2) / 2;
                    }
                    const perp = angle + Math.PI / 2;
                    const half = markerLen / 2;
                    const x1 = pt.x + Math.cos(perp) * half;
                    const y1 = pt.y + Math.sin(perp) * half;
                    const x2 = pt.x - Math.cos(perp) * half;
                    const y2 = pt.y - Math.sin(perp) * half;

                    this.ctx.save();
                    // Translucent red line
                    this.ctx.strokeStyle = `rgba(255, 0, 0, ${cpOpacity * 0.6})`;
                    this.ctx.lineWidth = 3 * scale;
                    this.ctx.lineCap = 'round';
                    this.ctx.beginPath();
                    this.ctx.moveTo(x1, y1);
                    this.ctx.lineTo(x2, y2);
                    this.ctx.stroke();
                    // Translucent fill band
                    const fw = 4 * scale;
                    this.ctx.fillStyle = `rgba(255, 0, 0, ${cpOpacity * 0.15})`;
                    this.ctx.beginPath();
                    this.ctx.moveTo(x1 + Math.cos(angle) * fw, y1 + Math.sin(angle) * fw);
                    this.ctx.lineTo(x2 + Math.cos(angle) * fw, y2 + Math.sin(angle) * fw);
                    this.ctx.lineTo(x2 - Math.cos(angle) * fw, y2 - Math.sin(angle) * fw);
                    this.ctx.lineTo(x1 - Math.cos(angle) * fw, y1 - Math.sin(angle) * fw);
                    this.ctx.closePath();
                    this.ctx.fill();
                    // Label
                    if (cpOpacity > 0.3) {
                        this.ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(cpOpacity, 0.9)})`;
                        this.ctx.font = `bold ${10 * scale}px monospace`;
                        this.ctx.textAlign = 'center';
                        this.ctx.textBaseline = 'middle';
                        this.ctx.fillText(`${i + 1}`, pt.x + Math.cos(perp) * (half + 10 * scale), pt.y + Math.sin(perp) * (half + 10 * scale));
                    }
                    this.ctx.restore();
                }
            }
        }

        this.ctx.restore();
    }


    drawDirectionArrow(x, y, angle, scale) {
        // Delegate to lib implementation for consistency
        drawDirectionArrowLib(this.ctx, x, y, angle, scale);
    }

    drawGrid() {
        // Delegate to lib implementation for consistency
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        this.ctx.lineWidth = 1.2;

        for (let x = 0; x < this.canvas.width; x += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }

        for (let y = 0; y < this.canvas.height; y += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        // drawGridLib(this.ctx, this.canvas);
    }

    // Color helper methods remain the same
    darkenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.max(0, (num >> 16) - amt);
        const G = Math.max(0, (num >> 8 & 0x00FF) - amt);
        const B = Math.max(0, (num & 0x0000FF) - amt);
        return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
    }

    lightenColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = Math.min(255, (num >> 16) + amt);
        const G = Math.min(255, (num >> 8 & 0x00FF) + amt);
        const B = Math.min(255, (num & 0x0000FF) + amt);
        return '#' + (0x1000000 + (R << 16) + (G << 8) + B).toString(16).slice(1);
    }

    startGameLoop() {
        const gameLoop = (timestamp) => {
            this.update(timestamp);
            this.draw();
            requestAnimationFrame(gameLoop);
        };
        requestAnimationFrame(gameLoop);
    }

    resetForNextLap() {
        // Reset lap timing but keep the car where it is
        this.lapStarted = false;
        this.lapCompleted = false;
        this.currentCheckpoint = 0;
        this.gamePaused = false;
    }

    gameLoop() {
        // Clear the canvas
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Only update game physics if not paused
        if (!this.gamePaused) {
            // Handle car movement
            this.updateCar();

            // Lap completion is checked in update(); avoid double-checking here

            // Update lap timer if a lap is in progress
            if (this.lapStarted && !this.lapCompleted) {
                this.lapTime = Date.now() - this.lapStartTime;
            }
        }

        // Draw the track and car (we still draw even when paused)
        drawTrackLib(this.ctx, this.currentTrack.checkpoints, this.canvas);
        {
            const teamSelectEl = document.getElementById('teamSelect');
            const selectedTeam = teamSelectEl && teamSelectEl.value ? teamSelectEl.value : (this.lastSelectedTeam || 'ferrari');
            this.lastSelectedTeam = selectedTeam;
            const teamColor = selectedTeam && this.teamColors[selectedTeam] ? this.teamColors[selectedTeam] : this.teamColors.ferrari;
            drawPixelCarLib(
                this.ctx,
                this.carController.position.x,
                this.carController.position.y,
                this.carController.position.angle,
                teamColor,
                this.carController.scale
            );
        }
        this.drawHUD();

        // Continue the game loop
        requestAnimationFrame(() => this.gameLoop());
    }

    getRandomDriverName() {
        const options = [
            'Unnamed Champ',
            'Unnamed Racer',
            'Unnamed Titan',
            'Unnamed GOAT',
            'Mystery Driver',
            'Nameless Wonder',
            'Incognito Racer',
            'Phantom Pilot',
            'Stealth Racer'
        ];
        return options[Math.floor(Math.random() * options.length)];
    }

    initializeLeaderboardCollapse() {
        const collapseButton = document.getElementById('leaderboardCollapse');
        const leaderboard = document.querySelector('.in-game-leaderboard');
        let isCollapsed = false;

        if (collapseButton && leaderboard) {
            collapseButton.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();

                isCollapsed = !isCollapsed;

                if (isCollapsed) {
                    leaderboard.classList.add('collapsed');
                    collapseButton.title = 'Expand leaderboard';
                } else {
                    leaderboard.classList.remove('collapsed');
                    collapseButton.title = 'Collapse leaderboard';
                }
            });

            // Set initial tooltip
            collapseButton.title = 'Collapse leaderboard';
        }
    }

    initializeShareButton() { return initShareButtonLib(this); }

    initializeShareModal() { return initShareModalLib(this); }

    getTeamComplementaryColor(teamName) { return getTeamComplementaryColorLib(teamName, this.teamColors); }

    // Deprecated here; implemented within share lib
    drawFunkyQuad() { }

    async generateShareCard() { return generateShareCardLib(this); }


    closeShareModal() {
        this.shareModal.classList.remove('visible');
        setTimeout(() => {
            this.shareModal.style.display = 'none';
        }, 300); // Match the transition duration
    }

    initializeConstructorNames() {
        // Map of team IDs to display names for parameterized constructor names
        this.constructorDisplayNames = {
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


}

// Expose Game and a safe init on the window for SPA navigations
window.Game = Game;
window.__hotlapInitGame = function () {
    try {
        // Prevent double-initialization during SPA navigations or multiple onLoad calls
        if (window.__hotlapInitialized || window.__hotlapGameInstance || window.__hotlapInitInProgress) {
            return;
        }
        window.__hotlapInitInProgress = true;
        window.__hotlapGameInstance = new Game();
        window.__hotlapInitialized = true;
    } catch (e) {
        console.error('[Game] init error', e);
    } finally {
        try { window.__hotlapInitInProgress = false; } catch { }
    }
};

// Initialize game when page loads
window.addEventListener('load', () => {
    if (!window.__hotlapGameInstance && typeof window.__hotlapInitGame === 'function') {
        window.__hotlapInitGame();
    }
});
