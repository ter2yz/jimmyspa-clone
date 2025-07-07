// scripts/snapshot-site.ts
import axios from "axios";
import * as cheerio from "cheerio";
import crypto from "crypto";
import fs from "fs";
import path from "path";

const BASE_URL = "https://jimmyspa.com/tw";
const SNAPSHOT_DIR = "./snapshots";

const visited = new Set<string>();
const urlQueue: string[] = [BASE_URL];

// Make sure snapshots directory exists
fs.mkdirSync(SNAPSHOT_DIR, { recursive: true });

// Normalize URLs (e.g., remove fragments, trailing slashes)
function normalizeUrl(url: string): string {
  const u = new URL(url);
  u.hash = "";
  return u.href.replace(/\/$/, "");
}

// Hash content
function hashContent(content: string): string {
  return crypto.createHash("sha256").update(content).digest("hex");
}

// Load stored hash
function loadHash(fileName: string): string | null {
  const fullPath = path.join(SNAPSHOT_DIR, fileName);
  return fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf8") : null;
}

// Save new hash
function saveHash(fileName: string, hash: string) {
  fs.writeFileSync(path.join(SNAPSHOT_DIR, fileName), hash);
}

// Convert URL to safe filename
function urlToFilename(url: string): string {
  return encodeURIComponent(normalizeUrl(url)) + ".hash";
}

async function crawl() {
  console.log("🔍 Crawling:", BASE_URL);
  let hasChanges = false;

  while (urlQueue.length > 0) {
    const currentUrl = urlQueue.shift()!;
    const normalized = normalizeUrl(currentUrl);
    if (visited.has(normalized)) continue;
    visited.add(normalized);

    try {
      const { data: html } = await axios.get(currentUrl, { timeout: 10000 });
      const $ = cheerio.load(html);

      // Hash and compare
      const hash = hashContent(html);
      const fileName = urlToFilename(currentUrl);
      const oldHash = loadHash(fileName);

      if (hash !== oldHash) {
        console.log(`⚠️ Changed: ${currentUrl}`);
        hasChanges = true;
        saveHash(fileName, hash);
      } else {
        console.log(`✅ Unchanged: ${currentUrl}`);
      }

      // Find internal links
      $("a[href]").each((_, el) => {
        const href = $(el).attr("href");
        if (!href) return;

        const fullUrl = new URL(href, BASE_URL).href;
        if (fullUrl.startsWith(BASE_URL) && !visited.has(normalizeUrl(fullUrl))) {
          urlQueue.push(fullUrl);
        }
      });
    } catch (err) {
      console.warn(`❌ Failed to fetch ${currentUrl}:`, (err as Error).message);
    }
  }

  if (!hasChanges) {
    console.log("✅ No changes detected across all pages.");
  }
}

crawl();
