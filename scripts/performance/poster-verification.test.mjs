import { test } from "node:test";
import assert from "node:assert/strict";
import { stat, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import sharp from "sharp";

test("lossless hero poster keeps exact decoded pixels/dimensions and reduces bytes", async () => {
  const before="apps/web/public/images/ha-giang-highland-poster.png",after="apps/web/public/images/ha-giang-highland-poster.webp";
  const a=await sharp(before).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const b=await sharp(after).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  assert.equal(a.info.width,b.info.width);assert.equal(a.info.height,b.info.height);
  assert.equal(a.data.equals(b.data),true);
  const beforeBytes=(await stat(before)).size,afterBytes=(await stat(after)).size;
  assert.ok(afterBytes<beforeBytes);
  const evidence={checkedAt:new Date().toISOString(),beforeBytes,afterBytes,savedBytes:beforeBytes-afterBytes,savedPercent:(1-afterBytes/beforeBytes)*100,width:a.info.width,height:a.info.height,pixelsIdentical:true,decodedPixelSha256:createHash("sha256").update(a.data).digest("hex")};
  await writeFile("docs/performance/evidence/poster-lossless.json",JSON.stringify(evidence,null,2)+"\n");
});
