/**
 * First-party Short create/review page shell.
 * This page is intentionally static and credential-free; clients supply their
 * API key only in browser memory when calling protected /v1 endpoints.
 */

export function buildShortPipelineCreatePage(): string {
  return String.raw`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>CineJelly Studio</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #030407;
      --ink: #f8fbff;
      --muted: #a4a9b7;
      --subtle: #737887;
      --panel: rgba(12, 14, 22, 0.92);
      --panel-strong: rgba(17, 19, 29, 0.96);
      --panel-soft: rgba(255, 255, 255, 0.045);
      --line: rgba(255, 255, 255, 0.12);
      --line-strong: rgba(255, 255, 255, 0.2);
      --pink: #ff4fe8;
      --blue: #11b7ff;
      --violet: #8f5cff;
      --green: #36f2aa;
      --amber: #f4b84d;
      --red: #ff5b72;
      --shadow: 0 24px 90px rgba(0, 0, 0, 0.55);
    }
    * { box-sizing: border-box; }
    html { min-height: 100%; background: var(--bg); }
    body {
      margin: 0;
      min-height: 100vh;
      background:
        radial-gradient(circle at 20% 0%, rgba(255, 79, 232, 0.14), transparent 30%),
        radial-gradient(circle at 82% 12%, rgba(17, 183, 255, 0.12), transparent 34%),
        linear-gradient(180deg, #05060a 0%, #020306 100%);
      color: var(--ink);
      font: 14px/1.45 Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      letter-spacing: 0;
      overflow-x: hidden;
    }
    button,
    input,
    select,
    textarea {
      font: inherit;
      letter-spacing: 0;
    }
    button {
      border: 0;
      cursor: pointer;
    }
    button:disabled {
      cursor: wait;
      opacity: 0.7;
    }
    .app {
      min-height: 100vh;
      display: grid;
      grid-template-columns: 214px minmax(0, 1fr);
      background:
        linear-gradient(90deg, rgba(255, 255, 255, 0.055), transparent 1px) 0 0 / 72px 72px,
        linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 1px) 0 0 / 72px 72px;
    }
    .sidebar {
      min-height: 100vh;
      padding: 24px 16px;
      border-right: 1px solid var(--line);
      background: linear-gradient(180deg, rgba(6, 7, 12, 0.96), rgba(4, 5, 9, 0.98));
      position: sticky;
      top: 0;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 8px 22px;
      border-bottom: 1px solid var(--line);
    }
    .brand-mark {
      width: 38px;
      aspect-ratio: 1;
      border-radius: 8px;
      display: grid;
      place-items: center;
      color: #fff;
      font-weight: 900;
      background: linear-gradient(135deg, var(--pink), var(--blue));
      box-shadow: 0 0 22px rgba(255, 79, 232, 0.34);
    }
    .brand-name {
      font-size: 20px;
      font-weight: 790;
      line-height: 1;
    }
    .brand-sub {
      margin-top: 3px;
      color: var(--pink);
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    .nav-section {
      margin: 26px 0 10px;
      padding: 0 8px;
      color: var(--subtle);
      font-size: 11px;
      font-weight: 760;
      text-transform: uppercase;
    }
    .nav-item {
      width: 100%;
      min-height: 46px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 0 12px;
      border-radius: 8px;
      color: #d9deec;
      background: transparent;
      text-align: left;
      margin: 2px 0;
    }
    .nav-item.active {
      color: #fff;
      background:
        linear-gradient(90deg, rgba(255, 79, 232, 0.28), rgba(143, 92, 255, 0.12) 58%, transparent);
      box-shadow: inset 2px 0 0 var(--pink);
    }
    .nav-ico {
      width: 24px;
      color: #fff;
      font-size: 18px;
      text-align: center;
    }
    .sidebar-card {
      position: absolute;
      left: 16px;
      right: 16px;
      bottom: 86px;
      padding: 13px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
    }
    .sidebar-card strong {
      display: block;
      font-size: 13px;
      margin-bottom: 8px;
    }
    .meter {
      height: 5px;
      border-radius: 999px;
      background: rgba(255, 255, 255, 0.12);
      overflow: hidden;
      margin: 8px 0;
    }
    .meter span {
      display: block;
      height: 100%;
      width: 68%;
      background: linear-gradient(90deg, var(--pink), var(--blue));
    }
    .sidebar-bottom {
      position: absolute;
      left: 18px;
      right: 18px;
      bottom: 24px;
      display: flex;
      justify-content: space-between;
      color: var(--muted);
    }
    .main-shell {
      min-width: 0;
      padding: 0 24px 28px;
    }
    .topbar {
      height: 76px;
      display: flex;
      align-items: center;
      justify-content: flex-end;
      gap: 16px;
      border-bottom: 1px solid var(--line);
    }
    .top-chip {
      min-height: 50px;
      min-width: 150px;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 13px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }
    .top-chip small {
      display: block;
      color: var(--muted);
      line-height: 1;
    }
    .top-chip strong {
      display: block;
      margin-top: 4px;
      line-height: 1;
    }
    .api-key {
      width: 246px;
      height: 42px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 12px;
      background: rgba(255, 255, 255, 0.055);
      color: var(--ink);
      outline: none;
    }
    .api-key:focus {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(17, 183, 255, 0.16);
    }
    .ghost-btn,
    .secondary,
    .mini-btn {
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 13px;
      color: var(--ink);
      background: rgba(255, 255, 255, 0.045);
    }
    .field-row {
      display: flex;
      gap: 6px;
      align-items: stretch;
    }
    .field-row input {
      flex: 1 1 auto;
      min-width: 0;
    }
    .upload-btn {
      flex: 0 0 auto;
      min-height: 38px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 0 10px;
      color: var(--ink);
      background: rgba(54, 242, 170, 0.08);
      font-size: 12px;
      white-space: nowrap;
      cursor: pointer;
    }
    .upload-btn:hover {
      border-color: rgba(54, 242, 170, 0.6);
      background: rgba(54, 242, 170, 0.16);
    }
    .upload-btn[data-busy="true"] {
      opacity: 0.55;
      pointer-events: none;
    }
    .ghost-btn:hover,
    .secondary:hover,
    .mini-btn:hover {
      border-color: var(--line-strong);
      background: rgba(255, 255, 255, 0.07);
    }
    .hero {
      padding: 28px 0 18px;
      display: flex;
      align-items: flex-end;
      justify-content: space-between;
      gap: 24px;
    }
    .eyebrow {
      color: var(--muted);
      margin-top: 7px;
      max-width: 720px;
    }
    h1 {
      margin: 0;
      font-size: clamp(40px, 5vw, 66px);
      line-height: 0.94;
      font-weight: 900;
      text-transform: uppercase;
      color: transparent;
      -webkit-text-stroke: 1.1px rgba(255, 255, 255, 0.86);
      text-shadow:
        0 0 18px rgba(255, 79, 232, 0.42),
        0 0 28px rgba(17, 183, 255, 0.3);
    }
    .session-line {
      max-width: 460px;
      color: var(--muted);
      text-align: right;
      overflow-wrap: anywhere;
    }
    .workspace {
      display: grid;
      grid-template-columns: minmax(560px, 1.04fr) minmax(460px, 0.96fr);
      gap: 24px;
      align-items: start;
    }
    .panel {
      border: 1px solid var(--line);
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(18, 20, 31, 0.92), rgba(8, 10, 16, 0.92));
      box-shadow: var(--shadow), inset 0 1px 0 rgba(255, 255, 255, 0.04);
    }
    .composer {
      padding: 18px;
    }
    .panel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 14px;
      margin-bottom: 14px;
    }
    .panel-title {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 14px;
      font-weight: 820;
      text-transform: uppercase;
    }
    .step-badge {
      width: 22px;
      height: 22px;
      border-radius: 6px;
      display: grid;
      place-items: center;
      font-size: 12px;
      font-weight: 900;
      color: #fff;
      background: linear-gradient(135deg, var(--pink), var(--violet));
      box-shadow: 0 0 18px rgba(255, 79, 232, 0.35);
    }
    .mode-tabs,
    .template-tabs {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-wrap: wrap;
    }
    .mode-btn,
    .template-tab {
      min-height: 36px;
      padding: 0 13px;
      border: 1px solid var(--line);
      border-radius: 8px;
      color: #d8deed;
      background: rgba(255, 255, 255, 0.035);
    }
    .mode-btn.active,
    .template-tab.active {
      color: #fff;
      border-color: rgba(255, 79, 232, 0.82);
      background: linear-gradient(135deg, rgba(255, 79, 232, 0.22), rgba(17, 183, 255, 0.12));
      box-shadow: 0 0 0 1px rgba(255, 79, 232, 0.22), 0 0 24px rgba(255, 79, 232, 0.16);
    }
    .field {
      display: grid;
      gap: 8px;
      color: var(--muted);
      font-size: 12px;
      min-width: 0;
    }
    .field span {
      color: #dce3f3;
      font-weight: 760;
    }
    input,
    select,
    textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.04);
      color: var(--ink);
      outline: none;
      min-width: 0;
    }
    input,
    select {
      height: 40px;
      padding: 0 12px;
    }
    textarea {
      min-height: 142px;
      padding: 13px;
      resize: vertical;
      overflow-x: hidden;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
    }
    select option {
      background: #0c0e16;
      color: #fff;
    }
    input:focus,
    select:focus,
    textarea:focus {
      border-color: var(--blue);
      box-shadow:
        0 0 0 1px rgba(17, 183, 255, 0.26),
        0 0 28px rgba(17, 183, 255, 0.18);
    }
    .prompt-box {
      border-color: rgba(255, 79, 232, 0.62);
      box-shadow:
        inset 0 0 0 1px rgba(17, 183, 255, 0.42),
        0 0 30px rgba(255, 79, 232, 0.12);
    }
    .composer-tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin: 10px 0 18px;
    }
    .tool-row {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    .char-count {
      color: var(--muted);
      font-size: 12px;
    }
    .section-divider {
      height: 1px;
      background: var(--line);
      margin: 16px 0;
    }
    .asset-grid {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 10px;
      margin-top: 10px;
    }
    .asset-card {
      min-height: 112px;
      position: relative;
      overflow: hidden;
      border: 1px solid var(--line);
      border-radius: 8px;
      background:
        linear-gradient(180deg, transparent, rgba(0, 0, 0, 0.72)),
        var(--asset-img, linear-gradient(135deg, rgba(255,79,232,.18), rgba(17,183,255,.18)));
      background-size: cover;
      background-position: center;
      display: flex;
      align-items: flex-end;
      padding: 10px;
    }
    .asset-card {
      border: 1px solid var(--line);
      color: #fff;
      text-align: left;
      cursor: pointer;
    }
    .asset-card::after {
      content: "";
      position: absolute;
      inset: 0;
      border-radius: 8px;
      background: linear-gradient(180deg, rgba(255, 255, 255, 0.06), transparent 38%);
      pointer-events: none;
    }
    .asset-card strong {
      display: block;
      font-size: 12px;
      line-height: 1.2;
    }
    .asset-card small {
      color: #c7ccda;
      font-size: 11px;
    }
    .asset-card:hover,
    .asset-card:focus-visible {
      border-color: rgba(17, 183, 255, 0.7);
      box-shadow: 0 0 24px rgba(17, 183, 255, 0.14);
      outline: none;
    }
    .grid-2 {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px;
    }
    .grid-3 {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }
    .settings-bar {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      margin-top: 12px;
    }
    .storyboard {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
    }
    .beat-card {
      min-height: 168px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      background: rgba(255, 255, 255, 0.045);
    }
    .beat-img {
      min-height: 92px;
      background:
        linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.68)),
        var(--beat-img);
      background-size: cover;
      background-position: center;
    }
    .beat-body {
      padding: 10px;
    }
    .beat-title {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      color: #fff;
      font-weight: 820;
      font-size: 12px;
    }
    .beat-note {
      margin-top: 5px;
      color: var(--muted);
      font-size: 12px;
    }
    .render-bar {
      display: grid;
      grid-template-columns: 1fr 1.5fr auto;
      gap: 14px;
      align-items: center;
      padding: 14px;
      border-top: 1px solid var(--line);
      background: rgba(255, 255, 255, 0.025);
    }
    .cost-card {
      padding: 10px 12px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
    }
    .cost-card small {
      display: block;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .cost-card strong {
      color: var(--green);
      font-size: 22px;
    }
    .primary {
      min-height: 58px;
      min-width: 190px;
      padding: 0 28px;
      border-radius: 8px;
      color: #fff;
      font-weight: 840;
      background: linear-gradient(100deg, rgba(255, 79, 232, 0.94), rgba(17, 183, 255, 0.94));
      box-shadow: 0 0 34px rgba(255, 79, 232, 0.28), 0 0 30px rgba(17, 183, 255, 0.16);
    }
    .right-stack {
      display: grid;
      gap: 14px;
    }
    .tabs-shell {
      display: flex;
      justify-content: space-between;
      gap: 12px;
      padding: 10px;
      border: 1px solid var(--line);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.045);
    }
    .gallery {
      padding: 14px;
    }
    .gallery-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      margin-bottom: 14px;
    }
    .template-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 14px;
    }
    .template-card {
      min-height: 318px;
      border: 1px solid var(--line);
      border-radius: 8px;
      overflow: hidden;
      padding: 0;
      background: #090b12;
      color: #fff;
      text-align: left;
      box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05);
    }
    .template-card:hover {
      border-color: rgba(17, 183, 255, 0.66);
      box-shadow: 0 0 26px rgba(17, 183, 255, 0.14);
    }
    .template-card.active {
      border-color: rgba(255, 79, 232, 0.86);
      box-shadow: 0 0 30px rgba(255, 79, 232, 0.22);
    }
    .template-img {
      height: 220px;
      position: relative;
      background:
        linear-gradient(180deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.78)),
        var(--template-img);
      background-size: cover;
      background-position: center;
    }
    .tag {
      display: inline-flex;
      min-height: 22px;
      align-items: center;
      padding: 2px 8px;
      border: 1px solid rgba(255, 255, 255, 0.16);
      border-radius: 6px;
      font-size: 11px;
      font-weight: 820;
      background: rgba(0, 0, 0, 0.42);
      color: #fff;
    }
    .template-tags {
      position: absolute;
      top: 10px;
      left: 10px;
      right: 10px;
      display: flex;
      justify-content: space-between;
      gap: 8px;
    }
    .template-body {
      padding: 11px 12px 13px;
    }
    .template-name {
      font-weight: 820;
      margin-bottom: 6px;
    }
    .template-meta {
      color: var(--muted);
      font-size: 12px;
    }
    .tips {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 10px;
      padding: 12px;
    }
    .tip {
      min-height: 82px;
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 12px;
      background: rgba(255, 255, 255, 0.035);
    }
    .tip strong {
      display: block;
      margin-bottom: 5px;
      font-size: 12px;
    }
    .tip span {
      color: var(--muted);
      font-size: 12px;
    }
    .contract-grid {
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 14px;
      margin-top: 24px;
    }
    .contract-panel {
      padding: 14px;
    }
    .list {
      display: grid;
      gap: 8px;
    }
    .item {
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.035);
    }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 12px;
    }
    .title {
      color: #fff;
      font-weight: 790;
      overflow-wrap: anywhere;
    }
    .detail {
      color: var(--muted);
      font-size: 12px;
      margin-top: 5px;
      overflow-wrap: anywhere;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      min-height: 23px;
      border-radius: 6px;
      padding: 2px 8px;
      font-size: 11px;
      font-weight: 800;
      white-space: nowrap;
      color: #fff;
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .ready { color: #001e14; background: var(--green); border-color: var(--green); }
    .warn { color: #2b1700; background: var(--amber); border-color: var(--amber); }
    .bad { color: #fff; background: var(--red); border-color: var(--red); }
    .info { color: #001a2a; background: var(--blue); border-color: var(--blue); }
    .teal { color: #061719; background: #64f5e6; border-color: #64f5e6; }
    .empty {
      color: var(--muted);
      border: 1px dashed var(--line);
      border-radius: 8px;
      padding: 14px;
      background: rgba(255, 255, 255, 0.025);
    }
    .error,
    .success {
      display: none;
      margin-bottom: 14px;
      padding: 11px 13px;
      border-radius: 8px;
      border: 1px solid var(--line);
    }
    .error {
      color: #ffd7df;
      border-color: rgba(255, 91, 114, 0.45);
      background: rgba(255, 91, 114, 0.12);
    }
    .success {
      color: #cbffe9;
      border-color: rgba(54, 242, 170, 0.42);
      background: rgba(54, 242, 170, 0.1);
    }
    .session-button {
      width: 100%;
      height: auto;
      min-height: 62px;
      padding: 10px;
      background: rgba(255, 255, 255, 0.035);
      color: var(--ink);
      border: 1px solid var(--line);
      border-radius: 8px;
      text-align: left;
      white-space: normal;
    }
    .approval {
      padding: 14px;
      margin-top: 14px;
    }
    .approval textarea {
      min-height: 122px;
      font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
      font-size: 12px;
    }
    .visually-hidden {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }
    @media (max-width: 1220px) {
      .workspace,
      .contract-grid { grid-template-columns: 1fr; }
      .template-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .render-bar { grid-template-columns: 1fr; }
    }
    @media (max-width: 860px) {
      .app { grid-template-columns: 1fr; }
      .sidebar { display: none; }
      .main-shell {
        width: 100%;
        max-width: 100vw;
        min-width: 0;
        padding: 0 14px 22px;
        overflow-x: hidden;
      }
      .topbar {
        height: auto;
        padding: 14px 0;
        flex-wrap: wrap;
        justify-content: flex-start;
      }
      .topbar > * {
        min-width: 0;
      }
      .top-chip {
        flex: 1 1 100%;
        width: 100%;
      }
      .top-chip > div {
        min-width: 0;
      }
      .top-chip small,
      .top-chip strong {
        white-space: normal;
        line-height: 1.15;
      }
      .api-key {
        width: auto;
        flex: 1 1 100%;
      }
      .hero { display: block; }
      .session-line { text-align: left; margin-top: 12px; }
      .panel-head,
      .gallery-head,
      .tabs-shell,
      .composer-tools {
        display: grid;
        grid-template-columns: 1fr;
        flex-wrap: wrap;
      }
      .panel-head .secondary,
      .tabs-shell > .ghost-btn {
        width: 100%;
        min-width: 0;
      }
      .primary {
        width: 100%;
        min-width: 0;
      }
      .asset-grid,
      .storyboard,
      .settings-bar,
      .template-grid,
      .tips,
      .grid-2,
      .grid-3 { grid-template-columns: 1fr; }
      h1 {
        font-size: clamp(30px, 9vw, 38px);
        overflow-wrap: anywhere;
      }
    }
    /* ===== Visual polish layer (original CSS/SVG art, no external assets) ===== */
    .hero { position: relative; }
    .hero::before,
    .hero::after {
      content: "";
      position: absolute;
      border-radius: 50%;
      filter: blur(46px);
      opacity: 0.5;
      pointer-events: none;
      z-index: -1;
      animation: heroFloat 9s ease-in-out infinite alternate;
    }
    .hero::before {
      width: 300px; height: 300px; left: -70px; top: -110px;
      background: radial-gradient(circle at 30% 30%, rgba(255, 79, 232, 0.5), transparent 70%);
    }
    .hero::after {
      width: 340px; height: 340px; right: -60px; top: -140px;
      background: radial-gradient(circle at 70% 30%, rgba(17, 183, 255, 0.42), transparent 70%);
      animation-delay: -4.5s;
    }
    @keyframes heroFloat {
      from { transform: translateY(0) scale(1); }
      to { transform: translateY(16px) scale(1.06); }
    }
    .panel { transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease; }
    .panel:hover {
      transform: translateY(-1px);
      border-color: rgba(17, 183, 255, 0.28);
    }
    .brand-mark {
      background: conic-gradient(from 210deg, #ff4fe8, #11b7ff, #36f2aa, #ff4fe8) !important;
      color: #05060a !important;
      box-shadow: 0 0 18px rgba(255, 79, 232, 0.35);
    }
    .template-img { overflow: hidden; }
    .template-img::after {
      content: "";
      position: absolute;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cg fill='none' stroke='rgba(255,255,255,0.07)' stroke-width='1'%3E%3Cpath d='M0 108 L140 76'/%3E%3Cpath d='M0 124 L140 92'/%3E%3C/g%3E%3Cg fill='rgba(255,255,255,0.10)'%3E%3Ccircle cx='18' cy='22' r='1.1'/%3E%3Ccircle cx='58' cy='12' r='0.9'/%3E%3Ccircle cx='96' cy='30' r='1.2'/%3E%3Ccircle cx='124' cy='16' r='0.8'/%3E%3Ccircle cx='36' cy='48' r='0.9'/%3E%3Ccircle cx='110' cy='58' r='1.0'/%3E%3C/g%3E%3C/svg%3E");
      background-size: 140px 140px;
      pointer-events: none;
    }
    .template-card { transition: transform 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease; }
    .template-card:hover { transform: translateY(-2px); }
    .empty {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 56px;
    }
    .empty::before {
      content: "";
      flex: 0 0 34px;
      height: 34px;
      opacity: 0.75;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 40 40' fill='none' stroke='%238b93a8' stroke-width='1.6'%3E%3Crect x='6' y='10' width='28' height='20' rx='3'/%3E%3Cpath d='M6 16h28M12 10v20M28 10v20'/%3E%3Ccircle cx='20' cy='23' r='2.6' fill='%238b93a8' stroke='none' opacity='0.7'/%3E%3C/svg%3E") center / contain no-repeat;
    }
    #job-video {
      border: 1px solid rgba(17, 183, 255, 0.35);
      box-shadow: 0 0 30px rgba(17, 183, 255, 0.12);
    }
    ::-webkit-scrollbar { width: 10px; height: 10px; }
    ::-webkit-scrollbar-thumb {
      background: linear-gradient(180deg, rgba(255, 79, 232, 0.35), rgba(17, 183, 255, 0.35));
      border-radius: 8px;
    }
    ::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.03); }
  </style>
</head>
<body>
  <div class="app"
    data-video-pipes-endpoint="/v1/short-pipeline/video-pipes"
    data-session-endpoint="/v1/short-pipeline/conversation-sessions"
    data-session-ui-endpoint="/v1/short-pipeline/conversation-sessions/{sessionId}/ui-contract"
    data-render-endpoint="/v1/short-pipeline/conversation-sessions/{sessionId}/render-jobs">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">CJ</div>
        <div>
          <div class="brand-name">CineJelly</div>
          <div class="brand-sub">Studio</div>
        </div>
      </div>
      <div class="nav-section">Creation</div>
      <button class="nav-item active" type="button" data-mode-button="short_video"><span class="nav-ico">◇</span><span>Short Studio</span></button>
      <button class="nav-item" type="button" data-mode-button="video_remake"><span class="nav-ico">↻</span><span>Video Remake</span></button>
      <button class="nav-item" type="button" data-mode-button="product_kol_ugc"><span class="nav-ico">□</span><span>UGC Ads</span></button>
      <button class="nav-item" type="button" data-mode-button="storyboard_multishot"><span class="nav-ico">▣</span><span>Product Scenes</span></button>
      <button class="nav-item" type="button" data-mode-button="production_bible"><span class="nav-ico">▤</span><span>Director Long</span></button>
      <div class="nav-section">Control</div>
      <button class="nav-item" type="button" disabled aria-disabled="true"><span class="nav-ico">≋</span><span>Voice Lab</span></button>
      <button class="nav-item" type="button" disabled aria-disabled="true"><span class="nav-ico">✧</span><span>Brand Kit</span></button>
      <button class="nav-item" type="button" id="nav-jobs"><span class="nav-ico">▥</span><span>Jobs</span></button>
      <div class="sidebar-card">
        <strong>Project Control</strong>
        <div class="detail">Status <span id="side-status">idle</span></div>
        <div class="meter"><span></span></div>
        <div class="detail">Scenes <span id="side-scenes">0</span> | Pending <span id="side-pending">0</span></div>
        <div class="detail">Provider <span id="side-provider">locked</span></div>
      </div>
      <div class="sidebar-bottom"><span>⚙</span><span>?</span><span>↗</span></div>
    </aside>
    <main class="main-shell">
      <form class="topbar" id="auth-form">
        <div class="top-chip">
          <div class="pill info">Credits</div>
          <div><small>Balance</small><strong id="balance-status">Connect key</strong></div>
        </div>
        <div class="top-chip">
          <div class="pill warn">Queue</div>
          <div><small>Render Queue</small><strong>Review gated</strong></div>
        </div>
        <input class="api-key" id="api-key" type="password" autocomplete="off" placeholder="Client API key" aria-label="Client API key">
        <button type="submit" id="load-sessions" class="ghost-btn">Sessions</button>
      </form>
      <section class="hero">
        <div>
          <h1>Create AI Video</h1>
          <span class="visually-hidden">Create Short</span>
          <span class="visually-hidden">Video Remake</span>
          <span class="visually-hidden">Creative Ideas</span>
          <div class="eyebrow">Describe the idea, add references, choose a production pattern, then let CineJelly build the script, storyboard, prompt, review packet, and render handoff.</div>
        </div>
        <div class="session-line" id="session-line">No session loaded.</div>
      </section>
      <div class="error" id="error"></div>
      <div class="success" id="success"></div>
      <section class="workspace">
        <form class="panel composer" id="brief-form">
          <div class="mode-tabs" aria-label="Create mode">
            <button class="mode-btn active" type="button" data-mode-button="short_video">Short</button>
            <button class="mode-btn" type="button" data-mode-button="video_remake">Remake</button>
            <button class="mode-btn" type="button" data-mode-button="product_kol_ugc">UGC</button>
            <button class="mode-btn" type="button" data-mode-button="production_bible">Long</button>
          </div>
          <input id="workflow-mode" class="visually-hidden" value="short_video">
          <div class="section-divider"></div>
          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">1</span>Tell CineJelly your idea</div>
            <button class="mini-btn" type="button" data-enhance-prompt>AI Enhance</button>
          </div>
          <label class="field">
            <span>Creative brief</span>
            <textarea class="prompt-box" id="prompt" wrap="soft" placeholder="Describe the actual video you want to create. Example: niche, product, KOL/person, source-video structure, duration, language, tone, proof, and final payoff."></textarea>
          </label>
          <div class="composer-tools">
            <div class="tool-row">
              <button class="mini-btn" type="button" data-template-apply="fashion_transform">Starter</button>
              <button class="mini-btn" type="button" data-enhance-prompt>Rewrite</button>
              <button class="mini-btn" type="button" data-template-apply="product_reveal">Product Starter</button>
            </div>
            <div class="char-count"><span id="prompt-count">0</span> / 2000</div>
          </div>

          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">2</span>Add references</div>
            <button class="mini-btn" type="button" id="clear-reference-fields">Clear</button>
          </div>
          <div class="asset-grid">
            <button class="asset-card" type="button" data-focus-reference="kol-reference" style="--asset-img:linear-gradient(135deg, rgba(255,79,232,.34), rgba(17,183,255,.18))">
              <div><strong>KOL / Talent</strong><small>image reference</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="product-reference" style="--asset-img:linear-gradient(135deg, rgba(54,242,170,.32), rgba(143,92,255,.2))">
              <div><strong>Product</strong><small>image reference</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="background-reference" style="--asset-img:linear-gradient(135deg, rgba(244,184,77,.28), rgba(17,183,255,.18))">
              <div><strong>Scene</strong><small>background</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="reference-url" style="--asset-img:linear-gradient(135deg, rgba(143,92,255,.34), rgba(255,91,114,.18))">
              <div><strong>Source Video</strong><small>pattern intake</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="media-reference-note" style="--asset-img:linear-gradient(135deg, rgba(255,79,232,.28), rgba(17,183,255,.18))">
              <div><strong>Voice / Notes</strong><small>audio intent</small></div>
            </button>
          </div>
          <input type="file" id="upload-file-input" style="display:none" aria-hidden="true">
          <div class="grid-2" style="margin-top:12px">
            <label class="field"><span>KOL image URI</span><div class="field-row"><input id="kol-reference" placeholder="asset://kol-main, https://... — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="kol-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁 Tải lên</button></div></label>
            <label class="field"><span>Product image URI</span><div class="field-row"><input id="product-reference" placeholder="asset://product-pack, https://... — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="product-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁 Tải lên</button></div></label>
            <label class="field"><span>Scene/background URI</span><div class="field-row"><input id="background-reference" placeholder="asset://studio-set, https://... — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="background-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁 Tải lên</button></div></label>
            <label class="field"><span>Source video URL</span><div class="field-row"><input id="reference-url" placeholder="https://reference-video.example — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="reference-url" data-upload-accept="video/mp4,video/quicktime" title="Tải video từ máy">📁 Tải lên</button></div></label>
            <label class="field" style="grid-column: 1 / -1"><span>Reference / voice note</span><input id="media-reference-note" placeholder="What to preserve from the attached media, source video, or voice direction"></label>
          </div>
          <div class="grid-2" style="margin-top:12px">
            <label class="field"><span>Wardrobe reference</span><div class="field-row"><input id="wardrobe-reference" placeholder="asset://outfit or https://..."><button type="button" class="upload-btn" data-upload-for="wardrobe-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁</button></div></label>
            <label class="field"><span>First frame</span><div class="field-row"><input id="first-frame-reference" placeholder="asset://opening-frame or https://..."><button type="button" class="upload-btn" data-upload-for="first-frame-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁</button></div></label>
            <label class="field"><span>Last frame</span><div class="field-row"><input id="last-frame-reference" placeholder="asset://final-frame or https://..."><button type="button" class="upload-btn" data-upload-for="last-frame-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁</button></div></label>
            <label class="field"><span>Media rights</span>
              <select id="media-rights">
                <option value="operator_approved">Operator approved</option>
                <option value="needs_review">Needs review</option>
                <option value="unknown">Unknown</option>
              </select>
            </label>
          </div>

          <div class="section-divider"></div>
          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">3</span>Source pattern intake</div>
            <button class="mini-btn" type="button" data-mode-button="video_remake">Use Remake Mode</button>
          </div>
          <div class="grid-3">
            <label class="field"><span>Source platform</span>
              <select id="template-source-platform">
                <option value="internal">CineJelly internal</option>
                <option value="reference_tool_motion">Reference-tool motion inspiration</option>
                <option value="reference_tool_ads">Reference-tool ad inspiration</option>
                <option value="tiktok">TikTok / Douyin / Reels</option>
                <option value="custom">Custom</option>
              </select>
            </label>
            <label class="field"><span>Learning policy</span>
              <select id="reference-rights">
                <option value="structure_only">Structure and rhythm only</option>
                <option value="rights_cleared_close_remake">Rights-cleared close remake</option>
              </select>
            </label>
            <label class="field"><span>Platform</span>
              <select id="platform">
                <option value="tiktok">TikTok</option>
                <option value="douyin">Douyin</option>
                <option value="instagram_reels">Instagram Reels</option>
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="unknown">Flexible</option>
              </select>
            </label>
          </div>
          <label class="field" style="margin-top:12px">
            <span>Source pattern summary</span>
            <textarea id="reference-summary" wrap="soft" placeholder="Paste the public pattern/video structure: hook, pacing, acting beats, camera style, edit rhythm, audio rhythm, and payoff. CineJelly will adapt the structure to your own KOL, product, and background."></textarea>
          </label>

          <div class="section-divider"></div>
          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">4</span>AI Storyboard</div>
            <button class="mini-btn" type="button" id="refresh-contract" disabled>Refresh Contract</button>
          </div>
          <div class="storyboard">
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(255,79,232,.26), rgba(17,183,255,.1))"></div>
              <div class="beat-body"><div class="beat-title"><span>1 Hook</span><span>0-3s</span></div><div class="beat-note">Problem / before state</div></div>
            </div>
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(54,242,170,.22), rgba(255,255,255,.08))"></div>
              <div class="beat-body"><div class="beat-title"><span>2 Proof</span><span>3-7s</span></div><div class="beat-note">Product / action</div></div>
            </div>
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(143,92,255,.28), rgba(255,79,232,.12))"></div>
              <div class="beat-body"><div class="beat-title"><span>3 Transform</span><span>7-12s</span></div><div class="beat-note">Change / result</div></div>
            </div>
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(244,184,77,.24), rgba(17,183,255,.14))"></div>
              <div class="beat-body"><div class="beat-title"><span>4 Payoff</span><span>12-15s</span></div><div class="beat-note">After / CTA soft</div></div>
            </div>
          </div>

          <div class="section-divider"></div>
          <div class="settings-bar">
            <label class="field"><span>Duration</span><input id="duration" type="number" min="15" max="480" value="15"></label>
            <label class="field"><span>Aspect ratio</span><select id="aspect-ratio"><option value="9:16" selected>9:16</option><option value="16:9">16:9</option><option value="1:1">1:1</option></select></label>
            <label class="field"><span>Quality / model</span>
              <select id="seedance-resolution">
                <option value="720p" selected>720p</option>
                <option value="720p-SR">720p SR</option>
                <option value="480p">480p</option>
                <option value="1080p">1080p</option>
                <option value="1080p-SR">1080p SR</option>
                <option value="1440p-SR">1440p SR</option>
              </select>
            </label>
            <label class="field"><span>Audio</span>
              <select id="audio">
                <option value="vi" selected>Vietnamese VO</option>
                <option value="en">English VO</option>
                <option value="zh">Chinese VO</option>
                <option value="off">Off</option>
              </select>
            </label>
          </div>
          <div class="grid-3" style="margin-top:12px">
            <label class="field"><span>Bitrate</span><select id="seedance-bitrate"><option value="high" selected>High</option><option value="standard">Standard</option></select></label>
            <label class="field"><span>Last frame</span><select id="return-last-frame"><option value="auto" selected>Auto</option><option value="true">On</option><option value="false">Off</option></select></label>
            <label class="field"><span>Product</span><input id="product-title" placeholder="Your real product, service, channel, or story subject"></label>
            <label class="field"><span>Category</span><input id="category" placeholder="beauty, fashion, SaaS, food, education..."></label>
            <label class="field" style="grid-column: span 2"><span>Allowed claim</span><input id="claim" placeholder="Only claims you can approve or substantiate"></label>
            <label class="field visually-hidden"><span>Project ID</span><input id="project-id" value="short_create_shell"></label>
          </div>
          <div class="render-bar">
            <div class="cost-card"><small>Preflight estimate</small><strong id="estimated-cost">$2.40</strong></div>
            <div class="detail">Backend keeps provider spend locked until approval packet and explicit render confirmation are ready.</div>
            <button type="submit" id="create-session" class="primary">Build Review Plan</button>
          </div>
        </form>

        <section class="right-stack">
          <div class="tabs-shell">
            <div class="template-tabs">
              <button class="template-tab active" type="button">Pattern Starters</button>
              <button class="template-tab" type="button">My Creations</button>
              <button class="template-tab" type="button">History</button>
            </div>
            <button class="ghost-btn" type="button" id="prepare-approval" disabled>Prepare Packet</button>
          </div>
          <div class="panel gallery">
            <div class="gallery-head">
              <div class="panel-title">Pattern Starters</div>
              <div class="template-tabs">
                <button class="template-tab active" type="button">All</button>
                <button class="template-tab" type="button">UGC</button>
                <button class="template-tab" type="button">Fashion</button>
                <button class="template-tab" type="button">Product</button>
              </div>
            </div>
            <div class="template-grid">
              <button class="template-card" type="button" data-template-apply="fashion_transform">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(255,79,232,.32), rgba(17,183,255,.14))"><div class="template-tags"><span class="tag">Hot</span><span class="tag">15s</span></div></div>
                <div class="template-body"><div class="template-name">Fashion Transformation</div><div class="template-meta">Before/After | UGC Style</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="skincare_ugc">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(54,242,170,.28), rgba(255,79,232,.12))"><div class="template-tags"><span class="tag">Trending</span><span class="tag">20s</span></div></div>
                <div class="template-body"><div class="template-name">Skincare UGC Review</div><div class="template-meta">Beauty | Proof-led</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="streetwear_reveal">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(143,92,255,.3), rgba(17,183,255,.14))"><div class="template-tags"><span class="tag">New</span><span class="tag">12s</span></div></div>
                <div class="template-body"><div class="template-name">Streetwear Reveal</div><div class="template-meta">Trend | Fast cuts</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="breaking_news_ad">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(244,184,77,.3), rgba(255,91,114,.16))"><div class="template-tags"><span class="tag">Viral</span><span class="tag">15s</span></div></div>
                <div class="template-body"><div class="template-name">Breaking News Ad</div><div class="template-meta">News hook | Product angle</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="product_reveal">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(17,183,255,.3), rgba(54,242,170,.14))"><div class="template-tags"><span class="tag">Popular</span><span class="tag">15s</span></div></div>
                <div class="template-body"><div class="template-name">Product Unboxing</div><div class="template-meta">Ecommerce | Reveal</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="cinematic_story">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(143,92,255,.32), rgba(244,184,77,.14))"><div class="template-tags"><span class="tag">Cinematic</span><span class="tag">30s</span></div></div>
                <div class="template-body"><div class="template-name">Cinematic Short Story</div><div class="template-meta">Film look | Emotional payoff</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="production_bible_story">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(255,79,232,.24), rgba(244,184,77,.16))"><div class="template-tags"><span class="tag">Series</span><span class="tag">90s</span></div></div>
                <div class="template-body"><div class="template-name">Production Bible Sequence</div><div class="template-meta">Long sequence | Consistent identity</div></div>
              </button>
            </div>
          </div>
          <div class="panel gallery">
            <div class="panel-head"><div class="panel-title">Quick Controls</div></div>
            <div class="tips">
              <div class="tip"><strong>Clear idea</strong><span>Prompt becomes script and storyboard evidence.</span></div>
              <div class="tip"><strong>Add references</strong><span>KOL, product, scene, source video.</span></div>
              <div class="tip"><strong>Budget guard</strong><span>No provider spend before approval.</span></div>
              <div class="tip"><strong>Review packet</strong><span>One clean pre-render handoff.</span></div>
            </div>
          </div>
          <div class="panel gallery">
            <div class="panel-head"><div class="panel-title">Recent Sessions</div></div>
            <div class="list" id="sessions"><div class="empty">No sessions loaded.</div></div>
          </div>
        </section>
      </section>

      <section class="contract-grid" aria-label="Backend contract">
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">Review Checkpoints</div><span class="pill" id="metric-review">--</span></div>
          <div class="detail" id="metric-checkpoints">checkpoints</div>
          <div class="list" id="review-checkpoints"><div class="empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">Seedance Routing</div><span class="pill info" id="metric-provider">Locked</span></div>
          <div class="detail"><span id="metric-workflow">--</span> | <span id="metric-duration">duration</span> | audio <span id="metric-audio">--</span></div>
          <div class="list" id="seedance-routing"><div class="empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">Media References</div></div>
          <div class="list" id="media-references"><div class="empty">No references loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">Creative Pattern Learning</div></div>
          <div class="list" id="creative-ideas"><div class="empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">Pattern / Remake Blueprint</div></div>
          <div class="list" id="reference-remake"><div class="empty">No remake blueprint loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">Backend Managed Steps</div></div>
          <div class="list" id="backend-steps"><div class="empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">User Required Actions</div></div>
          <div class="list" id="user-actions"><div class="empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title">Director</div></div>
          <div id="director" class="detail">No contract loaded.</div>
        </div>
      </section>

      <section class="panel approval">
        <div class="panel-head">
          <div class="panel-title">Approval Packet</div>
        </div>
        <div class="grid-3">
          <label class="field"><span>Reviewer</span><input id="reviewer" autocomplete="off" placeholder="Reviewer name"></label>
          <label class="field"><span>Decision</span>
            <select id="review-decision">
              <option value="approved">Approve</option>
              <option value="changes_requested">Request changes</option>
              <option value="rejected">Reject</option>
            </select>
          </label>
          <label class="field"><span>Notes</span><input id="review-notes" autocomplete="off" placeholder="Short review note"></label>
        </div>
        <label class="field" style="margin-top:12px"><span>Packet</span><textarea id="approval-packet" wrap="soft" readonly></textarea></label>
        <div class="grid-3" style="margin-top:12px;align-items:end">
          <label class="field"><span>Provider spend</span>
            <span class="detail" style="display:flex;gap:8px;align-items:center"><input type="checkbox" id="confirm-render">Confirm paid render submission</span>
            <span class="detail" style="display:flex;gap:8px;align-items:center;margin-top:6px"><input type="checkbox" id="caption-toggle">Phụ đề tự động từ voice (khớp kịch bản, không tốn thêm)</span>
          </label>
          <button class="ghost-btn" type="button" id="submit-render" disabled>Create Render Job</button>
          <button class="mini-btn" type="button" id="stop-polling" disabled>Stop Watching Job</button>
        </div>
        <div id="render-status" class="detail" style="margin-top:10px">No render job yet. Load a session contract, optionally prepare the review packet, then create the render job. Without approved and confirmed review the job is created paused for review with no provider spend.</div>
      </section>

      <section class="panel" id="jobs-panel" hidden>
        <div class="panel-head">
          <div class="panel-title">Render Jobs</div>
          <button class="mini-btn" type="button" id="refresh-jobs">Refresh</button>
        </div>
        <div id="jobs-queue" class="detail">Queue: chưa tải.</div>
        <div id="jobs-list" style="margin-top:10px"><div class="empty">Bấm Refresh để tải danh sách job (cần API key).</div></div>
        <div id="job-player" style="margin-top:12px" hidden>
          <video id="job-video" controls style="width:100%;max-height:420px;border-radius:12px;background:#000"></video>
        </div>
      </section>
    </main>
  </div>
  <script>
    const root = document.querySelector(".app");
    const endpoints = {
      sessions: root.dataset.sessionEndpoint,
      sessionUi: root.dataset.sessionUiEndpoint,
      render: root.dataset.renderEndpoint
    };
    let activeSessionId = "";
    let activeContract = undefined;
    let activeTemplateId = "";
    const workflowModeConfig = {
      short_video: {
        visualBibleMode: "auto",
        durationMin: 15,
        durationMax: 60,
        defaultTemplateId: "fashion_transform"
      },
      product_kol_ugc: {
        visualBibleMode: "reference_board",
        durationMin: 15,
        durationMax: 60,
        defaultTemplateId: "skincare_ugc",
        maxBoardCount: 6
      },
      storyboard_multishot: {
        visualBibleMode: "storyboard_board",
        durationMin: 15,
        durationMax: 60,
        defaultTemplateId: "product_reveal",
        maxBoardCount: 8
      },
      video_remake: {
        visualBibleMode: "storyboard_board",
        durationMin: 15,
        durationMax: 60,
        defaultTemplateId: "product_reveal",
        maxBoardCount: 8
      },
      production_bible: {
        visualBibleMode: "production_bible",
        durationMin: 60,
        durationMax: 480,
        defaultTemplateId: "production_bible_story",
        maxBoardCount: 12
      }
    };
    const templates = {
      fashion_transform: {
        mode: "short_video",
        backendTemplateId: "comparison",
        title: "Fashion Transformation",
        product: "Fashion Transformation",
        category: "fashion",
        duration: 15,
        prompt: "Làm video trước sau thời trang: vịt hóa thiên nga trong 15 giây, phong cách UGC tự nhiên, giọng nữ Việt Nam, nhịp TikTok, cảm xúc tự tin.",
        claim: "A clearer, more confident look for social video",
        summary: "Hook opens on an awkward before outfit, then a quick spin transition, then a confident after look with a soft product or outfit reveal. Preserve only timing, pacing, and transformation structure."
      },
      skincare_ugc: {
        mode: "product_kol_ugc",
        backendTemplateId: "ugc_ad",
        title: "Skincare UGC Review",
        product: "Bright Skin Cream",
        category: "beauty",
        duration: 20,
        prompt: "Tạo video UGC review kem dưỡng sáng da, mở đầu bằng vấn đề da xỉn màu, giữa video demo texture và cách dùng, cuối là cảm giác da sáng và tự tin hơn.",
        claim: "Helps dull-looking skin appear brighter",
        summary: "Creator hook, product texture proof, application close-up, before/after mood shift, final natural reaction."
      },
      streetwear_reveal: {
        mode: "storyboard_multishot",
        backendTemplateId: "tiktok_product_ad",
        title: "Streetwear Reveal",
        product: "Streetwear Outfit",
        category: "fashion",
        duration: 12,
        prompt: "Tạo video reveal streetwear nhịp nhanh, quay dọc 9:16, mở đầu chi tiết outfit, giữa là chuyển động bước ra phố, cuối là pose tự tin.",
        claim: "Street-ready outfit reveal for social ads",
        summary: "Fast edit, outfit detail, walkout motion, final confidence pose. Use as structure only."
      },
      breaking_news_ad: {
        mode: "storyboard_multishot",
        backendTemplateId: "tiktok_product_ad",
        title: "Breaking News Ad",
        product: "Hot Deal Product",
        category: "commerce",
        duration: 15,
        prompt: "Tạo video quảng cáo dạng tin nóng UGC, hook như bản tin nhưng không có chữ trên màn hình, chuyển nhanh sang sản phẩm và lý do đáng chú ý.",
        claim: "A timely product angle for social attention",
        summary: "Breaking-news energy, creator reaction, product proof, urgency beat, soft CTA. Do not generate fake news claims."
      },
      product_reveal: {
        mode: "storyboard_multishot",
        backendTemplateId: "cinematic_product_reveal",
        title: "Product Unboxing",
        product: "Premium Product",
        category: "ecommerce",
        duration: 15,
        prompt: "Tạo video unboxing sản phẩm cao cấp, mở đầu tay mở hộp, giữa là cận cảnh chất liệu và chi tiết, cuối là hero shot sạch và cảm giác muốn mua.",
        claim: "Premium product reveal with clear detail",
        summary: "Unbox, tactile proof, product macro, hero frame. Keep product readable and stable at the end."
      },
      cinematic_story: {
        mode: "storyboard_multishot",
        backendTemplateId: "founder_story",
        title: "Cinematic Short Story",
        product: "Brand Story",
        category: "cinematic_story",
        duration: 30,
        prompt: "Tạo video cinematic short story 30 giây, có mở đầu cảm xúc, giữa là hành trình thay đổi, cuối là payoff đẹp và có thể dùng cho thương hiệu.",
        claim: "Cinematic brand story for social video",
        summary: "Emotional setup, character movement, product or brand proof, cinematic payoff, clean final frame."
      },
      production_bible_story: {
        mode: "production_bible",
        backendTemplateId: "founder_story",
        title: "Production Bible Sequence",
        product: "Brand Sequence",
        category: "production_bible",
        duration: 90,
        prompt: "Create a 90 second branded sequence with one recurring host, one product proof arc, clear opening, middle, ending, consistent visual bible, Vietnamese voiceover timing, and clean clip endpoints for last-frame chaining.",
        claim: "A consistent branded sequence with clear product proof",
        summary: "Production bible mode: recurring identity, product/world references, storyboard boards, audio timing cues, multi-clip sequence continuity, and final delivery handles."
      }
    };

    document.getElementById("auth-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await loadSessions();
    });
    document.getElementById("brief-form").addEventListener("submit", async (event) => {
      event.preventDefault();
      await createSession();
    });
    document.getElementById("refresh-contract").addEventListener("click", async () => {
      if (activeSessionId) await loadContract(activeSessionId);
    });
    document.getElementById("prepare-approval").addEventListener("click", () => {
      prepareApprovalPacket();
    });
    document.getElementById("prompt").addEventListener("input", updatePromptCount);
    document.getElementById("duration").addEventListener("input", updateEstimatedCost);
    document.getElementById("seedance-resolution").addEventListener("change", updateEstimatedCost);
    document.querySelectorAll("[data-template-apply]").forEach((button) => {
      button.addEventListener("click", () => applyTemplate(button.dataset.templateApply));
    });
    document.querySelectorAll("[data-mode-button]").forEach((button) => {
      button.addEventListener("click", () => setWorkflowMode(button.dataset.modeButton));
    });
    document.querySelectorAll("[data-focus-reference]").forEach((button) => {
      button.addEventListener("click", () => {
        const field = document.getElementById(button.dataset.focusReference);
        if (field) {
          field.focus();
        }
      });
    });
    document.querySelectorAll("[data-enhance-prompt]").forEach((button) => {
      button.addEventListener("click", enhancePrompt);
    });
    document.getElementById("clear-reference-fields").addEventListener("click", clearReferenceFields);
    setupReferenceUploads();
    document.getElementById("submit-render").addEventListener("click", submitRender);
    document.getElementById("stop-polling").addEventListener("click", () => stopJobPolling("Stopped watching the job. Reload the contract or reopen the status URL to check again."));
    document.getElementById("nav-jobs").addEventListener("click", () => {
      const panel = document.getElementById("jobs-panel");
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        loadJobs();
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    document.getElementById("refresh-jobs").addEventListener("click", loadJobs);
    updatePromptCount();
    updateEstimatedCost();

    let jobPollTimer = null;
    let jobPollDelayMs = 3000;

    function setRenderStatus(text) {
      document.getElementById("render-status").textContent = text;
    }

    function stopJobPolling(message) {
      if (jobPollTimer) {
        clearTimeout(jobPollTimer);
        jobPollTimer = null;
      }
      document.getElementById("stop-polling").disabled = true;
      if (message) {
        setRenderStatus(message);
      }
    }

    async function submitRender() {
      clearMessages();
      if (!activeSessionId) {
        showError("Load or create a session before creating a render job.");
        return;
      }
      const submitButton = document.getElementById("submit-render");
      if (submitButton.disabled) {
        return;
      }
      submitButton.disabled = true;
      const submitLabel = submitButton.textContent;
      submitButton.textContent = "Đang gửi...";
      stopJobPolling();
      try {
        const confirmRender = document.getElementById("confirm-render").checked;
        const captionsOn = document.getElementById("caption-toggle").checked;
        const review = collectReviewApproval();
        const body = {
          ...(review ? { reviewApprovalGate: review.gate, reviewApprovalCheckpoints: review.checkpoints } : {}),
          ...(captionsOn ? { captionPreference: "narration_subtitles" } : {}),
          confirmRenderSubmission: confirmRender
        };
        const endpoint = endpoints.render.replace("{sessionId}", encodeURIComponent(activeSessionId));
        setRenderStatus("Submitting render job...");
        const response = await apiFetch(endpoint, { method: "POST", body: JSON.stringify(body) });
        const jobId = response.jobId || (response.job && response.job.jobId) || "";
        const statusUrl = response.statusUrl || (jobId ? "/v1/render-jobs/" + encodeURIComponent(jobId) : "");
        showSuccess("Render job created" + (jobId ? " (" + jobId + ")" : "") + ".");
        if (statusUrl) {
          jobPollDelayMs = 3000;
          pollRenderJob(statusUrl);
        } else {
          setRenderStatus("Job created but no status URL was returned; check the Jobs API directly.");
        }
      } finally {
        submitButton.disabled = false;
        submitButton.textContent = submitLabel;
      }
    }

    function jobStatusPillClass(status) {
      if (status === "succeeded") return "pill ready";
      if (status === "queued" || status === "running") return "pill info";
      return "pill warn";
    }

    async function loadJobs() {
      clearMessages();
      const queueNode = document.getElementById("jobs-queue");
      const listNode = document.getElementById("jobs-list");
      let response;
      try {
        response = await apiFetch("/v1/render-jobs");
      } catch (error) {
        listNode.innerHTML = '<div class="empty">Không tải được danh sách job — kiểm tra API key.</div>';
        return;
      }
      const queue = response.queue || {};
      queueNode.textContent = "Queue: " +
        (queue.queuedJobCount ?? 0) + " chờ | " +
        (queue.runningJobCount ?? 0) + " đang chạy | " +
        (queue.pausedJobCount ?? 0) + " chờ duyệt";
      const jobs = response.jobs || [];
      if (jobs.length === 0) {
        listNode.innerHTML = '<div class="empty">Chưa có render job nào.</div>';
        return;
      }
      listNode.innerHTML = jobs.map((job) => {
        const shortId = escapeHtml(String(job.jobId || "").slice(0, 24));
        const status = escapeHtml(String(job.status || "unknown"));
        const created = job.createdAt ? escapeHtml(String(job.createdAt).replace("T", " ").slice(0, 19)) : "";
        const preview = escapeHtml(String(job.userInputPreview || "").slice(0, 90));
        const jobIdAttr = escapeAttribute(String(job.jobId || ""));
        const finishedButtons = String(job.status || "") === "succeeded"
          ? '<button class="mini-btn" type="button" onclick="playJob(\'' + jobIdAttr + '\')">Xem</button>' +
            '<button class="mini-btn" type="button" onclick="downloadJob(\'' + jobIdAttr + '\')">Tải</button>'
          : "";
        return '<article class="item"><div class="row"><div>' +
          '<div class="title">' + shortId + '…</div>' +
          '<div class="detail">' + created + (preview ? " | " + preview : "") + '</div>' +
          '</div><div style="display:flex;gap:8px;align-items:center">' +
          '<span class="' + jobStatusPillClass(String(job.status || "")) + '">' + status.replaceAll("_", " ") + '</span>' +
          finishedButtons +
          '<button class="mini-btn" type="button" onclick="watchJob(\'' + jobIdAttr + '\')">Theo dõi</button>' +
          '</div></div></article>';
      }).join("");
    }

    function watchJob(jobId) {
      if (!jobId) {
        return;
      }
      stopJobPolling();
      jobPollDelayMs = 3000;
      pollRenderJob("/v1/render-jobs/" + encodeURIComponent(jobId));
      document.getElementById("render-status").scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.watchJob = watchJob;

    async function fetchDeliverableBlob(jobId) {
      const key = document.getElementById("api-key").value.trim();
      const response = await fetch("/v1/render-jobs/" + encodeURIComponent(jobId) + "/deliverable", {
        headers: { ...(key ? { "X-CineJelly-Api-Key": key } : {}) }
      });
      if (!response.ok) {
        showError("Không tải được video (job chưa xong hoặc file đã dọn).");
        return undefined;
      }
      return response.blob();
    }

    async function playJob(jobId) {
      clearMessages();
      const blob = await fetchDeliverableBlob(jobId);
      if (!blob) {
        return;
      }
      const player = document.getElementById("job-player");
      const video = document.getElementById("job-video");
      if (video.dataset.objectUrl) {
        URL.revokeObjectURL(video.dataset.objectUrl);
      }
      const objectUrl = URL.createObjectURL(blob);
      video.dataset.objectUrl = objectUrl;
      video.src = objectUrl;
      player.hidden = false;
      video.play().catch(() => {});
      player.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    window.playJob = playJob;

    async function downloadJob(jobId) {
      clearMessages();
      const blob = await fetchDeliverableBlob(jobId);
      if (!blob) {
        return;
      }
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = jobId + ".mp4";
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 10000);
      showSuccess("Đã bắt đầu tải video.");
    }
    window.downloadJob = downloadJob;

    async function pollRenderJob(statusUrl) {
      document.getElementById("stop-polling").disabled = false;
      let job;
      try {
        job = await apiFetch(statusUrl);
      } catch (error) {
        stopJobPolling("Job status check failed; open " + statusUrl + " manually.");
        return;
      }
      const status = job.status || "unknown";
      const stage = typeof job.currentStage === "string" && job.currentStage
        ? " | stage: " + job.currentStage
        : "";
      setRenderStatus("Job " + (job.jobId || "") + " status: " + status + stage + " | " + statusUrl);
      if (status === "succeeded" || status === "failed" || status === "canceled" || status === "rejected" || status === "blocked") {
        stopJobPolling("Job finished with status: " + status + ". Details: " + statusUrl);
        return;
      }
      if (status.indexOf("paused") === 0) {
        stopJobPolling("Job is " + status.replaceAll("_", " ") + "; submit accepted review evidence, then create the render job again with confirmation.");
        return;
      }
      jobPollDelayMs = Math.min(Math.round(jobPollDelayMs * 1.25), 10000);
      jobPollTimer = setTimeout(() => pollRenderJob(statusUrl), jobPollDelayMs);
    }

    function collectReviewApproval() {
      if (!activeContract) {
        return undefined;
      }
      const reviewer = document.getElementById("reviewer").value.trim();
      if (!reviewer) {
        return undefined;
      }
      const decision = document.getElementById("review-decision").value;
      const notes = document.getElementById("review-notes").value.trim();
      const reviewedAt = new Date().toISOString();
      return {
        gate: activeContract.review.approvalPayloadContract.gate,
        checkpoints: activeContract.review.checkpoints
          .filter((checkpoint) => checkpoint.canApproveInUi)
          .map((checkpoint) => ({
            surface: checkpoint.surface,
            label: checkpoint.label,
            ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
            required: checkpoint.required,
            decision,
            reviewer,
            reviewedAt,
            ...(notes ? { notes } : {})
          }))
      };
    }

    async function createSession() {
      clearMessages();
      const payload = briefPayload();
      if (!payload.userPrompt) {
        showError("Creative brief is required before creating a real backend session.");
        return;
      }
      const response = await apiFetch(endpoints.sessions, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      activeSessionId = response.session.sessionId;
      document.getElementById("session-line").textContent = activeSessionId;
      document.getElementById("refresh-contract").disabled = false;
      showSuccess("Review plan created. Provider render is still locked until explicit approval.");
      await loadContract(activeSessionId);
      await loadSessions();
    }

    async function loadSessions() {
      clearMessages();
      const response = await apiFetch(endpoints.sessions);
      const sessions = response.sessions || [];
      renderList("sessions", sessions, sessionTemplate);
    }

    async function loadContract(sessionId) {
      clearMessages();
      const endpoint = endpoints.sessionUi.replace("{sessionId}", encodeURIComponent(sessionId));
      const response = await apiFetch(endpoint);
      activeSessionId = sessionId;
      document.getElementById("session-line").textContent = sessionId;
      document.getElementById("refresh-contract").disabled = false;
      renderContract(response.uiContract);
    }

    function setupReferenceUploads() {
      const fileInput = document.getElementById("upload-file-input");
      if (!fileInput) return;
      let pendingButton = null;
      document.querySelectorAll("[data-upload-for]").forEach((button) => {
        button.addEventListener("click", () => {
          pendingButton = button;
          fileInput.accept = button.dataset.uploadAccept || "image/*";
          fileInput.value = "";
          fileInput.click();
        });
      });
      fileInput.addEventListener("change", async () => {
        const file = fileInput.files && fileInput.files[0];
        const button = pendingButton;
        pendingButton = null;
        if (!file || !button) return;
        const target = document.getElementById(button.dataset.uploadFor);
        if (!target) return;
        if (file.size > 25 * 1024 * 1024) {
          showError("File quá lớn (tối đa 25MB). Hãy nén ảnh/video rồi thử lại.");
          return;
        }
        const key = document.getElementById("api-key").value.trim();
        if (!key) {
          showError("Nhập API key (ô trên cùng) trước khi tải file lên.");
          return;
        }
        const originalLabel = button.textContent;
        button.dataset.busy = "true";
        button.textContent = "⏳...";
        try {
          const response = await fetch("/v1/uploads", {
            method: "POST",
            headers: {
              "Content-Type": "application/octet-stream",
              "X-File-Name": encodeURIComponent(file.name),
              "X-CineJelly-Api-Key": key
            },
            body: file
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Upload failed");
          }
          target.value = payload.uri;
          showSuccess('Đã tải lên "' + file.name + '" — trường reference đã được điền, cứ thế bấm render.');
          applyUploadThumbnail(button.dataset.uploadFor, file, payload.kind);
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        } finally {
          button.dataset.busy = "false";
          button.textContent = originalLabel;
        }
      });
    }

    function applyUploadThumbnail(targetId, file, kind) {
      if (kind !== "image" || !file) return;
      const isCardTarget = targetId === "kol-reference" || targetId === "product-reference" || targetId === "background-reference";
      if (!isCardTarget) return;
      const card = document.querySelector('[data-focus-reference="' + targetId + '"]');
      if (!card) return;
      const reader = new FileReader();
      reader.onload = () => {
        // data: URLs are allowed by the page CSP (img-src 'self' data:).
        card.style.setProperty("--asset-img", "url(" + reader.result + ")");
      };
      reader.readAsDataURL(file);
    }

    async function apiFetch(path, options = {}) {
      const key = document.getElementById("api-key").value.trim();
      const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(key ? { "X-CineJelly-Api-Key": key } : {})
      };
      try {
        const response = await fetch(path, { ...options, headers });
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.error || "Request failed");
        }
        return payload;
      } catch (error) {
        showError(error instanceof Error ? error.message : String(error));
        throw error;
      }
    }

    function briefPayload() {
      const language = document.getElementById("audio").value;
      const audio = language === "off" ? { mode: "off" } : { mode: "voiceover", language };
      const referenceVideoLearning = referenceVideoLearningPayload();
      const mediaReferences = mediaReferencesPayload();
      const seedanceSettings = seedanceSettingsPayload();
      const preferredTemplateId = preferredTemplateIdPayload();
      const visualBible = visualBiblePayload();
      return {
        projectId: document.getElementById("project-id").value.trim(),
        userPrompt: document.getElementById("prompt").value.trim(),
        ...(preferredTemplateId ? { preferredTemplateId } : {}),
        targetPlatform: document.getElementById("platform").value,
        targetDurationSeconds: Number(document.getElementById("duration").value),
        targetAspectRatio: document.getElementById("aspect-ratio").value,
        audio,
        product: {
          snapshot: {
            productTitle: document.getElementById("product-title").value.trim(),
            category: document.getElementById("category").value.trim(),
            claims: [document.getElementById("claim").value.trim()].filter(Boolean)
          }
        },
        brandKit: {
          brandName: "Operator Brand",
          tone: "premium but clear",
          language: language === "off" ? "en" : language,
          allowedClaims: [document.getElementById("claim").value.trim()].filter(Boolean),
          forbiddenClaims: ["guaranteed cure", "instant medical result"],
          ctaRules: ["Use one CTA only"],
          voicePreferences: [language === "vi" ? "Vietnamese natural creator voice" : "natural creator voice"]
        },
        ...(mediaReferences.length ? { mediaReferences } : {}),
        ...(referenceVideoLearning ? { referenceVideoLearning } : {}),
        ...(seedanceSettings ? { seedanceSettings } : {}),
        ...(visualBible ? { visualBible } : {}),
        messages: [
          { role: "user", text: document.getElementById("prompt").value.trim() }
        ]
      };
    }

    function preferredTemplateIdPayload() {
      const mode = document.getElementById("workflow-mode").value;
      const template = templates[activeTemplateId];
      return template && template.mode === mode ? template.backendTemplateId : undefined;
    }

    function visualBiblePayload() {
      const mode = document.getElementById("workflow-mode").value;
      const config = workflowModeConfig[mode] || workflowModeConfig.short_video;
      if (!config.visualBibleMode || config.visualBibleMode === "auto") {
        return undefined;
      }
      return {
        mode: config.visualBibleMode,
        imageProviderPolicy: "provider_neutral",
        requireBeforeRender: true,
        ...(config.maxBoardCount ? { maxBoardCount: config.maxBoardCount } : {})
      };
    }

    function seedanceSettingsPayload() {
      const resolution = document.getElementById("seedance-resolution").value;
      const bitrateMode = document.getElementById("seedance-bitrate").value;
      const returnLastFrame = document.getElementById("return-last-frame").value;
      const settings = {};
      if (resolution !== "720p") settings.resolution = resolution;
      if (bitrateMode !== "high") settings.bitrateMode = bitrateMode;
      if (returnLastFrame !== "auto") settings.returnLastFrame = returnLastFrame === "true";
      return Object.keys(settings).length ? settings : undefined;
    }

    function mediaReferencesPayload() {
      const rightsStatus = document.getElementById("media-rights").value;
      const note = document.getElementById("media-reference-note").value.trim();
      const referenceRights = document.getElementById("reference-rights").value;
      const closeRemake = referenceRights === "rights_cleared_close_remake";
      const entries = [
        ["kol-reference", "kol", "image", "KOL identity reference", "Preserve approved creator identity only."],
        ["product-reference", "product", "image", "Product reference", "Preserve product geometry, packaging, label, and material only."],
        ["wardrobe-reference", "wardrobe", "image", "Wardrobe reference", "Preserve outfit silhouette, color, and fit only."],
        ["background-reference", "background", "image", "Background reference", "Preserve set layout and environment mood only."],
        ["first-frame-reference", "first_frame", "image", "First-frame anchor", "Use as the opening composition only."],
        ["last-frame-reference", "last_frame", "image", "Last-frame anchor", "Use as the final composition target only."]
      ];
      const references = entries.flatMap(([id, role, kind, label, description]) => {
        const uri = document.getElementById(id).value.trim();
        return uri ? [{
          role,
          kind,
          uri,
          label,
          rightsStatus,
          priority: role === "kol" || role === "product" ? "primary" : "supporting",
          description: note || description
        }] : [];
      });
      const sourceUrl = document.getElementById("reference-url").value.trim();
      if (document.getElementById("workflow-mode").value === "video_remake" && sourceUrl) {
        references.push({
          role: "source_video",
          kind: "video",
          uri: sourceUrl,
          label: "Source video structure",
          rightsStatus: closeRemake ? "operator_approved" : "needs_review",
          priority: "supporting",
          description: "Learn edit rhythm, acting beats, camera grammar, retention timing, and payoff structure with replacement guardrails."
        });
      }
      return references;
    }

    function referenceVideoLearningPayload() {
      if (document.getElementById("workflow-mode").value !== "video_remake") {
        return undefined;
      }
      const sourceUrl = document.getElementById("reference-url").value.trim();
      const summary = document.getElementById("reference-summary").value.trim();
      if (!sourceUrl && !summary) {
        return undefined;
      }
      const platform = document.getElementById("template-source-platform").value;
      const closeRemake = document.getElementById("reference-rights").value === "rights_cleared_close_remake";
      const payload = {
        sourceLabel: platform + " source pattern",
        ...(sourceUrl ? { sourceUrl } : {}),
        summary: summary || "User selected source-pattern intake and supplied a reference for structure, edit rhythm, acting beats, camera language, and payoff timing.",
        hook: "Preserve the reference hook job, rewritten for the user's product and creator.",
        pacing: "Derive scene timing, cut density, reveal order, retention beats, and payoff timing from the reference structure.",
        cameraStyle: "Derive camera language while replacing creator, product, background, and props with user-approved inputs.",
        captionStyle: "Use visual rhythm only; keep generated output free of visible captions, subtitles, labels, and CTA cards.",
        audioStyle: "Derive audio rhythm only; use new guided or licensed voice and audio.",
        retentionPattern: "Carry the reference retention mechanics into a new product-proof story.",
        ctaStyle: "Adapt the payoff action to the user's offer and approved claims."
      };
      payload["do" + "Not" + "C" + "opy"] = !closeRemake;
      return payload;
    }

    function renderContract(contract) {
      activeContract = contract;
      document.getElementById("side-status").textContent = contract.status;
      document.getElementById("side-scenes").textContent = String(contract.outputContract.expectedSceneCount);
      document.getElementById("side-pending").textContent = String(contract.review.requiredPendingCount);
      document.getElementById("side-provider").textContent = contract.seedanceRouting
        ? contract.seedanceRouting.recommendedProviderMode.replaceAll("_", " ")
        : contract.render.canSubmitToProviderNow ? "ready" : "locked";
      document.getElementById("metric-workflow").textContent = contract.duration.recommendedWorkflowMode.replaceAll("_", " ");
      document.getElementById("metric-duration").textContent = contract.duration.targetSeconds + "s target";
      document.getElementById("metric-review").textContent = contract.review.status.replaceAll("_", " ");
      document.getElementById("metric-review").className = "pill " + pillClass(contract.review.status);
      document.getElementById("metric-checkpoints").textContent = contract.review.checkpointCount + " checkpoint(s)";
      document.getElementById("metric-audio").textContent = contract.audioControls.selectedOptionId.replaceAll("_", " ");
      document.getElementById("metric-provider").textContent = contract.render.canSubmitToProviderNow ? "Ready" : "Locked";
      document.getElementById("metric-provider").className = "pill " + (contract.render.canSubmitToProviderNow ? "ready" : "warn");
      document.getElementById("prepare-approval").disabled = false;
      document.getElementById("submit-render").disabled = false;
      document.getElementById("approval-packet").value = "";
      renderList("review-checkpoints", contract.review.checkpoints, checkpointTemplate);
      renderSeedanceRouting(contract.seedanceRouting);
      renderList("media-references", contract.mediaReferences || [], mediaReferenceTemplate);
      renderCreativeIdeas(contract.creativePatternLearning);
      renderReferenceRemake(contract.referenceRemake);
      renderList("user-actions", contract.userRequiredActions, actionTemplate);
      renderList("backend-steps", contract.backendManagedSteps, actionTemplate);
      document.getElementById("director").textContent = [
        contract.director.creativeMode.replaceAll("_", " "),
        contract.director.durationStrategy.replaceAll("_", " "),
        contract.director.targetBeatCount + " beats",
        contract.director.hookWindowSeconds + "s hook",
        contract.pipeSelection ? contract.pipeSelection.selectedBackendPipe.replaceAll("_", " ") : ""
      ].filter(Boolean).join(" | ");
    }

    function renderSeedanceRouting(routing) {
      const node = document.getElementById("seedance-routing");
      if (!routing) {
        node.innerHTML = '<div class="empty">No routing loaded.</div>';
        return;
      }
      node.innerHTML = '<article class="item"><div class="row"><div><div class="title">' +
        escapeHtml(routing.recommendedProviderMode.replaceAll("_", " ") + " | " + routing.modelAlias) +
        '</div><div class="detail">tier=' + escapeHtml(routing.preferredTier) +
        ' | resolution=' + escapeHtml(routing.resolution) +
        ' | sr=' + escapeHtml(routing.superResolution) +
        ' | bitrate=' + escapeHtml(routing.bitrateMode) +
        ' | ratio=' + escapeHtml(routing.ratio) +
        ' | returnLastFrame=' + escapeHtml(routing.returnLastFrame) +
        '</div><div class="detail">recipe=' + escapeHtml(routing.promptRecipe.name.replaceAll("_", " ")) +
        ' | tags=' + escapeHtml(routing.referenceTagCount) +
        ' | clip=' + escapeHtml(routing.providerClipDurationSeconds.targetPerClip + "s") +
        '</div><div class="detail">' + escapeHtml((routing.reasonCodes || []).join(", ")) +
        '</div></div><span class="pill info">' +
        escapeHtml(routing.canSubmitToProviderNow ? "provider ready" : "review gated") +
        '</span></div></article>' +
        ((routing.warnings || []).length
          ? '<article class="item"><div class="detail">' + escapeHtml(routing.warnings.join(" | ")) + '</div></article>'
          : "");
    }

    function prepareApprovalPacket() {
      clearMessages();
      if (!activeContract || !activeSessionId) {
        showError("No session contract loaded.");
        return;
      }
      const reviewer = document.getElementById("reviewer").value.trim();
      if (!reviewer) {
        showError("Reviewer is required.");
        return;
      }
      const decision = document.getElementById("review-decision").value;
      const notes = document.getElementById("review-notes").value.trim();
      const reviewedAt = new Date().toISOString();
      const packet = {
        sessionId: activeSessionId,
        endpointPath: activeContract.review.approvalPayloadContract.endpointPath.replace("{sessionId}", activeSessionId),
        reviewApprovalGate: activeContract.review.approvalPayloadContract.gate,
        confirmRenderSubmission: activeContract.review.approvalPayloadContract.confirmRenderSubmissionDefault,
        reviewApprovalCheckpoints: activeContract.review.checkpoints
          .filter((checkpoint) => checkpoint.canApproveInUi)
          .map((checkpoint) => ({
            surface: checkpoint.surface,
            label: checkpoint.label,
            ...(checkpoint.subjectId ? { subjectId: checkpoint.subjectId } : {}),
            required: checkpoint.required,
            decision,
            reviewer,
            reviewedAt,
            ...(notes ? { notes } : {})
          }))
      };
      document.getElementById("approval-packet").value = JSON.stringify(packet, null, 2);
      showSuccess("Approval packet prepared.");
    }

    function renderCreativeIdeas(learning) {
      const node = document.getElementById("creative-ideas");
      if (!learning || !Array.isArray(learning.topCandidates) || learning.topCandidates.length === 0) {
        node.innerHTML = '<div class="empty">None.</div>';
        return;
      }
      const selected = learning.selectedIdeaLabel
        ? '<article class="item"><div class="row"><div><div class="title">' +
          escapeHtml(learning.selectedIdeaLabel) + '</div><div class="detail">' +
          escapeHtml(learning.selectedIdeaHook || "") + '</div><div class="detail">' +
          escapeHtml(learning.selectedIdeaProofPlan || "") + '</div></div><span class="pill ready">selected</span></div></article>'
        : "";
      const candidates = learning.topCandidates.map(creativeIdeaTemplate).join("");
      node.innerHTML = selected + candidates;
    }

    function renderReferenceRemake(remake) {
      const node = document.getElementById("reference-remake");
      if (!remake) {
        node.innerHTML = '<div class="empty">Use Remake mode with a reference video URL or structure summary to generate a safe pattern blueprint.</div>';
        return;
      }
      node.innerHTML = '<article class="item"><div class="row"><div><div class="title">' +
        escapeHtml(remake.userFacingModeLabel + " | " + remake.status.replaceAll("_", " ")) +
        '</div><div class="detail">mode=' + escapeHtml(remake.mode.replaceAll("_", " ")) +
        ' | fidelity=' + escapeHtml(remake.fidelityTarget.replaceAll("_", " ")) +
        ' | intake=' + escapeHtml((remake.trendVideoIntakeMode || "").replaceAll("_", " ")) +
        '</div><div class="detail">replace: ' +
        escapeHtml((remake.replacementSlots || []).join(", ")) +
        '</div><div class="detail">adherence: ' +
        escapeHtml((remake.adherenceTargets || []).slice(0, 3).join(" | ")) +
        '</div><div class="detail">beat map: ' +
        escapeHtml((remake.sourceBeatMap || []).slice(0, 4).join(" | ")) +
        '</div><div class="detail">lock: ' +
        escapeHtml((remake.lockedElements || []).slice(0, 4).join(" | ")) +
        '</div><div class="detail">guardrails: ' +
        escapeHtml((remake.remakeGuardrails || []).slice(0, 3).join(" | ")) +
        '</div></div><span class="pill ' + pillClass(remake.status) + '">' +
        escapeHtml(remake.canUseAfterReview ? "review gate" : "blocked") +
        '</span></div></article>';
    }

    function renderList(id, items, template) {
      const node = document.getElementById(id);
      if (!items || !items.length) {
        node.innerHTML = '<div class="empty">None.</div>';
        return;
      }
      node.innerHTML = items.map(template).join("");
    }

    function sessionTemplate(session) {
      return '<button type="button" class="session-button" onclick="loadContract(' +
        "'" + escapeAttribute(session.sessionId) + "'" +
        ')"><div class="row"><div><div class="title">' +
        escapeHtml(session.projectId) + '</div><div class="detail">' +
        escapeHtml(session.sessionId) + '</div></div><span class="pill ' +
        pillClass(session.planStatus || "info") + '">' +
        escapeHtml(session.planStatus || "stored") + '</span></div></button>';
    }

    function actionTemplate(action) {
      return '<article class="item"><div class="row"><div><div class="title">' +
        escapeHtml(action.label) + '</div><div class="detail">' +
        escapeHtml(action.reason) + '</div></div><span class="pill ' +
        pillClass(action.status) + '">' + escapeHtml(action.status.replaceAll("_", " ")) +
        '</span></div></article>';
    }

    function creativeIdeaTemplate(candidate) {
      return '<article class="item"><div class="row"><div><div class="title">' +
        escapeHtml(candidate.label) + '</div><div class="detail">' +
        escapeHtml(candidate.hook) + '</div><div class="detail">score=' +
        escapeHtml(candidate.score) + ' | originality=' +
        escapeHtml(candidate.nonCloneSafety) + '</div></div><span class="pill teal">' +
        escapeHtml(candidate.patternId.slice(0, 18)) + '</span></div></article>';
    }

    function checkpointTemplate(checkpoint) {
      return '<article class="item"><div class="row"><div><div class="title">' +
        escapeHtml(checkpoint.label) + '</div><div class="detail">' +
        escapeHtml(checkpoint.surface + (checkpoint.subjectId ? " | " + checkpoint.subjectId : "")) +
        '</div><div class="detail">issues=' +
        escapeHtml((checkpoint.issueCodes || []).join(", ") || "none") +
        '</div></div><span class="pill ' + pillClass(checkpoint.decision) + '">' +
        escapeHtml(checkpoint.decision.replaceAll("_", " ")) + '</span></div></article>';
    }

    function mediaReferenceTemplate(reference) {
      return '<article class="item"><div class="row"><div><div class="title">' +
        escapeHtml(reference.promptTag + " | " + reference.label) +
        '</div><div class="detail">' +
        escapeHtml(reference.inputRole + " -> " + reference.promptRole + " / " + reference.providerKind) +
        '</div><div class="detail">rights=' +
        escapeHtml(reference.rightsStatus) + ' | uri=' +
        escapeHtml(reference.uriPolicy) + ' | providerHandoff=' +
        escapeHtml(reference.includeInProviderHandoff) +
        (reference.sourceHost ? ' | host=' + escapeHtml(reference.sourceHost) : '') +
        '</div><div class="detail">' +
        escapeHtml(reference.transferScope || "") +
        '</div><div class="detail">issues=' +
        escapeHtml((reference.issues || []).join(", ") || "none") +
        '</div></div><span class="pill ' + pillClass(reference.status) + '">' +
        escapeHtml(reference.status.replaceAll("_", " ")) + '</span></div></article>';
    }

    function applyTemplate(templateId) {
      const template = templates[templateId];
      if (!template) return;
      activeTemplateId = templateId;
      setWorkflowMode(template.mode);
      document.getElementById("prompt").value = template.prompt;
      document.getElementById("product-title").value = template.product;
      document.getElementById("category").value = template.category;
      document.getElementById("duration").value = String(template.duration);
      document.getElementById("claim").value = template.claim;
      document.getElementById("reference-summary").value = template.summary;
      document.querySelectorAll(".template-card").forEach((card) => {
        card.classList.toggle("active", card.dataset.templateApply === templateId);
      });
      updatePromptCount();
      updateEstimatedCost();
      showSuccess("Pattern starter loaded: " + template.title + ".");
    }

    function setWorkflowMode(mode) {
      const config = workflowModeConfig[mode] || workflowModeConfig.short_video;
      document.getElementById("workflow-mode").value = mode;
      const duration = document.getElementById("duration");
      duration.min = String(config.durationMin);
      duration.max = String(config.durationMax);
      const currentDuration = Number(duration.value) || config.durationMin;
      if (currentDuration < config.durationMin) {
        duration.value = String(config.durationMin);
      }
      if (currentDuration > config.durationMax) {
        duration.value = String(config.durationMax);
      }
      document.querySelectorAll("[data-mode-button]").forEach((button) => {
        button.classList.toggle("active", button.dataset.modeButton === mode);
      });
      document.querySelectorAll(".template-card").forEach((card) => {
        const template = templates[card.dataset.templateApply];
        card.classList.toggle("active", template?.mode === mode && card.dataset.templateApply === activeTemplateId);
      });
      if (mode === "video_remake" && !document.getElementById("reference-summary").value.trim()) {
        document.getElementById("reference-summary").value = "Learn the public reference structure only: hook job, shot timing, camera movement, edit rhythm, acting beats, audio rhythm, and payoff. Replace creator, product, background, props, claims, captions, and voice with user-approved inputs.";
      }
      updateEstimatedCost();
    }

    function enhancePrompt() {
      const prompt = document.getElementById("prompt");
      const text = prompt.value.trim();
      if (!text) return;
      if (/hook|mở đầu|trước sau|before/i.test(text)) {
        prompt.value = text + " Chia rõ 4 beat: 0-3s hook, 3-7s proof/demo, 7-12s transformation/result, 12-15s payoff ổn định. Giữ chuyển động tự nhiên, không chữ trên màn hình, audio có nhịp nhưng visual vẫn hiểu được nếu tắt tiếng.";
      } else {
        prompt.value = text + " Bổ sung hook trong 1 giây đầu, proof/demo ở giữa, payoff cuối rõ ràng, nhịp TikTok tự nhiên, không chữ trên màn hình, endpoint sạch để review hoặc nối cảnh.";
      }
      updatePromptCount();
    }

    function clearReferenceFields() {
      ["kol-reference", "product-reference", "wardrobe-reference", "background-reference", "first-frame-reference", "last-frame-reference", "reference-url", "media-reference-note"].forEach((id) => {
        document.getElementById(id).value = "";
      });
      showSuccess("Reference fields cleared.");
    }

    function updatePromptCount() {
      const count = document.getElementById("prompt").value.length;
      document.getElementById("prompt-count").textContent = String(count);
    }

    function updateEstimatedCost() {
      const seconds = Math.max(0, Number(document.getElementById("duration").value) || 0);
      const resolution = document.getElementById("seedance-resolution").value;
      const multiplier = resolution.includes("1080") ? 1.35 : resolution.includes("1440") ? 1.8 : resolution.includes("480") ? 0.72 : 1;
      const estimate = Math.max(0.4, seconds * 0.16 * multiplier);
      document.getElementById("estimated-cost").textContent = "$" + estimate.toFixed(2);
    }

    function pillClass(status) {
      if (status === "ready" || status === "approved" || status === "pass") return "ready";
      if (status === "needs_review" || status === "review_required" || status === "pending") return "warn";
      if (status === "blocked" || status === "fail" || status === "rejected") return "bad";
      if (status === "optional") return "teal";
      return "info";
    }

    function clearMessages() {
      const errorNode = document.getElementById("error");
      const successNode = document.getElementById("success");
      errorNode.textContent = "";
      successNode.textContent = "";
      errorNode.style.display = "none";
      successNode.style.display = "none";
    }

    function showError(message) {
      const node = document.getElementById("error");
      const successNode = document.getElementById("success");
      successNode.textContent = "";
      successNode.style.display = "none";
      node.textContent = message;
      node.style.display = "block";
    }

    function showSuccess(message) {
      const node = document.getElementById("success");
      const errorNode = document.getElementById("error");
      errorNode.textContent = "";
      errorNode.style.display = "none";
      node.textContent = message;
      node.style.display = "block";
    }

    function escapeHtml(value) {
      return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
    }

    function escapeAttribute(value) {
      return escapeHtml(value).replaceAll("\\", "\\\\");
    }
  </script>
</body>
</html>`;
}
