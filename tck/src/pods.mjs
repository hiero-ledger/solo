// SPDX-License-Identifier: Apache-2.0

import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {Failure} from './contract.mjs';
import {Processes} from './process.mjs';

// How long a candidate container may stay unready before that alone names the candidate.
const READY_GRACE = 180_000;

export class PodState {
  pods = new Map();
  baseline;
  pullFailures = new Map();
  unreadySince = new Map();

  // Images whose containers run the candidate; none when the candidate is not a container image (js-sdk).
  constructor(candidateImages = []) {
    this.candidateImages = new Set(candidateImages.map(image => PodState.#reference(image)));
  }

  // The runtime may report an image with the implicit Docker Hub prefixes its spec omitted.
  static #reference(image) {
    return String(image)
      .replace(/^docker\.io\//, '')
      .replace(/^library\//, '');
  }

  #candidate(...images) {
    return images.some(image => image && this.candidateImages.has(PodState.#reference(image)));
  }

  observe(event, now = Date.now()) {
    const pod = event.object || event;
    if (pod.kind === 'Status') {
      throw new Failure('unknown', `Pod watch: ${pod.message}`);
    }
    if (pod.items) {
      for (const item of pod.items) {
        this.observe(item, now);
      }
      return;
    }
    const name = pod.metadata?.name;
    if (!name) {
      throw new Failure('kit', 'Pod watch returned an object without metadata');
    }
    if (event.type === 'DELETED') {
      this.pods.delete(name);
      if (this.baseline?.has(name)) {
        throw new Failure('unknown', `Pod ${name} was replaced after deployment`);
      }
      return;
    }
    const specs = [...(pod.spec?.initContainers || []), ...(pod.spec?.containers || [])];
    const containers = [...(pod.status?.initContainerStatuses || []), ...(pod.status?.containerStatuses || [])];
    const candidates = new Set(
      specs
        .filter(spec => this.#candidate(spec.image, containers.find(status => status.name === spec.name)?.image))
        .map(spec => spec.name),
    );
    const unready = [];
    for (const container of containers) {
      const key = `${pod.metadata.uid}/${container.name}`;
      const waiting = container.state?.waiting?.reason;
      const candidate = candidates.has(container.name);
      // The evidence names the candidate only when the failing container runs a candidate image.
      const failure = (otherwise, message) =>
        new Failure(candidate ? 'candidate' : otherwise, `${message}: ${name}/${container.name}`);
      if ([container.state?.terminated?.reason, container.lastState?.terminated?.reason].includes('OOMKilled')) {
        throw failure('unknown', 'OOMKilled');
      }
      if (['ErrImageNeverPull', 'InvalidImageName'].includes(waiting)) {
        throw failure('environment', waiting);
      }
      if (container.restartCount >= 2 && waiting === 'CrashLoopBackOff') {
        throw failure('unknown', 'Crash loop');
      }
      if (['ImagePullBackOff', 'ErrImagePull'].includes(waiting)) {
        if (!this.pullFailures.has(key)) {
          this.pullFailures.set(key, now);
        }
        if (now - this.pullFailures.get(key) >= 300_000) {
          throw failure('environment', 'Image pull failed for five minutes');
        }
      } else {
        this.pullFailures.delete(key);
      }
      if (container.ready || container.state?.terminated?.exitCode === 0) {
        this.unreadySince.delete(key);
      } else {
        unready.push(container.name);
        if (!this.unreadySince.has(key)) {
          this.unreadySince.set(key, now);
        }
      }
      const baseline = this.baseline?.get(name);
      if (
        baseline &&
        (baseline.uid !== pod.metadata.uid || container.restartCount > (baseline.restarts[container.name] ?? 0))
      ) {
        throw new Failure('unknown', `Container restarted after deployment: ${name}/${container.name}`);
      }
    }
    this.pods.set(name, {
      name,
      uid: pod.metadata.uid,
      phase: pod.status?.phase,
      ready:
        pod.status?.phase === 'Succeeded' ||
        pod.status?.conditions?.some(condition => condition.type === 'Ready' && condition.status === 'True'),
      restarts: Object.fromEntries(containers.map(container => [container.name, container.restartCount])),
      unready,
      containers: specs.map(container => ({
        name: container.name,
        image: container.image,
        candidate: candidates.has(container.name),
        resources: container.resources,
      })),
    });
  }

  // Which pods are not Ready, and whether that names the candidate: every unready container runs a candidate
  // image and has been unready for the grace period. A candidate waiting on an unready dependency is not named.
  notReady(now = Date.now()) {
    const pods = [...this.pods.values()].filter(pod => !pod.ready);
    if (pods.length === 0) {
      return;
    }
    const candidate = pods.every(
      pod =>
        pod.unready.length > 0 &&
        pod.unready.every(
          name =>
            pod.containers.find(container => container.name === name)?.candidate &&
            now - this.unreadySince.get(`${pod.uid}/${name}`) >= READY_GRACE,
        ),
    );
    return {pods: pods.map(pod => pod.name), candidate};
  }

  stable(now = Date.now()) {
    if (this.pods.size === 0) {
      throw new Failure('unknown', 'No workload pods found');
    }
    const notReady = this.notReady(now);
    if (notReady) {
      throw new Failure(notReady.candidate ? 'candidate' : 'unknown', `Pod is not Ready: ${notReady.pods.join(', ')}`);
    }
    if (this.baseline) {
      for (const name of this.baseline.keys()) {
        if (!this.pods.has(name)) {
          throw new Failure('unknown', `Pod disappeared: ${name}`);
        }
      }
    }
  }

  deployed() {
    this.stable();
    this.baseline = new Map([...this.pods].map(([name, pod]) => [name, structuredClone(pod)]));
  }
}

export class PodWatcher {
  state = new PodState();
  metrics = {samples: 0, peaks: {}, errors: []};
  controller = new AbortController();

  // kubectl emits adjacent, pretty-printed watch objects, not newline-delimited JSON.
  static jsonObjects(onObject) {
    let buffer = '';
    let depth = 0;
    let quoted = false;
    let escaped = false;
    return chunk => {
      for (const character of String(chunk)) {
        if (!buffer && /\s/.test(character)) {
          continue;
        }
        buffer += character;
        if (buffer.length > 4_000_000) {
          throw new Failure('kit', 'Pod watch object exceeds 4MB');
        }
        if (quoted) {
          if (escaped) {
            escaped = false;
          } else if (character === '\\') {
            escaped = true;
          } else if (character === '"') {
            quoted = false;
          }
        } else {
          switch (character) {
            case '"': {
              quoted = true;
              break;
            }
            case '{':
            case '[': {
              depth++;
              break;
            }
            case '}':
            case ']': {
              depth--;
              if (!depth) {
                onObject(JSON.parse(buffer));
                buffer = '';
              }

              break;
            }
            // No default
          }
        }
      }
    };
  }

  static quantities(cpu, memory) {
    const match = /^(\d+(?:\.\d+)?)([KMG]i?|)$/.exec(memory);
    if (!match) {
      throw new Error(`Unrecognized memory quantity: ${memory}`);
    }
    const scale = {'': 1, K: 1000, Ki: 1024, M: 1e6, Mi: 1024 ** 2, G: 1e9, Gi: 1024 ** 3}[match[2]];
    const cores = cpu.endsWith('m') ? Number(cpu.slice(0, -1)) / 1000 : Number(cpu);
    if (!Number.isFinite(cores)) {
      throw new TypeError(`Unrecognized CPU quantity: ${cpu}`);
    }
    return {cpuCores: cores, memoryBytes: Number(match[1]) * scale};
  }

  constructor(runtime, onFailure) {
    this.runtime = runtime;
    this.onFailure = error => {
      if (!this.error) {
        this.error = error instanceof Failure ? error : new Failure('kit', error.message);
        onFailure(this.error);
      }
    };
  }

  start() {
    this.watching = this.watch();
    this.sampling = this.sample();
  }

  async snapshot() {
    const data = JSON.parse(
      await Processes.command('kubectl', ['get', 'pods', '-n', 'solo-tck', '-o', 'json'], {
        ...this.runtime,
        timeout: 10_000,
      }),
    );
    const names = new Set(data.items.map(pod => pod.metadata.name));
    for (const name of this.state.pods.keys()) {
      if (!names.has(name)) {
        this.state.pods.delete(name);
      }
    }
    this.state.observe(data);
  }

  async watch() {
    const signal = this.controller.signal;
    while (!signal.aborted) {
      try {
        await new Promise((resolve, reject) => {
          const child = spawn(
            'kubectl',
            ['get', 'pods', '-n', 'solo-tck', '--watch', '--output-watch-events', '-o', 'json'],
            {
              env: this.runtime.env,
              shell: false,
              detached: true,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          );
          let killTimer;
          const abort = () => {
            Processes.stop(child);
            killTimer = setTimeout(() => Processes.stop(child, 'SIGKILL'), 2000);
          };
          signal.addEventListener('abort', abort, {once: true});
          const parse = PodWatcher.jsonObjects(event => this.state.observe(event));
          child.stdout.on('data', chunk => {
            try {
              parse(chunk);
            } catch (error) {
              this.onFailure(error);
              Processes.stop(child);
            }
          });
          child.stderr.resume();
          child.once('error', reject);
          child.once('close', () => {
            clearTimeout(killTimer);
            signal.removeEventListener('abort', abort);
            resolve();
          });
        });
        if (this.state.pods.size > 0 && !signal.aborted) {
          throw new Failure('unknown', 'Pod watch disconnected; stability evidence is incomplete');
        }
        await delay(1000, undefined, {signal});
      } catch (error) {
        if (!signal.aborted) {
          this.onFailure(error);
        }
        break;
      }
    }
  }

  async sample() {
    const signal = this.controller.signal;
    while (!signal.aborted) {
      try {
        if (this.state.pods.size > 0) {
          // Poll as well as watch so a persistent image-pull failure cannot hide behind an idle stream.
          await this.snapshot();
          if (this.state.baseline) {
            this.state.stable();
          }
        }
      } catch (error) {
        if (!signal.aborted) {
          this.onFailure(error);
        }
      }
      try {
        if (this.state.baseline && !signal.aborted) {
          const top = await Processes.command(
            'kubectl',
            ['top', 'pod', '-n', 'solo-tck', '--containers', '--no-headers'],
            {
              ...this.runtime,
              signal,
              timeout: 10_000,
            },
          );
          for (const line of top.trim().split('\n').filter(Boolean)) {
            const [pod, container, cpu, memory] = line.trim().split(/\s+/);
            const current = PodWatcher.quantities(cpu, memory);
            const key = `${pod}/${container}`;
            const previous = this.metrics.peaks[key] || {cpuCores: 0, memoryBytes: 0};
            this.metrics.peaks[key] = {
              cpuCores: Math.max(previous.cpuCores, current.cpuCores),
              memoryBytes: Math.max(previous.memoryBytes, current.memoryBytes),
            };
          }
          this.metrics.samples++;
        }
      } catch (error) {
        if (!signal.aborted) {
          this.metrics.errors.push(error.message);
        }
      }
      try {
        await delay(15_000, undefined, {signal});
      } catch {
        break; /* Watcher was stopped. */
      }
    }
  }

  async stop() {
    this.controller.abort();
    await Promise.all([this.watching, this.sampling]);
  }
}
