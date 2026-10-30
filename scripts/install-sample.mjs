#!/usr/bin/env node
// Installs the sample scene (sample/night-circuit) into the app's scene data and registers its location.
//   node scripts/install-sample.mjs [--target <lab-assets dir>] [--dry-run] [--force]
// Node 22+, no dependencies. Safe to run twice: files that are already identical are left alone, a file that exists with
// different content is NOT overwritten (it is reported, and the run exits 2) unless --force is given. The location manifest
// is only appended to, and a shot that is already listed is kept as it is. Nothing is ever deleted.
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, statSync, writeFileSync, copyFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SAMPLE = path.join(ROOT, 'sample', 'night-circuit')
const args = process.argv.slice(2)
const flag = (n) => args.includes(n)
const ti = args.indexOf('--target')
const TARGET = path.resolve(ti >= 0 && args[ti + 1] ? args[ti + 1] : path.join(ROOT, 'app', 'public', 'lab-assets'))
const dry = flag('--dry-run')
const force = flag('--force')

const walk = (dir) => readdirSync(dir).flatMap((n) => {
  const p = path.join(dir, n)
  return statSync(p).isDirectory() ? walk(p) : [p]
})

if (!existsSync(path.join(SAMPLE, 'files'))) {
  console.error(`The sample is missing: ${path.join(SAMPLE, 'files')}`)
  process.exit(1)
}
if (!existsSync(path.join(ROOT, 'app', 'package.json'))) {
  console.error('Run this from a copy of the repository (app/package.json not found).')
  process.exit(1)
}

let added = 0, same = 0, replaced = 0
const conflicts = []
const filesRoot = path.join(SAMPLE, 'files')
for (const src of walk(filesRoot)) {
  const rel = path.relative(filesRoot, src)
  const dst = path.join(TARGET, rel)
  if (existsSync(dst)) {
    if (readFileSync(src).equals(readFileSync(dst))) { same++; continue }
    if (!force) { conflicts.push(rel.split(path.sep).join('/')); continue }
    replaced++
  } else added++
  if (dry) continue
  mkdirSync(path.dirname(dst), { recursive: true })
  copyFileSync(src, dst)
}

// the location manifest: the Stage lists a world only when its shot is registered here
const shot = JSON.parse(readFileSync(path.join(SAMPLE, 'manifest-shot.json'), 'utf8'))
const manifestFile = path.join(TARGET, 'locations', 'manifest.json')
let manifest = { note: 'Locations made in the projection lab (server/location).', shots: [] }
if (existsSync(manifestFile)) {
  try { manifest = JSON.parse(readFileSync(manifestFile, 'utf8')) } catch {
    console.error(`Cannot read ${manifestFile} (not valid JSON). Nothing was registered; fix or move that file and run again.`)
    process.exit(1)
  }
}
if (!Array.isArray(manifest.shots)) manifest.shots = []
const listed = manifest.shots.find((s) => s.id === shot.id)
let registered = 'already registered'
if (!listed) {
  manifest.shots.push(shot)
  registered = 'registered'
  if (!dry) {
    mkdirSync(path.dirname(manifestFile), { recursive: true })
    const tmp = `${manifestFile}.${process.pid}.tmp`
    writeFileSync(tmp, JSON.stringify(manifest, null, 2) + '\n')
    renameSync(tmp, manifestFile) // written last and atomically, like the app does
  }
} else if (JSON.stringify(listed) !== JSON.stringify(shot)) {
  registered = 'already registered with different content (kept as it is)'
  conflicts.push('locations/manifest.json (shot ' + shot.id + ')')
}

console.log(`${dry ? '[dry run] ' : ''}Sample scene into ${TARGET}`)
console.log(`  files: ${added} added, ${same} already identical, ${replaced} replaced`)
console.log(`  location ${shot.id}: ${registered}`)
if (conflicts.length) {
  console.log(`  NOT overwritten (same path, different content), ${conflicts.length}:`)
  for (const c of conflicts) console.log(`    ${c}`)
  console.log('  Run with --force to overwrite the files (the manifest shot is never replaced).')
  process.exit(2)
}
console.log(dry ? '  Nothing was written.' : '  Done. Start the app and open Home: "A rain-drenched racetrack at midnight".')
