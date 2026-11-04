// Small procedural kit shared by the five quiet rooms.
// Everything here is texture-free unless a canvas texture is explicitly made,
// so the whole gallery stays a few files and loads instantly.

import * as THREE from "three";

export const TAU = Math.PI * 2;

export function rng(seed = 1) {
	let s = seed >>> 0 || 1;
	return function next() {
		s ^= s << 13;
		s ^= s >>> 17;
		s ^= s << 5;
		s >>>= 0;
		return s / 4294967296;
	};
}

export function randRange(next, a, b) {
	return a + (b - a) * next();
}

export function mat(color, options = {}) {
	const { roughness = 0.85, metalness = 0, emissive, emissiveIntensity = 0, ...rest } = options;
	const m = new THREE.MeshStandardMaterial({
		color,
		roughness,
		metalness,
		...(emissive !== undefined ? { emissive, emissiveIntensity } : {}),
		...rest,
	});
	return m;
}

export function basic(color, opacity = 1, extra = {}) {
	return new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity, ...extra });
}

export function box(w, h, d, material, x = 0, y = 0, z = 0) {
	const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
	m.position.set(x, y, z);
	m.castShadow = true;
	m.receiveShadow = true;
	return m;
}

export function plane(w, h, material, x = 0, y = 0, z = 0) {
	const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), material);
	m.position.set(x, y, z);
	m.receiveShadow = true;
	return m;
}

export function cyl(rt, rb, h, material, seg = 24, x = 0, y = 0, z = 0) {
	const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
	m.position.set(x, y, z);
	m.castShadow = true;
	m.receiveShadow = true;
	return m;
}

export function sphere(r, material, seg = 24, x = 0, y = 0, z = 0) {
	const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(12, seg / 2)), material);
	m.position.set(x, y, z);
	m.castShadow = true;
	m.receiveShadow = true;
	return m;
}

/** Canvas texture helper. */
export function canvasTexture(w, h, draw, { repeat = null, srgb = true } = {}) {
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	draw(ctx, w, h);
	const tex = new THREE.CanvasTexture(canvas);
	if (srgb) tex.encoding = THREE.sRGBEncoding;
	if (repeat) {
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.repeat.set(repeat[0], repeat[1]);
	}
	tex.anisotropy = 4;
	return tex;
}

/** Soft radial sprite used for glows and particle points. */
export function glowTexture(size = 128, inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
	return canvasTexture(size, size, (ctx, w, h) => {
		const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
		g.addColorStop(0, inner);
		g.addColorStop(0.35, "rgba(255,255,255,0.55)");
		g.addColorStop(1, outer);
		ctx.fillStyle = g;
		ctx.fillRect(0, 0, w, h);
	});
}

/** Large soft noise texture for fog banks and mist. */
export function noiseTexture(size = 256, seed = 7, softness = 0.55) {
	const next = rng(seed);
	const cols = 8;
	const grid = [];
	for (let y = 0; y <= cols; y++) {
		grid[y] = [];
		for (let x = 0; x <= cols; x++) grid[y][x] = next();
	}
	const lerp = (a, b, t) => a + (b - a) * t;
	const smooth = (t) => t * t * (3 - 2 * t);
	const sample = (u, v) => {
		const x = u * cols;
		const y = v * cols;
		const xi = Math.floor(x);
		const yi = Math.floor(y);
		const xf = smooth(x - xi);
		const yf = smooth(y - yi);
		const a = grid[yi % cols][xi % cols];
		const b = grid[yi % cols][(xi + 1) % cols];
		const c = grid[(yi + 1) % cols][xi % cols];
		const d = grid[(yi + 1) % cols][(xi + 1) % cols];
		return lerp(lerp(a, b, xf), lerp(c, d, xf), yf);
	};
	return canvasTexture(size, size, (ctx, w, h) => {
		const img = ctx.createImageData(w, h);
		for (let y = 0; y < h; y++) {
			for (let x = 0; x < w; x++) {
				let v = sample(x / w, y / h) * 0.65 + sample((x / w) * 3.1, (y / h) * 2.7) * 0.35;
				v = Math.max(0, Math.min(1, (v - 0.5) * softness + 0.5));
				const i = (y * w + x) * 4;
				img.data[i] = 255;
				img.data[i + 1] = 255;
				img.data[i + 2] = 255;
				img.data[i + 3] = Math.round(v * 255);
			}
		}
		ctx.putImageData(img, 0, 0);
	}, { repeat: [1, 1] });
}

export function gradientSky(top, bottom, radius = 400) {
	const geo = new THREE.SphereGeometry(radius, 32, 16);
	const material = new THREE.ShaderMaterial({
		side: THREE.BackSide,
		depthWrite: false,
		uniforms: {
			topColor: { value: new THREE.Color(top) },
			bottomColor: { value: new THREE.Color(bottom) },
			offset: { value: 0.15 },
			exponent: { value: 0.9 },
		},
		vertexShader: /* glsl */ `
			varying vec3 vWorldPosition;
			void main() {
				vec4 worldPosition = modelMatrix * vec4(position, 1.0);
				vWorldPosition = worldPosition.xyz;
				gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
			}
		`,
		fragmentShader: /* glsl */ `
			uniform vec3 topColor;
			uniform vec3 bottomColor;
			uniform float offset;
			uniform float exponent;
			varying vec3 vWorldPosition;
			void main() {
				float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
				float t = pow(max(h, 0.0), exponent);
				gl_FragColor = vec4(mix(bottomColor, topColor, t), 1.0);
			}
		`,
	});
	return new THREE.Mesh(geo, material);
}

export function setShadows(root, cast = true, receive = true) {
	root.traverse((o) => {
		if (o.isMesh) {
			o.castShadow = cast;
			o.receiveShadow = receive;
		}
	});
	return root;
}

export function lerp(a, b, t) {
	return a + (b - a) * t;
}

export function damp(current, target, lambda, dt) {
	return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

export function disposeTree(root) {
	root.traverse((o) => {
		if (o.geometry) o.geometry.dispose();
		const list = Array.isArray(o.material) ? o.material : [o.material];
		for (const m of list) {
			if (!m) continue;
			for (const key of Object.keys(m)) {
				const value = m[key];
				if (value && value.isTexture) value.dispose();
			}
			m.dispose?.();
		}
	});
}
