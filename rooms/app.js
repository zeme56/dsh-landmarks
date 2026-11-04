import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { rooms } from "./src/rooms/index.js";

const canvas = document.getElementById("stage");
const veil = document.getElementById("veil");
const loading = document.getElementById("loading");
const rail = document.getElementById("rail");
const paramsEl = document.getElementById("params");
const proseEl = document.getElementById("prose");
const proseBody = document.getElementById("prose-body");
const titleEl = document.getElementById("room-title");
const subEl = document.getElementById("room-sub");
const indexEl = document.getElementById("room-index");

const renderer = new THREE.WebGLRenderer({
	canvas,
	antialias: true,
	alpha: false,
	powerPreference: "high-performance",
	stencil: false,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const clock = new THREE.Clock();

function showError(message) {
	let el = document.getElementById("dbg");
	if (!el) {
		el = document.createElement("div");
		el.id = "dbg";
		el.style.cssText = "position:fixed;left:50%;top:8px;transform:translateX(-50%);color:#fff;font:12px monospace;background:rgba(120,0,0,.85);padding:4px 8px;border-radius:4px;z-index:99;max-width:90vw";
		document.body.appendChild(el);
	}
	el.textContent = message;
}
window.addEventListener("error", (event) => showError("ERR " + event.message + " @ " + (event.filename || "") + ":" + event.lineno));
window.addEventListener("unhandledrejection", (event) => showError("REJ " + String(event.reason && event.reason.message || event.reason)));
const state = {
	index: -1,
	current: null,
	controls: null,
	visible: true,
	elapsed: 0,
	switching: false,
};

let controls = null;

/* ------------------------------------------------------------------ rail --- */
for (let i = 0; i < rooms.length; i++) {
	const room = rooms[i];
	const button = document.createElement("button");
	button.type = "button";
	button.innerHTML = `<span class="num">${String(i + 1).padStart(2, "0")}</span><span class="name">${room.name}</span><span class="tick"></span>`;
	button.addEventListener("click", () => go(i));
	button.dataset.index = String(i);
	rail.appendChild(button);
}

/* ------------------------------------------------------------------- ui ---- */
document.getElementById("btn-orbit").addEventListener("click", (event) => {
	if (!controls) return;
	controls.autoRotate = !controls.autoRotate;
	event.currentTarget.setAttribute("aria-pressed", String(controls.autoRotate));
});

document.getElementById("btn-reset").addEventListener("click", () => resetView());

document.getElementById("btn-prose").addEventListener("click", (event) => {
	const shown = !proseEl.hasAttribute("hidden");
	if (shown) proseEl.setAttribute("hidden", "");
	else proseEl.removeAttribute("hidden");
	event.currentTarget.setAttribute("aria-pressed", String(!shown));
});

window.addEventListener("keydown", (event) => {
	if (event.key >= "1" && event.key <= "5") go(Number(event.key) - 1);
	if (event.key === "ArrowRight") go((state.index + 1) % rooms.length);
	if (event.key === "ArrowLeft") go((state.index - 1 + rooms.length) % rooms.length);
	if (event.key === "r" || event.key === "R") resetView();
});

function resetView() {
	if (!state.current || !controls) return;
	const view = state.current.view;
	state.current.camera.position.copy(view.position);
	controls.target.copy(view.target);
	controls.update();
}

function renderParams() {
	paramsEl.innerHTML = "";
	const params = state.current?.params || [];
	for (const param of params) {
		const row = document.createElement("label");
		row.className = "param";
		const output = document.createElement("output");
		const input = document.createElement("input");
		input.type = "range";
		input.min = String(param.min);
		input.max = String(param.max);
		input.step = String(param.step ?? 0.01);
		input.value = String(param.value);
		const format = param.format || ((v) => String(v));
		output.textContent = format(param.value);
		input.addEventListener("input", () => {
			const value = Number(input.value);
			output.textContent = format(value);
			state.current?.setParam?.(param.key ?? param.id, value);
		});
		row.append(document.createTextNode(param.label), input, output);
		paramsEl.appendChild(row);
	}
	paramsEl.style.display = params.length ? "flex" : "none";
}

function renderProse() {
	const room = rooms[state.index];
	titleEl.textContent = room.title;
	subEl.textContent = room.sub;
	indexEl.textContent = String(state.index + 1).padStart(2, "0");
	proseBody.innerHTML = "";
	for (const paragraph of room.prose) {
		const p = document.createElement("p");
		p.textContent = paragraph;
		proseBody.appendChild(p);
	}
	Array.from(rail.children).forEach((button, i) => button.classList.toggle("active", i === state.index));
}

/* ---------------------------------------------------------------- create --- */
const env = { THREE, renderer, width: 1, height: 1 };

function resize() {
	const width = window.innerWidth;
	const height = window.innerHeight;
	renderer.setSize(width, height, false);
	env.width = width;
	env.height = height;
	if (state.current) {
		state.current.camera.aspect = width / height;
		state.current.camera.updateProjectionMatrix();
		state.current.resize?.(width, height);
	}
}
window.addEventListener("resize", resize);

async function go(index) {
	if (state.switching || index === state.index) return;
	state.switching = true;
	veil.classList.add("on");
	await wait(260);

	if (state.current) {
		controls?.dispose();
		state.current.dispose?.();
		state.current = null;
		controls = null;
	}

	const room = rooms[index];
	const module = await room.load();
	const created = await module.create({ ...env, room });
	state.index = index;
	state.current = created;
	created.camera.aspect = env.width / env.height;
	created.camera.updateProjectionMatrix();

	controls = new OrbitControls(created.camera, canvas);
	controls.enableDamping = true;
	controls.dampingFactor = 0.06;
	controls.enablePan = false;
	controls.autoRotate = created.view.autoRotate ?? true;
	controls.autoRotateSpeed = 0.28;
	controls.target.copy(created.view.target);
	controls.minDistance = created.view.minDistance ?? 1.2;
	controls.maxDistance = created.view.maxDistance ?? 14;
	controls.minPolarAngle = created.view.minPolar || 0.35;
	controls.maxPolarAngle = created.view.maxPolar || Math.PI * 0.52;
	created.camera.position.copy(created.view.position);
	controls.update();
	state.controls = controls;
	state.elapsed = 0;

	// camera read-out kept behind ?debug for development
	if (new URLSearchParams(location.search).has("debug")) {
		const dbg = document.getElementById("dbg") || (() => {
			const el = document.createElement("div");
			el.id = "dbg";
			el.style.cssText = "position:fixed;left:50%;top:8px;transform:translateX(-50%);color:#fff;font:12px monospace;background:rgba(0,0,0,.65);padding:4px 8px;border-radius:4px;z-index:99";
			document.body.appendChild(el);
			return el;
		})();
		dbg.textContent = "cam " + created.camera.position.toArray().map((v) => v.toFixed(2)).join(", ") + "  tgt " + controls.target.toArray().map((v) => v.toFixed(2)).join(", ");
	}

	renderParams();
	renderProse();
	document.getElementById("btn-orbit").setAttribute("aria-pressed", "true");

	await wait(120);
	veil.classList.remove("on");
	loading.classList.add("done");
	state.switching = false;
}

function wait(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ loop --- */
function frame() {
	requestAnimationFrame(frame);
	const dt = Math.min(clock.getDelta(), 0.05);
	if (!state.current) return;
	state.elapsed += dt;
	state.current.update?.(state.elapsed, dt);
	controls?.update();
	renderer.render(state.current.scene, state.current.camera);
}

document.addEventListener("visibilitychange", () => {
	state.visible = !document.hidden;
	if (state.visible) clock.getDelta();
});

resize();
go(0);
frame();
