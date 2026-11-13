// Safelight Border Extension v1.1.0 — DISCONTINUED
// Superseded by OPGERUIMD97/safelight-mat-frame (Framing / Border module → Border mode).
// This release only shows a notice: deactivate and uninstall.
// No export processor, no Develop overlay. Templates stay in localStorage
// under safelight-border-* so Framing / Border can import them.

export function activate(api) {
  console.log(
    "%c[safelight-border] discontinued — v1.1.0 — use safelight-mat-frame (Border mode)",
    "color:#C15F3C;font-weight:bold"
  );
  const { react: React } = api;
  const ce = (type, props, ...ch) => React.createElement(type, props, ...ch);

  function DeprecatedPanel() {
    return ce(
      "div",
      {
        style: {
          padding: 12,
          display: "flex",
          flexDirection: "column",
          gap: 10,
          fontSize: 12,
          lineHeight: 1.45,
          color: "var(--color-text)",
        },
      },
      ce(
        "div",
        {
          style: {
            padding: "10px 12px",
            borderRadius: 6,
            background: "color-mix(in srgb, #C15F3C 18%, transparent)",
            border: "1px solid color-mix(in srgb, #C15F3C 45%, transparent)",
          },
        },
        ce(
          "div",
          { style: { fontWeight: 700, marginBottom: 6, fontSize: 13 } },
          "Border is discontinued"
        ),
        ce(
          "div",
          null,
          "Solid borders now live in the Framing / Border module (Border mode)."
        )
      ),
      ce(
        "div",
        { style: { fontWeight: 600 } },
        "Please deactivate and uninstall Border in View → Extensions."
      ),
      ce(
        "div",
        { style: { color: "var(--color-text-muted)" } },
        "Install the replacement: OPGERUIMD97/safelight-mat-frame"
      ),
      ce(
        "div",
        { style: { color: "var(--color-text-muted)", fontSize: 11 } },
        "Your saved templates remain in browser storage (safelight-border-*) — use Import Border in the new module."
      )
    );
  }

  api.registerPanel({
    id: "safelight-border.panel",
    title: "Border",
    component: DeprecatedPanel,
    defaultLocation: "right",
  });
}

export function deactivate() {}
