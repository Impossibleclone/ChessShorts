import React from 'react';
import { Text, View, ScrollView, StyleSheet, Pressable } from 'react-native';

interface State {
  hasError: boolean;
  name?: string;
  message?: string;
  stack?: string;
}

/**
 * Release-build boot diagnostics: if anything throws during mount, show the
 * error on-screen instead of a white void (no dev tooling available).
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: unknown): State {
    const e = error as Error;
    return {
      hasError: true,
      name: e?.name,
      message: e?.message,
      stack: e?.stack,
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[BootErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <View style={s.container}>
        <Text style={s.title}>⚠ App failed to start</Text>
        <Text style={s.sub}>Send this screenshot to the dev chat:</Text>
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollInner}>
          <Text style={s.mono} selectable>
            {this.state.name}
            {'\n\n'}
            {this.state.message}
            {'\n\n'}
            {this.state.stack?.split('\n').slice(0, 14).join('\n')}
          </Text>
        </ScrollView>
        <Pressable onPress={() => this.setState({ hasError: false, name: undefined, message: undefined, stack: undefined })}>
          <Text style={s.retry}>Tap to retry</Text>
        </Pressable>
      </View>
    );
  }
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', padding: 20, gap: 12 },
  title: { color: '#ff9f43', fontSize: 20, fontWeight: '700', marginTop: 40 },
  sub: { color: '#888', fontSize: 13 },
  scroll: { flex: 1, backgroundColor: '#14141c', borderRadius: 8 },
  scrollInner: { padding: 12 },
  mono: { color: '#7fd4ff', fontSize: 12, fontFamily: 'monospace' },
  retry: { color: '#3498db', fontSize: 15, textAlign: 'center', paddingVertical: 14 },
});
