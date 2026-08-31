import { expect, test } from "vitest";
import { parseRuleInput } from "./ruleInput";

const valid = { triggerEvent: "order_created", targetListId: "901234567", tag: "" };

test("accepts a well-formed rule", () => {
  expect(parseRuleInput(valid)).toEqual({
    triggerEvent: "order_created",
    targetListId: "901234567",
    condition: {},
    assignee: null,
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
  expect(
    parseRuleInput({ ...valid, triggerEvent: "low_stock", tag: "wholesale", threshold: "5" })
      .condition
  ).toEqual({ below: 5 });
});

test("stores a stock threshold for low_stock rules", () => {
  const parsed = parseRuleInput({
    triggerEvent: "low_stock",
    targetListId: "901",
    threshold: "5",
  });

  expect(parsed.condition).toEqual({ below: 5 });
});

test("requires a threshold on low_stock rules", () => {
  // Without one the rule fires on every inventory change, including the
  // decrease caused by an ordinary sale.
  expect(() =>
    parseRuleInput({ triggerEvent: "low_stock", targetListId: "901", threshold: "" })
  ).toThrow();
});

test("rejects a threshold that is not a positive number", () => {
  expect(() =>
    parseRuleInput({ triggerEvent: "low_stock", targetListId: "901", threshold: "-2" })
  ).toThrow();
});

test("ignores a threshold on triggers that carry no stock level", () => {
  const parsed = parseRuleInput({
    triggerEvent: "order_created",
    targetListId: "901",
    threshold: "5",
  });

  expect(parsed.condition).toEqual({});
});

test("carries the assignee through", () => {
  expect(
    parseRuleInput({ triggerEvent: "order_created", targetListId: "901", assignee: "12345" })
      .assignee
  ).toBe("12345");
});

test("treats a blank assignee as unassigned", () => {
  expect(
    parseRuleInput({ triggerEvent: "order_created", targetListId: "901", assignee: "  " })
      .assignee
  ).toBeNull();
});
