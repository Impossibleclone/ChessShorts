import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * BOOT SELF-TEST (diagnostic gate: EXPO_BOOT_PROBE=true in eas.json env).
 *
 * Every risky library is require()d inside try/catch instead of imported at
 * file top, so an import-time crash cannot white-screen the app: each step
 * paints its result on-screen. After the steps finish, "Start app" mounts the
 * real tree. Flip EXPO_BOOT_PROBE to false once the root cause is fixed.
 */

type StepResult = {
  step: number;
  name: string;
  ok: boolean;
  detail?: string;
  ms: number;
};

const GLOBAL_ERR_KEY = 'bootProbeGlobalError';
type GlobalErrorStash = Record<string, string | undefined>;

type RNErrorUtils = {
  getGlobalHandler?: () => ((error: Error, isFatal: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: Error, isFatal: boolean) => void) => void;
};

// Install a global handler BEFORE anything else so late/async JS errors
// paint on screen instead of silently blanking the app.
const errorUtils = (globalThis as unknown as { ErrorUtils?: RNErrorUtils }).ErrorUtils;
if (errorUtils) {
  const prevHandler = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler?.((error: Error, isFatal: boolean) => {
    const stash = globalThis as unknown as GlobalErrorStash;
    stash[GLOBAL_ERR_KEY] =
      `${isFatal ? 'FATAL' : 'non-fatal'}: ${error?.name ?? 'Error'}: ${error?.message ?? String(error)}` +
      (error?.stack ? `\n${error.stack.split('\n').slice(0, 4).join('\n')}` : '');
    prevHandler?.(error, isFatal);
  });
}

const probeEnv = (): string => {
  const env = globalThis as unknown as GlobalErrorStash & Record<string, string | undefined>;
  const envUrl = env.EXPO_PUBLIC_API_URL;
  const probe = env.EXPO_BOOT_PROBE;
  return `API → ${envUrl ?? '(EXPO_PUBLIC_API_URL missing!)'} · probe=${probe ?? 'false'}`;
};

const steps: { name: string; run: () => string | void }[] = [
  {
    name: 'env configuration',
    run: probeEnv,
  },
  {
    name: 'gesture-handler import',
    run: () => {
      require('react-native-gesture-handler');
    },
  },
  {
    name: 'mmkv module + instance',
    run: () => {
      const mod = require('react-native-mmkv');
      void new mod.MMKV();
    },
  },
  {
    name: 'react-query import',
    run: () => {
      require('@tanstack/react-query');
    },
  },
  {
    name: 'reanimated import',
    run: () => {
      require('react-native-reanimated');
    },
  },
  {
    name: 'legendapp/list import',
    run: () => {
      require('@legendapp/list/react-native');
    },
  },
  {
    name: 'skia import',
    run: () => {
      require('@shopify/react-native-skia');
    },
  },
  {
    name: 'chessboard import',
    run: () => {
      require('react-native-chessboard');
    },
  },
  {
    name: 'api client import',
    run: () => {
      require('@/api').api;
    },
  },
  {
    name: 'store import',
    run: () => {
      require('@/store');
    },
  },
];

export default function RootLayout() {
  const env = process.env as Record<string, string | undefined>;
  const probe = env.EXPO_BOOT_PROBE === 'true';
  return probe ? <BootProbe /> : <RealApp />;
}

