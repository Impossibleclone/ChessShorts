import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Providers } from '@/providers';
import { Slot } from 'expo-router';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Providers>
        <Slot />
      </Providers>
    </GestureHandlerRootView>
  );
}