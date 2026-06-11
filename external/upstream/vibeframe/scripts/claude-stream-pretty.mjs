#!/usr/bin/env node
/**
 * Pretty-print Claude Code stream-json output for VHS recordings.
 *
 * Claude Code's non-interactive `--output-format stream-json` is stable
 * enough for reproducible terminal demos, but the raw JSON is unreadable
 * on video. This script keeps the useful parts: Bash tool calls, command
 * output, and the final assistant answer.
 */

import readline from "node:readline";

const MAX_OUTPUT_LINES = Number(process.env.CLAUDE_VHS_MAX_LINES || 80);

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

function printBlock(text, prefix = "") {
  if (!text) return;
  const lines = String(text).replace(/\s+$/g, "").split("\n");
  const shown = lines.slice(0, MAX_OUTPUT_LINES);
  for (const line of shown) {
    process.stdout.write(`${prefix}${line}\n`);
  }
  if (lines.length > shown.length) {
    process.stdout.write(`${prefix}... (${lines.length - shown.length} lines omitted)\n`);
  }
}

for await (const line of rl) {
  if (!line.trim()) continue;

  let event;
  try {
    event = JSON.parse(line);
  } catch {
    continue;
  }

  if (event.type === "assistant") {
    for (const item of event.message?.content ?? []) {
      if (item.type === "tool_use" && item.name === "Bash") {
        const command = item.input?.command;
        const description = item.input?.description;
        if (description) process.stdout.write(`\n# ${description}\n`);
        if (command) process.stdout.write(`$ ${command}\n`);
      }
      if (item.type === "text" && item.text?.trim()) {
        process.stdout.write("\nclaude> ");
        printBlock(item.text.trim(), "");
      }
    }
  }

  if (event.type === "user" && event.tool_use_result) {
    const { stdout, stderr, interrupted } = event.tool_use_result;
    printBlock(stdout);
    if (stderr) printBlock(stderr, "stderr: ");
    if (interrupted) process.stdout.write("! command interrupted\n");
  }

  if (event.type === "result") {
    if (event.is_error) {
      process.stdout.write(`\n[error] Claude Code run failed: ${event.result || event.terminal_reason || "unknown"}\n`);
      process.exitCode = 1;
    } else if (event.result?.trim()) {
      process.stdout.write("\n[ok] Claude Code completed\n");
      printBlock(event.result.trim());
    } else {
      process.stdout.write("\n[ok] Claude Code completed\n");
    }
  }
}
