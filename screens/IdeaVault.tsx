import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ActivityIndicator, Dimensions, ScrollView } from 'react-native';
import { useState, useRef, useEffect } from 'react';
import { NavigationProp } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useSharedValue, SharedValue, makeMutable } from 'react-native-reanimated';
import { PhysicsEngine } from '../utils/PhysicsEngine';
import DraggableIdeaCard from '../components/DraggableIdeaCard';
import BackgroundNoise from '../components/BackgroundNoise';
import { useAuth } from '../contexts/AuthContext';

const API_URL = 'https://dhqrasy77i.execute-api.us-east-1.amazonaws.com/prod';

interface Discovery {
  finding: string;
  impact: string;
}

interface SurveillanceReport {
  headline: string;
  viabilityDirection: 'up' | 'down' | 'stable';
  discoveries: Discovery[];
  actionPlan: string;
  generatedAt: string;
  confidenceDelta: number;
  newSourceCount: number;
}

interface Dossier {
  ideaId: string;
  title: string;
  rawInput: string;
  status: string;
  createdAt: string;
  lastViewedAt?: string;
  latestReport?: SurveillanceReport | null;
  tags?: string[];
  confidenceScore?: number;
  analysis?: {
    enrichedDescription: string;
    domain: string;
    targetMarket: string;
    tags: string[];
    searchQueries: string[];
    keyAssumptions: string[];
  };
  research?: {
    sources: Array<{
      title: string;
      url: string;
      date: string;
      category: string;
      summary: string;
      relevanceScore: number;
    }>;
    landscapeSummary: string;
  };
  swot?: {
    swot?: {
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      threats: string[];
    };
    strengths?: string[];
    weaknesses?: string[];
    opportunities?: string[];
    threats?: string[];
    confidenceScore?: number;
    confidenceRationale?: string;
    recommendedNextStep?: string;
  };
  x: number;
  y: number;
}

