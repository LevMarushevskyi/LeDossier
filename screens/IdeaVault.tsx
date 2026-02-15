import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Platform } from 'react-native';
import { useState } from 'react';
import { NavigationProp } from '@react-navigation/native';

interface Idea {
  name: string;
  description: string;
  id: number;
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

  const handleConfirm = () => {
    if (!name.trim() || !description.trim()) {
      setShowAlert(true);
      return;
    }
    const newIdea = { name, description, id: Date.now() };
    setIdeas([...ideas, newIdea]);
    console.log('Name:', name);
    console.log('Description:', description);
    console.log('Stored idea:', newIdea);
    console.log('All ideas:', [...ideas, newIdea]);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.navButton} onPress={() => navigation.navigate('Notification')}>
          <Text style={styles.navButtonText}>Notifications</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutButtonText}>Sign Out</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.mainContent}>
        <Text style={styles.pageTitle}>Idea Vault</Text>
        <View style={styles.contentBox}>
          <Text style={styles.boxText}>Your ideas will appear here</Text>
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
});
