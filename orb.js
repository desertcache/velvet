
import * as THREE from 'three';

// --- SHADERS (Ported from Samantha) ---
const vertexShader = `
uniform float uTime;
uniform float uAmplitude;
uniform float uNoiseFrequency;
uniform float uNoiseAmplitude;
uniform float uShapeMorph; // 0.0 = Blob, 1.0 = Liquid Silk

varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vPattern;

// Simplex Noise (Standard)
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;

  // Permutations
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  float n_ = 0.142857142857;
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;

  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}

void main() {
  vNormal = normalMatrix * normal;
  vViewPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;

  // Pattern for fragment shader
  float noise = snoise(position * uNoiseFrequency + uTime * 0.2);
  vPattern = noise;

  // --- 1. EXISTING BLOB LOGIC (Thinking/Idle) ---
  float baseDisplacement = noise * uNoiseAmplitude;

  // Amplitude-driven displacement for Blob
  float speechNoise1 = snoise(position * 3.0 + uTime * 6.0);
  float speechNoise2 = snoise(position * 1.5 + uTime * 4.0);
  float speechNoise3 = snoise(position * 5.0 + uTime * 8.0);
  float speechNoise4 = snoise(position * 0.8 + uTime * 2.0);

  float blobSpeechDisplacement = uAmplitude * 1.1 * (
    speechNoise1 * 0.35 +
    speechNoise2 * 0.25 +
    speechNoise3 * 0.15 +
    speechNoise4 * 0.25
  );
  
  float totalBlobDisplacement = baseDisplacement + blobSpeechDisplacement;

  // --- 2. NEW LIQUID SILK LOGIC (Speaking) ---
  vec3 warp = position + vec3(sin(uTime), cos(uTime), 0.0) * 0.5;
  float flow = snoise(warp * 1.5);
  float ripples = sin(position.y * 10.0 + uTime * 5.0 + flow * 2.0);
  
  float tips = smoothstep(0.0, 0.8, flow);
  float silkDisplacement = (flow * 0.1) + (uAmplitude * tips * 0.3) + (uAmplitude * ripples * 0.02);

  // --- 3. BLEND ---
  float finalDisplacement = mix(totalBlobDisplacement, silkDisplacement, uShapeMorph);

  vec3 newPosition = position + normal * finalDisplacement;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);
}
`;

const fragmentShader = `
uniform vec3 uColorPrimary;
uniform vec3 uColorSecondary;
uniform float uEmissiveIntensity;
uniform float uFresnelPower;

varying vec3 vNormal;
varying vec3 vViewPosition;
varying float vPattern;

void main() {
  vec3 normal = normalize(vNormal);
  vec3 viewDir = normalize(-vViewPosition);
  
  // Fresnel
  float fresnel = pow(1.0 - abs(dot(viewDir, normal)), uFresnelPower);
  
  // Mix colors
  vec3 color = mix(uColorPrimary, uColorSecondary, vPattern * 0.5 + 0.5);
  color = mix(color, uColorSecondary, fresnel);
  
  // Emissive glow centered on fresnel/pattern
  vec3 emissive = uColorSecondary * uEmissiveIntensity * (fresnel + vPattern * 0.2);

  gl_FragColor = vec4(color + emissive, 1.0);
}
`;

