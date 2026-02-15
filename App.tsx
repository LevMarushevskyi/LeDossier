import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import Home from './screens/Home';
import IdeaVault from './screens/IdeaVault';
import Notification from './screens/Notification';
import Setting from './screens/Setting';
import { useFonts, PetitFormalScript_400Regular } from '@expo-google-fonts/petit-formal-script';
import { NotoSerif_400Regular } from '@expo-google-fonts/noto-serif';
import { View, ActivityIndicator } from 'react-native';

const Stack = createStackNavigator();

export default function App() {
  const [fontsLoaded] = useFonts({
    PetitFormalScript_400Regular,
    NotoSerif_400Regular,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0C001A' }}>
        <ActivityIndicator size="large" color="#FFFDEE" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          cardStyle: { backgroundColor: '#0C001A' },
        }}
      >
        <Stack.Screen name="Home" component={Home} />
        <Stack.Screen name="IdeaVault" component={IdeaVault} />
        <Stack.Screen name="Notification" component={Notification} />
        <Stack.Screen name="Setting" component={Setting} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
