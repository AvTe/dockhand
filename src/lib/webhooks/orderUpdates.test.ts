import { expect, test } from "vitest";
import {
  describeStatusChange,
  routeOrderUpdate,
  type OrderUpdateDeps,
} from "./orderUpdates";

function deps(overrides: Partial<OrderUpdateDeps> = {}) {
  const comments: { taskId: string; text: string }[] = [];
  const base: OrderUpdateDeps = {
    async findTaskRefsForOrder() {
      return ["task-1"];
    },
    async addComment(taskId, text) {
      comments.push({ taskId, text });
    },
  };
  return Object.assign(base, overrides, { comments });
}

test("describes a fulfilled order", () => {
  expect(describeStatusChange("orders/fulfilled", { order_number: 1001 })).toContain(
    "fulfilled"
  );
});

test("describes a cancelled order", () => {
  expect(describeStatusChange("orders/cancelled", {})).toContain("cancelled");
});

test("describes a paid order", () => {
  expect(describeStatusChange("orders/paid", {})).toContain("Payment");
});

test("describes nothing for a topic that is not a status change", () => {
  expect(describeStatusChange("orders/create", {})).toBeNull();
});

test("comments on the task that the order created", async () => {
  const d = deps();

  const commented = await routeOrderUpdate({
    shopId: "shop-1",
    topic: "orders/fulfilled",
    payload: { id: 111, order_number: 1001 },
    deps: d,
  });

  expect(d.comments).toHaveLength(1);
  expect(d.comments[0]?.taskId).toBe("task-1");
  expect(commented).toEqual(["task-1"]);
});

test("comments on every task the order produced", async () => {
  const d = deps({ async findTaskRefsForOrder() { return ["task-1", "task-2"]; } });

  await routeOrderUpdate({
    shopId: "shop-1",
    topic: "orders/cancelled",
    payload: { id: 111 },
    deps: d,
  });

  expect(d.comments.map((c) => c.taskId)).toEqual(["task-1", "task-2"]);
});

test("does nothing when the order never produced a task", async () => {
  // An order placed before the app was installed, or one no rule matched.
  const d = deps({ async findTaskRefsForOrder() { return []; } });

  const commented = await routeOrderUpdate({
    shopId: "shop-1",
    topic: "orders/fulfilled",
    payload: { id: 111 },
    deps: d,
  });

  expect(commented).toEqual([]);
  expect(d.comments).toEqual([]);
});

test("ignores a topic that is not a status change", async () => {
  const d = deps();

  await routeOrderUpdate({
    shopId: "shop-1",
    topic: "orders/create",
    payload: { id: 111 },
    deps: d,
  });

  expect(d.comments).toEqual([]);
});
