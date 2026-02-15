import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Platform } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { useState, useEffect } from 'react';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import BackgroundNoise from '../components/BackgroundNoise';

interface SignInProps {
  navigation: NavigationProp<any>;
}

WebBrowser.maybeCompleteAuthSession();

export default function SignIn({ navigation }: SignInProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const FLASK_URL = 'http://localhost:5000'; // Update this to your Flask server URL
  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    // MOBILE: Listen for deep link callbacks
    if (!isWeb) {
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
    }

    // WEB: Listen for postMessage from auth window
    if (isWeb) {
      const handleMessage = (event: MessageEvent) => {
        console.log('Message received:', event.data);

        if (event.data.type === 'LEDOSSIER_AUTH_SUCCESS') {
          const { email, success } = event.data.data;
          if (success) {
            console.log('Web authentication successful for:', email);
            setLoading(false);
            navigation.navigate('IdeaVault');
          }
        }
      };

      window.addEventListener('message', handleMessage);

      // Also poll localStorage for auth data (backup method)
      const pollInterval = setInterval(() => {
        try {
          const authDataStr = localStorage.getItem('ledossier_auth');
          if (authDataStr) {
            const authData = JSON.parse(authDataStr);
            if (authData.success) {
              console.log('Web authentication successful (localStorage):', authData.email);
              localStorage.removeItem('ledossier_auth'); // Clean up
              clearInterval(pollInterval);
              setLoading(false);
              navigation.navigate('IdeaVault');
            }
          }
        } catch (e) {
          console.error('Error checking localStorage:', e);
        }
      }, 1000); // Check every second

      return () => {
        window.removeEventListener('message', handleMessage);
        clearInterval(pollInterval);
      };
    }
  }, [isWeb, navigation]);

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

      if (isWeb) {
        // WEB: Open auth in new window and wait for postMessage/localStorage
        const authWindow = window.open(
          `${FLASK_URL}/login`,
          'ledossier-auth',
          'width=500,height=600'
        );

        if (!authWindow) {
          setError('Popup blocked. Please allow popups for this site.');
          setLoading(false);
          return;
        }

        // The message listener in useEffect will handle the response
        console.log('Opened authentication window for web');
      } else {
        // MOBILE: Open auth session with deep link
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
      }
    } catch (error) {
      console.error('Authentication error:', error);
      setError('Authentication error occurred');
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <BackgroundNoise baseColor="#0C001A" opacity={0.2} />

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
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontSize: 14,
    marginTop: 10,
    fontStyle: 'italic',
  },
  errorText: {
    fontFamily: 'NotoSerif_400Regular',
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
    fontFamily: 'NotoSerif_400Regular',
    color: '#FFFDEE',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
