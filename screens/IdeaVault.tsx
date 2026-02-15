import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useState } from 'react';
import { NavigationProp } from '@react-navigation/native';
import { useAuth } from '../contexts/AuthContext';

const API_URL = 'https://dhqrasy77i.execute-api.us-east-1.amazonaws.com/prod';

interface Dossier {
  ideaId: string;
  title: string;
  rawInput: string;
  status: string;
  createdAt: string;
  analysis: {
    enrichedDescription: string;
    domain: string;
    targetMarket: string;
    tags: string[];
    searchQueries: string[];
    keyAssumptions: string[];
  };
  research: {
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
  swot: {
    swot: {
      strengths: string[];
      weaknesses: string[];
      opportunities: string[];
      threats: string[];
    };
    confidenceScore: number;
    confidenceRationale: string;
    recommendedNextStep: string;
  };
}

interface IdeaVaultProps {
  navigation: NavigationProp<any>;
}

export default function IdeaVault({ navigation }: IdeaVaultProps) {
  const { logout, getAuthToken } = useAuth();
  const [showPanel, setShowPanel] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dossiers, setDossiers] = useState<Dossier[]>([]);
  const [activeDossier, setActiveDossier] = useState<Dossier | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleConfirm = async () => {
    if (!name.trim() || !description.trim()) {
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
        body: JSON.stringify({ name: name.trim(), description: description.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to analyze idea');
      }

      setDossiers(prev => [data, ...prev]);
      setActiveDossier(data);
      setName('');
      setDescription('');
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
    setName('');
    setDescription('');
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
      const s = activeDossier.swot.swot ?? activeDossier.swot;
      return (
        <ScrollView style={styles.dossierScroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.dossierTitle}>{activeDossier.title}</Text>
          <Text style={styles.dossierDomain}>{activeDossier.analysis.domain}</Text>

          <View style={styles.tagsRow}>
            {activeDossier.analysis.tags.map((tag, i) => (
              <View key={i} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>

          <View style={styles.confidenceBadge}>
            <Text style={styles.confidenceLabel}>Confidence</Text>
            <Text style={styles.confidenceScore}>
              {Math.round((activeDossier.swot.confidenceScore ?? 0) * 100)}%
            </Text>
          </View>

          <Text style={styles.sectionHeader}>Analysis</Text>
          <Text style={styles.sectionBody}>{activeDossier.analysis.enrichedDescription}</Text>

          <Text style={styles.sectionHeader}>Strengths</Text>
          {(s.strengths ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          <Text style={styles.sectionHeader}>Weaknesses</Text>
          {(s.weaknesses ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          <Text style={styles.sectionHeader}>Opportunities</Text>
          {(s.opportunities ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          <Text style={styles.sectionHeader}>Threats</Text>
          {(s.threats ?? []).map((item: string, i: number) => (
            <Text key={i} style={styles.bulletItem}>• {item}</Text>
          ))}

          <Text style={styles.sectionHeader}>Research Sources</Text>
          {activeDossier.research.sources.slice(0, 5).map((src, i) => (
            <View key={i} style={styles.sourceItem}>
              <Text style={styles.sourceTitle}>{src.title}</Text>
              <Text style={styles.sourceCategory}>{src.category} — relevance: {Math.round(src.relevanceScore * 100)}%</Text>
              <Text style={styles.sourceSummary}>{src.summary}</Text>
            </View>
          ))}

          <Text style={styles.sectionHeader}>Recommended Next Step</Text>
          <Text style={styles.sectionBody}>{activeDossier.swot.recommendedNextStep}</Text>

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
              <Text style={styles.ideaCardDomain}>{d.analysis.domain}</Text>
              <Text style={styles.ideaCardScore}>
                Confidence: {Math.round((d.swot.confidenceScore ?? 0) * 100)}%
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      );
    }

    return <Text style={styles.boxText}>Your ideas will appear here</Text>;
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Notification')}>
          <Text style={styles.navButtonText}>Notifications</Text>
        </TouchableOpacity>
        {activeDossier && (
          <TouchableOpacity style={styles.navButton} onPress={() => setActiveDossier(null)}>
            <Text style={styles.navButtonText}>All Ideas</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        <Text style={styles.pageTitle}>Idea Vault</Text>
        <View style={styles.contentBox}>
          {renderDossierContent()}
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
                <Text style={styles.confirmButtonText}>Yes, Delete</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDeleteCancel}>
                <Text style={styles.deleteButtonText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C001A',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    padding: 20,
    paddingTop: 40,
  },
  navButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  navButtonText: {
    color: '#0C001A',
    fontSize: 14,
    fontWeight: 'bold',
  },
  signOutButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 5,
  },
  signOutButtonText: {
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
  },
  boxText: {
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
    color: '#0C001A',
    fontSize: 14,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(12, 0, 26, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  panel: {
    width: '80%',
    backgroundColor: '#FFFDEE',
    borderRadius: 10,
    padding: 20,
  },
  panelTitle: {
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
    justifyContent: 'space-around',
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
    fontSize: 20,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 10,
  },
  alertMessage: {
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
    color: '#0C001A',
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 15,
  },
  loadingSubtext: {
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
    color: '#cc0000',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 10,
  },
  errorText: {
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
    color: '#FFFDEE',
    fontWeight: 'bold',
  },
  dossierScroll: {
    flex: 1,
    width: '100%',
  },
  dossierTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#0C001A',
    marginBottom: 4,
  },
  dossierDomain: {
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
    color: '#FFFDEE',
    fontSize: 12,
  },
  confidenceScore: {
    color: '#FFFDEE',
    fontSize: 18,
    fontWeight: 'bold',
  },
  sectionHeader: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C001A',
    marginTop: 14,
    marginBottom: 6,
  },
  sectionBody: {
    fontSize: 13,
    color: '#0C001A',
    lineHeight: 20,
  },
  bulletItem: {
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
    fontSize: 13,
    fontWeight: 'bold',
    color: '#0C001A',
  },
  sourceCategory: {
    fontSize: 11,
    color: '#0C001A',
    opacity: 0.5,
    marginBottom: 4,
  },
  sourceSummary: {
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
    fontSize: 16,
    fontWeight: 'bold',
    color: '#0C001A',
  },
  ideaCardDomain: {
    fontSize: 12,
    color: '#0C001A',
    opacity: 0.6,
    marginTop: 2,
  },
  ideaCardScore: {
    fontSize: 12,
    color: '#0C001A',
    marginTop: 4,
    fontWeight: '600',
  },
});
