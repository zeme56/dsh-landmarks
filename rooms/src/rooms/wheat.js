import * as THREE from "three";
import * as K from "../kit.js";
import { createModelRoom } from "../modelRoom.js";

// Room 04 — 麦田 · 一个不热的夏天
// The room, the window, the fan and the wheat sea are modelled in Blender.
// Here we only restore the pale high-altitude light, breathe the gauze curtain
// and let the fan turn when the slider is pushed.

const SKY = new THREE.Color(0xd7dfd8);
const HAZE = new THREE.Color(0xc9d3cb);

export async function create({ width, height, renderer }) {
	const base = await createModelRoom({
		url: "./assets/rooms/wheat.glb",
		renderer,
		width,
		height,
		lighting: {
			ambient: 0.42,
			sunIntensity: 1.25,
			sunColor: 0xfff2da,
			sunDir: [0.3, 0.72, 0.62],
			sky: 0xe7ede6,
			ground: 0x6a5a44,
		},
	});
	const { scene, camera, sun } = base;
	// the low summer sun throws one hard diagonal across the ceiling; soften it
	sun.castShadow = true;
	// the GLB bbox is 460 m (wheat field + hills), so the shared shadow camera is
	// useless indoors: rebuild it around the 8x6x3.2 room.
	sun.shadow.camera.left = -7;
	sun.shadow.camera.right = 7;
	sun.shadow.camera.top = 7;
	sun.shadow.camera.bottom = -7;
	sun.shadow.camera.near = 0.5;
	sun.shadow.camera.far = 42;
	sun.shadow.mapSize.set(2048, 2048);
	sun.shadow.bias = -0.0004;
	sun.shadow.normalBias = 0.02;
	sun.shadow.camera.updateProjectionMatrix();

	renderer.toneMappingExposure = 0.9;
	scene.background = SKY.clone();
	scene.fog = new THREE.FogExp2(HAZE.clone(), 0.0016);

	// a soft bounce from the wheat field into the room
	const bounce = new THREE.PointLight(0xffe6b8, 0.3, 16, 2);
	bounce.position.set(2.4, 1.6, 4.2);
	scene.add(bounce);

	const fanBlades = [];
	const curtain = [];
	scene.traverse((obj) => {
		if (!obj.isMesh) return;
		const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (const material of materials) {
			if (!material) continue;
			if (/GauzeCurtain/i.test(material.name)) {
				material.transparent = true;
				material.opacity = 0.42;
				material.depthWrite = false;
				material.side = THREE.DoubleSide;
				material.roughness = 0.9;
			}
			if (/PaperSheet/i.test(material.name)) material.roughness = 0.95;
			// the Blender build adds a little self-emission so the field never goes
			// dead black; under the gallery lights it just flattens the contrast.
			if (/^Wheat(Gold|Green)$/.test(material.name)) material.emissiveIntensity = 0.02;
			if (/GauzeCurtain/i.test(material.name)) material.emissiveIntensity = 0;
			material.needsUpdate = true;
		}
		if (/CurtainRod|CurtainFinial|CurtainRing|Rings?(_|$)/i.test(obj.name)) obj.visible = false;
		if (/FanBlade/i.test(obj.name)) fanBlades.push({ obj, rz: obj.rotation.z });
		if (/GauzeCurtain/i.test(obj.name)) curtain.push({ obj, rx: obj.rotation.x, rz: obj.rotation.z });
	});

	const state = { breeze: 0.45 };
	let fanSpin = 0;

	const params = [
		{
			id: "breeze",
			label: "风",
			min: 0,
			max: 1,
			step: 0.01,
			value: state.breeze,
			format: (v) => (v < 0.2 ? "无风" : v < 0.55 ? "微风" : v < 0.85 ? "穿堂风" : "风起"),
		},
	];

	function apply() {
		const t = state.breeze;
		sun.intensity = K.lerp(1.55, 0.95, t);
		bounce.intensity = K.lerp(0.4, 0.75, t);
	}

	apply();

	return {
		scene,
		camera,
		view: {
			position: camera.position.clone(),
			target: base.target.clone(),
			minDistance: 0.35,
			maxDistance: 6,
			minPolar: 0.4,
			maxPolar: Math.PI * 0.56,
			autoRotate: false,
		},
		params,
		setParam(id, value) {
			if (id !== "breeze") return;
			state.breeze = Number(value);
			apply();
		},
		update(dt, elapsed) {
			const speed = 0.4 + state.breeze * 4.4;
			fanSpin -= dt * speed;
			for (const blade of fanBlades) blade.obj.rotation.z = blade.rz + fanSpin;
			for (const piece of curtain) {
				piece.obj.rotation.x = piece.rx + Math.sin(elapsed * 0.9) * 0.01 * state.breeze;
				piece.obj.rotation.z = piece.rz + Math.sin(elapsed * 0.63 + 1.2) * 0.008 * state.breeze;
			}
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
