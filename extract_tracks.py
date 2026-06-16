#!/usr/bin/env python3
"""
Script to extract all "function generate" and "function bakuTrack" functions from tracks.js
and save them as a JSON object with numeric keys.
"""

import re
import json
import sys
from pathlib import Path


def extract_functions_from_file(file_path):
    """Extract all generate and bakuTrack functions from the JavaScript file."""
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Pattern to match function definitions
    # This matches: function generateXXXTrack( or function bakuTrackXXXX(
    function_pattern = r'(function (?:generate|bakuTrack)\w+\([^)]*\)\s*\{[^}]*\})'

    # Find all function definitions (including nested braces)
    functions = []
    pos = 0

    while True:
        # Find the start of a function
        start_match = re.search(r'function (?:generate|bakuTrack)\w+\([^)]*\)\s*\{', content[pos:])
        if not start_match:
            break

        start_pos = pos + start_match.start()

        # Count braces to find the end
        brace_count = 0
        end_pos = start_pos

        for i, char in enumerate(content[start_pos:], start_pos):
            if char == '{':
                brace_count += 1
            elif char == '}':
                brace_count -= 1
                if brace_count == 0:
                    end_pos = i + 1
                    break

        if end_pos > start_pos:
            function_code = content[start_pos:end_pos]
            functions.append(function_code)
            pos = end_pos
        else:
            # If we can't find the end, skip this match
            pos = start_pos + 1

    return functions


def extract_track_number(function_code):
    """Extract the track number from function name for use as key."""
    # Match function generateXXXTrack or bakuTrackXXXX
    generate_match = re.search(r'function generate(\d+)Track', function_code)
    if generate_match:
        return generate_match.group(1)

    baku_match = re.search(r'function bakuTrack(\d+)', function_code)
    if baku_match:
        return baku_match.group(1)

    # If no number found, return None
    return None


def main():
    if len(sys.argv) != 2:
        print("Usage: python extract_tracks.py <path_to_tracks.js>")
        sys.exit(1)

    file_path = sys.argv[1]

    if not Path(file_path).exists():
        print(f"Error: File {file_path} does not exist")
        sys.exit(1)

    # Extract all functions
    functions = extract_functions_from_file(file_path)
    print(f"Found {len(functions)} functions")

    # Create the JSON structure
    tracks_dict = {}

    for func in functions:
        track_number = extract_track_number(func)
        if track_number:
            tracks_dict[track_number] = func
            print(f"Extracted track {track_number}")
        else:
            print(f"Warning: Could not extract track number from function: {func[:50]}...")

    # Sort by track number
    sorted_tracks = dict(sorted(tracks_dict.items(), key=lambda x: int(x[0])))

    # Save to JSON
    output_file = "tracks_functions.json"
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(sorted_tracks, f, indent=2, ensure_ascii=False)

    print(f"Saved {len(sorted_tracks)} tracks to {output_file}")

    # Also save as array if requested
    output_array_file = "tracks_functions_array.json"
    with open(output_array_file, 'w', encoding='utf-8') as f:
        json.dump(list(sorted_tracks.values()), f, indent=2, ensure_ascii=False)

    print(f"Also saved functions as array to {output_array_file}")


if __name__ == "__main__":
    main()
