import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';

interface Dossier {
  ideaId: string;
  title: string;
  rawInput: string;
  status: string;
  createdAt: string;
  analysis?: any;
  research?: any;
  swot?: any;
  latestReport?: any;
  x: number;
  y: number;
}

interface DraggableIdeaCardProps {
  idea: Dossier;
  initialX: number;
  initialY: number;
  onTap: (idea: Dossier) => void;
  onDragStart: (id: string) => void;
  onDragMove: (id: string, x: number, y: number) => void;
  onDragEnd: (id: string, velocityX: number, velocityY: number) => void;
  physicsX: Animated.SharedValue<number>;
  physicsY: Animated.SharedValue<number>;
  physicsRotation: Animated.SharedValue<number>;
  containerWidth: number;
  containerHeight: number;
}

const CARD_WIDTH = 160;
const CARD_HEIGHT = 120;

function DraggableIdeaCard({
  idea,
  initialX,
  initialY,
  onTap,
  onDragStart,
  onDragMove,
  onDragEnd,
  physicsX,
  physicsY,
  physicsRotation,
  containerWidth,
  containerHeight,
}: DraggableIdeaCardProps) {
  const isDragging = useSharedValue(false);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart((event) => {
      isDragging.value = true;
      startX.value = physicsX.value;
      startY.value = physicsY.value;
      runOnJS(onDragStart)(idea.ideaId);
    })
    .onUpdate((event) => {
      const newX = startX.value + event.translationX;
      const newY = startY.value + event.translationY;

      // Clamp position to container bounds
      const minX = CARD_WIDTH / 2;
      const maxX = containerWidth - CARD_WIDTH / 2;
      const minY = CARD_HEIGHT / 2;
      const maxY = containerHeight - CARD_HEIGHT / 2;

      const clampedX = Math.max(minX, Math.min(maxX, newX));
      const clampedY = Math.max(minY, Math.min(maxY, newY));

      physicsX.value = clampedX;
      physicsY.value = clampedY;
      runOnJS(onDragMove)(idea.ideaId, clampedX, clampedY);
    })
    .onEnd((event) => {
      isDragging.value = false;
      runOnJS(onDragEnd)(idea.ideaId, event.velocityX / 1000, event.velocityY / 1000);
    });

  const tapGesture = Gesture.Tap()
    .maxDuration(250)
    .onEnd(() => {
      if (!isDragging.value) {
        runOnJS(onTap)(idea);
      }
    });

  const composedGesture = Gesture.Race(panGesture, tapGesture);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        { translateX: physicsX.value - CARD_WIDTH / 2 },
        { translateY: physicsY.value - CARD_HEIGHT / 2 },
        { rotate: `${physicsRotation.value}rad` },
      ],
    };
  });

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={[styles.card, animatedStyle]}>
        <View style={styles.cardShadow}>
          <Image
            source={require('../assets/file_texture.png')}
            style={styles.cardShadowImage}
            resizeMode="cover"
          />
        </View>
        <View style={styles.cardForeground}>
          <Image
            source={require('../assets/file_texture.png')}
            style={styles.cardTextureImage}
            resizeMode="stretch"
          />
          <View style={styles.cardTextArea}>
            <Text style={styles.cardTitle} numberOfLines={3}>
              {idea.title}
            </Text>
          </View>
          {idea.latestReport && (
            <Image
              source={require('../assets/arrow_but_dark.png')}
              style={[
                styles.reportArrow,
                idea.latestReport.viabilityDirection !== 'down' && styles.reportArrowUp,
              ]}
              resizeMode="contain"
            />
          )}
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  cardShadow: {
    position: 'absolute',
    top: -3,
    left: -3,
    width: CARD_WIDTH + 6,
    height: CARD_HEIGHT + 6,
    borderRadius: 10,
    overflow: 'hidden',
  },
  cardShadowImage: {
    width: '100%',
    height: '100%',
    tintColor: '#0C001A',
  },
  cardForeground: {
    flex: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardTextureImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
  },
  cardTextArea: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '60%',
    justifyContent: 'flex-start',
    padding: 10,
  },
  cardTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0C001A',
  },
  cardPreview: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    color: '#FFFDEE',
    opacity: 0.7,
  },
  reportArrow: {
    position: 'absolute',
    top: '30%',
    right: 4,
    width: 16,
    height: 16,
  },
  reportArrowUp: {
    transform: [{ rotate: '180deg' }],
  },
});

export default React.memo(DraggableIdeaCard, (prev, next) => {
  return prev.idea.ideaId === next.idea.ideaId
    && prev.idea.latestReport?.generatedAt === next.idea.latestReport?.generatedAt;
});
