import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import Home from './screens/Home';
import SignIn from './screens/SignIn';
import IdeaVault from './screens/IdeaVault';
import Notification from './screens/Notification';
import { useFonts, PetitFormalScript_400Regular } from '@expo-google-fonts/petit-formal-script';
import { NotoSerif_400Regular } from '@expo-google-fonts/noto-serif';
import { View, ActivityIndicator, Animated, Easing } from 'react-native';
import { useRef, useEffect, useState } from 'react';

const Stack = createStackNavigator();

// Door transition component
function DoorTransition({ isActive }: { isActive: boolean }) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      // Reset values
      scale.setValue(0);
      opacity.setValue(1);

      // Sequence: expand door -> fade to reveal page
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 300,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <View
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#0C001A',
        zIndex: 1000,
        pointerEvents: 'none',
      }}
    >
      <Animated.View style={{ opacity }}>
        <Animated.Image
          source={require('./assets/door.png')}
          style={{
            width: 100,
            height: 100,
            transform: [
              {
                scale: scale.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.1, 35],
                }),
              },
              {
                rotate: scale.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0deg', '360deg'],
                }),
              },
            ],
          }}
          resizeMode="cover"
        />
      </Animated.View>
    </View>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    PetitFormalScript_400Regular,
    NotoSerif_400Regular,
  });

  const [showTransition, setShowTransition] = useState(false);

  const handleNavigationStateChange = () => {
    console.log('Navigation state changed - triggering transition');
    setShowTransition(true);
    setTimeout(() => {
      console.log('Hiding transition');
      setShowTransition(false);
    }, 800);
  };

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0C001A' }}>
        <ActivityIndicator size="large" color="#FFFDEE" />
      </View>
    );
  }

  return (
    <>
      <NavigationContainer onStateChange={handleNavigationStateChange}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false,
            cardStyle: { backgroundColor: '#0C001A' },
            transitionSpec: {
              open: { animation: 'timing', config: { duration: 0 } },
              close: { animation: 'timing', config: { duration: 0 } },
            },
            cardStyleInterpolator: () => ({
              cardStyle: { opacity: 1 },
            }),
          }}
        >
          <Stack.Screen name="Home" component={Home} />
          <Stack.Screen name="SignIn" component={SignIn} />
          <Stack.Screen name="IdeaVault" component={IdeaVault} />
          <Stack.Screen name="Notification" component={Notification} />
        </Stack.Navigator>
      </NavigationContainer>
      <DoorTransition isActive={showTransition} />
    </>
  );
}
