'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

describe('Native component publication', function () {
    it('declares a deployable component version and a supported native runtime', function () {
        const component = require('../../component.json');
        const pkg = require('../../package.json');
        assert.match(component.version || '', /^\d+\.\d+\.\d+$/);
        assert.strictEqual(component.version, pkg.version);
        assert.strictEqual(pkg.engines.node, '24.x');
    });

    it('loads every declared function without importing another platform runtime', function () {
        const script = `
            const Module = require('module');
            const load = Module._load;
            Module._load = function (name) {
                if (['elasticio-node', 'elasticio-sailor-nodejs'].includes(name)) {
                    throw new Error('VENDOR_RUNTIME_DISALLOWED');
                }
                return load.apply(this, arguments);
            };
            const component = require('./component.json');
            const entries = [...Object.values(component.actions), ...Object.values(component.triggers)];
            let loaded = 0;
            for (const entry of entries) {
                const fn = require(entry.main);
                if (typeof fn.process !== 'function') throw new Error('MISSING_PROCESS');
                loaded++;
            }
            console.log(JSON.stringify({ loaded }));
        `;
        const result = spawnSync(process.execPath, ['-e', script], {
            cwd: path.resolve(__dirname, '../..'), encoding: 'utf8', timeout: 20000,
            env: { ...process.env, NODE_OPTIONS: '' }
        });
        assert.strictEqual(result.status, 0, result.stderr);
        const output = result.stdout.trim().split(/\r?\n/).pop();
        assert.ok(JSON.parse(output).loaded > 100);
    });
});
