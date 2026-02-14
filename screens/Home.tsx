import { View, StyleSheet, useWindowDimensions, Button } from 'react-native';
import Svg, { Text as SvgText } from 'react-native-svg';

export default function Home({ navigation }) {
  const { width, height } = useWindowDimensions();
  const titleHeight = height * 0.15;
  const viewBoxWidth = 1;
  const viewBoxHeight = titleHeight;
  const centerX = viewBoxWidth / 2;
  const centerY = viewBoxHeight / 2;

  return (
    <View style={styles.container}>
      <View style={styles.titleContainer}>
        <Svg height="100%" width="100%" viewBox={`0 0 ${viewBoxWidth} ${viewBoxHeight}`}>
          <SvgText
            fill="#FFFDEE"
            fontSize="72"
            fontWeight="bold"
            x={centerX}
            y={centerY}
            textAnchor="middle"
            alignmentBaseline="middle"
            fontFamily="PetitFormalScript_400Regular"
            letterSpacing="10"
            scaleX="2.5"
          >
            Le Dossier
          </SvgText>
        </Svg>
      </View>
      <Button 
        title="For testing purposes" 
        onPress={() => navigation.navigate('IdeaVault')} 
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0C001A',
  },
  titleContainer: {
    height: '15%',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '2.5%',
  },
});
