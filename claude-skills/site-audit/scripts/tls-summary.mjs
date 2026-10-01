// Condenses testssl.sh JSON into grade, score, problems and key facts.
import fs from 'fs';
import path from 'path';
import { outDir, writeJson } from './lib.mjs';
const dir = outDir();
const file = path.join(dir, 'tls.json');
if (!fs.existsSync(file)) { writeJson(dir, 'tls-summary.json', { error: 'tls.json missing; see tls.err' }); process.exit(0); }
let d;
try { d = JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { writeJson(dir, 'tls-summary.json', { error: 'tls.json unreadable: ' + e.message }); process.exit(0); }
const by = id => d.find(x => x.id === id)?.finding;
const rank = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, WARN: 4 };
const caa = fs.existsSync(path.join(dir, 'caa.txt')) ? fs.readFileSync(path.join(dir, 'caa.txt'), 'utf8').split('\n').filter(l => l && !l.startsWith('apex=')) : null;
const summary = {
  grade: by('overall_grade'), score: by('final_score'),
  gradeCaps: d.filter(x => /^grade_cap_reason/.test(x.id)).map(x => x.finding),
  problems: d.filter(x => x.severity in rank && x.id !== 'engine_problem').sort((a, b) => rank[a.severity] - rank[b.severity]).map(x => ({ severity: x.severity, id: x.id, finding: x.finding })),
  protocols: Object.fromEntries(['SSLv2', 'SSLv3', 'TLS1', 'TLS1_1', 'TLS1_2', 'TLS1_3'].map(p => [p, by(p)])),
  postQuantum: d.filter(x => /MLKEM|Kyber/i.test(x.finding)).map(x => `${x.id}: ${x.finding}`).slice(0, 3),
  cert: { notAfter: by('cert_notAfter'), issuer: by('cert_caIssuers'), key: by('cert_keySize'), sigAlg: by('cert_signatureAlgorithm'), chain: by('cert_chain_of_trust'), ct: by('certificate_transparency') },
  hsts: by('HSTS_time') || by('HSTS'), caaRecords: caa,
  vulnerabilities: d.filter(x => ['heartbleed', 'CCS', 'ticketbleed', 'ROBOT', 'secure_renego', 'secure_client_renego', 'CRIME_TLS', 'BREACH', 'POODLE_SSL', 'fallback_SCSV', 'SWEET32', 'FREAK', 'DROWN', 'LOGJAM', 'BEAST', 'LUCKY13', 'winshock', 'RC4'].includes(x.id)).map(x => `${x.id}: ${x.severity} ${x.finding}`),
};
writeJson(dir, 'tls-summary.json', summary);
console.log(`tls ok: ${summary.grade} (${summary.score}), ${summary.problems.length} problems`);
