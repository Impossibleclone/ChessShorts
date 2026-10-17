import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Providers } from '@/providers';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { Slot } from 'expo-router';

export default function RootLayout() {
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