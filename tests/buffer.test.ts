import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { bufferConfigFromEnv, publishToBuffer, type BufferConfig } from "../src/tools/buffer.ts";
import { isMediaFilename, mediaContentType } from "../src/tools/media.ts";

test("Buffer config is absent without an API key", () => {
  assert.equal(bufferConfigFromEnv({} as NodeJS.ProcessEnv), null);
});

test("Buffer createPost carries image and video assets", async () => {
  const calls: any[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      calls.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      res.end(JSON.stringify({ data: { createPost: { post: { id: `post_${calls.length}` } } } }));
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  try {
    const config: BufferConfig = {
      apiKey: "buffer_test",
      channelIds: ["ch_1"],
      apiUrl: `http://127.0.0.1:${port}/graphql`,
      shareMode: "addToQueue",
      timeoutMs: 2_000,
    };
    const image = await publishToBuffer(config, {
      text: "A real post.",
      imageUrl: "https://example.test/roof.jpg",
      altText: "A finished roof",
    });
    assert.equal(image.ok, true);
    assert.equal(image.results[0]?.postId, "post_1");
    assert.equal(calls[0].auth, "Bearer buffer_test");
    const imageInput = calls[0].body.variables.input;
    assert.equal(imageInput.channelId, "ch_1");
    assert.equal(imageInput.assets[0].image.url, "https://example.test/roof.jpg");
    assert.equal(imageInput.assets[0].image.metadata.altText, "A finished roof");

    const video = await publishToBuffer(config, {
      text: "A video post.",
      videoUrl: "https://example.test/roof.mp4",
      thumbnailUrl: "https://example.test/roof.jpg",
    });
    assert.equal(video.ok, true);
    const videoInput = calls[1].body.variables.input;
    assert.equal(videoInput.assets[0].video.url, "https://example.test/roof.mp4");
    assert.equal(videoInput.assets[0].video.thumbnailUrl, "https://example.test/roof.jpg");
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("media URLs are tokenized and typed", () => {
  assert.equal(isMediaFilename("a".repeat(32) + ".mp4"), true);
  assert.equal(isMediaFilename("../events.jsonl"), false);
  assert.equal(mediaContentType("a".repeat(32) + ".mp4"), "video/mp4");
  assert.equal(mediaContentType("a".repeat(32) + ".png"), "image/png");
});
