import { View, StyleSheet, Animated, Easing } from 'react-native';
import { useEffect, useRef } from 'react';

interface PageTransitionProps {
  isActive: boolean;
  onComplete: () => void;
}

export default function PageTransition({ isActive, onComplete }: PageTransitionProps) {
  const scale = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (isActive) {
      scale.setValue(0);
      opacity.setValue(0);
      
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1,
          duration: 400,
          easing: Easing.out(Easing.circle),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 600,
          easing: Easing.out(Easing.circle),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.circle),
          useNativeDriver: true,
        }),
      ]).start(() => {
        onComplete();
      });
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <View style={styles.container}>
      <Animated.Image
        source={require('../assets/door.png')}
        style={[
          styles.image,
          {
            transform: [
              { scale: scale.interpolate({ inputRange: [0, 1], outputRange: [0.05, 50] }) },
              { rotate: scale.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '36deg'] }) },
            ],
          },
        ]}
      />
      <Animated.View style={[styles.fadeOverlay, { opacity }]}>
        <Animated.View style={{ opacity: opacity.interpolate({ inputRange: [0, 1], outputRange: [0, 1] }) }} />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
    pointerEvents: 'none',
  },
  image: {
    width: 100,
    height: 100,
    position: 'absolute',
  },
  fadeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0C001A',
  },
});
