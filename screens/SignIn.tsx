import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

interface SignInProps {
  navigation: NavigationProp<any>;
}

export default function SignIn({ navigation }: SignInProps) {
  const { login, register, confirmRegistration } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmCode, setConfirmCode] = useState('');

  const [mode, setMode] = useState<'signIn' | 'register' | 'confirmCode'>('signIn');

  const handleSignIn = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await login(email.trim(), password);
      navigation.navigate('IdeaVault');
    } catch (err: any) {
      setError(err.message || 'Sign in failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter both email and password');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const result = await register(email.trim(), password);
      if (!result.isSignUpComplete) {
        setMode('confirmCode');
      }
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCode = async () => {
    if (!confirmCode.trim()) {
      setError('Please enter the verification code');
      return;
    }
    try {
      setLoading(true);
      setError(null);
      await confirmRegistration(email.trim(), confirmCode.trim());
      // confirmRegistration may have auto-signed in — check if user is set
      // If not, sign in manually
      try {
        await login(email.trim(), password);
      } catch {
        // Already signed in via auto-sign-in, that's fine
      }
      navigation.navigate('IdeaVault');
    } catch (err: any) {
      setError(err.message || 'Confirmation failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.contentContainer}>
        <Text style={styles.title}>Le Dossier</Text>
        <Text style={styles.subtitle}>
          {mode === 'signIn' ? 'Sign in to access your ideas' :
           mode === 'register' ? 'Create your account' :
           'Check your email for a verification code'}
        </Text>

        {mode !== 'confirmCode' ? (
          <>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="rgba(255, 253, 238, 0.4)"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              editable={!loading}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="rgba(255, 253, 238, 0.4)"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!loading}
            />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={mode === 'signIn' ? handleSignIn : handleRegister}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#0C001A" />
              ) : (
                <Text style={styles.primaryButtonText}>
                  {mode === 'signIn' ? 'SIGN IN' : 'CREATE ACCOUNT'}
                </Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.switchButton}
              onPress={() => {
                setMode(mode === 'signIn' ? 'register' : 'signIn');
                setError(null);
              }}
              disabled={loading}
            >
              <Text style={styles.switchButtonText}>
                {mode === 'signIn' ? 'Need an account? Create one' : 'Already have an account? Sign in'}
              </Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <TextInput
              style={styles.input}
              placeholder="Verification Code"
              placeholderTextColor="rgba(255, 253, 238, 0.4)"
              value={confirmCode}
              onChangeText={setConfirmCode}
              keyboardType="number-pad"
              editable={!loading}
            />

            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleConfirmCode}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#0C001A" />
              ) : (
                <Text style={styles.primaryButtonText}>VERIFY</Text>
              )}
            </TouchableOpacity>
          </>
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
    </KeyboardAvoidingView>
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
    marginBottom: 40,
    textAlign: 'center',
  },
  input: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: 'rgba(255, 253, 238, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 253, 238, 0.3)',
    borderRadius: 10,
    padding: 15,
    marginBottom: 15,
    color: '#FFFDEE',
    fontSize: 16,
    fontFamily: 'NotoSerif_400Regular',
  },
  primaryButton: {
    backgroundColor: '#FFFDEE',
    paddingVertical: 18,
    paddingHorizontal: 40,
    borderRadius: 10,
    marginTop: 10,
    minWidth: 250,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0C001A',
  },
  switchButton: {
    paddingVertical: 15,
  },
  switchButtonText: {
    color: '#FFFDEE',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  errorText: {
    color: '#ff6b6b',
    fontSize: 14,
    marginTop: 15,
    fontWeight: 'bold',
    textAlign: 'center',
    maxWidth: 320,
  },
  backButton: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    marginTop: 20,
  },
  backButtonText: {
    color: '#FFFDEE',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
});
