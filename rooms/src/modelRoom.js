import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

// Shared loader for the Blender-built rooms. Each room is a .blend exported to
// GLB with its camera; here we restore the camera as the starting view, add the
// lights the glTF cannot carry, and let the room module decorate the rest.


// glTF cannot carry the Blender mix/alpha tricks, so a handful of materials
// arrive opaque white and would turn the window into a lightbox. Repair them
// once, by name, into the translucent layers the scene was authored with.
const TUNING = {
	ClearGlass: { transparent: true, opacity: 0.16, depthWrite: false, color: 0xdfeaec, metalness: 0, roughness: 0.06, side: THREE.DoubleSide },
	Mist: { transparent: true, opacity: 0.3, depthWrite: false, color: 0xe8efec, roughness: 1 },
	MistLow: { transparent: true, opacity: 0.42, depthWrite: false, color: 0xdfe8e6, roughness: 1 },
	Ridge: { color: 0x93a5a4, roughness: 1 },
	Foliage: { color: 0x415c46, roughness: 0.95 },
};

function tuneMaterials(root) {
	root.traverse((obj) => {
		if (!obj.isMesh) return;
		const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
		for (const material of materials) {
			if (!material) continue;
			const tune = TUNING[material.name];
			if (!tune) continue;
			if (tune.color !== undefined) material.color?.setHex(tune.color);
			if (tune.opacity !== undefined) material.opacity = tune.opacity;
			if (tune.transparent !== undefined) material.transparent = tune.transparent;
			if (tune.depthWrite !== undefined) material.depthWrite = tune.depthWrite;
			if (tune.metalness !== undefined) material.metalness = tune.metalness;
			if (tune.roughness !== undefined) material.roughness = tune.roughness;
			if (tune.side !== undefined) material.side = tune.side;
			material.needsUpdate = true;
		}
	});
}

const loader = new GLTFLoader();
const cache = new Map();

let envTexture = null;
function environment(renderer) {
	if (envTexture) return envTexture;
	const pmrem = new THREE.PMREMGenerator(renderer);
	envTexture = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
	pmrem.dispose();
	return envTexture;
}

export function loadRoomGLB(url) {
	if (!cache.has(url)) {
		cache.set(
			url,
			loader.loadAsync(url).then((gltf) => {
				gltf.scene.traverse((obj) => {
					if (!obj.isMesh) return;
					obj.castShadow = true;
					const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
					if (mats.some((m) => m && m.transparent)) obj.castShadow = false;
					obj.receiveShadow = true;
					const materials = Array.isArray(obj.material) ? obj.material : [obj.material];
					for (const material of materials) {
						if (!material) continue;
						material.envMapIntensity = 0.32;
						material.shadowSide = THREE.FrontSide;
					}
				});
				tuneMaterials(gltf.scene);
				gltf.scene.updateMatrixWorld(true);
				return gltf;
			})
		);
	}
	return cache.get(url);
}

export async function createModelRoom({ url, renderer, width, height, lighting = {}, camera: cameraFallback }) {
	const gltf = await loadRoomGLB(url);
	const scene = new THREE.Scene();
	// No IBL: the RoomEnvironment probe is far too bright for these dusk rooms
	// and washed every material out. Hemisphere + sun carry the light instead.
	// scene.environment = environment(renderer);
	scene.add(gltf.scene);

	const box = new THREE.Box3().setFromObject(gltf.scene);
	const size = box.getSize(new THREE.Vector3());
	const center = box.getCenter(new THREE.Vector3());
	const span = Math.max(size.x, size.y, size.z, 1);

	let camera = gltf.cameras && gltf.cameras[0];
	if (!camera) {
		const fov = (cameraFallback && cameraFallback.fov) || 45;
		camera = new THREE.PerspectiveCamera(fov, width / height, 0.1, span * 4);
		camera.position.set(center.x, box.max.y * 0.55, box.max.z - span * 0.02);
		camera.lookAt(center.x, box.min.y + size.y * 0.45, center.z);
	}
	camera.aspect = width / height;
	camera.far = Math.max(camera.far || 100, span * 4);
	camera.updateProjectionMatrix();

	const forward = camera.getWorldDirection(new THREE.Vector3());
	const target = camera.position.clone().add(forward.clone().multiplyScalar(Math.min(span * 0.12, 6)));

	scene.add(new THREE.HemisphereLight(lighting.sky ?? 0xdfe7ef, lighting.ground ?? 0x4a4034, lighting.ambient ?? 0.55));

	const sun = new THREE.DirectionalLight(lighting.sunColor ?? 0xfff1dc, lighting.sunIntensity ?? 1.6);
	const sunDir = new THREE.Vector3(...(lighting.sunDir || [0.55, 0.75, 0.45])).normalize();
	sun.position.copy(center).add(sunDir.multiplyScalar(span));
	sun.target.position.copy(center);
	sun.castShadow = true;
	sun.shadow.mapSize.set(2048, 2048);
	const half = Math.max(size.x, size.z) * 0.62;
	sun.shadow.camera.left = -half;
	sun.shadow.camera.right = half;
	sun.shadow.camera.top = half;
	sun.shadow.camera.bottom = -half;
	sun.shadow.camera.near = 0.5;
	sun.shadow.camera.far = span * 4;
	sun.shadow.bias = -0.0006;
	sun.shadow.normalBias = Math.max(0.02, span * 0.0004);
	scene.add(sun);
	scene.add(sun.target);

	return { gltf, scene, camera, target, box, size, center, span, sun };
}

export function fitSkyRadius(box) {
	const size = box.getSize(new THREE.Vector3());
	return Math.max(size.x, size.y, size.z) * 1.6;
}
