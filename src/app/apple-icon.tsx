import { ImageResponse } from "next/og";

// iOS home-screen icon. Apple shrinks 180×180 to ~60×60 on display, so the
// design has to read at small sizes — bold geometry, no fine detail. Apple
// auto-rounds the corners on every iOS version since 7, so we deliver a
// full-bleed square; the apparent "rounded square" comes from iOS, not us.

export const runtime = "edge";
export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <svg width="120" height="120" viewBox="0 0 100 100">
          {/* Ascending chart line — bottom-left → top-right with a slight
              accelerating curve, evokes momentum / outperformance. */}
          <polyline
            points="14,82 35,62 55,52 78,28"
            stroke="white"
            strokeWidth="7"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {/* Three data dots along the line */}
          <circle cx="14" cy="82" r="5" fill="white" />
          <circle cx="35" cy="62" r="5" fill="white" />
          <circle cx="55" cy="52" r="5" fill="white" />
          {/* Top-right "AI sparkle" — 4-point star where the last dot would be */}
          <g transform="translate(78,28)">
            <path
              d="M0,-13 L3,-3 L13,0 L3,3 L0,13 L-3,3 L-13,0 L-3,-3 Z"
              fill="white"
            />
          </g>
        </svg>
      </div>
    ),
    { ...size },
  );
}
