/**
 * Text Chunking Utility for Memory System
 *
 * Splits text into overlapping chunks optimized for embedding models.
 * Uses tiktoken for accurate token counting with cl100k_base encoding
 * (GPT-4 / text-embedding-3 tokenizer).
 */

import { encoding_for_model } from "tiktoken";

/** Target tokens per chunk (embedding models work best around this size) */
const TARGET_TOKENS = 400;

/** Overlap tokens between consecutive chunks for context continuity */
const OVERLAP_TOKENS = 80;

/** Minimum chunk size - don't create tiny trailing chunks */
const MIN_CHUNK_TOKENS = 50;

/** A chunk of text with position metadata */
export interface Chunk {
  /** The chunk text content */
  content: string;
  /** Character offset where this chunk starts in the original text */
  startOffset: number;
  /** Character offset where this chunk ends in the original text */
  endOffset: number;
  /** Number of tokens in this chunk */
  tokenCount: number;
  /** Zero-based index of this chunk */
  index: number;
}

/** Cached tokenizer instance */
let encoder: ReturnType<typeof encoding_for_model> | null = null;

/** Get or create the tokenizer */
function getEncoder() {
  if (!encoder) {
    // cl100k_base is used by text-embedding-3-small/large and GPT-4
    encoder = encoding_for_model("gpt-4");
  }
  return encoder;
}

/** Count tokens in text */
export function countTokens(text: string): number {
  return getEncoder().encode(text).length;
}

/**
 * Split text into sentence-like segments.
 * Tries to split on sentence boundaries for cleaner chunks.
 */
function splitIntoSegments(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  // Keep the punctuation with the preceding sentence
  const segments: string[] = [];
  let current = "";

  for (let i = 0; i < text.length; i++) {
    current += text[i];

    // Check for sentence boundary
    if (
      (text[i] === "." || text[i] === "!" || text[i] === "?") &&
      (text[i + 1] === " " || text[i + 1] === "\n" || i === text.length - 1)
    ) {
      // Include trailing whitespace in current segment
      while (i + 1 < text.length && (text[i + 1] === " " || text[i + 1] === "\n")) {
        i++;
        current += text[i];
      }
      segments.push(current);
      current = "";
    }
  }

  // Don't forget remaining text
  if (current.trim()) {
    segments.push(current);
  }

  return segments;
}

/**
 * Chunk text into overlapping segments optimized for embedding.
 *
 * @param text - The text to chunk
 * @returns Array of chunks with content and position metadata
 *
 * @example
 * ```typescript
 * const chunks = chunkText(longDocument);
 * // chunks[0].content = "First ~400 tokens..."
 * // chunks[1].content = "...overlap... next ~400 tokens..."
 * ```
 */
export function chunkText(text: string): Chunk[] {
  const totalTokens = countTokens(text);

  // Short text: return as single chunk
  if (totalTokens <= TARGET_TOKENS) {
    return [
      {
        content: text,
        startOffset: 0,
        endOffset: text.length,
        tokenCount: totalTokens,
        index: 0,
      },
    ];
  }

  const segments = splitIntoSegments(text);
  const chunks: Chunk[] = [];

  let currentChunk = "";
  let currentTokens = 0;
  let chunkStartOffset = 0;
  let currentOffset = 0;

  // Track segments for overlap calculation
  const segmentQueue: { text: string; tokens: number; startOffset: number }[] = [];

  for (const segment of segments) {
    const segmentTokens = countTokens(segment);

    segmentQueue.push({
      text: segment,
      tokens: segmentTokens,
      startOffset: currentOffset,
    });

    currentChunk += segment;
    currentTokens += segmentTokens;
    currentOffset += segment.length;

    // Check if we've reached target size
    if (currentTokens >= TARGET_TOKENS) {
      chunks.push({
        content: currentChunk.trim(),
        startOffset: chunkStartOffset,
        endOffset: currentOffset,
        tokenCount: currentTokens,
        index: chunks.length,
      });

      // Calculate overlap: find segments that sum to ~OVERLAP_TOKENS
      let overlapTokens = 0;
      let overlapStartIdx = segmentQueue.length - 1;

      while (overlapStartIdx > 0 && overlapTokens < OVERLAP_TOKENS) {
        overlapStartIdx--;
        overlapTokens += segmentQueue[overlapStartIdx]!.tokens;
      }

      // Start new chunk with overlap segments
      const overlapSegments = segmentQueue.slice(overlapStartIdx);
      currentChunk = overlapSegments.map((s) => s.text).join("");
      currentTokens = overlapSegments.reduce((sum, s) => sum + s.tokens, 0);
      chunkStartOffset = overlapSegments[0]?.startOffset ?? currentOffset;

      // Reset queue to only overlap segments
      segmentQueue.length = 0;
      segmentQueue.push(...overlapSegments);
    }
  }

  // Handle remaining content
  if (currentChunk.trim()) {
    // If remaining chunk is too small, merge with previous chunk
    if (currentTokens < MIN_CHUNK_TOKENS && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1]!;
      // Extend last chunk to include remaining content
      // Need to recalculate without double-counting overlap
      const extension = text.slice(lastChunk.endOffset);
      lastChunk.content = text.slice(lastChunk.startOffset).trim();
      lastChunk.endOffset = text.length;
      lastChunk.tokenCount = countTokens(lastChunk.content);
    } else {
      chunks.push({
        content: currentChunk.trim(),
        startOffset: chunkStartOffset,
        endOffset: text.length,
        tokenCount: currentTokens,
        index: chunks.length,
      });
    }
  }

  return chunks;
}
