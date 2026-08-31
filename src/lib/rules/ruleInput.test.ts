import { expect, test } from "vitest";
import { parseRuleInput } from "./ruleInput";

const valid = { triggerEvent: "order_created", targetListId: "901234567", tag: "" };

test("accepts a well-formed rule", () => {
  expect(parseRuleInput(valid)).toEqual({
    triggerEvent: "order_created",
    targetListId: "901234567",
    condition: {},
  });
});

test("rejects a trigger the database constraint would refuse", () => {
  // rules.trigger_event is CHECK-constrained; order_tagged was dropped.
  expect(() => parseRuleInput({ ...valid, triggerEvent: "order_tagged" })).toThrow();
});

test("rejects a missing target list", () => {
  expect(() => parseRuleInput({ ...valid, targetListId: "  " })).toThrow();
});

test("stores a tag condition for order_created", () => {
  expect(parseRuleInput({ ...valid, tag: "wholesale" }).condition).toEqual({
    tag: "wholesale",
  });
});

test("ignores a tag on triggers that carry no order tags", () => {
  // The webhook only evaluates payload.tags for order payloads, so a tag on a
  // low_stock rule would silently never match. Drop it rather than store a
  // condition that can never be true.
  expect(parseRuleInput({ ...valid, triggerEvent: "low_stock", tag: "wholesale" }).condition)
    .toEqual({});
});
