/**
 * romp for three.js: the motion check over a scene graph. Name anything worth
 * checking (`obj.name = "van"`); deliberate hits go in `obj.userData.impacts`
 * (seconds) and aren't flagged as spikes; objects that swap in for an
 * identical twin set `obj.userData.seamless`.
 *
 *   const report = motionReport({ seek, scene, camera, fps: 30, W: 886, H: 1920, from: 0, to: 30, whips, covered })
 */
import * as THREE from "three";
import { type Report } from "../check/analyze.js";
export { analyze, formatReport, type Report, type Issue } from "../check/analyze.js";
/** On-screen area (px²) of an object: each mesh's own bounding box carried
 * through its world matrix (oriented: a card hinged flat stays thin), unioned on screen. */
export declare function screenArea(o: THREE.Object3D, camera: THREE.Camera, W: number, H: number): number;
/** The most opaque material in an object (shader `opacity` uniforms included). */
export declare function opacityOf(o: THREE.Object3D): number;
export interface MotionReportOptions {
    seek: (t: number) => void;
    scene: THREE.Scene;
    camera: THREE.Camera;
    fps: number;
    W: number;
    H: number;
    from?: number;
    to?: number;
    whips?: [number, number][];
    covered?: [number, number][];
}
/** Steps every frame of [from, to] through seek(t), tracks every named object, and runs the motion check. */
export declare function motionReport({ seek, scene, camera, fps, W, H, from, to, whips, covered }: MotionReportOptions): Report;
