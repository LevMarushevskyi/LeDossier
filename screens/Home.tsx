import { View, StyleSheet, Text, TouchableOpacity } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import BackgroundNoise from '../components/BackgroundNoise';

interface HomeProps {
  navigation: NavigationProp<any>;
}

export default function Home({ navigation }: HomeProps) {
  return (
    <View style={styles.container}>
      <BackgroundNoise baseColor="#0C001A" opacity={0.2} />

      <View style={styles.titleContainer}>
        <Text style={styles.title}>Le Dossier</Text>
      </View>
      <View style={styles.centerShapes}>
        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => navigation.navigate('SignIn')}
        >
          <Text style={styles.signInText}>SIGN IN</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C001A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    marginBottom: 50,
  },
  title: {
    fontFamily: 'PetitFormalScript_400Regular',
    fontSize: 64,
    color: '#FFFDEE',
    textAlign: 'center',
  },
  centerShapes: {
    alignItems: 'center',
  },
  signInButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 20,
    paddingHorizontal: 60,
    borderRadius: 10,
  },
  signInText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0C001A',
    textAlign: 'center',
  },
});
