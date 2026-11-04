import * as THREE from "three";
import * as K from "../kit.js";
import { rainfall } from "../atmosphere.js";
import { createModelRoom } from "../modelRoom.js";

// Room 05 — 海崖 · 暴雨夜的玻璃房
// The glass house, cliff, sea, lighthouse and storm clouds come from Blender.
// This module adds the rain sheet around the camera, the lamp, and a slow
// lightning pulse so the room feels lived-in rather than frozen.

const STORM = new THREE.Color(0x0d141c);
const STORM_FAR = new THREE.Color(0x1b2632);

export async function create({ width, height, renderer }) {
	const base = await createModelRoom({
		url: "./assets/rooms/cliff.glb",
		renderer,
		width,
		height,
		lighting: {
			ambient: 0.3,
			sunIntensity: 0.7,
			sunColor: 0x8aa6c4,
			sunDir: [-0.4, 0.6, 0.55],
			sky: 0x2a3a4a,
			ground: 0x0c1014,
		},
	});
	const { scene, camera, sun } = base;

	renderer.toneMappingExposure = 0.9;
	scene.background = STORM.clone();
	scene.fog = new THREE.FogExp2(STORM_FAR.clone(), 0.0045);

	const rain = rainfall({ count: 2400, area: [30, 12, 30], color: 0xb8c9d8, speed: 22, opacity: 0.16, wind: 2.2 });
	rain.object.position.set(camera.position.x, 0, camera.position.z);
	scene.add(rain.object);

	// the one warm lamp inside, and the lighthouse glow outside
	const lamp = new THREE.PointLight(0xffb066, 1.6, 12, 2);
	lamp.position.set(camera.position.x + 1.4, 1.55, camera.position.z - 1.6);
	scene.add(lamp);

	const glass = [];
	const beams = [];
	const flashes = [];
	scene.traverse((obj) => {
		if (!obj.isMesh) return;
		const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (const material of materials) {
			if (!material) continue;
			if (/GlassPane/i.test(material.name)) {
				material.transparent = true;
				material.opacity = 0.14;
				material.depthWrite = false;
				material.metalness = 0;
				material.roughness = 0.05;
				material.side = THREE.DoubleSide;
				glass.push(material);
			}
			if (/RainStreak|RainAir/i.test(material.name)) {
				material.transparent = true;
				material.depthWrite = false;
				material.opacity = Math.min(material.opacity || 0.3, 0.3);
			}
			if (/LighthouseBeam/i.test(material.name)) {
				material.emissive = new THREE.Color(0xffb066);
				material.emissiveIntensity = 1.8;
				beams.push(material);
			}
			if (/StormCloud/i.test(material.name)) {
				material.color.setHex(0x141d27);
				flashes.push(material);
			}
			material.needsUpdate = true;
		}
	});

	const state = { storm: 0.62 };

	const params = [
		{
			id: "storm",
			label: "雨势",
			min: 0,
			max: 1,
			step: 0.01,
			value: state.storm,
			format: (v) => (v < 0.2 ? "小雨" : v < 0.55 ? "中雨" : v < 0.85 ? "暴雨" : "台风边缘"),
		},
	];

	let lightning = 0;
	let nextBolt = 3.2;

	function apply() {
		const t = state.storm;
		rain.material.uniforms.uOpacity.value = K.lerp(0.06, 0.26, t);
		scene.fog.density = K.lerp(0.0028, 0.008, t);
		sun.intensity = K.lerp(0.95, 0.42, t);
		lamp.intensity = K.lerp(1.9, 1.2, t);
	}

	apply();

	return {
		scene,
		camera,
		view: {
			position: camera.position.clone(),
			target: base.target.clone(),
			minDistance: 0.4,
			maxDistance: 9,
			minPolar: 0.36,
			maxPolar: Math.PI * 0.55,
			autoRotate: false,
		},
		params,
		setParam(id, value) {
			if (id !== "storm") return;
			state.storm = Number(value);
			apply();
		},
		update(dt, elapsed) {
			rain.update(elapsed);
			nextBolt -= dt;
			if (nextBolt <= 0) {
				lightning = 1;
				nextBolt = 2.4 + Math.random() * 4.5;
			}
			lightning = Math.max(0, lightning - dt * 2.4);
			sun.intensity = K.lerp(0.95, 0.42, state.storm) + lightning * 2.2;
			for (const cloud of flashes) cloud.emissive?.setRGB?.(0.02, 0.03, 0.04);
			for (const beam of beams) beam.emissiveIntensity = 1.5 + Math.sin(elapsed * 1.2) * 0.6;
		},
		resize(w, h) {
			camera.aspect = w / h;
			camera.updateProjectionMatrix();
		},
		dispose() {
			rain.dispose();
			scene.traverse((obj) => {
				if (!obj.isMesh) return;
				obj.geometry?.dispose?.();
				const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
				for (const material of materials) material?.dispose?.();
			});
		},
	};
}
