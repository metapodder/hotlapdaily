/**
 * Server-side validation for submitted track code strings.
 * Ensures tracks are playable, safe, and well-formed before being assigned to a trackId.
 */

// --- Geometry helpers (extracted from TrackDesignValidator in trackGenerator.ts) ---

function crossProduct(
  lineStart: { x: number; y: number },
  lineEnd: { x: number; y: number },
  point: { x: number; y: number }
): number {
  return (
    (lineEnd.x - lineStart.x) * (point.y - lineStart.y) -
    (lineEnd.y - lineStart.y) * (point.x - lineStart.x)
  );
}

function onSegment(
  p: { x: number; y: number },
  q: { x: number; y: number },
  r: { x: number; y: number }
): boolean {
  return (
    q.x <= Math.max(p.x, r.x) &&
    q.x >= Math.min(p.x, r.x) &&
    q.y <= Math.max(p.y, r.y) &&
    q.y >= Math.min(p.y, r.y)
  );
}

interface Segment {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
}

function doSegmentsActuallyCross(segment1: Segment, segment2: Segment): boolean {
  const p1 = { x: segment1.startX, y: segment1.startY };
  const p2 = { x: segment1.endX, y: segment1.endY };
  const p3 = { x: segment2.startX, y: segment2.startY };
  const p4 = { x: segment2.endX, y: segment2.endY };
  const d1 = crossProduct(p3, p4, p1);
  const d2 = crossProduct(p3, p4, p2);
  const d3 = crossProduct(p1, p2, p3);
  const d4 = crossProduct(p1, p2, p4);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  if (d1 === 0 && onSegment(p3, p1, p4)) return true;
  if (d2 === 0 && onSegment(p3, p2, p4)) return true;
  if (d3 === 0 && onSegment(p1, p3, p2)) return true;
  if (d4 === 0 && onSegment(p1, p4, p2)) return true;
  return false;
}

function getSegmentBoundaryLines(segment: Segment, trackWidth: number): Segment[] {
  const dx = segment.endX - segment.startX;
  const dy = segment.endY - segment.startY;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len === 0) return [];
  const perpX = (-dy / len) * (trackWidth / 2);
  const perpY = (dx / len) * (trackWidth / 2);
  return [
    { startX: segment.startX + perpX, startY: segment.startY + perpY, endX: segment.endX + perpX, endY: segment.endY + perpY },
    { startX: segment.startX - perpX, startY: segment.startY - perpY, endX: segment.endX - perpX, endY: segment.endY - perpY },
  ];
}

function isPointInTrackArea(x: number, y: number, corners: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    if (
      corners[i].y > y !== corners[j].y > y &&
      x < ((corners[j].x - corners[i].x) * (y - corners[i].y)) / (corners[j].y - corners[i].y) + corners[i].x
    ) {
      inside = !inside;
    }
  }
  return inside;
}

function lineIntersectsSegmentArea(line: Segment, segment: Segment, trackWidth: number): boolean {
  const segmentBounds = getSegmentBoundaryLines(segment, trackWidth);
  if (segmentBounds.length !== 2) return false;
  const corners = [
    { x: segmentBounds[0].startX, y: segmentBounds[0].startY },
    { x: segmentBounds[0].endX, y: segmentBounds[0].endY },
    { x: segmentBounds[1].endX, y: segmentBounds[1].endY },
    { x: segmentBounds[1].startX, y: segmentBounds[1].startY },
  ];
  for (let i = 0; i < corners.length; i++) {
    const edge: Segment = {
      startX: corners[i].x,
      startY: corners[i].y,
      endX: corners[(i + 1) % corners.length].x,
      endY: corners[(i + 1) % corners.length].y,
    };
    if (doSegmentsActuallyCross(line, edge)) {
      return true;
    }
  }
  return isPointInTrackArea(line.startX, line.startY, corners) || isPointInTrackArea(line.endX, line.endY, corners);
}

function checkBoundaryOverlap(segment1: Segment, segment2: Segment, trackWidth: number): { overlapping: boolean; type?: string } {
  const bounds1 = getSegmentBoundaryLines(segment1, trackWidth);
  const bounds2 = getSegmentBoundaryLines(segment2, trackWidth);
  for (const boundaryLine1 of bounds1) {
    if (lineIntersectsSegmentArea(boundaryLine1, segment2, trackWidth)) {
      return { overlapping: true, type: "boundary_intersects_area" };
    }
  }
  for (const boundaryLine2 of bounds2) {
    if (lineIntersectsSegmentArea(boundaryLine2, segment1, trackWidth)) {
      return { overlapping: true, type: "boundary_intersects_area" };
    }
  }
  return { overlapping: false };
}