function formatTimeAgo(isoDate: string): string {
  const ms = Date.now() - new Date(isoDate).getTime();
  const hours = Math.floor(ms / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  return `${days}d ago`;
}

interface IdeaVaultProps {
  navigation: NavigationProp<any>;
}

export default function IdeaVault({ navigation }: IdeaVaultProps) {
  const { logout, getAuthToken } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [title, setTitle] = useState('');
  const [rawInput, setRawInput] = useState('');
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [ideas, setIdeas] = useState<Dossier[]>([]);
  const [activeDossier, setActiveDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedIdea, setSelectedIdea] = useState<Dossier | null>(null);
  const [showIdeaDetail, setShowIdeaDetail] = useState(false);
  const [surveillanceLoading, setSurveillanceLoading] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [reportDossier, setReportDossier] = useState<Dossier | null>(null);
  const surveillancePollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Physics engine state
  const physicsEngineRef = useRef<PhysicsEngine | null>(null);
  const [containerLayout, setContainerLayout] = useState({ width: 0, height: 0 });
  const cardPositions = useRef(new Map<string, {
    x: Animated.SharedValue<number>;
    y: Animated.SharedValue<number>;
    rotation: Animated.SharedValue<number>;
  }>()).current;
  const [, forceUpdate] = useState({});

  const MAX_CARDS = 20;

  // Fetch stored ideas on mount
  useEffect(() => {
    const fetchIdeas = async () => {
      try {
        const token = await getAuthToken();
        const response = await fetch(`${API_URL}/ideas`, {
          headers: { 'Authorization': `Bearer ${token}` },
        });
        const data = await response.json();
        if (response.ok && data.ideas) {
          const stored = data.ideas.map((idea: any, i: number) => ({
            ...idea,
            x: 80 + (i % 3) * 100,
            y: 80 + Math.floor(i / 3) * 80,
          }));
          setDossiers(stored);
          setIdeas(stored);
        }
      } catch (err) {
        console.error('Failed to fetch ideas:', err);
      }
    };
    fetchIdeas();
    return () => {
      if (surveillancePollRef.current) clearTimeout(surveillancePollRef.current);
    };
  }, []);

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

  const handleConfirm = async () => {
    if (!title.trim() || !rawInput.trim()) {
      setShowAlert(true);
      return;
    }

    if (ideas.length >= MAX_CARDS) {
      setShowAlert(true);
      return;
    }

    setShowPanel(false);
    setLoading(true);
    setErrorMsg(null);
    setLoadingMessage('Analyzing your idea...');

    const timer = setTimeout(() => {
      setLoadingMessage('Researching market landscape...');
    }, 10000);
    const timer2 = setTimeout(() => {
      setLoadingMessage('Generating SWOT analysis...');
    }, 20000);

    try {
      const token = await getAuthToken();

      const response = await fetch(`${API_URL}/ideas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ title: title.trim(), rawInput: rawInput.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze idea');
      }

      // Add spawn position to the dossier data
      const spawnPos = getSpawnPosition();
      const dossierWithPosition = {
        ...data,
        x: spawnPos.x,
        y: spawnPos.y,
      };

      setDossiers(prev => [dossierWithPosition, ...prev]);
      setIdeas(prev => [dossierWithPosition, ...prev]);
      setActiveDossier(dossierWithPosition);
      setTitle('');
      setRawInput('');
    } catch (err: any) {
      console.error('Pipeline error:', err);
      setErrorMsg(err.message || 'Something went wrong');
    } finally {
      clearTimeout(timer);
      clearTimeout(timer2);
      setLoading(false);
      setLoadingMessage('');
    }
  };

  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = () => {
    setShowDeleteConfirm(false);
    setShowPanel(false);
    setTitle('');
    setRawInput('');
  };

  const handleDeleteCancel = () => {
    setShowDeleteConfirm(false);
  };

  const handleSignOut = async () => {
    await logout();
    navigation.navigate('Home');
  };

  const renderDossierContent = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0C001A" />
          <Text style={styles.loadingText}>{loadingMessage}</Text>
          <Text style={styles.loadingSubtext}>This takes about 30 seconds</Text>
        </View>
      );
    }

    if (errorMsg) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorTitle}>Analysis Failed</Text>
          <Text style={styles.errorText}>{errorMsg}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={() => setErrorMsg(null)}>
            <Text style={styles.retryButtonText}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeDossier) {
      const s = activeDossier.swot?.swot ?? activeDossier.swot;
      const tags = activeDossier.analysis?.tags ?? activeDossier.tags ?? [];
      const confidence = activeDossier.confidenceScore ?? activeDossier.swot?.confidenceScore ?? 0;
      return (
        <ScrollView style={styles.dossierScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.dossierTitle}>{activeDossier.title}</Text>
          {activeDossier.analysis?.domain && (
            <Text style={styles.dossierDomain}>{activeDossier.analysis.domain}</Text>
          )}

          {tags.length > 0 && (
            <View style={styles.tagsRow}>
              {tags.map((tag: string, i: number) => (
                <View key={i} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceLabel}>Confidence</Text>
            <Text style={styles.confidenceScore}>
              {Math.round(confidence * 100)}%
            </Text>
            {activeDossier.latestReport && (
              <View style={[
                styles.confidenceDelta,
                activeDossier.latestReport.confidenceDelta > 0 ? styles.confidenceDeltaUp :
                activeDossier.latestReport.confidenceDelta < 0 ? styles.confidenceDeltaDown :
                styles.confidenceDeltaStable,
              ]}>
                <Text style={styles.confidenceDeltaText}>
                  {activeDossier.latestReport.confidenceDelta > 0 ? '+' : ''}{Math.round(activeDossier.latestReport.confidenceDelta * 100)}%
                </Text>
              </View>
            )}
          </View>

          {activeDossier.latestReport && (
            <TouchableOpacity
              style={styles.reportSection}
              onPress={() => { setReportDossier(activeDossier); setShowReportModal(true); }}
              activeOpacity={0.7}
            >
              <View style={styles.reportHeader}>
                <Text style={styles.reportTitle}>SURVEILLANCE REPORT</Text>
                <View style={[
                  styles.briefingViabilityBadge,
                  activeDossier.latestReport.viabilityDirection === 'up' && styles.briefingViabilityUp,
                  activeDossier.latestReport.viabilityDirection === 'down' && styles.briefingViabilityDown,
                  activeDossier.latestReport.viabilityDirection === 'stable' && styles.briefingViabilityStable,
                ]}>
                  <Text style={styles.briefingViabilityText}>
                    {activeDossier.latestReport.viabilityDirection === 'up' ? 'Trending Up' :
                     activeDossier.latestReport.viabilityDirection === 'down' ? 'Trending Down' : 'Stable'}
                  </Text>
                </View>
              </View>
              <Text style={styles.reportHeadline}>{activeDossier.latestReport.headline}</Text>
              <Text style={styles.reportBody} numberOfLines={2}>
                {activeDossier.latestReport.discoveries?.[0]?.finding ?? 'New intelligence available'}
              </Text>
              <Text style={styles.reportTapHint}>Tap to read full report</Text>
            </TouchableOpacity>
          )}

          {activeDossier.analysis?.enrichedDescription && (
            <>
              <Text style={styles.sectionHeader}>Analysis</Text>
              <Text style={styles.sectionBody}>{activeDossier.analysis.enrichedDescription}</Text>
            </>
          )}

          <Text style={styles.sectionHeader}>Strengths</Text>
          {(s?.strengths ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          <Text style={styles.sectionHeader}>Weaknesses</Text>
          {(s?.weaknesses ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          <Text style={styles.sectionHeader}>Opportunities</Text>
          {(s?.opportunities ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          <Text style={styles.sectionHeader}>Threats</Text>
          {(s?.threats ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          {activeDossier.research?.sources && activeDossier.research.sources.length > 0 && (
            <>
              <Text style={styles.sectionHeader}>Research Sources</Text>
              {activeDossier.research.sources.slice(0, 5).map((src, i) => (
                <View key={i} style={styles.sourceItem}>
                  <Text style={styles.sourceTitle}>{src.title}</Text>
                  <Text style={styles.sourceCategory}>{src.category} — relevance: {Math.round(src.relevanceScore * 100)}%</Text>
                  <Text style={styles.sourceSummary}>{src.summary}</Text>
                </View>
              ))}
            </>
          )}

          {activeDossier.swot?.recommendedNextStep && (
            <>
              <Text style={styles.sectionHeader}>Recommended Next Step</Text>
              <Text style={styles.sectionBody}>{activeDossier.swot.recommendedNextStep}</Text>
            </>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      );
    }

    if (dossiers.length > 0) {
      return (
        <ScrollView style={styles.dossierScroll} showsVerticalScrollIndicator={false}>
          {dossiers.map((d, i) => (
            <TouchableOpacity key={i} style={styles.ideaCard} onPress={() => handleDossierTap(d)}>
              <View style={styles.ideaCardHeader}>
                <Text style={styles.ideaCardTitle}>{d.title}</Text>
                {d.latestReport && (
                  <View style={styles.reportAvailableBadge}>
                    <Text style={styles.reportAvailableText}>Report</Text>
                  </View>
                )}
              </View>
              {d.analysis?.domain && (
                <Text style={styles.ideaCardDomain}>{d.analysis.domain}</Text>
              )}
              <View style={styles.ideaCardFooter}>
                <View style={styles.ideaCardScoreRow}>
                  <Text style={styles.ideaCardScore}>
                    Confidence: {Math.round((d.confidenceScore ?? d.swot?.confidenceScore ?? 0) * 100)}%
                  </Text>
                  {d.latestReport && (
                    <View style={[
                      styles.confidenceDeltaSmall,
                      d.latestReport.confidenceDelta > 0 ? styles.confidenceDeltaUp :
                      d.latestReport.confidenceDelta < 0 ? styles.confidenceDeltaDown :
                      styles.confidenceDeltaStable,
                    ]}>
                      <Text style={styles.confidenceDeltaSmallText}>
                        {d.latestReport.confidenceDelta > 0 ? '+' : ''}{Math.round(d.latestReport.confidenceDelta * 100)}%
                      </Text>
                    </View>
                  )}
                </View>
                {d.lastViewedAt && (
                  <Text style={styles.ideaCardLastViewed}>
                    Viewed {formatTimeAgo(d.lastViewedAt)}
                  </Text>
                )}
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }

    return <Text style={styles.boxText}>Your ideas will appear here</Text>;
  };

  const handleIdeaClick = (idea: Dossier) => {
    handleCardTap(idea);
  };

  const handleDossierTap = async (idea: Dossier) => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/ideas/${idea.ideaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok) {
        const updatedIdea = { ...idea, ...data.idea };
        setActiveDossier(updatedIdea);
        setDossiers(prev => prev.map(d => d.ideaId === idea.ideaId ? updatedIdea : d));
        setIdeas(prev => prev.map(d => d.ideaId === idea.ideaId ? updatedIdea : d));
      } else {
        setActiveDossier(idea);
      }
    } catch (err) {
      console.error('Failed to fetch idea view:', err);
      setActiveDossier(idea);
    }
  };

  const refreshIdeas = async (): Promise<any[]> => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/ideas`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();
      if (response.ok && data.ideas) {
        const stored = data.ideas.map((idea: any, i: number) => ({
          ...idea,
          x: 80 + (i % 3) * 100,
          y: 80 + Math.floor(i / 3) * 80,
        }));
        setDossiers(stored);
        setIdeas(stored);
        return data.ideas;
      }
    } catch (err) {
      console.error('Failed to refresh ideas:', err);
    }
    return [];
  };

  const handleRunSurveillance = async () => {
    setSurveillanceLoading(true);

    try {
      const token = await getAuthToken();
      // Fire-and-forget: trigger surveillance but don't wait for response
      // API Gateway has 29s timeout but Lambda runs for up to 5 min in background
      fetch(`${API_URL}/surveillance/trigger`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      }).then(r => r.json()).then(d => {
        console.log('Surveillance response:', d);
      }).catch(() => {
        // Expected: API Gateway may timeout at 29s, but Lambda keeps running
      });

      // Track which ideas had reports before surveillance started
      const preSweepTimestamps = new Map<string, string>();
      for (const d of dossiers) {
        preSweepTimestamps.set(d.ideaId, d.latestReport?.generatedAt ?? '');
      }
      const totalIdeas = dossiers.length;

      // Poll GET /ideas every 5s to pick up changes as each idea finishes
      const startTime = Date.now();
      const maxDuration = 5 * 60 * 1000; // 5 minutes max
      const pollInterval = 5000;

      const poll = async () => {
        const freshIdeas = await refreshIdeas();

        // Check how many ideas have been updated since sweep started
        let updatedCount = 0;
        for (const idea of freshIdeas) {
          const prevTs = preSweepTimestamps.get(idea.ideaId) ?? '';
          const newTs = idea.latestReport?.generatedAt ?? '';
          if (newTs && newTs !== prevTs) updatedCount++;
        }
        if (updatedCount >= totalIdeas) {
          // All ideas processed — stop polling
          setSurveillanceLoading(false);
          return;
        }
        if (Date.now() - startTime < maxDuration) {
          surveillancePollRef.current = setTimeout(poll, pollInterval);
        } else {
          setSurveillanceLoading(false);
        }
      };

      // Start polling after a short initial delay
      surveillancePollRef.current = setTimeout(poll, pollInterval);
    } catch (err) {
      console.error('Surveillance trigger failed:', err);
      setSurveillanceLoading(false);
    }
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
      if (!cardPositions.has(idea.ideaId)) {
        // Create shared values for this card using makeMutable (can be called anywhere)
        cardPositions.set(idea.ideaId, {
          x: makeMutable(idea.x),
          y: makeMutable(idea.y),
          rotation: makeMutable(0),
        });

        // Add to physics engine
        physicsEngineRef.current.addCard(
          idea.ideaId,
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
      if (!ideas.find(idea => idea.ideaId === id)) {
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
  const handleCardTap = async (idea: Dossier) => {
    try {
      const token = await getAuthToken();
      const response = await fetch(`${API_URL}/ideas/${idea.ideaId}`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await response.json();

      if (response.ok) {
        const updatedIdea = { ...idea, ...data.idea };
        setSelectedIdea(updatedIdea);
        setShowIdeaDetail(true);
        setDossiers(prev => prev.map(d => d.ideaId === idea.ideaId ? updatedIdea : d));
        setIdeas(prev => prev.map(d => d.ideaId === idea.ideaId ? updatedIdea : d));
      } else {
        setSelectedIdea(idea);
        setShowIdeaDetail(true);
      }
    } catch (err) {
      console.error('Failed to fetch idea view:', err);
      setSelectedIdea(idea);
      setShowIdeaDetail(true);
    }
  };

  const handleDragStart = (id: string) => {
    // Card being dragged
  };

  const handleDragMove = (id: string, x: number, y: number) => {
    physicsEngineRef.current?.updateCardPosition(id, x, y);
  };

  const handleDragEnd = (id: string, velocityX: number, velocityY: number) => {
    physicsEngineRef.current?.applyDragRelease(id, velocityX, velocityY);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.container}>
      <BackgroundNoise baseColor="#0C001A" opacity={0.2} />

        {activeDossier && (
          <TouchableOpacity style={styles.navButton} onPress={() => setActiveDossier(null)}>
            <Text style={styles.navButtonText}>All Ideas</Text>
          </TouchableOpacity>
        )}
      <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
        <Text style={styles.signOutButtonText}>Sign Out</Text>
      </TouchableOpacity>

      <View style={styles.mainContent}>
        <Text style={styles.pageTitle}>Idea Vault</Text>
        <View
          style={styles.contentBox}
          onLayout={(event) => {
            const { width, height} = event.nativeEvent.layout;
            setContainerLayout({ width, height });
          }}
        >
          {loading || errorMsg || activeDossier || dossiers.length > 0 ? (
            renderDossierContent()
          ) : ideas.length === 0 ? (
            <Text style={styles.boxText}>Your ideas will appear here</Text>
          ) : (
            <View style={styles.physicsContainer}>
              {ideas.map((idea) => {
                const positions = cardPositions.get(idea.ideaId);
                if (!positions) return null;

                return (
                  <DraggableIdeaCard
                    key={idea.ideaId}
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
        <TouchableOpacity
          style={[styles.actionButton, loading && styles.actionButtonDisabled]}
          onPress={() => setShowPanel(true)}
          disabled={loading}
        >
          <Text style={styles.actionButtonText}>{loading ? 'PROCESSING...' : 'IDEATE'}</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.testButton, surveillanceLoading && styles.actionButtonDisabled]}
          onPress={handleRunSurveillance}
          disabled={surveillanceLoading}
        >
          <Text style={styles.testButtonText}>{surveillanceLoading ? 'SWEEPING...' : 'RUN SURVEILLANCE'}</Text>
        </TouchableOpacity>
      </View>
      <Modal visible={showPanel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>New Idea</Text>
            <TextInput
              style={styles.input}
              placeholder="Name"
              value={title}
              onChangeText={setTitle}
            />
            <TextInput
              style={[styles.input, styles.textArea]}
              placeholder="Description"
              value={rawInput}
              onChangeText={setRawInput}
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
      <Modal visible={showReportModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.reportModalPanel}>
            {reportDossier?.latestReport && (() => {
              const report = reportDossier.latestReport!;
              const confidence = reportDossier.confidenceScore ?? reportDossier.swot?.confidenceScore ?? 0;
              return (
                <>
                  <View style={styles.reportModalHeader}>
                    <Text style={styles.reportModalTitle}>SURVEILLANCE REPORT</Text>
                    <View style={[
                      styles.briefingViabilityBadge,
                      report.viabilityDirection === 'up' && styles.briefingViabilityUp,
                      report.viabilityDirection === 'down' && styles.briefingViabilityDown,
                      report.viabilityDirection === 'stable' && styles.briefingViabilityStable,
                    ]}>
                      <Text style={styles.briefingViabilityText}>
                        {report.viabilityDirection === 'up' ? 'Trending Up' :
                         report.viabilityDirection === 'down' ? 'Trending Down' : 'Stable'}
                      </Text>
                    </View>
                  </View>
                  <ScrollView style={styles.reportModalScroll} showsVerticalScrollIndicator={false}>
                    <Text style={styles.reportModalHeadline}>{report.headline}</Text>

                    <View style={styles.reportModalStats}>
                      <View style={styles.reportModalStat}>
                        <Text style={styles.reportModalStatValue}>{Math.round(confidence * 100)}%</Text>
                        <Text style={styles.reportModalStatLabel}>Confidence</Text>
                      </View>
                      <View style={styles.reportModalStat}>
                        <Text style={styles.reportModalStatValue}>
                          {report.confidenceDelta > 0 ? '+' : ''}{Math.round(report.confidenceDelta * 100)}%
                        </Text>
                        <Text style={styles.reportModalStatLabel}>Change</Text>
                      </View>
                      <View style={styles.reportModalStat}>
                        <Text style={styles.reportModalStatValue}>{report.newSourceCount}</Text>
                        <Text style={styles.reportModalStatLabel}>New Sources</Text>
                      </View>
                    </View>

                    <Text style={styles.reportModalSectionTitle}>Intelligence Discoveries</Text>
                    {(report.discoveries ?? []).map((d: Discovery, i: number) => (
                      <View key={i} style={styles.discoveryCard}>
                        <Text style={styles.discoveryFinding}>{d.finding}</Text>
                        <View style={styles.discoveryImpactRow}>
                          <Text style={styles.discoveryImpactLabel}>Impact:</Text>
                          <Text style={styles.discoveryImpactText}>{d.impact}</Text>
                        </View>
                      </View>
                    ))}

                    <Text style={styles.reportModalSectionTitle}>Recommended Course of Action</Text>
                    <Text style={styles.actionPlanText}>{report.actionPlan}</Text>

                    <Text style={styles.reportModalTimestamp}>
                      Report generated {new Date(report.generatedAt).toLocaleDateString()} at {new Date(report.generatedAt).toLocaleTimeString()}
                    </Text>
                    <View style={{ height: 20 }} />
                  </ScrollView>
                  <TouchableOpacity
                    style={styles.reportModalClose}
                    onPress={() => setShowReportModal(false)}
                  >
                    <Text style={styles.reportModalCloseText}>Close</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>
      <Modal visible={showIdeaDetail} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ideaDetailPanel}>
            {selectedIdea && (
              <>
                <Text style={styles.ideaDetailTitle}>{selectedIdea.title}</Text>
                <ScrollView style={styles.ideaDetailScroll}>
                  <Text style={styles.ideaDetailDescription}>{selectedIdea.rawInput}</Text>
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
  navButton: {
    position: 'absolute',
    top: 40,
    left: 20,
    backgroundColor: '#FFFDEE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
    zIndex: 100,
  },
  navButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 14,
    fontWeight: 'bold',
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
    justifyContent: 'flex-start',
    alignItems: 'center',
    paddingTop: 90,
    paddingHorizontal: 20,
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
  actionButtonDisabled: {
    opacity: 0.5,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
  },
  loadingSubtext: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 12,
    marginTop: 5,
    opacity: 0.6,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#cc0000',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 15,
  },
  retryButton: {
    backgroundColor: '#0C001A',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  retryButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontWeight: 'bold',
  },
  dossierScroll: {
    flex: 1,
    width: '100%',
  },
  dossierTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 4,
  },
  dossierDomain: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    color: '#0C001A',
    opacity: 0.6,
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    backgroundColor: '#0C001A',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  tagText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontSize: 11,
  },
  confidenceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
    backgroundColor: '#0C001A',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  confidenceLabel: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontSize: 12,
  },
  confidenceScore: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C001A',
    marginTop: 14,
    marginBottom: 6,
  },
  sectionBody: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 13,
    color: '#0C001A',
    lineHeight: 20,
  },
  bulletItem: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 13,
    color: '#0C001A',
    lineHeight: 20,
    marginBottom: 4,
    paddingLeft: 4,
  },
  sourceItem: {
    backgroundColor: 'rgba(12, 0, 26, 0.05)',
    borderRadius: 6,
    padding: 10,
    marginBottom: 8,
  },
  sourceTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0C001A',
  },
  sourceCategory: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 11,
    color: '#0C001A',
    opacity: 0.5,
    marginBottom: 4,
  },
  sourceSummary: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    color: '#0C001A',
    lineHeight: 18,
  },
  ideaCard: {
    backgroundColor: 'rgba(12, 0, 26, 0.05)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 10,
  },
  ideaCardTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C001A',
  },
  ideaCardDomain: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    color: '#0C001A',
    opacity: 0.6,
    marginTop: 2,
  },
  ideaCardScore: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    color: '#0C001A',
    marginTop: 4,
    fontWeight: '600',
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
  briefingViabilityBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  briefingViabilityUp: {
    backgroundColor: '#1a5c2a',
  },
  briefingViabilityDown: {
    backgroundColor: '#8b1a1a',
  },
  briefingViabilityStable: {
    backgroundColor: '#0C001A',
  },
  briefingViabilityText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 11,
    color: '#FFFDEE',
    fontWeight: 'bold',
  },
  reportSection: {
    backgroundColor: 'rgba(12, 0, 26, 0.08)',
    borderLeftWidth: 4,
    borderLeftColor: '#0C001A',
    borderRadius: 8,
    padding: 14,
    marginBottom: 16,
  },
  reportHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  reportTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#0C001A',
    letterSpacing: 1,
  },
  reportHeadline: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 8,
  },
  reportBody: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 13,
    color: '#0C001A',
    lineHeight: 20,
    marginBottom: 10,
  },
  reportActionLabel: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 2,
  },
  reportActionText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    color: '#0C001A',
    lineHeight: 18,
    fontStyle: 'italic',
    marginBottom: 8,
  },
  reportTimestamp: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 10,
    color: '#0C001A',
    opacity: 0.5,
  },
  ideaCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ideaCardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  reportAvailableBadge: {
    backgroundColor: '#0C001A',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  reportAvailableText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontSize: 9,
    fontWeight: 'bold',
  },
  ideaCardLastViewed: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 10,
    color: '#0C001A',
    opacity: 0.5,
  },
  confidenceDelta: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 10,
    marginLeft: 8,
  },
  confidenceDeltaUp: {
    backgroundColor: '#1a5c2a',
  },
  confidenceDeltaDown: {
    backgroundColor: '#8b1a1a',
  },
  confidenceDeltaStable: {
    backgroundColor: '#555',
  },
  confidenceDeltaText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#FFFDEE',
  },
  ideaCardScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  confidenceDeltaSmall: {
    paddingVertical: 1,
    paddingHorizontal: 6,
    borderRadius: 8,
    marginLeft: 6,
  },
  confidenceDeltaSmallText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 10,
    fontWeight: 'bold',
    color: '#FFFDEE',
  },
  reportTapHint: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 11,
    color: '#0C001A',
    opacity: 0.5,
    fontStyle: 'italic',
    marginTop: 4,
  },
  reportModalPanel: {
    width: '92%',
    maxHeight: '88%',
    backgroundColor: '#0C001A',
    borderRadius: 12,
    padding: 24,
    borderWidth: 1,
    borderColor: '#FFFDEE',
  },
  reportModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  reportModalTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFDEE',
    letterSpacing: 2,
  },
  reportModalScroll: {
    flex: 1,
  },
  reportModalHeadline: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 20,
    fontWeight: 'bold',
    color: '#FFFDEE',
    marginBottom: 16,
    lineHeight: 28,
  },
  reportModalStats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: 'rgba(255, 253, 238, 0.08)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 20,
  },
  reportModalStat: {
    alignItems: 'center',
  },
  reportModalStatValue: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFDEE',
  },
  reportModalStatLabel: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 10,
    color: '#FFFDEE',
    opacity: 0.6,
    marginTop: 2,
  },
  reportModalSectionTitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    fontWeight: 'bold',
    color: '#FFFDEE',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  reportModalBody: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    color: '#FFFDEE',
    lineHeight: 22,
    opacity: 0.9,
  },
  discoveryCard: {
    backgroundColor: 'rgba(255, 253, 238, 0.06)',
    borderRadius: 8,
    padding: 14,
    marginBottom: 12,
    borderLeftWidth: 3,
    borderLeftColor: 'rgba(255, 253, 238, 0.3)',
  },
  discoveryFinding: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    color: '#FFFDEE',
    lineHeight: 22,
    marginBottom: 8,
  },
  discoveryImpactRow: {
    backgroundColor: 'rgba(255, 253, 238, 0.05)',
    borderRadius: 6,
    padding: 10,
  },
  discoveryImpactLabel: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 11,
    fontWeight: 'bold',
    color: '#FFFDEE',
    opacity: 0.6,
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  discoveryImpactText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 13,
    color: '#FFFDEE',
    lineHeight: 20,
    opacity: 0.9,
    fontStyle: 'italic',
  },
  actionPlanText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 14,
    color: '#FFFDEE',
    lineHeight: 24,
    opacity: 0.9,
  },
  reportModalTimestamp: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 11,
    color: '#FFFDEE',
    opacity: 0.4,
    marginTop: 20,
    textAlign: 'center',
  },
  reportModalClose: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 12,
    paddingHorizontal: 30,
    borderRadius: 6,
    alignSelf: 'center',
    marginTop: 16,
  },
  reportModalCloseText: {
    fontFamily: 'NotoSerif_400Regular',
    color: '#0C001A',
    fontWeight: 'bold',
    fontSize: 14,
  },
});
