/* eslint-disable no-sync */

import { readdirSync, readFileSync, lstatSync, writeFileSync } from 'fs'
import * as path from 'path'

/**
 * The embedded git binaries from dugite are built on Ubuntu, where
 * libcurl-gnutls carries versioned symbols (the CURL_GNUTLS_3 version node
 * added by Debian's packaging).
 *
 * This strips the version requirement on libcurl from the embedded git
 * binaries: the Elf64_Verneed entry for libcurl is removed and the affected
 * .gnu.version entries are remapped to VER_NDX_GLOBAL (unversioned). Since
 * libcurl has a single version node, unversioned symbol resolution yields the
 * exact same symbols on every distro.
 */
export function removeCurlVersionRequirements(gitDir: string) {
  let patchedCount = 0
  for (const file of findExecutables(gitDir)) {
    const buf = readFileSync(file)
    let patched: boolean
    try {
      patched = removeVersionRequirement(buf, 'libcurl')
    } catch (e) {
      throw new Error(
        `Failed to remove libcurl version requirement from ${file}: ${e}`
      )
    }
    if (patched) {
      writeFileSync(file, buf)
      patchedCount++
      console.log(
        `    Removed libcurl version requirement from ${path.basename(file)}`
      )
    }
  }
  if (patchedCount === 0) {
    throw new Error(
      `No git binary in ${gitDir} required versioned libcurl symbols. ` +
        'If dugite no longer links against a symbol-versioned libcurl, ' +
        'this build step is obsolete and should be removed.'
    )
  }
}

function findExecutables(dir: string): ReadonlyArray<string> {
  const files = []
  for (const entry of readdirSync(dir, {
    recursive: true,
    withFileTypes: true,
  })) {
    const file = path.join(entry.parentPath, entry.name)
    if (entry.isFile() && (lstatSync(file).mode & 0o111) !== 0) {
      files.push(file)
    }
  }
  return files
}

// Minimal ELF64 little-endian struct definitions (see elf.h)
type FieldType = 'u16' | 'u32' | 'u64'
type StructSpec = Record<string, FieldType>
type StructValue<S extends StructSpec> = { [K in keyof S]: number }

const fieldSizes: Record<FieldType, number> = { u16: 2, u32: 4, u64: 8 }

const safeNumber = (value: bigint) => {
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`64-bit value ${value} exceeds safe integer range`)
  }
  return Number(value)
}

/**
 * Describes a fixed-layout binary struct as an ordered list of named fields,
 * providing read/write of whole struct values at a given buffer offset.
 * Field offsets are derived from the declaration order, as in a C struct.
 */
function defineStruct<S extends StructSpec>(spec: S) {
  const fields: Array<{ name: string; type: FieldType; offset: number }> = []
  let size = 0
  for (const [name, type] of Object.entries(spec)) {
    fields.push({ name, type, offset: size })
    size += fieldSizes[type]
  }

  const read = (buf: Buffer, offset: number): StructValue<S> => {
    if (offset < 0 || offset + size > buf.length) {
      throw new Error(`struct read out of bounds at offset ${offset}`)
    }
    const value: Record<string, number> = {}
    for (const f of fields) {
      const fieldOffset = offset + f.offset
      value[f.name] =
        f.type === 'u16'
          ? buf.readUInt16LE(fieldOffset)
          : f.type === 'u32'
          ? buf.readUInt32LE(fieldOffset)
          : safeNumber(buf.readBigUInt64LE(fieldOffset))
    }
    return value as StructValue<S>
  }

  const write = (buf: Buffer, offset: number, value: StructValue<S>) => {
    for (const f of fields) {
      const fieldOffset = offset + f.offset
      if (f.type === 'u16') {
        buf.writeUInt16LE(value[f.name], fieldOffset)
      } else if (f.type === 'u32') {
        buf.writeUInt32LE(value[f.name], fieldOffset)
      } else {
        buf.writeBigUInt64LE(BigInt(value[f.name]), fieldOffset)
      }
    }
  }

  return { size, read, write }
}

/** Elf64_Ehdr, minus the leading `unsigned char e_ident[EI_NIDENT]` */
const Elf64_Ehdr = defineStruct({
  e_type: 'u16',
  e_machine: 'u16',
  e_version: 'u32',
  e_entry: 'u64',
  e_phoff: 'u64',
  e_shoff: 'u64',
  e_flags: 'u32',
  e_ehsize: 'u16',
  e_phentsize: 'u16',
  e_phnum: 'u16',
  e_shentsize: 'u16',
  e_shnum: 'u16',
  e_shstrndx: 'u16',
})
const EI_NIDENT = 16

const Elf64_Shdr = defineStruct({
  sh_name: 'u32',
  sh_type: 'u32',
  sh_flags: 'u64',
  sh_addr: 'u64',
  sh_offset: 'u64',
  sh_size: 'u64',
  sh_link: 'u32',
  sh_info: 'u32',
  sh_addralign: 'u64',
  sh_entsize: 'u64',
})

