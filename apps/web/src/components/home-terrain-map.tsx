"use client";

import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Info, X } from "lucide-react";
import type { PublicLocation } from "@/modules/destination/public-destination-list";
import { destinationThumbnail } from "@/modules/destination/destination-image-url";
import { destinationDetailHref } from "@/modules/map/map-model";
import { terrainDefaults, terrainPlaces, type TerrainData, type TerrainPlace } from "@/modules/map/terrain-model";
import type { TerrainScene, TerrainView } from "@/modules/map/terrain-renderer";
import "./home-terrain-map.css";

const assets = "/terrain/ha-giang";

export default function HomeTerrainMap({ destinations, descriptions = {} }: {
  destinations: readonly PublicLocation[]; descriptions?: Record<string, string>;
}) {
  const wrapper = useRef<HTMLDivElement>(null), host = useRef<HTMLDivElement>(null);
  const scene = useRef<TerrainScene | null>(null), trigger = useRef<HTMLButtonElement | null>(null);
  const popup = useRef<HTMLElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const [inView, setInView] = useState(false), [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0), [view, setView] = useState<TerrainView>(terrainDefaults.view);
  const [selected, setSelected] = useState<TerrainPlace | null>(null);
  const { resolvedTheme } = useTheme(), dark = useRef(resolvedTheme === "dark");
  useEffect(() => { dark.current = resolvedTheme === "dark"; scene.current?.setDark(dark.current); }, [resolvedTheme]);
  useEffect(() => {
    if (!wrapper.current) return;
    const observer = new IntersectionObserver(([entry]) => { if (entry?.isIntersecting) { setInView(true); observer.disconnect(); } }, { rootMargin: "300px" });
    observer.observe(wrapper.current); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    if (!inView || !host.current) return;
    let active = true, dispose = () => {};
    const controller = new AbortController();
    setState("loading"); setSelected(null); setView(terrainDefaults.view);
    const deadline = window.setTimeout(() => { controller.abort(); if (active) { dispose(); setState("error"); } }, 25000);
    const image = new window.Image();
    const imageReady = new Promise<HTMLImageElement>((resolve, reject) => {
      image.onload = () => resolve(image); image.onerror = () => reject(new Error("Terrain imagery unavailable"));
      controller.signal.addEventListener("abort", () => { image.src = ""; reject(new Error("Terrain load cancelled")); }, { once: true });
      image.src = `${assets}/satellite.jpg`;
    });
    async function mount() {
      const [module, geography, elevationResponse, satellite] = await Promise.all([
        import("@/modules/map/terrain-renderer"),
        fetch(`${assets}/landscape.json`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("Terrain data unavailable"); return response.json() as Promise<TerrainData>; }),
        fetch(`${assets}/dem.bin`, { signal: controller.signal }).then(response => { if (!response.ok) throw new Error("Elevation data unavailable"); return response.arrayBuffer(); }),
        imageReady,
      ]);
      if (!active || controller.signal.aborted || !host.current) return;
      const elevations = new Float32Array(elevationResponse);
      if (elevations.length !== geography.size ** 2 || geography.size > 1024) throw new Error("Incomplete terrain data");
      const result = module.mountTerrain({ host: host.current, data: geography, elevations, image: satellite, places: terrainPlaces(geography, destinations), dark: dark.current,
        onSelect(place, button) { if (active) { trigger.current = button; setSelected(place); } },
        onFailure() { if (active) { dispose(); setState("error"); } },
      });
      dispose = result.dispose; scene.current = result;
      if (!active) { dispose(); return; }
      window.clearTimeout(deadline); setState("ready");
    }
    void mount().catch(() => { if (active && !controller.signal.aborted) { window.clearTimeout(deadline); dispose(); setState("error"); } });
    return () => { active = false; window.clearTimeout(deadline); controller.abort(); image.onload = image.onerror = null; dispose(); scene.current = null; };
  }, [inView, destinations, attempt]);

  function close() {
    setSelected(null); scene.current?.pause(false);
    // Do not scroll the document back to a pin outside the current map viewport.
    trigger.current?.focus({ preventScroll: true });
  }
  function changeView(next: TerrainView) {
    setSelected(null); scene.current?.pause(false); setView(next); scene.current?.setView(next);
  }
  useEffect(() => {
    if (!selected) return;
    heading.current?.focus({ preventScroll: true });
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); setSelected(null); scene.current?.pause(false); trigger.current?.focus({ preventScroll: true }); } };
    document.addEventListener("keydown", onKey); return () => document.removeEventListener("keydown", onKey);
  }, [selected]);
  const destination = selected?.destination;

  return <div ref={wrapper} className="hg-terrain" data-ui>
    <div className="hg-terrain-stage-wrap">
      <div ref={host} className="hg-terrain-stage" role="group" tabIndex={0}
        aria-label="Bản đồ địa hình Hà Giang. Rê chuột hoặc chạm vào huyện để hiện điểm đến. Dùng phím mũi tên đổi góc nhìn; Tab đến tên huyện, Enter để tới các điểm đến."
        aria-busy={state === "loading"} />
      <div className="hg-terrain-views" role="group" aria-label="Góc nhìn bản đồ">
        <button type="button" disabled={state !== "ready"} aria-pressed={view === "3d"} onClick={() => changeView("3d")}>3D</button>
        <button type="button" disabled={state !== "ready"} aria-pressed={view === "top"} onClick={() => changeView("top")}>Từ trên cao</button>
      </div>
      {state !== "ready" && <div className="hg-terrain-state" role={state === "error" ? "alert" : "status"}>
        <strong>{state === "error" ? "Chưa thể tải địa hình Hà Giang" : "Đang mở những miền đất Hà Giang…"}</strong>
        {state === "error" && <><p>Bạn vẫn có thể xem các điểm đến trong Khám phá.</p><button type="button" onClick={() => setAttempt(value => value + 1)}>Thử tải lại</button></>}
      </div>}
      {selected && <article ref={popup} className="hg-terrain-preview" aria-label={`Thông tin ${selected.name}`}>
        <button type="button" className="hg-terrain-close" aria-label="Đóng thông tin địa điểm" onClick={close}><X size={17} aria-hidden="true" /></button>
        {destination?.image?.url && <Image className="hg-terrain-photo" src={destinationThumbnail(destination.image.url)} alt={destination.image.alt || destination.name} width={320} height={140} />}
        <div className="hg-terrain-preview-body">
          <p className="hg-terrain-meta">{selected.area}{destination?.category ? ` · ${destination.category}` : ""}</p>
          <h3 ref={heading} tabIndex={-1}>{destination?.name ?? selected.name}</h3>
          <p>{destination ? descriptions[destination.id] || "Khám phá hình ảnh và thông tin của điểm đến." : "Địa danh tham khảo trên bản đồ. Chưa có bài giới thiệu trong Khám phá."}</p>
          {destination && <Link className="hg-terrain-detail" href={destinationDetailHref(destination.id)}>Xem chi tiết <ArrowRight size={16} aria-hidden="true" /></Link>}
        </div>
      </article>}
      <details className="hg-terrain-sources">
        <summary aria-label="Nguồn dữ liệu bản đồ" title="Nguồn dữ liệu bản đồ"><Info size={17} aria-hidden="true" /></summary>
        <div className="hg-terrain-credit"><a href="https://cloudless.eox.at" target="_blank" rel="noreferrer">EOxCloudless by EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2016 &amp; 2017)<br />
          <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a> · <a href="https://openfreemap.org" target="_blank" rel="noreferrer">OpenFreeMap</a> · © OpenMapTiles · <a href="https://www.geoboundaries.org" target="_blank" rel="noreferrer">geoBoundaries</a> · USGS / Mapzen Terrain<br />Phân vùng theo bản đồ Hà Giang tham chiếu.</div>
      </details>
    </div>
  </div>;
}
