// Atmosphere: GPU-driven snow, volumetric-looking mist banks, rain, water and
// light shafts. Each effect returns { object, update(t, dt), dispose() } so the
// room can own it and the gallery can tick it without knowing the internals.

import * as THREE from "three";
import { glowTexture, noiseTexture, rng, randRange } from "./kit.js";

/* ------------------------------------------------------------------ snow --- */
// 6k flakes move entirely in the vertex shader (no per-frame JS loop):
// y wraps with mod(), x/z get a slow sinusoidal drift.
export function snowfall({
	count = 6000,
	area = [30, 14, 30],
	size = 0.075,
	color = 0xffffff,
	speed = 1.1,
	wind = 0.35,
	opacity = 0.9,
} = {}) {
	const next = rng(1337);
	const positions = new Float32Array(count * 3);
	const seeds = new Float32Array(count);
	const speeds = new Float32Array(count);
	for (let i = 0; i < count; i++) {
		positions[i * 3] = randRange(next, -area[0] / 2, area[0] / 2);
		positions[i * 3 + 1] = randRange(next, 0, area[1]);
		positions[i * 3 + 2] = randRange(next, -area[2] / 2, area[2] / 2);
		seeds[i] = next() * 100;
		speeds[i] = randRange(next, 0.7, 1.6);
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
	geo.setAttribute("aSpeed", new THREE.BufferAttribute(speeds, 1));

	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		blending: THREE.NormalBlending,
		uniforms: {
			uTime: { value: 0 },
			uHeight: { value: area[1] },
			uSpeed: { value: speed },
			uWind: { value: wind },
			uSize: { value: size },
			uColor: { value: new THREE.Color(color) },
			uOpacity: { value: opacity },
			uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
		},
		vertexShader: /* glsl */ `
			uniform float uTime;
			uniform float uHeight;
			uniform float uSpeed;
			uniform float uWind;
			uniform float uSize;
			uniform float uPixelRatio;
			attribute float aSeed;
			attribute float aSpeed;
			varying float vFade;
			void main() {
				vec3 p = position;
				float fall = mod(p.y - uTime * uSpeed * aSpeed, uHeight);
				p.y = fall;
				p.x += sin(uTime * 0.35 + aSeed) * 0.55 + uTime * uWind * 0.25;
				p.x = mod(p.x + 15.0, 30.0) - 15.0;
				p.z += cos(uTime * 0.27 + aSeed * 1.7) * 0.45;
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_Position = projectionMatrix * mv;
				gl_PointSize = uSize * uPixelRatio * (240.0 / max(1.0, -mv.z));
				vFade = smoothstep(0.0, 1.2, fall) * smoothstep(uHeight, uHeight - 3.0, fall);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uOpacity;
			varying float vFade;
			void main() {
				vec2 uv = gl_PointCoord - 0.5;
				float d = length(uv);
				float alpha = smoothstep(0.5, 0.05, d) * uOpacity * vFade;
				if (alpha < 0.01) discard;
				gl_FragColor = vec4(uColor, alpha);
			}
		`,
	});

	const points = new THREE.Points(geo, material);
	points.frustumCulled = false;
	return {
		object: points,
		material,
		update(t) {
			material.uniforms.uTime.value = t;
		},
		dispose() {
			geo.dispose();
			material.dispose();
		},
	};
}

/* ------------------------------------------------------------------ rain --- */
export function rainfall({
	count = 2600,
	area = [26, 16, 26],
	color = 0xaec4d6,
	speed = 16,
	opacity = 0.5,
	wind = 1.4,
} = {}) {
	const next = rng(4242);
	const positions = new Float32Array(count * 6);
	const seeds = new Float32Array(count * 2);
	for (let i = 0; i < count; i++) {
		const x = randRange(next, -area[0] / 2, area[0] / 2);
		const y = randRange(next, 0, area[1]);
		const z = randRange(next, -area[2] / 2, area[2] / 2);
		positions[i * 6] = x;
		positions[i * 6 + 1] = y;
		positions[i * 6 + 2] = z;
		positions[i * 6 + 3] = x + wind * 0.06;
		positions[i * 6 + 4] = y - 0.55;
		positions[i * 6 + 5] = z;
		seeds[i * 2] = next();
		seeds[i * 2 + 1] = next();
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	geo.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));

	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		uniforms: {
			uTime: { value: 0 },
			uHeight: { value: area[1] },
			uSpeed: { value: speed },
			uWind: { value: wind },
			uColor: { value: new THREE.Color(color) },
			uOpacity: { value: opacity },
		},
		vertexShader: /* glsl */ `
			uniform float uTime;
			uniform float uHeight;
			uniform float uSpeed;
			uniform float uWind;
			attribute float aSeed;
			varying float vFade;
			void main() {
				vec3 p = position;
				float fall = mod(p.y - uTime * uSpeed * (0.75 + aSeed * 0.6), uHeight);
				p.y = fall;
				p.x += (uHeight - fall) * uWind * 0.035;
				vec4 mv = modelViewMatrix * vec4(p, 1.0);
				gl_Position = projectionMatrix * mv;
				vFade = smoothstep(0.0, 1.0, fall);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 uColor;
			uniform float uOpacity;
			varying float vFade;
			void main() {
				gl_FragColor = vec4(uColor, uOpacity * vFade);
			}
		`,
	});
	const lines = new THREE.LineSegments(geo, material);
	lines.frustumCulled = false;
	return {
		object: lines,
		material,
		update(t) {
			material.uniforms.uTime.value = t;
		},
		dispose() {
			geo.dispose();
			material.dispose();
		},
	};
}

