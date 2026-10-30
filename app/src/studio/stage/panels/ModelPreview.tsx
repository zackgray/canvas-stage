// The prop card's 3D preview (object card wave, the mock's grey turntable made real): once a prop is built, the LOOK tab's
// 'Picture | 3D preview' toggle shows the placed mesh turning slowly on a grey stage — the plain clay model the draw and the render
// see, not a textured render. Drag turns it. It reads the run's mesh through the existing pieces files, never builds anything;
// where WebGL is missing (tests) it says so instead of drawing.
import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export function ModelPreview({ url, label }: { url: string; label: string }) {
  const host = useRef<HTMLDivElement>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    const el = host.current
    if (!el) return
    let live = true
    let renderer: THREE.WebGLRenderer | null = null
    let raf = 0
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true })
    } catch {
      setFailed(true)
      return
    }
    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0x2a2a30)
    scene.add(new THREE.HemisphereLight(0xffffff, 0x55555c, 1.1))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(2.5, 4, 1.5)
    scene.add(sun)
    const camera = new THREE.PerspectiveCamera(34, 16 / 10, 0.01, 200)
    const group = new THREE.Group()
    scene.add(group)
    // the grey clay: every material of the loaded mesh becomes one plain grey, whatever the loader made of it
    new GLTFLoader().load(url, (g) => {
      if (!live) return
      g.scene.traverse((o) => {
        if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0x9b9ba4, roughness: 0.9 })
      })
      group.add(g.scene)
      const box = new THREE.Box3().setFromObject(g.scene)
      const size = Math.max(box.getSize(new THREE.Vector3()).length(), 0.001)
      const centre = box.getCenter(new THREE.Vector3())
      const d = size * 1.35
      camera.position.set(centre.x + d * 0.72, centre.y + d * 0.5, centre.z + d * 0.72)
      camera.lookAt(centre)
      group.position.sub(centre) // turn on the model's own centre
    }, undefined, () => { if (live) setFailed(true) })
    renderer.setSize(el.clientWidth || 480, el.clientHeight || 300)
    el.appendChild(renderer.domElement)
    let yaw = 0.5, drag: number | null = null
    const dom = renderer.domElement
    dom.style.touchAction = 'none'
    dom.addEventListener('pointerdown', (e) => { drag = e.clientX; dom.setPointerCapture(e.pointerId) })
    dom.addEventListener('pointermove', (e) => { if (drag !== null) { yaw += (e.clientX - drag) * 0.012; drag = e.clientX } })
    const up = () => { drag = null }
    dom.addEventListener('pointerup', up)
    dom.addEventListener('pointercancel', up)
    let last = 0
    const loop = (t: number) => {
      if (!live || !renderer) return
      if (drag === null) yaw += (t - last) * 0.00045 // the slow turntable
      last = t
      group.rotation.y = yaw
      renderer.render(scene, camera)
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => {
      live = false
      cancelAnimationFrame(raf)
      renderer?.dispose()
      dom.remove()
    }
  }, [url])
  if (failed) return <div className="oc-preview-fallback" data-testid="model-preview-fallback">The 3D preview needs the browser's drawing layer; the grey model itself is in the set.</div>
  return <div className="oc-preview" ref={host} data-testid="model-preview" role="img" aria-label={label} />
}