const Elf64_Dyn = defineStruct({
  d_tag: 'u64',
  d_val: 'u64',
})

/** A library that some of this binary's undefined symbols require */
const Elf64_Verneed = defineStruct({
  vn_version: 'u16',
  vn_cnt: 'u16',
  vn_file: 'u32',
  vn_aux: 'u32',
  vn_next: 'u32',
})

/** One required version of the library described by the parent Verneed */
const Elf64_Vernaux = defineStruct({
  vna_hash: 'u32',
  vna_flags: 'u16',
  vna_other: 'u16',
  vna_name: 'u32',
  vna_next: 'u32',
})

const SHT_DYNAMIC = 6
const SHT_GNU_verneed = 0x6ffffffe
const SHT_GNU_versym = 0x6fffffff
const DT_NULL = 0
const DT_VERNEEDNUM = 0x6fffffff
const VER_NDX_LOCAL = 0
const VER_NDX_GLOBAL = 1
/** The high bit of a .gnu.version entry is a flag, not part of the index */
const VERSYM_HIDDEN = 0x8000

type Vernaux = ReturnType<typeof Elf64_Vernaux.read>
type SectionHeader = ReturnType<typeof Elf64_Shdr.read> & {
  headerOffset: number
}

interface IVerneedEntry {
  /** Name of the required library, e.g. "libcurl-gnutls.so.4" */
  readonly file: string
  /** Offset of the library name in the string table */
  readonly fileOffset: number
  readonly auxes: ReadonlyArray<Vernaux>
}

interface IParsedElf {
  readonly verneedSection: SectionHeader
  readonly versymSection: SectionHeader
  readonly dynamicSection: SectionHeader
  readonly entries: ReadonlyArray<IVerneedEntry>
}

/**
 * Parses the parts of an ELF64 binary needed to edit its version
 * requirements. Returns null for files this doesn't apply to (non-ELF files
 * such as shell scripts, or binaries without versioned dependencies) and
 * throws on anything malformed.
 */
function parseElf(buf: Buffer): IParsedElf | null {
  // e_ident: magic "\x7fELF", then ELFCLASS64, ELFDATA2LSB
  if (buf.length < EI_NIDENT || buf.readUInt32BE(0) !== 0x7f454c46) {
    return null
  }
  if (buf[4] !== 2 || buf[5] !== 1) {
    throw new Error('only little-endian ELF64 binaries are supported')
  }

  const header = Elf64_Ehdr.read(buf, EI_NIDENT)
  if (header.e_shentsize !== Elf64_Shdr.size) {
    throw new Error(`unexpected section header size ${header.e_shentsize}`)
  }

  const sections: Array<SectionHeader> = []
  for (let i = 0; i < header.e_shnum; i++) {
    const headerOffset = header.e_shoff + i * Elf64_Shdr.size
    sections.push({ ...Elf64_Shdr.read(buf, headerOffset), headerOffset })
  }

  const verneedSection = sections.find(s => s.sh_type === SHT_GNU_verneed)
  const versymSection = sections.find(s => s.sh_type === SHT_GNU_versym)
  const dynamicSection = sections.find(s => s.sh_type === SHT_DYNAMIC)
  if (!verneedSection || !versymSection || !dynamicSection) {
    // No versioned dependencies at all (e.g. a static binary): nothing to do
    return null
  }

  // The string table holding library and version names (normally .dynstr)
  const strtab = sections[verneedSection.sh_link]
  if (strtab === undefined) {
    throw new Error('verneed section links to a nonexistent string table')
  }
  const readString = (offset: number) => {
    const start = strtab.sh_offset + offset
    const end = buf.indexOf(0, start)
    if (offset >= strtab.sh_size || end === -1) {
      throw new Error(`string table read out of bounds at offset ${offset}`)
    }
    return buf.toString('utf8', start, end)
  }

  // sh_info holds the number of Verneed entries; each entry points to a chain
  // of vn_cnt Vernaux entries (one per required version of that library), and
  // both structs use relative offsets to chain to the next one
  const entries: Array<IVerneedEntry> = []
  const sectionEnd = verneedSection.sh_offset + verneedSection.sh_size
  const checkBounds = (offset: number, size: number) => {
    if (offset < verneedSection.sh_offset || offset + size > sectionEnd) {
      throw new Error('verneed entry outside its section')
    }
  }
  let entryOffset = verneedSection.sh_offset
  for (let i = 0; i < verneedSection.sh_info; i++) {
    checkBounds(entryOffset, Elf64_Verneed.size)
    const entry = Elf64_Verneed.read(buf, entryOffset)
    if (entry.vn_version !== 1) {
      throw new Error(`unsupported verneed entry version ${entry.vn_version}`)
    }
    const auxes: Array<Vernaux> = []
    let auxOffset = entryOffset + entry.vn_aux
    for (let j = 0; j < entry.vn_cnt; j++) {
      checkBounds(auxOffset, Elf64_Vernaux.size)
      const aux = Elf64_Vernaux.read(buf, auxOffset)
      auxes.push(aux)
      auxOffset += aux.vna_next
    }
    entries.push({
      file: readString(entry.vn_file),
      fileOffset: entry.vn_file,
      auxes,
    })
    entryOffset += entry.vn_next
  }

  return { verneedSection, versymSection, dynamicSection, entries }
}

