/**
 * Google Encoded Polyline decoder + helpers for rendering a route in SVG.
 * Strava stores routes using Google's polyline algorithm (precision 5).
 */

export type LatLng = [number, number]; // [lat, lng]

/**
 * Decode a Google-encoded polyline string into an array of [lat, lng] points.
 */
export function decodePolyline(encoded: string, precision = 5): LatLng[] {
  if (!encoded) return [];
  const factor = Math.pow(10, precision);
  const points: LatLng[] = [];
  let index = 0, lat = 0, lng = 0;

  while (index < encoded.length) {
    let result = 1, shift = 0, b: number;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 1; shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63 - 1;
      result += b << shift;
      shift += 5;
    } while (b >= 0x1f);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push([lat / factor, lng / factor]);
  }

  return points;
}

export interface ProjectedPath {
  points: Array<{ x: number; y: number }>; // normalized to the viewbox
  width: number;
  height: number;
  pathD: string;        // SVG path "d" attribute
  lengths: number[];    // cumulative path length at each point (0..1)
}

/**
 * Project lat/lng points into an SVG viewbox of the given size, preserving
 * aspect ratio (equirectangular with latitude correction) and adding padding.
 */
export function projectToSvg(points: LatLng[], size = 300, padding = 12): ProjectedPath | null {
  if (points.length < 2) return null;

  const lats = points.map(p => p[0]);
  const lngs = points.map(p => p[1]);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);

  // Correct longitude span for latitude (Mercator-ish, good enough for a single run)
  const midLat = (minLat + maxLat) / 2;
  const latRange = Math.max(maxLat - minLat, 1e-6);
  const lngRange = Math.max((maxLng - minLng) * Math.cos((midLat * Math.PI) / 180), 1e-6);

  const inner = size - padding * 2;
  const scale = inner / Math.max(latRange, lngRange);

  const w = lngRange * scale;
  const h = latRange * scale;
  const offsetX = padding + (inner - w) / 2;
  const offsetY = padding + (inner - h) / 2;

  const proj = points.map(([lat, lng]) => ({
    // SVG y grows downward → invert latitude
    x: offsetX + (lng - minLng) * Math.cos((midLat * Math.PI) / 180) * scale,
    y: offsetY + (maxLat - lat) * scale,
  }));

  // Cumulative normalized lengths (for marker positioning along the path)
  const segLen: number[] = [0];
  let total = 0;
  for (let i = 1; i < proj.length; i++) {
    total += Math.hypot(proj[i].x - proj[i - 1].x, proj[i].y - proj[i - 1].y);
    segLen.push(total);
  }
  const lengths = segLen.map(l => (total > 0 ? l / total : 0));

  const pathD = proj
    .map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(" ");

  return { points: proj, width: size, height: size, pathD, lengths };
}
