import React from 'react';
import { Text, View } from 'react-native';

/**
 * Per-card crash containment: if rendering one puzzle's board throws on the
 * JS thread, only that card shows a fallback instead of the whole feed
 * white-screening. (UI-thread worklet exceptions remain uncatchable and are
 * avoided by construction — see ShortsFeed notes.)
 */
export class CardBoundary extends React.Component<
  { children: React.ReactNode; height: number },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.warn('Puzzle card crashed:', error?.message, info?.componentStack);
  }

  render() {
    if (this.state.failed) {
      return (
        <View style={[styles.container, { height: this.props.height }]}>
          <Text style={styles.text} numberOfLines={2}>
            This puzzle failed to load{"\n"}Swipe up for the next one
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = {
  container: {
    width: '100%' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: '#0a0a0a',
    paddingHorizontal: 24,
  },
  text: {
    color: '#8f8f96',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center' as const,
  },
};
