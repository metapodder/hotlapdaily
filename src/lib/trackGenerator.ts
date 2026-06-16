/* eslint-disable */
// @ts-nocheck

// Extracted Track Generator module for client-side usage in Next.js
// Exports: TrackDesignValidator, TrackGenerator, initTrackGenerator

class TrackDesignValidator {
    constructor(trackWidth) {
        this.trackWidth = trackWidth;
        this.MIN_BOUNDARY_DISTANCE = trackWidth * 0.1;
    }
    validateTrackDesign(trackSegments) {
        const issues = [];
        for (let i = 0; i < trackSegments.length; i++) {
            for (let j = i + 3; j < trackSegments.length; j++) {
                const segment1 = trackSegments[i];
                const segment2 = trackSegments[j];
                if (this.areSegmentsAdjacent(i, j, trackSegments.length)) {
                    continue;
                }
                if (this.doSegmentsActuallyCross(segment1, segment2)) {
                    issues.push({
                        type: 'centerline_intersection',
                        segments: [i, j],
                        severity: 'error',
                        message: `Segments ${i+1} and ${j+1} intersect - creates shortcut`
                    });
                    continue;
                }
                const boundaryOverlap = this.checkBoundaryOverlap(segment1, segment2);
                if (boundaryOverlap.overlapping && boundaryOverlap.type === 'boundary_intersects_area') {
                    issues.push({
                        type: 'boundary_overlap',
                        segments: [i, j],
                        severity: 'error',
                        message: `Segments ${i+1} and ${j+1} track boundaries overlap significantly - creates shortcut`
                    });
                }
            }
        }
        const errorIssues = issues.filter(issue => issue.severity === 'error');
        const isValid = errorIssues.length === 0;
        let message = '';
        if (!isValid) {
            message = errorIssues[0].message;
            if (errorIssues.length > 1) {
                message += ` (and ${errorIssues.length - 1} more issue${errorIssues.length > 2 ? 's' : ''})`;
            }
        }
        return { isValid, message, issues };
    }
    areSegmentsAdjacent(i, j, totalSegments) {
        const diff = Math.abs(i - j);
        if (diff <= 2) return true;
        if (i === 0 && j >= totalSegments - 3) return true;
        if (j === 0 && i >= totalSegments - 3) return true;
        if (i === 1 && j >= totalSegments - 2) return true;
        if (j === 1 && i >= totalSegments - 2) return true;
        return false;
    }
    areAdjacent(i, j, totalSegments) {
        return Math.abs(i - j) === 1 || (i === 0 && j === totalSegments - 1) || (j === 0 && i === totalSegments - 1);
    }
    getAngleBetweenSegments(segment1, segment2) {
        const dir1 = { x: segment1.endX - segment1.startX, y: segment1.endY - segment1.startY };
        const dir2 = { x: segment2.endX - segment2.startX, y: segment2.endY - segment2.startY };
        const len1 = Math.sqrt(dir1.x * dir1.x + dir1.y * dir1.y);
        const len2 = Math.sqrt(dir2.x * dir2.x + dir2.y * dir2.y);
        if (len1 === 0 || len2 === 0) return 180;
        dir1.x /= len1; dir1.y /= len1; dir2.x /= len2; dir2.y /= len2;
        const dot = dir1.x * dir2.x + dir1.y * dir2.y;
        const angle = Math.acos(Math.max(-1, Math.min(1, dot))) * (180 / Math.PI);
        return angle;
    }
    checkBoundaryOverlap(segment1, segment2) {
        const bounds1 = this.getSegmentBoundaryLines(segment1);
        const bounds2 = this.getSegmentBoundaryLines(segment2);
        for (const boundaryLine1 of bounds1) {
            if (this.lineIntersectsSegmentArea(boundaryLine1, segment2)) {
                return { overlapping: true, type: 'boundary_intersects_area' };
            }
        }
        for (const boundaryLine2 of bounds2) {
            if (this.lineIntersectsSegmentArea(boundaryLine2, segment1)) {
                return { overlapping: true, type: 'boundary_intersects_area' };
            }
        }
        return { overlapping: false };
    }
    getSegmentBoundaryLines(segment) {
        const dx = segment.endX - segment.startX;
        const dy = segment.endY - segment.startY;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) return [];
        const perpX = -dy / len * (this.trackWidth / 2);
        const perpY = dx / len * (this.trackWidth / 2);
        const leftBoundary = { startX: segment.startX + perpX, startY: segment.startY + perpY, endX: segment.endX + perpX, endY: segment.endY + perpY };
        const rightBoundary = { startX: segment.startX - perpX, startY: segment.startY - perpY, endX: segment.endX - perpX, endY: segment.endY - perpY };
        return [leftBoundary, rightBoundary];
    }
    lineIntersectsSegmentArea(line, segment) {
        const segmentBounds = this.getSegmentBoundaryLines(segment);
        if (segmentBounds.length !== 2) return false;
        const corners = [
            { x: segmentBounds[0].startX, y: segmentBounds[0].startY },
            { x: segmentBounds[0].endX, y: segmentBounds[0].endY },
            { x: segmentBounds[1].endX, y: segmentBounds[1].endY },
            { x: segmentBounds[1].startX, y: segmentBounds[1].startY }
        ];
        for (let i = 0; i < corners.length; i++) {
            const edge = { startX: corners[i].x, startY: corners[i].y, endX: corners[(i + 1) % corners.length].x, endY: corners[(i + 1) % corners.length].y };
            if (this.doSegmentsActuallyCross(line, edge)) {
                return true;
            }
        }
        return this.isPointInTrackArea(line.startX, line.startY, corners) || this.isPointInTrackArea(line.endX, line.endY, corners);
    }
    isPointInTrackArea(x, y, corners) {
        let inside = false;
        for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
            if (((corners[i].y > y) !== (corners[j].y > y)) && (x < (corners[j].x - corners[i].x) * (y - corners[i].y) / (corners[j].y - corners[i].y) + corners[i].x)) {
                inside = !inside;
            }
        }
        return inside;
    }
    getMinDistanceBetweenSegments(seg1, seg2) {
        const distances = [
            this.pointToLineDistance(seg1.startX, seg1.startY, seg2),
            this.pointToLineDistance(seg1.endX, seg1.endY, seg2),
            this.pointToLineDistance(seg2.startX, seg2.startY, seg1),
            this.pointToLineDistance(seg2.endX, seg2.endY, seg1)
        ];
        return Math.min(...distances);
    }
    pointToLineDistance(px, py, line) {
        const A = px - line.startX;
        const B = py - line.startY;
        const C = line.endX - line.startX;
        const D = line.endY - line.startY;
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        if (lenSq === 0) return Math.sqrt(A * A + B * B);
        let param = dot / lenSq;
        param = Math.max(0, Math.min(1, param));
        const xx = line.startX + param * C;
        const yy = line.startY + param * D;
        const dx = px - xx;
        const dy = py - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    doSegmentsActuallyCross(segment1, segment2) {
        const p1 = { x: segment1.startX, y: segment1.startY };
        const p2 = { x: segment1.endX, y: segment1.endY };
        const p3 = { x: segment2.startX, y: segment2.startY };
        const p4 = { x: segment2.endX, y: segment2.endY };
        const d1 = this.crossProduct(p3, p4, p1);
        const d2 = this.crossProduct(p3, p4, p2);
        const d3 = this.crossProduct(p1, p2, p3);
        const d4 = this.crossProduct(p1, p2, p4);
        if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
            return true;
        }
        if (d1 === 0 && this.onSegment(p3, p1, p4)) return true;
        if (d2 === 0 && this.onSegment(p3, p2, p4)) return true;
        if (d3 === 0 && this.onSegment(p1, p3, p2)) return true;
        if (d4 === 0 && this.onSegment(p1, p4, p2)) return true;
        return false;
    }
    crossProduct(lineStart, lineEnd, point) {
        return (lineEnd.x - lineStart.x) * (point.y - lineStart.y) - (lineEnd.y - lineStart.y) * (point.x - lineStart.x);
    }
    onSegment(p, q, r) {
        return q.x <= Math.max(p.x, r.x) && q.x >= Math.min(p.x, r.x) && q.y <= Math.max(p.y, r.y) && q.y >= Math.min(p.y, r.y);
    }
}

