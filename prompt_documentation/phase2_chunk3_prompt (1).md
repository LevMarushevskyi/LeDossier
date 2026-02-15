# LeDossier Phase 2 — Chunk 3 Prompt: Frontend + Demo Prep

Copy everything between the `---START---` and `---END---` markers and paste it as your first message in a new Claude Code session, run from the project root directory (where `App.tsx`, `screens/`, and `ledossier-backend/` live).

---START---

# Task: LeDossier Phase 2, Chunk 3 — Frontend Integration + Demo Prep

You are working on **LeDossier**, a hackathon project — an AI-powered idea incubation platform with a noir detective theme. It's a React Native (Expo) app with an AWS serverless backend.

In previous steps we:
1. Created two new backend Lambdas: `surveillance` (background SWOT updates) and `idea-view` (`GET /ideas/{ideaId}` with return briefings)
2. Deployed them via CDK with new API Gateway routes

**Your job is to wire up the frontend, update the GenAI log, and seed demo data.**

## Design Language

The app uses a noir theme with two core colors:
- **Dark**: `#0C001A` (backgrounds, buttons)
- **Cream**: `#FFFDEE` (text, panels, cards)
- **Font**: `NotoSerif_400Regular` for body text, `PetitFormalScript_400Regular` for the page title

All modals use the same pattern: `<Modal visible={...} transparent animationType="fade">` wrapping a `modalOverlay` View containing a styled panel.

## API Context

```
Base URL: https://dhqrasy77i.execute-api.us-east-1.amazonaws.com/prod
```

Existing endpoints:
- `POST /ideas` — create a new idea (triggers full analysis pipeline)
- `GET /ideas` — list all ideas for the authenticated user

**New endpoints (deployed in Chunk 2):**
- `GET /ideas/{ideaId}` — view a single idea; returns `{ idea, briefing, daysAway, hasBriefing }`. If user was away >24h and surveillance has run, `briefing` contains `{ headline, body, viabilityDirection, recommendedAction, changeSummaries, surveillanceRunCount, daysAway }`.
- `POST /surveillance/trigger` — manually triggers a surveillance cycle (for demo). Returns `{ processed, failed, total }`.

All endpoints require `Authorization: Bearer <token>` header via Cognito.

## Current `screens/IdeaVault.tsx` — COMPLETE FILE

This is the only frontend file you will modify. Here it is in full:

