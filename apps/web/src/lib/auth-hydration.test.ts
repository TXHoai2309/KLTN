import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

// Exercise the installed framework implementation, rather than a fake auth
// pending flag. These fixtures contain no session/user data or real sockets.
const require = createRequire(import.meta.url);
const { createFromReadableStream } = require("next/dist/compiled/react-server-dom-turbopack/cjs/react-server-dom-turbopack-client.browser.development.js");
const { setReactDebugChannelForHtmlRequest, connectReactDebugChannelForHtmlRequest } = require("next/dist/server/dev/debug-channel.js");
const encoder = new TextEncoder();
const stream = (text: string) => new ReadableStream<Uint8Array>({
  start(controller) { controller.enqueue(encoder.encode(text)); controller.close(); },
});
const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 25));

test("Next's initial debug channel is consumed once and cannot replay after connection loss", async () => {
  const requestId = "auth-hydration-unit-fixture";
  setReactDebugChannelForHtmlRequest(requestId, { readable: stream('1:{"name":"Fixture"}\n') });
  let droppedMessages = 0;
  connectReactDebugChannelForHtmlRequest(requestId, () => { droppedMessages++; });
  await pause();
  let replayedMessages = 0;
  connectReactDebugChannelForHtmlRequest(requestId, () => { replayedMessages++; });
  await pause();
  assert.ok(droppedMessages > 0);
  assert.equal(replayedMessages, 0);
});

test("Flight hydration waits for missing debug data; disabling the channel removes that dependency", async () => {
  let debugController!: ReadableStreamDefaultController<Uint8Array>;
  const missingDebug = new ReadableStream<Uint8Array>({ start(controller) { debugController = controller; } });
  const decoded = createFromReadableStream(stream('0:D"$1"\n0:{"ok":true}\n'), { debugChannel: { readable: missingDebug } });
  let settled = false;
  const finished = Promise.resolve(decoded).then(() => { settled = true; }, () => { settled = true; });
  try {
    await pause();
    assert.equal(settled, false);
    const independent = createFromReadableStream(stream('0:{"ok":true}\n'));
    assert.deepEqual(await independent, { ok: true });
  } finally {
    debugController.close();
    await finished;
  }
});
