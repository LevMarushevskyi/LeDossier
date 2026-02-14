import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Home from './screens/Home';
import IdeaVault from './screens/IdeaVault';
import { useFonts, PetitFormalScript_400Regular } from '@expo-google-fonts/petit-formal-script';
import { NotoSerif_400Regular } from '@expo-google-fonts/noto-serif';

const Stack = createNativeStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    PetitFormalScript_400Regular,
    NotoSerif_400Regular,
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="IdeaVault" component={IdeaVault} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
