import test from 'node:test'
import assert from 'node:assert/strict'
import { publicTaskFailure } from './public-errors.mjs'

test('task failures preserve an actionable public message without leaking secrets', () => {
  assert.equal(publicTaskFailure(new Error('fetch failed: ECONNREFUSED http://127.0.0.1:8788')), '网关或网络连接暂时不可用，请检查网络与桌面服务后重试。')
  assert.equal(publicTaskFailure(new Error('ZT.buddy 执行内核尚未安装，请使用完整桌面安装包。')), 'ZT.buddy 执行内核尚未安装，请使用完整桌面安装包。')
  assert.doesNotMatch(publicTaskFailure(new Error('provider sk-test-secret-1234567890 failed')), /sk-test-secret/)
})
