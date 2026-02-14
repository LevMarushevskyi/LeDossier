import { View, StyleSheet, useWindowDimensions, Text, TouchableOpacity } from 'react-native';
import Svg, { Text as SvgText, Defs, Rect as SvgRect, ClipPath, Polygon, G, Path } from 'react-native-svg';
import { GLView } from 'expo-gl';
import { useEffect, useRef, useState } from 'react';

export default function Home({ navigation }) {
  const { width, height } = useWindowDimensions();
  const [isHovered, setIsHovered] = useState(false);
  const titleHeight = height * 0.15;
  const viewBoxWidth = 1;
  const viewBoxHeight = titleHeight;
  const centerX = viewBoxWidth / 2;
  const centerY = viewBoxHeight / 2;
  const rectWidth = width * 0.1;
  const rectHeight = height * 0.4;
  const triangleHeight = rectHeight * 0.5;
  const overlap = 20;

  const [glKey, setGlKey] = useState(0);
  const [svgKey, setSvgKey] = useState(0);

  useEffect(() => {
    setGlKey(prev => prev + 1);
    setSvgKey(prev => prev + 1);
  }, []);

  const onContextCreate = (gl) => {
    const vertShader = gl.createShader(gl.VERTEX_SHADER);
    gl.shaderSource(vertShader, `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `);
    gl.compileShader(vertShader);

    const fragShader = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(fragShader, `
      precision mediump float;
      uniform vec2 resolution;
      
      void main() {
        vec2 uv = gl_FragCoord.xy / resolution;
        
        float wave = sin(gl_FragCoord.x * 0.02) * 10.0;
        float lineSpacing = 10.0;
        float linePattern = mod(gl_FragCoord.y + wave, lineSpacing);
        float line = step(linePattern, 4.0);
        
        float gradient = 1.0 - uv.y;
        float alpha = gradient * 0.3;
        
        vec3 baseColor = vec3(0.047, 0.0, 0.102);
        vec3 lineColor = vec3(1.0, 0.992, 0.933);
        vec3 color = mix(baseColor, lineColor, line * alpha);
        
        gl_FragColor = vec4(color, 1.0);
      }
    `);
    gl.compileShader(fragShader);

    const program = gl.createProgram();
    gl.attachShader(program, vertShader);
    gl.attachShader(program, fragShader);
    gl.linkProgram(program);
    gl.useProgram(program);

    const positionLocation = gl.getAttribLocation(program, 'position');
    const resolutionLocation = gl.getUniformLocation(program, 'resolution');
    
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);
    
    gl.uniform2f(resolutionLocation, width, height);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0.047, 0.0, 0.102, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.flush();
    gl.endFrameEXP();
  };

  return (
    <View style={styles.container}>
      <GLView key={glKey} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      <View style={styles.titleBackground} />
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
      <View style={[styles.centerShapes, { width: rectWidth, height: triangleHeight + rectHeight - overlap, borderRadius: 10, overflow: 'hidden' }]}>
        <Svg width={rectWidth} height={triangleHeight + rectHeight - overlap + 1}>
          <polygon points={`0,${triangleHeight - overlap} ${rectWidth},${triangleHeight - overlap} ${rectWidth},0`} fill="#FFFDEE" />
          <SvgRect x="0" y={triangleHeight - overlap - 1} width={rectWidth} height={rectHeight + 1} fill="#FFFDEE" />
        </Svg>
        <TouchableOpacity 
          style={styles.signInButton} 
          onPress={() => navigation.navigate('IdeaVault')}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <Text style={styles.signInText}>S{"\n"}I{"\n"}G{"\n"}N{"\n"}{"\n"}I{"\n"}N</Text>
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
  titleContainer: {
    height: '15%',
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: '2.5%',
  },
  titleBackground: {
    position: 'absolute',
    top: '2.5%',
    left: 0,
    right: 0,
    height: '15%',
    backgroundColor: '#0C001A',
  },
  centerShapes: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: '-50%' }, { translateY: '-50%' }],
  },
  signInButton: {
    position: 'absolute',
    right: 0,
    top: '10%',
    bottom: 0,
    width: '50%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signInText: {
    fontFamily: 'NotoSerif_400Regular',
    fontSize: 48,
    fontWeight: 'bold',
    color: '#0C001A',
    textAlign: 'center',
    lineHeight: 56,
  },
});