/**
 * Removes the version requirement on the given library (matched by name
 * prefix) from an ELF64 binary, editing the buffer in place. Returns true if
 * the buffer was modified, false if there was nothing to remove.
 */
function removeVersionRequirement(buf: Buffer, libPrefix: string): boolean {
  const elf = parseElf(buf)
  if (elf === null) {
    return false
  }

  const kept = elf.entries.filter(e => !e.file.startsWith(libPrefix))
  if (kept.length === elf.entries.length) {
    return false
  }
  const removedIndices = new Set(
    elf.entries
      .filter(e => e.file.startsWith(libPrefix))
      .flatMap(e => e.auxes.map(a => a.vna_other))
  )

  // Rewrite the verneed section to contain only the kept entries, laid out
  // contiguously, zero-padding the now unused tail of the section
  const { verneedSection, versymSection, dynamicSection } = elf
  buf.fill(
    0,
    verneedSection.sh_offset,
    verneedSection.sh_offset + verneedSection.sh_size
  )
  let writeOffset = verneedSection.sh_offset
  for (const [i, entry] of kept.entries()) {
    const entrySize =
      Elf64_Verneed.size + entry.auxes.length * Elf64_Vernaux.size
    Elf64_Verneed.write(buf, writeOffset, {
      vn_version: 1,
      vn_cnt: entry.auxes.length,
      vn_file: entry.fileOffset,
      vn_aux: Elf64_Verneed.size,
      vn_next: i === kept.length - 1 ? 0 : entrySize,
    })
    for (const [j, aux] of entry.auxes.entries()) {
      Elf64_Vernaux.write(
        buf,
        writeOffset + Elf64_Verneed.size + j * Elf64_Vernaux.size,
        {
          ...aux,
          vna_next: j === entry.auxes.length - 1 ? 0 : Elf64_Vernaux.size,
        }
      )
    }
    writeOffset += entrySize
  }

  // The number of verneed entries is stored both in the section header
  // (sh_info) and in the dynamic section (DT_VERNEEDNUM); the loader uses
  // the latter
  Elf64_Shdr.write(buf, verneedSection.headerOffset, {
    ...verneedSection,
    sh_info: kept.length,
  })
  let sawVerneedNum = false
  for (
    let off = dynamicSection.sh_offset;
    off < dynamicSection.sh_offset + dynamicSection.sh_size;
    off += Elf64_Dyn.size
  ) {
    const dyn = Elf64_Dyn.read(buf, off)
    if (dyn.d_tag === DT_NULL) {
      break
    }
    if (dyn.d_tag === DT_VERNEEDNUM) {
      Elf64_Dyn.write(buf, off, { ...dyn, d_val: kept.length })
      sawVerneedNum = true
    }
  }
  if (!sawVerneedNum) {
    throw new Error('no DT_VERNEEDNUM entry found in the dynamic section')
  }

  // Remap .gnu.version entries referencing the removed versions to be
  // unversioned
  for (
    let off = versymSection.sh_offset;
    off < versymSection.sh_offset + versymSection.sh_size;
    off += 2
  ) {
    if (removedIndices.has(buf.readUInt16LE(off) & ~VERSYM_HIDDEN)) {
      buf.writeUInt16LE(VER_NDX_GLOBAL, off)
    }
  }

  verifyRemoval(buf, libPrefix)
  return true
}

/**
 * Re-parses the modified buffer and checks that the result is coherent:
 * the library is no longer required and every .gnu.version entry references
 * a version requirement that still exists.
 */
function verifyRemoval(buf: Buffer, libPrefix: string) {
  const elf = parseElf(buf)
  if (elf === null) {
    throw new Error('binary is no longer parseable after patching')
  }
  if (elf.entries.some(e => e.file.startsWith(libPrefix))) {
    throw new Error(`a version requirement on ${libPrefix}* is still present`)
  }
  const validIndices = new Set([
    VER_NDX_LOCAL,
    VER_NDX_GLOBAL,
    ...elf.entries.flatMap(e => e.auxes.map(a => a.vna_other)),
  ])
  const { versymSection } = elf
  for (
    let off = versymSection.sh_offset;
    off < versymSection.sh_offset + versymSection.sh_size;
    off += 2
  ) {
    const index = buf.readUInt16LE(off) & ~VERSYM_HIDDEN
    if (!validIndices.has(index)) {
      throw new Error(`dangling symbol version reference (index ${index})`)
    }
  }
}
