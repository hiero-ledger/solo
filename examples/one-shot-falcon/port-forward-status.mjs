#!/usr/bin/env node

import {existsSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';

const args = process.argv.slice(2);

const getArg = (name, fallback = '') => {
  const index = args.indexOf(name);
  if (index < 0) {
    return fallback;
  }
  return args[index + 1] ?? fallback;
};

const hasArg = (name) => args.includes(name);
const mode = getArg('--mode', 'summary');
const expectedFile = getArg('--expected-port-count-file', '');
const killedPortFile = getArg('--killed-port-file', '');

const parsePort = (command) => {
  const match = command.match(/(?:^|\s)(\d{1,5}):\d{1,5}(?:\s|$)/);
  if (!match) {
    return '';
  }
  const port = Number.parseInt(match[1], 10);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return '';
  }
  return String(port);
};

const getProcessList = () => {
  if (process.platform === 'win32') {
    const cmd = 'Get-CimInstance Win32_Process | Select-Object ProcessId,CommandLine | ConvertTo-Json -Compress';
    const out = execFileSync('powershell.exe', ['-NoProfile', '-Command', cmd], {encoding: 'utf8'}).trim();
    if (!out) {
      return [];
    }
    const parsed = JSON.parse(out);
    const list = Array.isArray(parsed) ? parsed : [parsed];
    return list
      .filter((entry) => entry && entry.CommandLine)
      .map((entry) => ({pid: Number(entry.ProcessId), command: String(entry.CommandLine)}));
  }

  const out = execFileSync('ps', ['-ax', '-o', 'pid=', '-o', 'command='], {encoding: 'utf8'});
  return out
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*(\d+)\s+(.*)$/))
    .filter(Boolean)
    .map(([, pid, command]) => ({pid: Number(pid), command}));
};

const kubectlPortForwardProcesses = () =>
  getProcessList().filter((proc) => /kubectl/.test(proc.command) && /port-forward/.test(proc.command));

const uniquePorts = () => {
  const ports = new Set();
  for (const proc of kubectlPortForwardProcesses()) {
    const port = parsePort(proc.command);
    if (port) {
      ports.add(port);
    }
  }
  return [...ports].sort((a, b) => Number(a) - Number(b));
};

const summary = () => {
  const processes = kubectlPortForwardProcesses();
  const ports = uniquePorts();
  console.log('==== Current port-forward processes ====');
  if (processes.length === 0) {
    console.log('No port-forwards found');
  } else {
    for (const proc of processes) {
      console.log(`pid=${proc.pid} port=${parsePort(proc.command) || 'unknown'} cmd=${proc.command}`);
    }
  }
  console.log(`Unique local ports: ${ports.join(' ') || '(none)'}`);
  console.log(`Total unique port-forward count: ${ports.length}`);
  return ports.length;
};

const verify = () => {
  const ports = uniquePorts();
  const portSet = new Set(ports);
  let expectedCount = 1;
  if (expectedFile && existsSync(expectedFile)) {
    const value = Number.parseInt(readFileSync(expectedFile, 'utf8').trim(), 10);
    if (Number.isInteger(value) && value > 0) {
      expectedCount = value;
    }
  }

  if (ports.length < expectedCount) {
    console.error(`✗ Verification FAILED: Expected at least ${expectedCount} port-forward(s), found ${ports.length}`);
    process.exit(1);
  }
  console.log(`✓ Verification PASSED: Found expected number of port-forwards (${ports.length})`);

  if (killedPortFile && existsSync(killedPortFile)) {
    const killedPort = readFileSync(killedPortFile, 'utf8').trim();
    if (!portSet.has(killedPort)) {
      console.error(`✗ Verification FAILED: Killed port ${killedPort} was NOT restored`);
      console.error(`Running ports: ${ports.join(' ')}`);
      process.exit(1);
    }
    console.log(`✓ Verification PASSED: Killed port ${killedPort} was successfully restored`);
    rmSync(killedPortFile, {force: true});
  }

  if (expectedFile) {
    rmSync(expectedFile, {force: true});
  }
};

if (mode === 'summary') {
  const count = summary();
  if (expectedFile) {
    writeFileSync(expectedFile, `${count}\n`, 'utf8');
  }
  process.exit(0);
}

if (mode === 'verify') {
  verify();
  process.exit(0);
}

if (hasArg('--help') || hasArg('-h')) {
  console.log('Usage: port-forward-status.mjs --mode summary|verify [--expected-port-count-file PATH] [--killed-port-file PATH]');
  process.exit(0);
}

console.error(`Unsupported mode: ${mode}`);
process.exit(1);
