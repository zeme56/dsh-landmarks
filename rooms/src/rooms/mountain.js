import * as THREE from "three";
import * as K from "../kit.js";
import { createModelRoom } from "../modelRoom.js";

// Room 01 — 山居 · 初春清晨的雾
// The Blender scene carries the architecture, pines and fog planes; here we
// re-light it and let the 05:40 → 09:00 slider push fog, sun and sky.

const MIST_LO = new THREE.Color(0xc6d0cf);
const MIST_HI = new THREE.Color(0xcdd8de);

export async function create({ width, height, renderer }) {
	const base = await createModelRoom({
		url: "./assets/rooms/mountain.glb",
		renderer,
		width,
		height,
		lighting: { ambient: 0.72, sunIntensity: 2.6, sunColor: 0xffe9c9, sunDir: [-0.35, 0.55, -0.75], sky: 0xdde6ea, ground: 0x3d3a30 },
	});
	const { scene, camera, sun } = base;

	scene.background = MIST_LO.clone();
	scene.fog = new THREE.FogExp2(MIST_LO.clone(), 0.02);

	// a low warm bounce inside the glass room
	const hearth = new THREE.PointLight(0xffbe82, 0.9, 9, 2);
	hearth.position.set(2.0, 0.75, -0.2);
	scene.add(hearth);

	const view = {
		position: camera.position.clone(),
		target: base.target.clone(),
		minDistance: 0.6,
		maxDistance: 14,
		minPolar: 0.35,
		maxPolar: Math.PI * 0.56,
		autoRotate: false,
	};

	const state = { time: 0.18 };

	function apply() {
		const t = state.time;
		scene.fog.density = K.lerp(0.032, 0.0075, t);
		scene.fog.color.copy(MIST_LO).lerp(MIST_HI, t);
		scene.background.copy(scene.fog.color);
		sun.intensity = K.lerp(1.5, 3.1, t);
		sun.color.setHSL(0.09, 0.35, K.lerp(0.72, 0.86, t));
		hearth.intensity = K.lerp(1.15, 0.45, t);
		renderer.toneMappingExposure = K.lerp(1.0, 0.96, t);
	}

	apply();

	const params = [
		{
			id: "time",
			label: "时刻",
			min: 0,
			max: 1,
			step: 0.01,
			value: state.time,
			format: (v) => {
				const mins = Math.round(340 + v * 200);
				return String(Math.floor(mins / 60)).padStart(2, "0") + ":" + String(mins % 60).padStart(2, "0");
			},
		},
	];

	return {
		scene,
		camera,
		view,
		params,
		setParam(id, value) {
			if (id !== "time") return;
			state.time = Number(value);
			apply();
		},
		update(dt, elapsed) {
			hearth.position.x = 2.0 + Math.sin(elapsed * 0.6) * 0.02;
		},
		resize(w, h) {
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		},
		dispose() {
			scene.traverse((obj) => {
				if (!obj.isMesh) return;
				obj.geometry?.dispose?.();
				const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
				for (const material of materials) material?.dispose?.();
			});
		},
	};
}
