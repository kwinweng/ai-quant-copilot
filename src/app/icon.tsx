import { ImageResponse } from "next/og";

// Browser tab favicon. At 32×32 the chart line + dots blur into one shape,
// so we strip down to: solid blue square (rounded) + a single bold sparkle.
// The full mark only really works on the iOS home screen (180×180); for
// the tab we lean into a pure brand color recognition.

export const runtime = "edge";
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          background: "#2563eb",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 6,
        }}
      >
        <svg width="22" height="22" viewBox="0 0 100 100">
          {/* Bold ascending diagonal — same gesture as the home-screen icon
              but simplified to a single thick line for tab legibility. */}
          <polyline
            points="18,80 50,55 82,25"
            stroke="white"
            strokeWidth="14"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="82" cy="25" r="11" fill="white" />
        </svg>
      </div>
    ),
    { ...size },
  );
}
