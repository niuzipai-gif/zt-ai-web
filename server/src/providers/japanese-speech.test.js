import test from 'node:test'
import assert from 'node:assert/strict'
import { japaneseSpeechReadings } from './japanese-speech.js'
import { cleanVoiceText } from './mmx.js'
test('Japanese calendar dates and counters have explicit spoken readings', () => {
  assert.equal(japaneseSpeechReadings('九月十五日までに二十五個です。'), 'くがつ、じゅうごにちまでににじゅうごこです。')
  assert.equal(japaneseSpeechReadings('４月１日、7月14日、12月24日。'), 'しがつ、ついたち、しちがつ、じゅうよっか、じゅうにがつ、にじゅうよっか。')
  assert.equal(japaneseSpeechReadings('1個、6個、8個、10個、20個、26個。'), 'いっこ、ろっこ、はっこ、じゅっこ、にじゅっこ、にじゅうろっこ。')
  for (const value of ['13月32日', '9/15', '3個月', '20日間', '商品A25個', '商品A9月15日', '二百二十個']) assert.equal(japaneseSpeechReadings(value), value)
  assert.equal(cleanVoiceText('九月十五日买二十五个。', 'zh'), '九月十五日买二十五个。')
  assert.equal(cleanVoiceText('September 15: 25 units.', 'en'), 'September 15: 25 units.')
})
