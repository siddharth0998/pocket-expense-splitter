import { ImageResponse } from "next/og";

export const alt = "Splitvero expense splitter";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          background: "#f8fafc",
          color: "#111827",
          padding: "72px",
          fontFamily: "Arial, Helvetica, sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "24px" }}>
          <div
            style={{
              width: "84px",
              height: "84px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "24px",
              background: "#2563eb",
              color: "white",
              fontSize: "42px",
              fontWeight: 800,
            }}
          >
            S
          </div>
          <div style={{ fontSize: "42px", fontWeight: 800 }}>Splitvero</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>
          <div
            style={{
              maxWidth: "920px",
              fontSize: "78px",
              lineHeight: 0.98,
              fontWeight: 900,
              letterSpacing: 0,
            }}
          >
            Split expenses with fewer settle-up payments.
          </div>
          <div
            style={{
              maxWidth: "840px",
              color: "#475569",
              fontSize: "34px",
              lineHeight: 1.25,
              fontWeight: 500,
            }}
          >
            Track shared bills, receipts, recurring expenses, and exact splits
            for friends, roommates, and trips.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "18px",
            color: "#0f172a",
            fontSize: "28px",
            fontWeight: 700,
          }}
        >
          <span>Free</span>
          <span style={{ color: "#94a3b8" }}>|</span>
          <span>No spreadsheets</span>
          <span style={{ color: "#94a3b8" }}>|</span>
          <span>CSV export</span>
        </div>
      </div>
    ),
    size,
  );
}