function pointToSegmentDistance(px: number, py: number, seg: Segment): number {
  const A = px - seg.startX;
  const B = py - seg.startY;
  const C = seg.endX - seg.startX;
  const D = seg.endY - seg.startY;
  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  if (lenSq === 0) return Math.sqrt(A * A + B * B);
  let param = dot / lenSq;
  param = Math.max(0, Math.min(1, param));
  const xx = seg.startX + param * C;
  const yy = seg.startY + param * D;
  return Math.sqrt((px - xx) ** 2 + (py - yy) ** 2);
}

// --- Main validation ---

interface Checkpoint {
  x: number;
  y: number;
  angle?: number;
}

export function validateSubmittedTrack(trackCode: string): { valid: boolean; reason?: string } {
  // 1. Execute the code safely with test params
  let checkpoints: Checkpoint[];
  try {
    const func = new Function("return " + trackCode)();
    if (typeof func !== "function") {
      return { valid: false, reason: "Track code does not evaluate to a function" };
    }
    const scale = 1;
    const centerX = 160;
    const centerY = 140;
    checkpoints = func(scale, centerX, centerY);
    if (!Array.isArray(checkpoints)) {
      return { valid: false, reason: "Track function did not return an array" };
    }
  } catch {
    return { valid: false, reason: "Track code failed to execute" };
  }

  // 2. Min 8 checkpoints
  if (checkpoints.length < 8) {
    return { valid: false, reason: `Too few checkpoints (${checkpoints.length}, need >= 8)` };
  }

  // 3. Start must have angle
  if (checkpoints[0].angle === undefined || checkpoints[0].angle === null) {
    return { valid: false, reason: "Start checkpoint must have an angle property" };
  }

  // Derive width/height from the test params (matches how tracks are built)
  const width = 320; // 320 * scale(1)
  const height = 280;
  const x = 160 - width / 2; // centerX - width/2 = 0
  const y = 140 - height / 2; // centerY - height/2 = 0

  // 4. Coordinate bounds: relative coords within [-0.3, 1.3]
  for (let i = 0; i < checkpoints.length; i++) {
    const cp = checkpoints[i];
    const relX = (cp.x - x) / width;
    const relY = (cp.y - y) / height;
    if (relX < -0.3 || relX > 1.3 || relY < -0.3 || relY > 1.3) {
      return { valid: false, reason: `Checkpoint ${i} is out of bounds (relX=${relX.toFixed(2)}, relY=${relY.toFixed(2)})` };
    }
  }

  // 5. Min segment length — adjacent checkpoints >= 5px apart
  for (let i = 0; i < checkpoints.length - 1; i++) {
    const dx = checkpoints[i + 1].x - checkpoints[i].x;
    const dy = checkpoints[i + 1].y - checkpoints[i].y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 5) {
      return { valid: false, reason: `Segment ${i}-${i + 1} too short (${dist.toFixed(1)}px, need >= 5)` };
    }
  }

  // Build segments for crossing / clearance checks
  const segments: Segment[] = [];
  for (let i = 0; i < checkpoints.length - 1; i++) {
    segments.push({
      startX: checkpoints[i].x,
      startY: checkpoints[i].y,
      endX: checkpoints[i + 1].x,
      endY: checkpoints[i + 1].y,
    });
  }

  // 6. Start clearance — start point >= 25px from all non-adjacent segments
  const startPt = checkpoints[0];
  for (let i = 0; i < segments.length; i++) {
    // Skip the first segment (starts at start) and the last segment (ends near start)
    if (i === 0 || i === segments.length - 1) continue;
    const dist = pointToSegmentDistance(startPt.x, startPt.y, segments[i]);
    if (dist < 25) {
      return { valid: false, reason: `Start point too close to segment ${i} (${dist.toFixed(1)}px, need >= 25)` };
    }
  }

  // 7. No self-crossing — check non-adjacent segments
  const trackWidth = 30; // approximate track width for boundary checks
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 3; j < segments.length; j++) {
      // Skip adjacent segments (i, i+1, i+2 are adjacent)
      if (i === 0 && j === segments.length - 1) continue; // first and last are adjacent (closed loop)

      if (doSegmentsActuallyCross(segments[i], segments[j])) {
        return { valid: false, reason: `Segments ${i} and ${j} cross each other` };
      }

      const overlap = checkBoundaryOverlap(segments[i], segments[j], trackWidth);
      if (overlap.overlapping) {
        return { valid: false, reason: `Segments ${i} and ${j} have overlapping boundaries` };
      }
    }
  }

  return { valid: true };
}
