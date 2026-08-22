import test from 'node:test'
import assert from 'node:assert/strict'
import { createNavigationState, goBack, goForward, pushNavigationState } from './navigation-state.mjs'

test('application navigation traverses chat snapshots without browser history', () => {
  let state = createNavigationState({ chatId: 'chat-a', mode: 'BUDDY', railCollapsed: false })
  state = pushNavigationState(state, { chatId: 'chat-b', mode: 'BUDDY', railCollapsed: true })

  assert.equal(goBack(state).current.chatId, 'chat-a')
  assert.equal(goForward(goBack(state)).current.chatId, 'chat-b')
})

test('application navigation disables traversal at the first and final snapshot', () => {
  const state = createNavigationState({ chatId: 'chat-a', mode: 'CHAT', railCollapsed: false })
  assert.equal(goBack(state).canGoBack, false)
  assert.equal(goForward(state).canGoForward, false)
})
