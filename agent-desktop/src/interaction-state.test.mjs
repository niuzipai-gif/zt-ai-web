import test from 'node:test'
import assert from 'node:assert/strict'
import { authPresentation, shouldSubmitComposer } from './interaction-state.mjs'

test('Enter submits, Shift+Enter preserves a newline, and IME composition is never interrupted', () => {
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false, disabled: false }), true)
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: true, isComposing: false, disabled: false }), false)
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: true, disabled: false }), false)
  assert.equal(shouldSubmitComposer({ key: 'Enter', shiftKey: false, isComposing: false, disabled: true }), false)
  assert.equal(shouldSubmitComposer({ key: 'a', shiftKey: false, isComposing: false, disabled: false }), false)
})

test('auth presentation gives a visible state while login or registration is in flight', () => {
  assert.deepEqual(authPresentation({ registering: false, pending: true }), {
    button: '正在验证账号…',
    status: '正在连接 ZT.AI 服务…',
    busy: true,
  })
  assert.deepEqual(authPresentation({ registering: true, pending: true }), {
    button: '正在提交注册…',
    status: '注册申请已提交，请稍候…',
    busy: true,
  })
  assert.deepEqual(authPresentation({ registering: false, pending: false }), {
    button: '登录',
    status: '',
    busy: false,
  })
})
