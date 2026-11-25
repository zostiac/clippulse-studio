import test from "node:test";
import assert from "node:assert/strict";
import { replaceProjectIfCurrent } from "../src/utils/projectState.js";

test("applies a response when its project is still active", () => {
  const updated = { id: "proj_aaaaaaaa", title: "Updated" };
  assert.equal(
    replaceProjectIfCurrent({ id: "proj_aaaaaaaa" }, "proj_aaaaaaaa", updated),
    updated,
  );
});

test("ignores a late response after switching projects", () => {
  const current = { id: "proj_bbbbbbbb", title: "Current project" };
  const stale = { id: "proj_aaaaaaaa", title: "Stale response" };
  assert.equal(replaceProjectIfCurrent(current, "proj_aaaaaaaa", stale), current);
});

test("keeps an empty selection empty when an old request completes", () => {
  assert.equal(replaceProjectIfCurrent(null, "proj_aaaaaaaa", { id: "proj_aaaaaaaa" }), null);
});
