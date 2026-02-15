import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
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
        <Text style={styles.cardTitle} numberOfLines={4}>
          {idea.title}
        </Text>
        {idea.latestReport && (
          <View style={styles.reportDot} />
        )}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    backgroundColor: '#0C001A',
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFDEE',
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  cardTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFDEE',
    marginBottom: 6,
  },
  cardPreview: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    color: '#FFFDEE',
    opacity: 0.7,
  },
  reportDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#4CAF50',
  },
});

export default React.memo(DraggableIdeaCard, (prev, next) => {
  return prev.idea.ideaId === next.idea.ideaId
    && prev.idea.latestReport?.generatedAt === next.idea.latestReport?.generatedAt;
});
