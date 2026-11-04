import * as THREE from "three";
import * as K from "../kit.js";
import { createModelRoom } from "../modelRoom.js";

// Room 02 — 湖畔 · 深秋黄昏
// The Blender scene holds the cabin, deck, boat, lake and far ridge. The slider
// walks the last hour of light: copper water at 16:30, blue hour by 19:10.

const DUSK_WARM = new THREE.Color(0xc99a72);
const DUSK_COOL = new THREE.Color(0x2d3d4c);
const WATER_WARM = new THREE.Color(0x8a6a4e);
const WATER_COOL = new THREE.Color(0x2b3c48);

export async function create({ width, height, renderer }) {
	const base = await createModelRoom({
		url: "./assets/rooms/lake.glb",
		renderer,
		width,
		height,
		lighting: {
			ambient: 0.42,
			sunIntensity: 1.1,
			sunColor: 0xffb877,
			sunDir: [-0.75, 0.22, -0.35],
			sky: 0xe0b48c,
			ground: 0x2b2a26,
		},
	});
	const { scene, camera, sun } = base;

	scene.background = DUSK_WARM.clone();
	scene.fog = new THREE.FogExp2(DUSK_WARM.clone(), 0.0006);

	// the one lamp inside the cabin, and a faint one on the dock
	const lamp = new THREE.PointLight(0xffb066, 1.4, 18, 2);
	lamp.position.set(-4.2, 2.1, 2.4);
	scene.add(lamp);
	const dockLamp = new THREE.PointLight(0xffc98a, 0.55, 10, 2);
	dockLamp.position.set(2.6, 1.9, 6.4);
	scene.add(dockLamp);

	const view = {
		position: camera.position.clone(),
		target: base.target.clone(),
		minDistance: 0.4,
		maxDistance: 40,
		minPolar: 0.3,
		maxPolar: Math.PI * 0.54,
		autoRotate: false,
	};

	const state = { time: 0.28 };

	function apply() {
		const t = state.time;
		scene.fog.density = K.lerp(0.00045, 0.0011, t);
		scene.fog.color.copy(DUSK_WARM).lerp(DUSK_COOL, t);
		scene.background.copy(scene.fog.color);
		sun.intensity = K.lerp(1.9, 0.42, t);
		sun.color.setHSL(0.075, K.lerp(0.5, 0.18, t), K.lerp(0.62, 0.72, t));
		lamp.intensity = K.lerp(0.4, 2.2, t);
		dockLamp.intensity = K.lerp(0.1, 1.0, t);
		renderer.toneMappingExposure = K.lerp(1.06, 1.18, t);
	}

	apply();

	const coniferMat = new THREE.MeshStandardMaterial({ color: 0x33452f, roughness: 0.92 });
	const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4a3a2c, roughness: 0.95 });
	scene.traverse((obj) => {
		if (!obj.isMesh) return;
		if (/conifer/i.test(obj.name)) obj.material = /trunk|bark/i.test(obj.name) ? trunkMat : coniferMat;
	});

	const water = [];
	scene.traverse((obj) => {
		if (!obj.isMesh) return;
		const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (const material of materials) {
			if (!material) continue;
			if (material.name === "water") {
				material.metalness = 0.55;
				material.roughness = 0.16;
				material.color.copy(WATER_WARM);
				material.envMapIntensity = 1.2;
				water.push(material);
			}
			if (material.name === "lamp_bulb") {
				material.emissive = new THREE.Color(0xffb066);
				material.emissiveIntensity = 1.4;
			}
			const LAKE_PALETTE = {
				wall_boards_x: 0x6f6152, wall_boards_y: 0x6f6152, deck_planks: 0x7a6650,
				roof_shingle: 0x3a3733, stone: 0x8a8578, gravel: 0x6f6a5f, rock_wet: 0x56514a,
				bark: 0x4a3b2e, interior_wall: 0x6f5b46, sofa_fabric: 0x55483f,
				wool_blanket: 0x8a7a66, linen_curtain: 0xd8c9b2,
			};
			if (LAKE_PALETTE[material.name] !== undefined) material.color.setHex(LAKE_PALETTE[material.name]);
			if (material.name === "far_treeline") material.color.setHex(0x39424a);
			if (material.name === "linen_curtain") material.color.setHex(0xd8c9b2);
		}
	});

	const params = [
		{
			id: "time",
			label: "时刻",
			min: 0,
			max: 1,
			step: 0.01,
			value: state.time,
			format: (v) => {
				const mins = Math.round(990 + v * 160);
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
			const t = state.time;
			for (const material of water) material.color.copy(WATER_WARM).lerp(WATER_COOL, t);
		},
		update(dt, elapsed) {
			lamp.intensity += Math.sin(elapsed * 11.3) * 0.012;
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
