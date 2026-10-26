import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

const LINK = /\b(src|href)="\/([\w-]+\.(?:js|css))"/g

// Adds ?v=<content hash> to a page's links to the scripts and styles in `dir`. A
// deploy that changes a file changes its link, so browsers fetch the new file even
// when they were told to keep the old one: Cloudflare rewrites Cache-Control on .js
// and .css to max-age=14400 (4 hours). Files are read on each call; pages are few
// and small, and an edit shows up without a restart.
export function versionAssetLinks(html, dir) {
  return html.replace(LINK, (match, attr, name) => {
    let body
    try {
      body = fs.readFileSync(path.join(dir, name))
    } catch {
      return match
    }
    const v = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12)
    return `${attr}="/${name}?v=${v}"`
  })
}
