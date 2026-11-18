/**
 * romp for three.js: the motion check over a scene graph. Name anything worth
 * checking (`obj.name = "van"`); deliberate hits go in `obj.userData.impacts`
 * (seconds) and aren't flagged as spikes; objects that swap in for an
 * identical twin set `obj.userData.seamless`.
 *
 *   const report = motionReport({ seek, scene, camera, fps: 30, W: 886, H: 1920, from: 0, to: 30, whips, covered })
 */
import * as THREE from "three";
import { analyze } from "../check/analyze.js";
export { analyze, formatReport } from "../check/analyze.js";
const v = new THREE.Vector3();
const box = new THREE.Box3();
const corner = new THREE.Vector3();
/** On-screen area (px²) of an object: each mesh's own bounding box carried
 * through its world matrix (oriented: a card hinged flat stays thin), unioned on screen. */
/** An object's projected on-screen box (px, may extend past the frame), unioned over its meshes. */
export function screenBox(o, camera, W, H) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    o.traverseVisible((m) => {
        const g = m.geometry;
        if (!g)
            return;
        if (!g.boundingBox)
            g.computeBoundingBox();
        box.copy(g.boundingBox);
        if (box.isEmpty())
            return;
        for (let i = 0; i < 8; i++) {
            corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(m.matrixWorld).project(camera);
            x0 = Math.min(x0, corner.x);
            x1 = Math.max(x1, corner.x);
            y0 = Math.min(y0, corner.y);
            y1 = Math.max(y1, corner.y);
        }
    });
    if (!(x1 > x0))
        return null;
    return { x0: ((x0 + 1) * W) / 2, x1: ((x1 + 1) * W) / 2, y0: ((1 - y1) * H) / 2, y1: ((1 - y0) * H) / 2 };
}
export function screenArea(o, camera, W, H) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    o.traverseVisible((m) => {
        const g = m.geometry;
        if (!g)
            return;
        if (!g.boundingBox)
            g.computeBoundingBox();
        box.copy(g.boundingBox);
        if (box.isEmpty())
            return;
        for (let i = 0; i < 8; i++) {
            corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).applyMatrix4(m.matrixWorld).project(camera);
            x0 = Math.min(x0, corner.x);
            x1 = Math.max(x1, corner.x);
            y0 = Math.min(y0, corner.y);
            y1 = Math.max(y1, corner.y);
        }
    });
    return x1 > x0 ? ((x1 - x0) * W) / 2 * (((y1 - y0) * H) / 2) : 0;
}
/** The most opaque material in an object (shader `opacity` uniforms included). */
export function opacityOf(o) {
    let a = 0;
    o.traverse((m) => {
        const mat = m.material;
        if (!mat || Array.isArray(mat))
            return;
        a = Math.max(a, mat.uniforms?.opacity ? mat.uniforms.opacity.value : mat.opacity ?? 1);
    });
    return a;
}
/** Steps every frame of [from, to] through seek(t), tracks every named object, and runs the motion check. */
export function motionReport({ seek, scene, camera, fps, W, H, from = 0, to = 3.4, whips = [], covered = [] }) {
    const named = [];
    scene.traverse((o) => {
        if (o.name)
            named.push(o);
    });
    const frames = [];
    for (let f = Math.round(from * fps); f <= Math.round(to * fps); f++) {
        seek(f / fps);
        scene.updateMatrixWorld(true);
        const row = {};
        for (const o of named) {
            let shown = true;
            for (let p = o; p; p = p.parent)
                if (!p.visible) {
                    shown = false;
                    break;
                }
            o.getWorldPosition(v);
            const world = { x: v.x, y: v.y, z: v.z };
            v.project(camera);
            row[o.name] = {
                x: ((v.x + 1) * W) / 2,
                y: ((1 - v.y) * H) / 2,
                shown,
                onScreen: Math.abs(v.x) < 1 && Math.abs(v.y) < 1 && v.z < 1,
                area: shown ? screenArea(o, camera, W, H) : 0,
                opacity: shown ? opacityOf(o) : 0,
                seamless: !!o.userData.seamless,
                box: shown ? screenBox(o, camera, W, H) ?? undefined : undefined,
                allowCrop: !!o.userData.allowCrop,
                allowExit: !!o.userData.allowExit,
                world,
            };
        }
        frames.push({ f, row });
    }
    const impacts = {};
    for (const o of named)
        if (o.userData.impacts)
            impacts[o.name] = o.userData.impacts.map((t) => Math.round(t * fps));
    return analyze(frames, { fps, width: W, height: H, whips, covered, impacts });
}
//# sourceMappingURL=index.js.map