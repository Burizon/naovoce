import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import MarkerClusterGroup from "react-leaflet-cluster";
import type { Bbox, FruitMarker, Kind } from "../api.ts";
import { kindColor } from "../seasons.ts";

// The whole Czech Republic.
const CZECHIA: L.LatLngBoundsExpression = [
  [48.55, 12.09],
  [51.06, 18.86],
];

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

/** Round kind-coloured marker like the category icons of map.na-ovoce.cz. */
function markerIcon(color: string, selected: boolean, ripe: boolean): L.DivIcon {
  const size = selected ? 26 : 18;
  const classes = ["fruit-marker", selected ? "selected" : "", ripe ? "ripe" : ""].join(" ");
  return L.divIcon({
    className: "",
    html: `<span class="${classes}" style="background:${color};width:${size}px;height:${size}px"></span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

/** Numbered cluster bubble, green for a few places up to orange for many. */
function clusterIcon(cluster: L.MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const tone = count < 10 ? "few" : count < 50 ? "some" : count < 200 ? "many" : "lots";
  const size = count < 10 ? 34 : count < 50 ? 40 : count < 200 ? 46 : 52;
  return L.divIcon({
    className: "",
    html: `<span class="fruit-cluster ${tone}" style="width:${size}px;height:${size}px">${count}</span>`,
    iconSize: [size, size],
  });
}

export function MapView({ markers, kinds, highlightRipe, selected, onSelect, onBounds }: Props) {
  const icons = useMemo(() => new Map<string, L.DivIcon>(), []);
  const iconFor = (kindKey: string, isSelected: boolean) => {
    const kind = kinds.get(kindKey);
    const color = kind ? kindColor(kind.col) : "#82B241";
    const id = `${color}:${isSelected}:${highlightRipe}`;
    let icon = icons.get(id);
    if (!icon) {
      icon = markerIcon(color, isSelected, highlightRipe);
      icons.set(id, icon);
    }
    return icon;
  };

  return (
    <MapContainer bounds={CZECHIA} className="map" aria-label="Mapa jedlých rostlin" zoomControl={false}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <ZoomControl />
      <BoundsReporter onBounds={onBounds} />
      <MarkerClusterGroup
        chunkedLoading
        maxClusterRadius={55}
        showCoverageOnHover={false}
        spiderfyOnMaxZoom
        iconCreateFunction={clusterIcon}
      >
        {markers.map((marker) => (
          <Marker
            key={marker.id}
            position={[Number(marker.lat), Number(marker.lng)]}
            icon={iconFor(marker.kind, marker.id === selected)}
            eventHandlers={{ click: () => onSelect(marker.id) }}
          >
            <Tooltip direction="top" offset={[0, -8]}>
              {kinds.get(marker.kind)?.name ?? marker.kind}
            </Tooltip>
          </Marker>
        ))}
      </MarkerClusterGroup>
    </MapContainer>
  );
}

function ZoomControl() {
  const map = useMap();
  useEffect(() => {
    const control = L.control.zoom({ position: "bottomright" });
    control.addTo(map);
    return () => {
      control.remove();
    };
  }, [map]);
  return null;
}
