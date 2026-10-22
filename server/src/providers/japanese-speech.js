const months = ['いちがつ', 'にがつ', 'さんがつ', 'しがつ', 'ごがつ', 'ろくがつ', 'しちがつ', 'はちがつ', 'くがつ', 'じゅうがつ', 'じゅういちがつ', 'じゅうにがつ']
const digits = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九']
const readings = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう']
function number(value) {
  const text = value.normalize('NFKC')
  if (/^\d+$/.test(text)) return Number(text)
  if (text === '十') return 10
  if (digits.includes(text)) return digits.indexOf(text)
  const parts = text.split('十')
  if (parts.length !== 2 || (parts[0] && !digits.includes(parts[0])) || (parts[1] && !digits.includes(parts[1]))) return NaN
  return (parts[0] ? digits.indexOf(parts[0]) : 1) * 10 + (parts[1] ? digits.indexOf(parts[1]) : 0)
}
function spokenNumber(n) { return (n >= 20 ? readings[Math.floor(n / 10)] : '') + (n >= 10 ? 'じゅう' : '') + readings[n % 10] }
function day(n) {
  const irregular = { 1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか', 6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか', 14: 'じゅうよっか', 20: 'はつか', 24: 'にじゅうよっか' }
  return irregular[n] || spokenNumber(n) + 'にち'
}

// Only the spoken copy changes. Restrict to explicit calendar dates and the 個
// counter; leave standalone numbers, durations, IDs and ambiguous dates alone.
export function japaneseSpeechReadings(text) {
  const numeric = '[0-9０-９〇一二三四五六七八九十]+'
  const boundary = '(?<![A-Za-z0-9０-９〇一二三四五六七八九十百千万億])'
  return text.replace(new RegExp(`${boundary}(${numeric})月(${numeric})日(?!間)`, 'gu'), (whole, m, d) => {
    const month = number(m), date = number(d)
    // A small prosodic boundary prevents the month/day syllables blending.
    return month >= 1 && month <= 12 && date >= 1 && date <= 31 ? months[month - 1] + '、' + day(date) : whole
  }).replace(new RegExp(`${boundary}(${numeric})個(?!月)`, 'gu'), (whole, value) => {
    const n = number(value)
    if (!(n >= 1 && n <= 99)) return whole
    const special = { 1: 'いっこ', 6: 'ろっこ', 8: 'はっこ' }
    if (n % 10 === 0) return (n >= 20 ? readings[Math.floor(n / 10)] : '') + 'じゅっこ'
    return (n >= 10 ? spokenNumber(n - n % 10) : '') + (special[n % 10] || readings[n % 10] + 'こ')
  })
}
