// 一次性脚本：生成 resources/icon.png（256x256，蓝色渐变 + 简洁的终端符号）
// 用法: node scripts/gen-icon.mjs
import { deflateSync } from 'node:zlib'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const W = 256
const H = 256
const px = Buffer.alloc(W * H * 4)

// 背景：深蓝 -> 紫 渐变
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const t = x / W
    const r = Math.round(36 + t * 60) // 36 -> 96
    const g = Math.round(55 + t * 30) // 55 -> 85
    const b = Math.round(120 + t * 110) // 120 -> 230
    const i = (y * W + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = 255
  }
}

// 中间画一个浅色终端提示符 ">_"
function fill(x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) {
    for (let xx = x; xx < x + w; xx++) {
      if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue
      const i = (yy * W + xx) * 4
      px[i] = c[0]
      px[i + 1] = c[1]
      px[i + 2] = c[2]
      px[i + 3] = 255
    }
  }
}
const white = [230, 234, 245]
// ">" 箭头
fill(64, 116, 16, 6, white)
fill(64, 110, 6, 6, white)
fill(64, 122, 6, 6, white)
// 下划线
fill(88, 122, 96, 6, white)

// 手动编码 PNG（无第三方依赖）
function crc32(buf) {
  let c = ~0
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1))
  }
  return ~c >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const t = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])))
  return Buffer.concat([len, t, data, crc])
}

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8 // bit depth
ihdr[9] = 6 // RGBA
// 每行加 filter byte 0
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0
  px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
}

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', deflateSync(raw, { level: 9 })),
  chunk('IEND', Buffer.alloc(0))
])

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'resources', 'icon.png')
mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, png)
console.log('written', out, png.length, 'bytes')
