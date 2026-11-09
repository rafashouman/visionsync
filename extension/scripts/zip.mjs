// Minimal ZIP STORE writer: packages our own fixed build files without another dependency.
import { readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
function crc32(bytes) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let j = 0; j < 8; j++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)) }
  return (crc ^ 0xffffffff) >>> 0
}
export async function zipExtension(root, files, target) {
  const locals = [], central = []; let offset = 0
  for (const file of files) {
    const data = await readFile(path.join(root, file)), name = Buffer.from(file)
    const header = Buffer.alloc(30); header.writeUInt32LE(0x04034b50); header.writeUInt16LE(20,4); header.writeUInt32LE(crc32(data),14); header.writeUInt32LE(data.length,18); header.writeUInt32LE(data.length,22); header.writeUInt16LE(name.length,26)
    const entry = Buffer.alloc(46); entry.writeUInt32LE(0x02014b50); entry.writeUInt16LE(20,4); entry.writeUInt16LE(20,6); entry.writeUInt32LE(crc32(data),16); entry.writeUInt32LE(data.length,20); entry.writeUInt32LE(data.length,24); entry.writeUInt16LE(name.length,28); entry.writeUInt32LE(offset,42)
    locals.push(header,name,data); central.push(entry,name); offset += header.length + name.length + data.length
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(files.length,8); end.writeUInt16LE(files.length,10); end.writeUInt32LE(dir.length,12); end.writeUInt32LE(offset,16)
  await mkdir(path.dirname(target),{recursive:true}); await writeFile(target,Buffer.concat([...locals,dir,end]))
}
