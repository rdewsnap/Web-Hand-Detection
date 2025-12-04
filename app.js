/**
 * Cosmic Prism - Hand Controlled Explosion
 * A Three.js + MediaPipe visualization where a pentagonal prism
 * explodes into cosmic particles based on hand openness.
 */

// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    particles: {
        count: 800,
        baseSize: 0.08,
        sizeVariation: 0.04,
        explosionRadius: 8,
        colorVariation: 0.2
    },
    prism: {
        radius: 1.5,
        height: 3,
        segments: 5
    },
    camera: {
        fov: 60,
        near: 0.1,
        far: 1000,
        position: { x: 0, y: 0, z: 8 }
    },
    bloom: {
        strength: 1.5,
        radius: 0.4,
        threshold: 0.2
    },
    smoothing: 0.15, // Lower = smoother but more lag
    ambientRotationSpeed: 0.001
};

// Detect mobile for performance adjustments
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
    CONFIG.particles.count = 400;
    CONFIG.bloom.strength = 1.0;
}

// ============================================
// GLOBAL STATE
// ============================================
let scene, camera, renderer, composer;
let prismMesh, particleSystem;
let starField;
let handOpenness = 0;
let targetHandOpenness = 0;
let smoothedOpenness = 0;
let isHandDetected = false;
let ambientRotation = 0;

// Particle data
let particlePositions = [];
let particleOriginalPositions = [];
let particleExplodedPositions = [];
let particleVelocities = [];

// DOM elements
const loadingOverlay = document.getElementById('loading-overlay');
const permissionDenied = document.getElementById('permission-denied');
const canvasContainer = document.getElementById('canvas-container');
const webcamVideo = document.getElementById('webcam');
const previewCanvas = document.getElementById('preview-canvas');
const previewCtx = previewCanvas.getContext('2d');
const indicatorFill = document.querySelector('.indicator-fill');
const instructions = document.getElementById('instructions');

// ============================================
// INITIALIZATION
// ============================================
async function init() {
    try {
        await initThreeJS();
        await initHandTracking();
        animate();
    } catch (error) {
        console.error('Initialization failed:', error);
        showError();
    }
}

function showError() {
    loadingOverlay.classList.add('hidden');
    permissionDenied.classList.remove('hidden');
}

// ============================================
// THREE.JS SETUP
// ============================================
async function initThreeJS() {
    // Scene
    scene = new THREE.Scene();
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        CONFIG.camera.fov,
        window.innerWidth / window.innerHeight,
        CONFIG.camera.near,
        CONFIG.camera.far
    );
    camera.position.set(
        CONFIG.camera.position.x,
        CONFIG.camera.position.y,
        CONFIG.camera.position.z
    );
    
    // Renderer
    renderer = new THREE.WebGLRenderer({
        antialias: !isMobile,
        alpha: true,
        powerPreference: 'high-performance'
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0d0518, 1);
    canvasContainer.appendChild(renderer.domElement);
    
    // Post-processing
    setupPostProcessing();
    
    // Create scene elements
    createCosmicBackground();
    createStarField();
    createPentagonalPrism();
    createParticleSystem();
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x4ecdc4, 0.3);
    scene.add(ambientLight);
    
    const pointLight1 = new THREE.PointLight(0xff6b9d, 1, 50);
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);
    
    const pointLight2 = new THREE.PointLight(0x4ecdc4, 1, 50);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);
    
    // Handle resize
    window.addEventListener('resize', onWindowResize);
}

function setupPostProcessing() {
    composer = new THREE.EffectComposer(renderer);
    
    const renderPass = new THREE.RenderPass(scene, camera);
    composer.addPass(renderPass);
    
    const bloomPass = new THREE.UnrealBloomPass(
        new THREE.Vector2(window.innerWidth, window.innerHeight),
        CONFIG.bloom.strength,
        CONFIG.bloom.radius,
        CONFIG.bloom.threshold
    );
    composer.addPass(bloomPass);
}

