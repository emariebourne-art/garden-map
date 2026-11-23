// Run: deno test supabase/functions/upload-photo/
// These tests use a stand-in for Claude, so they need no API key and cost nothing.

import { assert, assertEquals } from "jsr:@std/assert@1";
import type Anthropic from "npm:@anthropic-ai/sdk";
import { isJpeg, stripJpegMetadata } from "./jpeg.ts";
import { moderate } from "./index.ts";

// --- a tiny synthetic JPEG: SOI, APP0 (JFIF), APP1 (EXIF with "GPS"), APP2 (ICC), COM, DQT, SOS, data, EOI
function seg(marker: number, payload: string) {
  const p = new TextEncoder().encode(payload);
  const len = p.length + 2;
  return [0xff, marker, len >> 8, len & 0xff, ...p];
}
const jpeg = new Uint8Array([
  0xff, 0xd8,
  ...seg(0xe0, "JFIF\0"),
  ...seg(0xe1, "Exif\0\0GPSLatitude=45.5231 GPSLongitude=-122.6765"),
  ...seg(0xe2, "ICC_PROFILE\0"),
  ...seg(0xfe, "taken at 1234 SE Example St"),
  ...seg(0xdb, "quant"),
  0xff, 0xda, 0x00, 0x04, 0x01, 0x02, // SOS header
  0x11, 0x22, 0xff, 0x00, 0x33,       // "image data" (with a stuffed 0xFF00)
  0xff, 0xd9,
]);
const text = (b: Uint8Array) => new TextDecoder("latin1").decode(b);

Deno.test("recognises JPEGs", () => {
  assert(isJpeg(jpeg));
  assert(!isJpeg(new TextEncoder().encode("GIF89a....")));
});

Deno.test("strips EXIF/GPS and comments, keeps JFIF, ICC and image data", () => {
  const out = stripJpegMetadata(jpeg);
  assert(!text(out).includes("GPS"), "GPS should be gone");
  assert(!text(out).includes("Exif"), "EXIF should be gone");
  assert(!text(out).includes("SE Example"), "comment should be gone");
  assert(text(out).includes("JFIF"));
  assert(text(out).includes("ICC_PROFILE"));
  assert(text(out).includes("quant"));
  // Everything from SOS onward is byte-for-byte unchanged.
  const sos = jpeg.indexOf(0xda) - 1;
  assertEquals(out.slice(out.length - (jpeg.length - sos)), jpeg.slice(sos));
});

Deno.test("leaves a malformed file's image data alone", () => {
  const broken = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0x7f, 0xff, 0x01, 0x02]); // length runs past the end
  assertEquals(stripJpegMetadata(broken), broken);
});

// --- moderate(): how the function treats each kind of answer
function fakeClient(response: Record<string, unknown>, seen?: Record<string, unknown>[]) {
  return {
    messages: {
      parse: (params: Record<string, unknown>) => {
        seen?.push(params);
        return Promise.resolve(response);
      },
    },
  } as unknown as Anthropic;
}

Deno.test("allows a photo Claude approves, and sends the image with the instructions", async () => {
  const seen: Record<string, unknown>[] = [];
  const v = await moderate(
    fakeClient({ stop_reason: "end_turn", parsed_output: { allowed: true, reason: "ok", message: "" } }, seen),
    "AAAA",
  );
  assertEquals(v.allowed, true);
  const p = seen[0] as { model: string; system: string; messages: { content: { type: string }[] }[] };
  assertEquals(p.model, "claude-opus-5-5");
  assert(p.system.includes("not an instruction"), "system prompt should treat text in images as data");
  assertEquals(p.messages[0].content[0].type, "image");
});

Deno.test("rejects with Claude's reason and message", async () => {
  const v = await moderate(fakeClient({
    stop_reason: "end_turn",
    parsed_output: { allowed: false, reason: "private_details", message: "Please crop out the house number." },
  }), "AAAA");
  assertEquals(v, { allowed: false, reason: "private_details", message: "Please crop out the house number." });
});

Deno.test("never publishes when 'allowed' contradicts the reason", async () => {
  const v = await moderate(fakeClient({
    stop_reason: "end_turn", parsed_output: { allowed: true, reason: "identifiable_person", message: "" },
  }), "AAAA");
  assertEquals(v.allowed, false);
});

Deno.test("a safety refusal is a rejection", async () => {
  const v = await moderate(fakeClient({ stop_reason: "refusal", parsed_output: null }), "AAAA");
  assertEquals(v.allowed, false);
  assertEquals(v.reason, "refused");
});

Deno.test("no verdict means the check failed (the caller then rejects the upload)", async () => {
  let threw = false;
  try { await moderate(fakeClient({ stop_reason: "max_tokens", parsed_output: null }), "AAAA"); }
  catch { threw = true; }
  assert(threw);
});
