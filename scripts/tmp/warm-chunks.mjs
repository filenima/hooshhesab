// Recursive chunk warmer using curl (bun fetch hangs on Turbopack chunked responses)
import { execSync } from "child_process";

const BASE = "http://127.0.0.1:3000";
const CHUNK_RE = /(?:\/_next\/)?static\/chunks\/[A-Za-z0-9_\[\].\-/%]+/g;
const seen = new Set();
let fetched = 0, errors = 0;

function fetchText(url) {
  try {
    const out = execSync(
      `curl -s --max-time 30 --compressed -H 'Accept-Encoding: identity' '${BASE}${url}'`,
      { timeout: 40000, maxBuffer: 60 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] }
    );
    fetched++;
    return out.toString("utf8");
  } catch (e) {
    errors++;
    if (errors <= 2) console.log("FETCH-ERR", url, String(e.message).slice(0, 120), "status", e.status);
    return "";
  }
}

function extractChunks(text) {
  const out = [];
  if (!text) return out;
  const matches = text.match(CHUNK_RE) || [];
  for (const m of matches) {
    let u = m.replace(/\\u002F/g, "/").replace(/\\\//g, "/");
    if (u.startsWith("//")) u = u.slice(1);
    if (!u.startsWith("/")) u = "/" + u; // normalize relative to absolute path
    u = "/_next" + u.replace("/_next", "");
    out.push(u);
  }
  return out;
}

function enc(u) {
  return encodeURI(u).replace(/\[/g, "%5B").replace(/\]/g, "%5D");
}

function warm(url, depth) {
  if (seen.has(url) || depth > 4 || seen.size > 1500) return;
  seen.add(url);
  const text = fetchText(url);
  const chunks = extractChunks(text);
  if (depth < 4) {
    for (const c of chunks) {
      const e = enc(c);
      warm(e, depth + 1);
    }
  } else {
    for (const c of chunks) {
      const e = enc(c);
      if (!seen.has(e)) { seen.add(e); fetchText(e); }
    }
  }
}

console.log("warming /");
warm("/", 0);
console.log(JSON.stringify({ discovered: seen.size, fetched, errors }));
import { writeFileSync } from "fs";
writeFileSync("/home/z/my-project/scripts/tmp/chunk-warm-list.txt", [...seen].join("\n"));