// --- SOUL ORB CLASS ---
export class SoulOrb {
    constructor(containerId) {
        this.container = document.getElementById(containerId);
        if (!this.container) throw new Error(`Container #${containerId} not found`);

        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.mesh = null;
        this.clock = new THREE.Clock();

        // State Management
        this.state = 'IDLE'; // IDLE, LISTENING, PROCESSING, SPEAKING
        this.targetAmplitude = 0;
        this.currentAmplitude = 0;

        // Mouse Tracking for subtle interaction
        this.mouse = { x: 0, y: 0 };
        this.targetMouse = { x: 0, y: 0 };

        // Smoothed Values (Simplified from the React hook)
        this.values = {
            noiseFrequency: 0.6,
            noiseAmplitude: 0.1,
            emissiveIntensity: 0.3,
            fresnelPower: 2.5,
            scale: 0.8, // Smaller base scale
            shapeMorph: 0.0,
            pulseIntensity: 0.0,
            colorPrimary: new THREE.Color('#E8A87C'),
            colorSecondary: new THREE.Color('#E8A87C'),
            rotationX: 0,
            rotationY: 0
        };

        // Configuration Definitions
        // Configuration Definitions
        this.configs = {
            IDLE: {
                noiseFrequency: 0.5,
                noiseAmplitude: 0.1,
                emissiveIntensity: 0.35,
                fresnelPower: 2.8,
                scale: 0.8,
                shapeMorph: 0.0,
                colorPrimary: new THREE.Color('#d50000'), // Deep Red
                colorSecondary: new THREE.Color('#b71c1c') // Dark Red
            },
            LISTENING: { // "Light Red"
                noiseFrequency: 0.7,
                noiseAmplitude: 0.15,
                emissiveIntensity: 0.5,
                fresnelPower: 2.2,
                scale: 0.95,
                shapeMorph: 0.0,
                colorPrimary: new THREE.Color('#ff5252'), // Light Red
                colorSecondary: new THREE.Color('#ff8a80') // Soft Red/Pinkish
            },
            PROCESSING: { // "Returning to Red"
                noiseFrequency: 1.5,
                noiseAmplitude: 0.25,
                emissiveIntensity: 0.7,
                fresnelPower: 2.0,
                scale: 0.75,
                shapeMorph: 0.5,
                colorPrimary: new THREE.Color('#ff1744'), // Vivid Red
                colorSecondary: new THREE.Color('#d50000') // Deep Red
            },
            SPEAKING: { // "Bleed Yellow"
                noiseFrequency: 1.2,
                noiseAmplitude: 0.18,
                emissiveIntensity: 0.6,
                fresnelPower: 2.4,
                scale: 1.0,
                shapeMorph: 1.0,
                colorPrimary: new THREE.Color('#ffea00'), // Yellow
                colorSecondary: new THREE.Color('#ff3d00') // Bleeding Orange/Red
            }
        };

        this.init();
        this.animate();
    }

    init() {
        // 1. Scene
        this.scene = new THREE.Scene();

        // 2. Camera
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000);
        this.camera.position.z = 2.2;

        // 3. Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(width, height);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.container.appendChild(this.renderer.domElement);

        // 4. Material & Mesh
        const material = new THREE.ShaderMaterial({
            vertexShader,
            fragmentShader,
            uniforms: {
                uTime: { value: 0 },
                uAmplitude: { value: 0 },
                uNoiseFrequency: { value: 0.8 },
                uNoiseAmplitude: { value: 0.15 },
                uColorPrimary: { value: new THREE.Color('#E8A87C') },
                uColorSecondary: { value: new THREE.Color('#E8A87C') },
                uEmissiveIntensity: { value: 0.3 },
                uFresnelPower: { value: 2.5 },
                uShapeMorph: { value: 0.0 }
            },
            transparent: true,
            side: THREE.FrontSide
        });

