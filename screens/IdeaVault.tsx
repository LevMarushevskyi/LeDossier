import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform, Dimensions, ScrollView } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { NavigationProp } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, SharedValue, makeMutable } from 'react-native-reanimated';
import { PhysicsEngine } from '../utils/PhysicsEngine';
import DraggableIdeaCard from '../components/DraggableIdeaCard';
import BackgroundNoise from '../components/BackgroundNoise';

interface Idea {
  name: string;
  description: string;
  id: number;
  x: number;
  y: number;
}

interface IdeaVaultProps {
  navigation: NavigationProp<any>;
}

export default function IdeaVault({ navigation }: IdeaVaultProps) {
  const [showPanel, setShowPanel] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [showIdeaDetail, setShowIdeaDetail] = useState(false);

  // Physics engine state
  const physicsEngineRef = useRef<PhysicsEngine | null>(null);
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const cardPositions = useRef(new Map<number, {
    x: Animated.SharedValue<number>;
    y: Animated.SharedValue<number>;
    rotation: Animated.SharedValue<number>;
  }>()).current;
  const [, forceUpdate] = useState({});

  const MAX_CARDS = 20;

  // Calculate spawn position for new cards (cascade from top-center)
  const getSpawnPosition = () => {
    const baseX = containerLayout.width / 2;
    const baseY = 100;
    const offsetX = (Math.random() - 0.5) * 100; // Random spread
    const offsetY = ideas.length * 20; // Cascade down

    // Clamp to container bounds
    const x = Math.max(80, Math.min(containerLayout.width - 80, baseX + offsetX));
    const y = Math.max(60, Math.min(containerLayout.height - 60, baseY + offsetY));

    return { x, y };
  };

  const handleConfirm = () => {
    if (!name.trim() || !description.trim()) {
      setShowAlert(true);
      return;
    }

    if (ideas.length >= MAX_CARDS) {
      setShowAlert(true);
      return;
    }

    const spawnPos = getSpawnPosition();
    const newIdea: Idea = {
      name,
      description,
      id: Date.now(),
      x: spawnPos.x,
      y: spawnPos.y,
    };

    setIdeas([...ideas, newIdea]);
    console.log('Created idea with physics:', newIdea);
    setShowPanel(false);
    setName('');
    setDescription('');
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setShowPanel(false);
    setName('');
    setDescription('');
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleSignOut = async () => {
    try {
      const FLASK_URL = 'http://localhost:5000';

      // Call Flask logout endpoint to clear server session
      await fetch(`${FLASK_URL}/logout`, {
        method: 'GET',
        credentials: 'include', // Include cookies for session management
      });

      // Clear client-side auth data for web platform
      if (Platform.OS === 'web') {
        localStorage.removeItem('ledossier_auth');
      }

      // Navigate back to home
      navigation.navigate('Home');
    } catch (error) {
      console.error('Sign out error:', error);
      // Navigate to home anyway even if logout call fails
      navigation.navigate('Home');
    }
  };

  const handleIdeaClick = (idea: Idea) => {
    setSelectedIdea(idea);
    setShowIdeaDetail(true);
  };

  // Initialize physics engine when container layout is known
  useEffect(() => {
    if (containerLayout.width > 0 && containerLayout.height > 0) {
      physicsEngineRef.current = new PhysicsEngine(
        containerLayout.width,
        containerLayout.height
      );
    }

    return () => {
      physicsEngineRef.current?.destroy();
    };
  }, [containerLayout.width, containerLayout.height]);

  // Create shared values for new ideas and sync with physics
  useEffect(() => {
    if (!physicsEngineRef.current) return;

    let needsUpdate = false;

    ideas.forEach((idea) => {
      if (!cardPositions.has(idea.id)) {
        // Create shared values for this card using makeMutable (can be called anywhere)
        cardPositions.set(idea.id, {
          x: makeMutable(idea.x),
          y: makeMutable(idea.y),
          rotation: makeMutable(0),
        });

        // Add to physics engine
        physicsEngineRef.current.addCard(
          idea.id,
          idea.x,
          idea.y,
          160, // CARD_WIDTH
          120  // CARD_HEIGHT
        );

        needsUpdate = true;
      }
    });

    // Remove cards that were deleted
    cardPositions.forEach((_, id) => {
      if (!ideas.find(idea => idea.id === id)) {
        physicsEngineRef.current?.removeCard(id);
        cardPositions.delete(id);
        needsUpdate = true;
      }
    });

    // Force re-render if positions changed
    if (needsUpdate) {
      forceUpdate({});
    }
  }, [ideas, cardPositions]);

  // Physics update loop
  useEffect(() => {
    if (!physicsEngineRef.current || ideas.length === 0) return;

    let lastTime = Date.now();
    let animationFrame: number;

    const updatePhysics = () => {
      const now = Date.now();
      const delta = now - lastTime;
      lastTime = now;

      // Step physics simulation
      physicsEngineRef.current?.step(delta);

      // Update shared values from physics
      const positions = physicsEngineRef.current?.getAllCardPositions();
      positions?.forEach((pos, id) => {
        const cardPos = cardPositions.get(id);
        if (cardPos) {
          cardPos.x.value = pos.x;
          cardPos.y.value = pos.y;
          cardPos.rotation.value = pos.rotation;
        }
      });

      animationFrame = requestAnimationFrame(updatePhysics);
    };

    animationFrame = requestAnimationFrame(updatePhysics);

    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, [ideas, cardPositions]);

  // Gesture handlers
  const handleCardTap = (idea: Idea) => {
    setSelectedIdea(idea);
    setShowIdeaDetail(true);
  };

  const handleDragStart = (id: number) => {
    // Card being dragged
  };

  const handleDragMove = (id: number, x: number, y: number) => {
    physicsEngineRef.current?.updateCardPosition(id, x, y);
  };

  const handleDragEnd = (id: number, velocityX: number, velocityY: number) => {
    physicsEngineRef.current?.applyDragRelease(id, velocityX, velocityY);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
      <BackgroundNoise baseColor="#0C001A" opacity={0.2} />

      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.mainContent}>
        <Text style={styles.pageTitle}>Idea Vault</Text>
        <View
          style={styles.contentBox}
          onLayout={(event) => {
            const { width, height } = event.nativeEvent.layout;
            setContainerLayout({ width, height });
          }}
        >
          {ideas.length === 0 ? (
            <Text style={styles.boxText}>Your ideas will appear here</Text>
          ) : (
            <View style={styles.physicsContainer}>
              {ideas.map((idea) => {
                const positions = cardPositions.get(idea.id);
                if (!positions) return null;

                return (
                  <DraggableIdeaCard
                    key={idea.id}
                    idea={idea}
                    initialX={idea.x}
                    initialY={idea.y}
                    onTap={handleCardTap}
                    onDragStart={handleDragStart}
                    onDragMove={handleDragMove}
                    onDragEnd={handleDragEnd}
                    physicsX={positions.x}
                    physicsY={positions.y}
                    physicsRotation={positions.rotation}
                    containerWidth={containerLayout.width}
                    containerHeight={containerLayout.height}
                  />
                );
              })}
            </View>
          )}
        </View>
      </View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.actionButton} onPress={() => setShowPanel(true)}>
          <Text style={styles.actionButtonText}>IDEATE</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={showPanel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>New Idea</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description"
              value={description}
              onChangeText={setDescription}
              multiline
            />
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteClick}>
                <Text style={styles.deleteButtonText}>Delete</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showAlert} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.alertPanel}>
            <Text style={styles.alertTitle}>Missing Information</Text>
            <Text style={styles.alertMessage}>Please provide both a name and description.</Text>
            <TouchableOpacity style={styles.alertButton} onPress={() => setShowAlert(false)}>
              <Text style={styles.alertButtonText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <Modal visible={showDeleteConfirm} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.alertPanel}>
            <Text style={styles.alertTitle}>Are you sure?</Text>
            <Text style={styles.alertMessage}>This will discard your current idea.</Text>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.confirmButton} onPress={handleDeleteConfirm}>
                <Text style={styles.confirmButtonText}>Continue</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteCancel}>
                <Text style={styles.deleteButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      <Modal visible={showIdeaDetail} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ideaDetailPanel}>
            {selectedIdea && (
              <>
                <Text style={styles.ideaDetailTitle}>{selectedIdea.name}</Text>
                <ScrollView style={styles.ideaDetailScroll}>
                  <Text style={styles.ideaDetailDescription}>{selectedIdea.description}</Text>
                </ScrollView>
                <TouchableOpacity
                  style={styles.closeButton}
                  onPress={() => setShowIdeaDetail(false)}
                >
                  <Text style={styles.closeButtonText}>Close</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>
      </View>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C001A',
  },
  signOutButton: {
    position: 'absolute',
    top: 40,
    right: 20,
    backgroundColor: '#FFFDEE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    zIndex: 100,
  },
  signOutButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 14,
    fontWeight: 'bold',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pageTitle: {
    fontFamily: 'PetitFormalScript_400Regular',
    fontSize: 48,
    color: '#FFFDEE',
    marginBottom: 30,
  },
  contentBox: {
    width: '90%',
    height: '60%',
    backgroundColor: '#FFFDEE',
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    overflow: 'hidden',
  },
  physicsContainer: {
    flex: 1,
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  boxText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 18,
  },
  footer: {
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  actionButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 15,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 10,
  },
  actionButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 18,
    fontWeight: 'bold',
  },
  backButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  backButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 0, 26, 0.5)',
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 40,
  },
  panel: {
    width: '90%',
    backgroundColor: '#FFFDEE',
    borderRadius: 10,
    padding: 30,
    maxHeight: '70%',
  },
  panelTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 20,
  },
  input: {
    backgroundColor: '#FFFDEE',
    borderWidth: 1,
    borderColor: '#0C001A',
    borderRadius: 5,
    padding: 10,
    marginBottom: 15,
    color: '#0C001A',
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
  },
  addButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  addButtonText: {
    color: '#0C001A',
    fontWeight: 'bold',
  },
  testButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    marginTop: 10,
  },
  testButtonText: {
    color: '#0C001A',
    fontWeight: 'bold',
  },
  confirmButton: {
    backgroundColor: '#0C001A',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  confirmButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontWeight: 'bold',
  },
  deleteButton: {
    backgroundColor: '#0C001A',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  deleteButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontWeight: 'bold',
  },
  alertPanel: {
    width: '70%',
    backgroundColor: '#FFFDEE',
    borderRadius: 10,
    padding: 20,
    alignItems: 'center',
  },
  alertTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 10,
  },
  alertMessage: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    color: '#0C001A',
    marginBottom: 20,
    textAlign: 'center',
  },
  alertButton: {
    backgroundColor: '#0C001A',
    paddingVertical: 10,
    paddingHorizontal: 30,
    borderRadius: 5,
  },
  alertButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontWeight: 'bold',
  },
  ideaDetailPanel: {
    width: '85%',
    maxHeight: '80%',
    backgroundColor: '#FFFDEE',
    borderRadius: 10,
    padding: 20,
  },
  ideaDetailTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 15,
  },
  ideaDetailScroll: {
    maxHeight: 400,
    marginBottom: 20,
  },
  ideaDetailDescription: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    color: '#0C001A',
    lineHeight: 24,
  },
  closeButton: {
    backgroundColor: '#0C001A',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 5,
    alignSelf: 'center',
  },
  closeButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontWeight: 'bold',
    fontSize: 16,
  },
});