function createCosmicBackground() {
    // Create a large sphere for nebula-like background
    const bgGeometry = new THREE.SphereGeometry(100, 32, 32);
    
    // Custom shader for nebula effect
    const bgMaterial = new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            varying vec3 vPosition;
            varying vec2 vUv;
            void main() {
                vPosition = position;
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            varying vec3 vPosition;
            varying vec2 vUv;
            
            // Simplex noise function
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
            
            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                
                vec3 i  = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                
                i = mod289(i);
                vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                
                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;
                
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                
                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                
                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);
                
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;
                
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }
            
            void main() {
                vec3 pos = normalize(vPosition) * 0.5;
                
                // Layer multiple noise octaves
                float n1 = snoise(pos * 2.0 + time * 0.02) * 0.5 + 0.5;
                float n2 = snoise(pos * 4.0 - time * 0.01) * 0.5 + 0.5;
                float n3 = snoise(pos * 8.0 + time * 0.03) * 0.5 + 0.5;
                
                float noise = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;
                
                // Color gradient
                vec3 deepPurple = vec3(0.05, 0.02, 0.1);
                vec3 nebulaPink = vec3(0.3, 0.1, 0.2);
                vec3 nebulaCyan = vec3(0.1, 0.2, 0.25);
                
                vec3 color = mix(deepPurple, nebulaPink, noise * 0.5);
                color = mix(color, nebulaCyan, pow(noise, 2.0) * 0.3);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `
    });
    
    const bgMesh = new THREE.Mesh(bgGeometry, bgMaterial);
    bgMesh.userData.material = bgMaterial;
    scene.add(bgMesh);
}

function createStarField() {
    const starCount = isMobile ? 1000 : 2000;
    const positions = new Float32Array(starCount * 3);
    const sizes = new Float32Array(starCount);
    const colors = new Float32Array(starCount * 3);
    
    for (let i = 0; i < starCount; i++) {
        // Distribute stars in a sphere
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 30 + Math.random() * 50;
        
        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);
        
        sizes[i] = Math.random() * 2 + 0.5;
        
        // Slight color variation - whites, light blues, light pinks
        const colorChoice = Math.random();
        if (colorChoice < 0.6) {
            colors[i * 3] = 0.95 + Math.random() * 0.05;
            colors[i * 3 + 1] = 0.95 + Math.random() * 0.05;
            colors[i * 3 + 2] = 1.0;
        } else if (colorChoice < 0.8) {
            colors[i * 3] = 0.8;
            colors[i * 3 + 1] = 0.9;
            colors[i * 3 + 2] = 1.0;
        } else {
            colors[i * 3] = 1.0;
            colors[i * 3 + 1] = 0.85;
            colors[i * 3 + 2] = 0.9;
        }
    }
    
    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    
    const starMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            uniform float time;
            
            void main() {
                vColor = color;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Twinkle effect
                float twinkle = sin(time * 2.0 + position.x * 10.0) * 0.3 + 0.7;
                
                gl_PointSize = size * twinkle * (300.0 / -mvPosition.z);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                
                float alpha = 1.0 - smoothstep(0.0, 0.5, dist);
                gl_FragColor = vec4(vColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    starField = new THREE.Points(starGeometry, starMaterial);
    scene.add(starField);
}

function createPentagonalPrism() {
    const { radius, height, segments } = CONFIG.prism;
    
    // Create pentagonal prism geometry
    const geometry = new THREE.CylinderGeometry(radius, radius, height, segments, 1, false);
    
    // Ethereal glowing material
    const material = new THREE.MeshPhysicalMaterial({
        color: 0x7b68ee,
        emissive: 0x4ecdc4,
        emissiveIntensity: 0.3,
        transparent: true,
        opacity: 1.0,
        metalness: 0.3,
        roughness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide
    });
    
    prismMesh = new THREE.Mesh(geometry, material);
    prismMesh.rotation.x = Math.PI * 0.1;
    scene.add(prismMesh);
    
    // Add edge glow
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x4ecdc4,
        transparent: true,
        opacity: 0.8,
        linewidth: 2
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    prismMesh.add(edges);
}

function createParticleSystem() {
    const { count, baseSize, sizeVariation, explosionRadius, colorVariation } = CONFIG.particles;
    const { radius, height } = CONFIG.prism;
    
    const positions = new Float32Array(count * 3);
    const originalPositions = new Float32Array(count * 3);
    const explodedPositions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities = [];
    
    // Base colors for particles
    const colorPalette = [
        new THREE.Color(0x4ecdc4), // Cyan
        new THREE.Color(0xff6b9d), // Pink
        new THREE.Color(0x7b68ee), // Purple/Blue
        new THREE.Color(0xf0f0ff)  // White
    ];
    
    for (let i = 0; i < count; i++) {
        // Original position: on or near the prism surface
        const angle = (Math.floor(i / (count / 5)) / 5) * Math.PI * 2 + (Math.random() - 0.5) * 0.3;
        const y = (Math.random() - 0.5) * height;
        const r = radius * (0.8 + Math.random() * 0.4);
        
        const ox = Math.cos(angle) * r;
        const oy = y;
        const oz = Math.sin(angle) * r;
        
        originalPositions[i * 3] = ox;
        originalPositions[i * 3 + 1] = oy;
        originalPositions[i * 3 + 2] = oz;
        
        // Start at original position
        positions[i * 3] = ox;
        positions[i * 3 + 1] = oy;
        positions[i * 3 + 2] = oz;
        
        // Exploded position: scattered in sphere
        const explodeAngle = Math.random() * Math.PI * 2;
        const explodePhi = Math.acos(2 * Math.random() - 1);
        const explodeR = explosionRadius * (0.5 + Math.random() * 0.5);
        
        explodedPositions[i * 3] = explodeR * Math.sin(explodePhi) * Math.cos(explodeAngle);
        explodedPositions[i * 3 + 1] = explodeR * Math.sin(explodePhi) * Math.sin(explodeAngle);
        explodedPositions[i * 3 + 2] = explodeR * Math.cos(explodePhi);
        
        // Random velocity for animation variation
        velocities.push({
            x: (Math.random() - 0.5) * 0.02,
            y: (Math.random() - 0.5) * 0.02,
            z: (Math.random() - 0.5) * 0.02
        });
        
        // Color with variation
        const baseColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        colors[i * 3] = baseColor.r + (Math.random() - 0.5) * colorVariation;
        colors[i * 3 + 1] = baseColor.g + (Math.random() - 0.5) * colorVariation;
        colors[i * 3 + 2] = baseColor.b + (Math.random() - 0.5) * colorVariation;
        
        // Size with variation
        sizes[i] = baseSize + Math.random() * sizeVariation;
    }
    
    // Store for animation
    particleOriginalPositions = originalPositions;
    particleExplodedPositions = explodedPositions;
    particleVelocities = velocities;
    
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    
    const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            openness: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float time;
            uniform float openness;
            
            void main() {
                vColor = color;
                
                // Alpha based on openness - particles more visible when exploded
                vAlpha = 0.3 + openness * 0.7;
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Shimmer effect
                float shimmer = sin(time * 3.0 + position.x * 5.0 + position.y * 5.0) * 0.2 + 0.8;
                
                gl_PointSize = size * shimmer * (200.0 / -mvPosition.z) * (0.5 + openness * 0.5);
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                
                // Soft glow falloff
                float alpha = (1.0 - smoothstep(0.0, 0.5, dist)) * vAlpha;
                
                // Core glow
                float core = 1.0 - smoothstep(0.0, 0.2, dist);
                vec3 finalColor = vColor + vec3(core * 0.5);
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    particleSystem.rotation.x = Math.PI * 0.1; // Match prism rotation
    scene.add(particleSystem);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// ============================================
// HAND TRACKING
// ============================================
async function initHandTracking() {
    // Request camera permission
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        
        webcamVideo.srcObject = stream;
        await webcamVideo.play();
        
        // Setup preview canvas
        previewCanvas.width = 160;
        previewCanvas.height = 120;
        
    } catch (error) {
        console.error('Camera access denied:', error);
        throw error;
    }
    
    // Initialize MediaPipe Hands
    const hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });
    
    hands.setOptions({
        maxNumHands: 1,
        modelComplexity: isMobile ? 0 : 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.5
    });
    
    hands.onResults(onHandResults);
    
    // Start camera processing
    const camera = new Camera(webcamVideo, {
        onFrame: async () => {
            await hands.send({ image: webcamVideo });
        },
        width: 640,
        height: 480
    });
    
    await camera.start();
    
    // Hide loading overlay
    loadingOverlay.classList.add('hidden');
}

function onHandResults(results) {
    // Draw preview
    previewCtx.save();
    previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    previewCtx.drawImage(results.image, 0, 0, previewCanvas.width, previewCanvas.height);
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        isHandDetected = true;
        const landmarks = results.multiHandLandmarks[0];
        
        // Draw hand landmarks on preview
        drawHandLandmarks(landmarks);
        
        // Calculate hand openness
        targetHandOpenness = calculateHandOpenness(landmarks);
        
        // Fade instructions when hand detected
        instructions.style.opacity = '0.3';
    } else {
        isHandDetected = false;
        targetHandOpenness = 0;
        instructions.style.opacity = '0.8';
    }
    
    previewCtx.restore();
}

function drawHandLandmarks(landmarks) {
    previewCtx.fillStyle = '#4ecdc4';
    previewCtx.strokeStyle = '#ff6b9d';
    previewCtx.lineWidth = 1;
    
    // Draw connections
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8],       // Index
        [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
        [0, 13], [13, 14], [14, 15], [15, 16], // Ring
        [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
        [5, 9], [9, 13], [13, 17]              // Palm
    ];
    
    previewCtx.beginPath();
    for (const [start, end] of connections) {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        previewCtx.moveTo(startPoint.x * previewCanvas.width, startPoint.y * previewCanvas.height);
        previewCtx.lineTo(endPoint.x * previewCanvas.width, endPoint.y * previewCanvas.height);
    }
    previewCtx.stroke();
    
    // Draw landmarks
    for (const landmark of landmarks) {
        previewCtx.beginPath();
        previewCtx.arc(
            landmark.x * previewCanvas.width,
            landmark.y * previewCanvas.height,
            2, 0, Math.PI * 2
        );
        previewCtx.fill();
    }
}

function calculateHandOpenness(landmarks) {
    // MediaPipe hand landmarks:
    // 0: Wrist
    // 4: Thumb tip, 8: Index tip, 12: Middle tip, 16: Ring tip, 20: Pinky tip
    // 9: Middle finger MCP (base) - good approximation of palm center
    
    const palmCenter = landmarks[9];
    const fingertips = [
        landmarks[4],  // Thumb
        landmarks[8],  // Index
        landmarks[12], // Middle
        landmarks[16], // Ring
        landmarks[20]  // Pinky
    ];
    
    // Calculate average distance from fingertips to palm center
    let totalDistance = 0;
    for (const tip of fingertips) {
        const dx = tip.x - palmCenter.x;
        const dy = tip.y - palmCenter.y;
        const dz = (tip.z || 0) - (palmCenter.z || 0);
        totalDistance += Math.sqrt(dx * dx + dy * dy + dz * dz);
    }
    
    const avgDistance = totalDistance / fingertips.length;
    
    // Normalize: closed fist ~0.1, open hand ~0.35
    // Adjust these values based on testing
    const minDist = 0.08;
    const maxDist = 0.30;
    
    const normalized = (avgDistance - minDist) / (maxDist - minDist);
    return Math.max(0, Math.min(1, normalized));
}

// ============================================
// ANIMATION LOOP
// ============================================
function animate() {
    requestAnimationFrame(animate);
    
    const time = performance.now() * 0.001;
    
    // Smooth the hand openness value
    smoothedOpenness += (targetHandOpenness - smoothedOpenness) * CONFIG.smoothing;
    handOpenness = smoothedOpenness;
    
    // Update UI indicator
    indicatorFill.style.height = `${handOpenness * 100}%`;
    
    // Ambient rotation when no hand detected
    if (!isHandDetected) {
        ambientRotation += CONFIG.ambientRotationSpeed;
    }
    
    // Update prism
    updatePrism(time);
    
    // Update particles
    updateParticles(time);
    
    // Update background
    updateBackground(time);
    
    // Update star field
    if (starField) {
        starField.material.uniforms.time.value = time;
        starField.rotation.y = time * 0.01;
    }
    
    // Render
    composer.render();
}

function updatePrism(time) {
    if (!prismMesh) return;
    
    // Fade out as hand opens
    prismMesh.material.opacity = 1 - handOpenness * 0.9;
    prismMesh.material.emissiveIntensity = 0.3 + handOpenness * 0.3;
    
    // Scale down slightly when opening
    const scale = 1 - handOpenness * 0.3;
    prismMesh.scale.set(scale, scale, scale);
    
    // Rotation
    prismMesh.rotation.y = time * 0.2 + ambientRotation;
    prismMesh.rotation.x = Math.PI * 0.1 + Math.sin(time * 0.5) * 0.05;
    
    // Update edge visibility
    const edges = prismMesh.children[0];
    if (edges) {
        edges.material.opacity = 0.8 - handOpenness * 0.6;
    }
}

function updateParticles(time) {
    if (!particleSystem) return;
    
    const positions = particleSystem.geometry.attributes.position.array;
    const count = positions.length / 3;
    
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        
        // Lerp between original and exploded positions
        const t = handOpenness;
        
        // Add some variation with velocity
        const vel = particleVelocities[i];
        const timeOffset = Math.sin(time + i) * 0.1;
        
        positions[i3] = THREE.MathUtils.lerp(
            particleOriginalPositions[i3],
            particleExplodedPositions[i3] + vel.x * time * 10,
            t
        ) + (t > 0.1 ? Math.sin(time * 2 + i) * 0.05 * t : 0);
        
        positions[i3 + 1] = THREE.MathUtils.lerp(
            particleOriginalPositions[i3 + 1],
            particleExplodedPositions[i3 + 1] + vel.y * time * 10,
            t
        ) + (t > 0.1 ? Math.cos(time * 2 + i * 0.5) * 0.05 * t : 0);
        
        positions[i3 + 2] = THREE.MathUtils.lerp(
            particleOriginalPositions[i3 + 2],
            particleExplodedPositions[i3 + 2] + vel.z * time * 10,
            t
        );
    }
    
    particleSystem.geometry.attributes.position.needsUpdate = true;
    
    // Update uniforms
    particleSystem.material.uniforms.time.value = time;
    particleSystem.material.uniforms.openness.value = handOpenness;
    
    // Match prism rotation
    particleSystem.rotation.y = time * 0.2 + ambientRotation;
    particleSystem.rotation.x = Math.PI * 0.1 + Math.sin(time * 0.5) * 0.05;
}

function updateBackground(time) {
    // Find and update nebula background
    scene.traverse((child) => {
        if (child.userData.material && child.userData.material.uniforms) {
            child.userData.material.uniforms.time.value = time;
        }
    });
}

// ============================================
// START APPLICATION
// ============================================
init();

