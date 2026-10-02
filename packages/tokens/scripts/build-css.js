// Génère dist/tokens.css (variables CSS) à partir de la source TypeScript compilée.
const fs = require('node:fs')
const path = require('node:path')
const { color, radius, layout, shadow, fontSize, statusTone } = require('../dist/index.js')

const kebab = (s) => s.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase()).replace(/(\d+)/g, '-$1')
const lines = []
for (const [k, v] of Object.entries(color)) lines.push(`  --c-${kebab(k)}: ${v};`)
for (const [k, v] of Object.entries(radius)) lines.push(`  --r-${kebab(k)}: ${v}px;`)
for (const [k, v] of Object.entries(layout)) lines.push(`  --l-${kebab(k)}: ${v}px;`)
for (const [k, v] of Object.entries(fontSize)) lines.push(`  --fs-${kebab(k)}: ${v}px;`)
for (const [k, v] of Object.entries(shadow)) lines.push(`  --sh-${kebab(k)}: ${v};`)
for (const [k, v] of Object.entries(statusTone)) {
  lines.push(`  --st-${k}-bg: ${v.bg};`)
  lines.push(`  --st-${k}-fg: ${v.fg};`)
}

const css = `/* Généré par packages/tokens — ne pas modifier à la main. */\n:root {\n${lines.join('\n')}\n}\n`
fs.writeFileSync(path.join(__dirname, '..', 'dist', 'tokens.css'), css)
console.log('tokens.css :', lines.length, 'variables')
