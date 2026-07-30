/**
 * First-party Short create/review page shell.
 * This page is intentionally static and credential-free: the served HTML never embeds a
 * secret. Clients paste their API key once; it is remembered per-machine in browser
 * localStorage (with a forget button for shared computers) and sent only on /v1 calls.
 */

import { productName, studioName } from "../config/product-identity.js";

export function buildShortPipelineCreatePage(options: { readonly supportContact?: string } = {}): string {
  // Product name comes from config so rebranding/white-labelling is a setting, not a code edit.
  const brand = productName().replace(/[<>"'&]/g, "");
  const brandStudio = studioName().replace(/[<>"'&]/g, "");
  // The support contact is shown on the LOGGED-OUT login modal (forgot-password recovery, MVP audit A2).
  // Escaped so an operator-configured value can never inject markup into the page.
  const supportContact = (options.supportContact ?? "").trim();
  const supportContactSafe = supportContact
    ? supportContact.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] ?? c))
    : "người bán (chủ hệ thống)";
  return String.raw`<!doctype html>
<html lang="vi">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex,nofollow">
  <title>${brandStudio}</title>
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
    .cj-modal { position: fixed; inset: 0; background: rgba(4, 6, 16, 0.72); display: flex; align-items: center; justify-content: center; z-index: 60; padding: 16px; }
    .cj-modal[hidden] { display: none; }
    .cj-modal-card { width: min(440px, 94vw); max-height: 88vh; overflow-y: auto; background: #10142a; border: 1px solid var(--line); border-radius: 12px; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .cj-modal-head { display: flex; justify-content: space-between; align-items: center; }
    .cj-tabs { display: flex; gap: 6px; }
    .cj-tab { flex: 1; min-height: 42px; border: 1px solid var(--line); background: transparent; color: var(--ink); border-radius: 8px; cursor: pointer; }
    .cj-tab.active { background: rgba(143, 92, 255, 0.25); border-color: rgba(143, 92, 255, 0.7); }
    .cj-primary { background: linear-gradient(135deg, rgba(143, 92, 255, 0.85), rgba(17, 183, 255, 0.75)); border: 0; min-height: 44px; font-weight: 600; cursor: pointer; border-radius: 8px; color: var(--ink); }
    .cj-packages { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .cj-package { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: rgba(255, 255, 255, 0.03); cursor: pointer; text-align: left; color: var(--ink); display: flex; flex-direction: column; gap: 4px; }
    .cj-package.selected { border-color: rgba(54, 242, 170, 0.8); background: rgba(54, 242, 170, 0.1); }
    .cj-package strong { font-size: 14px; }
    .cj-package small { color: #9aa3c7; font-size: 11px; }
    .cj-package.popular { border-color: rgba(244,184,77,.85); background: rgba(244,184,77,.10); }
    .cj-package .cj-badge { align-self: flex-start; font-size: 10px; font-weight: 700; color: #1a1400; background: #f4b84d; border-radius: 6px; padding: 2px 6px; margin-bottom: 2px; }
    .cj-package .cj-pervideo { color: #8fe3b0; font-weight: 600; }
    .cj-instructions { font-size: 12px; color: #9aa3c7; background: rgba(255, 255, 255, 0.04); border-radius: 8px; padding: 10px; white-space: pre-wrap; }
    .cj-modal-error { color: #ff7d8f; font-size: 12px; }
    .cj-topup-item { display: flex; justify-content: space-between; gap: 8px; font-size: 12px; padding: 6px 0; border-bottom: 1px dashed var(--line); }
    .cj-account-wrap { display: flex; align-items: center; gap: 8px; }
    .cj-account-wrap[hidden] { display: none; }
    .admin-key-wrap { display: flex; align-items: center; gap: 6px; }
    .admin-key-wrap[hidden] { display: none; }
    #credit-estimate { font-size: 12px; color: #9aa3c7; margin-top: 6px; }
    .cj-help { margin: 8px 0; border: 1px dashed rgba(255,255,255,.18); border-radius: 10px; padding: 6px 10px; background: rgba(255,255,255,.03); font-size: 12.5px; }
    .cj-help summary { cursor: pointer; color: #9fb0ff; font-weight: 600; }
    .cj-help p { margin: 6px 0 2px; color: #aab3d6; line-height: 1.5; }
    .cj-check { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; padding: 4px 8px; border: 1px solid rgba(255,255,255,.14); border-radius: 8px; cursor: pointer; }
    #lang-switch { background: rgba(255,255,255,.06); color: #cdd5f6; border: 1px solid rgba(255,255,255,.16); border-radius: 8px; padding: 4px 6px; font-size: 12px; }
    @media (max-width: 620px) {
      .cj-packages { grid-template-columns: 1fr; }
      .cj-modal-card { padding: 14px; }
      .upload-btn { min-height: 44px; }
      .cj-account-wrap { flex-wrap: wrap; }
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
    /* ---- Wizard: guided 3-step create flow ---- */
    .wizard-steps { display:flex; gap:8px; margin:4px 0 18px; }
    .wizard-steps .wstep { flex:1; display:flex; align-items:center; gap:8px; padding:10px 12px; border-radius:12px; background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); font-size:13px; color:rgba(232,236,255,.6); transition:all .2s; }
    .wizard-steps .wstep .wnum { display:flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:50%; background:rgba(255,255,255,.1); font-weight:700; font-size:12px; flex:0 0 auto; }
    .wizard-steps .wstep.active { background:linear-gradient(135deg, rgba(255,79,232,.22), rgba(17,183,255,.16)); border-color:rgba(143,92,255,.5); color:#fff; }
    .wizard-steps .wstep.active .wnum { background:linear-gradient(135deg,#ff4fe8,#8f5cff); color:#fff; }
    .wizard-steps .wstep.done .wnum { background:linear-gradient(135deg,#36f2aa,#11b7ff); color:#04122a; }
    .wizard-steps .wstep.done { color:rgba(232,236,255,.85); }
    .wizard-step { display:none; animation:wfade .25s ease; }
    .wizard-step.wizard-active { display:block; }
    @keyframes wfade { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:none; } }
    .wizard-nav { display:flex; gap:12px; align-items:center; margin-top:18px; padding-top:16px; border-top:1px solid rgba(255,255,255,.08); }
    .wizard-nav .spacer { flex:1; }
    .wizard-nav .primary { font-size:15px; padding:12px 22px; }
    .wizard-review { background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.08); border-radius:14px; padding:16px; }
    .wizard-review .rv-row { display:flex; justify-content:space-between; gap:12px; padding:8px 0; border-bottom:1px solid rgba(255,255,255,.05); font-size:14px; }
    .wizard-review .rv-row:last-child { border-bottom:0; }
    .wizard-review .rv-row .rv-k { color:rgba(232,236,255,.6); }
    .wizard-review .rv-row .rv-v { font-weight:600; text-align:right; }
    .wizard-price { display:flex; align-items:baseline; gap:10px; margin:14px 0; padding:14px 16px; border-radius:12px; background:linear-gradient(135deg, rgba(54,242,170,.12), rgba(17,183,255,.08)); border:1px solid rgba(54,242,170,.25); }
    .wizard-price .wp-amount { font-size:26px; font-weight:800; }
    .wizard-adv { margin-top:14px; }
    .wizard-adv > summary { cursor:pointer; font-size:13px; color:rgba(232,236,255,.6); padding:8px 0; }
    @media (max-width: 720px) { .wizard-steps { flex-direction:column; } .wizard-steps .wstep { font-size:12px; } }
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
          <div class="brand-name">${brand}</div>
          <div class="brand-sub">Studio</div>
        </div>
      </div>
      <div class="nav-section">Sáng tạo</div>
      <button class="nav-item active" type="button" data-mode-button="short_video"><span class="nav-ico">◇</span><span>Video ngắn</span></button>
      <button class="nav-item" type="button" data-mode-button="video_remake"><span class="nav-ico">↻</span><span>Làm lại video</span></button>
      <button class="nav-item" type="button" data-mode-button="product_kol_ugc"><span class="nav-ico">□</span><span>Quảng cáo UGC</span></button>
      <button class="nav-item" type="button" data-mode-button="storyboard_multishot"><span class="nav-ico">▣</span><span>Bối cảnh sản phẩm</span></button>
      <button class="nav-item" type="button" data-mode-button="production_bible"><span class="nav-ico">▤</span><span>Phim dài (Đạo diễn)</span></button>
      <div class="nav-section">Điều khiển</div>
      <button class="nav-item" type="button" id="nav-jobs"><span class="nav-ico">▥</span><span>Video của tôi</span></button>
      <div class="sidebar-card">
        <strong>Bảng dự án</strong>
        <div class="detail">Trạng thái <span id="side-status">chờ</span></div>
        <div class="meter"><span></span></div>
        <div class="detail">Cảnh <span id="side-scenes">0</span> | Đang chờ <span id="side-pending">0</span></div>
        <div class="detail">Kết nối render <span id="side-provider">khoá</span></div>
      </div>
      <div class="sidebar-bottom"><span>⚙</span><span>?</span><span>↗</span></div>
    </aside>
    <main class="main-shell">
      <form class="topbar" id="auth-form">
        <div class="top-chip">
          <div class="pill info">Credits</div>
          <div><small data-i18n="top.balance">Số dư</small><strong id="balance-status">—</strong></div>
        </div>
        <div class="top-chip">
          <div class="pill warn">Queue</div>
          <div><small data-i18n="top.queue">Hàng chờ render</small><strong id="queue-status" data-i18n="top.queueReady">Sẵn sàng</strong></div>
        </div>
        <button type="button" id="open-jobs-top" class="mini-btn" title="Video của tôi">🎬 Video</button>
        <button type="button" id="open-redub-top" class="mini-btn" data-i18n-title="top.redubTitle" title="Xuất phụ đề đa ngữ + kịch bản lồng tiếng từ video có sẵn">🌐 Phụ đề+</button>
        <button type="button" id="open-auth" class="mini-btn" data-i18n="top.login">Đăng nhập / Đăng ký</button>
        <span class="cj-account-wrap" id="account-wrap" hidden>
          <span class="pill info" id="account-name"></span>
          <button type="button" id="open-topup" class="mini-btn" data-i18n="top.topup">💎 Nạp credits</button>
          <button type="button" id="open-change-password" class="ghost-btn" title="Đổi mật khẩu">🔑</button>
          <button type="button" id="logout-btn" class="ghost-btn" title="Đăng xuất" data-i18n="top.logout">Thoát</button>
        </span>
        <span class="admin-key-wrap" id="admin-key-wrap" hidden>
          <input class="api-key" id="api-key" type="password" autocomplete="off" placeholder="API key quản trị (chỉ dành cho chủ hệ thống)" aria-label="Admin API key" title="Chỉ dành cho quản trị viên. Khách hàng đăng nhập bằng tài khoản.">
          <button type="button" id="forget-api-key" class="ghost-btn" title="Xoá key đã nhớ trên máy này" aria-label="Xoá key đã nhớ">✕</button>
        </span>
        <select id="lang-switch" title="Ngôn ngữ / Language / 语言" aria-label="Language"><option value="vi">VI</option><option value="en">EN</option><option value="zh">中文</option></select>
        <button type="button" id="toggle-admin-key" class="ghost-btn" title="Chế độ quản trị viên">⚙</button>
        <button type="submit" id="load-sessions" class="ghost-btn">Sessions</button>
      </form>
      <div class="cj-modal" id="auth-modal" hidden>
        <div class="cj-modal-card">
          <div class="cj-modal-head"><strong id="auth-title" data-i18n="auth.login">Đăng nhập</strong><button type="button" class="ghost-btn" data-close-modal="auth-modal">✕</button></div>
          <div class="cj-tabs">
            <button type="button" class="cj-tab active" id="tab-login" data-i18n="auth.login">Đăng nhập</button>
            <button type="button" class="cj-tab" id="tab-register" data-i18n="auth.register">Tạo tài khoản</button>
          </div>
          <label class="field"><span>Email</span><input id="auth-email" type="email" autocomplete="email" placeholder="ban@email.com"></label>
          <label class="field"><span data-i18n="auth.password">Mật khẩu</span><input id="auth-password" type="password" autocomplete="current-password" data-i18n-placeholder="auth.pwPh" placeholder="Tối thiểu 8 ký tự"></label>
          <label class="field" id="auth-name-field" hidden><span data-i18n="auth.name">Tên hiển thị (tuỳ chọn)</span><input id="auth-display-name" placeholder="Tên của bạn"></label>
          <div class="cj-modal-error" id="auth-error" hidden></div>
          <button type="button" class="cj-primary" id="auth-submit" data-i18n="auth.login">Đăng nhập</button>
          <small style="color:#9aa3c7" data-i18n="auth.note">Tạo tài khoản miễn phí, nạp credits là tạo được video ngay. Không cần API key.</small>
          <small style="color:#9aa3c7;display:block;margin-top:6px" id="auth-forgot"><span data-i18n="auth.forgot">Quên mật khẩu? Liên hệ hỗ trợ để được cấp lại:</span> <b id="auth-support">__SUPPORT_CONTACT__</b></small>
        </div>
      </div>
      <div class="cj-modal" id="password-modal" hidden>
        <div class="cj-modal-card">
          <div class="cj-modal-head"><strong data-i18n="pw.title">🔑 Đổi mật khẩu</strong><button type="button" class="ghost-btn" data-close-modal="password-modal">✕</button></div>
          <label class="field"><span data-i18n="pw.current">Mật khẩu hiện tại</span><input id="current-password" type="password" autocomplete="current-password"></label>
          <label class="field"><span data-i18n="pw.new">Mật khẩu mới (tối thiểu 8 ký tự)</span><input id="new-password" type="password" autocomplete="new-password"></label>
          <div class="cj-modal-error" id="password-error" hidden></div>
          <button type="button" class="cj-primary" id="password-submit" data-i18n="pw.submit">Đổi mật khẩu</button>
          <small style="color:#9aa3c7" data-i18n="pw.note">Sau khi đổi, các thiết bị khác sẽ phải đăng nhập lại. Quên mật khẩu? Liên hệ hỗ trợ để được cấp lại.</small>
        </div>
      </div>
      <div class="cj-modal" id="topup-modal" hidden>
        <div class="cj-modal-card">
          <div class="cj-modal-head"><strong data-i18n="tu.title">💎 Nạp credits</strong><button type="button" class="ghost-btn" data-close-modal="topup-modal">✕</button></div>
          <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="help.topup">Chọn gói → chuyển khoản đúng nội dung hiển thị → bấm nút xác nhận. Quản trị viên duyệt là credits vào tài khoản (thường vài phút). Lỡ gửi trùng sẽ tự gộp, không mất tiền hai lần.</p></details>
          <div class="cj-packages" id="package-grid"></div>
          <div class="cj-instructions" id="topup-instructions"></div>
          <label class="field"><span data-i18n="tu.note">Ghi chú chuyển khoản (tuỳ chọn)</span><input id="topup-note" data-i18n-placeholder="tu.notePh" placeholder="VD: đã CK 10:30 từ STK ...901"></label>
          <button type="button" class="cj-primary" id="topup-submit" disabled data-i18n="tu.submit">Tôi đã chuyển khoản — gửi yêu cầu duyệt</button>
          <div id="my-topups"></div>
          <div style="margin-top:12px;border-top:1px solid rgba(255,255,255,.12);padding-top:10px">
            <strong data-i18n="tu.history" style="font-size:13px">📜 Lịch sử giao dịch credits</strong>
            <div id="my-statement" style="margin-top:6px"></div>
          </div>
        </div>
      </div>
      <div class="cj-modal" id="redub-modal" hidden>
        <div class="cj-modal-card">
          <div class="cj-modal-head"><strong data-i18n="redub.title">🌐 Phụ đề đa ngữ + Kịch bản lồng tiếng</strong><button type="button" class="ghost-btn" data-close-modal="redub-modal">✕</button></div>
          <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="help.redub">Chọn video (tải từ máy bằng 📁, hoặc bấm 🌐 trên video đã render). Chọn ngôn ngữ. Hệ thống nghe → dịch → và khi bật '🔊 Lồng tiếng tự động' sẽ ĐỌC GIỌNG AI + TRỘN thẳng vào video, trả về file dubbed.mp4 kèm phụ đề .srt từng ngôn ngữ và kịch bản thuyết minh. Tiếng gốc được hạ nhỏ dưới giọng đọc (kiểu review phim) hoặc thay hẳn — chọn ở ô 'Âm thanh gốc'. Bỏ chọn lồng tiếng nếu chỉ cần phụ đề + kịch bản (rẻ hơn).</p></details>
          <label class="field"><span data-i18n="redub.source">Video nguồn</span><div class="field-row"><input id="redub-source" data-i18n-placeholder="redub.sourcePh" placeholder="Bấm 📁 để tải video lên, hoặc nút 🌐 trên video đã render" readonly><button type="button" class="upload-btn" data-upload-for="redub-source" data-upload-accept="video/mp4,video/quicktime,audio/mpeg,audio/wav" title="Tải video/audio từ máy">📁</button></div></label>
          <div id="redub-job-line" class="detail" hidden></div>
          <div class="grid-2">
            <label class="field"><span data-i18n="redub.srcLang">Ngôn ngữ gốc</span>
              <select id="redub-source-language">
                <option value="auto" data-i18n="redub.auto">Tự nhận diện</option>
                <option value="zh">中文</option>
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
              </select>
            </label>
            <label class="field"><span data-i18n="redub.dubLang">Thuyết minh sang</span>
              <select id="redub-dub-language">
                <option value="vi">Tiếng Việt</option>
                <option value="en">English</option>
                <option value="zh">中文</option>
                <option value="ja">日本語</option>
                <option value="ko">한국어</option>
              </select>
            </label>
          </div>
          <label class="field"><span data-i18n="redub.subs">Phụ đề xuất thêm (chọn nhiều)</span></label>
          <div class="field-row" id="redub-subtitle-langs" style="flex-wrap:wrap">
            <label class="cj-check"><input type="checkbox" value="vi" checked>VI</label>
            <label class="cj-check"><input type="checkbox" value="en" checked>EN</label>
            <label class="cj-check"><input type="checkbox" value="zh">中文</label>
            <label class="cj-check"><input type="checkbox" value="ja">日本</label>
            <label class="cj-check"><input type="checkbox" value="ko">한국</label>
          </div>
          <label class="field"><span data-i18n="redub.voice">Kiểu giọng thuyết minh (tuỳ chọn)</span><input id="redub-voice-style" data-i18n-placeholder="redub.voicePh" placeholder="VD: giọng nữ review ấm áp, tự nhiên"></label>
          <label class="field"><span data-i18n="redub.mix">Âm thanh gốc</span>
            <select id="redub-audio-treatment">
              <option value="duck_under_dub" data-i18n="redub.mixDuck">Giữ nhạc nền, hạ nhỏ khi thuyết minh</option>
              <option value="replace" data-i18n="redub.mixReplace">Thay hẳn bằng thuyết minh mới</option>
            </select>
          </label>
          <label class="cj-check" style="margin-top:6px"><input type="checkbox" id="redub-render-video" checked><span data-i18n="redub.renderVideo">🔊 Lồng tiếng tự động vào video (nhận file dubbed.mp4)</span></label>
          <div class="detail" data-i18n="redub.renderVideoHint">Bỏ chọn nếu chỉ cần phụ đề + kịch bản (rẻ hơn). Khi chọn, giọng AI tiếng Việt đọc thuyết minh và trộn thẳng vào video.</div>
          <div class="detail" id="redub-price-line"></div>
          <div class="cj-modal-error" id="redub-error" hidden></div>
          <button type="button" class="cj-primary" id="redub-run" data-i18n="redub.run">🌐 Dịch &amp; tạo phụ đề</button>
          <div id="redub-result" style="margin-top:10px"></div>
        </div>
      </div>
      <nav class="template-tabs" id="main-nav" style="margin:10px 0 2px;flex-wrap:wrap" aria-label="Điều hướng sản phẩm">
        <button class="template-tab active" type="button" id="nav-create" data-i18n="nav.create">🎬 Tạo video AI</button>
        <button class="template-tab" type="button" id="nav-series" data-i18n="nav.series">📺 Phim dài tập</button>
        <button class="template-tab" type="button" id="nav-dub" data-i18n="nav.dub">🌐 Lồng tiếng &amp; Phụ đề</button>
        <button class="template-tab" type="button" id="nav-mine" data-i18n="nav.mine">📁 Video của tôi</button>
      </nav>
      <section class="hero">
        <div>
          <div id="studio-announcement-banner" hidden style="margin-bottom:10px;padding:10px 14px;border-radius:10px;background:rgba(143,92,255,.16);border:1px solid rgba(143,92,255,.4);font-size:13px"></div>
          <h1 data-i18n="hero.h1">Create AI Video</h1>
          <span class="visually-hidden">Create Short</span>
          <span class="visually-hidden">Video Remake</span>
          <span class="visually-hidden">Creative Ideas</span>
          <div class="eyebrow" data-i18n="hero.eyebrow">Describe the idea, add references, choose a production pattern, then let ${brand} build the script, storyboard, prompt, review packet, and render handoff.</div>
        </div>
        <div class="session-line" id="session-line" data-i18n="hero.noSession">No session loaded.</div>
      </section>
      <div class="error" id="error"></div>
      <div class="success" id="success"></div>
      <section class="workspace">
        <form class="panel composer" id="brief-form">
          <div class="mode-tabs" aria-label="Create mode">
            <button class="mode-btn active" type="button" data-mode-button="short_video" data-i18n="mode.short">Short</button>
            <button class="mode-btn" type="button" data-mode-button="video_remake" data-i18n="mode.remake">Remake</button>
            <button class="mode-btn" type="button" data-mode-button="product_kol_ugc" data-i18n="mode.ugc">UGC</button>
            <button class="mode-btn" type="button" data-mode-button="production_bible" data-i18n="mode.long">Long</button>
          </div>
          <input id="workflow-mode" class="visually-hidden" value="short_video">
          <div class="wizard-steps" id="wizard-steps">
            <div class="wstep active" data-wstep="1"><span class="wnum">1</span><span data-i18n="wz.s1">Ý tưởng</span></div>
            <div class="wstep" data-wstep="2"><span class="wnum">2</span><span data-i18n="wz.s2">Hình ảnh &amp; tuỳ chọn</span></div>
            <div class="wstep" data-wstep="3"><span class="wnum">3</span><span data-i18n="wz.s3">Xem lại &amp; tạo</span></div>
          </div>
          <div class="wizard-step wizard-active" data-step="1">
          <div class="section-divider"></div>
          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">1</span><span data-i18n="s1.title">Tell ${brand} your idea</span></div>
            <button class="mini-btn" type="button" data-enhance-prompt data-i18n="s1.enhance">✨ Thêm cấu trúc 4 nhịp</button>
          </div>
          <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="help.idea">Viết như kể cho một người bạn: bán gì / cho ai / video trông thế nào / cú chốt là gì. Càng cụ thể sản phẩm + cảm xúc, video càng dễ viral. Viết tiếng Việt, Trung hay Anh đều được.</p></details>
          <label class="field">
            <span data-i18n="s1.brief">Creative brief</span>
            <textarea class="prompt-box" id="prompt" wrap="soft" data-i18n-placeholder="s1.briefPh" placeholder="Describe the actual video you want to create. Example: niche, product, KOL/person, source-video structure, duration, language, tone, proof, and final payoff."></textarea>
          </label>
          <div class="composer-tools">
            <div class="tool-row">
              <button class="mini-btn" type="button" data-template-apply="fashion_transform" data-i18n="s1.starter">Starter</button>
              <button class="mini-btn" type="button" data-enhance-prompt data-i18n="s1.rewrite">Thêm cấu trúc</button>
              <button class="mini-btn" type="button" data-template-apply="product_reveal" data-i18n="s1.productStarter">Product Starter</button>
            </div>
            <div class="char-count"><span id="prompt-count">0</span> / 2000</div>
          </div>

          </div><!-- /wizard-step 1 -->
          <div class="wizard-step" data-step="2">
          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">2</span><span data-i18n="s2.title">Add references</span></div>
            <button class="mini-btn" type="button" id="clear-reference-fields" data-i18n="s2.clear">Clear</button>
          </div>
          <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="help.ref">Ảnh KOL = khoá gương mặt; ảnh sản phẩm = khoá sản phẩm; ảnh bối cảnh = khoá không gian; video mẫu = chỉ học cấu trúc nhịp (không sao chép nội dung). Bấm 📁 để tải từ điện thoại/máy tính — hệ thống tự điền, không cần link.</p></details>
          <div class="asset-grid">
            <button class="asset-card" type="button" data-focus-reference="kol-reference" style="--asset-img:linear-gradient(135deg, rgba(255,79,232,.34), rgba(17,183,255,.18))">
              <div><strong data-i18n="s2.kol">KOL / Talent</strong><small data-i18n="s2.imgRef">image reference</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="product-reference" style="--asset-img:linear-gradient(135deg, rgba(54,242,170,.32), rgba(143,92,255,.2))">
              <div><strong data-i18n="s2.product">Product</strong><small data-i18n="s2.imgRef">image reference</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="background-reference" style="--asset-img:linear-gradient(135deg, rgba(244,184,77,.28), rgba(17,183,255,.18))">
              <div><strong data-i18n="s2.scene">Scene</strong><small data-i18n="s2.bg">background</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="reference-url" style="--asset-img:linear-gradient(135deg, rgba(143,92,255,.34), rgba(255,91,114,.18))">
              <div><strong data-i18n="s2.source">Source Video</strong><small data-i18n="s2.pattern">pattern intake</small></div>
            </button>
            <button class="asset-card" type="button" data-focus-reference="media-reference-note" style="--asset-img:linear-gradient(135deg, rgba(255,79,232,.28), rgba(17,183,255,.18))">
              <div><strong data-i18n="s2.voice">Voice / Notes</strong><small data-i18n="s2.voiceS">audio intent</small></div>
            </button>
          </div>
          <input type="file" id="upload-file-input" style="display:none" aria-hidden="true">
          <div class="grid-2" style="margin-top:12px">
            <label class="field"><span data-i18n="s2.kolUri">KOL image URI</span><div class="field-row"><input id="kol-reference" placeholder="asset://kol-main, https://... — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="kol-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy" data-i18n="s2.upload">📁 Tải lên</button></div></label>
            <label class="field"><span data-i18n="s2.productUri">Product image URI</span><div class="field-row"><input id="product-reference" placeholder="asset://product-pack, https://... — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="product-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy" data-i18n="s2.upload">📁 Tải lên</button></div></label>
            <label class="field"><span data-i18n="s2.bgUri">Scene/background URI</span><div class="field-row"><input id="background-reference" placeholder="asset://studio-set, https://... — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="background-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy" data-i18n="s2.upload">📁 Tải lên</button></div></label>
            <label class="field"><span data-i18n="s2.srcUrl">Source video URL</span><div class="field-row"><input id="reference-url" placeholder="https://reference-video.example — hoặc bấm Tải lên"><button type="button" class="upload-btn" data-upload-for="reference-url" data-upload-accept="video/mp4,video/quicktime" title="Tải video từ máy" data-i18n="s2.upload">📁 Tải lên</button></div></label>
            <label class="field" style="grid-column: 1 / -1"><span data-i18n="s2.note">Reference / voice note</span><input id="media-reference-note" data-i18n-placeholder="s2.notePh" placeholder="What to preserve from the attached media, source video, or voice direction"></label>
          </div>
          <div class="grid-2" style="margin-top:12px">
            <label class="field"><span data-i18n="s2.wardrobe">Wardrobe reference</span><div class="field-row"><input id="wardrobe-reference" placeholder="asset://outfit or https://..."><button type="button" class="upload-btn" data-upload-for="wardrobe-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁</button></div></label>
            <label class="field"><span data-i18n="s2.first">First frame</span><div class="field-row"><input id="first-frame-reference" placeholder="asset://opening-frame or https://..."><button type="button" class="upload-btn" data-upload-for="first-frame-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁</button></div></label>
            <label class="field"><span data-i18n="s2.last">Last frame</span><div class="field-row"><input id="last-frame-reference" placeholder="asset://final-frame or https://..."><button type="button" class="upload-btn" data-upload-for="last-frame-reference" data-upload-accept="image/png,image/jpeg,image/webp" title="Tải ảnh từ máy">📁</button></div></label>
            <label class="field"><span data-i18n="s2.rights">Media rights</span>
              <select id="media-rights">
                <option value="operator_approved" data-i18n="s2.rightsOk">Operator approved</option>
                <option value="needs_review" data-i18n="s2.rightsReview">Needs review</option>
                <option value="unknown" data-i18n="s2.rightsUnknown">Unknown</option>
              </select>
            </label>
          </div>

          <div class="section-divider"></div>
          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">3</span><span data-i18n="s3.title">Source pattern intake</span></div>
            <button class="mini-btn" type="button" data-mode-button="video_remake" data-i18n="s3.useRemake">Use Remake Mode</button>
          </div>
          <div class="grid-3">
            <label class="field"><span data-i18n="s3.srcPlatform">Source platform</span>
              <select id="template-source-platform">
                <option value="internal" data-i18n="s3.pInternal">${brand} internal</option>
                <option value="reference_tool_motion" data-i18n="s3.pMotion">Reference-tool motion inspiration</option>
                <option value="reference_tool_ads" data-i18n="s3.pAds">Reference-tool ad inspiration</option>
                <option value="tiktok">TikTok / Douyin / Reels</option>
                <option value="custom" data-i18n="s3.pCustom">Custom</option>
              </select>
            </label>
            <label class="field"><span data-i18n="s3.learning">Learning policy</span>
              <select id="reference-rights">
                <option value="structure_only" data-i18n="s3.structOnly">Structure and rhythm only</option>
                <option value="rights_cleared_close_remake" data-i18n="s3.closeRemake">Rights-cleared close remake</option>
              </select>
            </label>
            <label class="field"><span data-i18n="s3.platform">Platform</span>
              <select id="platform">
                <option value="tiktok">TikTok</option>
                <option value="douyin">Douyin</option>
                <option value="instagram_reels">Instagram Reels</option>
                <option value="youtube_shorts">YouTube Shorts</option>
                <option value="unknown" data-i18n="s3.flexible">Flexible</option>
              </select>
            </label>
          </div>
          <label class="field" style="margin-top:12px">
            <span data-i18n="s3.summary">Source pattern summary</span>
            <textarea id="reference-summary" wrap="soft" data-i18n-placeholder="s3.summaryPh" placeholder="Paste the public pattern/video structure: hook, pacing, acting beats, camera style, edit rhythm, audio rhythm, and payoff. ${brand} will adapt the structure to your own KOL, product, and background."></textarea>
          </label>

          <div class="section-divider"></div>
          <div class="panel-head">
            <div class="panel-title"><span class="step-badge">4</span><span data-i18n="s4.title">Khung nhịp mẫu</span></div>
            <button class="mini-btn" type="button" id="refresh-contract" disabled data-i18n="s4.refresh">Refresh Contract</button>
          </div>
          <div class="storyboard">
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(255,79,232,.26), rgba(17,183,255,.1))"></div>
              <div class="beat-body"><div class="beat-title"><span data-i18n="s4.b1">1 Hook</span><span>0-3s</span></div><div class="beat-note" data-i18n="s4.b1n">Problem / before state</div></div>
            </div>
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(54,242,170,.22), rgba(255,255,255,.08))"></div>
              <div class="beat-body"><div class="beat-title"><span data-i18n="s4.b2">2 Proof</span><span>3-7s</span></div><div class="beat-note" data-i18n="s4.b2n">Product / action</div></div>
            </div>
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(143,92,255,.28), rgba(255,79,232,.12))"></div>
              <div class="beat-body"><div class="beat-title"><span data-i18n="s4.b3">3 Transform</span><span>7-12s</span></div><div class="beat-note" data-i18n="s4.b3n">Change / result</div></div>
            </div>
            <div class="beat-card">
              <div class="beat-img" style="--beat-img:linear-gradient(135deg, rgba(244,184,77,.24), rgba(17,183,255,.14))"></div>
              <div class="beat-body"><div class="beat-title"><span data-i18n="s4.b4">4 Payoff</span><span>12-15s</span></div><div class="beat-note" data-i18n="s4.b4n">After / CTA soft</div></div>
            </div>
          </div>

          <div class="section-divider"></div>
          <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="help.settings">Thời lượng × chất lượng quyết định giá credits (hiện ngay dưới nút tạo). 9:16 cho TikTok/Reels. "Giọng đọc" chọn ngôn ngữ thuyết minh; phụ đề bật ở bước cuối.</p></details>
          <div class="settings-bar">
            <label class="field"><span data-i18n="set.styleRegister">Phong cách</span>
              <select id="style-register">
                <option value="auto" selected data-i18n="style.auto">Tự động (AI chọn)</option>
                <option value="ugc" data-i18n="style.ugc">📱 Tự nhiên như người quay</option>
                <option value="cinematic" data-i18n="style.cinematic">🎬 Điện ảnh</option>
                <option value="story" data-i18n="style.story">📖 Kể chuyện</option>
                <option value="demo" data-i18n="style.demo">🔧 Demo sản phẩm</option>
                <option value="education" data-i18n="style.education">🎓 Hướng dẫn</option>
              </select>
            </label>
            <label class="field"><span data-i18n="set.duration">Duration</span><input id="duration" type="number" min="15" max="480" value="15"></label>
            <label class="field"><span data-i18n="set.aspect">Aspect ratio</span><select id="aspect-ratio"><option value="9:16" selected>9:16</option><option value="16:9">16:9</option><option value="1:1">1:1</option></select></label>
            <label class="field"><span data-i18n="set.quality">Quality / model</span>
              <select id="seedance-resolution">
                <option value="720p" selected>720p</option>
                <option value="720p-SR">720p SR</option>
                <option value="480p">480p</option>
                <option value="1080p">1080p</option>
                <option value="1080p-SR">1080p SR</option>
                <option value="1440p-SR">1440p SR</option>
              </select>
            </label>
            <label class="field"><span data-i18n="set.audio">Audio</span>
              <select id="audio">
                <option value="vi" selected data-i18n="set.audioVi">Vietnamese VO</option>
                <option value="en" data-i18n="set.audioEn">English VO</option>
                <option value="zh" data-i18n="set.audioZh">Chinese VO</option>
                <option value="off" data-i18n="set.audioOff">Off</option>
              </select>
            </label>
          </div>
          <div class="grid-3" style="margin-top:12px">
            <label class="field"><span>Bitrate</span><select id="seedance-bitrate"><option value="high" selected data-i18n="set.bitHigh">High</option><option value="standard" data-i18n="set.bitStd">Standard</option></select></label>
            <label class="field"><span data-i18n="set.lastFrame">Last frame</span><select id="return-last-frame"><option value="auto" selected data-i18n="set.auto">Auto</option><option value="true" data-i18n="set.on">On</option><option value="false" data-i18n="set.off">Off</option></select></label>
            <label class="field"><span data-i18n="set.product">Product</span><input id="product-title" data-i18n-placeholder="set.productPh" placeholder="Your real product, service, channel, or story subject"></label>
            <label class="field"><span data-i18n="set.category">Category</span><input id="category" data-i18n-placeholder="set.categoryPh" placeholder="beauty, fashion, SaaS, food, education..."></label>
            <label class="field" style="grid-column: span 2"><span data-i18n="set.claim">Allowed claim</span><input id="claim" data-i18n-placeholder="set.claimPh" placeholder="Only claims you can approve or substantiate"></label>
            <label class="field"><span data-i18n="set.renderPasses">Chất lượng render</span>
              <select id="quality-mode">
                <option value="economy" selected data-i18n="q.economy">Tiết kiệm — render 1 bản (rẻ nhất)</option>
                <option value="standard" data-i18n="q.standard">Chuẩn — 2 bản, AI chọn bản đẹp hơn</option>
                <option value="high" data-i18n="q.high">Cao — 3 bản + sửa lỗi, AI chọn bản tốt nhất</option>
                <option value="ultimate" data-i18n="q.ultimate">Tối đa — 4 bản + sửa kỹ (đắt nhất)</option>
              </select>
            </label>
            <label class="field"><span data-i18n="set.channelStyle">Phong cách kênh (tuỳ chọn)</span>
              <select id="channel-style"><option value="" data-i18n="cs.none">— Không dùng —</option></select>
            </label>
            <label class="field visually-hidden"><span>Project ID</span><input id="project-id" value="short_create_shell"></label>
          </div>
          <div class="render-bar">
            <div class="cost-card" id="usd-cost-card" title="Con số tham khảo nhanh — giá CHÍNH XÁC bằng credits sẽ hiện ở hộp xác nhận trước khi trừ tiền."><small data-i18n="s2.costRough">Ước tính sơ bộ (giá thật hiện khi xác nhận)</small><strong id="estimated-cost">$2.40</strong></div>
            <div id="credit-estimate-inline" class="detail"></div>
            <button type="submit" id="create-session" class="primary" data-i18n="wz.buildPlan">Xem giá &amp; kế hoạch →</button>
          </div>
          </div><!-- /wizard-step 2 -->
          <div class="wizard-step" data-step="3">
          <div class="panel-head"><div class="panel-title"><span class="step-badge">✓</span><span data-i18n="wz.reviewTitle">Xem lại &amp; tạo video</span></div></div>
          <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="wz.reviewHelp">Kiểm lại tóm tắt kế hoạch và giá credits bên dưới. Bấm "🎬 Tạo video" là hệ thống trừ credits và bắt đầu dựng video (đủ credit sẽ chạy ngay). Muốn sửa thì Quay lại.</p></details>
          <div class="wizard-review" id="wizard-review"><div class="detail" data-i18n="wz.reviewEmpty">Bấm "Xem giá & kế hoạch" ở bước trước để tạo kế hoạch.</div></div>
          <div class="wizard-price" id="wizard-price" hidden><span class="wp-amount" id="wizard-price-amount">—</span><span class="detail" id="wizard-price-note"></span></div>
          <label class="detail" for="caption-toggle-wz" style="display:flex;gap:8px;align-items:center;margin-top:10px;cursor:pointer"><input type="checkbox" id="caption-toggle-wz"><span data-i18n="ap.captions">Phụ đề tự động từ voice (khớp kịch bản, không tốn thêm)</span></label>
          </div><!-- /wizard-step 3 -->
          <div class="wizard-nav" id="wizard-nav">
            <button class="ghost-btn" type="button" id="wz-back" data-i18n="wz.back" hidden>← Quay lại</button>
            <div class="spacer"></div>
            <button class="primary" type="button" id="wz-next" data-i18n="wz.next">Tiếp →</button>
            <button class="primary" type="button" id="wz-create" data-i18n="wz.create" hidden>🎬 Tạo video</button>
          </div>
          <div class="muted" style="font-size:11px;margin-top:6px"><a href="/terms" target="_blank" rel="noopener">Điều khoản sử dụng &amp; chính sách hoàn credits</a></div>
          <div class="muted" style="font-size:11px;margin-top:6px" data-i18n="wz.acceptableUse">Bằng việc tạo video, bạn xác nhận nội dung KHÔNG vi phạm pháp luật hoặc chính sách (cấm nội dung tình dục trẻ em, khiêu dâm, bạo lực đẫm máu, khủng bố, hàng cấm). Yêu cầu vi phạm sẽ bị từ chối.</div>
        </form>

        <section class="right-stack">
          <div class="tabs-shell">
            <div class="template-tabs">
              <button class="template-tab active" type="button" id="tab-starters" data-i18n="rs.starters">Pattern Starters</button>
              <button class="template-tab" type="button" id="tab-mine" data-i18n="rs.mine">My Creations</button>
              <button class="template-tab" type="button" id="tab-history" data-i18n="rs.history">History</button>
            </div>
            <button class="ghost-btn" type="button" id="prepare-approval" disabled>Prepare Packet</button>
          </div>
          <div class="panel gallery">
            <div class="gallery-head">
              <div class="panel-title" data-i18n="rs.starters">Pattern Starters</div>
              <div class="template-tabs" id="template-filter-tabs">
                <button class="template-tab active" type="button" data-template-filter="all">All</button>
                <button class="template-tab" type="button" data-template-filter="ugc">UGC</button>
                <button class="template-tab" type="button" data-template-filter="fashion">Fashion</button>
                <button class="template-tab" type="button" data-template-filter="product">Product</button>
              </div>
            </div>
            <div class="template-grid">
              <button class="template-card" type="button" data-template-apply="fashion_transform" data-category="fashion">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(255,79,232,.32), rgba(17,183,255,.14))"><div class="template-tags"><span class="tag">Hot</span><span class="tag">15s</span></div></div>
                <div class="template-body"><div class="template-name">Fashion Transformation</div><div class="template-meta">Before/After | UGC Style</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="skincare_ugc" data-category="ugc">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(54,242,170,.28), rgba(255,79,232,.12))"><div class="template-tags"><span class="tag">Trending</span><span class="tag">20s</span></div></div>
                <div class="template-body"><div class="template-name">Skincare UGC Review</div><div class="template-meta">Beauty | Proof-led</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="streetwear_reveal" data-category="fashion">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(143,92,255,.3), rgba(17,183,255,.14))"><div class="template-tags"><span class="tag">New</span><span class="tag">12s</span></div></div>
                <div class="template-body"><div class="template-name">Streetwear Reveal</div><div class="template-meta">Trend | Fast cuts</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="breaking_news_ad" data-category="ugc">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(244,184,77,.3), rgba(255,91,114,.16))"><div class="template-tags"><span class="tag">Viral</span><span class="tag">15s</span></div></div>
                <div class="template-body"><div class="template-name">Breaking News Ad</div><div class="template-meta">News hook | Product angle</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="product_reveal" data-category="product">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(17,183,255,.3), rgba(54,242,170,.14))"><div class="template-tags"><span class="tag">Popular</span><span class="tag">15s</span></div></div>
                <div class="template-body"><div class="template-name">Product Unboxing</div><div class="template-meta">Ecommerce | Reveal</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="cinematic_story" data-category="product">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(143,92,255,.32), rgba(244,184,77,.14))"><div class="template-tags"><span class="tag">Cinematic</span><span class="tag">30s</span></div></div>
                <div class="template-body"><div class="template-name">Cinematic Short Story</div><div class="template-meta">Film look | Emotional payoff</div></div>
              </button>
              <button class="template-card" type="button" data-template-apply="production_bible_story" data-category="product">
                <div class="template-img" style="--template-img:linear-gradient(135deg, rgba(255,79,232,.24), rgba(244,184,77,.16))"><div class="template-tags"><span class="tag">Series</span><span class="tag">90s</span></div></div>
                <div class="template-body"><div class="template-name">Production Bible Sequence</div><div class="template-meta">Long sequence | Consistent identity</div></div>
              </button>
            </div>
          </div>
          <div class="panel gallery">
            <div class="panel-head"><div class="panel-title" data-i18n="rs.quick">Quick Controls</div></div>
            <div class="tips">
              <div class="tip"><strong data-i18n="rs.tip1">Clear idea</strong><span data-i18n="rs.tip1b">Prompt becomes script and storyboard evidence.</span></div>
              <div class="tip"><strong data-i18n="rs.tip2">Add references</strong><span data-i18n="rs.tip2b">KOL, product, scene, source video.</span></div>
              <div class="tip"><strong data-i18n="rs.tip3">Budget guard</strong><span data-i18n="rs.tip3b">No provider spend before approval.</span></div>
              <div class="tip"><strong data-i18n="rs.tip4">Review packet</strong><span data-i18n="rs.tip4b">One clean pre-render handoff.</span></div>
            </div>
          </div>
          <div class="panel gallery">
            <div class="panel-head"><div class="panel-title" data-i18n="rs.recent">Recent Sessions</div></div>
            <div class="list" id="sessions"><div class="empty" data-i18n="rs.noSessions">No sessions loaded.</div></div>
          </div>
        </section>
      </section>

      <section class="contract-grid" aria-label="Backend contract">
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.review">Review Checkpoints</div><span class="pill" id="metric-review">--</span></div>
          <div class="detail" id="metric-checkpoints">checkpoints</div>
          <div class="list" id="review-checkpoints"><div class="empty" data-i18n="cg.empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.routing">Seedance Routing</div><span class="pill info" id="metric-provider">Locked</span></div>
          <div class="detail"><span id="metric-workflow">--</span> | <span id="metric-duration">duration</span> | audio <span id="metric-audio">--</span></div>
          <div class="list" id="seedance-routing"><div class="empty" data-i18n="cg.empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.media">Media References</div></div>
          <div class="list" id="media-references"><div class="empty" data-i18n="cg.emptyRefs">No references loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.creative">Creative Pattern Learning</div></div>
          <div class="list" id="creative-ideas"><div class="empty" data-i18n="cg.empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.blueprint">Pattern / Remake Blueprint</div></div>
          <div class="list" id="reference-remake"><div class="empty" data-i18n="cg.emptyRemake">No remake blueprint loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.backend">Backend Managed Steps</div></div>
          <div class="list" id="backend-steps"><div class="empty" data-i18n="cg.empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.userActions">User Required Actions</div></div>
          <div class="list" id="user-actions"><div class="empty" data-i18n="cg.empty">No contract loaded.</div></div>
        </div>
        <div class="panel contract-panel">
          <div class="panel-head"><div class="panel-title" data-i18n="cg.director">Director</div></div>
          <div id="director" class="detail" data-i18n="cg.empty">No contract loaded.</div>
        </div>
      </section>

      <section class="panel approval">
        <div class="panel-head">
          <div class="panel-title" data-i18n="ap.title">Approval Packet</div>
        </div>
        <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="help.approval">Bấm "Tạo video" là hệ thống trừ credits và đưa video vào hàng chờ (một số video được đội ngũ duyệt nhanh trước khi chạy). Video lỗi xử lý theo chính sách hoàn credits ghi ngay dưới nút.</p></details>
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
          <div class="field"><span data-i18n="ap.spend">Provider spend</span>
            <label class="detail" for="confirm-render" style="display:flex;gap:8px;align-items:center;cursor:pointer"><input type="checkbox" id="confirm-render"><span data-i18n="ap.confirm">Confirm paid render submission</span></label>
            <label class="detail" for="caption-toggle" style="display:flex;gap:8px;align-items:center;margin-top:6px;cursor:pointer"><input type="checkbox" id="caption-toggle"><span data-i18n="ap.captions">Phụ đề tự động từ voice (khớp kịch bản, không tốn thêm)</span></label>
          </div>
          <button class="ghost-btn" type="button" id="submit-render" disabled data-i18n="ap.create">Create Render Job</button>
          <div id="credit-estimate" hidden></div>
          <button class="mini-btn" type="button" id="stop-polling" disabled data-i18n="ap.stop">Stop Watching Job</button>
        </div>
        <div id="render-status" class="detail" style="margin-top:10px" data-i18n="ap.statusIdle">No render job yet. Load a session contract, optionally prepare the review packet, then create the render job. Without approved and confirmed review the job is created paused for review with no provider spend.</div>
      </section>

      <section class="panel" id="series-panel" hidden>
        <div class="panel-head"><div class="panel-title" data-i18n="series.title">📺 Phim dài tập (1–200 tập)</div></div>
        <details class="cj-help"><summary data-i18n="help.t">💡 Hướng dẫn nhanh</summary><p data-i18n="help.series">Nhập cốt truyện + dàn nhân vật một lần. Hệ thống giữ "kinh thánh truyện": mặt nhân vật, bối cảnh và diễn biến THẬT của từng tập được ghi sổ — tập sau tự nối tiếp đúng khung hình cuối và cliffhanger của tập trước. Mỗi tập: Xem trước brief (miễn phí) → Render (báo giá credits, xác nhận mới trừ tiền; tập lỗi hoàn theo chính sách).</p></details>
        <div class="grid-3">
          <label class="field" style="grid-column: span 3"><span data-i18n="series.premise">Cốt truyện</span><textarea id="series-premise" data-i18n-placeholder="series.premisePh" placeholder="VD: Nữ giúp việc bị cả nhà coi thường hoá ra là ái nữ tập đoàn trở về báo thù..." style="min-height:64px"></textarea></label>
          <label class="field"><span data-i18n="series.count">Số tập</span><input id="series-count" type="number" min="1" max="200" value="12"></label>
          <label class="field"><span data-i18n="series.duration">Thời lượng mỗi tập (giây)</span><input id="series-duration" type="number" min="15" max="480" value="60"></label>
          <label class="field"><span data-i18n="series.lang">Ngôn ngữ thoại</span><select id="series-lang"><option value="vi" selected>Tiếng Việt</option><option value="en">English</option><option value="zh">中文</option></select></label>
          <label class="field" style="grid-column: span 3"><span data-i18n="series.cast">Dàn nhân vật (mỗi dòng: Tên | mô tả ngắn)</span><textarea id="series-cast" data-i18n-placeholder="series.castPh" placeholder="Linh | 23 tuổi, mắt kiên định, tóc đen dài&#10;Bà Trần | quản gia khắc nghiệt trung niên" style="min-height:56px"></textarea></label>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px;align-items:center">
          <button class="cj-primary" type="button" id="series-create" data-i18n="series.create">📖 Tạo bộ phim</button>
          <button class="mini-btn" type="button" id="series-preview" disabled data-i18n="series.preview">👁 Xem trước tập kế (miễn phí)</button>
          <button class="ghost-btn" type="button" id="series-render" disabled data-i18n="series.render">🎬 Render tập kế</button>
        </div>
        <div id="series-status" class="detail" style="margin-top:10px"></div>
        <textarea id="series-preview-box" readonly hidden style="width:100%;min-height:130px;margin-top:8px;background:#0d1230;color:#e8ecff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px;font-size:12px"></textarea>
        <div class="panel-head" style="margin-top:14px"><div class="panel-title" data-i18n="series.mine">📚 Bộ phim của tôi</div><button class="mini-btn" type="button" id="series-refresh" data-i18n="series.refresh">Tải lại</button></div>
        <div id="series-list"><div class="empty" data-i18n="series.none">Chưa có bộ phim nào. Tạo bộ phim ở trên.</div></div>
      </section>

      <section class="panel" id="jobs-panel" hidden>
        <div class="panel-head">
          <div class="panel-title" data-i18n="jp.title">Render Jobs</div>
          <button class="mini-btn" type="button" id="refresh-jobs" data-i18n="jp.refresh">Refresh</button>
        </div>
        <div id="jobs-queue" class="detail" data-i18n="jp.queueIdle">Queue: chưa tải.</div>
        <div id="jobs-list" style="margin-top:10px"><div class="empty" data-i18n="jp.emptyHint">Bấm Refresh để tải danh sách video của bạn.</div></div>
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

    // ---- i18n: 3 ngôn ngữ chính (vi/en/zh). data-i18n = textContent,
    // data-i18n-placeholder = placeholder, data-i18n-title = title. ----
    var currentLang = (function () {
      try { var saved = window.localStorage.getItem("cinejelly_lang"); return saved === "en" || saved === "zh" ? saved : "vi"; }
      catch (error) { return "vi"; }
    })();
    const I18N = {
      vi: {
        "top.balance": "Số dư", "top.queue": "Hàng chờ render", "top.queueReady": "Sẵn sàng",
        "top.login": "Đăng nhập / Đăng ký", "top.topup": "💎 Nạp credits", "top.logout": "Thoát",
        "top.redubTitle": "Xuất phụ đề đa ngữ + kịch bản lồng tiếng từ video có sẵn",
        "auth.login": "Đăng nhập", "auth.register": "Tạo tài khoản", "auth.password": "Mật khẩu",
        "auth.pwPh": "Tối thiểu 8 ký tự", "auth.name": "Tên hiển thị (tuỳ chọn)",
        "auth.note": "Tạo tài khoản miễn phí, nạp credits là tạo được video ngay. Không cần API key.",
        "auth.forgot": "Quên mật khẩu? Liên hệ hỗ trợ để được cấp lại:", "tu.cancelTopup": "Hủy",
        "auth.okLogin": "Đăng nhập thành công!", "auth.okRegister": "Tạo tài khoản thành công! Nạp credits để bắt đầu tạo video.",
        "pw.title": "🔑 Đổi mật khẩu", "pw.current": "Mật khẩu hiện tại", "pw.new": "Mật khẩu mới (tối thiểu 8 ký tự)",
        "pw.submit": "Đổi mật khẩu", "pw.note": "Sau khi đổi, các thiết bị khác sẽ phải đăng nhập lại. Quên mật khẩu? Liên hệ hỗ trợ để được cấp lại.",
        "pw.done": "Đã đổi mật khẩu. Các thiết bị khác sẽ phải đăng nhập lại.",
        "tu.title": "💎 Nạp credits", "tu.note": "Ghi chú chuyển khoản (tuỳ chọn)", "tu.notePh": "VD: đã CK 10:30 từ STK ...901",
        "tu.submit": "Tôi đã chuyển khoản — gửi yêu cầu duyệt", "tu.sent": "Đã gửi yêu cầu nạp. Quản trị viên sẽ duyệt và cộng credits sớm nhất.", "tu.history": "📜 Lịch sử giao dịch credits", "tu.noHistory": "Chưa có giao dịch nào.", "tu.kind.topup": "Nạp credits", "tu.kind.render_charge": "Tạo video", "tu.kind.render_refund": "Hoàn credits", "tu.kind.admin_adjust": "Điều chỉnh từ admin",
        "tu.popular": "⭐ Phổ biến nhất", "tu.perVideo": "đ/video", "tu.noExpire": "💎 Credits không bao giờ hết hạn — nạp trước, dùng dần.",
        "hero.h1": "Tạo video AI", "hero.noSession": "Chưa có phiên.",
        "hero.eyebrow": "Mô tả ý tưởng, thêm ảnh/video tham chiếu, chọn kiểu sản xuất — ${brand} tự viết kịch bản, storyboard, prompt, gói kiểm duyệt và render.",
        "mode.short": "Short", "mode.remake": "Remake", "mode.ugc": "UGC", "mode.long": "Dài",
        "s1.title": "Kể ý tưởng của bạn", "s1.enhance": "✨ Thêm cấu trúc 4 nhịp", "s1.brief": "Ý tưởng video",
        "s1.briefPh": "Mô tả video bạn muốn: ngách, sản phẩm, người/KOL, cấu trúc video mẫu, thời lượng, ngôn ngữ, giọng điệu, bằng chứng và cú chốt.",
        "s1.starter": "Mẫu nhanh", "s1.rewrite": "Thêm cấu trúc", "s1.productStarter": "Mẫu sản phẩm",
        "s1.beatAlt": " Chia rõ 4 beat: 0-3s hook, 3-7s proof/demo, 7-12s transformation/result, 12-15s payoff ổn định. Giữ chuyển động tự nhiên, không chữ trên màn hình, audio có nhịp nhưng visual vẫn hiểu được nếu tắt tiếng.",
        "s1.beatMain": " Bổ sung hook trong 1 giây đầu, proof/demo ở giữa, payoff cuối rõ ràng, nhịp TikTok tự nhiên, không chữ trên màn hình, endpoint sạch để review hoặc nối cảnh.",
        "s2.title": "Thêm tham chiếu (ảnh/video)", "s2.clear": "Xoá hết", "set.styleRegister": "Phong cách", "style.auto": "Tự động (AI chọn)", "style.ugc": "📱 Tự nhiên như người quay", "style.cinematic": "🎬 Điện ảnh", "style.story": "📖 Kể chuyện", "style.demo": "🔧 Demo sản phẩm", "style.education": "🎓 Hướng dẫn", "s2.costRough": "Ước tính sơ bộ (giá thật hiện khi xác nhận)",
        "s2.kol": "KOL / Nhân vật", "s2.imgRef": "ảnh tham chiếu", "s2.product": "Sản phẩm", "s2.scene": "Bối cảnh", "s2.bg": "ảnh nền",
        "s2.source": "Video mẫu", "s2.pattern": "học cấu trúc", "s2.voice": "Giọng / Ghi chú", "s2.voiceS": "định hướng giọng",
        "s2.kolUri": "Ảnh KOL / nhân vật", "s2.productUri": "Ảnh sản phẩm", "s2.bgUri": "Ảnh bối cảnh", "s2.srcUrl": "Link video mẫu",
        "s2.upload": "📁 Tải lên", "s2.note": "Ghi chú tham chiếu / giọng đọc",
        "s2.notePh": "Cần giữ gì từ ảnh/video đính kèm, hoặc mô tả giọng đọc mong muốn",
        "s2.wardrobe": "Trang phục", "s2.first": "Khung hình đầu", "s2.last": "Khung hình cuối",
        "s2.rights": "Bản quyền media", "s2.rightsOk": "Đã được duyệt", "s2.rightsReview": "Cần kiểm tra", "s2.rightsUnknown": "Chưa rõ",
        "s3.title": "Học từ video mẫu", "s3.useRemake": "Dùng chế độ Remake", "s3.srcPlatform": "Nền tảng nguồn",
        "s3.pInternal": "Nội bộ ${brand}", "s3.pMotion": "Cảm hứng chuyển động", "s3.pAds": "Cảm hứng quảng cáo", "s3.pCustom": "Tuỳ chỉnh",
        "s3.learning": "Chính sách học", "s3.structOnly": "Chỉ học cấu trúc và nhịp", "s3.closeRemake": "Remake sát (đã có bản quyền)",
        "s3.platform": "Nền tảng đăng", "s3.flexible": "Linh hoạt", "s3.summary": "Tóm tắt cấu trúc video mẫu",
        "s3.summaryPh": "Dán cấu trúc video mẫu: hook, nhịp, diễn xuất, góc máy, nhịp cắt, nhịp audio và cú chốt. ${brand} áp cấu trúc vào KOL, sản phẩm, bối cảnh CỦA BẠN.",
        "s4.title": "Khung nhịp mẫu (storyboard thật hiện sau khi tạo)", "s4.refresh": "Tải lại contract",
        "s4.b1": "1 Mở màn", "s4.b1n": "Vấn đề / trạng thái trước", "s4.b2": "2 Bằng chứng", "s4.b2n": "Sản phẩm / hành động",
        "s4.b3": "3 Biến đổi", "s4.b3n": "Thay đổi / kết quả", "s4.b4": "4 Chốt", "s4.b4n": "Sau / CTA nhẹ",
        "set.duration": "Thời lượng (giây)", "set.aspect": "Tỉ lệ khung", "set.quality": "Chất lượng / model", "set.audio": "Giọng đọc",
        "set.audioVi": "Thuyết minh tiếng Việt", "set.audioEn": "Thuyết minh tiếng Anh", "set.audioZh": "Thuyết minh tiếng Trung", "set.audioOff": "Tắt",
        "set.bitHigh": "Cao", "set.bitStd": "Chuẩn", "set.lastFrame": "Khung cuối", "set.auto": "Tự động", "set.on": "Bật", "set.off": "Tắt",
        "set.product": "Sản phẩm / chủ đề", "set.productPh": "Sản phẩm, dịch vụ, kênh hay câu chuyện thật của bạn",
        "set.category": "Ngành hàng", "set.categoryPh": "làm đẹp, thời trang, SaaS, đồ ăn, giáo dục...",
        "set.claim": "Cam kết được phép nói", "set.claimPh": "Chỉ những cam kết bạn chịu trách nhiệm được",
        "set.renderPasses": "Chất lượng render",
        "nav.create": "🎬 Tạo video AI", "nav.series": "📺 Phim dài tập", "nav.dub": "🌐 Lồng tiếng & Phụ đề", "nav.mine": "📁 Video của tôi",
        "series.title": "📺 Phim dài tập (1–200 tập)", "series.premise": "Cốt truyện", "series.premisePh": "VD: Nữ giúp việc bị cả nhà coi thường hoá ra là ái nữ tập đoàn trở về báo thù...",
        "series.count": "Số tập", "series.duration": "Thời lượng mỗi tập (giây)", "series.lang": "Ngôn ngữ thoại", "series.cast": "Dàn nhân vật (mỗi dòng: Tên | mô tả ngắn)", "series.castPh": "Linh | 23 tuổi, mắt kiên định, tóc đen dài",
        "series.create": "📖 Tạo bộ phim", "series.preview": "👁 Xem trước tập kế (miễn phí)", "series.render": "🎬 Render tập kế",
        "series.needInput": "Cần cốt truyện và ít nhất 1 nhân vật.", "series.created": "Đã tạo bộ phim:", "series.eps": "tập",
        "series.previewReady": "Brief tập", "series.epLabel": "TẬP", "series.confirmPrefix": "Render tập", "series.rendering": "Đang render tập", "series.renderWait": "vài phút, đừng đóng trang",
        "series.epDone": "Xong tập", "series.nextHint": "Bấm Xem trước để soạn tập tiếp theo.",
        "series.mine": "📚 Bộ phim của tôi", "series.refresh": "Tải lại", "series.none": "Chưa có bộ phim nào. Tạo bộ phim ở trên.", "series.loginFirst": "Đăng nhập để xem bộ phim của bạn.", "series.downloadEp": "⬇ Tải tập", "series.resume": "▶ Soạn tập tiếp", "series.resumed": "Đang tiếp bộ:", "confirm.renderPrefix": "Tạo video này sẽ trừ khoảng", "wz.s1": "Ý tưởng", "wz.s2": "Hình ảnh & tuỳ chọn", "wz.s3": "Xem lại & tạo", "wz.next": "Tiếp →", "wz.back": "← Quay lại", "wz.buildPlan": "Xem giá & kế hoạch →", "wz.building": "Đang tạo kế hoạch...", "wz.create": "🎬 Tạo video", "wz.reviewTitle": "Xem lại & tạo video", "wz.reviewHelp": "Kiểm lại tóm tắt kế hoạch và giá credits bên dưới. Bấm \"🎬 Tạo video\" là hệ thống trừ credits và bắt đầu dựng (đủ credit sẽ chạy ngay). Muốn sửa thì Quay lại.", "wz.reviewEmpty": "Bấm \"Xem giá & kế hoạch\" ở bước trước để tạo kế hoạch.", "wz.rIdea": "Ý tưởng", "wz.rPlatform": "Nền tảng", "wz.rDuration": "Thời lượng", "wz.rQuality": "Chất lượng", "wz.rAudio": "Giọng đọc", "wz.rRefs": "Số ảnh tham chiếu", "wz.priceRefund": "trừ khi tạo, hoàn nếu lỗi", "ap.statusTitle": "Trạng thái video", "confirm.renderSuffix": "Đồng ý tạo và trừ credits?", "toast.starterLoaded": "Đã nạp mẫu:",
        "help.series": "Nhập cốt truyện + dàn nhân vật một lần. Hệ thống giữ 'kinh thánh truyện': mặt nhân vật, bối cảnh và diễn biến THẬT của từng tập được ghi sổ — tập sau tự nối tiếp đúng khung hình cuối và cliffhanger của tập trước. Mỗi tập: Xem trước brief (miễn phí) → Render (báo giá credits, xác nhận mới trừ tiền; tập lỗi hoàn theo chính sách).", "set.channelStyle": "Phong cách kênh (tuỳ chọn)", "cs.none": "— Không dùng —",
        "q.economy": "Tiết kiệm — render 1 bản (rẻ nhất)", "q.standard": "Chuẩn — 2 bản, AI chọn bản đẹp hơn", "q.high": "Cao — 3 bản + sửa lỗi, AI chọn bản tốt nhất", "q.ultimate": "Tối đa — 4 bản + sửa kỹ (đắt nhất)",
        "rb.note": "Backend giữ chặt chi phí: chưa duyệt và chưa xác nhận thì chưa gửi render trả phí.",
        "rb.build": "Tạo kế hoạch video",
        "rs.starters": "Mẫu có sẵn", "rs.mine": "Video của tôi", "rs.history": "Lịch sử", "rs.quick": "Mẹo nhanh",
        "rs.tip1": "Ý tưởng rõ ràng", "rs.tip1b": "Prompt sẽ thành kịch bản và storyboard.",
        "rs.tip2": "Thêm tham chiếu", "rs.tip2b": "KOL, sản phẩm, bối cảnh, video mẫu.",
        "rs.tip3": "Chặn chi phí", "rs.tip3b": "Không tốn tiền provider trước khi duyệt.",
        "rs.tip4": "Gói kiểm duyệt", "rs.tip4b": "Một bước bàn giao sạch trước render.",
        "rs.recent": "Phiên gần đây", "rs.noSessions": "Chưa có phiên nào.",
        "cg.review": "Điểm kiểm duyệt", "cg.routing": "Định tuyến Seedance", "cg.media": "Tham chiếu media",
        "cg.creative": "Học mẫu sáng tạo", "cg.blueprint": "Bản thiết kế Remake", "cg.backend": "Bước backend tự lo",
        "cg.userActions": "Việc bạn cần làm", "cg.director": "Đạo diễn",
        "cg.empty": "Chưa có contract.", "cg.emptyRefs": "Chưa có tham chiếu.", "cg.emptyRemake": "Chưa có bản thiết kế remake.",
        "ap.title": "Duyệt & Render", "ap.spend": "Xác nhận chi phí", "ap.confirm": "Xác nhận gửi render trả phí",
        "ap.captions": "Phụ đề tự động từ giọng đọc (khớp kịch bản, không tốn thêm)",
        "ap.create": "🎬 Tạo video", "ap.stop": "Ngừng theo dõi",
        "ap.statusIdle": "Chưa có video nào đang tạo. Nhập ý tưởng → Tạo kế hoạch video → Tạo video.",
        "jp.title": "Video đã tạo", "jp.refresh": "Tải lại", "jp.queueIdle": "Queue: chưa tải.",
        "jp.emptyHint": "Bấm Tải lại để xem danh sách video của bạn.",
        "jp.loadFail": "Không tải được danh sách — hãy đăng nhập rồi thử lại.", "jp.empty": "Chưa có video nào.",
        "jp.qQueued": "chờ", "jp.qRunning": "đang chạy", "jp.qPaused": "đang xử lý",
        "jp.stDone": "✅ Xong", "jp.stProcessing": "⏳ Đang hoàn thiện", "jp.stFailed": "Không thành công",
        "jp.view": "Xem", "jp.dl": "Tải", "jp.watch": "Theo dõi", "jp.subdub": "Phụ đề đa ngữ / thuyết minh",
        "jp.dlStarted": "Đã bắt đầu tải video.", "jp.dlFail": "Không tải được video (job chưa xong hoặc file đã dọn).",
        "poll.checkFail": "Không kiểm tra được trạng thái video. Hãy đăng nhập lại rồi mở 🎬 Video.", "poll.reconnecting": "Mạng chập chờn, đang thử kết nối lại... (video vẫn đang chạy)",
        "poll.done": "🎉 Video đã xong! Mở 🎬 Video để xem và tải về.",
        "poll.refundAuto": "credits đã được hoàn tự động", "poll.refundManual": "yêu cầu hoàn credits đã được gửi tới đội ngũ để xử lý",
        "poll.failedPrefix": "❌ Video bị lỗi — ", "poll.tryAgain": ". Hãy thử lại.",
        "poll.canceledPrefix": "Video đã hủy — ", "poll.rejectedPrefix": "Video bị từ chối duyệt — ",
        "poll.held": "Video tạm giữ để kiểm tra thêm — đội ngũ sẽ xử lý sớm.",
        "poll.reviewWait": "⏳ Video đang chờ đội ngũ kiểm duyệt (thường vài phút). Credits đã trừ, sẽ HOÀN lại nếu video lỗi — KHÔNG cần gửi lại. Trang sẽ tự cập nhật.",
        "poll.finishing": "⏳ Video đang được xử lý và hoàn thiện, vui lòng chờ trong giây lát. Credits đã trừ, sẽ hoàn nếu lỗi — trang sẽ tự cập nhật khi xong.",
        "err.loginFirst": "Hãy đăng nhập tài khoản (nút Đăng nhập phía trên) trước khi tải file lên.",
        "err.uploadTooBig": "File quá lớn (tối đa 25MB). Hãy nén ảnh/video rồi thử lại.",
        "err.needSession": "Hãy tạo hoặc mở một phiên trò chuyện trước khi tạo video.",
        "ok.renderCreated": "Đã tạo yêu cầu video", "ok.reviewPlan": "Đã tạo kế hoạch. Video chỉ chạy sau khi được duyệt.",
        "up.done1": "Đã tải lên “", "up.done2": "” — trường tham chiếu đã được điền.",
        "err.loginCreate": "Hãy đăng nhập (nút Đăng nhập / Đăng ký phía trên) trước khi tạo video.",
        "err.needIdea": "Hãy nhập ý tưởng video trước khi tạo.",
        "ce.cost": "Chi phí ước tính:", "ce.balance": "số dư:", "ce.from": "🎬 Video AI từ chỉ", "ce.needTopup": "⚠️ nạp thêm để tạo",
        "ce.refundAuto": "Video lỗi được hoàn credits tự động.", "wz.acceptableUse": "Bằng việc tạo video, bạn xác nhận nội dung KHÔNG vi phạm pháp luật hoặc chính sách (cấm nội dung tình dục trẻ em, khiêu dâm, bạo lực đẫm máu, khủng bố, hàng cấm). Yêu cầu vi phạm sẽ bị từ chối.", "ce.refundManual": "Video lỗi sẽ được đội ngũ xem xét hoàn credits.",
        "help.t": "💡 Hướng dẫn nhanh",
        "help.idea": "Viết như kể cho một người bạn: bán gì / cho ai / video trông thế nào / cú chốt là gì. Càng cụ thể sản phẩm + cảm xúc, video càng dễ viral. Viết tiếng Việt, Trung hay Anh đều được.",
        "help.ref": "Ảnh KOL = khoá gương mặt; ảnh sản phẩm = khoá sản phẩm; ảnh bối cảnh = khoá không gian; video mẫu = chỉ học cấu trúc nhịp (không sao chép nội dung). Bấm 📁 để tải từ điện thoại/máy tính — hệ thống tự điền, không cần link.",
        "help.settings": "Thời lượng × chất lượng quyết định giá credits (hiện ngay dưới nút tạo). 9:16 cho TikTok/Reels. 'Giọng đọc' chọn ngôn ngữ thuyết minh; phụ đề bật ở bước cuối.",
        "help.topup": "Chọn gói → chuyển khoản đúng nội dung hiển thị → bấm nút xác nhận. Quản trị viên duyệt là credits vào tài khoản (thường vài phút). Lỡ gửi trùng sẽ tự gộp, không mất tiền hai lần.",
        "help.approval": "Bấm 'Tạo video' là hệ thống trừ credits và đưa video vào hàng chờ (một số video được đội ngũ duyệt nhanh trước khi chạy). Video lỗi xử lý theo chính sách hoàn credits ghi ngay dưới nút.",
        "help.redub": "Chọn video (tải từ máy bằng 📁, hoặc bấm 🌐 trên video đã render). Chọn ngôn ngữ. Hệ thống nghe → dịch → và khi bật '🔊 Lồng tiếng tự động' sẽ ĐỌC GIỌNG AI + TRỘN thẳng vào video, trả về file dubbed.mp4 kèm phụ đề .srt từng ngôn ngữ và kịch bản thuyết minh. Tiếng gốc được hạ nhỏ dưới giọng đọc (kiểu review phim) hoặc thay hẳn — chọn ở ô 'Âm thanh gốc'. Bỏ chọn lồng tiếng nếu chỉ cần phụ đề + kịch bản (rẻ hơn).",
        "redub.renderVideo": "🔊 Lồng tiếng tự động vào video (nhận file dubbed.mp4)",
        "redub.renderVideoHint": "Bỏ chọn nếu chỉ cần phụ đề + kịch bản (rẻ hơn). Khi chọn, giọng AI tiếng Việt đọc thuyết minh và trộn thẳng vào video.",
        "redub.downloadVideo": "⬇ Tải video đã lồng tiếng (dubbed.mp4)",
        "redub.title": "🌐 Phụ đề đa ngữ + Kịch bản lồng tiếng", "redub.source": "Video nguồn",
        "redub.sourcePh": "Bấm 📁 để tải video lên, hoặc nút 🌐 trên video đã render",
        "redub.fromJob": "Nguồn: video đã render", "redub.srcLang": "Ngôn ngữ gốc", "redub.auto": "Tự nhận diện",
        "redub.dubLang": "Thuyết minh sang", "redub.subs": "Phụ đề xuất thêm (chọn nhiều)",
        "redub.voice": "Kiểu giọng thuyết minh (tuỳ chọn)", "redub.voicePh": "VD: giọng nữ review ấm áp, tự nhiên",
        "redub.mix": "Âm thanh gốc", "redub.mixDuck": "Giữ nhạc nền, hạ nhỏ khi thuyết minh", "redub.mixReplace": "Thay hẳn bằng thuyết minh mới",
        "redub.run": "🌐 Dịch & tạo phụ đề", "redub.running": "⏳ Đang nghe & dịch video (1-3 phút)...",
        "redub.needSource": "Chọn video trước: tải lên bằng 📁 hoặc bấm 🌐 trên video đã render.",
        "redub.done": "✅ Xong:", "redub.segments": "đoạn thoại", "redub.script": "Kịch bản thuyết minh (đọc theo mốc thời gian):",
        "redub.price1": "Phí:", "redub.priceOp": "Miễn phí với key vận hành.", "redub.credits": "credits / lần",
        "redub.priceBasis": "Phí = độ dài video (giây) × giá mỗi giây. Số chính xác sẽ hiện để bạn xác nhận TRƯỚC khi trừ.",
        "redub.quoting": "⏳ Đang tính phí theo độ dài video...", "redub.confirmPrefix": "Video dài", "redub.confirmSuffix": "Đồng ý trừ credits và tạo?",
        "redub.cancelled": "Đã huỷ — chưa trừ credits nào."
      },
      en: {
        "top.balance": "Balance", "top.queue": "Render queue", "top.queueReady": "Ready",
        "top.login": "Log in / Sign up", "top.topup": "💎 Top up", "top.logout": "Log out",
        "top.redubTitle": "Export multi-language subtitles + a dubbing script from an existing video",
        "auth.login": "Log in", "auth.register": "Create account", "auth.password": "Password",
        "auth.pwPh": "At least 8 characters", "auth.name": "Display name (optional)",
        "auth.note": "Free account — top up credits and start creating right away. No API key needed.", "auth.forgot": "Forgot your password? Contact support to reset it:", "tu.cancelTopup": "Cancel",
        "auth.okLogin": "Logged in!", "auth.okRegister": "Account created! Top up credits to start creating videos.",
        "pw.title": "🔑 Change password", "pw.current": "Current password", "pw.new": "New password (min 8 characters)",
        "pw.submit": "Change password", "pw.note": "Other devices will need to log in again. Forgot it? Contact support for a reset.",
        "pw.done": "Password changed. Other devices must log in again.",
        "tu.title": "💎 Top up credits", "tu.note": "Transfer note (optional)", "tu.notePh": "e.g. paid 10:30 from account ...901",
        "tu.submit": "I have paid — submit for approval", "tu.sent": "Top-up submitted. The admin will verify and add credits shortly.", "tu.history": "📜 Credit transaction history", "tu.noHistory": "No transactions yet.", "tu.kind.topup": "Top-up", "tu.kind.render_charge": "Create video", "tu.kind.render_refund": "Refund", "tu.kind.admin_adjust": "Admin adjustment",
        "tu.popular": "⭐ Most popular", "tu.perVideo": "đ/video", "tu.noExpire": "💎 Credits never expire — top up once, use anytime.",
        "hero.h1": "Create AI Video", "hero.noSession": "No session loaded.",
        "hero.eyebrow": "Describe the idea, add references, choose a production pattern — ${brand} builds the script, storyboard, prompt, review packet, and render handoff.",
        "mode.short": "Short", "mode.remake": "Remake", "mode.ugc": "UGC", "mode.long": "Long",
        "s1.title": "Tell ${brand} your idea", "s1.enhance": "✨ Add 4-beat structure", "s1.brief": "Creative brief",
        "s1.briefPh": "Describe the actual video you want: niche, product, KOL/person, source-video structure, duration, language, tone, proof, and final payoff.",
        "s1.starter": "Starter", "s1.rewrite": "Add structure", "s1.productStarter": "Product starter",
        "s1.beatAlt": " Split into 4 beats: 0-3s hook, 3-7s proof/demo, 7-12s transformation/result, 12-15s stable payoff. Keep motion natural, no on-screen text, audio has rhythm but the visual still reads with sound off.",
        "s1.beatMain": " Add a hook in the first second, proof/demo in the middle, a clear payoff at the end, natural TikTok pacing, no on-screen text, a clean endpoint for review or scene chaining.",
        "s2.title": "Add references", "s2.clear": "Clear", "set.styleRegister": "Style", "style.auto": "Auto (AI decides)", "style.ugc": "📱 Natural creator-shot", "style.cinematic": "🎬 Cinematic", "style.story": "📖 Story", "style.demo": "🔧 Product demo", "style.education": "🎓 Tutorial", "s2.costRough": "Rough estimate (exact price shown at confirmation)",
        "s2.kol": "KOL / Talent", "s2.imgRef": "image reference", "s2.product": "Product", "s2.scene": "Scene", "s2.bg": "background",
        "s2.source": "Source video", "s2.pattern": "pattern intake", "s2.voice": "Voice / Notes", "s2.voiceS": "audio intent",
        "s2.kolUri": "KOL image", "s2.productUri": "Product image", "s2.bgUri": "Scene/background image", "s2.srcUrl": "Source video URL",
        "s2.upload": "📁 Upload", "s2.note": "Reference / voice note",
        "s2.notePh": "What to preserve from the attached media, source video, or voice direction",
        "s2.wardrobe": "Wardrobe reference", "s2.first": "First frame", "s2.last": "Last frame",
        "s2.rights": "Media rights", "s2.rightsOk": "Operator approved", "s2.rightsReview": "Needs review", "s2.rightsUnknown": "Unknown",
        "s3.title": "Learn from a source video", "s3.useRemake": "Use Remake mode", "s3.srcPlatform": "Source platform",
        "s3.pInternal": "${brand} internal", "s3.pMotion": "Motion inspiration", "s3.pAds": "Ad inspiration", "s3.pCustom": "Custom",
        "s3.learning": "Learning policy", "s3.structOnly": "Structure and rhythm only", "s3.closeRemake": "Rights-cleared close remake",
        "s3.platform": "Publish platform", "s3.flexible": "Flexible", "s3.summary": "Source pattern summary",
        "s3.summaryPh": "Paste the public pattern/video structure: hook, pacing, acting beats, camera style, edit rhythm, audio rhythm, and payoff. ${brand} adapts it to YOUR KOL, product, and background.",
        "s4.title": "Beat template (real storyboard appears after planning)", "s4.refresh": "Refresh contract",
        "s4.b1": "1 Hook", "s4.b1n": "Problem / before state", "s4.b2": "2 Proof", "s4.b2n": "Product / action",
        "s4.b3": "3 Transform", "s4.b3n": "Change / result", "s4.b4": "4 Payoff", "s4.b4n": "After / soft CTA",
        "set.duration": "Duration (s)", "set.aspect": "Aspect ratio", "set.quality": "Quality / model", "set.audio": "Voiceover",
        "set.audioVi": "Vietnamese VO", "set.audioEn": "English VO", "set.audioZh": "Chinese VO", "set.audioOff": "Off",
        "set.bitHigh": "High", "set.bitStd": "Standard", "set.lastFrame": "Last frame", "set.auto": "Auto", "set.on": "On", "set.off": "Off",
        "set.product": "Product / subject", "set.productPh": "Your real product, service, channel, or story subject",
        "set.category": "Category", "set.categoryPh": "beauty, fashion, SaaS, food, education...",
        "set.claim": "Allowed claim", "set.claimPh": "Only claims you can approve or substantiate",
        "set.renderPasses": "Render quality",
        "nav.create": "🎬 Create AI Video", "nav.series": "📺 Episodic Drama", "nav.dub": "🌐 Dub & Subtitles", "nav.mine": "📁 My Videos",
        "series.title": "📺 Episodic drama (1–200 episodes)", "series.premise": "Premise", "series.premisePh": "e.g. The despised maid turns out to be the conglomerate heiress back for revenge...",
        "series.count": "Episodes", "series.duration": "Seconds per episode", "series.lang": "Spoken language", "series.cast": "Cast (one per line: Name | short description)", "series.castPh": "Linh | 23, determined eyes, long black hair",
        "series.create": "📖 Create series", "series.preview": "👁 Preview next episode (free)", "series.render": "🎬 Render next episode",
        "series.needInput": "Premise and at least one cast member required.", "series.created": "Series created:", "series.eps": "episodes",
        "series.previewReady": "Episode brief", "series.epLabel": "EPISODE", "series.confirmPrefix": "Render episode", "series.rendering": "Rendering episode", "series.renderWait": "a few minutes, keep this tab open",
        "series.epDone": "Episode done:", "series.nextHint": "Press Preview to draft the next episode.",
        "series.mine": "📚 My series", "series.refresh": "Reload", "series.none": "No series yet. Create one above.", "series.loginFirst": "Log in to see your series.", "series.downloadEp": "⬇ Download", "series.resume": "▶ Next episode", "series.resumed": "Resuming series:", "confirm.renderPrefix": "Creating this video will charge about", "wz.s1": "Idea", "wz.s2": "Images & options", "wz.s3": "Review & create", "wz.next": "Next →", "wz.back": "← Back", "wz.buildPlan": "See price & plan →", "wz.building": "Building plan...", "wz.create": "🎬 Create video", "wz.reviewTitle": "Review & create", "wz.reviewHelp": "Check the plan summary and credit price below. Press \"🎬 Create video\" to charge credits and start rendering (runs immediately if you have enough credits). Go Back to edit.", "wz.reviewEmpty": "Press \"See price & plan\" on the previous step to build the plan.", "wz.rIdea": "Idea", "wz.rPlatform": "Platform", "wz.rDuration": "Duration", "wz.rQuality": "Quality", "wz.rAudio": "Voiceover", "wz.rRefs": "Reference images", "wz.priceRefund": "charged on create, refunded on failure", "ap.statusTitle": "Video status", "confirm.renderSuffix": "Create and charge credits?", "toast.starterLoaded": "Starter loaded:",
        "help.series": "Enter the premise + cast once. The system keeps a story bible: faces, world, and what REALLY happened each episode are recorded — the next episode resumes exactly from the previous end frame and cliffhanger. Per episode: Preview the brief (free) → Render (credits quoted, charged only after you confirm; failed episodes refund per policy).", "set.channelStyle": "Channel style (optional)", "cs.none": "— None —",
        "q.economy": "Economy — 1 render pass (cheapest)", "q.standard": "Standard — 2 passes, AI picks the better", "q.high": "High — 3 passes + repairs, AI picks the best", "q.ultimate": "Ultimate — 4 passes + deep repairs (priciest)",
        "rb.note": "Backend keeps provider spend locked until the plan is approved and explicitly confirmed.",
        "rb.build": "Build video plan",
        "rs.starters": "Pattern starters", "rs.mine": "My creations", "rs.history": "History", "rs.quick": "Quick tips",
        "rs.tip1": "Clear idea", "rs.tip1b": "Your prompt becomes the script and storyboard.",
        "rs.tip2": "Add references", "rs.tip2b": "KOL, product, scene, source video.",
        "rs.tip3": "Budget guard", "rs.tip3b": "No provider spend before approval.",
        "rs.tip4": "Review packet", "rs.tip4b": "One clean pre-render handoff.",
        "rs.recent": "Recent sessions", "rs.noSessions": "No sessions yet.",
        "cg.review": "Review checkpoints", "cg.routing": "Seedance routing", "cg.media": "Media references",
        "cg.creative": "Creative pattern learning", "cg.blueprint": "Pattern / remake blueprint", "cg.backend": "Backend managed steps",
        "cg.userActions": "Your required actions", "cg.director": "Director",
        "cg.empty": "No contract loaded.", "cg.emptyRefs": "No references loaded.", "cg.emptyRemake": "No remake blueprint loaded.",
        "ap.title": "Review & Render", "ap.spend": "Cost confirmation", "ap.confirm": "Confirm paid render submission",
        "ap.captions": "Auto captions from the voiceover (script-matched, no extra cost)",
        "ap.create": "🎬 Create video", "ap.stop": "Stop watching",
        "ap.statusIdle": "No render job yet. Describe the idea → Build video plan → Create video.",
        "jp.title": "My videos", "jp.refresh": "Refresh", "jp.queueIdle": "Queue: not loaded.",
        "jp.emptyHint": "Press Refresh to load your videos.",
        "jp.loadFail": "Could not load the list — log in and try again.", "jp.empty": "No videos yet.",
        "jp.qQueued": "queued", "jp.qRunning": "running", "jp.qPaused": "processing",
        "jp.stDone": "✅ Done", "jp.stProcessing": "⏳ Finishing", "jp.stFailed": "Unsuccessful",
        "jp.view": "Play", "jp.dl": "Download", "jp.watch": "Track", "jp.subdub": "Multi-language subs / dub",
        "jp.dlStarted": "Download started.", "jp.dlFail": "Could not fetch the video (job not finished or file cleaned up).",
        "poll.checkFail": "Could not check the job status. Log in again and open 🎬 Video.", "poll.reconnecting": "Network hiccup, reconnecting... (your video is still running)",
        "poll.done": "🎉 Your video is ready! Open 🎬 Video to watch and download.",
        "poll.refundAuto": "credits were refunded automatically", "poll.refundManual": "a credit-refund request was sent to the team for review",
        "poll.failedPrefix": "❌ The video failed — ", "poll.tryAgain": ". Please try again.",
        "poll.canceledPrefix": "Video canceled — ", "poll.rejectedPrefix": "Video rejected in review — ",
        "poll.held": "The video is held for an extra check — the team will handle it shortly.",
        "poll.reviewWait": "⏳ Your video is waiting for the team review (usually minutes). Credits are charged, refunded if it fails — do NOT resubmit. This page updates automatically.",
        "poll.finishing": "⏳ Your video is being processed and finished — please wait a moment. Credits are charged, refunded on failure; this page updates automatically when it is ready.",
        "err.loginFirst": "Please log in (button above) before uploading files.",
        "err.uploadTooBig": "File too large (max 25MB). Compress it and try again.",
        "err.needSession": "Create or open a chat session before creating a video.",
        "ok.renderCreated": "Render job created", "ok.reviewPlan": "Review plan created. Provider render is still locked until explicit approval.",
        "up.done1": "Uploaded “", "up.done2": "” — the reference field is filled in.",
        "err.loginCreate": "Please log in (Log in / Sign up above) before creating a video.",
        "err.needIdea": "Please describe your video idea first.",
        "ce.cost": "Estimated cost:", "ce.balance": "balance:", "ce.from": "🎬 AI video from just", "ce.needTopup": "⚠️ top up to create",
        "ce.refundAuto": "Failed videos are refunded automatically.", "wz.acceptableUse": "By creating a video you confirm the content does not break the law or policy (no child-sexual, pornographic, graphic-violence, terrorism, or illegal-goods content). Violating requests are rejected.", "ce.refundManual": "Failed videos are reviewed by the team for a refund.",
        "help.t": "💡 Quick guide",
        "help.idea": "Write like you are telling a friend: what you sell / for whom / how the video should look / the payoff. The more specific the product + emotion, the more viral the result. Vietnamese, Chinese, or English all work.",
        "help.ref": "KOL image locks the face; product image locks the product; scene locks the space; a source video teaches structure only (never copied). Press 📁 to upload from phone/PC — fields fill in automatically.",
        "help.settings": "Duration × quality sets the credit price (shown under the create button). Use 9:16 for TikTok/Reels. 'Voiceover' picks the narration language; captions toggle on in the final step.",
        "help.topup": "Pick a package → transfer with the shown reference → press confirm. Credits arrive once the admin approves (usually minutes). Duplicate submissions merge safely — you never pay twice.",
        "help.approval": "'Create video' deducts credits and queues the video (some pass a quick team review first). Failed videos follow the refund policy shown under the button.",
        "help.redub": "Pick a video (upload with 📁, or press 🌐 on a finished video). Choose languages. The system listens → translates → and with '🔊 Auto-dub' enabled it VOICES the narration with AI and MIXES it into the video, returning dubbed.mp4 plus per-language .srt subtitles and the dubbing script. The original audio is ducked under the voice (review-film style) or fully replaced — pick under 'Original audio'. Untick auto-dub if you only need subtitles + script (cheaper).",
        "redub.renderVideo": "🔊 Auto-dub the video (get dubbed.mp4)",
        "redub.renderVideoHint": "Untick if you only need subtitles + the script (cheaper). When ticked, an AI voice reads the narration and it is mixed straight into the video.",
        "redub.downloadVideo": "⬇ Download dubbed video (dubbed.mp4)",
        "redub.title": "🌐 Multi-language subtitles + Dubbing script", "redub.source": "Source video",
        "redub.sourcePh": "Press 📁 to upload, or the 🌐 button on a finished video",
        "redub.fromJob": "Source: rendered video", "redub.srcLang": "Original language", "redub.auto": "Auto detect",
        "redub.dubLang": "Dub into", "redub.subs": "Extra subtitle languages (pick any)",
        "redub.voice": "Narration voice style (optional)", "redub.voicePh": "e.g. warm, natural female review voice",
        "redub.mix": "Original audio", "redub.mixDuck": "Keep the bed, duck under the dub", "redub.mixReplace": "Replace fully with the new narration",
        "redub.run": "🌐 Translate & build subtitles", "redub.running": "⏳ Listening & translating (1-3 min)...",
        "redub.needSource": "Pick a source first: upload with 📁 or press 🌐 on a finished video.",
        "redub.done": "✅ Done:", "redub.segments": "speech segments", "redub.script": "Narration script (timed):",
        "redub.price1": "Fee:", "redub.priceOp": "Free with the operator key.", "redub.credits": "credits per run",
        "redub.priceBasis": "Fee = video length (seconds) × per-second rate. The exact amount is shown for you to confirm BEFORE any charge.",
        "redub.quoting": "⏳ Calculating fee from video length...", "redub.confirmPrefix": "Video length", "redub.confirmSuffix": "Confirm charge and generate?",
        "redub.cancelled": "Cancelled — no credits charged."
      },
      zh: {
        "top.balance": "余额", "top.queue": "渲染队列", "top.queueReady": "就绪",
        "top.login": "登录 / 注册", "top.topup": "💎 充值积分", "top.logout": "退出",
        "top.redubTitle": "为现有视频导出多语字幕 + 配音脚本",
        "auth.login": "登录", "auth.register": "注册账号", "auth.password": "密码",
        "auth.pwPh": "至少8个字符", "auth.name": "昵称（可选）",
        "auth.note": "免费注册，充值积分即可开始创作，无需 API key。", "auth.forgot": "忘记密码？联系客服重置：", "tu.cancelTopup": "取消",
        "auth.okLogin": "登录成功！", "auth.okRegister": "注册成功！充值积分即可开始创作视频。",
        "pw.title": "🔑 修改密码", "pw.current": "当前密码", "pw.new": "新密码（至少8个字符）",
        "pw.submit": "修改密码", "pw.note": "修改后其他设备需重新登录。忘记密码请联系客服重置。",
        "pw.done": "密码已修改，其他设备需重新登录。",
        "tu.title": "💎 充值积分", "tu.note": "转账备注（可选）", "tu.notePh": "例：10:30 已从 ...901 转账",
        "tu.submit": "我已转账 — 提交审核", "tu.sent": "充值申请已提交，管理员核对后将尽快到账。", "tu.history": "📜 积分交易记录", "tu.noHistory": "暂无交易。", "tu.kind.topup": "充值", "tu.kind.render_charge": "生成视频", "tu.kind.render_refund": "退还积分", "tu.kind.admin_adjust": "管理员调整",
        "tu.popular": "⭐ 最受欢迎", "tu.perVideo": "đ/视频", "tu.noExpire": "💎 积分永不过期 — 一次充值，随时使用。",
        "hero.h1": "AI 视频创作", "hero.noSession": "尚未加载会话。",
        "hero.eyebrow": "描述创意、添加参考素材、选择制作模式 — ${brand} 自动生成脚本、分镜、提示词、审核包并渲染。",
        "mode.short": "短视频", "mode.remake": "翻拍", "mode.ugc": "UGC", "mode.long": "长片",
        "s1.title": "告诉 ${brand} 你的创意", "s1.enhance": "✨ 添加四段结构", "s1.brief": "创意简介",
        "s1.briefPh": "描述你想要的视频：领域、产品、达人/人物、参考视频结构、时长、语言、语气、卖点证明和结尾亮点。",
        "s1.starter": "快速模板", "s1.rewrite": "添加结构", "s1.productStarter": "产品模板",
        "s1.beatAlt": " 分为四段：0-3秒钩子，3-7秒证明/演示，7-12秒转变/效果，12-15秒稳定收尾。保持自然运动，无屏幕文字，音频有节奏但静音时画面仍可理解。",
        "s1.beatMain": " 在第一秒加入钩子，中间放证明/演示，结尾清晰收尾，自然的 TikTok 节奏，无屏幕文字，干净的结束点便于审核或续接场景。",
        "s2.title": "添加参考素材", "s2.clear": "清空", "set.styleRegister": "风格", "style.auto": "自动（AI 决定）", "style.ugc": "📱 真人实拍感", "style.cinematic": "🎬 电影感", "style.story": "📖 故事叙事", "style.demo": "🔧 产品演示", "style.education": "🎓 教程", "s2.costRough": "粗略估算（确认时显示准确价格）",
        "s2.kol": "达人 / 人物", "s2.imgRef": "参考图片", "s2.product": "产品", "s2.scene": "场景", "s2.bg": "背景",
        "s2.source": "参考视频", "s2.pattern": "学习结构", "s2.voice": "配音 / 备注", "s2.voiceS": "配音意图",
        "s2.kolUri": "达人图片", "s2.productUri": "产品图片", "s2.bgUri": "场景背景图", "s2.srcUrl": "参考视频链接",
        "s2.upload": "📁 上传", "s2.note": "参考素材 / 配音备注",
        "s2.notePh": "需要保留素材中的哪些元素，或期望的配音风格",
        "s2.wardrobe": "服装参考", "s2.first": "首帧", "s2.last": "尾帧",
        "s2.rights": "素材版权", "s2.rightsOk": "已审核通过", "s2.rightsReview": "需要审核", "s2.rightsUnknown": "未知",
        "s3.title": "学习参考视频结构", "s3.useRemake": "使用翻拍模式", "s3.srcPlatform": "来源平台",
        "s3.pInternal": "${brand} 内部", "s3.pMotion": "动作灵感", "s3.pAds": "广告灵感", "s3.pCustom": "自定义",
        "s3.learning": "学习策略", "s3.structOnly": "仅学习结构和节奏", "s3.closeRemake": "已授权近似翻拍",
        "s3.platform": "发布平台", "s3.flexible": "灵活", "s3.summary": "参考视频结构摘要",
        "s3.summaryPh": "粘贴参考视频结构：开场钩子、节奏、表演、运镜、剪辑节奏、音频节奏和结尾。${brand} 会套用到你自己的达人、产品和场景上。",
        "s4.title": "节奏模板（生成后显示真实分镜）", "s4.refresh": "刷新契约",
        "s4.b1": "1 开场钩子", "s4.b1n": "问题 / 之前状态", "s4.b2": "2 证明", "s4.b2n": "产品 / 动作",
        "s4.b3": "3 转变", "s4.b3n": "变化 / 结果", "s4.b4": "4 收尾", "s4.b4n": "之后 / 轻CTA",
        "set.duration": "时长（秒）", "set.aspect": "画面比例", "set.quality": "画质 / 模型", "set.audio": "配音",
        "set.audioVi": "越南语配音", "set.audioEn": "英语配音", "set.audioZh": "中文配音", "set.audioOff": "关闭",
        "set.bitHigh": "高", "set.bitStd": "标准", "set.lastFrame": "尾帧", "set.auto": "自动", "set.on": "开", "set.off": "关",
        "set.product": "产品 / 主题", "set.productPh": "你的真实产品、服务、频道或故事主题",
        "set.category": "品类", "set.categoryPh": "美妆、时尚、SaaS、美食、教育…",
        "set.claim": "允许的宣称", "set.claimPh": "只填写你能负责或证实的宣称",
        "set.renderPasses": "渲染质量",
        "nav.create": "🎬 AI 视频创作", "nav.series": "📺 连续短剧", "nav.dub": "🌐 配音与字幕", "nav.mine": "📁 我的视频",
        "series.title": "📺 连续短剧（1–200 集）", "series.premise": "故事前提", "series.premisePh": "例：被全家轻视的女佣其实是集团千金，回来复仇...",
        "series.count": "集数", "series.duration": "每集时长（秒）", "series.lang": "对白语言", "series.cast": "角色表（每行：姓名 | 简介）", "series.castPh": "Linh | 23岁，眼神坚定，黑长发",
        "series.create": "📖 创建剧集", "series.preview": "👁 预览下一集（免费）", "series.render": "🎬 渲染下一集",
        "series.needInput": "需要故事前提和至少一个角色。", "series.created": "剧集已创建：", "series.eps": "集",
        "series.previewReady": "分集脚本", "series.epLabel": "第", "series.confirmPrefix": "渲染第", "series.rendering": "正在渲染第", "series.renderWait": "需要几分钟，请勿关闭页面",
        "series.epDone": "完成第", "series.nextHint": "点预览起草下一集。",
        "series.mine": "📚 我的剧集", "series.refresh": "刷新", "series.none": "还没有剧集，请在上方创建。", "series.loginFirst": "登录后查看你的剧集。", "series.downloadEp": "⬇ 下载", "series.resume": "▶ 下一集", "series.resumed": "继续剧集：", "confirm.renderPrefix": "创建此视频将扣除约", "wz.s1": "创意", "wz.s2": "图片和选项", "wz.s3": "确认并创建", "wz.next": "下一步 →", "wz.back": "← 返回", "wz.buildPlan": "查看价格和方案 →", "wz.building": "正在生成方案...", "wz.create": "🎬 创建视频", "wz.reviewTitle": "确认并创建", "wz.reviewHelp": "请检查下方的方案摘要和积分价格。点击\"🎬 创建视频\"将扣除积分并开始渲染（积分足够即刻运行）。想修改请返回。", "wz.reviewEmpty": "在上一步点击\"查看价格和方案\"以生成方案。", "wz.rIdea": "创意", "wz.rPlatform": "平台", "wz.rDuration": "时长", "wz.rQuality": "画质", "wz.rAudio": "配音", "wz.rRefs": "参考图片数", "wz.priceRefund": "创建时扣除，失败退还", "ap.statusTitle": "视频状态", "confirm.renderSuffix": "确认创建并扣除credits？", "toast.starterLoaded": "已加载模板：",
        "help.series": "输入一次故事前提+角色表。系统维护「剧集圣经」：角色面孔、世界观与每集真实剧情都会记录——下一集从上一集的最后画面和悬念处精确续写。每集：预览脚本（免费）→ 渲染（先报价，确认后才扣费；失败按政策退款）。", "set.channelStyle": "频道风格（可选）", "cs.none": "— 不使用 —",
        "q.economy": "经济 — 渲染1版（最便宜）", "q.standard": "标准 — 2版，AI 选更好的", "q.high": "高 — 3版+修复，AI 选最佳", "q.ultimate": "至尊 — 4版+深度修复（最贵）",
        "rb.note": "后端严格锁定成本：未审核确认前不会提交付费渲染。",
        "rb.build": "生成视频方案",
        "rs.starters": "模板库", "rs.mine": "我的作品", "rs.history": "历史", "rs.quick": "快速提示",
        "rs.tip1": "清晰创意", "rs.tip1b": "提示词会变成脚本和分镜。",
        "rs.tip2": "添加参考", "rs.tip2b": "达人、产品、场景、参考视频。",
        "rs.tip3": "成本保护", "rs.tip3b": "审核前不产生渲染费用。",
        "rs.tip4": "审核包", "rs.tip4b": "渲染前一次干净交接。",
        "rs.recent": "最近会话", "rs.noSessions": "暂无会话。",
        "cg.review": "审核检查点", "cg.routing": "Seedance 路由", "cg.media": "媒体参考",
        "cg.creative": "创意模式学习", "cg.blueprint": "翻拍蓝图", "cg.backend": "后端自动步骤",
        "cg.userActions": "需要你操作的事项", "cg.director": "导演",
        "cg.empty": "尚未加载契约。", "cg.emptyRefs": "尚未加载参考。", "cg.emptyRemake": "尚未加载翻拍蓝图。",
        "ap.title": "审核与渲染", "ap.spend": "费用确认", "ap.confirm": "确认提交付费渲染",
        "ap.captions": "根据配音自动生成字幕（匹配脚本，不额外收费）",
        "ap.create": "🎬 生成视频", "ap.stop": "停止跟踪",
        "ap.statusIdle": "暂无渲染任务。先描述创意 → 生成视频方案 → 生成视频。",
        "jp.title": "我的视频", "jp.refresh": "刷新", "jp.queueIdle": "队列：未加载。",
        "jp.emptyHint": "点击刷新加载你的视频。",
        "jp.loadFail": "加载失败 — 请登录后重试。", "jp.empty": "还没有视频。",
        "jp.qQueued": "排队", "jp.qRunning": "进行中", "jp.qPaused": "处理中",
        "jp.stDone": "✅ 完成", "jp.stProcessing": "⏳ 处理中", "jp.stFailed": "未成功",
        "jp.view": "播放", "jp.dl": "下载", "jp.watch": "跟踪", "jp.subdub": "多语字幕 / 配音",
        "jp.dlStarted": "开始下载。", "jp.dlFail": "无法获取视频（任务未完成或文件已清理）。",
        "poll.checkFail": "无法查询视频状态，请重新登录后打开 🎬 视频。", "poll.reconnecting": "网络波动，正在重连...（视频仍在生成）",
        "poll.done": "🎉 视频完成！打开 🎬 视频即可观看和下载。",
        "poll.refundAuto": "积分已自动退还", "poll.refundManual": "退款申请已提交给团队处理",
        "poll.failedPrefix": "❌ 视频生成失败 — ", "poll.tryAgain": "。请重试。",
        "poll.canceledPrefix": "视频已取消 — ", "poll.rejectedPrefix": "视频未通过审核 — ",
        "poll.held": "视频暂被保留以进一步检查 — 团队会尽快处理。",
        "poll.reviewWait": "⏳ 视频正在等待团队审核（通常几分钟）。积分已扣除，失败将退还 — 无需重复提交。页面会自动更新。",
        "poll.finishing": "⏳ 视频正在处理和完善中，请稍候。积分已扣除，失败将退还 — 完成后页面会自动更新。",
        "err.loginFirst": "请先登录（上方按钮）再上传文件。",
        "err.uploadTooBig": "文件太大（最大 25MB），请压缩后重试。",
        "err.needSession": "创建视频前请先创建或打开一个会话。",
        "ok.renderCreated": "已创建视频任务", "ok.reviewPlan": "已创建计划。视频需经批准后才会生成。",
        "up.done1": "已上传 “", "up.done2": "” — 参考字段已自动填写。",
        "err.loginCreate": "请先登录（上方 登录/注册）再创建视频。",
        "err.needIdea": "请先输入视频创意。",
        "ce.cost": "预计费用：", "ce.balance": "余额：", "ce.from": "🎬 AI 视频低至", "ce.needTopup": "⚠️ 充值后才能生成",
        "ce.refundAuto": "失败视频将自动退还积分。", "wz.acceptableUse": "创建视频即表示您确认内容不违反法律或政策（禁止儿童色情、色情、血腥暴力、恐怖主义、违禁品内容）。违规请求将被拒绝。", "ce.refundManual": "失败视频将由团队审核后退还积分。",
        "help.t": "💡 快速指南",
        "help.idea": "像跟朋友聊天一样描述：卖什么 / 给谁看 / 视频长什么样 / 结尾亮点。产品和情绪越具体，越容易爆。支持越南语、中文、英文。",
        "help.ref": "达人图锁定人脸；产品图锁定产品；场景图锁定空间；参考视频只学结构节奏（不抄内容）。点 📁 从手机/电脑上传，字段自动填写。",
        "help.settings": "时长 × 画质决定积分价格（创建按钮下方实时显示）。TikTok/Reels 用 9:16。'配音'选择解说语言；字幕在最后一步开启。",
        "help.topup": "选择套餐 → 按显示内容转账 → 点确认。管理员审核后积分到账（通常几分钟）。重复提交会自动合并，不会重复扣款。",
        "help.approval": "点击'生成视频'即扣除积分并进入队列（部分视频需团队快速审核）。失败视频按按钮下方的退款政策处理。",
        "help.redub": "选择视频（用 📁 上传，或对已完成视频点 🌐）。选择语言。系统听写 → 翻译 → 勾选“🔊 自动配音”后，AI 语音朗读解说并直接混入视频，返回 dubbed.mp4、各语言 .srt 字幕和配音脚本。原声在解说下方压低（影评风格）或完全替换——在“原声处理”中选择。只需字幕+脚本时取消勾选（更便宜）。",
        "redub.renderVideo": "🔊 自动为视频配音（获得 dubbed.mp4）",
        "redub.renderVideoHint": "只需字幕+脚本时取消勾选（更便宜）。勾选后 AI 语音朗读解说并直接混入视频。",
        "redub.downloadVideo": "⬇ 下载配音视频 (dubbed.mp4)",
        "redub.title": "🌐 多语字幕 + 配音脚本", "redub.source": "源视频",
        "redub.sourcePh": "点 📁 上传视频，或在已完成视频上点 🌐",
        "redub.fromJob": "来源：已渲染视频", "redub.srcLang": "原语言", "redub.auto": "自动识别",
        "redub.dubLang": "配音语言", "redub.subs": "额外字幕语言（可多选）",
        "redub.voice": "配音风格（可选）", "redub.voicePh": "例：温暖自然的女声测评腔",
        "redub.mix": "原声处理", "redub.mixDuck": "保留背景音，配音时压低", "redub.mixReplace": "完全替换为新配音",
        "redub.run": "🌐 翻译并生成字幕", "redub.running": "⏳ 正在听写和翻译（1-3分钟）…",
        "redub.needSource": "请先选择视频：用 📁 上传，或在已完成视频上点 🌐。",
        "redub.done": "✅ 完成：", "redub.segments": "段语音", "redub.script": "配音脚本（含时间轴）：",
        "redub.price1": "费用：", "redub.priceOp": "使用运营密钥免费。", "redub.credits": "积分/次",
        "redub.priceBasis": "费用 = 视频时长（秒）× 每秒单价。扣费前会显示确切金额供你确认。",
        "redub.quoting": "⏳ 正在按视频时长计算费用...", "redub.confirmPrefix": "视频时长", "redub.confirmSuffix": "确认扣费并生成？",
        "redub.cancelled": "已取消 — 未扣除积分。"
      }
    };
    function t(key) {
      const dict = I18N[currentLang] || I18N.vi;
      if (dict[key] !== undefined) { return dict[key]; }
      return I18N.vi[key] !== undefined ? I18N.vi[key] : key;
    }
    function applyI18n() {
      const dict = I18N[currentLang] || I18N.vi;
      document.querySelectorAll("[data-i18n]").forEach(function (node) {
        // Live regions (session id, live render status) carry a data-i18n only for their
        // INITIAL placeholder text. Once JS has written a live value into them, skip them so
        // a language switch never clobbers the session id or an in-flight job status with a
        // stale placeholder. They stay in their last language until the next live update.
        if (node.dataset.i18nLive === "1") { return; }
        const key = node.dataset.i18n;
        if (dict[key] !== undefined) { node.textContent = dict[key]; }
        else if (I18N.vi[key] !== undefined) { node.textContent = I18N.vi[key]; }
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach(function (node) {
        const key = node.dataset.i18nPlaceholder;
        if (dict[key] !== undefined) { node.placeholder = dict[key]; }
        else if (I18N.vi[key] !== undefined) { node.placeholder = I18N.vi[key]; }
      });
      document.querySelectorAll("[data-i18n-title]").forEach(function (node) {
        const key = node.dataset.i18nTitle;
        if (dict[key] !== undefined) { node.title = dict[key]; }
        else if (I18N.vi[key] !== undefined) { node.title = I18N.vi[key]; }
      });
      document.documentElement.lang = currentLang === "zh" ? "zh-Hans" : currentLang;
    }
    function setupI18n() {
      const switcher = document.getElementById("lang-switch");
      if (switcher) {
        switcher.value = currentLang;
        switcher.addEventListener("change", function () {
          currentLang = switcher.value === "en" ? "en" : switcher.value === "zh" ? "zh" : "vi";
          try { window.localStorage.setItem("cinejelly_lang", currentLang); } catch (error) { /* memory only */ }
          applyI18n();
          updateAccountUi();
          updateRedubPriceLine();
        });
      }
      applyI18n();
    }
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
      if (!accountInfo || !accountInfo.account) {
        showError("Hãy đăng nhập để xem các phiên làm việc của bạn.");
        document.getElementById("auth-modal").hidden = false;
        return;
      }
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
    setupApiKeyMemory();
    setupAccountUi();
    setupI18n();
    refreshAccount();
    // Balance keeps itself fresh: approved top-ups and render charges appear without a
    // manual reload (30s poll only while logged in; silent when offline).
    setInterval(function () { if (readSessionToken()) { refreshAccount(); } }, 30000);
    try {
      if (window.localStorage.getItem("cinejelly_api_key")) {
        document.getElementById("admin-key-wrap").hidden = false;
      }
    } catch (error) { /* ignore */ }

    // Owner-friendly single-operator flow: the key is pasted once and remembered on THIS
    // machine (browser localStorage) so reopening the page never asks again. The secret is
    // never embedded in the page itself — the served HTML is public to anyone who can
    // reach the server. The ✕ button forgets it (shared computers).
    function setupApiKeyMemory() {
      const KEY_STORAGE = "cinejelly_api_key";
      const input = document.getElementById("api-key");
      const forgetButton = document.getElementById("forget-api-key");
      if (!input) return;
      try {
        const saved = window.localStorage.getItem(KEY_STORAGE);
        if (saved && !input.value) {
          input.value = saved;
        }
      } catch (error) { /* storage may be unavailable (private mode); typing still works */ }
      input.addEventListener("change", () => {
        try {
          const value = input.value.trim();
          if (value) {
            window.localStorage.setItem(KEY_STORAGE, value);
          }
        } catch (error) { /* ignore */ }
      });
      if (forgetButton) {
        forgetButton.addEventListener("click", () => {
          try { window.localStorage.removeItem(KEY_STORAGE); } catch (error) { /* ignore */ }
          input.value = "";
          input.focus();
          showSuccess("Đã xoá key khỏi máy này. Dán key mới khi cần dùng tiếp.");
        });
      }
    }
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
    document.getElementById("open-jobs-top").addEventListener("click", () => {
      const panel = document.getElementById("jobs-panel");
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        loadJobs();
        panel.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
    document.getElementById("open-redub-top").addEventListener("click", function () {
      redubJobId = "";
      document.getElementById("redub-job-line").hidden = true;
      openRedubModal();
    });
    document.getElementById("redub-run").addEventListener("click", runRedub);
    // Top tabs: My Creations mở danh sách video, History cuộn tới phiên gần đây, Starters là mặc định.
    function activateTopTab(tab) {
      ["tab-starters", "tab-mine", "tab-history"].forEach(function (id) {
        const node = document.getElementById(id);
        if (node) { node.classList.toggle("active", id === tab); }
      });
    }
    document.getElementById("tab-starters").addEventListener("click", function () {
      activateTopTab("tab-starters");
      const grid = document.querySelector(".template-grid");
      if (grid) { grid.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    document.getElementById("tab-mine").addEventListener("click", function () {
      activateTopTab("tab-mine");
      const panel = document.getElementById("jobs-panel");
      panel.hidden = false;
      loadJobs();
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.getElementById("tab-history").addEventListener("click", function () {
      activateTopTab("tab-history");
      const sessions = document.getElementById("sessions");
      if (sessions) { sessions.scrollIntoView({ behavior: "smooth", block: "start" }); }
    });
    // Bộ lọc mẫu: All/UGC/Fashion/Product ẩn-hiện thẻ theo data-category.
    document.querySelectorAll("#template-filter-tabs [data-template-filter]").forEach(function (tabButton) {
      tabButton.addEventListener("click", function () {
        const filter = tabButton.dataset.templateFilter;
        document.querySelectorAll("#template-filter-tabs .template-tab").forEach(function (node) {
          node.classList.toggle("active", node === tabButton);
        });
        document.querySelectorAll(".template-card[data-template-apply]").forEach(function (card) {
          card.style.display = filter === "all" || card.dataset.category === filter ? "" : "none";
        });
      });
    });
    // ---- Điều hướng sản phẩm: 4 đích rõ ràng, mỗi đích một việc.
    function activateNav(id) {
      ["nav-create", "nav-series", "nav-dub", "nav-mine"].forEach(function (navId) {
        const node = document.getElementById(navId);
        if (node) { node.classList.toggle("active", navId === id); }
      });
    }
    document.getElementById("nav-create").addEventListener("click", function () {
      activateNav("nav-create");
      document.getElementById("series-panel").hidden = true;
      const composer = document.getElementById("prompt");
      if (composer) { composer.scrollIntoView({ behavior: "smooth", block: "center" }); composer.focus(); }
    });
    document.getElementById("nav-series").addEventListener("click", function () {
      activateNav("nav-series");
      const panel = document.getElementById("series-panel");
      panel.hidden = false;
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      loadMySeries();
    });
    document.getElementById("nav-dub").addEventListener("click", function () {
      activateNav("nav-dub");
      redubJobId = "";
      document.getElementById("redub-job-line").hidden = true;
      openRedubModal();
    });
    document.getElementById("nav-mine").addEventListener("click", function () {
      activateNav("nav-mine");
      const panel = document.getElementById("jobs-panel");
      panel.hidden = false;
      loadJobs();
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    // ---- Phim dài tập: tạo bộ → xem trước tập kế (miễn phí) → render (báo giá, xác nhận mới trừ).
    let seriesId = "";
    let seriesEpisodeNumber = 0;
    function setSeriesStatus(text) { document.getElementById("series-status").textContent = text; }
    function parseSeriesCast() {
      return document.getElementById("series-cast").value.split("\n")
        .map(function (line) { return line.trim(); })
        .filter(Boolean)
        .slice(0, 8)
        .map(function (line, index) {
          const parts = line.split("|");
          const name = (parts[0] || "").trim();
          const description = (parts[1] || "").trim() || name;
          const characterId = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || ("nv_" + (index + 1));
          return { characterId, name, castRole: index === 0 ? "protagonist" : "support", description };
        })
        .filter(function (member) { return member.name; });
    }
    document.getElementById("series-create").addEventListener("click", async function () {
      const premise = document.getElementById("series-premise").value.trim();
      const cast = parseSeriesCast();
      if (!premise || cast.length === 0) { setSeriesStatus(t("series.needInput")); return; }
      try {
        const created = await apiFetch("/v1/series", { method: "POST", body: JSON.stringify({
          premise,
          episodeCount: Math.max(1, Math.min(200, Number(document.getElementById("series-count").value) || 12)),
          episodeDurationSeconds: Math.max(15, Math.min(480, Number(document.getElementById("series-duration").value) || 60)),
          language: document.getElementById("series-lang").value,
          cast
        }) });
        seriesId = created.seriesId;
        document.getElementById("series-preview").disabled = false;
        setSeriesStatus(t("series.created") + " " + created.seriesId + " (" + created.episodeCount + " " + t("series.eps") + ")");
      } catch (error) { setSeriesStatus("⚠ " + (error instanceof Error ? error.message : String(error))); }
    });
    document.getElementById("series-preview").addEventListener("click", async function () {
      if (!seriesId) { return; }
      try {
        const preview = await apiFetch("/v1/series/" + encodeURIComponent(seriesId) + "/episodes/next/preview", { method: "POST", body: JSON.stringify({}) });
        seriesEpisodeNumber = preview.episodeNumber;
        const box = document.getElementById("series-preview-box");
        box.value = t("series.epLabel") + " " + preview.episodeNumber + "\n\n" + preview.userInput;
        box.hidden = false;
        document.getElementById("series-render").disabled = false;
        setSeriesStatus(t("series.previewReady") + " " + preview.episodeNumber + ".");
      } catch (error) { setSeriesStatus("⚠ " + (error instanceof Error ? error.message : String(error))); }
    });
    document.getElementById("series-render").addEventListener("click", async function () {
      if (!seriesId) { return; }
      const renderButton = document.getElementById("series-render");
      renderButton.disabled = true;
      try {
        const quoted = await apiFetch("/v1/series/" + encodeURIComponent(seriesId) + "/episodes/next", { method: "POST", body: JSON.stringify({}) });
        if (quoted && quoted.status === "quote" && quoted.quote) {
          const okToPay = window.confirm(t("series.confirmPrefix") + " " + quoted.episodeNumber + ": " + Number(quoted.quote.credits || 0).toLocaleString("vi-VN") + " credits. " + t("redub.confirmSuffix"));
          if (!okToPay) { setSeriesStatus(t("redub.cancelled")); return; }
          setSeriesStatus(t("series.rendering") + " " + quoted.episodeNumber + "... (" + t("series.renderWait") + ")");
          const rendered = await apiFetch("/v1/series/" + encodeURIComponent(seriesId) + "/episodes/next", { method: "POST", body: JSON.stringify({ acknowledgedCredits: quoted.quote.credits }) });
          setSeriesStatus("✅ " + t("series.epDone") + " " + rendered.episodeNumber + " (project " + rendered.projectId + ", -" + (rendered.creditsCharged || 0) + " credits). " + t("series.nextHint"));
          refreshAccount();
          loadMySeries();
        } else if (quoted && quoted.episodeNumber) {
          // Key vận hành: render chạy thẳng không cần quote.
          setSeriesStatus("✅ " + t("series.epDone") + " " + quoted.episodeNumber + ".");
          loadMySeries();
        }
        document.getElementById("series-preview").disabled = false;
        document.getElementById("series-preview-box").hidden = true;
      } catch (error) {
        setSeriesStatus("⚠ " + (error instanceof Error ? error.message : String(error)));
      } finally {
        renderButton.disabled = false;
      }
    });
    document.getElementById("series-refresh").addEventListener("click", loadMySeries);
    // Tải file video (route có xác thực) → blob → lưu về máy. Dùng chung cho tập phim + về sau.
    async function authedDownload(url, filename) {
      const resp = await fetch(url, { headers: authHeaders() });
      if (!resp.ok) { throw new Error("HTTP " + resp.status); }
      const blob = await resp.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 15000);
    }
    async function loadMySeries() {
      const container = document.getElementById("series-list");
      if (!container) { return; }
      if (!readSessionToken()) { container.innerHTML = ""; const e = document.createElement("div"); e.className = "empty"; e.textContent = t("series.loginFirst"); container.appendChild(e); return; }
      try {
        const payload = await apiFetch("/v1/series", { method: "GET" });
        const list = (payload && payload.series) || [];
        container.textContent = "";
        if (list.length === 0) { const e = document.createElement("div"); e.className = "empty"; e.textContent = t("series.none"); container.appendChild(e); return; }
        list.forEach(function (s) {
          const card = document.createElement("div");
          card.className = "panel";
          card.style.cssText = "margin-top:8px;padding:10px";
          const head = document.createElement("div");
          head.style.cssText = "font-weight:600;margin-bottom:4px";
          head.textContent = "📺 " + String(s.premise || s.seriesId).slice(0, 80) + " — " + (s.recordedEpisodes || 0) + "/" + (s.episodeCount || "?") + " " + t("series.eps");
          card.appendChild(head);
          (s.episodes || []).forEach(function (ep) {
            const row = document.createElement("div");
            row.className = "detail";
            row.style.cssText = "display:flex;gap:8px;align-items:center;margin-top:4px;flex-wrap:wrap";
            const label = document.createElement("span");
            label.textContent = t("series.epLabel") + " " + ep.episodeNumber + ": " + String(ep.summary || "").slice(0, 70);
            row.appendChild(label);
            if (ep.hasVideo && ep.videoUrl) {
              const dl = document.createElement("button");
              dl.type = "button"; dl.className = "mini-btn"; dl.textContent = t("series.downloadEp");
              dl.addEventListener("click", async function () {
                dl.disabled = true;
                try { await authedDownload(ep.videoUrl, s.seriesId + "_ep" + ep.episodeNumber + ".mp4"); }
                catch (error) { showError(error instanceof Error ? error.message : String(error)); }
                finally { dl.disabled = false; }
              });
              row.appendChild(dl);
            }
            card.appendChild(row);
          });
          const resumeButton = document.createElement("button");
          resumeButton.type = "button"; resumeButton.className = "mini-btn"; resumeButton.style.marginTop = "6px";
          resumeButton.textContent = t("series.resume");
          resumeButton.addEventListener("click", function () {
            seriesId = s.seriesId;
            document.getElementById("series-preview").disabled = false;
            setSeriesStatus(t("series.resumed") + " " + s.seriesId + " (" + (s.recordedEpisodes || 0) + "/" + (s.episodeCount || "?") + ").");
          });
          card.appendChild(resumeButton);
          container.appendChild(card);
        });
      } catch (error) {
        void error;
      }
    }

    // ---- Wizard 3 bước: mỗi lúc hiện 1 bước, dẫn dắt khách không rành ----
    let wizardStep = 1;
    function showWizardStep(n) {
      wizardStep = n;
      document.querySelectorAll(".wizard-step").forEach(function (el) { el.classList.toggle("wizard-active", Number(el.dataset.step) === n); });
      document.querySelectorAll("#wizard-steps .wstep").forEach(function (el) {
        const s = Number(el.dataset.wstep);
        el.classList.toggle("active", s === n);
        el.classList.toggle("done", s < n);
      });
      const back = document.getElementById("wz-back"), next = document.getElementById("wz-next"), create = document.getElementById("wz-create");
      back.hidden = n === 1; next.hidden = n === 3; create.hidden = n !== 3;
      next.textContent = n === 2 ? t("wz.buildPlan") : t("wz.next");
      // Nút "Xem giá & kế hoạch" gốc trong render-bar chỉ dành operator; khách dùng nút wizard.
      const rb = document.getElementById("create-session"); if (rb) { rb.style.display = "none"; }
      if (n === 3) { updateWizardReview(); }
      const form = document.getElementById("brief-form"); if (form && form.scrollIntoView) { form.scrollIntoView({ behavior: "smooth", block: "start" }); }
    }
    function updateWizardReview() {
      const box = document.getElementById("wizard-review");
      const g = function (id) { const e = document.getElementById(id); return e ? (e.value || "").trim() : ""; };
      const qSel = document.getElementById("quality-mode");
      const qLabel = qSel && qSel.options[qSel.selectedIndex] ? qSel.options[qSel.selectedIndex].textContent : "";
      const refCount = ["kol-reference", "product-reference", "background-reference", "reference-url", "wardrobe-reference", "first-frame-reference", "last-frame-reference"].filter(function (id) { return g(id); }).length;
      const rows = [
        [t("wz.rIdea"), (g("prompt") || "—").slice(0, 90)],
        [t("wz.rPlatform"), g("platform") || "tiktok"],
        [t("wz.rDuration"), (g("duration") || "15") + "s"],
        [t("wz.rQuality"), qLabel],
        [t("wz.rAudio"), (document.getElementById("audio") || {}).value || "vi"],
        [t("wz.rRefs"), String(refCount)]
      ];
      box.textContent = "";
      rows.forEach(function (r) {
        const row = document.createElement("div"); row.className = "rv-row";
        const k = document.createElement("span"); k.className = "rv-k"; k.textContent = r[0];
        const v = document.createElement("span"); v.className = "rv-v"; v.textContent = r[1];
        row.appendChild(k); row.appendChild(v); box.appendChild(row);
      });
      // Giá credits (nếu đăng nhập): dùng đúng công thức đang trừ.
      const price = document.getElementById("wizard-price"), amt = document.getElementById("wizard-price-amount"), note = document.getElementById("wizard-price-note");
      if (accountInfo && accountInfo.account) {
        const secs = Math.max(1, Number(g("duration") || 15) || 15);
        const tier = (accountInfo.pipelinePricing && accountInfo.pipelinePricing.cheapestTier) || "mini";
        const credits = meteredCredits(secs, tier, qSel ? qSel.value : "economy");
        const vnd = creditsToVnd(credits);
        amt.textContent = "~" + credits.toLocaleString("vi-VN") + " credits";
        note.textContent = (vnd ? "(~" + vnd.toLocaleString("vi-VN") + "đ) " : "") + t("wz.priceRefund") + " • " + t("ce.balance") + " " + accountInfo.account.balanceCredits.toLocaleString("vi-VN") + " 💎";
        price.hidden = false;
      } else { price.hidden = true; }
    }
    document.getElementById("wz-next").addEventListener("click", async function () {
      if (wizardStep === 1) { showWizardStep(2); return; }
      if (wizardStep === 2) {
        const next = document.getElementById("wz-next");
        next.disabled = true; next.textContent = t("wz.building");
        try { await createSession(); if (activeSessionId) { showWizardStep(3); } }
        catch (error) { void error; }
        finally { next.disabled = false; next.textContent = t("wz.buildPlan"); }
      }
    });
    document.getElementById("wz-back").addEventListener("click", function () { if (wizardStep > 1) { showWizardStep(wizardStep - 1); } });
    document.getElementById("wz-create").addEventListener("click", function () {
      // Đồng bộ tuỳ chọn phụ đề của bước 3 sang checkbox mà submitRender đọc, rồi tạo video.
      const wz = document.getElementById("caption-toggle-wz"), main = document.getElementById("caption-toggle");
      if (wz && main) { main.checked = wz.checked; }
      submitRender();
    });
    showWizardStep(1);

    updatePromptCount();
    updateEstimatedCost();
    // Danh sách "Phong cách kênh" đã lưu (nếu đăng nhập): nạp im lặng, lỗi thì bỏ qua.
    (async function loadChannelStyles() {
      const select = document.getElementById("channel-style");
      if (!select) { return; }
      try {
        const listResp = await fetch("/v1/short-pipeline/channel-styles", { headers: authHeaders() });
        if (!listResp.ok) { return; }
        const payload = await listResp.json();
        const profiles = payload.channelStyles || payload.profiles || payload.records || [];
        profiles.forEach(function (profile) {
          const id = profile.profileId || profile.id || "";
          if (!id) { return; }
          const option = document.createElement("option");
          option.value = id;
          // Server summary fields are channelName/seriesName/niche (không phải name/label).
          option.textContent = profile.channelName || profile.seriesName || profile.niche || profile.name || id;
          select.appendChild(option);
        });
      } catch (error) {
        void error;
      }
    })();

    let jobPollTimer = null;
    let jobPollDelayMs = 3000;
    let jobPollFailures = 0;

    function setRenderStatus(text) {
      const node = document.getElementById("render-status");
      node.textContent = text;
      // Mark as a live region so a later language switch won't overwrite this live status
      // with the idle placeholder (see applyI18n).
      node.dataset.i18nLive = "1";
    }

    function setSessionLine(text) {
      const node = document.getElementById("session-line");
      node.textContent = text;
      // Live region: keep the real session id across a language switch (see applyI18n).
      node.dataset.i18nLive = "1";
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
        showError(t("err.needSession"));
        return;
      }
      const submitButton = document.getElementById("submit-render");
      if (submitButton.disabled) {
        return;
      }
      // Money confirmation for CUSTOMERS: this click charges credits, so show the exact cost and
      // require an explicit OK first (mirrors Series/Dub). Operators keep the checkbox-driven flow.
      const isOperator = (function () { const k = document.getElementById("api-key"); return Boolean(k && k.value.trim()) && !(accountInfo && accountInfo.account); })();
      const qualitySelectEl = document.getElementById("quality-mode");
      const qualityModeSel = qualitySelectEl ? qualitySelectEl.value : "economy";
      if (!isOperator && accountInfo && accountInfo.account) {
        const durEl = document.getElementById("duration");
        const secs = Math.max(1, Number(durEl && durEl.value ? durEl.value : 15) || 15);
        const tier = (accountInfo.pipelinePricing && accountInfo.pipelinePricing.cheapestTier) || "mini";
        const estCredits = meteredCredits(secs, tier, qualityModeSel);
        const vnd = creditsToVnd(estCredits);
        const msg = t("confirm.renderPrefix") + " ~" + estCredits.toLocaleString("vi-VN") + " credits"
          + (vnd ? " (~" + vnd.toLocaleString("vi-VN") + "đ)" : "") + ". " + t("confirm.renderSuffix");
        if (!window.confirm(msg)) { return; }
      }
      submitButton.disabled = true;
      const submitLabel = submitButton.textContent;
      submitButton.textContent = "Đang gửi...";
      stopJobPolling();
      // One idempotency key per submission intent: a flaky-network retry can never
      // create (and charge) a second job for the same click.
      if (!window.__cjRenderIdempotencyKey) {
        window.__cjRenderIdempotencyKey = "ui_" + (window.crypto && crypto.randomUUID ? crypto.randomUUID() : Date.now() + "_" + Math.random().toString(16).slice(2));
      }
      try {
        // Customers confirmed via the dialog above; operators use the explicit checkbox.
        const confirmRender = isOperator ? document.getElementById("confirm-render").checked : true;
        const captionsOn = document.getElementById("caption-toggle").checked;
        const qualityMode = qualityModeSel;
        const review = collectReviewApproval();
        // Gửi lại đúng các ảnh/video tham chiếu đang có trên form: bản kế hoạch chỉ lưu mã băm của
        // link https (chính sách riêng tư), nên server cần bản gốc lúc render để khớp lại — thiếu nó
        // link https dán tay bị âm thầm bỏ khỏi video (audit: session route thiếu mediaReferenceInputs).
        const renderMediaReferences = mediaReferencesPayload();
        const body = {
          ...(review ? { reviewApprovalGate: review.gate, reviewApprovalCheckpoints: review.checkpoints } : {}),
          ...(captionsOn ? { captionPreference: "narration_subtitles" } : {}),
          ...(renderMediaReferences.length ? { mediaReferences: renderMediaReferences } : {}),
          // Chất lượng khách chọn quyết định số bản render (best-of-N) và được tính đúng giá đó.
          settings: { qualityMode },
          confirmRenderSubmission: confirmRender
        };
        const endpoint = endpoints.render.replace("{sessionId}", encodeURIComponent(activeSessionId));
        setRenderStatus("Đang gửi yêu cầu tạo video...");
        const response = await apiFetch(endpoint, {
          method: "POST",
          body: JSON.stringify(body),
          headers: { "Idempotency-Key": window.__cjRenderIdempotencyKey }
        });
        window.__cjRenderIdempotencyKey = null;
        const jobId = response.jobId || (response.job && response.job.jobId) || "";
        const statusUrl = response.statusUrl || (jobId ? "/v1/render-jobs/" + encodeURIComponent(jobId) : "");
        showSuccess(t("ok.renderCreated") + (jobId ? " (" + jobId + ")" : "") + ".");
        if (statusUrl) {
          jobPollDelayMs = 3000;
          pollRenderJob(statusUrl);
        } else {
          setRenderStatus("Đã tạo job nhưng thiếu đường dẫn trạng thái; mở mục Video của tôi để theo dõi.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const needTopup = message.indexOf("Số dư không đủ") >= 0;
        setRenderStatus("⚠ " + message + (needTopup ? " — bấm nút 💎 Nạp credits phía trên." : ""));
        throw error;
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
    // Customer-facing status label: never expose raw internal statuses like
    // "paused_for_operator". Every in-progress / held state reads as "đang hoàn thiện".
    function customerStatusLabel(status) {
      if (status === "succeeded") return t("jp.stDone");
      if (status === "failed" || status === "canceled" || status === "rejected") return t("jp.stFailed");
      return t("jp.stProcessing");
    }

    async function loadJobs() {
      clearMessages();
      const queueNode = document.getElementById("jobs-queue");
      const listNode = document.getElementById("jobs-list");
      let response;
      try {
        response = await apiFetch("/v1/render-jobs");
      } catch (error) {
        listNode.innerHTML = '<div class="empty">' + escapeHtml(t("jp.loadFail")) + '</div>';
        return;
      }
      const queue = response.queue || {};
      queueNode.textContent = "Queue: " +
        (queue.queuedJobCount ?? 0) + " " + t("jp.qQueued") + " | " +
        (queue.runningJobCount ?? 0) + " " + t("jp.qRunning") + " | " +
        (queue.pausedJobCount ?? 0) + " " + t("jp.qPaused");
      const jobs = response.jobs || [];
      if (jobs.length === 0) {
        listNode.innerHTML = '<div class="empty">' + escapeHtml(t("jp.empty")) + '</div>';
        return;
      }
      listNode.innerHTML = jobs.map((job) => {
        const shortId = escapeHtml(String(job.jobId || "").slice(0, 24));
        const status = escapeHtml(String(job.status || "unknown"));
        const created = job.createdAt ? escapeHtml(String(job.createdAt).replace("T", " ").slice(0, 19)) : "";
        const preview = escapeHtml(String(job.userInputPreview || "").slice(0, 90));
        const jobIdAttr = escapeAttribute(String(job.jobId || ""));
        const finishedButtons = String(job.status || "") === "succeeded"
          ? '<button class="mini-btn" type="button" onclick="playJob(\'' + jobIdAttr + '\')">' + escapeHtml(t("jp.view")) + '</button>' +
            '<button class="mini-btn" type="button" onclick="downloadJob(\'' + jobIdAttr + '\')">' + escapeHtml(t("jp.dl")) + '</button>' +
            '<button class="mini-btn" type="button" onclick="openRedubForJob(\'' + jobIdAttr + '\')" title="' + escapeAttribute(t("jp.subdub")) + '">🌐</button>'
          : "";
        return '<article class="item"><div class="row"><div>' +
          '<div class="title">' + shortId + '…</div>' +
          '<div class="detail">' + created + (preview ? " | " + preview : "") + '</div>' +
          '</div><div style="display:flex;gap:8px;align-items:center">' +
          '<span class="' + jobStatusPillClass(String(job.status || "")) + '">' + escapeHtml(customerStatusLabel(String(job.status || ""))) + '</span>' +
          finishedButtons +
          '<button class="mini-btn" type="button" onclick="watchJob(\'' + jobIdAttr + '\')">' + escapeHtml(t("jp.watch")) + '</button>' +
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
      const response = await fetch("/v1/render-jobs/" + encodeURIComponent(jobId) + "/deliverable", {
        headers: authHeaders()
      });
      if (!response.ok) {
        showError(t("jp.dlFail"));
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
      showSuccess(t("jp.dlStarted"));
    }
    window.downloadJob = downloadJob;

    // ---- Dịch phụ đề / thuyết minh video (redub) ----
    let redubJobId = "";
    function updateRedubPriceLine() {
      const line = document.getElementById("redub-price-line");
      if (!line) { return; }
      const loggedIn = Boolean(accountInfo && accountInfo.account);
      const keyEl = document.getElementById("api-key");
      if (!loggedIn && keyEl && keyEl.value.trim()) { line.textContent = t("redub.priceOp"); return; }
      // Honest basis: redub is billed by the source video's real length (not a flat rate). We can't
      // know that length until the server probes the file, so we state the rule and defer the exact
      // number to the confirm step — never a misleading "~50 credits".
      const balance = accountInfo && accountInfo.account ? accountInfo.account.balanceCredits : 0;
      line.textContent = t("redub.priceBasis") +
        (loggedIn ? " (" + t("ce.balance") + " " + balance.toLocaleString("vi-VN") + " 💎)" : "");
    }
    function openRedubModal() {
      clearMessages();
      if (!accountInfo || !accountInfo.account) {
        const keyEl = document.getElementById("api-key");
        if (!(keyEl && keyEl.value.trim())) {
          showError(t("err.loginCreate"));
          document.getElementById("auth-modal").hidden = false;
          return;
        }
      }
      updateRedubPriceLine();
      document.getElementById("redub-error").hidden = true;
      document.getElementById("redub-modal").hidden = false;
    }
    function openRedubForJob(jobId) {
      redubJobId = String(jobId || "");
      document.getElementById("redub-source").value = "";
      const jobLine = document.getElementById("redub-job-line");
      jobLine.textContent = t("redub.fromJob") + " " + redubJobId.slice(0, 28) + "…";
      jobLine.hidden = false;
      openRedubModal();
    }
    window.openRedubForJob = openRedubForJob;
    async function runRedub() {
      const errorNode = document.getElementById("redub-error");
      errorNode.hidden = true;
      const sourceValue = document.getElementById("redub-source").value.trim();
      const body = {};
      if (sourceValue.indexOf("upload://") === 0) { body.uploadUri = sourceValue; }
      else if (redubJobId) { body.jobId = redubJobId; }
      else {
        errorNode.textContent = t("redub.needSource");
        errorNode.hidden = false;
        return;
      }
      body.dubLanguage = document.getElementById("redub-dub-language").value;
      const redubSrc = document.getElementById("redub-source-language").value;
      if (redubSrc && redubSrc !== "auto") { body.sourceLanguage = redubSrc; }
      body.subtitleLanguages = Array.prototype.slice.call(document.querySelectorAll("#redub-subtitle-langs input:checked")).map(function (node) { return node.value; });
      const voiceStyle = document.getElementById("redub-voice-style").value.trim();
      if (voiceStyle) { body.voiceStyle = voiceStyle; }
      body.originalAudioTreatment = document.getElementById("redub-audio-treatment").value;
      const renderVideoBox = document.getElementById("redub-render-video");
      if (renderVideoBox && renderVideoBox.checked) { body.renderVideo = true; }
      const runButton = document.getElementById("redub-run");
      if (runButton.dataset.busy === "true") { return; }
      runButton.dataset.busy = "true";
      runButton.disabled = true;
      runButton.textContent = t("redub.quoting");
      try {
        // Step 1 — QUOTE: the server probes the real source duration and returns the exact cost
        // WITHOUT charging. A customer must see and confirm the true number before any credit moves.
        const quoteResp = await fetch("/v1/redub/plans", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders() },
          body: JSON.stringify(body)
        });
        const quotePayload = await quoteResp.json();
        if (!quoteResp.ok) { throw new Error(quotePayload.error || ("HTTP " + quoteResp.status)); }
        if (quotePayload && quotePayload.status === "quote" && quotePayload.quote) {
          const q = quotePayload.quote;
          const confirmMsg = t("redub.confirmPrefix") + " " + Number(q.billableSeconds || 0).toLocaleString("vi-VN") +
            "s → " + Number(q.credits || 0).toLocaleString("vi-VN") + " credits. " + t("redub.confirmSuffix");
          if (!window.confirm(confirmMsg)) {
            errorNode.textContent = t("redub.cancelled");
            errorNode.hidden = false;
            return;
          }
          // Step 2 — CONFIRM: re-submit echoing the exact quoted credits; only now does the server charge + run.
          runButton.textContent = t("redub.running");
          body.acknowledgedCredits = q.credits;
          const runResp = await fetch("/v1/redub/plans", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(body)
          });
          const runPayload = await runResp.json();
          if (!runResp.ok) { throw new Error(runPayload.error || ("HTTP " + runResp.status)); }
          renderRedubResult(runPayload);
          refreshAccount();
          return;
        }
        // Operator key (no per-run charge) gets the result directly with no quote step.
        renderRedubResult(quotePayload);
        refreshAccount();
      } catch (error) {
        errorNode.textContent = error instanceof Error ? error.message : String(error);
        errorNode.hidden = false;
      } finally {
        runButton.dataset.busy = "false";
        runButton.disabled = false;
        runButton.textContent = t("redub.run");
      }
    }
    function renderRedubResult(payload) {
      const container = document.getElementById("redub-result");
      container.textContent = "";
      const summaryLine = document.createElement("div");
      summaryLine.className = "detail";
      const segments = payload.summary && payload.summary.segmentCount ? payload.summary.segmentCount : 0;
      summaryLine.textContent = t("redub.done") + " " + String(payload.sourceLanguage || "?").toUpperCase() + " → " + String(payload.dubLanguage || "?").toUpperCase() +
        " | " + segments + " " + t("redub.segments") +
        (payload.creditsCharged ? " | -" + payload.creditsCharged + " credits" : "");
      container.appendChild(summaryLine);
      // Cảnh báo trung thực từ máy chủ: câu chưa dịch được / phụ đề quá dài / đoạn lồng phải tăng tốc
      // vẫn tràn — khách thấy NGAY thay vì phát hiện lỗi sau khi đăng video.
      const warningTexts = []
        .concat((payload.summary && payload.summary.translationWarnings) || [])
        .concat((payload.outputs && payload.outputs.durationFit && payload.outputs.durationFit.warnings) || []);
      warningTexts.forEach(function (warningText) {
        const warningLine = document.createElement("div");
        warningLine.className = "detail";
        warningLine.style.cssText = "margin-top:6px;color:#ffb74d";
        warningLine.textContent = "⚠ " + warningText;
        container.appendChild(warningLine);
      });
      const buttonRow = document.createElement("div");
      buttonRow.style.cssText = "display:flex;gap:8px;flex-wrap:wrap;margin-top:8px";
      // Kết quả lồng tiếng thật: nút tải dubbed.mp4 (+ file phụ đề/kịch bản) qua route có xác thực.
      const downloads = (payload.outputs && payload.outputs.downloads) || [];
      downloads.forEach(function (item) {
        const downloadButton = document.createElement("button");
        downloadButton.type = "button";
        downloadButton.className = item.kind === "dubbed_video" ? "cj-primary" : "mini-btn";
        downloadButton.textContent = item.kind === "dubbed_video"
          ? t("redub.downloadVideo")
          : "⬇ " + (item.kind === "subtitles" ? ".srt " + String(item.language || "").toUpperCase() : t("redub.script"));
        downloadButton.addEventListener("click", async function () {
          downloadButton.disabled = true;
          try {
            const fileResp = await fetch(item.url, { headers: authHeaders() });
            if (!fileResp.ok) { throw new Error("HTTP " + fileResp.status); }
            const blob = await fileResp.blob();
            const objectUrl = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = objectUrl;
            link.download = item.url.split("/").pop() || "download";
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 10000);
          } catch (error) {
            showError(error instanceof Error ? error.message : String(error));
          } finally {
            downloadButton.disabled = false;
          }
        });
        buttonRow.appendChild(downloadButton);
      });
      (payload.subtitles || []).forEach(function (track) {
        const trackButton = document.createElement("button");
        trackButton.type = "button";
        trackButton.className = "mini-btn";
        trackButton.textContent = "⬇ .srt " + String(track.language || "").toUpperCase();
        trackButton.addEventListener("click", function () {
          const blob = new Blob([track.srt || ""], { type: "text/plain;charset=utf-8" });
          const objectUrl = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = objectUrl;
          link.download = "subtitle_" + (track.language || "xx") + ".srt";
          document.body.appendChild(link);
          link.click();
          link.remove();
          setTimeout(function () { URL.revokeObjectURL(objectUrl); }, 10000);
        });
        buttonRow.appendChild(trackButton);
      });
      container.appendChild(buttonRow);
      if (payload.dubScript) {
        const scriptLabel = document.createElement("div");
        scriptLabel.className = "detail";
        scriptLabel.style.marginTop = "8px";
        scriptLabel.textContent = t("redub.script");
        container.appendChild(scriptLabel);
        const scriptBox = document.createElement("textarea");
        scriptBox.readOnly = true;
        scriptBox.value = payload.dubScript;
        scriptBox.style.cssText = "width:100%;min-height:120px;background:#0d1230;color:#e8ecff;border:1px solid rgba(255,255,255,.14);border-radius:10px;padding:8px;font-size:12px";
        container.appendChild(scriptBox);
      }
    }

    async function pollRenderJob(statusUrl) {
      document.getElementById("stop-polling").disabled = false;
      let job;
      try {
        job = await apiFetch(statusUrl);
        jobPollFailures = 0;
      } catch (error) {
        // Self-heal on a transient network blip: the render keeps running server-side, so retry a few
        // times before giving up instead of killing the tracker on the first hiccup and (wrongly)
        // telling a still-logged-in customer to re-login (MVP audit B1).
        jobPollFailures = (jobPollFailures || 0) + 1;
        if (jobPollFailures <= 5) {
          setRenderStatus("⏳ " + t("poll.reconnecting"));
          jobPollTimer = setTimeout(() => pollRenderJob(statusUrl), 4000);
          return;
        }
        stopJobPolling(t("poll.checkFail"));
        return;
      }
      const status = job.status || "unknown";
      // Show the same friendly, localized label as the Jobs list — never the raw internal status
      // string or the /v1/... URL (unpolished + confusing for a non-technical customer).
      // progressHighlights: cột mốc chất lượng an toàn (lồng tiếng khớp môi, ảnh khóa nhân vật).
      const highlights = Array.isArray(job.progressHighlights) && job.progressHighlights.length
        ? " • " + job.progressHighlights[job.progressHighlights.length - 1]
        : "";
      setRenderStatus("⏳ " + customerStatusLabel(status) + highlights);
      // "blocked" is NOT terminal server-side — it is re-reviewable and an operator can un-block it,
      // after which it succeeds. So keep polling (customer sees the reassuring "held" copy) instead of
      // freezing the tracker forever (MVP audit B2). Only truly-terminal states stop the poller.
      if (status === "blocked") {
        setRenderStatus("⏳ " + (accountInfo && accountInfo.account ? t("poll.held") : customerStatusLabel(status)));
        jobPollDelayMs = 15000;
        jobPollTimer = setTimeout(() => pollRenderJob(statusUrl), jobPollDelayMs);
        return;
      }
      if (status === "succeeded" || status === "failed" || status === "canceled" || status === "rejected") {
        if (accountInfo && accountInfo.account) {
          var autoRefund = accountInfo && accountInfo.refundPolicy === "auto";
          var refundNote = autoRefund ? t("poll.refundAuto") : t("poll.refundManual");
          // Hướng dẫn khách tự sửa (server chỉ gửi trường này cho lỗi khách sửa được — ví dụ ảnh để
          // nhầm ô KOL/Sản phẩm). Không có nó, khách chỉ thấy "bị lỗi, thử lại" và lặp lại y nguyên.
          var guidance = typeof job.customerGuidance === "string" && job.customerGuidance ? job.customerGuidance : "";
          const failedCopy = guidance
            ? t("poll.failedPrefix") + refundNote + ". " + guidance
            : t("poll.failedPrefix") + refundNote + t("poll.tryAgain");
          const terminalCopy = status === "succeeded"
            ? t("poll.done")
            : status === "failed" ? failedCopy
            : status === "canceled" ? t("poll.canceledPrefix") + refundNote + "."
            : t("poll.rejectedPrefix") + refundNote + ".";
          stopJobPolling(terminalCopy);
          refreshAccount();
          if (status === "succeeded") { loadJobs(); }
          return;
        }
        stopJobPolling("Job finished with status: " + status + ". Details: " + statusUrl);
        return;
      }
      if (status.indexOf("paused") === 0) {
        if (accountInfo && accountInfo.account) {
          // Customer view: still processing. A team review pause and an operator-hold both
          // read as "being finished" — the customer never sees an internal problem; credits
          // stay reserved and the page keeps polling until it succeeds or is refunded.
          setRenderStatus(status === "paused_for_operator" ? t("poll.finishing") : t("poll.reviewWait"));
          jobPollDelayMs = 15000;
          jobPollTimer = setTimeout(() => pollRenderJob(statusUrl), jobPollDelayMs);
          return;
        }
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
      if (!accountInfo || !accountInfo.account) {
        showError(t("err.loginCreate"));
        document.getElementById("auth-modal").hidden = false;
        return;
      }
      const payload = briefPayload();
      if (!payload.userPrompt) {
        showError(t("err.needIdea"));
        return;
      }
      const response = await apiFetch(endpoints.sessions, {
        method: "POST",
        body: JSON.stringify(payload)
      });
      activeSessionId = response.session.sessionId;
      setSessionLine(activeSessionId);
      document.getElementById("refresh-contract").disabled = false;
      showSuccess(t("ok.reviewPlan"));
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
      setSessionLine(sessionId);
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
          showError(t("err.uploadTooBig"));
          return;
        }
        const credentialHeaders = authHeaders();
        if (Object.keys(credentialHeaders).length === 0) {
          showError(t("err.loginFirst"));
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
              ...credentialHeaders
            },
            body: file
          });
          const payload = await response.json();
          if (!response.ok) {
            throw new Error(payload.error || "Upload failed");
          }
          target.value = payload.uri;
          showSuccess(t("up.done1") + file.name + t("up.done2"));
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

    let memorySessionToken = "";
    function readSessionToken() {
      try {
        return window.localStorage.getItem("cinejelly_session") || memorySessionToken;
      } catch (error) {
        return memorySessionToken;
      }
    }
    function storeSessionToken(token) {
      memorySessionToken = token || "";
      try {
        if (token) { window.localStorage.setItem("cinejelly_session", token); }
        else { window.localStorage.removeItem("cinejelly_session"); }
      } catch (error) { /* in-app browsers without storage still work via memory */ }
    }

    function authHeaders() {
      const headers = {};
      const session = readSessionToken();
      if (session) { headers["X-CineJelly-Session"] = session; }
      const keyInput = document.getElementById("api-key");
      const key = keyInput ? keyInput.value.trim() : "";
      if (key) { headers["X-CineJelly-Api-Key"] = key; }
      return headers;
    }

    let accountInfo = null;

    function setupAccountUi() {
      const openAuth = document.getElementById("open-auth");
      const authModal = document.getElementById("auth-modal");
      const topupModal = document.getElementById("topup-modal");
      let authMode = "login";
      document.querySelectorAll("[data-close-modal]").forEach(function (button) {
        button.addEventListener("click", function () {
          document.getElementById(button.dataset.closeModal).hidden = true;
        });
      });
      openAuth.addEventListener("click", function () { authModal.hidden = false; });
      document.getElementById("tab-login").addEventListener("click", function () { setAuthMode("login"); });
      document.getElementById("tab-register").addEventListener("click", function () { setAuthMode("register"); });
      function setAuthMode(mode) {
        authMode = mode;
        document.getElementById("tab-login").classList.toggle("active", mode === "login");
        document.getElementById("tab-register").classList.toggle("active", mode === "register");
        document.getElementById("auth-name-field").hidden = mode !== "register";
        document.getElementById("auth-title").textContent = mode === "login" ? t("auth.login") : t("auth.register");
        document.getElementById("auth-submit").textContent = mode === "login" ? t("auth.login") : t("auth.register");
      }
      document.getElementById("auth-submit").addEventListener("click", async function () {
        const errorBox = document.getElementById("auth-error");
        errorBox.hidden = true;
        const email = document.getElementById("auth-email").value.trim();
        const password = document.getElementById("auth-password").value;
        const displayName = document.getElementById("auth-display-name").value.trim();
        try {
          const path = authMode === "login" ? "/v1/account/login" : "/v1/account/register";
          const body = authMode === "login" ? { email: email, password: password } : { email: email, password: password, displayName: displayName };
          const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
          const payload = await response.json();
          if (!response.ok) { throw new Error(payload.error || "Không thực hiện được, thử lại."); }
          const issuedToken = response.headers.get("X-CineJelly-Session-Token") || "";
          if (!issuedToken) { throw new Error("Máy chủ không trả phiên đăng nhập. Thử lại."); }
          storeSessionToken(issuedToken);
          authModal.hidden = true;
          document.getElementById("auth-password").value = "";
          await refreshAccount();
          showSuccess(authMode === "login" ? t("auth.okLogin") : t("auth.okRegister"));
        } catch (error) {
          errorBox.textContent = error instanceof Error ? error.message : String(error);
          errorBox.hidden = false;
        }
      });
      document.getElementById("logout-btn").addEventListener("click", async function () {
        try { await fetch("/v1/account/logout", { method: "POST", headers: authHeaders() }); } catch (error) { /* best effort */ }
        storeSessionToken("");
        accountInfo = null;
        updateAccountUi();
      });
      document.getElementById("open-topup").addEventListener("click", async function () {
        topupModal.hidden = false;
        await refreshAccount();
        renderTopupModal();
        await loadMyTopups();
        await loadMyStatement();
      });
      document.getElementById("topup-submit").addEventListener("click", async function () {
        const selected = document.querySelector(".cj-package.selected");
        if (!selected) { return; }
        const topupButton = document.getElementById("topup-submit");
        if (topupButton.dataset.busy === "true") { return; }
        topupButton.dataset.busy = "true";
        topupButton.disabled = true;
        const note = document.getElementById("topup-note").value.trim();
        try {
          const response = await fetch("/v1/account/topups", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({ packageId: selected.dataset.packageId, ...(note ? { note: note } : {}) })
          });
          const payload = await response.json();
          if (!response.ok) { throw new Error(payload.error || "Không gửi được yêu cầu."); }
          showSuccess(t("tu.sent"));
          await loadMyTopups();
        } catch (error) {
          showError(error instanceof Error ? error.message : String(error));
        } finally {
          topupButton.dataset.busy = "false";
          topupButton.disabled = false;
        }
      });
      document.getElementById("open-change-password").addEventListener("click", function () {
        document.getElementById("password-modal").hidden = false;
      });
      document.getElementById("password-submit").addEventListener("click", async function () {
        const errorBox = document.getElementById("password-error");
        errorBox.hidden = true;
        try {
          const response = await fetch("/v1/account/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify({
              currentPassword: document.getElementById("current-password").value,
              newPassword: document.getElementById("new-password").value
            })
          });
          const payload = await response.json();
          if (!response.ok) { throw new Error(payload.error || "Không đổi được mật khẩu."); }
          const issuedToken = response.headers.get("X-CineJelly-Session-Token") || "";
          if (issuedToken) { storeSessionToken(issuedToken); }
          document.getElementById("current-password").value = "";
          document.getElementById("new-password").value = "";
          document.getElementById("password-modal").hidden = true;
          showSuccess(t("pw.done"));
        } catch (error) {
          errorBox.textContent = error instanceof Error ? error.message : String(error);
          errorBox.hidden = false;
        }
      });
      document.getElementById("toggle-admin-key").addEventListener("click", function () {
        const wrap = document.getElementById("admin-key-wrap");
        wrap.hidden = !wrap.hidden;
      });
      const durationInput = document.getElementById("duration");
      if (durationInput) { durationInput.addEventListener("input", updateCreditEstimate); }
      const qualityInput = document.getElementById("quality-mode");
      if (qualityInput) { qualityInput.addEventListener("change", updateCreditEstimate); }
    }

    function renderTopupModal() {
      if (!accountInfo) { return; }
      const grid = document.getElementById("package-grid");
      grid.innerHTML = "";
      // Effective price per 15s video makes bigger packs feel cheaper (honest anchoring):
      // credits for a 15s standard video = 15 * creditsPerRenderSecond.
      const perSecond = (accountInfo.renderPricing && accountInfo.renderPricing.creditsPerRenderSecond) || 10;
      const creditsPerVideo = Math.max(1, 15 * perSecond);
      (accountInfo.packages || []).forEach(function (pkg) {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "cj-package";
        card.dataset.packageId = pkg.packageId;
        // The "most popular" pack is marked by a ⭐ in its label (diacritic-proof) or POPULAR.
        const isPopular = String(pkg.label || "").indexOf("⭐") >= 0 || /POPULAR/i.test(String(pkg.bonusNote || ""));
        if (isPopular) { card.classList.add("popular"); }
        const price = (pkg.priceVnd || 0).toLocaleString("vi-VN");
        // Build with textContent, never innerHTML: pkg.label/bonusNote come from admin
        // settings and must never be interpreted as markup (even self-XSS by the owner).
        if (isPopular) {
          const badge = document.createElement("span");
          badge.className = "cj-badge";
          badge.textContent = t("tu.popular");
          card.appendChild(badge);
        }
        const labelEl = document.createElement("strong");
        // USD is the headline value; VND (= USD × rate) is the actual bank-transfer amount.
        const usd = Number(pkg.priceUsd || 0);
        labelEl.textContent = String(pkg.label || "") + (usd > 0 ? " — $" + usd : "");
        const creditsEl = document.createElement("span");
        creditsEl.textContent = pkg.credits.toLocaleString("vi-VN") + " credits";
        const priceEl = document.createElement("small");
        priceEl.textContent = "≈ " + price + "đ" + (pkg.bonusNote ? " • " + String(pkg.bonusNote) : "");
        const perVideoEl = document.createElement("small");
        perVideoEl.className = "cj-pervideo";
        const videos = Math.max(1, pkg.credits / creditsPerVideo);
        const perVideoUsd = usd > 0 ? usd / videos : 0;
        // Round to the nearest 100đ, not 1000đ, so a low-price pack never displays "0đ/video".
        const perVideo = Math.round((pkg.priceVnd || 0) / videos / 100) * 100;
        perVideoEl.textContent = (perVideoUsd > 0 ? "≈ $" + perVideoUsd.toFixed(2) + "/video (" : "≈ ") +
          perVideo.toLocaleString("vi-VN") + t("tu.perVideo") + (perVideoUsd > 0 ? ")" : "");
        card.appendChild(labelEl);
        card.appendChild(creditsEl);
        card.appendChild(priceEl);
        card.appendChild(perVideoEl);
        card.addEventListener("click", function () {
          document.querySelectorAll(".cj-package").forEach(function (item) { item.classList.remove("selected"); });
          card.classList.add("selected");
          document.getElementById("topup-submit").disabled = false;
        });
        grid.appendChild(card);
      });
      const instr = document.getElementById("topup-instructions");
      instr.textContent = "";
      const noExpire = document.createElement("div");
      noExpire.style.cssText = "margin-bottom:6px;color:#8fe3b0;font-weight:600";
      noExpire.textContent = t("tu.noExpire");
      instr.appendChild(noExpire);
      const bank = document.createElement("div");
      bank.textContent = accountInfo.topupInstructions || "";
      instr.appendChild(bank);
    }

    async function loadMyTopups() {
      try {
        const response = await fetch("/v1/account/topups", { headers: authHeaders() });
        if (!response.ok) { return; }
        const payload = await response.json();
        const box = document.getElementById("my-topups");
        box.innerHTML = "";
        (payload.topups || []).slice(0, 5).forEach(function (topup) {
          const row = document.createElement("div");
          row.className = "cj-topup-item";
          const statusText = topup.status === "approved" ? "✅ Đã cộng" : topup.status === "rejected" ? "❌ Từ chối" : "⏳ Chờ duyệt";
          row.innerHTML = "<span>" + topup.credits.toLocaleString("vi-VN") + " credits</span><span>" + statusText + "</span>";
          // A still-pending top-up can be withdrawn by the customer (wrong package / mistyped note) —
          // no money has moved yet (customer-journey B4). Built via createElement + listener (no inline
          // handler) to keep the CSP-safe no-untrusted-innerHTML posture.
          if (topup.status === "pending" && topup.topupId) {
            const cancelBtn = document.createElement("button");
            cancelBtn.type = "button";
            cancelBtn.className = "mini-btn";
            cancelBtn.style.cssText = "margin-left:8px;font-size:11px";
            cancelBtn.textContent = t("tu.cancelTopup");
            cancelBtn.addEventListener("click", async function () {
              cancelBtn.disabled = true;
              try {
                const res = await fetch("/v1/account/topups/cancel", { method: "POST", headers: authHeaders(), body: JSON.stringify({ topupId: topup.topupId }) });
                if (!res.ok) { const p = await res.json(); showError(p.error || "Không hủy được."); cancelBtn.disabled = false; return; }
                await loadMyTopups();
              } catch (e) { showError(e instanceof Error ? e.message : String(e)); cancelBtn.disabled = false; }
            });
            row.appendChild(cancelBtn);
          }
          box.appendChild(row);
        });
      } catch (error) { /* list is cosmetic */ }
    }

    async function loadMyStatement() {
      const box = document.getElementById("my-statement");
      if (!box) { return; }
      try {
        const response = await fetch("/v1/account/statement", { headers: authHeaders() });
        if (!response.ok) { return; }
        const payload = await response.json();
        box.textContent = "";
        const entries = (payload.entries || []).slice(-12).reverse();
        if (entries.length === 0) {
          const empty = document.createElement("div");
          empty.className = "detail";
          empty.textContent = t("tu.noHistory");
          box.appendChild(empty);
          return;
        }
        entries.forEach(function (entry) {
          const row = document.createElement("div");
          row.className = "cj-topup-item";
          const kindLabel = t("tu.kind." + String(entry.type)) || String(entry.type);
          const credits = Number(entry.credits) || 0;
          // entry.credits already carries the sign (charges/negative adjusts are negative).
          const isDebit = credits < 0;
          const sign = isDebit ? "-" : "+";
          const when = entry.at ? String(entry.at).replace("T", " ").slice(0, 16) : "";
          const left = document.createElement("span");
          left.textContent = kindLabel + (when ? " · " + when : "");
          const right = document.createElement("span");
          right.textContent = sign + Math.abs(credits).toLocaleString("vi-VN") + " 💎";
          right.style.color = isDebit ? "#ff8a8a" : "#7ee0a8";
          row.appendChild(left);
          row.appendChild(right);
          box.appendChild(row);
        });
      } catch (error) { /* history view is cosmetic */ }
    }

    async function refreshAccount() {
      if (!readSessionToken()) { accountInfo = null; updateAccountUi(); return; }
      try {
        const response = await fetch("/v1/account/me", { headers: authHeaders() });
        if (response.status === 401) {
          storeSessionToken("");
          accountInfo = null;
          updateAccountUi();
          return;
        }
        if (!response.ok) { return; }
        accountInfo = await response.json();
        updateAccountUi();
      } catch (error) { /* offline; keep current UI */ }
    }

    function updateAccountUi() {
      const loggedIn = Boolean(accountInfo && accountInfo.account);
      document.getElementById("open-auth").hidden = loggedIn;
      document.getElementById("account-wrap").hidden = !loggedIn;
      const balanceBox = document.getElementById("balance-status");
      // Operator-only concepts (raw USD preflight + review fields + Prepare Packet) are
      // shown ONLY in operator mode: an admin API key present and no customer session.
      // Customers and first-time logged-out visitors never see them.
      var operatorMode = (function () {
        var keyEl = document.getElementById("api-key");
        return Boolean(keyEl && keyEl.value.trim()) && !loggedIn;
      })();
      ["reviewer", "review-decision", "review-notes"].forEach(function (id) {
        const field = document.getElementById(id);
        const wrap = field && field.closest ? field.closest("label") : null;
        if (wrap) { wrap.style.display = operatorMode ? "" : "none"; }
      });
      // The "Confirm paid render" checkbox is an OPERATOR review control (customers confirm via the
      // cost dialog on submit); hiding it for customers removes a dead control that implied an
      // unmet payment gate (audit HIGH).
      const confirmRenderBox = document.getElementById("confirm-render");
      const confirmRenderLabel = confirmRenderBox && confirmRenderBox.closest ? confirmRenderBox.closest("label") : null;
      if (confirmRenderLabel) { confirmRenderLabel.style.display = operatorMode ? "" : "none"; }
      // Ẩn các panel kỹ thuật (backend contract) + controls duyệt của operator cho khách — khách chỉ
      // thấy wizard 3 bước sạch sẽ. render-status vẫn hiện để khách theo dõi tiến độ video.
      const jargonGrid = document.querySelector(".contract-grid");
      if (jargonGrid) { jargonGrid.style.display = operatorMode ? "" : "none"; }
      ["approval-packet", "submit-render", "credit-estimate", "prepare-approval"].forEach(function (id) {
        const el = document.getElementById(id);
        const wrap = el && el.closest ? (el.closest("label") || el) : el;
        if (wrap) { wrap.style.display = operatorMode ? "" : "none"; }
      });
      const captionMain = document.getElementById("caption-toggle");
      const captionMainLabel = captionMain && captionMain.closest ? captionMain.closest("label") : null;
      if (captionMainLabel) { captionMainLabel.style.display = operatorMode ? "" : "none"; }
      // Tiêu đề "Approval Packet" → "Trạng thái video" cho khách.
      const apTitle = document.querySelector('[data-i18n="ap.title"]');
      if (apTitle) { apTitle.setAttribute("data-i18n", operatorMode ? "ap.title" : "ap.statusTitle"); apTitle.textContent = t(operatorMode ? "ap.title" : "ap.statusTitle"); }
      const usdCard = document.getElementById("usd-cost-card");
      if (usdCard) { usdCard.style.display = operatorMode ? "" : "none"; }
      const prepareBtn = document.getElementById("prepare-approval");
      if (prepareBtn) { prepareBtn.style.display = operatorMode ? "" : "none"; }
      if (loggedIn) {
        document.getElementById("account-name").textContent = "👤 " + accountInfo.account.displayName;
        balanceBox.textContent = accountInfo.account.balanceCredits.toLocaleString("vi-VN") + " 💎";
      } else {
        balanceBox.textContent = "—";
      }
      updateCreditEstimate();
      renderStudioContent();
    }

    function renderStudioContent() {
      var banner = document.getElementById("studio-announcement-banner");
      if (!banner) { return; }
      var announcement = accountInfo && accountInfo.announcement ? accountInfo.announcement : "";
      if (announcement) {
        // textContent, not innerHTML: operator content is shown verbatim, never as markup.
        banner.textContent = "📣 " + announcement;
        banner.hidden = false;
      } else {
        banner.hidden = true;
      }
    }

    // Metered credit estimate for a clip. Mirrors the server formula (duration × candidate passes ×
    // the tier's credits-per-render-second), falling back to the legacy per-second model.
    function meteredCredits(seconds, tier, quality) {
      var pp = accountInfo && accountInfo.pipelinePricing;
      if (!pp || !pp.enabled) {
        var per = (accountInfo && accountInfo.renderPricing && accountInfo.renderPricing.creditsPerRenderSecond) || 10;
        var minLegacy = (accountInfo && accountInfo.renderPricing && accountInfo.renderPricing.minimumChargeCredits) || 1;
        return Math.max(minLegacy, Math.ceil(seconds * per));
      }
      var rateMap = pp.creditsPerRenderSecondByTier || {};
      var rate = rateMap[tier] || rateMap[pp.cheapestTier] || 10;
      var cand = (pp.candidateCountByQuality && pp.candidateCountByQuality[quality]) || 2;
      // Mirror estimatePipelineRenderCredits EXACTLY so the shown price equals the server charge:
      // billed seconds = duration × (candidate + repair passes) + per-shot test-takes (non-economy).
      var repair = (pp.repairCountByQuality && pp.repairCountByQuality[quality] != null) ? pp.repairCountByQuality[quality] : 0;
      var avgShot = pp.avgSecondsPerShot > 0 ? pp.avgSecondsPerShot : 5;
      var testPer = pp.testTakeSecondsPerShot > 0 ? pp.testTakeSecondsPerShot : 0;
      var testTake = (quality !== "economy" && testPer > 0) ? Math.ceil(seconds / Math.max(1, avgShot)) * testPer : 0;
      var billed = seconds * (cand + repair) + testTake;
      return Math.max(pp.minimumChargeCredits || 20, Math.ceil(billed * rate));
    }
    // Convert credits to đồng at the customer's BEST (cheapest) regular package rate.
    function creditsToVnd(credits) {
      var best = null;
      var pkgs = (accountInfo && accountInfo.packages) || [];
      pkgs.forEach(function (p) {
        if (!p.oncePerAccount && p.credits > 0 && p.priceVnd > 0) {
          var r = p.priceVnd / p.credits;
          if (best === null || r < best) { best = r; }
        }
      });
      return best ? Math.round(credits * best) : null;
    }
    function updateCreditEstimate() {
      const box = document.getElementById("credit-estimate");
      if (!box) { return; }
      if (!accountInfo) { box.hidden = true; return; }
      const durationInput = document.getElementById("duration");
      const seconds = Math.max(1, Number(durationInput && durationInput.value ? durationInput.value : 15) || 15);
      const loggedIn = Boolean(accountInfo.account);
      const balance = loggedIn ? accountInfo.account.balanceCredits : 0;
      const pp = accountInfo.pipelinePricing;
      // Teaser: no credits yet → show only the cheapest "from Xđ" anchor (hide the full configured
      // total to stay attractive); the real per-clip cost is revealed once they have credits.
      if (balance <= 0) {
        const teaserTier = (pp && pp.cheapestTier) || "mini";
        const teaserCredits = meteredCredits(seconds, teaserTier, "economy");
        const teaserVnd = creditsToVnd(teaserCredits);
        box.textContent = t("ce.from") + " " + (teaserVnd ? teaserVnd.toLocaleString("vi-VN") + "đ" : teaserCredits + " credits") + " / video";
        box.hidden = false;
        return;
      }
      // Has credits → show the real metered estimate. Mirror EXACTLY what will be billed: the
      // plan's cheapest tier and the QUALITY the customer selected (economy default; picking a
      // best-of-N tier raises both the render passes and this number in lockstep).
      const estimateTier = (pp && pp.cheapestTier) || "mini";
      const qualityNode = document.getElementById("quality-mode");
      const selectedQuality = qualityNode ? qualityNode.value : "economy";
      const credits = meteredCredits(seconds, estimateTier, selectedQuality);
      const vnd = creditsToVnd(credits);
      const refundHint = (accountInfo.refundPolicy === "auto") ? t("ce.refundAuto") : t("ce.refundManual");
      const gate = balance < credits ? (" — " + t("ce.needTopup")) : "";
      box.textContent = t("ce.cost") + " ~" + credits.toLocaleString("vi-VN") + " credits"
        + (vnd ? " (~" + vnd.toLocaleString("vi-VN") + "đ)" : "")
        + " • " + t("ce.balance") + " " + balance.toLocaleString("vi-VN") + " 💎" + gate + ". " + refundHint;
      box.hidden = false;
    }

    async function apiFetch(path, options = {}) {
      const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
        ...(options.headers || {})
      };
      try {
        const response = await fetch(path, { ...options, headers });
        const payload = await response.json();
        if (!response.ok) {
          if (response.status === 401 && readSessionToken()) {
            // Session expired mid-journey: drop the dead token and refresh the account UI
            // now (don't wait for the 30s poll) so the user is prompted to log in again.
            storeSessionToken("");
            accountInfo = null;
            updateAccountUi();
          }
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
      const channelStyleSelect = document.getElementById("channel-style");
      const channelStyleProfileId = channelStyleSelect ? channelStyleSelect.value : "";
      // "Phong cách" select: an explicit style choice appends a machine tag the planner's classifier
      // honors with ABSOLUTE priority over its keyword heuristics ("auto" appends nothing).
      const styleSelect = document.getElementById("style-register");
      const styleTag = styleSelect && styleSelect.value && styleSelect.value !== "auto" ? " [style:" + styleSelect.value + "]" : "";
      return {
        projectId: document.getElementById("project-id").value.trim(),
        userPrompt: document.getElementById("prompt").value.trim() + styleTag,
        ...(preferredTemplateId ? { preferredTemplateId } : {}),
        ...(channelStyleProfileId ? { channelStyleProfileId } : {}),
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
      updateCreditEstimate();
      showSuccess(t("toast.starterLoaded") + " " + template.title + ".");
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
      updateCreditEstimate();
    }

    // Not an AI call — appends a proven 4-beat structure template (localized) to the brief.
    function enhancePrompt() {
      const prompt = document.getElementById("prompt");
      const text = prompt.value.trim();
      if (!text) return;
      prompt.value = text + (/hook|mở đầu|trước sau|before/i.test(text) ? t("s1.beatAlt") : t("s1.beatMain"));
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
</html>`.split("__SUPPORT_CONTACT__").join(supportContactSafe);
}
