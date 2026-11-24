import test from "node:test";
import assert from "node:assert/strict";
import { distributeWords } from "../src/utils/transcript.js";

test("distributes words across the supplied time range", () => {
  const words = distributeWords("one two three", 2, 5);

  assert.deepEqual(words.map(({ word }) => word), ["one", "two", "three"]);
  assert.equal(words[0].start, 2);
  assert.equal(words.at(-1).end, 5);
  assert.ok(words.every((word, index) => word.end > word.start && (
    index === 0 || word.start >= words[index - 1].end
  )));
});

test("returns no word timings for empty text", () => {
  assert.deepEqual(distributeWords("  \n  ", 0, 4), []);
});

test("returns no zero-length timings", () => {
  assert.deepEqual(distributeWords("one two", 3, 3), []);
});

test("normalizes non-string text safely", () => {
  assert.deepEqual(distributeWords(null, 0, 2), []);
});
