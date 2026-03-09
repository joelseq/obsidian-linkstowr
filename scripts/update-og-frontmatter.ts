#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net
/**
 * Backfill `description` and `image` frontmatter fields in existing Obsidian
 * notes by fetching their OG meta tags.
 *
 * Skips notes that:
 *   - have no `url` frontmatter field
 *   - already have both `description` and `image` set
 *
 * Usage (local):
 *   deno run --allow-read --allow-write --allow-net scripts/update-og-frontmatter.ts <folder-path>
 *
 * One-liner (remote):
 *   deno run --allow-read --allow-write --allow-net https://raw.githubusercontent.com/joelseq/obsidian-linkstowr/main/scripts/update-og-frontmatter.ts <folder-path>
 */

const folderPath = Deno.args[0];

if (!folderPath) {
  console.error('Usage: update-og-frontmatter.ts <folder-path>');
  Deno.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FRONTMATTER_RE = /^(---\n)([\s\S]*?)(\n---)/;

function parseFrontmatterField(fm: string, key: string): string | undefined {
  const match = fm.match(new RegExp(`^${key}:\\s*["']?([^"'\\n]+)["']?`, 'm'));
  return match?.[1]?.trim() || undefined;
}

function hasValue(fm: string, key: string): boolean {
  const val = parseFrontmatterField(fm, key);
  return (
    val !== undefined && val !== '' && val !== 'null' && val !== 'undefined'
  );
}

function extractOGTag(html: string, property: string): string | undefined {
  // Handle both attribute orderings: property first or content first
  const patterns = [
    new RegExp(
      `<meta[^>]+property=["']og:${property}["'][^>]+content=["']([^"']+)["']`,
      'i',
    ),
    new RegExp(
      `<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:${property}["']`,
      'i',
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return undefined;
}

function escapeForYaml(value: string): string {
  // Escape double quotes inside the value
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function injectFields(
  content: string,
  fields: {description?: string; image?: string},
): string {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return content;

  const [fullMatch, open, fm, close] = match;
  let updatedFm = fm;

  if (fields.description) {
    updatedFm += `\ndescription: "${escapeForYaml(fields.description)}"`;
  }
  if (fields.image) {
    updatedFm += `\nimage: "${escapeForYaml(fields.image)}"`;
  }

  return content.replace(fullMatch, open + updatedFm + close);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let processed = 0;
let skippedNoUrl = 0;
let skippedAlreadySet = 0;
let failed = 0;

for await (const entry of Deno.readDir(folderPath)) {
  if (!entry.isFile || !entry.name.endsWith('.md')) continue;

  const filePath = `${folderPath}/${entry.name}`;
  const content = await Deno.readTextFile(filePath);

  const fmMatch = content.match(FRONTMATTER_RE);
  if (!fmMatch) continue;

  const fm = fmMatch[2];

  // Skip if no url field
  const url = parseFrontmatterField(fm, 'url');
  if (!url) {
    skippedNoUrl++;
    continue;
  }

  // Skip if both fields already set
  const hasDescription = hasValue(fm, 'description');
  const hasImage = hasValue(fm, 'image');
  if (hasDescription && hasImage) {
    skippedAlreadySet++;
    continue;
  }

  // Fetch OG tags
  let ogDescription: string | undefined;
  let ogImage: string | undefined;

  try {
    const response = await fetch(url, {
      headers: {'User-Agent': 'Mozilla/5.0 (compatible; og-backfill/1.0)'},
      signal: AbortSignal.timeout(10_000),
    });
    const html = await response.text();
    ogDescription = hasDescription
      ? undefined
      : extractOGTag(html, 'description');
    ogImage = hasImage ? undefined : extractOGTag(html, 'image');
  } catch (err) {
    console.warn(`  [WARN] Failed to fetch ${url}: ${(err as Error).message}`);
    failed++;
    continue;
  }

  // Nothing to inject
  if (!ogDescription && !ogImage) {
    console.log(`  [INFO] No OG tags found for ${entry.name}`);
    processed++;
    continue;
  }

  const updated = injectFields(content, {
    description: ogDescription,
    image: ogImage,
  });

  await Deno.writeTextFile(filePath, updated);
  console.log(`  [OK]   Updated ${entry.name}`);
  processed++;
}

console.log(`
Done.
  Updated/checked : ${processed}
  Skipped (no url): ${skippedNoUrl}
  Skipped (already set): ${skippedAlreadySet}
  Failed          : ${failed}
`);
