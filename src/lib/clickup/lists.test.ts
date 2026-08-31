import { expect, test } from "vitest";
import { mergeSpaceLists } from "./lists";

test("returns folderless lists under their own name", () => {
  const result = mergeSpaceLists([], [{ id: "1", name: "Packing" }]);

  expect(result).toEqual([{ id: "1", label: "Packing" }]);
});

test("qualifies lists inside a folder with the folder name", () => {
  const result = mergeSpaceLists(
    [{ id: "f1", name: "Fulfilment", lists: [{ id: "2", name: "Packing" }] }],
    []
  );

  expect(result).toEqual([{ id: "2", label: "Fulfilment / Packing" }]);
});

test("puts folderless lists before foldered ones", () => {
  const result = mergeSpaceLists(
    [{ id: "f1", name: "Fulfilment", lists: [{ id: "2", name: "Packing" }] }],
    [{ id: "1", name: "Inbox" }]
  );

  expect(result.map((l) => l.id)).toEqual(["1", "2"]);
});

test("flattens lists across multiple folders", () => {
  const result = mergeSpaceLists(
    [
      { id: "f1", name: "Fulfilment", lists: [{ id: "2", name: "Packing" }] },
      { id: "f2", name: "Support", lists: [{ id: "3", name: "Refunds" }] },
    ],
    []
  );

  expect(result).toEqual([
    { id: "2", label: "Fulfilment / Packing" },
    { id: "3", label: "Support / Refunds" },
  ]);
});

test("tolerates a folder that has no lists", () => {
  // ClickUp omits `lists` on an empty folder rather than sending [].
  const result = mergeSpaceLists(
    [{ id: "f1", name: "Empty" } as { id: string; name: string; lists?: never }],
    [{ id: "1", name: "Inbox" }]
  );

  expect(result).toEqual([{ id: "1", label: "Inbox" }]);
});
