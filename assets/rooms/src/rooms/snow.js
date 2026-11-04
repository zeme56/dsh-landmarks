import * as THREE from "three";
import * as K from "../kit.js";
import { createModelRoom } from "../modelRoom.js";

// Room 03 — 雪夜 · 斜顶阁楼
// The loft, skylight, snow field and pines come from Blender. The original
// Blender render was far too dark, so this module carries the moonlight and a
// warm stair-light from below, plus falling snow.

const NIGHT = new THREE.Color(0x121a26);
const MOON = new THREE.Color(0x9fb6d6);

export async function create({ width, height, renderer }) {
	const base = await createModelRoom({
		url: "./assets/rooms/snow.glb",
		renderer,
		width,
		height,
		lighting: {
			ambient: 0.62,
			sunIntensity: 0.95,
			sunColor: 0xaec6e8,
			sunDir: [-0.55, 0.7, -0.45],
			sky: 0x4a5f7d,
			ground: 0x1a1a1e,
		},
	});
	const { scene, camera, sun } = base;

	renderer.toneMappingExposure = 0.92;
	scene.background = NIGHT.clone();
	scene.fog = new THREE.FogExp2(NIGHT.clone(), 0.0035);

	// warm light climbing the stair from the kitchen below
	const stair = new THREE.PointLight(0xffa860, 1.25, 9, 2);
	stair.position.set(1.1, -1.2, 2.6);
	scene.add(stair);

	const stove = new THREE.PointLight(0xff8a3c, 0.65, 6, 2);
	stove.position.set(-3.2, 0.4, -1.4);
	scene.add(stove);

	const view = {
		position: camera.position.clone(),
		target: base.target.clone(),
		minDistance: 0.35,
		maxDistance: 9,
		minPolar: 0.32,
		maxPolar: Math.PI * 0.55,
		autoRotate: false,
	};

	const state = { snow: 0.55 };

	const flakes = [];
	scene.traverse((obj) => {
		if (!obj.isMesh) return;
		const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (const material of materials) {
			if (!material) continue;
			if (material.name === "glass") {
				material.transparent = true;
				material.opacity = 0.18;
				material.depthWrite = false;
				material.roughness = 0.08;
				material.metalness = 0;
				material.side = THREE.DoubleSide;
			}
			if (material.name === "haze") {
				material.transparent = true;
				material.opacity = 0.22;
				material.depthWrite = false;
				material.color.setHex(0x9fb0c6);
			}
			if (material.name === "snowflake") {
				material.transparent = true;
				material.opacity = 0.75;
				material.depthWrite = false;
			}
			const SNOW_PALETTE = {
				wood_floor: 0x6d5a44, plaster: 0xb9b2a6, roof_wood: 0x4a3a2c, wood_beam: 0x5a4634,
				snow: 0xdfe7f2, sheet: 0xd8d0c2, blanket: 0x7a6a55, rug: 0x8a7a64,
				snowflake: 0xeaf2ff, ceramic: 0xd8d2c6,
			};
			if (SNOW_PALETTE[material.name] !== undefined) material.color.setHex(SNOW_PALETTE[material.name]);
			if (material.name === "fire") {
				material.emissive = new THREE.Color(0xff7a2a);
				material.emissiveIntensity = 2.0;
			}
			if (material.name === "window_light") {
				material.emissive = new THREE.Color(0xffc98a);
				material.emissiveIntensity = 1.6;
			}
			if (material.name === "moon") {
				material.emissive = new THREE.Color(0xcfe0ff);
				material.emissiveIntensity = 1.2;
			}
			material.needsUpdate = true;
		}
		if (obj.material && obj.material.name === "snowflake") flakes.push(obj);
	});

	const params = [
		{
			id: "snow",
			label: "雪势",
			min: 0,
			max: 1,
			step: 0.01,
			value: state.snow,
			format: (v) => (v < 0.15 ? "小雪" : v < 0.5 ? "中雪" : v < 0.85 ? "大雪" : "暴雪"),
		},
	];

	return {
		scene,
		camera,
		view,
		params,
		setParam(id, value) {
			if (id !== "snow") return;
			state.snow = Number(value);
			sun.intensity = K.lerp(1.5, 0.7, state.snow);
			scene.fog.density = K.lerp(0.0025, 0.006, state.snow);
			for (const flake of flakes) flake.visible = Math.random() < 0.4 + state.snow * 0.6;
		},
		update(dt, elapsed) {
			stair.intensity = 1.25 + Math.sin(elapsed * 7.1) * 0.05;
			stove.intensity = 0.65 + Math.sin(elapsed * 9.7) * 0.07;
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
