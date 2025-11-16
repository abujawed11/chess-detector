// src/utils/pgnParser.js
import { Chess } from 'chess.js/dist/esm/chess.js';

/**
 * Remove comments (text in curly braces) from PGN text
 * Handles nested braces properly
 */
function removeComments(text) {
  let result = '';
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '{') {
      depth++;
    } else if (text[i] === '}') {
      depth--;
    } else if (depth === 0) {
      result += text[i];
    }
  }

  return result;
}

/**
 * Remove variations (text in parentheses) from PGN text
 * Handles nested parentheses properly
 */
function removeVariations(text) {
  let result = '';
  let depth = 0;

  for (let i = 0; i < text.length; i++) {
    if (text[i] === '(') {
      depth++;
    } else if (text[i] === ')') {
      depth--;
    } else if (depth === 0) {
      result += text[i];
    }
  }

  return result;
}

/**
 * Parse a PGN string and extract game information
 * @param {string} pgnString - The PGN string to parse
 * @returns {Object} Parsed game data or null if invalid
 */
export function parsePGN(pgnString) {
  if (!pgnString || typeof pgnString !== 'string') {
    return null;
  }

  try {
    const chess = new Chess();

    // console.log('DEBUG: Raw PGN input length:', pgnString.length);
    // console.log('DEBUG: Raw PGN (first 500 chars):', pgnString.substring(0, 500));
    // console.log('DEBUG: Raw PGN contains [Event count:', (pgnString.match(/\[Event/g) || []).length);

    // Clean up PGN - remove excessive whitespace and normalize newlines
    let cleanedPgn = pgnString
      .replace(/\r\n/g, '\n')  // Normalize line endings
      .replace(/\r/g, '\n')     // Handle old Mac line endings
      .trim();

    // Extract only the first game if multiple games are present
    const lines = cleanedPgn.split('\n');
    let firstGameEnd = lines.length;
    let foundFirstEvent = false;
    let foundMoves = false; // Track if we've seen the moves section

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Track if we've reached the moves section (non-header, non-empty line)
      if (line && !line.startsWith('[')) {
        foundMoves = true;
      }

      if (line.startsWith('[Event')) {
        if (foundFirstEvent && foundMoves) {
          // This is truly the second game - cut here
          // Only if we've already seen moves from the first game
          firstGameEnd = i;
          console.log('Multiple games detected, extracting only first game');
          break;
        }
        foundFirstEvent = true;
      }
    }

    // Take only the first game
    const firstGameLines = lines.slice(0, firstGameEnd);

    // console.log('DEBUG: Total lines in first game:', firstGameLines.length);
    // console.log('DEBUG: First 5 lines:', firstGameLines.slice(0, 5));
    // console.log('DEBUG: Last 5 lines:', firstGameLines.slice(-5));

    // Filter out unsupported headers that chess.js doesn't recognize
    const supportedHeaders = [
      'Event', 'Site', 'Date', 'Round', 'White', 'Black', 'Result',
      'WhiteElo', 'BlackElo', 'TimeControl', 'ECO', 'PlyCount', 'FEN', 'Opening',
      'Annotator', 'EventDate', 'Link'
    ];

    const filteredLines = [];
    let lastHeaderIndex = -1;

    for (let i = 0; i < firstGameLines.length; i++) {
      const line = firstGameLines[i].trim();
      if (line.startsWith('[') && line.endsWith(']')) {
        // Check if this is a supported header
        const headerMatch = line.match(/\[(\w+)\s/);
        if (headerMatch) {
          const headerName = headerMatch[1];
          // Only include supported headers
          if (supportedHeaders.includes(headerName)) {
            filteredLines.push(firstGameLines[i]);
            lastHeaderIndex = filteredLines.length - 1;
          } else {
            console.log('Skipping unsupported header:', headerName);
          }
        }
      } else {
        // Not a header, keep it
        // console.log('DEBUG: Keeping non-header line:', line.substring(0, 100));
        filteredLines.push(firstGameLines[i]);
      }
    }

    // console.log('DEBUG: Filtered lines count:', filteredLines.length);
    // console.log('DEBUG: Last header index:', lastHeaderIndex);

    // Rebuild with proper spacing
    const processedLines = [];
    for (let i = 0; i < filteredLines.length; i++) {
      processedLines.push(filteredLines[i]);
      // Add blank line after last header if not present
      if (i === lastHeaderIndex && i + 1 < filteredLines.length) {
        const nextLine = filteredLines[i + 1].trim();
        if (nextLine && !nextLine.startsWith('[')) {
          // Next line is moves, ensure blank line
          if (filteredLines[i + 1].trim()) {
            processedLines.push('');
          }
        }
      }
    }

    cleanedPgn = processedLines.join('\n').trim();

    // console.log('DEBUG: Cleaned PGN length:', cleanedPgn.length);
    // console.log('DEBUG: Cleaned PGN (first 500 chars):', cleanedPgn.substring(0, 500));
    // console.log('DEBUG: Cleaned PGN (last 300 chars):', cleanedPgn.substring(cleanedPgn.length - 300));

    // Ensure the game has a result marker at the end
    const resultPattern = /\s+(1-0|0-1|1\/2-1\/2|\*)\s*$/;
    if (!resultPattern.test(cleanedPgn)) {
      // No result found, add it from the header or use *
      const resultMatch = cleanedPgn.match(/\[Result\s+"([^"]+)"\]/);
      const result = resultMatch ? resultMatch[1] : '*';
      cleanedPgn = cleanedPgn + ' ' + result;
      console.log('Added missing result marker:', result);
    }

    console.log('Attempting to parse PGN:', cleanedPgn.substring(0, 200) + '...');

    // Extract headers manually
    const headerLines = cleanedPgn.split('\n').filter(line =>
      line.trim().startsWith('[') && line.trim().endsWith(']')
    );

    const headers = {};
    headerLines.forEach(line => {
      const match = line.match(/\[(\w+)\s+"([^"]+)"\]/);
      if (match) {
        headers[match[1]] = match[2];
      }
    });

    // Extract moves section (everything after headers)
    const moveSectionLines = cleanedPgn
      .split('\n')
      .filter(line => !line.trim().startsWith('['));

    // console.log('DEBUG: Move section lines count:', moveSectionLines.length);
    // console.log('DEBUG: Move section lines:', moveSectionLines);

    const moveSection = moveSectionLines.join(' ').trim();

    // console.log('DEBUG: Move section (raw):', moveSection.substring(0, 500));

    // Parse moves - use a proper function to strip variations and comments
    let movesText = moveSection;

    // Remove comments in curly braces (handle nested ones)
    movesText = removeComments(movesText);
    // console.log('DEBUG: After removing comments:', movesText.substring(0, 300));

    // Remove variations in parentheses (handle nested ones)
    movesText = removeVariations(movesText);
    // console.log('DEBUG: After removing variations:', movesText.substring(0, 300));

    // Remove NAG annotations like $1, $2, etc.
    movesText = movesText.replace(/\$\d+/g, '');
    // console.log('DEBUG: After removing NAGs:', movesText.substring(0, 300));

    // Remove move numbers
    movesText = movesText.replace(/\d+\.\.\./g, ' '); // Black move numbers like 3...
    movesText = movesText.replace(/\d+\./g, ' '); // White move numbers like 1.
    // console.log('DEBUG: After removing move numbers:', movesText.substring(0, 300));

    // Remove result markers (anywhere in the text)
    movesText = movesText.replace(/(1-0|0-1|1\/2-1\/2|\*)/g, '');
    // console.log('DEBUG: After removing result:', movesText.substring(0, 300));

    movesText = movesText.trim();

    // Split into individual moves
    const movesList = movesText.split(/\s+/).filter(m => m.length > 0);

    console.log('Cleaned moves text:', movesText);
    console.log('Extracted moves list:', movesList);
    console.log('Total moves to parse:', movesList.length);

    // Play through moves one by one
    const playedMoves = [];
    for (let i = 0; i < movesList.length; i++) {
      try {
        const move = chess.move(movesList[i], { sloppy: true });
        if (move) {
          playedMoves.push(move);
        } else {
          console.warn('Invalid move at index', i, ':', movesList[i]);
        }
      } catch (error) {
        console.warn('Error playing move', i, ':', movesList[i], error.message);
      }
    }

    if (playedMoves.length === 0) {
      console.error('No valid moves found in PGN');
      return null;
    }

    console.log('Successfully played', playedMoves.length, 'moves');

    return {
      headers,
      moves: chess.history({ verbose: true }),
      chess,
      totalMoves: playedMoves.length
    };

  } catch (error) {
    console.error('Failed to parse PGN:', error);
    console.error('Error message:', error.message);
    console.error('PGN that failed (first 500 chars):', pgnString.substring(0, 500));
    return null;
  }
}

/**
 * Validate if a string is valid PGN format
 * @param {string} pgnString - The PGN string to validate
 * @returns {boolean} True if valid PGN
 */
export function isValidPGN(pgnString) {
  const result = parsePGN(pgnString);
  return result !== null;
}
