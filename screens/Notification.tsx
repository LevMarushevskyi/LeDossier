import { View, Text, StyleSheet, Button } from 'react-native';
import { NavigationProp } from '@react-navigation/native';

interface NotificationProps {
  navigation: NavigationProp<any>;
}

export default function Notification({ navigation }: NotificationProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Notification</Text>
      <Button title="Back to Idea Vault" onPress={() => navigation.navigate('IdeaVault')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#0C001A',
  },
  text: {
    color: '#FFFDEE',
    marginBottom: 20,
  },
});