class TrackGenerator {
    constructor() {
        this.trackPoints = [];
        this.trackSegments = [];
        this.drawingSegments = [];
        this.canvas = null;
        this.ctx = null;
        this.GAME_BASE_WIDTH = 320;
        this.GAME_BASE_HEIGHT = 280;
        this.isDrawing = false;
        this.drawingPoints = [];
        this.lastDrawPoint = null;
        this.drawingMode = true;
        this.minDrawDistance = 15;
        this.generatedCode = '';
        this.modal = null;
        this.modalSubmitBtn = null;
        this.closeBtn = null;
        this.nameInput = null;
        this.modalStatusMsg = null;
        this.startAngleInput = null;
        this.startingAngle = null; // null means auto-calculate, otherwise use manual value
        this.manualAngleSet = false; // Track if user has manually set the angle
        this.checkpointOpacity = 70; // 0-100 checkpoint marker visibility (default on)
        this.initializeCanvas();
        this.initializeModal();
        this.bindEvents();
        this.bindDrawingEvents();
        this.renderGridWithOffset();
    }
    initializeCanvas() {
        this.canvas = document.getElementById('trackCanvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        const aspectRatio = this.GAME_BASE_WIDTH / this.GAME_BASE_HEIGHT;
        this.canvas.width = 600;
        this.canvas.height = this.canvas.width / aspectRatio;
        this.GAME_OFFSET_Y = 0.12;
        this.visibleHeight = this.canvas.height * (1 - this.GAME_OFFSET_Y);
        this.canvas.style.cursor = 'crosshair';
    }
    initializeModal() {
        this.modal = document.getElementById('submitModal');
        if (!this.modal) return;
        this.modalSubmitBtn = document.getElementById('modalSubmitBtn');
        this.closeBtn = this.modal.querySelector('.close-btn');
        this.nameInput = document.getElementById('nameInput');
        this.modalStatusMsg = document.getElementById('modalStatusMsg');
        this.startAngleInput = document.getElementById('startAngleInput') as HTMLInputElement;
        const startAngleDisplay = document.getElementById('startAngleDisplay');
        if (this.startAngleInput) {
            this.startAngleInput.addEventListener('input', () => {
                this.updateStartingAngle();
                if (startAngleDisplay && this.startAngleInput) {
                    startAngleDisplay.textContent = `${this.startAngleInput.value}°`;
                }
            });
            this.startAngleInput.addEventListener('change', () => {
                this.updateStartingAngle();
                if (startAngleDisplay && this.startAngleInput) {
                    startAngleDisplay.textContent = `${this.startAngleInput.value}°`;
                }
            });
            // Initialize display
            if (startAngleDisplay) {
                startAngleDisplay.textContent = `${this.startAngleInput.value}°`;
            }
        }
        // Checkpoint visibility toggle
        const cpToggle = document.getElementById('checkpointToggle') as HTMLInputElement;
        if (cpToggle) {
            cpToggle.addEventListener('change', () => {
                this.checkpointOpacity = cpToggle.checked ? 70 : 0;
                this.renderTrack();
            });
        }
    }
    updateStartingAngle() {
        if (this.startAngleInput) {
            let angle = parseInt(this.startAngleInput.value) || 0;
            // Normalize 360 to 0 (they're the same)
            if (angle === 360) angle = 0;
            this.startingAngle = Math.max(0, Math.min(360, angle));
            this.startAngleInput.value = String(this.startingAngle);
            this.manualAngleSet = true; // Mark that user has manually set the angle
            // Update the first point's angle if track exists
            if (this.trackPoints.length > 0) {
                this.trackPoints[0].angle = this.startingAngle;
                // Also update the first segment's startPoint angle
                if (this.trackSegments.length > 0 && this.trackSegments[0].startPoint) {
                    this.trackSegments[0].startPoint.angle = this.startingAngle;
                }
                this.updatePointList();
                this.updateCodeOutput();
                this.renderTrack();
            }
        }
    }
    bindEvents() {
        const undoBtn = document.getElementById('undoBtn');
        const clearBtn = document.getElementById('clearBtn');
        const loadExampleBtn = document.getElementById('loadExampleBtn');
        const copyCodeBtn = document.getElementById('copyCodeBtn');
        const submitBtn = document.getElementById('submitBtn');
        const testTrackBtn = document.getElementById('testTrackBtn');
        if (undoBtn) undoBtn.addEventListener('click', () => this.undoLastPoint());
        if (clearBtn) clearBtn.addEventListener('click', () => this.clearAllPoints());
        if (loadExampleBtn) loadExampleBtn.addEventListener('click', () => this.loadExample());
        if (copyCodeBtn) copyCodeBtn.addEventListener('click', () => this.copyCode());
        if (submitBtn) submitBtn.addEventListener('click', () => this.openSubmitModal());
        if (testTrackBtn) testTrackBtn.addEventListener('click', () => this.testTrack());
        if (this.modal) {
            if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.closeSubmitModal());
            if (this.modalSubmitBtn) this.modalSubmitBtn.addEventListener('click', () => this.submitTrack());
            window.addEventListener('click', (event) => {
                if (event.target == this.modal) {
                    this.closeSubmitModal();
                }
            });
        }
    }
    bindDrawingEvents() {
        if (!this.canvas) return;
        this.canvas.addEventListener('mousedown', (e) => this.handleDrawStart(e));
        this.canvas.addEventListener('mousemove', (e) => this.handleDrawMove(e));
        this.canvas.addEventListener('mouseup', () => this.handleDrawEnd());
        this.canvas.addEventListener('mouseleave', () => this.handleDrawEnd());
        this.canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleDrawStart(this.createTouchEvent(touch));
        });
        this.canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            const touch = e.touches[0];
            this.handleDrawMove(this.createTouchEvent(touch));
        });
        this.canvas.addEventListener('touchend', (e) => {
            e.preventDefault();
            this.handleDrawEnd();
        });
        this.canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            this.handleDrawEnd();
        });
    }
    openSubmitModal() {
        if (this.modal) {
            this.modal.classList.add('show');
            const savedTrackName = localStorage.getItem('hotlapdaily_track_name');
            if (savedTrackName && this.nameInput) {
                this.nameInput.value = savedTrackName;
            }
            if (this.nameInput) this.nameInput.focus();
            if (this.modalStatusMsg) this.modalStatusMsg.textContent = '';
            if (this.modalStatusMsg) this.modalStatusMsg.className = '';
            if (this.modalSubmitBtn) this.modalSubmitBtn.disabled = false;
            if (this.modalSubmitBtn) this.modalSubmitBtn.textContent = 'Submit to Hotlap Daily';
        }
    }
    closeSubmitModal() {
        if (this.modal) {
            this.modal.classList.remove('show');
        }
    }
    createTouchEvent(touch) {
        return { clientX: touch.clientX, clientY: touch.clientY, preventDefault: () => {} };
    }
    getCanvasCoordinates(e) {
        const rect = this.canvas.getBoundingClientRect();
        const scaleX = this.canvas.width / rect.width;
        const scaleY = this.canvas.height / rect.height;
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;
        const offsetY = this.canvas.height * this.GAME_OFFSET_Y;
        const visibleHeight = this.canvas.height - offsetY;
        return { x: Math.max(0, Math.min(this.canvas.width, x)), y: Math.max(0, Math.min(visibleHeight, y)) };
    }
    undoLastPoint() {
        if (this.trackSegments.length > 0) {
            this.trackSegments.pop();
            this.rebuildTrackPointsFromSegments();
            this.updatePointList();
            this.updateCodeOutput();
            this.renderTrack();
            const statusMsg = document.getElementById('statusMsg');
            if (statusMsg) {
                if (this.trackSegments.length === 0) {
                    statusMsg.textContent = 'Last track segment removed. Canvas cleared.';
                    statusMsg.className = 'status-ready';
                } else {
                    statusMsg.textContent = `Track segment undone. ${this.trackSegments.length} segment${this.trackSegments.length > 1 ? 's' : ''} remaining.`;
                    statusMsg.className = 'status-ready';
                }
            }
        }
    }
    rebuildTrackPointsFromSegments() {
        this.trackPoints = [];
        if (this.trackSegments.length === 0) return;
        if (this.trackSegments[0] && this.trackSegments[0].startPoint) {
            const startPoint = { ...this.trackSegments[0].startPoint };
            // Preserve or set starting angle if manually set
            if (this.manualAngleSet && this.startingAngle !== undefined && this.startingAngle !== null) {
                // Normalize 360 to 0
                startPoint.angle = this.startingAngle === 360 ? 0 : this.startingAngle;
            }
            this.trackPoints.push(startPoint);
        }
        for (let segment of this.trackSegments) {
            if (segment.endPoint) {
                this.trackPoints.push(segment.endPoint);
            }
        }
    }
    clearAllPoints() {
        this.trackPoints = [];
        this.trackSegments = [];
        this.drawingSegments = [];
        this.generatedCode = '';
        this.startingAngle = null;
        this.manualAngleSet = false;
        if (this.startAngleInput) {
            this.startAngleInput.value = '0';
            const startAngleDisplay = document.getElementById('startAngleDisplay');
            if (startAngleDisplay) {
                startAngleDisplay.textContent = '0°';
            }
        }
        this.updatePointList();
        this.updateCodeOutput();
        this.renderGridWithOffset();
        const statusMsg = document.getElementById('statusMsg');
        if (statusMsg) {
            statusMsg.textContent = '';
            statusMsg.className = '';
        }
    }
    loadExample() {
        const examplePoints = [
            { x: 0.1, y: 0.85, angle: 0 },
            { x: 0.7, y: 0.85 },
            { x: 0.7, y: 0.65 },
            { x: 0.55, y: 0.55 },
            { x: 0.85, y: 0.35 },
            { x: 0.6, y: 0.2 },
            { x: 0.3, y: 0.2 },
            { x: 0.15, y: 0.4 },
            { x: 0.1, y: 0.65 },
            { x: 0.1, y: 0.85, angle: 0 }
        ];
        this.trackSegments = [];
        this.drawingSegments = [];
        for (let i = 0; i < examplePoints.length - 1; i++) {
            const segment = { startPoint: { ...examplePoints[i] }, endPoint: { ...examplePoints[i + 1] }, index: i };
            this.trackSegments.push(segment);
        }
        this.trackPoints = [...examplePoints];
        this.drawingSegments = [examplePoints];
        // Update starting angle input with example's angle
        if (this.startAngleInput && examplePoints[0].angle !== undefined) {
            this.startAngleInput.value = String(examplePoints[0].angle);
            this.startingAngle = examplePoints[0].angle;
            const startAngleDisplay = document.getElementById('startAngleDisplay');
            if (startAngleDisplay) {
                startAngleDisplay.textContent = `${examplePoints[0].angle}°`;
            }
        }
        this.updatePointList();
        this.updateCodeOutput();
        this.renderTrack();
    }
    updatePointList() {
        const pointList = document.getElementById('pointList');
        if (!pointList) return;
        if (this.trackPoints.length === 0) {
            pointList.innerHTML = '<div style="text-align: center; color: #999; font-style: italic;">No points added yet</div>';
            return;
        }
        pointList.innerHTML = '';
        this.trackPoints.forEach((point, index) => {
            const pointItem = document.createElement('div');
            pointItem.className = 'point-item';
            const coords = document.createElement('span');
            coords.className = 'point-coords';
            coords.textContent = `${index + 1}. (${point.x.toFixed(3)}, ${point.y.toFixed(3)})${point.angle ? `, ${point.angle}°` : ''}`;
            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-point';
            deleteBtn.textContent = '×';
            deleteBtn.onclick = () => this.deletePoint(index);
            pointItem.appendChild(coords);
            pointItem.appendChild(deleteBtn);
            pointList.appendChild(pointItem);
        });
    }
    deletePoint(index) {
        this.trackPoints.splice(index, 1);
        this.updatePointList();
        this.updateCodeOutput();
        this.renderTrack();
    }
    renderGrid() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const x = (i / 10) * this.canvas.width;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let i = 0; i <= 10; i++) {
            const y = (i / 10) * this.canvas.height;
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        // Get CSS variable values for dark mode compatibility
        const computedStyle = getComputedStyle(document.documentElement);
        const textColor = computedStyle.getPropertyValue('--text-primary').trim() || '#000000';
        const accentColor = computedStyle.getPropertyValue('--accent').trim() || '#000000';
        
        this.ctx.fillStyle = accentColor;
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width / 2, this.canvas.height / 2, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.fillStyle = textColor;
        this.ctx.font = '12px IBM Plex Mono';
        this.ctx.fillText('(0,0)', 5, 15);
        this.ctx.fillText('(1,1)', this.canvas.width - 35, this.canvas.height - 5);
        this.ctx.fillText('Center', this.canvas.width / 2 + 10, this.canvas.height / 2 - 10);
    }
    renderGridWithOffset() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        const offsetY = this.canvas.height * this.GAME_OFFSET_Y;
        const hiddenAreaTop = this.canvas.height - offsetY;
        this.ctx.fillStyle = 'rgba(200, 200, 200, 0.3)';
        this.ctx.fillRect(0, hiddenAreaTop, this.canvas.width, offsetY);
        this.ctx.strokeStyle = '#e0e0e0';
        this.ctx.lineWidth = 1;
        for (let i = 0; i <= 10; i++) {
            const x = (i / 10) * this.canvas.width;
            this.ctx.globalAlpha = 1.0;
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, hiddenAreaTop);
            this.ctx.stroke();
            this.ctx.globalAlpha = 0.3;
            this.ctx.beginPath();
            this.ctx.moveTo(x, hiddenAreaTop);
            this.ctx.lineTo(x, this.canvas.height);
            this.ctx.stroke();
        }
        for (let i = 0; i <= 10; i++) {
            const y = (i / 10) * this.canvas.height;
            if (y > hiddenAreaTop) {
                this.ctx.globalAlpha = 0.3;
            } else {
                this.ctx.globalAlpha = 1.0;
            }
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(this.canvas.width, y);
            this.ctx.stroke();
        }
        this.ctx.globalAlpha = 1.0;
        this.ctx.strokeStyle = '#007ACC';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, hiddenAreaTop);
        this.ctx.lineTo(this.canvas.width, hiddenAreaTop);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        const centerY = this.canvas.height / 2;
        // Get CSS variable values for dark mode compatibility
        const computedStyle = getComputedStyle(document.documentElement);
        const textColor = computedStyle.getPropertyValue('--text-primary').trim() || '#000000';
        const accentColor = computedStyle.getPropertyValue('--accent').trim() || '#000000';
        
        this.ctx.fillStyle = accentColor;
        this.ctx.beginPath();
        this.ctx.arc(this.canvas.width / 2, centerY, 3, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.fillStyle = textColor;
        this.ctx.font = '12px IBM Plex Mono';
        this.ctx.fillText('🎮 Game View', 5, 15);
        this.ctx.fillText('Hidden Area', 5, hiddenAreaTop + 15);
        this.ctx.fillText('Center', this.canvas.width / 2 + 10, centerY - 10);
    }
    getGameScale() {
        return Math.min(this.canvas.width, this.canvas.height) / 400;
    }
    getGameTrackWidth() {
        return 50 * this.getGameScale();
    }
    renderTrack() {
        if (this.trackPoints.length < 2) {
            this.renderGridWithOffset();
            this.updateValidationDisplay();
            return;
        }
        this.renderGridWithOffset();
        const scale = this.getGameScale();
        const gameWidth = this.GAME_BASE_WIDTH * scale;
        const gameHeight = this.GAME_BASE_HEIGHT * scale;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const offsetY = this.canvas.height * this.GAME_OFFSET_Y;
        const visibleHeight = this.canvas.height - offsetY;
        const x = centerX - gameWidth / 2;
        const y = centerY - gameHeight / 2;
        const gamePoints = this.trackPoints.map(point => ({ x: x + point.x * gameWidth, y: y + point.y * gameHeight, angle: point.angle }));
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.canvas.width, visibleHeight);
        this.ctx.clip();
        const trackWidth = this.getGameTrackWidth();
        this.renderGameStyleTrack(gamePoints, trackWidth, scale);
        this.ctx.restore();
        this.drawGameViewIndicator(visibleHeight);
    }
    renderGameStyleTrack(gamePoints, trackWidth, scale) {
        const validationResult = this.validateTrackDesign();
        const hasErrors = !validationResult.isValid;
        this.ctx.strokeStyle = hasErrors ? '#ffcccc' : '#E5E5E5';
        this.ctx.lineWidth = trackWidth;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        const gradient = this.ctx.createLinearGradient(0, 0, this.canvas.width, this.canvas.height);
        if (hasErrors) {
            gradient.addColorStop(0, '#ffcccc');
            gradient.addColorStop(1, '#ffe6e6');
        } else {
            gradient.addColorStop(0, '#E5E5E5');
            gradient.addColorStop(1, '#F0F0F0');
        }
        this.ctx.strokeStyle = gradient;
        this.ctx.beginPath();
        if (gamePoints.length > 0) {
            this.ctx.moveTo(gamePoints[0].x, gamePoints[0].y);
            for (let i = 1; i < gamePoints.length; i++) {
                this.ctx.lineTo(gamePoints[i].x, gamePoints[i].y);
            }
            const firstPoint = gamePoints[0];
            const lastPoint = gamePoints[gamePoints.length - 1];
            const distance = Math.hypot(firstPoint.x - lastPoint.x, firstPoint.y - lastPoint.y);
            if (distance <= 30) {
                this.ctx.closePath();
            }
        }
        this.ctx.stroke();
        if (hasErrors) {
            this.highlightOverlappingSegments(gamePoints, trackWidth);
        }
        this.ctx.strokeStyle = hasErrors ? '#ff9999' : '#D1D1D1';
        this.ctx.lineWidth = 2 * scale;
        this.ctx.stroke();
        this.drawGameElements(gamePoints, scale);
    }
    drawGameElements(gamePoints, scale) {
        this.drawGameStyleArrows(gamePoints, scale);
        if (this.checkpointOpacity > 0) {
            this.drawCheckpointMarkers(gamePoints, scale);
        }
        this.drawGameStyleCheckpoints(gamePoints);
        this.drawGameStyleStartFinish(gamePoints[0], scale);
        this.drawGapIndicator(gamePoints);
        if (gamePoints.length > 0 && gamePoints[0].angle !== undefined) {
            this.drawStartArrow(gamePoints[0].x, gamePoints[0].y, gamePoints[0].angle);
        }
        this.drawTrackLegend(this.getGameTrackWidth());
        this.updateValidationDisplay();
    }
    drawCheckpointMarkers(gamePoints, scale) {
        if (gamePoints.length < 2) return;
        const trackWidth = this.getGameTrackWidth();
        const markerLength = trackWidth * 1.2;
        const alpha = this.checkpointOpacity / 100;
        for (let i = 0; i < gamePoints.length; i++) {
            const point = gamePoints[i];
            // Calculate perpendicular angle from adjacent segments
            let angle;
            if (i === 0 && gamePoints.length > 1) {
                angle = Math.atan2(gamePoints[1].y - point.y, gamePoints[1].x - point.x);
            } else if (i === gamePoints.length - 1 && gamePoints.length > 1) {
                angle = Math.atan2(point.y - gamePoints[i - 1].y, point.x - gamePoints[i - 1].x);
            } else {
                // Average of incoming and outgoing segment angles
                const a1 = Math.atan2(point.y - gamePoints[i - 1].y, point.x - gamePoints[i - 1].x);
                const a2 = Math.atan2(gamePoints[i + 1].y - point.y, gamePoints[i + 1].x - point.x);
                angle = (a1 + a2) / 2;
            }
            // Perpendicular to the track direction
            const perpAngle = angle + Math.PI / 2;
            const halfLen = markerLength / 2;
            const x1 = point.x + Math.cos(perpAngle) * halfLen;
            const y1 = point.y + Math.sin(perpAngle) * halfLen;
            const x2 = point.x - Math.cos(perpAngle) * halfLen;
            const y2 = point.y - Math.sin(perpAngle) * halfLen;
            this.ctx.save();
            this.ctx.strokeStyle = `rgba(255, 0, 0, ${alpha * 0.6})`;
            this.ctx.fillStyle = `rgba(255, 0, 0, ${alpha * 0.15})`;
            this.ctx.lineWidth = 3 * scale;
            this.ctx.lineCap = 'round';
            // Draw the marker line
            this.ctx.beginPath();
            this.ctx.moveTo(x1, y1);
            this.ctx.lineTo(x2, y2);
            this.ctx.stroke();
            // Draw translucent fill area around the checkpoint
            const fillWidth = 4 * scale;
            const fx1a = x1 + Math.cos(angle) * fillWidth;
            const fy1a = y1 + Math.sin(angle) * fillWidth;
            const fx2a = x2 + Math.cos(angle) * fillWidth;
            const fy2a = y2 + Math.sin(angle) * fillWidth;
            const fx1b = x1 - Math.cos(angle) * fillWidth;
            const fy1b = y1 - Math.sin(angle) * fillWidth;
            const fx2b = x2 - Math.cos(angle) * fillWidth;
            const fy2b = y2 - Math.sin(angle) * fillWidth;
            this.ctx.beginPath();
            this.ctx.moveTo(fx1a, fy1a);
            this.ctx.lineTo(fx2a, fy2a);
            this.ctx.lineTo(fx2b, fy2b);
            this.ctx.lineTo(fx1b, fy1b);
            this.ctx.closePath();
            this.ctx.fill();
            // Draw checkpoint number on the marker
            if (alpha > 0.3) {
                this.ctx.fillStyle = `rgba(255, 0, 0, ${Math.min(alpha, 0.9)})`;
                this.ctx.font = `bold ${10 * scale}px IBM Plex Mono`;
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                const labelX = point.x + Math.cos(perpAngle) * (halfLen + 10 * scale);
                const labelY = point.y + Math.sin(perpAngle) * (halfLen + 10 * scale);
                this.ctx.fillText(`CP${i + 1}`, labelX, labelY);
                this.ctx.textAlign = 'left';
                this.ctx.textBaseline = 'alphabetic';
            }
            this.ctx.restore();
        }
    }
    drawGameStyleArrows(canvasPoints, scale) {
        for (let i = 0; i < canvasPoints.length - 1; i++) {
            const start = canvasPoints[i];
            const end = canvasPoints[i + 1];
            const angle = Math.atan2(end.y - start.y, end.x - start.x);
            const segmentLength = Math.hypot(end.x - start.x, end.y - start.y);
            const arrowSpacing = 80 * scale;
            const numArrows = Math.max(1, Math.floor(segmentLength / arrowSpacing));
            for (let j = 1; j <= numArrows; j++) {
                const t = j / (numArrows + 1);
                const arrowX = start.x + (end.x - start.x) * t;
                const arrowY = start.y + (end.y - start.y) * t;
                this.drawDirectionArrow(arrowX, arrowY, angle, scale);
            }
        }
    }
    drawGameStyleCheckpoints(canvasPoints) {
        canvasPoints.forEach((point, index) => {
            this.ctx.fillStyle = index === 0 ? '#00ff00' : (index === canvasPoints.length - 1 ? '#ff0000' : '#0066ff');
            this.ctx.beginPath();
            this.ctx.arc(point.x, point.y, 6, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.strokeStyle = '#ffffff';
            this.ctx.lineWidth = 2;
            this.ctx.stroke();
            // Get CSS variable values for dark mode compatibility
            const computedStyle = getComputedStyle(document.documentElement);
            const textColor = computedStyle.getPropertyValue('--text-primary').trim() || '#000000';
            const bgColor = computedStyle.getPropertyValue('--bg-primary').trim() || '#ffffff';
            
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 12px IBM Plex Mono';
            this.ctx.strokeStyle = bgColor;
            this.ctx.lineWidth = 3;
            this.ctx.strokeText((index + 1).toString(), point.x + 10, point.y + 4);
            this.ctx.fillText((index + 1).toString(), point.x + 10, point.y + 4);
        });
    }
    drawGameStyleStartFinish(startPoint, scale) {
        if (!startPoint) return;
        const flagWidth = 40 * scale;
        const flagHeight = 10 * scale;
        for (let i = 0; i < 8; i++) {
            for (let j = 0; j < 2; j++) {
                this.ctx.fillStyle = (i + j) % 2 === 0 ? '#1A1A1A' : '#FFFFFF';
                this.ctx.fillRect(startPoint.x - flagWidth/2 + (i * flagWidth/8), startPoint.y - flagHeight + (j * flagHeight), flagWidth/8, flagHeight);
            }
        }
    }
    drawDirectionArrow(x, y, angle, scale) {
        const arrowSize = 12 * scale;
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle);
        this.ctx.beginPath();
        this.ctx.moveTo(-arrowSize/2, -arrowSize/4);
        this.ctx.lineTo(arrowSize/2, 0);
        this.ctx.lineTo(-arrowSize/2, arrowSize/4);
        this.ctx.fillStyle = 'rgba(26, 26, 26, 0.2)';
        this.ctx.fill();
        this.ctx.restore();
    }
    drawGapIndicator(gamePoints) {
        if (gamePoints.length < 3) return;
        const firstPoint = gamePoints[0];
        const lastPoint = gamePoints[gamePoints.length - 1];
        const distance = Math.hypot(firstPoint.x - lastPoint.x, firstPoint.y - lastPoint.y);
        if (distance > 30) {
            this.ctx.setLineDash([10, 10]);
            this.ctx.strokeStyle = '#ff6666';
            this.ctx.lineWidth = 3;
            this.ctx.beginPath();
            this.ctx.moveTo(lastPoint.x, lastPoint.y);
            this.ctx.lineTo(firstPoint.x, firstPoint.y);
            this.ctx.stroke();
            this.ctx.setLineDash([]);
            const midX = (firstPoint.x + lastPoint.x) / 2;
            const midY = (firstPoint.y + lastPoint.y) / 2;
            // Get CSS variable values for dark mode compatibility
            const computedStyle = getComputedStyle(document.documentElement);
            const textColor = computedStyle.getPropertyValue('--text-primary').trim() || '#000000';
            
            this.ctx.fillStyle = textColor;
            this.ctx.font = 'bold 14px IBM Plex Mono';
            this.ctx.textAlign = 'center';
            this.ctx.fillText('CLOSE LOOP', midX, midY - 5);
            this.ctx.textAlign = 'left';
        }
    }
    renderTrackOnly() {
        if (this.trackPoints.length === 0) return;
        const scale = this.getGameScale();
        const gameWidth = this.GAME_BASE_WIDTH * scale;
        const gameHeight = this.GAME_BASE_HEIGHT * scale;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const x = centerX - gameWidth / 2;
        const y = centerY - gameHeight / 2;
        const offsetY = this.canvas.height * this.GAME_OFFSET_Y;
        const visibleHeight = this.canvas.height - offsetY;
        const gamePoints = this.trackPoints.map(point => ({ x: x + point.x * gameWidth, y: y + point.y * gameHeight, angle: point.angle }));
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.canvas.width, visibleHeight);
        this.ctx.clip();
        const trackWidth = this.getGameTrackWidth();
        this.renderGameStyleTrack(gamePoints, trackWidth, scale);
        this.ctx.restore();
    }
    renderWithCurrentDrawing() {
        this.renderGridWithOffset();
        this.renderTrackOnly();
        if (this.isDrawing && this.drawingPoints.length > 0) {
            this.renderCurrentDrawingStroke();
        }
    }
    renderCurrentDrawingStroke() {
        if (this.drawingPoints.length < 2) return;
        const offsetY = this.canvas.height * this.GAME_OFFSET_Y;
        const visibleHeight = this.canvas.height - offsetY;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.canvas.width, visibleHeight);
        this.ctx.clip();
        this.ctx.strokeStyle = '#007ACC';
        this.ctx.lineWidth = 4;
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.ctx.beginPath();
        this.ctx.moveTo(this.drawingPoints[0].x, this.drawingPoints[0].y);
        for (let i = 1; i < this.drawingPoints.length; i++) {
            this.ctx.lineTo(this.drawingPoints[i].x, this.drawingPoints[i].y);
        }
        this.ctx.stroke();
        if (this.drawingPoints.length > 0) {
            this.ctx.fillStyle = '#00ff00';
            this.ctx.beginPath();
            this.ctx.arc(this.drawingPoints[0].x, this.drawingPoints[0].y, 4, 0, 2 * Math.PI);
            this.ctx.fill();
        }
        this.ctx.restore();
    }
    updateCodeOutput() {
        const codeElem = document.getElementById('codeOutput');
        if (this.trackPoints.length === 0) {
            if (codeElem) codeElem.value = '';
            this.generatedCode = '';
            this.updateValidationDisplay();
            this.updateSubmitButton();
            return;
        }
        let code = `function generateCustomTrack(scale, centerX, centerY) {\n    // Custom track generated with Track Generator\n    // WYSIWYG: Coordinates match exactly what you see in the generator\n    const width = 320 * scale;\n    const height = 280 * scale;\n    const x = centerX - width/2;\n    const y = centerY - height/2;\n    \n    return [`;
        this.trackPoints.forEach((point, index) => {
            const comment = index === 0 ? ' // Start/Finish' : index === this.trackPoints.length - 1 ? ' // Back to Start' : ` // Checkpoint ${index + 1}`;
            if (point.angle !== undefined) {
                code += `\n        { x: x + ${point.x.toFixed(3)} * width, y: y + ${point.y.toFixed(3)} * height, angle: ${point.angle} },${comment}`;
            } else {
                code += `\n        { x: x + ${point.x.toFixed(3)} * width, y: y + ${point.y.toFixed(3)} * height },${comment}`;
            }
        });
        code += `\n    ];\n}`;
        if (codeElem) codeElem.value = code;
        this.generatedCode = code;
        this.updateValidationDisplay();
        this.updateSubmitButton();
    }
    handleDrawStart(e) {
        if (!this.drawingMode) return;
        this.isDrawing = true;
        this.drawingPoints = [];
        const coords = this.getCanvasCoordinates(e);
        this.drawingPoints.push(coords);
        this.lastDrawPoint = coords;
        this.updatePointList();
        this.updateCodeOutput();
        this.renderWithCurrentDrawing();
        const offsetY = this.canvas.height * this.GAME_OFFSET_Y;
        const visibleHeight = this.canvas.height - offsetY;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(0, 0, this.canvas.width, visibleHeight);
        this.ctx.clip();
        this.ctx.fillStyle = '#00ff00';
        this.ctx.beginPath();
        this.ctx.arc(coords.x, coords.y, 4, 0, 2 * Math.PI);
        this.ctx.fill();
        this.ctx.restore();
        this.drawGameViewIndicator(visibleHeight);
    }
    handleDrawMove(e) {
        if (!this.drawingMode || !this.isDrawing) return;
        const coords = this.getCanvasCoordinates(e);
        if (this.lastDrawPoint) {
            const distance = Math.hypot(coords.x - this.lastDrawPoint.x, coords.y - this.lastDrawPoint.y);
            if (distance < this.minDrawDistance) {
                return;
            }
        }
        this.drawingPoints.push(coords);
        this.lastDrawPoint = coords;
        this.renderWithCurrentDrawing();
    }
    handleDrawEnd() {
        if (!this.drawingMode || !this.isDrawing) return;
        this.isDrawing = false;
        if (this.drawingPoints.length < 2) {
            this.renderGridWithOffset();
            return;
        }
        const segmentCountBefore = this.trackSegments.length;
        this.convertDrawingToTrack();
        this.drawingPoints = [];
        this.lastDrawPoint = null;
        this.updatePointList();
        this.updateCodeOutput();
        this.renderTrack();
        const statusMsg = document.getElementById('statusMsg');
        if (statusMsg) {
            const newSegments = this.trackSegments.length - segmentCountBefore;
            statusMsg.textContent = `${newSegments} track segment${newSegments > 1 ? 's' : ''} added. Total: ${this.trackSegments.length} segments.`;
            statusMsg.className = 'status-success';
        }
    }
    updateSubmitButton() {
        const submitBtn = document.getElementById('submitBtn');
        const testTrackBtn = document.getElementById('testTrackBtn');
        const statusMsg = document.getElementById('statusMsg');
        if (!submitBtn || !statusMsg) return;
        if (this.trackPoints.length === 0) {
            submitBtn.style.display = 'none';
            if (testTrackBtn) testTrackBtn.style.display = 'none';
            statusMsg.textContent = '';
            statusMsg.className = '';
            return;
        }
        const validationResult = this.validateTrackDesign();
        if (!validationResult.isValid) {
            submitBtn.style.display = 'none';
            if (testTrackBtn) testTrackBtn.style.display = 'none';
            statusMsg.textContent = '';
            statusMsg.className = '';
        } else {
            submitBtn.style.display = 'inline-block';
            if (testTrackBtn) testTrackBtn.style.display = 'inline-block';
            statusMsg.textContent = '🏁 Track is ready to submit';
            statusMsg.className = 'status-ready';
        }
    }
    testTrack() {
        if (this.trackPoints.length === 0) {
            return;
        }
        const validationResult = this.validateTrackDesign();
        if (!validationResult.isValid) {
            return;
        }
        try {
            // Save test track code to localStorage
            localStorage.setItem('hotlapdaily_test_track_code', this.generatedCode);
            localStorage.setItem('hotlapdaily_test_mode', 'true');
            // Redirect to home page with testMode URL parameter
            window.location.href = '/?testMode=true';
        } catch (error) {
            console.error('Error saving test track:', error);
            const statusMsg = document.getElementById('statusMsg');
            if (statusMsg) {
                statusMsg.textContent = '⚠️ Error saving test track. Please try again.';
                statusMsg.className = 'status-error';
            }
        }
    }
    async submitTrack() {
        const name = this.nameInput ? this.nameInput.value.trim() : '';
        if (!name) {
            this.modalStatusMsg.textContent = '⚠️ Please enter your name.';
            this.modalStatusMsg.className = 'status-error';
            return;
        }
        const submitBtn = this.modalSubmitBtn;
        const statusMsg = this.modalStatusMsg;
        submitBtn.disabled = true;
        submitBtn.textContent = 'Submitting...';
        statusMsg.textContent = '⏳ Submitting track...';
        statusMsg.className = 'status-loading';
        try {
            const response = await fetch(`/api/submit-track`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, code: this.generatedCode })
            });
            if (response.ok) {
                statusMsg.textContent = '🎉 Track submitted successfully!';
                statusMsg.className = 'status-success';
                if (name) {
                    localStorage.setItem('hotlapdaily_track_name', name);
                }
                setTimeout(() => {
                    this.closeSubmitModal();
                    this.clearAllPoints();
                }, 2000);
            } else {
                const errorText = await response.text();
                console.error('Submission failed:', errorText);
                statusMsg.textContent = '⚠️ Submission failed. Please try again.';
                statusMsg.className = 'status-error';
                submitBtn.textContent = 'Retry Submission';
                submitBtn.disabled = false;
            }
        } catch (error) {
            console.error('Submission error:', error);
            statusMsg.textContent = '⚠️ Network error. Please check your connection and try again.';
            statusMsg.className = 'status-error';
            submitBtn.textContent = 'Retry Submission';
            submitBtn.disabled = false;
        }
    }
    renderDrawingPath() {
        this.renderWithCurrentDrawing();
    }
    drawGameViewIndicator(visibleHeight) {
        this.ctx.strokeStyle = 'rgba(0, 122, 204, 0.8)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 5]);
        this.ctx.beginPath();
        this.ctx.moveTo(0, visibleHeight);
        this.ctx.lineTo(this.canvas.width, visibleHeight);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
        // Get CSS variable values for dark mode compatibility
        const computedStyle = getComputedStyle(document.documentElement);
        const textColor = computedStyle.getPropertyValue('--text-primary').trim() || '#000000';
        const textColorWithOpacity = textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.6)' : 'rgba(0, 0, 0, 0.6)';
        const textColorWithOpacityLight = textColor === '#ffffff' ? 'rgba(255, 255, 255, 0.4)' : 'rgba(0, 0, 0, 0.4)';
        
        this.ctx.fillStyle = textColorWithOpacity;
        this.ctx.font = 'bold 14px IBM Plex Mono';
        this.ctx.fillText('🎮 GAME VIEW AREA', 10, visibleHeight - 10);
        this.ctx.fillStyle = textColorWithOpacityLight;
        this.ctx.font = '12px IBM Plex Mono';
        this.ctx.fillText('Hidden in game (12% bottom cutoff)', 10, visibleHeight + 25);
    }
    drawStartArrow(x, y, angle) {
        const arrowSize = 20;
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.rotate(angle * Math.PI / 180);
        this.ctx.beginPath();
        this.ctx.moveTo(-arrowSize, -arrowSize/2);
        this.ctx.lineTo(arrowSize, 0);
        this.ctx.lineTo(-arrowSize, arrowSize/2);
        this.ctx.closePath();
        this.ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        this.ctx.fill();
        this.ctx.strokeStyle = '#ffffff';
        this.ctx.lineWidth = 2;
        this.ctx.stroke();
        this.ctx.restore();
    }
    drawTrackLegend(trackWidth) {
        const legendX = this.canvas.width - 120;
        const legendY = this.canvas.height - 60;
        // Get CSS variable values for dark mode compatibility
        const computedStyle = getComputedStyle(document.documentElement);
        const bgColor = computedStyle.getPropertyValue('--bg-primary').trim() || '#ffffff';
        const textColor = computedStyle.getPropertyValue('--text-primary').trim() || '#000000';
        const borderColor = computedStyle.getPropertyValue('--border').trim() || '#000000';
        
        this.ctx.fillStyle = bgColor + 'E6'; // Add 90% opacity
        this.ctx.fillRect(legendX, legendY, 115, 55);
        this.ctx.strokeStyle = borderColor;
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(legendX, legendY, 115, 55);
        this.ctx.fillStyle = textColor;
        this.ctx.font = '10px IBM Plex Mono';
        this.ctx.fillText('Track Width:', legendX + 5, legendY + 15);
        this.ctx.fillText(`${Math.round(trackWidth)}px`, legendX + 70, legendY + 15);
        this.ctx.fillText('Scale:', legendX + 5, legendY + 30);
        this.ctx.fillText(`${this.getGameScale().toFixed(2)}x`, legendX + 70, legendY + 30);
        this.ctx.fillText('WYSIWYG Mode', legendX + 5, legendY + 45);
    }
    convertDrawingToTrack() {
        if (this.drawingPoints.length < 2) return;
        const scale = this.getGameScale();
        const gameWidth = this.GAME_BASE_WIDTH * scale;
        const gameHeight = this.GAME_BASE_HEIGHT * scale;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const x = centerX - gameWidth / 2;
        const y = centerY - gameHeight / 2;
        const relativePoints = this.drawingPoints.map(point => ({ x: Math.round(((point.x - x) / gameWidth) * 1000) / 1000, y: Math.round(((point.y - y) / gameHeight) * 1000) / 1000 }));
        const simplifiedPoints = this.douglasPeucker(relativePoints, 0.02);
        if (simplifiedPoints.length < 3) {
            while (simplifiedPoints.length < 3 && simplifiedPoints.length < relativePoints.length) {
                const midIndex = Math.floor(relativePoints.length / (4 - simplifiedPoints.length));
                if (midIndex < relativePoints.length) {
                    simplifiedPoints.splice(1, 0, relativePoints[midIndex]);
                }
            }
        }
        // Use manually set starting angle if user has set it, otherwise calculate from first two points
        if (this.manualAngleSet && this.startingAngle !== null && this.startingAngle !== undefined) {
            // Normalize 360 to 0
            const normalizedAngle = this.startingAngle === 360 ? 0 : this.startingAngle;
            simplifiedPoints[0].angle = Math.round(normalizedAngle);
        } else if (simplifiedPoints.length > 1) {
            const dx = simplifiedPoints[1].x - simplifiedPoints[0].x;
            const dy = simplifiedPoints[1].y - simplifiedPoints[0].y;
            let angle = Math.atan2(dy, dx) * 180 / Math.PI;
            if (angle < 0) angle += 360;
            // Normalize 360 to 0, and round to nearest integer
            angle = Math.round(angle);
            if (angle === 360) angle = 0;
            simplifiedPoints[0].angle = angle;
            // Update the input field with calculated angle (but don't mark as manual)
            if (this.startAngleInput) {
                this.startAngleInput.value = String(angle);
                this.startingAngle = angle;
                const startAngleDisplay = document.getElementById('startAngleDisplay');
                if (startAngleDisplay) {
                    startAngleDisplay.textContent = `${angle}°`;
                }
            }
        }
        for (let i = 0; i < simplifiedPoints.length - 1; i++) {
            const segment = { startPoint: { ...simplifiedPoints[i] }, endPoint: { ...simplifiedPoints[i + 1] }, index: this.trackSegments.length };
            this.trackSegments.push(segment);
        }
        this.drawingSegments.push(simplifiedPoints);
        this.rebuildTrackPointsFromSegments();
        // Update starting angle input if angle was calculated
        if (this.trackPoints.length > 0 && this.trackPoints[0].angle !== undefined && this.startAngleInput) {
            this.startAngleInput.value = String(this.trackPoints[0].angle);
            this.startingAngle = this.trackPoints[0].angle;
            const startAngleDisplay = document.getElementById('startAngleDisplay');
            if (startAngleDisplay) {
                startAngleDisplay.textContent = `${this.trackPoints[0].angle}°`;
            }
        }
    }
    douglasPeucker(points, epsilon) {
        if (points.length <= 2) return points;
        let maxDistance = 0;
        let maxIndex = 0;
        const startPoint = points[0];
        const endPoint = points[points.length - 1];
        for (let i = 1; i < points.length - 1; i++) {
            const distance = this.perpendicularDistance(points[i], startPoint, endPoint);
            if (distance > maxDistance) {
                maxDistance = distance;
                maxIndex = i;
            }
        }
        if (maxDistance > epsilon) {
            const leftSegment = this.douglasPeucker(points.slice(0, maxIndex + 1), epsilon);
            const rightSegment = this.douglasPeucker(points.slice(maxIndex), epsilon);
            return leftSegment.slice(0, -1).concat(rightSegment);
        } else {
            return [startPoint, endPoint];
        }
    }
    perpendicularDistance(point, lineStart, lineEnd) {
        const dx = lineEnd.x - lineStart.x;
        const dy = lineEnd.y - lineStart.y;
        if (dx === 0 && dy === 0) {
            return Math.hypot(point.x - lineStart.x, point.y - lineStart.y);
        }
        const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);
        const clampedT = Math.max(0, Math.min(1, t));
        const closestPoint = { x: lineStart.x + clampedT * dx, y: lineStart.y + clampedT * dy };
        return Math.hypot(point.x - closestPoint.x, point.y - closestPoint.y);
    }
    copyCode() {
        const codeOutput = document.getElementById('codeOutput');
        if (!codeOutput || codeOutput.value.trim() === '') {
            alert('No code to copy. Add some track points first!');
            return;
        }
        const validationResult = this.validateTrackDesign();
        if (!validationResult.isValid) {
            alert('Track Design Error: ' + validationResult.message);
            return;
        }
        codeOutput.select();
        codeOutput.setSelectionRange(0, 99999);
        try {
            document.execCommand('copy');
            alert('Code copied to clipboard!');
        } catch (err) {
            navigator.clipboard.writeText(codeOutput.value).then(() => {
                alert('Code copied to clipboard!');
            }).catch(() => {
                alert('Failed to copy code. Please select and copy manually.');
            });
        }
    }
    validateTrackDesign() {
        if (this.trackPoints.length < 3) {
            return { isValid: true, message: '', issues: [] };
        }
        const scale = this.getGameScale();
        const gameWidth = this.GAME_BASE_WIDTH * scale;
        const gameHeight = this.GAME_BASE_HEIGHT * scale;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const x = centerX - gameWidth / 2;
        const y = centerY - gameHeight / 2;
        const firstPoint = this.trackPoints[0];
        const lastPoint = this.trackPoints[this.trackPoints.length - 1];
        const firstGamePoint = { x: x + firstPoint.x * gameWidth, y: y + firstPoint.y * gameHeight };
        const lastGamePoint = { x: x + lastPoint.x * gameWidth, y: y + lastPoint.y * gameHeight };
        const distance = Math.hypot(firstGamePoint.x - lastGamePoint.x, firstGamePoint.y - lastGamePoint.y);
        if (distance > 30) {
            return {
                isValid: false,
                message: 'Track must be a closed loop - connect the end point to the start',
                issues: [{ type: 'open_track', severity: 'error', message: 'Track is not closed - end point must connect to start point' }]
            };
        }
        const validator = new TrackDesignValidator(this.getGameTrackWidth());
        const segments = this.createTrackSegments();
        return validator.validateTrackDesign(segments);
    }
    createTrackSegments() {
        const scale = this.getGameScale();
        const gameWidth = this.GAME_BASE_WIDTH * scale;
        const gameHeight = this.GAME_BASE_HEIGHT * scale;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;
        const x = centerX - gameWidth / 2;
        const y = centerY - gameHeight / 2;
        const segments = [];
        for (let i = 0; i < this.trackPoints.length - 1; i++) {
            const start = this.trackPoints[i];
            const end = this.trackPoints[i + 1];
            segments.push({ startX: x + start.x * gameWidth, startY: y + start.y * gameHeight, endX: x + end.x * gameWidth, endY: y + end.y * gameHeight, index: i });
        }
        return segments;
    }
    highlightOverlappingSegments(gamePoints, trackWidth) {
        if (gamePoints.length < 3) return;
        const validationResult = this.validateTrackDesign();
        if (validationResult.isValid) return;
        const segments = [];
        for (let i = 0; i < gamePoints.length - 1; i++) {
            segments.push({ start: gamePoints[i], end: gamePoints[i + 1], index: i });
        }
        const problemSegments = new Set();
        validationResult.issues.forEach(issue => {
            if (issue.segments) {
                issue.segments.forEach(segmentIndex => { problemSegments.add(segmentIndex); });
            }
        });
        this.ctx.strokeStyle = '#ff0000';
        this.ctx.lineWidth = 8;
        this.ctx.lineCap = 'round';
        this.ctx.globalAlpha = 0.7;
        problemSegments.forEach(segmentIndex => {
            if (segmentIndex < segments.length) {
                const segment = segments[segmentIndex];
                this.ctx.beginPath();
                this.ctx.moveTo(segment.start.x, segment.start.y);
                this.ctx.lineTo(segment.end.x, segment.end.y);
                this.ctx.stroke();
            }
        });
        this.ctx.globalAlpha = 1.0;
    }
    updateValidationDisplay() {
        const validationResult = this.validateTrackDesign();
        const copyBtn = document.getElementById('copyCodeBtn');
        const codeOutput = document.getElementById('codeOutput');
        let errorDisplay = document.getElementById('trackErrorDisplay');
        if (!errorDisplay) {
            errorDisplay = document.createElement('div');
            errorDisplay.id = 'trackErrorDisplay';
            errorDisplay.style.cssText = `\n                margin-top: 10px;\n                padding: 10px;\n                border-radius: 4px;\n                font-size: 0.9rem;\n                font-weight: 500;\n            `;
            if (copyBtn && codeOutput) {
                codeOutput.parentNode.insertBefore(errorDisplay, copyBtn);
            }
        }
        if (!validationResult.isValid) {
            errorDisplay.style.display = 'block';
            errorDisplay.style.backgroundColor = '#ffe6e6';
            errorDisplay.style.border = '1px solid #ff9999';
            errorDisplay.style.color = '#cc0000';
            let errorHtml = `<strong>⚠️ Track Design Issues:</strong><br>`;
            errorHtml += validationResult.message;
            if (validationResult.issues && validationResult.issues.length > 1) {
                errorHtml += `<br><br><strong>All Issues:</strong><ul style="margin: 5px 0; padding-left: 20px;">`;
                validationResult.issues.forEach((issue, index) => {
                    if (issue.severity === 'error') {
                        errorHtml += `<li style="margin: 2px 0;">${issue.message}</li>`;
                    }
                });
                errorHtml += `</ul>`;
            }
            errorHtml += `<br><br><strong>Design Tips:</strong><ul style="margin: 5px 0; padding-left: 20px">\n                <li>✅ Complete your loop by connecting the end to the start</li>\n                <li>✅ Tracks can get close - only actual crossovers are blocked</li>\n                <li>✅ Sharp corners are allowed</li>\n                <li>❌ Only segments that cross through each other are flagged</li>\n            </ul>`;
            errorHtml += `<br><small style="color: #888;">💡 Problem segments are highlighted in red on the track.</small>`;
            errorDisplay.innerHTML = errorHtml;
            if (copyBtn) {
                copyBtn.style.backgroundColor = '#dc3545';
                copyBtn.style.borderColor = '#dc3545';
                copyBtn.style.color = '#ffffff';
                copyBtn.textContent = 'Fix errors before copying';
                copyBtn.disabled = false;
            }
        } else {
            errorDisplay.style.display = 'none';
            if (copyBtn) {
                copyBtn.style.backgroundColor = '';
                copyBtn.style.borderColor = '';
                copyBtn.style.color = '';
                copyBtn.textContent = 'Copy to Clipboard';
            }
        }
        this.updateSubmitButton();
    }
}

export { TrackDesignValidator, TrackGenerator };

export function initTrackGenerator() {
    if (typeof window === 'undefined') return null;
    const existing = (window as any).__trackGeneratorInstance;
    if (existing && existing.canvas && document.body.contains(existing.canvas)) {
        return existing;
    }
    if (document.getElementById('trackCanvas')) {
        const instance = new TrackGenerator();
        (window as any).__trackGeneratorInstance = instance;
        return instance;
    }
    return null;
}


