import { View, Text, StyleSheet, Button } from 'react-native';

export default function Setting({ navigation }) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Setting</Text>
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
