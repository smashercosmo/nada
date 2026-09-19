import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { getWorkspaceProjects, runPnpmAdd } from '../pnpm.ts'
import { createFakeSpawn, FakeChildProcess } from './fake-child.ts'

describe("getWorkspaceProjects (exercises runCapture)", () => {
  test("resolves with parsed projects on exit code 0", async () => {
    const { spawnImpl } = createFakeSpawn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => {
        child.emitStdout(
          JSON.stringify([
            { name: "root-pkg", path: "/repo" },
            { name: "docs", path: "/repo/apps/docs" },
            { path: "/repo/apps/unnamed" }, // no name: filtered out
          ]),
        );
        child.closeWith(0);
      });
      return child;
    });

    const projects = await getWorkspaceProjects("/repo", spawnImpl);
    assert.deepEqual(projects, [
      { name: "root-pkg", path: "/repo" },
      { name: "docs", path: "/repo/apps/docs" },
    ]);
  });

  test("rejects with the exit code in the message on non-zero exit", async () => {
    const { spawnImpl } = createFakeSpawn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => {
        child.emitStderr("ERR_PNPM_NO_WORKSPACE\n");
        child.closeWith(1);
      });
      return child;
    });

    await assert.rejects(
      () => getWorkspaceProjects("/repo", spawnImpl),
      /exited with 1/,
    );
  });

  test("rejects with the signal name when killed by a signal (code null)", async () => {
    const { spawnImpl } = createFakeSpawn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => {
        child.closeWith(null, "SIGTERM");
      });
      return child;
    });

    await assert.rejects(
      () => getWorkspaceProjects("/repo", spawnImpl),
      /was killed by SIGTERM/,
    );
  });
});

describe("runPnpmAdd", () => {
  const baseOptions = {
    packageNames: ["lodash"],
    cwd: "/repo",
    targetName: "docs",
    isRoot: false,
    dependencyField: "devDependencies" as const,
    catalogName: "react",
  };

  test("spawns pnpm with the expected args and resolves with the exit code", async () => {
    const { spawnImpl, calls } = createFakeSpawn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => child.closeWith(0));
      return child;
    });

    const code = await runPnpmAdd(baseOptions, spawnImpl);

    assert.equal(code, 0);
    assert.equal(calls.length, 1);
    assert.equal(calls[0]!.command, "pnpm");
    assert.deepEqual(calls[0]!.args, [
      "add",
      "lodash",
      "--filter",
      "docs",
      "--save-dev",
      "--save-catalog-name",
      "react",
    ]);
    assert.equal(calls[0]!.options.stdio, "inherit");
  });

  test("uses -w instead of --filter for root installs", async () => {
    const { spawnImpl, calls } = createFakeSpawn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => child.closeWith(0));
      return child;
    });

    await runPnpmAdd({ ...baseOptions, isRoot: true, targetName: undefined }, spawnImpl);

    assert.ok(calls[0]!.args.includes("-w"));
    assert.ok(!calls[0]!.args.includes("--filter"));
  });

  test("forwards SIGINT/SIGTERM to the child while it's running", async () => {
    let fakeChild!: FakeChildProcess;
    const { spawnImpl } = createFakeSpawn(() => {
      fakeChild = new FakeChildProcess();
      return fakeChild;
    });

    const promise = runPnpmAdd(baseOptions, spawnImpl);

    // Give runPnpmAdd a tick to register its process-level listeners.
    await new Promise((r) => setImmediate(r));

    process.emit("SIGINT", "SIGINT");
    process.emit("SIGTERM", "SIGTERM");

    assert.deepEqual(fakeChild.killCalls, ["SIGINT", "SIGTERM"]);

    fakeChild.closeWith(0);
    assert.equal(await promise, 0);
  });

  test("removes its SIGINT/SIGTERM listeners once the child exits (no leak)", async () => {
    const baselineSigint = process.listenerCount("SIGINT");
    const baselineSigterm = process.listenerCount("SIGTERM");

    const { spawnImpl } = createFakeSpawn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => child.closeWith(0));
      return child;
    });

    await runPnpmAdd(baseOptions, spawnImpl);

    assert.equal(process.listenerCount("SIGINT"), baselineSigint);
    assert.equal(process.listenerCount("SIGTERM"), baselineSigterm);
  });

  test("treats a null exit code (e.g. killed) as failure code 1", async () => {
    const { spawnImpl } = createFakeSpawn(() => {
      const child = new FakeChildProcess();
      queueMicrotask(() => child.closeWith(null, "SIGKILL"));
      return child;
    });

    const code = await runPnpmAdd(baseOptions, spawnImpl);
    assert.equal(code, 1);
  });
});
