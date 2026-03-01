import fs from 'node:fs/promises';

const DEFAULT_CONFIG = 'scripts/stars/star-lists.config.json';

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a) continue;
    if (a === '--config') {
      args.config = argv[i + 1];
      i += 1;
      continue;
    }
    if (a === '--help' || a === '-h') {
      args.help = true;
      continue;
    }
    if (a.startsWith('-')) {
      throw new Error(`Unknown arg: ${a}`);
    }
    args._.push(a);
  }
  return args;
}

function parseRepoFromMdxLine(line) {
  const match = line.match(/\]\(https:\/\/github\.com\/([^/\s)]+)\/([^/\s)]+)\)/);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

function extractReposFromStarListHtml(html) {
  const repos = new Set();
  const re = /<a\s+href="\/([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)"/g;
  for (const match of html.matchAll(re)) {
    const owner = match[1];
    const repo = match[2];
    if (!owner || !repo) continue;

    // Avoid common non-repo paths that can appear in GitHub headers/footers.
    if (owner === 'features' || owner === 'about' || owner === 'collections' || owner === 'topics') continue;
    if (owner === 'settings' || owner === 'notifications' || owner === 'pricing') continue;

    repos.add(`${owner}/${repo}`);
  }
  return repos;
}

function extractNextPageUrl(html, baseUrl) {
  const match = html.match(/rel="next"[^>]*href="([^"]+)"/) || html.match(/href="([^"]+)"[^>]*rel="next"/);
  if (!match) return null;
  try {
    return new URL(match[1], baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchAllStarListRepos(listUrl) {
  const repos = new Set();
  let url = listUrl;
  let page = 1;

  while (url) {
    const res = await fetch(url, {
      headers: {
        Accept: 'text/html',
        'User-Agent': 'star-lists-checker',
      },
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Failed to fetch ${url} (HTTP ${res.status})${body ? `: ${body.slice(0, 200)}` : ''}`);
    }
    const html = await res.text();

    for (const r of extractReposFromStarListHtml(html)) repos.add(r);

    const nextUrl = extractNextPageUrl(html, url);
    if (!nextUrl) break;
    url = nextUrl;
    page += 1;

    // Safety: avoid infinite loops on markup changes.
    if (page > 20) throw new Error(`Too many pages while fetching ${listUrl}; aborting at page ${page}`);
  }

  return repos;
}

function formatList(items) {
  return items.map((s) => `- ${s}`).join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      [
        'Usage:',
        '  node scripts/stars/check-star-lists.mjs [--config <path>]',
        '',
        'Default config:',
        `  ${DEFAULT_CONFIG}`,
      ].join('\n')
    );
    return;
  }

  const configPath = args.config || args._[0] || DEFAULT_CONFIG;
  const configRaw = await fs.readFile(configPath, 'utf8');
  const config = JSON.parse(configRaw);

  const indexFile = config.indexFile;
  if (!indexFile) throw new Error(`Missing "indexFile" in ${configPath}`);

  const lists = config.lists;
  if (!Array.isArray(lists) || lists.length === 0) throw new Error(`Missing/empty "lists" in ${configPath}`);

  const indexRaw = await fs.readFile(indexFile, 'utf8');
  const indexRepos = new Set();
  for (const line of indexRaw.split('\n')) {
    const r = parseRepoFromMdxLine(line);
    if (r) indexRepos.add(r);
  }

  if (indexRepos.size === 0) throw new Error(`No GitHub repositories found in ${indexFile}`);

  console.log(`Index repos: ${indexRepos.size} (${indexFile})`);

  let hasMissing = false;
  for (const list of lists) {
    const key = list?.key;
    const url = list?.url;
    if (!key || !url) throw new Error(`Invalid list entry in ${configPath}: ${JSON.stringify(list)}`);

    const listRepos = await fetchAllStarListRepos(url);
    const missing = Array.from(listRepos).filter((r) => !indexRepos.has(r)).sort((a, b) => a.localeCompare(b));

    console.log(`\n[${key}] repos: ${listRepos.size} (${url})`);
    if (missing.length === 0) {
      console.log(`[${key}] OK: no missing repos in index`);
      continue;
    }

    hasMissing = true;
    console.log(`[${key}] Missing in index (${missing.length}):\n${formatList(missing)}`);
  }

  if (hasMissing) {
    process.exitCode = 1;
  }
}

await main();

