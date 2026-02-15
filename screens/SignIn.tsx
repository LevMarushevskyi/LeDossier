import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { useState, useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';

interface SignInProps {
  navigation: NavigationProp<any>;
}

WebBrowser.maybeCompleteAuthSession();

export default function SignIn({ navigation }: SignInProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const FLASK_URL = 'http://localhost:5000'; // Update this to your Flask server URL

  useEffect(() => {
    // Listen for deep link callbacks
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Check if app was opened via deep link
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({ url });
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = ({ url }: { url: string }) => {
    console.log('Deep link received:', url);

    // Parse the URL to extract parameters
    const { queryParams } = Linking.parse(url);

    if (queryParams?.success === 'true') {
      const email = queryParams.email as string;
      console.log('Authentication successful for:', email);
      setLoading(false);
      navigation.navigate('IdeaVault');
    } else {
      setError('Authentication failed');
      setLoading(false);
    }
  };

  const handleSignIn = async () => {
    try {
      setLoading(true);
      setError(null);

      // Open the Flask login page in a browser
      const result = await WebBrowser.openAuthSessionAsync(
        `${FLASK_URL}/login`,
        'ledossier://auth'
      );

      setLoading(false);

      if (result.type === 'success') {
        // Authentication successful - deep link handler will navigate
        console.log('Auth success:', result);
      } else if (result.type === 'cancel') {
        console.log('User cancelled authentication');
        setError('Authentication cancelled');
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError('Authentication error occurred');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Welcome to Le Dossier</Text>
        <Text style={styles.subtitle}>Sign in to access your ideas</Text>

        <TouchableOpacity
          style={styles.signInButton}
          onPress={handleSignIn}
          disabled={loading}
        >
          {loading ? (
            <ActivityIndicator color="#0C001A" />
          ) : (
            <Text style={styles.signInButtonText}>SIGN IN WITH COGNITO</Text>
          )}
        </TouchableOpacity>

        {loading && (
          <Text style={styles.loadingText}>Opening browser for authentication...</Text>
        )}

        {error && (
          <Text style={styles.errorText}>{error}</Text>
        )}

        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.navigate('Home')}
        >
          <Text style={styles.backButtonText}>Back to Home</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C001A',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    fontFamily: 'PetitFormalScript_400Regular',
    fontSize: 48,
    color: '#FFFDEE',
    marginBottom: 10,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 16,
    color: '#FFFDEE',
    marginBottom: 50,
    textAlign: 'center',
  },
  signInButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 20,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginBottom: 20,
    minWidth: 250,
    alignItems: 'center',
  },
  signInButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0C001A',
  },
  loadingText: {
    color: '#FFFDEE',
    fontSize: 14,
    marginTop: 10,
    fontStyle: 'italic',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginTop: 10,
    fontWeight: 'bold',
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  backButtonText: {
    color: '#FFFDEE',
    fontSize: 14,
    textDecoration: 'underline',
  },
});