/* ------------------------------------------------------------------ mist --- */
// A stack of large horizontal planes with a soft noise alpha. They drift in
// opposite directions and are billboarded only around Y, so they read as mist
// layers rather than as flat cards.
export function mistBanks({
	count = 7,
	area = [34, 26],
	y = 1.2,
	ySpread = 1.6,
	color = 0xdde3e2,
	opacity = 0.3,
	scale = 26,
	speed = 0.035,
	seed = 9,
} = {}) {
	const next = rng(seed);
	const texture = noiseTexture(256, seed, 0.5);
	const group = new THREE.Group();
	const layers = [];
	for (let i = 0; i < count; i++) {
		const material = new THREE.MeshBasicMaterial({
			map: texture,
			color,
			transparent: true,
			opacity: opacity * randRange(next, 0.6, 1.1),
			depthWrite: false,
			side: THREE.DoubleSide,
			blending: THREE.NormalBlending,
		});
		const mesh = new THREE.Mesh(new THREE.PlaneGeometry(scale * randRange(next, 0.8, 1.4), scale * randRange(next, 0.5, 0.9)), material);
		mesh.rotation.x = -Math.PI / 2;
		mesh.position.set(randRange(next, -area[0] / 2, area[0] / 2), y + randRange(next, -ySpread, ySpread), randRange(next, -area[1] / 2, area[1] / 2));
		mesh.renderOrder = 2;
		group.add(mesh);
		layers.push({ mesh, material, dir: next() > 0.5 ? 1 : -1, phase: next() * 10, baseX: mesh.position.x, baseZ: mesh.position.z });
	}
	return {
		object: group,
		update(t) {
			for (const layer of layers) {
				layer.mesh.position.x = layer.baseX + Math.sin(t * speed + layer.phase) * 2.2 * layer.dir;
				layer.mesh.position.z = layer.baseZ + Math.cos(t * speed * 0.7 + layer.phase) * 1.4;
				layer.material.opacity = layer.material.opacity * 0.995 + 0.005 * layer.material.opacity;
			}
			texture.offset.x = t * 0.004;
			texture.offset.y = t * 0.0015;
		},
		dispose() {
			texture.dispose();
			for (const layer of layers) {
				layer.mesh.geometry.dispose();
				layer.material.dispose();
			}
		},
	};
}

