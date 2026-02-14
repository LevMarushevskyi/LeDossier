import { View, Text, StyleSheet, Button, useWindowDimensions, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { GLView } from 'expo-gl';
import { useEffect, useState } from 'react';

export default function IdeaVault({ navigation }) {
  const { width, height } = useWindowDimensions();
  const [glKey, setGlKey] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [showAlert, setShowAlert] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ideas, setIdeas] = useState([]);
  const borderWidth = 10;

  useEffect(() => {
    setGlKey(prev => prev + 1);
  }, []);

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

  const addBulletPoint = () => {
    setDescription(prev => prev + (prev ? '\n' : '') + '• ');
  };

  const handleDelete = () => {
    setShowPanel(false);
    setName('');
    setDescription('');
  };

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
        
        float angle = radians(30.0);
        float cosA = cos(angle);
        float sinA = sin(angle);
        vec2 rotated = vec2(
          gl_FragCoord.x * cosA - gl_FragCoord.y * sinA,
          gl_FragCoord.x * sinA + gl_FragCoord.y * cosA
        );
        
        float wave = sin(rotated.x * 0.02) * 10.0;
        float lineSpacing = 10.0;
        float linePattern = mod(rotated.y + wave, lineSpacing);
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
      <TouchableOpacity style={styles.notifButton} onPress={() => navigation.navigate('Notification')}>
        <Text style={styles.buttonText}>N</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.settingsButton} onPress={() => navigation.navigate('Setting')}>
        <Text style={styles.buttonText}>S</Text>
      </TouchableOpacity>
      <View style={[styles.rectContainer, { width: width * 0.8, height: height * 0.8 }]}>
        <GLView key={glKey} style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
        <View style={[styles.innerRect, { margin: borderWidth }]} />
      </View>
      <TouchableOpacity style={styles.addButton} onPress={() => setShowPanel(true)}>
        <Text style={styles.addButtonText}>IDEATE</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.testButton} onPress={() => navigation.navigate('Home')}>
        <Text style={styles.testButtonText}>For testing purposes</Text>
      </TouchableOpacity>
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
            <View style={styles.descriptionContainer}>
              <TextInput
                style={[styles.input, styles.textArea]}
                placeholder="Description"
                value={description}
                onChangeText={setDescription}
                multiline
              />
              <TouchableOpacity style={styles.bulletButton} onPress={addBulletPoint}>
                <Text style={styles.bulletButtonText}>•</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.buttonRow}>
              <TouchableOpacity style={styles.confirmButton} onPress={handleConfirm}>
                <Text style={styles.confirmButtonText}>Confirm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
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
  rectContainer: {
    position: 'relative',
    marginBottom: 20,
  },
  innerRect: {
    flex: 1,
    backgroundColor: '#FFFDEE',
  },
  notifButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#FFFDEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  settingsButton: {
    position: 'absolute',
    top: 80,
    left: 20,
    width: 50,
    height: 50,
    borderRadius: 10,
    backgroundColor: '#FFFDEE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonText: {
    color: '#0C001A',
    fontSize: 24,
    fontWeight: 'bold',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
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
  descriptionContainer: {
    position: 'relative',
    marginBottom: 15,
  },
  bulletButton: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    backgroundColor: '#0C001A',
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bulletButtonText: {
    color: '#FFFDEE',
    fontSize: 20,
    fontWeight: 'bold',
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
