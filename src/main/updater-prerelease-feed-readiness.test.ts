import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { netFetchMock } = vi.hoisted(() => ({
  netFetchMock: vi.fn()
}))

vi.mock('electron', () => ({
  net: { fetch: netFetchMock }
}))

function buildAtomFeed(tags: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><feed>${tags
    .map(
      (tag) =>
        `<entry><link rel="alternate" type="text/html" href="https://github.com/stablyai/orca/releases/tag/${tag}"/><title>${tag}</title></entry>`
    )
    .join('')}</feed>`
}

function buildManifest(tag: string): string {
  const version = tag.replace(/^v/i, '')
  return [
    `version: ${version}`,
    'files:',
    `  - url: Orca-${version}-arm64-mac.zip`,
    '    sha512: test',
    `path: Orca-${version}-arm64-mac.zip`
  ].join('\n')
}

function isPlatformManifestRequest(url: string): boolean {
  return /\/latest(?:-[a-z]+)?\.yml$/.test(url)
}

function respondWithAtom(
  tags: string[],
  missingManifestTags: string[] = [],
  missingAssetTags: string[] = []
): void {
  const missingManifests = new Set(missingManifestTags)
  const missingAssets = new Set(missingAssetTags)
  netFetchMock.mockImplementation((url: string, init?: { method?: string }) => {
    if (url === 'https://github.com/stablyai/orca/releases.atom') {
      return Promise.resolve({ ok: true, text: () => Promise.resolve(buildAtomFeed(tags)) })
    }

    const manifestMatch = url.match(/\/releases\/download\/([^/]+)\/latest(?:-[a-z]+)?\.yml$/)
    if (manifestMatch) {
      const tag = decodeURIComponent(manifestMatch[1])
      return Promise.resolve({
        ok: !missingManifests.has(tag),
        text: () => Promise.resolve(buildManifest(tag))
      })
    }

    const assetMatch = url.match(/\/releases\/download\/([^/]+)\/(.+)$/)
    if (assetMatch && init?.method === 'HEAD') {
      return Promise.resolve({
        ok: !missingAssets.has(decodeURIComponent(assetMatch[1])),
        text: () => Promise.resolve('')
      })
    }

    return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
  })
}

describe('fetchNewerReleaseTagsWithReadiness', () => {
  beforeEach(() => {
    vi.resetModules()
    netFetchMock.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reports not-ready when newer tags exist but their manifest assets are unavailable', async () => {
    respondWithAtom(['v1.4.27'], [], ['v1.4.27'])

    const { fetchNewerReleaseTagsWithReadiness } = await import('./updater-prerelease-feed')

    await expect(fetchNewerReleaseTagsWithReadiness('1.4.26', 1)).resolves.toEqual({
      tags: [],
      state: 'not-ready'
    })
  })

  it('reports no-newer separately from feed fetch failures', async () => {
    respondWithAtom(['v1.4.26'])

    const { fetchNewerReleaseTagsWithReadiness } = await import('./updater-prerelease-feed')

    await expect(fetchNewerReleaseTagsWithReadiness('1.4.26', 1)).resolves.toEqual({
      tags: [],
      state: 'no-newer'
    })

    netFetchMock.mockResolvedValue({ ok: false, text: () => Promise.resolve('') })
    await expect(fetchNewerReleaseTagsWithReadiness('1.4.26', 1)).resolves.toEqual({
      tags: [],
      state: 'unavailable'
    })
  })

  it('requires every asset referenced by the manifest files list to be reachable', async () => {
    netFetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (url === 'https://github.com/stablyai/orca/releases.atom') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(buildAtomFeed(['v1.4.28', 'v1.4.27']))
        })
      }

      const manifestMatch = url.match(/\/releases\/download\/([^/]+)\/latest(?:-[a-z]+)?\.yml$/)
      if (manifestMatch) {
        const version = decodeURIComponent(manifestMatch[1]).replace(/^v/i, '')
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              [
                `version: ${version}`,
                'files:',
                `  - url: Orca-${version}-mac.zip`,
                '    sha512: test',
                `  - url: Orca-${version}-arm64-mac.zip`,
                '    sha512: test',
                `path: Orca-${version}-mac.zip`
              ].join('\n')
            )
        })
      }

      if (init?.method === 'HEAD') {
        return Promise.resolve({
          ok: !url.endsWith('/Orca-1.4.28-arm64-mac.zip'),
          text: () => Promise.resolve('')
        })
      }

      return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
    })

    const { fetchNewerReleaseTag } = await import('./updater-prerelease-feed')

    expect(await fetchNewerReleaseTag('1.4.26')).toBe('v1.4.27')
  })

  it('accepts absolute manifest asset URLs without rewriting them to release asset paths', async () => {
    const assetUrls: string[] = []
    netFetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (url === 'https://github.com/stablyai/orca/releases.atom') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(buildAtomFeed(['v1.4.27']))
        })
      }

      if (isPlatformManifestRequest(url)) {
        return Promise.resolve({
          ok: true,
          text: () =>
            Promise.resolve(
              [
                'version: 1.4.27',
                'files:',
                '  - url: https://downloads.example.com/Orca-1.4.27-arm64-mac.zip',
                '    sha512: test'
              ].join('\n')
            )
        })
      }

      if (init?.method === 'HEAD') {
        assetUrls.push(url)
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') })
      }

      return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
    })

    const { fetchNewerReleaseTag } = await import('./updater-prerelease-feed')

    expect(await fetchNewerReleaseTag('1.4.26')).toBe('v1.4.27')
    expect(assetUrls).toEqual(['https://downloads.example.com/Orca-1.4.27-arm64-mac.zip'])
  })

  it('treats malformed updater manifests as not ready', async () => {
    netFetchMock.mockImplementation((url: string, init?: { method?: string }) => {
      if (url === 'https://github.com/stablyai/orca/releases.atom') {
        return Promise.resolve({
          ok: true,
          text: () => Promise.resolve(buildAtomFeed(['v1.4.28', 'v1.4.27']))
        })
      }

      if (url.includes('/releases/download/v1.4.28/')) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('files:\n  - url: [') })
      }

      if (url.includes('/releases/download/v1.4.27/') && isPlatformManifestRequest(url)) {
        return Promise.resolve({ ok: true, text: () => Promise.resolve(buildManifest('v1.4.27')) })
      }

      if (init?.method === 'HEAD') {
        return Promise.resolve({ ok: true, text: () => Promise.resolve('') })
      }

      return Promise.resolve({ ok: false, text: () => Promise.resolve('') })
    })

    const { fetchNewerReleaseTag } = await import('./updater-prerelease-feed')

    expect(await fetchNewerReleaseTag('1.4.26')).toBe('v1.4.27')
  })
})
