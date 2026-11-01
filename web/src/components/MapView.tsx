import { useEffect } from "react";
import { CircleMarker, MapContainer, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import type { Bbox, FruitMarker, Kind } from "../api.ts";
import { kindColor } from "../seasons.ts";

const PRAGUE: [number, number] = [50.087, 14.421];

interface Props {
  markers: FruitMarker[];
  kinds: Map<string, Kind>;
  highlightRipe: boolean;
  selected: number | null;
  onSelect: (id: number) => void;
  onBounds: (bbox: Bbox) => void;
}

function BoundsReporter({ onBounds }: { onBounds: (bbox: Bbox) => void }) {
  const map = useMap();
  const report = () => {
    const bounds = map.getBounds();
    onBounds([bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()]);
  };
  useMapEvents({ moveend: report });
  // The initial view is reported once; later ones come from `moveend`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(report, []);
  return null;
}

export function MapView({ markers, kinds, highlightRipe, selected, onSelect, onBounds }: Props) {
  return (
    <MapContainer center={PRAGUE} zoom={13} preferCanvas className="map" aria-label="Mapa jedlých rostlin">
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BoundsReporter onBounds={onBounds} />
      {markers.map((marker) => {
        const kind = kinds.get(marker.kind);
        const color = kind ? kindColor(kind.col) : "#82B241";
        const isSelected = marker.id === selected;
        return (
          <CircleMarker
            key={marker.id}
            center={[Number(marker.lat), Number(marker.lng)]}
            radius={isSelected ? 10 : 7}
            pathOptions={{
              color: highlightRipe ? "#E2BE22" : isSelected ? "#694923" : "#ffffff",
              weight: highlightRipe || isSelected ? 3 : 1.5,
              fillColor: color,
              fillOpacity: 0.9,
            }}
            eventHandlers={{ click: () => onSelect(marker.id) }}
          >
            <Tooltip direction="top" offset={[0, -6]}>
              {kind?.name ?? marker.kind}
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
