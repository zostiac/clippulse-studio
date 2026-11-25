import test from "node:test";
import assert from "node:assert/strict";
import {
  formatCaptionWord,
  getCaptionBackground,
  getCaptionHighlight,
} from "../src/utils/captionStyle.js";

test("caption casing follows preset defaults and explicit overrides", () => {
  assert.equal(formatCaptionWord("Hello", { caption_style: "hormozi" }), "HELLO");
  assert.equal(formatCaptionWord("Hello", { caption_style: "minimal" }), "Hello");
  assert.equal(formatCaptionWord("Hello", { caption_case: "uppercase" }), "HELLO");
  assert.equal(formatCaptionWord("Hello", { caption_case: "lowercase" }), "hello");
  assert.equal(formatCaptionWord("Hello", { caption_case: "sentence" }), "Hello");
});

test("caption highlight colors support preset and custom choices", () => {
  assert.equal(getCaptionHighlight({ caption_style: "beast" }), "#22D3EE");
  assert.equal(getCaptionHighlight({ caption_highlight: "green" }), "#34D399");
  assert.equal(getCaptionHighlight({ caption_highlight: "white" }), "#FFFFFF");
});

test("caption background resolves preset defaults and explicit choices", () => {
  assert.equal(getCaptionBackground({ caption_style: "minimal" }), "pill");
  assert.equal(getCaptionBackground({ caption_style: "hormozi" }), "outline");
  assert.equal(getCaptionBackground({ caption_background: "none" }), "none");
});