```tsx
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

interface Dossier {
  ideaId: string;
  title: string;
  rawInput: string;
  status: string;
  createdAt: string;
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
  }, []);

  // Calculate spawn position for new cards
  const getSpawnPosition = () => {
    const baseX = containerLayout.width / 2;
    const baseY = 100;
    const offsetX = (Math.random() - 0.5) * 100;
    const offsetY = ideas.length * 20;
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
      const spawnPos = getSpawnPosition();
      const dossierWithPosition = { ...data, x: spawnPos.x, y: spawnPos.y };
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

  const handleDeleteClick = () => { setShowDeleteConfirm(true); };
  const handleDeleteConfirm = () => { setShowDeleteConfirm(false); setShowPanel(false); setTitle(''); setRawInput(''); };
  const handleDeleteCancel = () => { setShowDeleteConfirm(false); };
  const handleSignOut = async () => { await logout(); navigation.navigate('Home'); };

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
      const confidence = activeDossier.swot?.confidenceScore ?? activeDossier.confidenceScore ?? 0;
      return (
        <ScrollView style={styles.dossierScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.dossierTitle}>{activeDossier.title}</Text>
          {activeDossier.analysis?.domain && (
            <Text style={styles.dossierDomain}>{activeDossier.analysis.domain}</Text>
          )}
          {tags.length > 0 && (
            <View style={styles.tagsRow}>
              {tags.map((tag: string, i: number) => (
                <View key={i} style={styles.tag}><Text style={styles.tagText}>{tag}</Text></View>
              ))}
            </View>
          )}
          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceLabel}>Confidence</Text>
            <Text style={styles.confidenceScore}>{Math.round(confidence * 100)}%</Text>
          </View>
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
            <TouchableOpacity key={i} style={styles.ideaCard} onPress={() => setActiveDossier(d)}>
              <Text style={styles.ideaCardTitle}>{d.title}</Text>
              {d.analysis?.domain && (
                <Text style={styles.ideaCardDomain}>{d.analysis.domain}</Text>
              )}
              <Text style={styles.ideaCardScore}>
                Confidence: {Math.round((d.swot?.confidenceScore ?? d.confidenceScore ?? 0) * 100)}%
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }
    return <Text style={styles.boxText}>Your ideas will appear here</Text>;
  };

  const handleIdeaClick = (idea: Dossier) => {
    setSelectedIdea(idea);
    setShowIdeaDetail(true);
  };

  // Initialize physics engine when container layout is known
  useEffect(() => {
    if (containerLayout.width > 0 && containerLayout.height > 0) {
      physicsEngineRef.current = new PhysicsEngine(containerLayout.width, containerLayout.height);
    }
    return () => { physicsEngineRef.current?.destroy(); };
  }, [containerLayout.width, containerLayout.height]);

  // Create shared values for new ideas and sync with physics
  useEffect(() => {
    if (!physicsEngineRef.current) return;
    let needsUpdate = false;
    ideas.forEach((idea) => {
      if (!cardPositions.has(idea.ideaId)) {
        cardPositions.set(idea.ideaId, {
          x: makeMutable(idea.x),
          y: makeMutable(idea.y),
          rotation: makeMutable(0),
        });
        physicsEngineRef.current.addCard(idea.ideaId, idea.x, idea.y, 160, 120);
        needsUpdate = true;
      }
    });
    cardPositions.forEach((_, id) => {
      if (!ideas.find(idea => idea.ideaId === id)) {
        physicsEngineRef.current?.removeCard(id);
        cardPositions.delete(id);
        needsUpdate = true;
      }
    });
    if (needsUpdate) forceUpdate({});
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
      physicsEngineRef.current?.step(delta);
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
    return () => { cancelAnimationFrame(animationFrame); };
  }, [ideas, cardPositions]);

  // Gesture handlers
  const handleCardTap = (idea: Dossier) => {
    setSelectedIdea(idea);
    setShowIdeaDetail(true);
  };

  const handleDragStart = (id: string) => {};
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
      </View>

      {/* New Idea Modal */}
      <Modal visible={showPanel} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.panel}>
            <Text style={styles.panelTitle}>New Idea</Text>
            <TextInput style={styles.input} placeholder="Name" value={title} onChangeText={setTitle} />
            <TextInput style={[styles.input, styles.textArea]} placeholder="Description" value={rawInput} onChangeText={setRawInput} multiline />
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

      {/* Alert Modal */}
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

      {/* Delete Confirm Modal */}
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

      {/* Idea Detail Modal (currently just shows title + rawInput) */}
      <Modal visible={showIdeaDetail} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.ideaDetailPanel}>
            {selectedIdea && (
              <>
                <Text style={styles.ideaDetailTitle}>{selectedIdea.title}</Text>
                <ScrollView style={styles.ideaDetailScroll}>
                  <Text style={styles.ideaDetailDescription}>{selectedIdea.rawInput}</Text>
                </ScrollView>
                <TouchableOpacity style={styles.closeButton} onPress={() => setShowIdeaDetail(false)}>
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

// ... StyleSheet with all existing styles follows (see below for the ones you'll add to)
```

### Existing styles you'll reference (already in the StyleSheet)

These styles already exist and you should reuse them where possible:
- `modalOverlay` — `flex:1, backgroundColor:'rgba(12,0,26,0.5)', justifyContent:'flex-start', alignItems:'center', paddingTop:40`
- `alertPanel` — `width:'70%', backgroundColor:'#FFFDEE', borderRadius:10, padding:20, alignItems:'center'`
- `alertTitle` — `fontFamily:'NotoSerif_400Regular', fontSize:20, fontWeight:'bold', color:'#0C001A', marginBottom:10`
- `alertMessage` — `fontFamily:'NotoSerif_400Regular', fontSize:16, color:'#0C001A', marginBottom:20, textAlign:'center'`
- `confirmButton` / `confirmButtonText` — dark bg cream text button style
- `closeButton` / `closeButtonText` — dark bg cream text, self-centered
- `testButton` / `testButtonText` — cream bg dark text (already in stylesheet but not currently used in JSX)
- `loadingContainer`, `loadingText`, `loadingSubtext` — centered loading state

