#!/usr/bin/env node
/**
 * No-spend regression for the render disk-space guard: it reads free disk, fails-OPEN when disk can't
 * be read (never blocks a render on an unreadable statfs), and the block error is a 503.
 */

import { freeDiskGb, assertRenderDiskAvailable, RenderDiskUnavailableError } from "../dist/utils/disk-space.js";

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: Boolean(pass), ...(detail !== undefined ? { detail: String(detail) } : {}) });

// Real disk on this machine is readable and has space → guard does not throw.
const gb = await freeDiskGb(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables");
check("free_disk_readable", typeof gb === "number" && gb > 0, `${gb}`);
let threw = false;
try { await assertRenderDiskAvailable(process.env.CINEJELLY_OUTPUT_DIR || "assets/output_deliverables"); } catch { threw = true; }
check("normal_disk_does_not_block", threw === false);

// Fail-open: an unreadable output dir (returns -1) must NOT block.
const badEnv = { ...process.env, CINEJELLY_OUTPUT_DIR: "\0::invalid::" };
const badGb = await freeDiskGb(badEnv.CINEJELLY_OUTPUT_DIR);
let threwBad = false;
try { await assertRenderDiskAvailable(badEnv.CINEJELLY_OUTPUT_DIR); } catch { threwBad = true; }
check("fails_open_on_unreadable_disk", badGb === -1 && threwBad === false, `gb=${badGb}`);

// The block error is a 503 with a no-charge, Vietnamese message.
const err = new RenderDiskUnavailableError(0.4);
check("block_error_is_503_vietnamese_no_charge", err.statusCode === 503 && err.message.includes("KHÔNG bị trừ tiền") && err.message.includes("ổ đĩa"));

const failed = checks.filter((c) => !c.pass);
const report = { schemaVersion: "cinejelly.disk-guard-smoke.v1", status: failed.length === 0 ? "pass" : "fail", checkCount: checks.length, failedCount: failed.length, checks, noSpend: true };
console.log(JSON.stringify(report, null, 2));
if (failed.length > 0) { process.exit(1); }
