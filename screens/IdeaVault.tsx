import { View, Text, StyleSheet } from 'react-native';

export default function IdeaVault() {
  return (
    <View style={styles.container}>
      <Text>Idea Vault</Text>
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
});