---

## Your Tasks (4 things to do)

### Task 1: Modify `handleCardTap` to call the view endpoint

Currently `handleCardTap` just shows cached data:
```tsx
const handleCardTap = (idea: Dossier) => {
  setSelectedIdea(idea);
  setShowIdeaDetail(true);
};
```

Replace it with an async function that:
1. Sets loading state with message `'Loading dossier...'`
2. Calls `GET ${API_URL}/ideas/${idea.ideaId}` with the auth token
3. On success:
   - Updates `selectedIdea` with the full `data.idea` from the response
   - Also updates the idea in the `dossiers` and `ideas` arrays (so the card reflects any updated confidence score)
   - If `data.hasBriefing && data.briefing`, store the briefing and show the **briefing modal** (new, see Task 2)
   - If no briefing, show the existing `showIdeaDetail` modal
4. On error: fall back to showing the cached `idea` data in `showIdeaDetail` (log the error, don't crash)
5. Clears loading state in `finally`

Also update the `handleIdeaClick` function (used by the dossier list view) to use the same logic. Currently it does the same simple set-and-show as `handleCardTap`.

### Task 2: Add the return briefing modal

Add new state variables:
```tsx
const [returnBriefing, setReturnBriefing] = useState<any>(null);
const [showBriefingModal, setShowBriefingModal] = useState(false);
```

Add a new `<Modal>` for the briefing, placed alongside the other modals. The briefing modal should display:

1. **Headline** — `returnBriefing?.headline` — large, bold, noir-styled
2. **Days away** — "You were away X day(s)" — subtle subtext
3. **Viability badge** — shows `↑ Improving`, `↓ Declining`, or `→ Stable` based on `returnBriefing?.viabilityDirection`
4. **Body** — `returnBriefing?.body` — the 4-6 sentence briefing text
5. **Recommended action** — `returnBriefing?.recommendedAction` — prefixed with "Next step:"
6. **Dismiss button** — labeled "View Full Dossier", which closes the briefing modal and opens the idea detail modal

Style the briefing modal to match the existing noir aesthetic:
- Panel: cream background (`#FFFDEE`), rounded corners, padding
- Text: dark color (`#0C001A`), `NotoSerif_400Regular` font
- Viability badge: dark background with cream text, small rounded container (similar to the existing `confidenceBadge` style)
- Width: `85%` of screen (same as `ideaDetailPanel`)

Add the necessary new styles to the `StyleSheet.create` block. Name them with a `briefing` prefix (e.g., `briefingPanel`, `briefingHeadline`, `briefingBody`, `briefingDaysAway`, `briefingAction`, `briefingDismiss`, `briefingDismissText`, `viabilityBadge`, `viabilityText`).

### Task 3: Add "Run Surveillance" button in the footer

Add a button in the footer, **below** the existing IDEATE button, that manually triggers a surveillance cycle. This is for demo purposes — you can't wait 6 hours for EventBridge during a presentation.

When pressed:
1. Set loading with message `'Running surveillance cycle...'`
2. Call `POST ${API_URL}/surveillance/trigger` with the auth token
3. After it completes, refresh the ideas list by calling `GET ${API_URL}/ideas`
4. Update `dossiers` and `ideas` state with the refreshed data (map with position offsets, same pattern as the `useEffect` fetch on mount)
5. Clear loading in `finally`

Use the existing `testButton` / `testButtonText` styles (they're already in the StyleSheet). Label the button `"Run Surveillance"`.

Disable the button while `loading` is true (same pattern as the IDEATE button).

### Task 4: Update `GENAI_LOG.md` and save prompt files

#### 4a. Append to `GENAI_LOG.md`

The current file is at the project root. Add these two entries at the bottom:

```markdown
## [Hour X] — SWOT Update Prompt (Surveillance)
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/swot-update.txt
**Result**: Generates diff-aware SWOT updates comparing new research to existing analysis
**Iteration**: v1

## [Hour X] — Return Briefing Prompt
**Tool**: AWS Bedrock (NVIDIA Nemotron Nano 12B v2)
**Prompt**: See ledossier-backend/prompts/return-briefing.txt
**Result**: Generates concise briefing summarizing changes since user's last visit
**Iteration**: v1
```

#### 4b. Verify prompt files exist

Check that these files exist (they should have been created in Chunk 1):
- `ledossier-backend/prompts/swot-update.txt`
- `ledossier-backend/prompts/return-briefing.txt`

If they're missing, create them by extracting the prompt template strings from `lambda/surveillance/index.ts` (the `SWOT_UPDATE_PROMPT` constant) and `lambda/idea-view/index.ts` (the `BRIEFING_PROMPT` constant). Save just the template text, not the TypeScript code.

---

## Important Constraints

- **Only modify `screens/IdeaVault.tsx`** and `GENAI_LOG.md` (plus the prompt .txt files if missing).
- **Do NOT change any backend files, CDK files, or other frontend files.**
- **Preserve all existing functionality** — the IDEATE flow, physics engine, drag interactions, all existing modals must continue to work exactly as before.
- **Match the existing code style** — same state patterns, same error handling patterns, same StyleSheet conventions.
- **Keep the noir theme** — `#0C001A` dark, `#FFFDEE` cream, `NotoSerif_400Regular` font. No new colors.
- **No new npm dependencies** — everything you need is already installed.

---

## Optional Bonus (only if time permits): Seed Demo Data

To make the return briefing work during a demo without waiting for a real surveillance cycle, you can manually seed data. This is done via AWS CLI, not in code.

Set a demo idea's `lastViewedAt` to 3-4 days ago:
```bash
aws dynamodb update-item \
  --table-name LeDossier-Ideas \
  --key '{"userId": {"S": "YOUR_USER_SUB"}, "ideaId": {"S": "YOUR_IDEA_ID"}}' \
  --update-expression "SET lastViewedAt = :lv" \
  --expression-attribute-values '{":lv": {"S": "2026-02-12T00:00:00Z"}}'
```

Insert fake surveillance events into the Updates table:
```bash
aws dynamodb put-item --table-name LeDossier-Updates --item '{
  "ideaId": {"S": "YOUR_IDEA_ID"},
  "timestamp": {"S": "2026-02-12T08:00:00Z"},
  "type": {"S": "surveillance"},
  "summary": {"S": "New competitor FreshCheck launched a food safety app in the Austin market with $2M seed funding."},
  "confidenceDelta": {"N": "-0.05"},
  "newSourceCount": {"N": "4"}
}'

aws dynamodb put-item --table-name LeDossier-Updates --item '{
  "ideaId": {"S": "YOUR_IDEA_ID"},
  "timestamp": {"S": "2026-02-13T14:00:00Z"},
  "type": {"S": "surveillance"},
  "summary": {"S": "FDA announced new digital health inspection pilot program, creating potential regulatory tailwind."},
  "confidenceDelta": {"N": "0.08"},
  "newSourceCount": {"N": "3"}
}'

aws dynamodb put-item --table-name LeDossier-Updates --item '{
  "ideaId": {"S": "YOUR_IDEA_ID"},
  "timestamp": {"S": "2026-02-14T20:00:00Z"},
  "type": {"S": "surveillance"},
  "summary": {"S": "Toast POS published restaurant compliance API, opening integration opportunities."},
  "confidenceDelta": {"N": "0.03"},
  "newSourceCount": {"N": "5"}
}'
```

Replace `YOUR_USER_SUB` and `YOUR_IDEA_ID` with real values from your DynamoDB table. You can find them with:
```bash
aws dynamodb scan --table-name LeDossier-Ideas --max-items 5 --query "Items[*].{userId: userId.S, ideaId: ideaId.S, title: title.S}"
```

After seeding, when you tap that idea, the briefing modal should appear showing a summary of what happened while you were "away."

---END---
