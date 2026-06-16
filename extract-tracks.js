#!/usr/bin/env node

/**
 * Extract track functions from tracks.js into tracks_functions.json
 * for use with populate-tracks.ts
 */

const fs = require('fs');
const path = require('path');

const tracksFile = path.join(__dirname, 'public/game/tracks/tracks.js');
const outputFile = path.join(__dirname, 'tracks_functions.json');

const source = fs.readFileSync(tracksFile, 'utf-8');

// Extract the trackFunctions mapping to get all track IDs
const mapMatch = source.match(/const trackFunctions\s*=\s*\{([\s\S]*?)\};/);
if (!mapMatch) {
  console.error('Could not find trackFunctions map');
  process.exit(1);
}

// Parse track IDs from the map
const trackIds = [];
const idRegex = /'(\d+)'/g;
let m;
while ((m = idRegex.exec(mapMatch[1])) !== null) {
  trackIds.push(m[1]);
}

console.log(`Found ${trackIds.length} track IDs: ${trackIds[0]} - ${trackIds[trackIds.length - 1]}`);

// Extract each function body
const result = {};

for (const id of trackIds) {
  const funcName = `generate${id}Track`;
  // Match from "function generateXXXTrack(" to the next "function generate" or "const trackFunctions"
  const funcRegex = new RegExp(
    `(function ${funcName}\\(scale,\\s*centerX,\\s*centerY\\)\\s*\\{[\\s\\S]*?\\n\\})`,
    'm'
  );
  const funcMatch = source.match(funcRegex);

  if (funcMatch) {
    result[id] = funcMatch[1];
  } else {
    console.warn(`Could not extract function for track ${id}`);
  }
}

console.log(`Extracted ${Object.keys(result).length} track functions`);

fs.writeFileSync(outputFile, JSON.stringify(result, null, 2));
console.log(`Written to ${outputFile}`);
