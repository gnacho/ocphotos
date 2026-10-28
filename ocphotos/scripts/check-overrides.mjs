#!/usr/bin/env node
// Fails when pnpm-lock.yaml no longer pins the overrides declared in package.json.
// Dependabot regeneration has dropped this block before, which silently
// reintroduced vulnerabilities that the overrides were there to close.

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
const declared = pkg.pnpm?.overrides ?? {}
const lock = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8')

const section = lock.match(/^overrides:\n((?: {2}\S.*\n)+)/m)
const pinned = {}

if (section) {
  for (const line of section[1].split('\n')) {
    const entry = line.match(/^ {2}(\S+):\s*(.+)$/)
    if (entry) pinned[entry[1]] = entry[2].trim().replace(/^['"]|['"]$/g, '')
  }
}

const problems = []

for (const [name, expected] of Object.entries(declared)) {
  const actual = pinned[name]
  if (actual === undefined) problems.push(`${name}: declared in package.json but missing from pnpm-lock.yaml`)
  else if (actual !== String(expected)) problems.push(`${name}: lock has "${actual}", package.json declares "${expected}"`)
}

for (const name of Object.keys(pinned)) {
  if (!(name in declared)) problems.push(`${name}: pinned in pnpm-lock.yaml but not declared in package.json`)
}

if (problems.length) {
  console.error('pnpm overrides are out of sync:')
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error('Run "pnpm install --no-frozen-lockfile" to regenerate the lockfile.')
  process.exit(1)
}

const count = Object.keys(declared).length
console.log(`pnpm overrides match the lockfile (${count} pinned).`)
