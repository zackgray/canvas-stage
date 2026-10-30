// Runs before `npm run dev` (predev): one clear sentence instead of a Vite crash on an old Node.
const [maj, min] = process.versions.node.split('.').map(Number)
if (maj < 22 || (maj === 22 && min < 12)) {
  console.error(`Canvas Stage needs Node 22.12 or newer; this is Node ${process.versions.node}. Install a newer Node (nodejs.org), run npm ci again in app/, then retry.`)
  process.exit(1)
}
