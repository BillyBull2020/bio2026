import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createBooking, getAvailableSlots, reserveSlot, slotFacts, type CalendarConfig } from "../src/tools/calendar.ts";
import { NOW } from "./helpers.ts";

async function mockCal(): Promise<{ config: CalendarConfig; close: () => Promise<void>; seen: any[] }> {
  const seen: any[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.setHeader("content-type", "application/json");
      if (req.url?.startsWith("/v2/slots/reservations")) {
        res.end(JSON.stringify({ status: "success", data: { uid: "res_1", start: "2026-11-21T16:00:00.000Z" } }));
        return;
      }
      if (req.url === "/v2/bookings") {
        res.statusCode = 201;
        res.end(JSON.stringify({ status: "success", data: { uid: "bk_1", start: "2026-11-21T16:00:00.000Z" } }));
        return;
      }
      res.end(
        JSON.stringify({
          status: "success",
          data: {
            "2026-11-21": [{ start: "2026-11-21T16:00:00.000Z" }, { start: "2026-11-21T18:30:00.000Z" }],
            "2026-11-22": [{ start: "2026-11-22T16:00:00.000Z" }],
          },
        }),
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  return {
    config: {
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey: "cal_test",
      eventTypeId: "42",
      timeZone: "America/Denver",
      timeoutMs: 2_000,
    },
    seen,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

test("Cal.diy slots are read and labelled in the business timezone", async () => {
  const mock = await mockCal();
  try {
    const slots = await getAvailableSlots(mock.config, NOW);
    assert.equal(slots.length, 3);
    assert.ok(slots[0]!.label.length > 0);
    assert.equal(slots[0]!.start, "2026-11-21T16:00:00.000Z");
    assert.match(String(mock.seen[0]!.url), /eventTypeId=42/);
    assert.equal(mock.seen[0]!.headers.authorization, "Bearer cal_test");
    assert.equal(mock.seen[0]!.headers["cal-api-version"], "2024-09-04");

    const facts = await slotFacts(mock.config, NOW);
    assert.ok(facts);
    assert.equal(facts!.deadline, "2026-11-21T16:00:00.000Z");
    assert.notEqual(facts!.slotA, facts!.slotB);
  } finally {
    await mock.close();
  }
});

test("a booking posts the attendee and the event type", async () => {
  const mock = await mockCal();
  try {
    const result = await createBooking(mock.config, {
      start: "2026-11-21T16:00:00.000Z",
      name: "Dana Whitfield",
      email: "dana@example.com",
      phone: "+13035550199",
      timeZone: "America/Denver",
      contactId: "ct_1",
    });
    assert.equal(result.ok, true);
    assert.equal(result.uid, "bk_1");
    const call = mock.seen.find((s) => s.url === "/v2/bookings");
    assert.ok(call);
    assert.equal(call.headers["cal-api-version"], "2024-08-13");
    const body = JSON.parse(call.body);
    assert.equal(body.eventTypeId, 42);
    assert.equal(body.attendee.name, "Dana Whitfield");
    assert.equal(body.attendee.email, "dana@example.com");
    assert.equal(body.metadata.contactId, "ct_1");
  } finally {
    await mock.close();
  }
});

test("a slot can be reserved before the customer confirms", async () => {
  const mock = await mockCal();
  try {
    const result = await reserveSlot(mock.config, "2026-11-21T16:00:00.000Z", 30);
    assert.equal(result.ok, true);
    assert.equal(result.uid, "res_1");
    const call = mock.seen.find((s) => s.url === "/v2/slots/reservations");
    assert.ok(call);
    const body = JSON.parse(call.body);
    assert.equal(body.eventTypeId, 42);
    assert.equal(body.reservationDuration, 30);
  } finally {
    await mock.close();
  }
});