function BootProbe() {
  const [results, setResults] = useState<StepResult[]>([]);
  const [done, setDone] = useState(false);
  const [mountApp, setMountApp] = useState(false);
  const [globalErr, setGlobalErr] = useState<string | null>(null);
  const ranOnce = useRef(false);

  useEffect(() => {
    const timer = setInterval(() => {
      const stash = globalThis as unknown as GlobalErrorStash;
      const stored = stash[GLOBAL_ERR_KEY];
      if (stored) setGlobalErr(stored);
    }, 400);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (ranOnce.current) return;
    ranOnce.current = true;

    const runStep = async (index: number) => {
      const step = steps[index];
      const t0 = Date.now();
      try {
        const detail = step.run();
        await new Promise((resolve) => setTimeout(resolve, 60));
        setResults((previous) => [
          ...previous,
          { step: index, name: step.name, ok: true, detail: typeof detail === 'string' ? detail : undefined, ms: Date.now() - t0 },
        ]);
      } catch (e: unknown) {
        const err = e as Error;
        const firstStack = err?.stack?.split('\n')[1]?.trim() ?? '';
        setResults((previous) => [
          ...previous,
          {
            step: index,
            name: step.name,
            ok: false,
            ms: Date.now() - t0,
            detail: `${err?.name}: ${err?.message}${firstStack ? `\n   ${firstStack}` : ''}`,
          },
        ]);
      }
      if (index + 1 < steps.length) void runStep(index + 1);
      else setDone(true);
    };
    void runStep(0);
  }, []);

  const finishBoot = useCallback(() => setMountApp(true), []);

  const skiaOk = results.some((r) => r.ok && r.name === 'skia import');
  const allOk = done && results.every((r) => r.ok);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>ChessShorts — boot self-test</Text>
      {globalErr ? <Text style={styles.globalErr} selectable>GLOBAL {globalErr}</Text> : null}
      <ScrollView style={styles.list} contentContainerStyle={styles.listInner}>
        {results.map((r) => (
          <View key={r.step}>
            <Text style={r.ok ? styles.ok : styles.fail} selectable>
              {r.ok ? '✓' : '✗'} {r.name} ({r.ms} ms)
            </Text>
            {r.ok ? null : (
              <Text style={styles.failDetail} selectable>
                {'   '}{r.detail ?? 'no detail'}
              </Text>
            )}
            {r.ok && r.detail ? (
              <Text style={styles.okDetail}>
                {'   '}{r.detail}
              </Text>
            ) : null}
          </View>
        ))}
        {!done ? <Text style={styles.pending}>… running</Text> : null}
      </ScrollView>
      {skiaOk ? (
        <View style={styles.box}>
          <SkiaSample />
        </View>
      ) : null}
      {done ? (
        <Pressable onPress={finishBoot}>
          <Text style={styles.start}>{allOk ? '▶ Start app' : '▶ Start app anyway'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/* Skia visual proof: paints a circle when the native Skia module is alive */
function SkiaSample() {
  try {
    const Skia = require('@shopify/react-native-skia');
    return React.createElement(
      Skia.Canvas,
      { style: { width: '100%', height: 110 } },
      React.createElement(Skia.Circle, { c: { x: 55, y: 55, r: 36 }, color: '#7fd4ff' }),
    );
  } catch (e: unknown) {
    return <Text style={styles.fail}>skia paint failed: {(e as Error)?.message}</Text>;
  }
}

/* The real application tree, mounted only after the self-test */
function RealApp() {
  const gestureMod = require('react-native-gesture-handler');
  const GestureHandlerRootView = gestureMod.GestureHandlerRootView;
  const providersMod = require('@/providers');
  const Providers = providersMod.Providers;
  const boundaryMod = require('@/components/ErrorBoundary');
  const ErrorBoundary = boundaryMod.ErrorBoundary;
  const routerMod = require('expo-router');
  const Slot = routerMod.Slot;

  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <Providers>
          <Slot />
        </Providers>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 60, padding: 16, gap: 10 },
  title: { color: '#ffffff', fontSize: 18, fontWeight: '700' },
  globalErr: { color: '#ff9f43', fontSize: 12, fontFamily: 'monospace' },
  list: { flex: 1 },
  listInner: { gap: 8, paddingBottom: 20 },
  ok: { color: '#7fe8a3', fontSize: 14 },
  okDetail: { color: '#9ad1b5', fontSize: 12 },
  fail: { color: '#ff7f7f', fontSize: 14, fontFamily: 'monospace' },
  failDetail: { color: '#ff7f7f', fontSize: 12, fontFamily: 'monospace' },
  pending: { color: '#666666', fontSize: 14 },
  box: { minHeight: 110, backgroundColor: '#14141c', borderRadius: 8, overflow: 'hidden' },
  start: { color: '#7fd4ff', fontSize: 20, textAlign: 'center', padding: 18 },
});