/* ----------------------------------------------------------------- water --- */
export function waterSurface({
	size = 90,
	deep = 0x1d2a33,
	shallow = 0x50646b,
	sun = new THREE.Vector3(1, 0.2, -1),
	sunColor = 0xffb066,
	speed = 0.5,
} = {}) {
	const material = new THREE.ShaderMaterial({
		transparent: false,
		uniforms: {
			uTime: { value: 0 },
			uDeep: { value: new THREE.Color(deep) },
			uShallow: { value: new THREE.Color(shallow) },
			uSun: { value: sun.clone().normalize() },
			uSunColor: { value: new THREE.Color(sunColor) },
			uSpeed: { value: speed },
		},
		vertexShader: /* glsl */ `
			varying vec3 vWorld;
			varying vec3 vNormal;
			void main() {
				vec4 world = modelMatrix * vec4(position, 1.0);
				vWorld = world.xyz;
				vNormal = normalize(mat3(modelMatrix) * normal);
				gl_Position = projectionMatrix * viewMatrix * world;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			uniform vec3 uDeep;
			uniform vec3 uShallow;
			uniform vec3 uSun;
			uniform vec3 uSunColor;
			uniform float uSpeed;
			varying vec3 vWorld;
			varying vec3 vNormal;

			float wave(vec2 p, float t) {
				return sin(p.x * 1.1 + t * 1.3) * 0.5
					+ sin(p.y * 1.7 - t * 0.9) * 0.3
					+ sin((p.x + p.y) * 2.6 + t * 1.9) * 0.2;
			}

			void main() {
				vec2 p = vWorld.xz;
				float t = uTime * uSpeed;
				float e = 0.25;
				float h = wave(p, t);
				float hx = wave(p + vec2(e, 0.0), t);
				float hz = wave(p + vec2(0.0, e), t);
				vec3 n = normalize(vec3(h - hx, 0.35, h - hz));
				vec3 viewDir = normalize(cameraPosition - vWorld);
				float fresnel = pow(1.0 - max(dot(viewDir, n), 0.0), 2.2);
				vec3 base = mix(uDeep, uShallow, clamp(h * 0.45 + 0.5, 0.0, 1.0));
				vec3 reflected = mix(vec3(0.58, 0.62, 0.68), uSunColor, fresnel);
				vec3 color = mix(base, reflected, fresnel * 0.85);
				vec3 halfVec = normalize(uSun + viewDir);
				float spec = pow(max(dot(n, halfVec), 0.0), 220.0) * 1.6;
				spec += pow(max(dot(n, halfVec), 0.0), 28.0) * 0.18;
				color += uSunColor * spec;
				gl_FragColor = vec4(color, 1.0);
			}
		`,
	});
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size, 1, 1), material);
	mesh.rotation.x = -Math.PI / 2;
	return {
		object: mesh,
		material,
		update(t) {
			material.uniforms.uTime.value = t;
		},
		dispose() {
			mesh.geometry.dispose();
			material.dispose();
		},
	};
}

/* -------------------------------------------------------------- light shaft --- */
export function lightShaft({ color = 0xffe2b0, opacity = 0.14, length = 18, radius = 4, position = [0, 8, 0], rotation = [0, 0, 0] } = {}) {
	const geo = new THREE.CylinderGeometry(radius * 0.25, radius, length, 20, 1, true);
	const material = new THREE.ShaderMaterial({
		transparent: true,
		depthWrite: false,
		side: THREE.DoubleSide,
		blending: THREE.AdditiveBlending,
		uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: opacity } },
		vertexShader: /* glsl */ `
			varying vec2 vUv;
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				vUv = uv;
				vec4 mv = modelViewMatrix * vec4(position, 1.0);
				vNormal = normalize(normalMatrix * normal);
				vView = normalize(-mv.xyz);
				gl_Position = projectionMatrix * mv;
			}
		`,
		fragmentShader: /* glsl */ `
			uniform float uTime;
			uniform vec3 uColor;
			uniform float uOpacity;
			varying vec2 vUv;
			varying vec3 vNormal;
			varying vec3 vView;
			void main() {
				float edge = 1.0 - abs(dot(vNormal, vView));
				float fade = pow(1.0 - vUv.y, 1.8);
				float flicker = 0.85 + 0.15 * sin(uTime * 0.7);
				gl_FragColor = vec4(uColor, edge * fade * uOpacity * flicker);
			}
		`,
	});
	const mesh = new THREE.Mesh(geo, material);
	mesh.position.set(...position);
	mesh.rotation.set(...rotation);
	return {
		object: mesh,
		material,
		update(t) {
			material.uniforms.uTime.value = t;
		},
		dispose() {
			geo.dispose();
			material.dispose();
		},
	};
}

/* ------------------------------------------------------------------ stars --- */
export function starfield({ count = 700, radius = 120, size = 0.5 } = {}) {
	const next = rng(77);
	const positions = new Float32Array(count * 3);
	for (let i = 0; i < count; i++) {
		const theta = next() * Math.PI * 2;
		const phi = Math.acos(randRange(next, 0.05, 1));
		const r = radius * randRange(next, 0.9, 1.0);
		positions[i * 3] = Math.cos(theta) * Math.sin(phi) * r;
		positions[i * 3 + 1] = Math.cos(phi) * r * 0.7 + 40;
		positions[i * 3 + 2] = Math.sin(theta) * Math.sin(phi) * r;
	}
	const geo = new THREE.BufferGeometry();
	geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
	const material = new THREE.PointsMaterial({
		color: 0xdfe8ff,
		size,
		sizeAttenuation: true,
		transparent: true,
		opacity: 0.8,
		map: glowTexture(64),
		depthWrite: false,
	});
	const points = new THREE.Points(geo, material);
	return { object: points, update() {}, dispose() { geo.dispose(); material.dispose(); } };
}
