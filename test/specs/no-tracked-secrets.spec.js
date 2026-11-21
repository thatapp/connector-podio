'use strict';

// ThatApp GitLab #449: the core Sync Podio client secret sat in this repository, in an old
// helpers/oauth-utils.js comment and in lib/test/.globalEnv (which nothing reads). A secret lives
// in the component's environment settings (PODIO_APP_ID / PODIO_APP_SECRET), never in a file.
//
// This spec fails when the repository holds (a) an environment file other than an *.example, or
// (b) a line that gives a SECRET / PASSWORD key a literal value. It never prints a value:
// a failure names the file and line only.
//
// The file list is `git ls-files` when this is a git work tree, otherwise every file under the
// component root except node_modules, so a copy without .git is still checked, never skipped.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');

function listFiles(root) {
    const git = spawnSync('git', ['-C', root, 'ls-files', '-z'], { encoding: 'utf8' });
    if (git.status === 0 && git.stdout) return git.stdout.split('\0').filter(Boolean);
    const out = [];
    (function walk(dir) {
        for (const e of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
            if (e.name === 'node_modules' || e.name === '.git') continue;
            const rel = dir ? `${dir}/${e.name}` : e.name;
            if (e.isDirectory()) walk(rel); else out.push(rel);
        }
    })('');
    return out;
}

// An environment file: .env, .env.local, x.env, .globalEnv ... but not .env.example.
function isEnvFile(rel) {
    const base = path.basename(rel);
    if (/\.example$/i.test(base)) return false;
    return /^\.env(\..+)?$/i.test(base) || /\.env$/i.test(base) || /env$/i.test(base) && base.startsWith('.');
}

// KEY=value or KEY: value (also inside a comment) where KEY names a secret and value is a literal
// of 12+ characters. Placeholders ({{X}}, ${X}, <x>, process.env.X) are not literals.
const SECRET_LINE = /\b[A-Za-z_]*(SECRET|PASSWORD)[A-Za-z_]*\b["']?\s*[:=]\s*["']?([A-Za-z0-9+/_.-]{12,})/i;
function literalSecretLines(text) {
    const hits = [];
    text.split('\n').forEach((line, i) => {
        const m = SECRET_LINE.exec(line);
        if (!m) return;
        const v = m[2];
        if (/^process\.env/.test(v) || /^(true|false|null|undefined)$/i.test(v)) return;
        if (/[A-Za-z]/.test(v) && /[0-9]/.test(v)) hits.push(i + 1);
    });
    return hits;
}

function findings(root) {
    const out = [];
    for (const rel of listFiles(root)) {
        if (/^node_modules\//.test(rel) || /package-lock\.json$/.test(rel)) continue;
        if (/\.(png|jpe?g|gif|ico|svg|woff2?|ttf|zip|gz)$/i.test(rel)) continue;
        if (isEnvFile(rel)) out.push(`${rel}: an environment file is committed`);
        let text;
        try { text = fs.readFileSync(path.join(root, rel), 'utf8'); } catch (e) { continue; }
        for (const n of literalSecretLines(text)) out.push(`${rel}:${n}: a secret key has a literal value`);
    }
    return out;
}

describe('no secret is committed to this repository (ThatApp #449)', () => {
    it('the detector sees a planted environment file and a planted secret line (control)', () => {
        assert.strictEqual(isEnvFile('lib/test/.globalEnv'), true);
        assert.strictEqual(isEnvFile('test/.env'), true);
        assert.strictEqual(isEnvFile('test/.env.example'), false);
        assert.deepStrictEqual(literalSecretLines('A=1\nPODIO_APP_SECRET=' + 'abc123'.repeat(4) + '\n'), [2]);
        assert.deepStrictEqual(literalSecretLines('// client_secret: ' + 'Zx9'.repeat(6)), [1]);
        assert.deepStrictEqual(literalSecretLines('"client_secret": "{{PODIO_APP_SECRET}}"'), []);
        assert.deepStrictEqual(literalSecretLines('const s = process.env.PODIO_APP_SECRET;'), []);
    });

    it('the repository holds no environment file and no literal secret', () => {
        const f = findings(ROOT);
        assert.deepStrictEqual(f, [], `\n${f.join('\n')}`);
    });
});

module.exports = { findings, isEnvFile, literalSecretLines };
