import { View, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import { useMemo } from 'react';
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
      <View style={styles.bottomHalf}>
        <View style={styles.papersContainer}>
          <Image source={require('../assets/papers.png')} style={styles.papersImage} resizeMode="contain" />
          <View style={styles.papersOverlay}>
            <TouchableOpacity style={styles.signInTransform} onPress={() => navigation.navigate('SignIn')}>
              <Text style={styles.overlayButtonText}>SIGN IN</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.createAccountTransform} onPress={() => navigation.navigate('SignIn', { mode: 'register' })}>
              <Text style={styles.overlayButtonText}>CREATE ACCOUNT</Text>
            </TouchableOpacity>
          </View>
        </View>
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
  papersContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  papersImage: {
    width: 500,
    height: 500,
  },
  papersOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  overlayButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0C001A',
    textAlign: 'center',
  },
  signInTransform: {
    transform: [{ translateX: -120 }, { translateY: -80 }, { rotate: '-30deg' }],
  },
  createAccountTransform: {
    transform: [{ translateX: 80 }, { translateY: -120 }, { rotate: '7deg' }],
  },
});
