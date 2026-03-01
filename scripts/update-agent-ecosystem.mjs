import fs from 'node:fs/promises';

const DEFAULT_TARGET = 'indexes/agent-ecosystem.mdx';
const GITHUB_API_BASE = 'https://api.github.com';
const API_VERSION = '2022-11-28';

function formatStars(stars) {
  return new Intl.NumberFormat('en-US').format(stars);
}

function parseRepoFromLine(line) {
  const match = line.match(/\]\(https:\/\/github\.com\/([^/\s)]+)\/([^/\s)]+)\)/);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) return null;
  return `${owner}/${repo}`;
}

async function fetchRepoStars(fullName, { token }) {
  const [owner, repo] = fullName.split('/');
  const url = `${GITHUB_API_BASE}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;

  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'agent-ecosystem-star-updater',
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const res = await fetch(url, { headers, signal: controller.signal });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      const err = new Error(`GitHub API error ${res.status} for ${fullName}${body ? `: ${body.slice(0, 200)}` : ''}`);
      err.status = res.status;
      throw err;
    }
    const json = await res.json();
    if (typeof json.stargazers_count !== 'number') {
      throw new Error(`Unexpected response for ${fullName}: missing stargazers_count`);
    }
    return json.stargazers_count;
  } finally {
    clearTimeout(timeout);
  }
}

async function mapWithConcurrency(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  async function worker() {
    while (true) {
      const i = index++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

async function main() {
  const targetFile = process.argv[2] || DEFAULT_TARGET;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || '';
  const maxConcurrency = Number.parseInt(process.env.MAX_CONCURRENCY || '8', 10);

  const original = await fs.readFile(targetFile, 'utf8');
  const lines = original.split('\n');

  const reposInFile = new Set();
  for (const line of lines) {
    const fullName = parseRepoFromLine(line);
    if (fullName) reposInFile.add(fullName);
  }

  const repos = Array.from(reposInFile).sort((a, b) => a.localeCompare(b));
  if (repos.length === 0) {
    throw new Error(`No GitHub repositories found in ${targetFile}`);
  }

  console.log(`Found ${repos.length} repositories in ${targetFile}`);
  if (!token) {
    console.log('No GITHUB_TOKEN provided; using unauthenticated GitHub API requests (rate-limited).');
  }

  const starsByRepo = new Map();
  const warnings = [];

  await mapWithConcurrency(repos, Number.isFinite(maxConcurrency) ? Math.max(1, maxConcurrency) : 8, async (fullName) => {
    try {
      const stars = await fetchRepoStars(fullName, { token });
      starsByRepo.set(fullName, stars);
      return stars;
    } catch (err) {
      warnings.push(`${fullName}: ${err.message}`);
      return null;
    }
  });

  let updatedRepoLines = 0;
  const updatedLines = lines.map((line) => {
    if (!line.includes('https://github.com/')) return line;

    const fullName = parseRepoFromLine(line);
    if (!fullName) return line;

    const stars = starsByRepo.get(fullName);
    if (typeof stars !== 'number') return line;

    const formatted = formatStars(stars);
    if (line.includes('⭐')) {
      const next = line.replace(/⭐\s*[\d,]+/g, `⭐ ${formatted}`);
      if (next !== line) updatedRepoLines += 1;
      return next;
    }

    const insertBefore = '；来自：';
    if (line.includes(insertBefore)) {
      updatedRepoLines += 1;
      return line.replace(insertBefore, `；⭐ ${formatted}${insertBefore}`);
    }

    const closeParen = '）';
    if (line.includes(closeParen)) {
      updatedRepoLines += 1;
      return line.replace(closeParen, `；⭐ ${formatted}${closeParen}`);
    }

    updatedRepoLines += 1;
    return `${line}（⭐ ${formatted}）`;
  });

  const updatedContent = updatedLines.join('\n');

  if (updatedContent === original) {
    console.log('No changes detected.');
  } else {
    await fs.writeFile(targetFile, updatedContent, 'utf8');
    console.log(`Updated ${updatedRepoLines} repository lines.`);
  }

  if (warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of warnings) console.log(`- ${w}`);
  }
}

await main();
