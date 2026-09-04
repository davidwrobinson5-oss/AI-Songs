#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const excluded = new Set(['.git', '.next', 'node_modules', 'coverage', 'dist']);
const sourceExtensions = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const findings = [];

function walk(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walk(fullPath));
    else if (sourceExtensions.has(path.extname(entry.name))) files.push(fullPath);
  }
  return files;
}

function add(severity, category, file, message, recommendation) {
  findings.push({ severity, category, file: path.relative(root, file), message, recommendation });
}

const files = walk(root);
let totalLines = 0;
let clientComponents = 0;
let apiRoutes = 0;
let emptyCatches = 0;
let todoCount = 0;

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8');
  const lines = source.split(/\r?\n/);
  totalLines += lines.length;
  if (/^['"]use client['"];?/m.test(source)) clientComponents += 1;
  if (/app[\\/]api[\\/].*[\\/]route\.(ts|js)$/.test(file)) {
    apiRoutes += 1;
    const mutates = /export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/.test(source);
    const hasAuth = /\b(auth|currentUser|getAuth|verifyToken|session|authorization)\b/i.test(source);
    if (mutates && !hasAuth) add('HIGH', 'API authorization', file, 'Mutation route has no obvious authorization check.', 'Verify authentication and resource-level authorization before processing requests.');
  }
  if (/dangerouslySetInnerHTML/.test(source)) add('HIGH', 'Injection', file, 'Uses dangerouslySetInnerHTML.', 'Sanitize trusted input and document why raw HTML is required.');
  if (/\b(eval|new Function)\s*\(/.test(source)) add('CRITICAL', 'Code execution', file, 'Dynamic code execution pattern detected.', 'Remove dynamic evaluation or isolate and strictly validate the input.');
  if (/child_process|\bexecSync?\s*\(/.test(source)) add('HIGH', 'Command execution', file, 'Process execution is present.', 'Avoid shell interpolation and validate every argument at the trust boundary.');
  if (/(sk|pk)_(live|test)_[A-Za-z0-9]{12,}|(?:api|secret)[_-]?key\s*[:=]\s*['"][^'"]{12,}/i.test(source)) add('CRITICAL', 'Secret exposure', file, 'Possible hard-coded credential detected.', 'Remove the credential, rotate it, and load it from the environment.');
  const catches = source.match(/catch\s*(?:\([^)]*\))?\s*\{\s*\}/g) || [];
  if (catches.length) {
    emptyCatches += catches.length;
    add('MEDIUM', 'Reliability', file, `${catches.length} empty catch block(s) hide failures.`, 'Record actionable context or return a safe, visible failure state.');
  }
  const todos = source.match(/\b(TODO|FIXME|HACK)\b/g) || [];
  todoCount += todos.length;
  if (lines.length > 900) add('MEDIUM', 'Maintainability', file, `${lines.length} lines in one source file.`, 'Split the file along feature or responsibility boundaries and add focused tests.');
}

let dependencyCount = 0;
let buildSteps = 0;
const packagePath = path.join(root, 'package.json');
if (fs.existsSync(packagePath)) {
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  dependencyCount = Object.keys({ ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) }).length;
  buildSteps = String(pkg.scripts?.build || '').split('&&').length;
  if (buildSteps > 15) add('HIGH', 'Build architecture', packagePath, `The build command chains ${buildSteps} mutation/build steps.`, 'Replace build-time source patching with committed source modules and a small, reproducible build command.');
  if (!pkg.scripts?.test) add('HIGH', 'Test coverage', packagePath, 'No automated test command is defined.', 'Add unit tests for business logic and integration tests for authentication, billing, uploads, and API routes.');
  if (!pkg.scripts?.lint) add('MEDIUM', 'Code quality', packagePath, 'No lint command is defined.', 'Add ESLint with Next.js and security-focused rules, then enforce it in pull requests.');
}

const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file));
const counts = Object.fromEntries(Object.keys(order).map((severity) => [severity, findings.filter((item) => item.severity === severity).length]));
const risk = counts.CRITICAL ? 'CRITICAL' : counts.HIGH ? 'HIGH' : counts.MEDIUM ? 'MEDIUM' : 'LOW';
const date = new Date().toISOString();
const rows = findings.length
  ? findings.map((item) => `| ${item.severity} | ${item.category} | \`${item.file}\` | ${item.message.replaceAll('|', '\\|')} | ${item.recommendation.replaceAll('|', '\\|')} |`).join('\n')
  : '| LOW | Baseline | — | No heuristic findings. | Continue review and testing. |';

const report = `# Pie Code Health Report

Generated: ${date}

## Executive summary

- Overall risk: **${risk}**
- Critical: ${counts.CRITICAL}
- High: ${counts.HIGH}
- Medium: ${counts.MEDIUM}
- Low: ${counts.LOW}
- Source files scanned: ${files.length}
- Approximate source lines: ${totalLines.toLocaleString()}
- API routes: ${apiRoutes}
- Client components: ${clientComponents}
- Dependencies: ${dependencyCount}
- Build steps: ${buildSteps}
- Empty catch blocks: ${emptyCatches}
- TODO/FIXME/HACK markers: ${todoCount}

## Risk-ranked findings

| Risk | Area | Location | Finding | Recommendation |
|---|---|---|---|---|
${rows}

## Recommended order of work

1. Resolve critical credential or code-execution risks immediately.
2. Add authorization checks and automated tests around API, billing, upload, and user-data boundaries.
3. Simplify the build pipeline so builds do not rewrite application source.
4. Replace silent error handling with observable, user-safe failures.
5. Re-run this report after each remediation and compare risk totals.

## Limits

This report combines deterministic heuristics with dependency and CodeQL workflows. A clean report does not prove the absence of vulnerabilities. Manual threat modeling, access-control review, secret rotation policy, dependency review, and production observability remain necessary.
`;

const output = process.argv[2] || 'code-health-report.md';
fs.writeFileSync(output, report);
console.log(`Code health report written to ${output} with overall risk ${risk}.`);
if (counts.CRITICAL > 0) process.exitCode = 2;
