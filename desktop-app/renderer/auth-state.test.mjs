import test from 'node:test'
import assert from 'node:assert/strict'
import { clearAuthToken, persistModel, readAuthToken, saveAuthToken } from './auth-state.mjs'

function storage() { const values = new Map(); return { getItem: key => values.get(key) || null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) } }

test('desktop auth token gates access and logout clears it', () => {
  const store = storage()
  assert.equal(readAuthToken(store), '')
  saveAuthToken(store, 'token-1')
  assert.equal(readAuthToken(store), 'token-1')
  clearAuthToken(store)
  assert.equal(readAuthToken(store), '')
})

test('desktop model switch only persists a supported model', () => {
  const store = storage()
  assert.equal(persistModel(store, 'DEEPSEEK'), 'DEEPSEEK')
  assert.equal(readAuthToken(store), '')
  assert.equal(store.getItem('zt-ai:agent-model'), 'DEEPSEEK')
  assert.equal(persistModel(store, 'unknown'), 'MINIMAX')
})

