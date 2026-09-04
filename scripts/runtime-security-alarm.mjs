#!/usr/bin/env node
import fs from 'node:fs';

const target = process.env.TARGET_URL || 'https://pieinears.ai';
const started = Date.now();
const findings = [];
let status = 0;
let finalUrl = target;
let body = '';
let headers = new Headers();

function finding(severity, check, detail, action) {
  findings.push({ severity, check, detail, action });
}

try {
  const response = await fetch(target, {
    redirect: 'follow',
    signal: AbortSignal.timeout(15000),
    headers: { 'user-agent': 'Pie-Security-Alarm/1.0' },
  });
  status = response.status;
  finalUrl = response.url;
  headers = response.headers;
  body = (await response.text()).slice(0, 250000);
  if (!response.ok) finding('CRITICAL', 'Availability', `Production returned HTTP ${status}.`, 'Inspect the latest deployment and runtime logs immediately.');
} catch (error) {
  finding('CRITICAL', 'Availability or TLS', error instanceof Error ? error.message : String(error), 'Check DNS, TLS certificates, deployment status, and provider incidents.');
}

const latency = Date.now() - started;
if (latency > 8000) finding('HIGH', 'Latency', `Production response took ${latency} ms.`, 'Inspect slow functions, upstream APIs, and regional performance.');
else if (latency > 4000) finding('MEDIUM', 'Latency', `Production response took ${latency} ms.`, 'Review function duration and external-service timing.');

const suspiciousPatterns = [
  [/hacked\s+by/i, 'Defacement phrase'],
  [/document\.write\s*\([^)]*(iframe|script)/i, 'Injected script construction'],
  [/(coinhive|cryptonight|webminer|coinimp)/i, 'Cryptomining marker'],
  [/<iframe[^>]+src=["']https?:\/\/[^"']+/i, 'Unexpected remote iframe'],
];
for (const [pattern, label] of suspiciousPatterns) {
  if (pattern.test(body)) finding('CRITICAL', 'Suspicious content', `${label} detected in the production response.`, 'Take the site out of rotation if confirmed, preserve evidence, rotate credentials, and investigate the deployment source.');
}

const requiredHeaders = [
  ['strict-transport-security', 'HSTS'],
  ['content-security-policy', 'Content Security Policy'],
  ['x-content-type-options', 'MIME sniffing protection'],
  ['referrer-policy', 'Referrer policy'],
];
for (const [name, label] of requiredHeaders) {
  if (!headers.get(name)) finding('MEDIUM', 'Security header', `${label} is missing.`, `Add and test the ${name} response header.`);
}

const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
findings.sort((a, b) => order[a.severity] - order[b.severity]);
const counts = Object.fromEntries(Object.keys(order).map((severity) => [severity, findings.filter((item) => item.severity === severity).length]));
const overall = counts.CRITICAL ? 'CRITICAL' : counts.HIGH ? 'HIGH' : counts.MEDIUM ? 'MEDIUM' : 'LOW';
const rows = findings.length
  ? findings.map((item) => `| ${item.severity} | ${item.check} | ${item.detail.replaceAll('|', '\\|')} | ${item.action.replaceAll('|', '\\|')} |`).join('\n')
  : '| LOW | Baseline | No suspicious conditions detected. | Continue monitoring. |';

const report = `# Pie Runtime Security Alarm Report

Generated: ${new Date().toISOString()}
Target: ${target}
Final URL: ${finalUrl}
HTTP status: ${status || 'unavailable'}
Response time: ${latency} ms
Overall signal: **${overall}**

## Findings

| Risk | Check | Finding | Recommended response |
|---|---|---|---|
${rows}

## Detection coverage

This alarm detects availability and TLS failures, abnormal latency, common defacement and injected-content markers, unexpected remote iframes, cryptomining markers, and missing browser security headers. CodeQL, dependency audits, and the repository health agent provide separate source-code coverage.

No automated system can detect every attack. Production-grade intrusion detection also requires authenticated log ingestion, anomaly baselines, rate-limit and firewall events, identity-provider alerts, and a tested incident-response process.
`;

fs.writeFileSync(process.argv[2] || 'runtime-alarm-report.md', report);
console.log(`Runtime alarm report generated with ${overall} signal.`);
if (counts.CRITICAL > 0) process.exitCode = 2;
