"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useTheme } from "next-themes";
import type * as MapLibre from "maplibre-gl";
import { AlertCircle, CheckCircle2, Clock, LoaderCircle, MapPin, RefreshCw } from "lucide-react";
import { Button } from "@KLTN/ui/components/button";
import { Input } from "@KLTN/ui/components/input";
import { loadMapLibre, mapStyle } from "@/modules/map/map-config";
import { mountDestinationPinPicker } from "@/modules/map/maplibre-renderer";
import type { MapCoordinate } from "@/modules/map/map-model";
import {
  startManualLocationMapSession,
  type ManualLocationMapState,
} from "@/modules/in-trip/manual-location-picker";
import {
  changeOriginSelection,
  type OriginSelection,
} from "@/modules/trip-origin/trip-origin-contract";
import { validateOriginOnServer } from "@/lib/trip-origin-client";
import { searchOriginNominatim, type SearchOutcome } from "@/lib/trip-origin-search-client";

import "./trip-origin.css";

type PinSession = ReturnType<typeof mountDestinationPinPicker>;

export type OriginLocationPickerProps = {
  origin: OriginSelection | null;
  onChange: (next: OriginSelection | null) => void;
  disabled?: boolean;
};

export default function OriginLocationPicker({
  origin,
  onChange,
  disabled = false,
}: OriginLocationPickerProps) {
  const id = useId();
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const sessionRef = useRef<PinSession | null>(null);
  const latest = useRef({ origin, onChange, disabled, label: origin?.label ?? "" });
  const { resolvedTheme } = useTheme();
  const style = mapStyle(resolvedTheme);
  const styleRef = useRef(style);
  styleRef.current = style;

  const [label, setLabel] = useState(origin?.label ?? "");
  latest.current = { origin, onChange, disabled, label };
  const [latText, setLatText] = useState(origin?.latitude != null ? String(origin.latitude) : "");
  const [lngText, setLngText] = useState(origin?.longitude != null ? String(origin.longitude) : "");

  const [mapState, setMapState] = useState<ManualLocationMapState>("loading");
  const [mapAttempt, setMapAttempt] = useState(0);

  const [validating, setValidating] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchResult, setSearchResult] = useState<SearchOutcome | null>(null);
  const searchRequest = useRef<AbortController | null>(null);
  const selectionRevision = useRef(0);
  useEffect(() => () => { searchRequest.current?.abort(); }, []);

  function invalidateRequests() {
    selectionRevision.current++;
    searchRequest.current?.abort();
    setSearching(false);
    setSearchResult(null);
  }

  async function search(text = label) {
    if (disabled || validating) return;
    searchRequest.current?.abort();
    const controller = new AbortController();
    searchRequest.current = controller;
    setSearching(true);
    const result = await searchOriginNominatim(text, controller.signal);
    if (controller.signal.aborted || searchRequest.current !== controller) return;
    setSearching(false);
    setSearchResult(result);
  }
  const [validationError, setValidationError] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string>("");

  // Sync external origin updates (e.g. initial load or resets)
  useEffect(() => {
    if (origin) {
      setLabel(origin.label);
      setLatText(String(origin.latitude));
      setLngText(String(origin.longitude));
      sessionRef.current?.setCoordinates({
        latitude: origin.latitude,
        longitude: origin.longitude,
      });
    }
  }, [origin?.label, origin?.latitude, origin?.longitude]);

  // Mount MapLibre session
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const host = mapContainerRef.current;
    let active = true;

    const initialCoords: MapCoordinate | null =
      origin && Number.isFinite(origin.latitude) && Number.isFinite(origin.longitude)
        ? { latitude: origin.latitude, longitude: origin.longitude }
        : null;

    const stop = startManualLocationMapSession({
      load: loadMapLibre,
      onState: (state) => {
        if (active) setMapState(state);
      },
      mount: (library, ready, fail) => {
        const mounted = mountDestinationPinPicker(
          host,
          library as typeof MapLibre,
          initialCoords,
          styleRef.current,
          (coords) => {
            if (!active || latest.current.disabled) return;
            invalidateRequests();
            setLatText(String(coords.latitude)); setLngText(String(coords.longitude));
            latest.current.onChange({ label: latest.current.label.trim() || "Điểm ghim thủ công", ...coords, source: "MANUAL", confirmed: false });
          },
          ready,
          fail,
        );
        sessionRef.current = mounted;
        return () => {
          mounted.dispose();
          if (sessionRef.current === mounted) sessionRef.current = null;
        };
      },
    });

    return () => {
      active = false;
      stop();
    };
  }, [mapAttempt]);

  useEffect(() => {
    sessionRef.current?.setStyle(style);
  }, [style]);

  function handleMapPinChange(coords: MapCoordinate) {
    if (disabled) return;
    invalidateRequests();
    const lat = Number(coords.latitude.toFixed(6));
    const lng = Number(coords.longitude.toFixed(6));
    setLatText(String(lat));
    setLngText(String(lng));
    setValidationError(null);

    const currentLabel = label.trim() || "Điểm ghim thủ công";
    if (origin) {
      const updated = changeOriginSelection(origin, {
        label: currentLabel,
        latitude: lat,
        longitude: lng,
        source: "MANUAL",
      });
      onChange(updated);
    } else {
      onChange({
        label: currentLabel,
        latitude: lat,
        longitude: lng,
        source: "MANUAL",
        confirmed: false,
      });
    }
    setLiveAnnouncement(`Đã đổi vị trí ghim: vĩ độ ${lat}, kinh độ ${lng}. Chưa được xác nhận.`);
  }

  // Search-as-you-type: debounce so one request goes out per pause, not per keystroke.
  const suggestTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); }, []);

  function handleLabelChange(value: string) {
    invalidateRequests();
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (value.trim().length >= 2) suggestTimer.current = setTimeout(() => void search(value), 300);
    setLabel(value);
    setValidationError(null);

    if (origin) {
      onChange(value.trim() ? { ...origin, label: value.normalize("NFC"), confirmed: false } : null);
    }
  }

  function applyManualCoordinates() {
    const lat = Number.parseFloat(latText);
    const lng = Number.parseFloat(lngText);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      setValidationError("Vĩ độ phải là số hợp lệ từ -90 đến 90.");
      return;
    }
    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      setValidationError("Kinh độ phải là số hợp lệ từ -180 đến 180.");
      return;
    }

    setValidationError(null);
    const coords = { latitude: lat, longitude: lng };
    sessionRef.current?.setCoordinates(coords);
    handleMapPinChange(coords);
  }

  async function handleConfirmOrigin() {
    const cleanLabel = label.trim();
    if (!cleanLabel) {
      setValidationError("Vui lòng nhập tên điểm xuất phát.");
      return;
    }

    const lat = Number.parseFloat(latText);
    const lng = Number.parseFloat(lngText);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      setValidationError("Vui lòng chọn ghim trên bản đồ hoặc nhập đủ tọa độ hợp lệ.");
      return;
    }

    setValidating(true);
    setValidationError(null);

    const candidate: OriginSelection = {
      label: cleanLabel,
      latitude: lat,
      longitude: lng,
      source: origin?.source ?? "MANUAL",
      confirmed: true,
    };

    const revision = selectionRevision.current;
    const outcome = await validateOriginOnServer(candidate);
    setValidating(false);
    if (revision !== selectionRevision.current) return;

    if (outcome.kind === "VALID") {
      onChange(candidate);
      setLiveAnnouncement(`Điểm xuất phát ${cleanLabel} đã được xác nhận thuộc lãnh thổ Việt Nam.`);
    } else if (outcome.kind === "OUTSIDE_VIETNAM" || outcome.kind === "COVERAGE_UNKNOWN") {
      setValidationError(outcome.message);
      onChange({ ...candidate, confirmed: false });
      setLiveAnnouncement(`Lỗi xác nhận: ${outcome.message}`);
    } else {
      setValidationError(outcome.message || "Không thể xác nhận điểm xuất phát.");
      onChange({ ...candidate, confirmed: false });
    }
  }

  const isConfirmed = Boolean(origin?.confirmed);
  const mapFailed = mapState === "error" || mapState === "timeout";

  return (
    <section className="trip-origin-picker" aria-labelledby={`${id}-origin-heading`}>
      <div className="trip-origin-header">
        <h3 id={`${id}-origin-heading`} className="trip-origin-title">
          Điểm xuất phát (Hà Giang / Toàn quốc)
        </h3>
        <p className="trip-origin-description">
          Chọn vị trí xuất phát cho hành trình bằng cách nhấp bản đồ hoặc nhập tọa độ. Vị trí cần được
          xác nhận trong lãnh thổ Việt Nam.
        </p>
      </div>

      <div className="trip-origin-label-field">
        <label htmlFor={`${id}-label-input`}>Tên địa điểm xuất phát</label>
        <Input
          id={`${id}-label-input`}
          type="text"
          placeholder="Ví dụ: Bến xe Mỹ Đình, TP. Hà Giang, Nhà riêng..."
          value={label}
          disabled={disabled || validating}
          onChange={(e) => handleLabelChange(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void search(label); } }}
          maxLength={300}
        />
        <Button className="trip-origin-search-btn" type="button" disabled={disabled || validating || searching || label.trim().length < 2} onClick={() => void search(label)}>{searching ? "Đang tìm…" : "Tìm địa điểm"}</Button>
        <p className="trip-origin-description">Chỉ tìm tên địa điểm công khai; không nhập thông tin cá nhân hoặc ghi chú riêng tư.</p>
        {searchResult && <div role="status" aria-live="polite">
          {searchResult.status === "RESULTS" ? <ul className="trip-origin-search-results">{searchResult.results.map((result, index) => <li key={`${result.latitude}-${result.longitude}-${index}`}><button className="trip-origin-search-item" type="button" disabled={disabled} onClick={() => { invalidateRequests(); onChange(result); }}>{result.label}</button></li>)}</ul>
            : searchResult.status === "NO_RESULTS" ? "Không tìm thấy địa điểm. Bạn có thể chọn ghim thủ công." : searchResult.message}
        </div>}
        <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors · ODbL</a>
      </div>

      <div className="trip-origin-map-wrapper">
        <div
          ref={mapContainerRef}
          className="trip-origin-canvas"
          aria-label="Bản đồ chọn điểm xuất phát"
          style={{ visibility: mapState === "ready" ? "visible" : "hidden" }}
        />
        {mapState !== "ready" && (
          <div
            className="trip-origin-map-overlay"
            role={mapFailed ? "alert" : "status"}
            aria-busy={mapState === "loading"}
          >
            <p>
              {mapState === "loading"
                ? "Đang tải bản đồ..."
                : mapState === "timeout"
                  ? "Bản đồ tải quá lâu"
                  : "Bản đồ hiện không khả dụng"}
            </p>
            {mapFailed && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setMapState("loading");
                  setMapAttempt((v) => v + 1);
                }}
              >
                <RefreshCw className="mr-1 h-3.5 w-3.5" /> Thử lại bản đồ
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="trip-origin-coords-grid">
        <div className="trip-origin-field">
          <label htmlFor={`${id}-lat-input`}>Vĩ độ (Latitude, -90 đến 90)</label>
          <Input
            id={`${id}-lat-input`}
            type="text"
            inputMode="decimal"
            placeholder="21.028511"
            value={latText}
            disabled={disabled || validating}
            onChange={(e) => {
              invalidateRequests();
              if (origin) onChange({ ...origin, source: "MANUAL", confirmed: false });
              setLatText(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyManualCoordinates();
              }
            }}
          />
        </div>

        <div className="trip-origin-field">
          <label htmlFor={`${id}-lng-input`}>Kinh độ (Longitude, -180 đến 180)</label>
          <Input
            id={`${id}-lng-input`}
            type="text"
            inputMode="decimal"
            placeholder="105.804817"
            value={lngText}
            disabled={disabled || validating}
            onChange={(e) => {
              invalidateRequests();
              if (origin) onChange({ ...origin, source: "MANUAL", confirmed: false });
              setLngText(e.target.value);
              setValidationError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyManualCoordinates();
              }
            }}
          />
        </div>
      </div>

      {validationError && (
        <div className="trip-origin-alert" role="alert">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{validationError}</span>
        </div>
      )}

      <div className="trip-origin-status-bar">
        <div>
          {isConfirmed ? (
            <span className="trip-origin-badge trip-origin-badge-confirmed">
              <CheckCircle2 className="h-3.5 w-3.5" /> Đã xác nhận trên bản đồ
            </span>
          ) : origin ? (
            <span className="trip-origin-badge trip-origin-badge-unconfirmed">
              <Clock className="h-3.5 w-3.5" /> Chưa xác nhận vị trí
            </span>
          ) : (
            <span className="trip-origin-badge trip-origin-badge-empty">
              <MapPin className="h-3.5 w-3.5" /> Chưa chọn vị trí
            </span>
          )}
        </div>

        <button
          type="button"
          className="trip-origin-confirm-btn"
          disabled={disabled || validating || !latText || !lngText || !label.trim()}
          onClick={handleConfirmOrigin}
        >
          {validating ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" /> Đang kiểm tra...
            </>
          ) : (
            "Xác nhận điểm xuất phát"
          )}
        </button>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {liveAnnouncement}
      </p>
    </section>
  );
}

