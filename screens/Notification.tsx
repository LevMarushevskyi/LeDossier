import { View, Text, StyleSheet, Button } from 'react-native';

export default function Notification({ navigation }) {
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
