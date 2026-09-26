import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSandboxNetworkNoise } from '../src/console-noise.ts';

test('a photo or font the sandbox blocked is not the student error', () => {
  assert.equal(isSandboxNetworkNoise('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT.Inspector'), true);
  assert.equal(isSandboxNetworkNoise('Failed to load resource: net::ERR_BLOCKED_BY_CLIENT'), true);
  assert.equal(isSandboxNetworkNoise('Failed to load resource: net::ERR_INTERNET_DISCONNECTED'), true);
});

test("errors raised by the student's own code still count", () => {
  assert.equal(isSandboxNetworkNoise('Uncaught TypeError: x is not a function'), false);
  assert.equal(isSandboxNetworkNoise('boom'), false);
  assert.equal(isSandboxNetworkNoise('My log says Failed to load resource: net::ERR_X'), false);
});
