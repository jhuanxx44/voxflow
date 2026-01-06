/**
 * Text tokenization utilities
 * Breaks down text into tokens (words, numbers, characters, spaces)
 */

import type { Token } from '../types/asr';

/**
 * Tokenizes text into units for character-level editing
 *
 * Rules:
 * - English letters are grouped into words
 * - Numbers (with decimals) are grouped together
 * - Chinese characters and punctuation are single tokens
 * - Spaces are marked but preserved for timing calculations
 *
 * @param text - Text to tokenize
 * @returns Array of tokens with position and type information
 *
 * @example
 * tokenizeText("Hello 123 你好")
 * // [
 * //   { text: "Hello", startIdx: 0, endIdx: 4, length: 5, type: "word" },
 * //   { text: " ", startIdx: 5, endIdx: 5, length: 1, type: "space" },
 * //   { text: "123", startIdx: 6, endIdx: 8, length: 3, type: "number" },
 * //   { text: " ", startIdx: 9, endIdx: 9, length: 1, type: "space" },
 * //   { text: "你", startIdx: 10, endIdx: 10, length: 1, type: "char" },
 * //   { text: "好", startIdx: 11, endIdx: 11, length: 1, type: "char" }
 * // ]
 */
export function tokenizeText(text: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    // Space characters are marked as special type (not rendered but used for timing)
    if (char === ' ' || char === '\t' || char === '\n') {
      tokens.push({
        text: char,
        startIdx: i,
        endIdx: i,
        length: 1,
        type: 'space'
      });
      i++;
      continue;
    }

    // English letters - collect whole word
    if (/[a-zA-Z]/.test(char)) {
      let word = '';
      const startIdx = i;
      while (i < text.length && /[a-zA-Z]/.test(text[i])) {
        word += text[i];
        i++;
      }
      tokens.push({
        text: word,
        startIdx: startIdx,
        endIdx: i - 1,
        length: word.length,
        type: 'word'
      });
    }
    // Numbers - collect continuous digits and decimals
    else if (/[0-9]/.test(char)) {
      let num = '';
      const startIdx = i;
      while (i < text.length && /[0-9.]/.test(text[i])) {
        num += text[i];
        i++;
      }
      tokens.push({
        text: num,
        startIdx: startIdx,
        endIdx: i - 1,
        length: num.length,
        type: 'number'
      });
    }
    // Other characters (Chinese, punctuation, etc.) - single character
    else {
      tokens.push({
        text: char,
        startIdx: i,
        endIdx: i,
        length: 1,
        type: 'char'
      });
      i++;
    }
  }

  return tokens;
}

/**
 * Gets non-space tokens from a token array
 * Used for matching with timestamp arrays which don't include spaces
 *
 * @param tokens - Array of tokens
 * @returns Tokens excluding spaces
 */
export function getNonSpaceTokens(tokens: Token[]): Token[] {
  return tokens.filter(t => t.type !== 'space');
}
