import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { terrainCameraFrame, createTerrainSelection, terrainDefaults, terrainDistrict, terrainRings, withinTerrain, type Coordinate, type TerrainData, type TerrainFeature, type TerrainPlace } from "./terrain-model";

export type TerrainView = "top" | "3d";
export type TerrainScene = { dispose: () => void; setView: (view: TerrainView) => void; pause: (paused: boolean) => void; setDark: (dark: boolean) => void };
type Options = { host: HTMLDivElement; data: TerrainData; elevations: Float32Array; image: HTMLImageElement; places: TerrainPlace[]; onSelect: (place: TerrainPlace, trigger: HTMLButtonElement) => void; onFailure: () => void; dark: boolean };

/** Landing-only terrain renderer. The ordinary Explore/Detail map is unchanged. */
export function mountTerrain({ host, data, elevations, image, places, onSelect, onFailure, dark }: Options): TerrainScene {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const scene = new THREE.Scene();
  const background = () => dark ? "#19291f" : "#e9ede7";
  scene.background = new THREE.Color(background());
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.35;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  host.append(renderer.domElement);
  const labels = new CSS2DRenderer(); labels.domElement.className = "hg-terrain-labels"; host.append(labels.domElement);
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, .45, 0); controls.enableDamping = true; controls.dampingFactor = .08;
  controls.enablePan = false; controls.enableZoom = false; controls.enableRotate = true;
  controls.minPolarAngle = .018; controls.maxPolarAngle = Math.PI * .43;
  controls.autoRotateSpeed = .5; controls.rotateSpeed = .45;
  const [west, south, east, north] = data.bbox, n = data.size;
  const width = (east - west) * 111.32 * Math.cos((south + north) / 2 * Math.PI / 180) * .065;
  const depth = (north - south) * 111.32 * .065;
  const baseY = -.05;
  let disposed = false, visible = true, paused = false, hovering = false, interacting = false;
  let view: TerrainView = terrainDefaults.view, hovered = -1, dirty = true, animation = 0, resumeAt = 0;
  let lastTime = 0, lastHit = 0, focusFrame = 0, pointer: { x: number; y: number } | null = null;
  let tween: { from: THREE.Vector3; to: THREE.Vector3; start: number } | null = null;
  const groups = Array.from({ length: data.districts.length + 1 }, () => new THREE.Group());
  groups.forEach(group => scene.add(group));
  const meshes: THREE.Mesh[] = [];
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const pinLabels: { object: CSS2DObject; name: HTMLSpanElement; button: HTMLButtonElement; district: number; place: TerrainPlace }[] = [];
  const areaLabels: { object: CSS2DObject; district: number }[] = [];
  const roadLabels: CSS2DObject[] = [];
  const selection = createTerrainSelection(district => {
    hovered = district; host.dataset.hoveredDistrict = data.districts[district]?.properties.name ?? "";
    pinLabels.forEach(pin => {
      const show = district >= 0 && pin.district === district;
      pin.object.visible = show; pin.object.element.hidden = !show; pin.button.tabIndex = show ? 0 : -1;
    });
    areaLabels.forEach(label => label.object.element.setAttribute("aria-pressed", String(label.district === district)));
    dirty = true;
  });
  const listeners: (() => void)[] = [];
  const listen = <K extends keyof HTMLElementEventMap>(node: HTMLElement, type: K, handler: (event: HTMLElementEventMap[K]) => void) => {
    node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler));
  };
  const xy = ([lon, lat]: Coordinate) => new THREE.Vector3((lon - west) / (east - west) * width - width / 2, 0, (north - lat) / (north - south) * depth - depth / 2);
  const lonLat = (x: number, z: number): Coordinate => [west + (x + width / 2) / width * (east - west), north - (z + depth / 2) / depth * (north - south)];
  const height = (coordinate: Coordinate) => {
    const x = THREE.MathUtils.clamp((coordinate[0] - west) / (east - west) * (n - 1), 0, n - 1);
    const y = THREE.MathUtils.clamp((north - coordinate[1]) / (north - south) * (n - 1), 0, n - 1);
    const ix = Math.min(n - 2, Math.floor(x)), iy = Math.min(n - 2, Math.floor(y)), a = x - ix, b = y - iy;
    const metres = elevations[iy * n + ix]! * (1 - a) * (1 - b) + elevations[iy * n + ix + 1]! * a * (1 - b)
      + elevations[(iy + 1) * n + ix]! * (1 - a) * b + elevations[(iy + 1) * n + ix + 1]! * a * b;
    return .035 + metres / 1000 * .22 * terrainDefaults.relief;
  };
  const trace = (ctx: CanvasRenderingContext2D, feature: TerrainFeature, size: number) => {
    for (const polygon of terrainRings(feature)) for (const ring of polygon) {
      ring.forEach(([lon, lat], index) => {
        const x = (lon - west) / (east - west) * size, y = (north - lat) / (north - south) * size;
        if (index) ctx.lineTo(x, y); else ctx.moveTo(x, y);
      }); ctx.closePath();
    }
  };
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 4096;
  const ctx = canvas.getContext("2d")!;
  ctx.beginPath(); trace(ctx, data.province, 4096); ctx.clip("evenodd"); ctx.drawImage(image, 0, 0, 4096, 4096);
  data.districts.forEach(feature => {
    ctx.beginPath(); trace(ctx, feature, 4096); ctx.globalAlpha = .48; ctx.fillStyle = feature.properties.color ?? "#7a9b70"; ctx.fill("evenodd");
  });
  const line = (coordinates: Coordinate[]) => {
    ctx.beginPath(); coordinates.forEach(([lon, lat], i) => {
      const x = (lon - west) / (east - west) * 4096, y = (north - lat) / (north - south) * 4096;
      if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y);
    });
  };
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  for (const river of data.rivers) { line(river.coordinates); ctx.globalAlpha = .65; ctx.lineWidth = 5; ctx.strokeStyle = "#66aebd"; ctx.stroke(); }
  // Preserve every source road. Wider bright cores and dark casings make them
  // readable against both the satellite surface and the administrative colors.
  const roadWidth = (kind: string) => kind === "trunk" || kind === "primary" ? 11 : kind === "secondary" ? 7 : 4.5;
  const roads = [...data.roads].sort((a, b) => roadWidth(a.kind) - roadWidth(b.kind));
  ctx.globalAlpha = .85;
  for (const road of roads) { line(road.coordinates); ctx.lineWidth = roadWidth(road.kind) + 6; ctx.strokeStyle = "#344b36"; ctx.stroke(); }
  ctx.globalAlpha = 1;
  for (const road of roads) { line(road.coordinates); ctx.lineWidth = roadWidth(road.kind); ctx.strokeStyle = roadWidth(road.kind) >= 11 ? "#ffe9a8" : "#fff4ce"; ctx.stroke(); }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8); textures.add(texture);

  // Rasterize ownership once, then partition the measured terrain's triangles.
  // Each district moves as a real mesh, together with its boundaries and labels.
  const mask = document.createElement("canvas"); mask.width = mask.height = n;
  const maskContext = mask.getContext("2d", { willReadFrequently: true })!;
  maskContext.beginPath(); trace(maskContext, data.province, n); maskContext.clip("evenodd");
  data.districts.forEach((feature, i) => { maskContext.beginPath(); trace(maskContext, feature, n); maskContext.fillStyle = `rgb(${i + 1},0,0)`; maskContext.fill("evenodd"); });
  const owners = maskContext.getImageData(0, 0, n, n).data;
  const plane = new THREE.PlaneGeometry(width, depth, n - 1, n - 1); plane.rotateX(-Math.PI / 2);
  const positions = plane.attributes.position!;
  let terrainCeiling = baseY;
  for (let i = 0; i < positions.count; i++) {
    const elevation = .035 + elevations[i]! / 1000 * .22 * terrainDefaults.relief;
    positions.setY(i, elevation); terrainCeiling = Math.max(terrainCeiling, elevation);
  }
  plane.computeVertexNormals(); geometries.add(plane);
  const buckets = groups.map(() => [] as number[]);
  const indices = plane.index!;
  for (let i = 0; i < indices.count; i += 3) {
    const a = indices.getX(i), b = indices.getX(i + 1), c = indices.getX(i + 2);
    const col = Math.min(n - 1, Math.floor((a % n + b % n + c % n) / 3));
    const row = Math.min(n - 1, Math.floor((Math.floor(a / n) + Math.floor(b / n) + Math.floor(c / n)) / 3));
    const owner = owners[(row * n + col) * 4]! - 1;
    buckets[owner >= 0 && owner < data.districts.length ? owner : data.districts.length]!.push(a, b, c);
  }
  buckets.forEach((bucket, i) => {
    const geo = new THREE.BufferGeometry(); geo.setAttribute("position", positions); geo.setAttribute("normal", plane.attributes.normal!); geo.setAttribute("uv", plane.attributes.uv!); geo.setIndex(bucket); geometries.add(geo);
    const material = new THREE.MeshStandardMaterial({ map: texture, alphaTest: .65, roughness: 1, side: THREE.DoubleSide }); materials.add(material);
    const mesh = new THREE.Mesh(geo, material); mesh.castShadow = true; groups[i]!.add(mesh); meshes.push(mesh);
  });

  function dense(ring: Coordinate[]) {
    const result: Coordinate[] = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!;
      const steps = Math.max(1, Math.ceil(Math.hypot((b[0] - a[0]) * 95, (b[1] - a[1]) * 111) / .3));
      for (let j = 0; j < steps; j++) result.push([a[0] + (b[0] - a[0]) * j / steps, a[1] + (b[1] - a[1]) * j / steps]);
    }
    result.push(ring[ring.length - 1]!); return result;
  }
  const wallMaterial = new THREE.MeshStandardMaterial({ color: "#73806a", roughness: 1, side: THREE.DoubleSide }); materials.add(wallMaterial);
  data.districts.forEach((feature, i) => {
    for (const polygon of terrainRings(feature)) for (const ring of polygon) {
      const coordinates = dense(ring), vertices: number[] = [], border: number[] = [], index: number[] = [];
      coordinates.forEach((coordinate, j) => {
        const p = xy(coordinate), y = height(coordinate);
        vertices.push(p.x, baseY, p.z, p.x, y, p.z); border.push(p.x, y + .012, p.z);
        if (j < coordinates.length - 1) index.push(j * 2, j * 2 + 2, j * 2 + 1, j * 2 + 2, j * 2 + 3, j * 2 + 1);
      });
      const wall = new THREE.BufferGeometry(); wall.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3)); wall.setIndex(index); wall.computeVertexNormals(); geometries.add(wall);
      const side = new THREE.Mesh(wall, wallMaterial); side.visible = false; side.castShadow = true; side.userData.terrainSide = true; groups[i]!.add(side);
      const lineGeometry = new THREE.BufferGeometry(); lineGeometry.setAttribute("position", new THREE.Float32BufferAttribute(border, 3)); geometries.add(lineGeometry);
      const boundaryMaterial = new THREE.LineBasicMaterial({ color: "#f8edc7", transparent: true, opacity: .6, depthWrite: false }); materials.add(boundaryMaterial);
      groups[i]!.add(new THREE.Line(lineGeometry, boundaryMaterial));
    }
    const polygon = terrainRings(feature).sort((a, b) => b[0]!.length - a[0]!.length)[0]![0]!;
    let coordinate = polygon.reduce<Coordinate>((acc, p) => [acc[0] + p[0] / polygon.length, acc[1] + p[1] / polygon.length], [0, 0]);
    if (!withinTerrain(coordinate, feature)) coordinate = polygon[Math.floor(polygon.length / 2)]!;
    const element = document.createElement("button"); element.type = "button"; element.className = "hg-terrain-area"; element.textContent = feature.properties.name ?? "";
    element.setAttribute("aria-label", `Khám phá khu vực ${feature.properties.name ?? ""}`); element.setAttribute("aria-pressed", "false");
    listen(element, "focus", () => { pointer = null; selection.activate(i, "keyboard"); });
    listen(element, "pointerenter", event => { if (event.pointerType === "mouse") selection.activate(i, "pointer"); });
    listen(element, "click", event => {
      event.stopPropagation(); selection.activate(i, event.detail === 0 ? "keyboard" : (event as PointerEvent).pointerType === "mouse" ? "pointer" : "touch"); updateMotion();
      if (event.detail === 0) {
        cancelAnimationFrame(focusFrame);
        focusFrame = requestAnimationFrame(() => { if (!disposed && selection.district === i) pinLabels.find(pin => pin.district === i)?.button.focus({ preventScroll: true }); });
      }
    });
    const label = new CSS2DObject(element), p = xy(coordinate); label.position.set(p.x, height(coordinate) + .06, p.z); groups[i]!.add(label); areaLabels.push({ object: label, district: i });
  });
  places.forEach(place => {
    const district = terrainDistrict(place.coordinate, data);
    const root = document.createElement("div"); root.className = "hg-terrain-pin";
    const button = document.createElement("button"); button.type = "button"; button.className = "hg-terrain-pin-button"; button.setAttribute("aria-label", `Xem ${place.name}`); button.setAttribute("aria-expanded", "false"); button.title = place.name;
    const dot = document.createElement("span"); dot.className = "hg-terrain-dot"; dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span"); name.className = "hg-terrain-pin-name"; name.textContent = place.name;
    button.append(dot, name); root.append(button);
    const object = new CSS2DObject(root), p = xy(place.coordinate); object.position.set(p.x, height(place.coordinate) + .055, p.z);
    object.visible = false; root.hidden = true; button.tabIndex = -1;
    groups[district < 0 ? data.districts.length : district]!.add(object); pinLabels.push({ object, name, button, district, place });
    listen(button, "click", event => { event.stopPropagation(); pinLabels.forEach(pin => pin.button.setAttribute("aria-expanded", String(pin.button === button))); paused = true; selection.preview(true); updateMotion(); onSelect(place, button); });
    listen(button, "focus", () => { pointer = null; selection.activate(district, "keyboard"); });
  });
  for (const sign of data.roadLabels) {
    const element = document.createElement("span"); element.className = "hg-terrain-road-sign"; element.textContent = sign.ref.replace("QL.", "QL "); element.setAttribute("aria-hidden", "true");
    const object = new CSS2DObject(element), p = xy(sign.coordinate); object.position.set(p.x, height(sign.coordinate) + .03, p.z);
    const district = terrainDistrict(sign.coordinate, data); groups[district < 0 ? data.districts.length : district]!.add(object);
    roadLabels.push(object);
  }
  scene.add(new THREE.HemisphereLight("#f6f8ee", "#747563", 1.65));
  const sun = new THREE.DirectionalLight("#fff5dd", 1.65); sun.position.set(-6, 10, 4); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -.0003; sun.shadow.normalBias = .025;
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: .5, far: 35 }); scene.add(sun);
  const floorGeometry = new THREE.PlaneGeometry(80, 80), floorMaterial = new THREE.ShadowMaterial({ opacity: .13 }); geometries.add(floorGeometry); materials.add(floorMaterial);
  const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.position.y = baseY - .02; floor.receiveShadow = true; scene.add(floor);

  // Extrude the actual outline through the maximum elevation and hover lift,
  // enclosing every interior peak and pin without fitting an oversized sphere.
  // Keep these relative to the fixed orbit target so dragging stays predictable.
  const fitPoints = terrainRings(data.province).flatMap(polygon => polygon[0]!.flatMap(coordinate => {
    const p = xy(coordinate);
    return [{ x: p.x, y: baseY - controls.target.y, z: p.z }, { x: p.x, y: terrainCeiling + .3 - controls.target.y, z: p.z }];
  }));
  const cameraFrame = (direction: THREE.Vector3) => terrainCameraFrame(fitPoints, direction, host.clientWidth, host.clientHeight, camera.fov);
  const fitDirection = new THREE.Vector3();
  function homePosition(next: TerrainView) {
    const direction = next === "top" ? new THREE.Vector3(0, 1, .018) : new THREE.Vector3(.08, .72, .71);
    return direction.normalize().multiplyScalar(cameraFrame(direction).distance).add(controls.target);
  }
  function updateMotion() { controls.autoRotate = !reduced.matches && visible && !document.hidden && !paused && !hovering && selection.input !== "touch" && !host.contains(document.activeElement) && !interacting && performance.now() >= resumeAt; }
  function setView(next: TerrainView) {
    view = next; selection.reset();
    tween = reduced.matches ? null : { from: camera.position.clone(), to: homePosition(next), start: performance.now() };
    if (!tween) camera.position.copy(homePosition(next)); dirty = true;
  }
  function resize() {
    renderer.setSize(host.clientWidth, host.clientHeight); labels.setSize(host.clientWidth, host.clientHeight);
    camera.aspect = host.clientWidth / host.clientHeight; camera.fov = camera.aspect < 1 ? 48 : 40;
    camera.clearViewOffset();
    camera.position.copy(homePosition(view)); controls.update(); dirty = true;
  }
  const ray = new THREE.Raycaster(), mouse = new THREE.Vector2(), ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), -.4), hit = new THREE.Vector3();
  function districtAt(x: number, y: number) {
    const rect = renderer.domElement.getBoundingClientRect(); mouse.set((x - rect.left) / rect.width * 2 - 1, -(y - rect.top) / rect.height * 2 + 1);
    ray.setFromCamera(mouse, camera); ground.constant = -.4;
    for (let i = 0; i < 4; i++) {
      if (!ray.ray.intersectPlane(ground, hit)) return -1;
      const coordinate = lonLat(hit.x, hit.z), district = terrainDistrict(coordinate, data);
      ground.constant = -height(coordinate) - (groups[district]?.position.y ?? 0);
    }
    return terrainDistrict(lonLat(hit.x, hit.z), data);
  }
  function hitDistrict() {
    if (!pointer || interacting || tween || paused) return;
    // A pin name can extend beyond its district's outline. Keep it available
    // while moving from the terrain onto the actual button.
    const pin = pinLabels.find(label => label.object.visible && label.button.matches(":hover"));
    const label = areaLabels.find(label => label.object.element.matches(":hover"));
    selection.activate(pin?.district ?? label?.district ?? districtAt(pointer.x, pointer.y), "pointer");
  }
  listen(host, "pointerenter", event => { if (event.pointerType === "mouse") { hovering = true; updateMotion(); } });
  listen(host, "pointermove", event => { if (event.pointerType === "mouse") pointer = { x: event.clientX, y: event.clientY }; });
  listen(host, "pointerleave", () => { hovering = false; pointer = null; selection.leave(); updateMotion(); dirty = true; });
  listen(host, "focusin", () => { updateMotion(); });
  listen(host, "focusout", event => { if (!host.contains(event.relatedTarget as Node | null)) { selection.blur(); updateMotion(); dirty = true; } });
  let touch: { id: number; x: number; y: number; dragged: boolean } | null = null;
  listen(host, "pointerdown", event => {
    if (event.pointerType !== "mouse" && !(event.target as Element).closest("button")) {
      if (touch) touch.dragged = true;
      else touch = { id: event.pointerId, x: event.clientX, y: event.clientY, dragged: false };
    }
  });
  listen(host, "pointermove", event => {
    if (touch?.id === event.pointerId && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 8) touch.dragged = true;
  });
  listen(host, "pointerup", event => {
    if (touch?.id !== event.pointerId) return;
    if (!touch.dragged) { pointer = null; selection.activate(districtAt(event.clientX, event.clientY), "touch"); updateMotion(); }
    touch = null;
  });
  listen(host, "pointercancel", () => { touch = null; });
  listen(host, "keydown", event => {
    if (event.target !== host || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault(); const offset = camera.position.clone().sub(controls.target), sphere = new THREE.Spherical().setFromVector3(offset);
    if (event.key === "ArrowLeft") sphere.theta -= .12; if (event.key === "ArrowRight") sphere.theta += .12;
    if (event.key === "ArrowUp") sphere.phi = Math.max(.018, sphere.phi - .1); if (event.key === "ArrowDown") sphere.phi = Math.min(Math.PI * .43, sphere.phi + .1);
    camera.position.copy(controls.target).add(new THREE.Vector3().setFromSpherical(sphere)); controls.update(); dirty = true;
  });
  const onStart = () => { interacting = true; if (!paused) selection.reset(); tween = null; updateMotion(); };
  const onEnd = () => { interacting = false; resumeAt = performance.now() + 1800; dirty = true; };
  const onChange = () => { dirty = true; };
  controls.addEventListener("start", onStart); controls.addEventListener("end", onEnd); controls.addEventListener("change", onChange);
  const onVisibility = () => { updateMotion(); dirty = true; };
  document.addEventListener("visibilitychange", onVisibility); reduced.addEventListener("change", onVisibility);
  const onContextLost = (event: Event) => { event.preventDefault(); onFailure(); };
  renderer.domElement.addEventListener("webglcontextlost", onContextLost);
  listeners.push(() => renderer.domElement.removeEventListener("webglcontextlost", onContextLost));
  const observer = new IntersectionObserver(([entry]) => { visible = entry?.isIntersecting ?? false; updateMotion(); }); observer.observe(host);
  const resizeObserver = new ResizeObserver(resize); resizeObserver.observe(host); resize(); updateMotion();
  host.dataset.terrainReady = "true"; host.dataset.roadCount = String(data.roads.length); host.dataset.placeCount = String(places.length);

  function frame(now: number) {
    if (disposed) return; animation = requestAnimationFrame(frame);
    const dt = Math.min((now - lastTime) / 1000 || .016, .05); lastTime = now;
    if (!visible || document.hidden) return;
    updateMotion();
    if (pointer && now - lastHit > 80) { hitDistrict(); lastHit = now; }
    let moving = false;
    groups.forEach((group, index) => {
      const target = index === hovered ? .24 : 0;
      const next = reduced.matches ? target : THREE.MathUtils.damp(group.position.y, target, 11, dt);
      if (Math.abs(next - target) > .0005) moving = true;
      if (Math.abs(group.position.y - next) > .00001) dirty = true;
      group.position.y = Math.abs(next - target) < .0005 ? target : next;
      group.children.forEach(child => { if (child.userData.terrainSide) child.visible = group.position.y > .005; });
    });
    if (tween) {
      const t = THREE.MathUtils.clamp((now - tween.start) / 700, 0, 1); camera.position.lerpVectors(tween.from, tween.to, t * t * (3 - 2 * t)); dirty = true;
      if (t === 1) tween = null;
    }
    const changed = controls.update(dt);
    if (!dirty && !changed && !moving && !controls.autoRotate) return;
    fitDirection.copy(camera.position).sub(controls.target).normalize();
    const fit = cameraFrame(fitDirection);
    camera.position.copy(fitDirection.multiplyScalar(fit.distance)).add(controls.target);
    camera.setViewOffset(host.clientWidth, host.clientHeight, fit.offsetX, fit.offsetY, host.clientWidth, host.clientHeight);
    camera.updateMatrixWorld();
    renderer.render(scene, camera); labels.render(scene, camera);
    // District names take priority. Never hide them to make room for a pin.
    const occupied = areaLabels.map(label => label.object.element.getBoundingClientRect()), bounds = host.getBoundingClientRect();
    for (const sign of roadLabels) {
      const box = sign.element.getBoundingClientRect();
      sign.element.style.visibility = occupied.some(r => box.left < r.right && box.right > r.left && box.top < r.bottom && box.bottom > r.top) ? "hidden" : "visible";
    }
    const pins = [...pinLabels].sort((a, b) => Number(b.button.getAttribute("aria-expanded") === "true") - Number(a.button.getAttribute("aria-expanded") === "true"));
    for (const pin of pins) {
      if (!pin.object.visible) continue;
      const element = pin.object.element; element.classList.remove("is-compact", "is-flipped");
      if (pin.name.getBoundingClientRect().right > bounds.right - 12) element.classList.add("is-flipped");
      const box = pin.name.getBoundingClientRect();
      let overlaps = occupied.some(r => box.left < r.right + 5 && box.right > r.left - 5 && box.top < r.bottom + 4 && box.bottom > r.top - 4);
      if (overlaps) {
        element.classList.toggle("is-flipped");
        const alternative = pin.name.getBoundingClientRect();
        const fits = alternative.left >= bounds.left + 8 && alternative.right <= bounds.right - 8 && !occupied.some(r => alternative.left < r.right + 5 && alternative.right > r.left - 5 && alternative.top < r.bottom + 4 && alternative.bottom > r.top - 4);
        if (fits) overlaps = false; else element.classList.toggle("is-flipped");
      }
      const force = pin.button.matches(":hover,:focus-visible") || pin.button.getAttribute("aria-expanded") === "true";
      element.classList.toggle("is-compact", overlaps && !force); if (!overlaps || force) occupied.push(pin.name.getBoundingClientRect());
    }
    host.dataset.autoRotate = String(controls.autoRotate); host.dataset.lift = groups[hovered]?.position.y.toFixed(3) ?? "0"; dirty = false;
  }
  animation = requestAnimationFrame(frame);
  return {
    setView,
    pause(value) { paused = value; selection.preview(value); if (!value) pinLabels.forEach(pin => pin.button.setAttribute("aria-expanded", "false")); updateMotion(); dirty = true; },
    setDark(value) { dark = value; scene.background = new THREE.Color(background()); dirty = true; },
    dispose() {
      if (disposed) return; disposed = true; cancelAnimationFrame(animation); cancelAnimationFrame(focusFrame); observer.disconnect(); resizeObserver.disconnect();
      listeners.forEach(remove => remove()); document.removeEventListener("visibilitychange", onVisibility); reduced.removeEventListener("change", onVisibility);
      controls.removeEventListener("start", onStart); controls.removeEventListener("end", onEnd); controls.removeEventListener("change", onChange); controls.dispose();
      geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); textures.forEach(item => item.dispose()); sun.shadow.map?.dispose();
      scene.clear(); renderer.dispose(); renderer.domElement.remove(); labels.domElement.remove(); delete host.dataset.terrainReady;
    },
  };
}
