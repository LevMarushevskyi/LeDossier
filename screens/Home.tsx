import { View, StyleSheet, Text, TouchableOpacity, Image } from 'react-native';
import { useMemo } from 'react';
import { NavigationProp } from '@react-navigation/native';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import BackgroundNoise from '../components/BackgroundNoise';

interface HomeProps {
  navigation: NavigationProp<any>;
}

export default function Home({ navigation }: HomeProps) {
  const gradientId = useMemo(() => `stripFade-home-${Math.random().toString(36).substr(2, 9)}`, []);

  return (
    <View style={styles.container}>
      <BackgroundNoise baseColor="#0C001A" opacity={0.2} />

      <View style={styles.centerStrip}>
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#0C001A" stopOpacity="0" />
              <Stop offset="0.25" stopColor="#0C001A" stopOpacity="1" />
              <Stop offset="0.75" stopColor="#0C001A" stopOpacity="1" />
              <Stop offset="1" stopColor="#0C001A" stopOpacity="0" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
        </Svg>
      </View>

      <View style={styles.topHalf}>
        <View style={styles.titleContainer}>
          <Text style={styles.titleBold}>Le</Text>
          <Text style={styles.title}>Dossier</Text>
        </View>
        <View style={styles.divider} />
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
    alignItems: 'center',
  },
  centerStrip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '10%',
    right: '10%',
  },
  topHalf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bottomHalf: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleContainer: {
    alignItems: 'flex-start',
  },
  divider: {
    width: '60%',
    height: 1,
    backgroundColor: '#FFFDEE',
    marginTop: 20,
  },
  titleBold: {
    fontFamily: 'PetitFormalScript_400Regular',
    fontSize: 120,
    color: '#FFFDEE',
    fontWeight: 'bold',
  },
  title: {
    fontFamily: 'PetitFormalScript_400Regular',
    fontSize: 120,
    color: '#FFFDEE',
    marginLeft: 80,
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
