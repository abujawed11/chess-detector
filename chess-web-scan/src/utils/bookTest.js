/**
 * Quick test to check if opening book is working
 * Run this in browser console to diagnose issues
 */

import { isBookMove, preloadBook } from './openingBook.js';

console.log('🧪 Testing Opening Book...');
console.log('─'.repeat(80));

// Test 1: Check if module loads
console.log('✅ Module imported successfully');

// Test 2: Try to check a simple book move
async function testBookDetection() {
  try {
    console.log('\n📚 Test 1: Checking e2e4 from starting position...');
    const startFen = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
    const move = 'e2e4';

    const result = await isBookMove(startFen, move);
    console.log(`Result: ${result ? '✓ BOOK MOVE' : '✗ NOT BOOK'}`);

    console.log('\n📚 Test 2: Checking random move...');
    const result2 = await isBookMove(startFen, 'h2h4');
    console.log(`Result: ${result2 ? '✓ BOOK MOVE' : '✗ NOT BOOK'}`);

  } catch (error) {
    console.error('❌ Error:', error);
    console.error('Stack:', error.stack);
  }
}

testBookDetection();

export { testBookDetection };
