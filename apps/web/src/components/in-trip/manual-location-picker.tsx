"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTheme } from "next-themes";
import type * as MapLibre from "maplibre-gl";
import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { loadMapLibre, mapStyle } from "@/modules/map/map-config";
import { mountDestinationPinPicker } from "@/modules/map/maplibre-renderer";
import type { MapCoordinate } from "@/modules/map/map-model";
import {
  coordinateFieldsFromValue,
  startManualLocationMapSession,
  validateManualCoordinates,
  type CoordinateErrors,
  type CoordinateFields,
  type ManualLocationMapState,
} from "@/modules/in-trip/manual-location-picker";
import styles from "./manual-location-picker.module.css";

type PinSession = ReturnType<typeof mountDestinationPinPicker>;

export default function ManualLocationPicker({ coordinates, onChange }: {
  coordinates: MapCoordinate | null;
  onChange: (coordinates: MapCoordinate) => void;
}) {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const latitudeInput = useRef<HTMLInputElement>(null);
  const longitudeInput = useRef<HTMLInputElement>(null);
  const session = useRef<PinSession | null>(null);
  const coordinatesRef = useRef(coordinates);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [fields, setFields] = useState(() => coordinateFieldsFromValue(coordinates));
  const [errors, setErrors] = useState<CoordinateErrors>({});
  const [state, setState] = useState<ManualLocationMapState>("loading");
  const [attempt, setAttempt] = useState(0);
  const { resolvedTheme } = useTheme();
  const style = mapStyle(resolvedTheme);
  const styleRef = useRef(style);
  styleRef.current = style;

  useEffect(() => {
    coordinatesRef.current = coordinates;
    setFields(coordinateFieldsFromValue(coordinates));
    setErrors({});
    session.current?.setCoordinates(coordinates);
  }, [coordinates?.latitude, coordinates?.longitude]);

  useEffect(() => {
    if (!container.current) return;
    const host = container.current;
    let active = true;
    const stop = startManualLocationMapSession({
      load: loadMapLibre,
      onState: value => { if (active) setState(value); },
      mount: (library, ready, fail) => {
        const mounted = mountDestinationPinPicker(
          host, library as typeof MapLibre, coordinatesRef.current, styleRef.current,
          value => {
            if (!active) return;
            coordinatesRef.current = value;
            setFields(coordinateFieldsFromValue(value));
            setErrors({});
            onChangeRef.current(value);
          }, ready, fail,
        );
        session.current = mounted;
        return () => {
          mounted.dispose();
          if (session.current === mounted) session.current = null;
        };
      },
    });
    return () => { active = false; stop(); };
  }, [attempt]);
  useEffect(() => { session.current?.setStyle(style); }, [style]);

  function applyCoordinates() {
    const result = validateManualCoordinates(fields);
    if (!result.ok) {
      setErrors(result.errors);
      (result.errors.latitude ? latitudeInput : longitudeInput).current?.focus();
      return;
    }
    setErrors({});
    coordinatesRef.current = result.coordinates;
    session.current?.setCoordinates(result.coordinates);
    onChangeRef.current(result.coordinates);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      applyCoordinates();
    }
  }

  function updateField(field: keyof CoordinateFields, value: string) {
    setFields(current => ({ ...current, [field]: value }));
    setErrors(current => ({ ...current, [field]: undefined }));
  }

  const mapFailed = state === "error" || state === "timeout";

  return <section className={styles.picker} aria-labelledby={`${id}-title`}>
    <h2 id={`${id}-title`} className={styles.title}>Chọn vị trí thủ công</h2>
    <p className={styles.helper} id={`${id}-help`}>
      Nhấp bản đồ để đặt pin. Kéo pin hoặc đưa tiêu điểm vào pin rồi dùng phím mũi tên để điều chỉnh. Bạn cũng có thể nhập tọa độ bên dưới.
    </p>
    <div className={styles.map}>
      <div ref={container} className={styles.canvas} aria-label="Bản đồ chọn vị trí thủ công"
        style={{ visibility: state === "ready" ? "visible" : "hidden" }} />
      {state !== "ready" && <div className={styles.overlay} role={mapFailed ? "alert" : "status"} aria-busy={state === "loading"}>
        <strong>{state === "loading" ? "Đang tải bản đồ…" : state === "timeout" ? "Bản đồ tải quá lâu" : "Bản đồ hiện không khả dụng"}</strong>
        <p>Bạn vẫn có thể nhập vĩ độ và kinh độ bên dưới để chọn vị trí.</p>
        {mapFailed && <Button type="button" variant="outline" className={styles.retry}
          onClick={() => { setState("loading"); setAttempt(value => value + 1); }}>Thử lại bản đồ</Button>}
      </div>}
    </div>
    <fieldset className={styles.coordinates} aria-describedby={`${id}-coordinate-help`}>
      <legend className={styles.legend}>Nhập tọa độ</legend>
      <p className={styles.helper} id={`${id}-coordinate-help`}>Dùng dấu chấm cho phần thập phân. Bấm “Dùng tọa độ” hoặc Enter để chọn.</p>
      <div className={styles.fields}>
        <div className={styles.field}>
          <label htmlFor={`${id}-latitude`}>Vĩ độ</label>
          <Input ref={latitudeInput} id={`${id}-latitude`} className={styles.input} type="text" inputMode="decimal"
            autoComplete="off" spellCheck={false} value={fields.latitude} onKeyDown={handleKeyDown}
            onChange={event => updateField("latitude", event.target.value)} aria-invalid={Boolean(errors.latitude)}
            aria-describedby={`${id}-latitude-help${errors.latitude ? ` ${id}-latitude-error` : ""}`} />
          <span id={`${id}-latitude-help`} className={styles.helper}>Từ -90 đến 90.</span>
          {errors.latitude && <p id={`${id}-latitude-error`} className={styles.error} role="alert">{errors.latitude}</p>}
        </div>
        <div className={styles.field}>
          <label htmlFor={`${id}-longitude`}>Kinh độ</label>
          <Input ref={longitudeInput} id={`${id}-longitude`} className={styles.input} type="text" inputMode="decimal"
            autoComplete="off" spellCheck={false} value={fields.longitude} onKeyDown={handleKeyDown}
            onChange={event => updateField("longitude", event.target.value)} aria-invalid={Boolean(errors.longitude)}
            aria-describedby={`${id}-longitude-help${errors.longitude ? ` ${id}-longitude-error` : ""}`} />
          <span id={`${id}-longitude-help`} className={styles.helper}>Từ -180 đến 180.</span>
          {errors.longitude && <p id={`${id}-longitude-error`} className={styles.error} role="alert">{errors.longitude}</p>}
        </div>
      </div>
      <Button type="button" className={styles.apply} onClick={applyCoordinates}>Dùng tọa độ</Button>
    </fieldset>
    <p className={styles.helper} role="status" aria-live="polite" aria-atomic="true">
      {coordinates ? `Đã chọn vị trí: vĩ độ ${coordinates.latitude}, kinh độ ${coordinates.longitude}.` : "Chưa chọn vị trí. Chọn pin hoặc nhập đủ hai tọa độ để tiếp tục."}
    </p>
  </section>;
}
