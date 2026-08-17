import assert from 'node:assert/strict';
import test from 'node:test';
import {
  hasCookie,
  isSameOriginRequest,
  readOrIncrementVisitors,
  removeOwnerFromVisitorCount,
} from '../functions/_lib/visitors.js';

class FakeDatabase {
  value = 0;

  prepare(sql) {
    return {
      run: async () => {
        if (sql.includes('INSERT OR IGNORE') && !Number.isSafeInteger(this.value)) this.value = 0;
        if (sql.includes('MAX(value - 1')) this.value = Math.max(0, this.value - 1);
      },
      first: async () => {
        if (sql.includes('UPDATE visitor_counter')) this.value += 1;
        return { value: this.value };
      },
    };
  }
}

test('a browser is counted once and receives a cookie marker', async () => {
  const database = new FakeDatabase();
  const first = await readOrIncrementVisitors(new Request('https://example.com/api/site', {
    method: 'POST',
    headers: { Origin: 'https://example.com' },
  }), database);
  const repeat = await readOrIncrementVisitors(new Request('https://example.com/api/site', {
    method: 'POST',
    headers: {
      Cookie: 'another=x; dott_visitor=v1',
      Origin: 'https://example.com',
    },
  }), database);

  assert.deepEqual(first, { count: 1, setVisitorCookie: true });
  assert.deepEqual(repeat, { count: 1, setVisitorCookie: false });
});

test('the owner cookie prevents counting', async () => {
  const database = new FakeDatabase();
  const request = new Request('https://example.com/api/site', {
    method: 'POST',
    headers: {
      Cookie: 'dott_owner=v1',
      Origin: 'https://example.com',
    },
  });
  const result = await readOrIncrementVisitors(request, database);
  assert.deepEqual(result, { count: 0, setVisitorCookie: false });
  assert.equal(hasCookie(request, 'dott_owner=v1'), true);
});

test('cross-origin and direct requests can read but cannot increment', async () => {
  const database = new FakeDatabase();
  const request = new Request('https://example.com/api/site', {
    method: 'POST',
    headers: { Origin: 'https://another.example' },
  });
  const result = await readOrIncrementVisitors(request, database);
  assert.deepEqual(result, { count: 0, setVisitorCookie: false });
  assert.equal(isSameOriginRequest(request), false);
});

test('promoting an already counted browser to owner removes its one visit', async () => {
  const database = new FakeDatabase();
  database.value = 4;
  const visitor = new Request('https://example.com/api/owner', {
    method: 'POST',
    headers: { Cookie: 'dott_visitor=v1' },
  });
  const owner = new Request('https://example.com/api/owner', {
    method: 'POST',
    headers: { Cookie: 'dott_visitor=v1; dott_owner=v1' },
  });

  assert.equal(await removeOwnerFromVisitorCount(visitor, database), true);
  assert.equal(database.value, 3);
  assert.equal(await removeOwnerFromVisitorCount(owner, database), false);
  assert.equal(database.value, 3);
});
