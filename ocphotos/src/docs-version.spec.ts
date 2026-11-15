import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import pkg from '../package.json'

// these documents state the version that is live, and every release has to
// bring them along. A release that forgets one used to ship a lie, so the suite
// checks it against the version this package declares.
const DOCS = ['plan.md', 'README.es.md', 'analisis-fotos-opencloud.md']

const repoRoot = join(import.meta.dirname, '../..')

describe('release documentation', () => {
  it('names the version of ocphotos/package.json', () => {
    const version = pkg.version
    const stale = DOCS.filter((doc) => !readFileSync(`${repoRoot}/${doc}`, 'utf8').includes(version))

    expect(stale, `${DOCS.join(', ')} must mention the released version ${version}`).toEqual([])
  })
})