        const geometry = new THREE.SphereGeometry(1, 128, 128);
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);

        // Handle Resize
        window.addEventListener('resize', () => this.onResize());

        // Handle Mouse for subtle interaction
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth) * 2 - 1;
            const y = -(e.clientY / window.innerHeight) * 2 + 1;
            this.targetMouse = { x, y };
        });
    }

    onResize() {
        const width = this.container.clientWidth;
        const height = this.container.clientHeight;
        this.renderer.setSize(width, height);
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
    }

    setState(newState) {
        if (this.configs[newState]) {
            this.state = newState;
        }
    }

    setAmplitude(amp) {
        // Normalize amplitude mostly between 0 and 1
        this.targetAmplitude = Math.min(Math.max(amp, 0), 2.0);
    }

    lerp(start, end, alpha) {
        return start + (end - start) * alpha;
    }

    lerpColor(c1, c2, alpha) {
        c1.lerp(c2, alpha);
    }

    animate() {
        requestAnimationFrame(this.animate.bind(this));

        const delta = this.clock.getDelta();
        const elapsedTime = this.clock.getElapsedTime();
        const uniforms = this.mesh.material.uniforms;

        // Slow down time in shader for "Smoother/Slower" feel
        uniforms.uTime.value = elapsedTime * 0.6;

        // Get Target Config
        const config = this.configs[this.state] || this.configs.IDLE;

        // Smooth Interpolation Factors (Tweak for feel)
        // Slower interpolation = Smoother transitions
        const smoothSlow = 1.0 * delta; // Color/Shape
        const smoothFast = 4.0 * delta; // Amplitude/Scale

        // 1. Amplitude (Instant reaction for voice)
        this.currentAmplitude = this.lerp(this.currentAmplitude, this.targetAmplitude, smoothFast);
        uniforms.uAmplitude.value = this.currentAmplitude;

        // 2. Shape Morph
        this.values.shapeMorph = this.lerp(this.values.shapeMorph, config.shapeMorph, smoothSlow);
        uniforms.uShapeMorph.value = this.values.shapeMorph;

        // 3. Noise Params
        this.values.noiseFrequency = this.lerp(this.values.noiseFrequency, config.noiseFrequency, smoothSlow);
        uniforms.uNoiseFrequency.value = this.values.noiseFrequency;

        // Dynamic noise amplitude based on input volume
        let targetNoiseAmp = config.noiseAmplitude + (this.currentAmplitude * 0.2);
        this.values.noiseAmplitude = this.lerp(this.values.noiseAmplitude, targetNoiseAmp, smoothSlow);
        uniforms.uNoiseAmplitude.value = this.values.noiseAmplitude;

        // 4. Emissive/Fresnel
        this.values.emissiveIntensity = this.lerp(this.values.emissiveIntensity, config.emissiveIntensity, smoothSlow);
        uniforms.uEmissiveIntensity.value = this.values.emissiveIntensity;

        this.values.fresnelPower = this.lerp(this.values.fresnelPower, config.fresnelPower, smoothSlow);
        uniforms.uFresnelPower.value = this.values.fresnelPower;

        // 5. Colors via lerp (Three.js Color lerp is robust)
        this.values.colorPrimary.lerp(config.colorPrimary, smoothSlow);
        this.values.colorSecondary.lerp(config.colorSecondary, smoothSlow);
        uniforms.uColorPrimary.value.copy(this.values.colorPrimary);
        uniforms.uColorSecondary.value.copy(this.values.colorSecondary);

        // 6. Scale & Position (Breathing)
        // Add some idle organic movement (Slower)
        const idleBreath = Math.sin(elapsedTime * 1.5) * 0.03;
        let targetScale = config.scale + idleBreath + (this.currentAmplitude * 0.2);

        // Special case for Listening (heavy breathing)
        if (this.state === 'LISTENING') {
            targetScale += Math.sin(elapsedTime * 2.0) * 0.05;
        }

        this.values.scale = this.lerp(this.values.scale, targetScale, smoothFast);
        this.mesh.scale.setScalar(this.values.scale);

        // 7. Mouse Interaction (Subtle)
        // Smoothly interpolate mouse values
        this.mouse.x = this.lerp(this.mouse.x, this.targetMouse.x, 2.0 * delta);
        this.mouse.y = this.lerp(this.mouse.y, this.targetMouse.y, 2.0 * delta);

        // Rotate mesh based on mouse (Very subtle: 0.1 factor)
        const mouseRotX = this.mouse.y * 0.2;
        const mouseRotY = this.mouse.x * 0.2;

        // Continual slow rotation
        this.values.rotationX += delta * 0.05;
        this.values.rotationY += delta * 0.1;

        this.mesh.rotation.x = this.values.rotationX + mouseRotX;
        this.mesh.rotation.y = this.values.rotationY + mouseRotY;

        this.renderer.render(this.scene, this.camera);
    }
}
