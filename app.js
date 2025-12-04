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
        count: 1200,
        baseSize: 0.1,
        sizeVariation: 0.06,
        explosionRadius: 12,
        colorVariation: 0.25
    },
    polyhedron: {
        scale: 1.8
    },
    camera: {
        fov: 60,
        near: 0.1,
        far: 1000,
        position: { x: 0, y: 0, z: 10 }
    },
    bloom: {
        strength: 2.0,
        radius: 0.5,
        threshold: 0.15
    },
    smoothing: 0.12, // Lower = smoother but more lag
    ambientRotationSpeed: 0.001
};

// Detect mobile for performance adjustments
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
if (isMobile) {
    CONFIG.particles.count = 600;
    CONFIG.bloom.strength = 1.5;
}

// ============================================
// GLOBAL STATE
// ============================================
let scene, camera, renderer, composer;
let prismGroup, prismFragments = [];
let particleSystem;
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

// Fragment data for explosion
let fragmentData = [];

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
    createTruncatedOctahedron();
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
    // Skip post-processing for now - use standard rendering
    composer = null;
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

function createTruncatedOctahedron() {
    const scale = CONFIG.polyhedron.scale;
    
    // Create a group to hold all fragments
    prismGroup = new THREE.Group();
    prismGroup.rotation.x = Math.PI * 0.1;
    scene.add(prismGroup);
    
    // Truncated octahedron vertices - permutations of (0, ±1, ±2)
    const vertices = [];
    const coords = [
        [0, 1, 2], [0, 1, -2], [0, -1, 2], [0, -1, -2],
        [0, 2, 1], [0, 2, -1], [0, -2, 1], [0, -2, -1],
        [1, 0, 2], [1, 0, -2], [-1, 0, 2], [-1, 0, -2],
        [1, 2, 0], [1, -2, 0], [-1, 2, 0], [-1, -2, 0],
        [2, 0, 1], [2, 0, -1], [-2, 0, 1], [-2, 0, -1],
        [2, 1, 0], [2, -1, 0], [-2, 1, 0], [-2, -1, 0]
    ];
    
    for (const c of coords) {
        vertices.push(new THREE.Vector3(c[0] * scale * 0.5, c[1] * scale * 0.5, c[2] * scale * 0.5));
    }
    
    // Helper to find vertex by coordinates
    const findVertex = (x, y, z) => {
        for (const v of vertices) {
            if (Math.abs(v.x - x * scale * 0.5) < 0.01 && 
                Math.abs(v.y - y * scale * 0.5) < 0.01 && 
                Math.abs(v.z - z * scale * 0.5) < 0.01) {
                return v.clone();
            }
        }
        return null;
    };
    
    // 6 Square faces (at the 6 axis directions)
    const squareFaces = [
        // +X face
        [[2,1,0], [2,0,1], [2,-1,0], [2,0,-1]],
        // -X face
        [[-2,1,0], [-2,0,-1], [-2,-1,0], [-2,0,1]],
        // +Y face
        [[1,2,0], [0,2,1], [-1,2,0], [0,2,-1]],
        // -Y face
        [[1,-2,0], [0,-2,-1], [-1,-2,0], [0,-2,1]],
        // +Z face
        [[1,0,2], [0,1,2], [-1,0,2], [0,-1,2]],
        // -Z face
        [[1,0,-2], [0,-1,-2], [-1,0,-2], [0,1,-2]]
    ];
    
    // 8 Hexagonal faces (at the 8 corners)
    const hexFaces = [
        // +X+Y+Z octant
        [[2,1,0], [2,0,1], [1,0,2], [0,1,2], [0,2,1], [1,2,0]],
        // +X+Y-Z octant
        [[2,1,0], [1,2,0], [0,2,-1], [0,1,-2], [1,0,-2], [2,0,-1]],
        // +X-Y+Z octant
        [[2,-1,0], [1,-2,0], [0,-2,1], [0,-1,2], [1,0,2], [2,0,1]],
        // +X-Y-Z octant
        [[2,-1,0], [2,0,-1], [1,0,-2], [0,-1,-2], [0,-2,-1], [1,-2,0]],
        // -X+Y+Z octant
        [[-2,1,0], [-1,2,0], [0,2,1], [0,1,2], [-1,0,2], [-2,0,1]],
        // -X+Y-Z octant
        [[-2,1,0], [-2,0,-1], [-1,0,-2], [0,1,-2], [0,2,-1], [-1,2,0]],
        // -X-Y+Z octant
        [[-2,-1,0], [-2,0,1], [-1,0,2], [0,-1,2], [0,-2,1], [-1,-2,0]],
        // -X-Y-Z octant
        [[-2,-1,0], [-1,-2,0], [0,-2,-1], [0,-1,-2], [-1,0,-2], [-2,0,-1]]
    ];
    
    // Create square faces (2 triangles each)
    for (const face of squareFaces) {
        const v = face.map(c => findVertex(c[0], c[1], c[2]));
        createFragment([v[0], v[1], v[2]], 'square');
        createFragment([v[0], v[2], v[3]], 'square');
    }
    
    // Create hexagonal faces (4 triangles each, fan from center)
    for (const face of hexFaces) {
        const v = face.map(c => findVertex(c[0], c[1], c[2]));
        // Calculate center of hexagon
        const center = new THREE.Vector3();
        for (const vert of v) center.add(vert);
        center.divideScalar(v.length);
        
        // Create triangles fanning from center
        for (let i = 0; i < v.length; i++) {
            const next = (i + 1) % v.length;
            createFragment([center.clone(), v[i].clone(), v[next].clone()], 'hex');
        }
    }
    
    // Subdivide for more dramatic explosion
    subdivideFragments();
}

function createFragment(vertices, faceType) {
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array([
        vertices[0].x, vertices[0].y, vertices[0].z,
        vertices[1].x, vertices[1].y, vertices[1].z,
        vertices[2].x, vertices[2].y, vertices[2].z
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    // Calculate centroid
    const centroid = new THREE.Vector3(
        (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
        (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
        (vertices[0].z + vertices[1].z + vertices[2].z) / 3
    );
    
    // Ethereal glowing material with slight variation
    const hueShift = Math.random() * 0.1;
    const material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().setHSL(0.7 + hueShift, 0.6, 0.5),
        emissive: new THREE.Color().setHSL(0.5 + hueShift, 0.8, 0.3),
        emissiveIntensity: 0.4,
        transparent: true,
        opacity: 1.0,
        metalness: 0.4,
        roughness: 0.2,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    prismGroup.add(mesh);
    prismFragments.push(mesh);
    
    // Calculate explosion direction (outward from center, with some randomness)
    const explosionDir = centroid.clone().normalize();
    explosionDir.x += (Math.random() - 0.5) * 0.5;
    explosionDir.y += (Math.random() - 0.5) * 0.5;
    explosionDir.z += (Math.random() - 0.5) * 0.5;
    explosionDir.normalize();
    
    // Store fragment data for animation
    fragmentData.push({
        mesh: mesh,
        originalPosition: new THREE.Vector3(0, 0, 0),
        originalRotation: new THREE.Euler(0, 0, 0),
        explosionDirection: explosionDir,
        explosionDistance: 4 + Math.random() * 6,
        rotationSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8,
            (Math.random() - 0.5) * 8
        ),
        delay: Math.random() * 0.2, // Staggered explosion
        centroid: centroid
    });
    
    // Add glowing edges
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x4ecdc4,
        transparent: true,
        opacity: 0.9
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);
    mesh.userData.edges = edges;
}

function subdivideFragments() {
    // Store original fragments to subdivide
    const originalFragments = [...prismFragments];
    const originalData = [...fragmentData];
    
    // Clear arrays - we'll rebuild them
    prismFragments = [];
    fragmentData = [];
    
    // Subdivide each original fragment into 4 pieces
    for (let i = 0; i < originalFragments.length; i++) {
        const fragment = originalFragments[i];
        const positions = fragment.geometry.attributes.position.array;
        
        const v0 = new THREE.Vector3(positions[0], positions[1], positions[2]);
        const v1 = new THREE.Vector3(positions[3], positions[4], positions[5]);
        const v2 = new THREE.Vector3(positions[6], positions[7], positions[8]);
        
        // Get midpoints
        const m01 = v0.clone().add(v1).multiplyScalar(0.5);
        const m12 = v1.clone().add(v2).multiplyScalar(0.5);
        const m20 = v2.clone().add(v0).multiplyScalar(0.5);
        
        // Remove original from scene
        prismGroup.remove(fragment);
        fragment.geometry.dispose();
        fragment.material.dispose();
        
        // Create 4 sub-triangles
        createSubFragment([v0.clone(), m01.clone(), m20.clone()]);
        createSubFragment([m01.clone(), v1.clone(), m12.clone()]);
        createSubFragment([m20.clone(), m12.clone(), v2.clone()]);
        createSubFragment([m01.clone(), m12.clone(), m20.clone()]);
    }
}

function createSubFragment(vertices) {
    const geometry = new THREE.BufferGeometry();
    
    const positions = new Float32Array([
        vertices[0].x, vertices[0].y, vertices[0].z,
        vertices[1].x, vertices[1].y, vertices[1].z,
        vertices[2].x, vertices[2].y, vertices[2].z
    ]);
    
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.computeVertexNormals();
    
    const centroid = new THREE.Vector3(
        (vertices[0].x + vertices[1].x + vertices[2].x) / 3,
        (vertices[0].y + vertices[1].y + vertices[2].y) / 3,
        (vertices[0].z + vertices[1].z + vertices[2].z) / 3
    );
    
    const hueShift = Math.random() * 0.15;
    const material = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color().setHSL(0.7 + hueShift, 0.6, 0.55),
        emissive: new THREE.Color().setHSL(0.5 + hueShift, 0.8, 0.35),
        emissiveIntensity: 0.5,
        transparent: true,
        opacity: 1.0,
        metalness: 0.4,
        roughness: 0.15,
        clearcoat: 1.0,
        clearcoatRoughness: 0.1,
        side: THREE.DoubleSide
    });
    
    const mesh = new THREE.Mesh(geometry, material);
    prismGroup.add(mesh);
    prismFragments.push(mesh);
    
    // Explosion direction based on centroid
    const explosionDir = centroid.clone().normalize();
    explosionDir.x += (Math.random() - 0.5) * 0.8;
    explosionDir.y += (Math.random() - 0.5) * 0.8;
    explosionDir.z += (Math.random() - 0.5) * 0.8;
    explosionDir.normalize();
    
    fragmentData.push({
        mesh: mesh,
        originalPosition: new THREE.Vector3(0, 0, 0),
        originalRotation: new THREE.Euler(0, 0, 0),
        explosionDirection: explosionDir,
        explosionDistance: 5 + Math.random() * 8,
        rotationSpeed: new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10,
            (Math.random() - 0.5) * 10
        ),
        delay: Math.random() * 0.3,
        centroid: centroid
    });
    
    // Add glowing edges
    const edgeGeometry = new THREE.EdgesGeometry(geometry);
    const edgeMaterial = new THREE.LineBasicMaterial({
        color: 0x4ecdc4,
        transparent: true,
        opacity: 0.9
    });
    const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    mesh.add(edges);
    mesh.userData.edges = edges;
}

function createParticleSystem() {
    const { count, baseSize, sizeVariation, explosionRadius, colorVariation } = CONFIG.particles;
    const polyScale = CONFIG.polyhedron.scale;
    
    const positions = new Float32Array(count * 3);
    const originalPositions = new Float32Array(count * 3);
    const explodedPositions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const velocities = [];
    const delays = new Float32Array(count);
    
    // Base colors for particles - more vibrant
    const colorPalette = [
        new THREE.Color(0x4ecdc4), // Cyan
        new THREE.Color(0xff6b9d), // Pink
        new THREE.Color(0x7b68ee), // Purple/Blue
        new THREE.Color(0xf0f0ff), // White
        new THREE.Color(0xff9f43), // Orange sparks
        new THREE.Color(0xa29bfe)  // Lavender
    ];
    
    for (let i = 0; i < count; i++) {
        // Original position: on the polyhedron surface (spherical distribution)
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = polyScale * (0.9 + Math.random() * 0.2);
        
        const ox = r * Math.sin(phi) * Math.cos(theta);
        const oy = r * Math.sin(phi) * Math.sin(theta);
        const oz = r * Math.cos(phi);
        
        originalPositions[i * 3] = ox;
        originalPositions[i * 3 + 1] = oy;
        originalPositions[i * 3 + 2] = oz;
        
        // Start at original position
        positions[i * 3] = ox;
        positions[i * 3 + 1] = oy;
        positions[i * 3 + 2] = oz;
        
        // Exploded position: burst outward in direction from center
        const burstDir = new THREE.Vector3(ox, oy, oz).normalize();
        burstDir.x += (Math.random() - 0.5) * 1.5;
        burstDir.y += (Math.random() - 0.5) * 1.5;
        burstDir.z += (Math.random() - 0.5) * 1.5;
        burstDir.normalize();
        
        const explodeR = explosionRadius * (0.6 + Math.random() * 0.8);
        
        explodedPositions[i * 3] = burstDir.x * explodeR;
        explodedPositions[i * 3 + 1] = burstDir.y * explodeR;
        explodedPositions[i * 3 + 2] = burstDir.z * explodeR;
        
        // Random velocity for sparkle motion
        velocities.push({
            x: (Math.random() - 0.5) * 0.05,
            y: (Math.random() - 0.5) * 0.05,
            z: (Math.random() - 0.5) * 0.05,
            phase: Math.random() * Math.PI * 2
        });
        
        // Staggered delays for cascade effect
        delays[i] = Math.random() * 0.4;
        
        // Color with variation
        const baseColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
        colors[i * 3] = Math.min(1, baseColor.r + (Math.random() - 0.5) * colorVariation);
        colors[i * 3 + 1] = Math.min(1, baseColor.g + (Math.random() - 0.5) * colorVariation);
        colors[i * 3 + 2] = Math.min(1, baseColor.b + (Math.random() - 0.5) * colorVariation);
        
        // Size with more variation for depth
        sizes[i] = baseSize * (0.5 + Math.random() * 1.5);
    }
    
    // Store for animation
    particleOriginalPositions = originalPositions;
    particleExplodedPositions = explodedPositions;
    particleVelocities = velocities;
    
    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
    particleGeometry.setAttribute('delay', new THREE.BufferAttribute(delays, 1));
    
    const particleMaterial = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            openness: { value: 0 }
        },
        vertexShader: `
            attribute float size;
            attribute vec3 color;
            attribute float delay;
            varying vec3 vColor;
            varying float vAlpha;
            uniform float time;
            uniform float openness;
            
            void main() {
                vColor = color;
                
                // Delayed openness for cascade effect
                float delayedOpenness = max(0.0, (openness - delay) / (1.0 - delay));
                delayedOpenness = min(1.0, delayedOpenness);
                
                // Alpha ramps up as particles burst out
                vAlpha = delayedOpenness * (1.0 - delayedOpenness * 0.3);
                
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                
                // Shimmer and pulse effect
                float shimmer = sin(time * 4.0 + position.x * 8.0 + position.y * 8.0) * 0.3 + 0.7;
                float pulse = sin(time * 2.0 + delay * 10.0) * 0.2 + 1.0;
                
                // Size grows as it explodes
                float sizeMultiplier = 0.3 + delayedOpenness * 1.2;
                
                gl_PointSize = size * shimmer * pulse * (250.0 / -mvPosition.z) * sizeMultiplier;
                gl_Position = projectionMatrix * mvPosition;
            }
        `,
        fragmentShader: `
            varying vec3 vColor;
            varying float vAlpha;
            
            void main() {
                float dist = length(gl_PointCoord - vec2(0.5));
                if (dist > 0.5) discard;
                
                // Soft glow falloff with bright core
                float glow = 1.0 - smoothstep(0.0, 0.5, dist);
                float core = 1.0 - smoothstep(0.0, 0.15, dist);
                
                // Bright white core, colored glow
                vec3 coreColor = vec3(1.0, 1.0, 1.0);
                vec3 finalColor = mix(vColor * 1.5, coreColor, core * 0.7);
                
                float alpha = glow * vAlpha;
                
                gl_FragColor = vec4(finalColor, alpha);
            }
        `,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
    });
    
    particleSystem = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particleSystem);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    if (composer) {
        composer.setSize(window.innerWidth, window.innerHeight);
    }
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
    // 5: Index MCP, 9: Middle MCP, 13: Ring MCP, 17: Pinky MCP
    
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    
    // Calculate hand size reference (wrist to middle MCP)
    // This scales with distance from camera, so we use it to normalize
    const refDx = middleMCP.x - wrist.x;
    const refDy = middleMCP.y - wrist.y;
    const refDz = (middleMCP.z || 0) - (wrist.z || 0);
    const handSize = Math.sqrt(refDx * refDx + refDy * refDy + refDz * refDz);
    
    // Avoid division by zero
    if (handSize < 0.001) return 0;
    
    // Fingertips and their corresponding MCP (base) joints
    const fingers = [
        { tip: landmarks[4], base: landmarks[2] },   // Thumb (tip to IP joint)
        { tip: landmarks[8], base: landmarks[5] },   // Index
        { tip: landmarks[12], base: landmarks[9] },  // Middle
        { tip: landmarks[16], base: landmarks[13] }, // Ring
        { tip: landmarks[20], base: landmarks[17] }  // Pinky
    ];
    
    // Calculate average extension ratio (tip-to-base distance / hand size)
    let totalRatio = 0;
    for (const finger of fingers) {
        const dx = finger.tip.x - finger.base.x;
        const dy = finger.tip.y - finger.base.y;
        const dz = (finger.tip.z || 0) - (finger.base.z || 0);
        const fingerLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        // Normalize by hand size to make it distance-independent
        totalRatio += fingerLength / handSize;
    }
    
    const avgRatio = totalRatio / fingers.length;
    
    // Normalized ratios: closed fist ~0.3-0.5, open hand ~0.9-1.2
    // Higher minRatio = more forgiving for keeping fist "closed"
    const minRatio = 0.50;  // Dead zone for closed fist
    const maxRatio = 1.15;  // Increased to properly detect full open
    
    const normalized = (avgRatio - minRatio) / (maxRatio - minRatio);
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
    
    // Render (use composer if available, otherwise standard renderer)
    if (composer) {
        composer.render();
    } else {
        renderer.render(scene, camera);
    }
}

function updatePrism(time) {
    if (!prismGroup) return;
    
    // Rotate the entire group
    prismGroup.rotation.y = time * 0.2 + ambientRotation;
    prismGroup.rotation.x = Math.PI * 0.1 + Math.sin(time * 0.5) * 0.05;
    
    // First pass: calculate base positions
    const basePositions = [];
    for (let i = 0; i < fragmentData.length; i++) {
        const data = fragmentData[i];
        
        // Apply delay to explosion (staggered effect)
        const delayedOpenness = Math.max(0, (handOpenness - data.delay) / (1 - data.delay));
        const t = easeOutCubic(Math.min(1, delayedOpenness));
        
        // Base position from explosion direction
        const explodedPos = data.explosionDirection.clone().multiplyScalar(data.explosionDistance * t);
        const basePos = data.originalPosition.clone().add(explodedPos);
        basePositions.push({ pos: basePos, t: t });
    }
    
    // Second pass: apply collision avoidance
    const minDistance = 0.8; // Minimum distance between fragment centers
    const repulsionStrength = 0.5;
    
    for (let i = 0; i < fragmentData.length; i++) {
        const repulsion = new THREE.Vector3(0, 0, 0);
        const posI = basePositions[i].pos;
        const tI = basePositions[i].t;
        
        // Only apply collision when exploding (t > 0.1)
        if (tI > 0.1) {
            for (let j = 0; j < fragmentData.length; j++) {
                if (i === j) continue;
                
                const posJ = basePositions[j].pos;
                const diff = posI.clone().sub(posJ);
                const dist = diff.length();
                
                if (dist < minDistance && dist > 0.001) {
                    // Repel away from nearby fragment
                    const force = diff.normalize().multiplyScalar(
                        repulsionStrength * (minDistance - dist) / minDistance * tI
                    );
                    repulsion.add(force);
                }
            }
        }
        
        // Apply final position with repulsion
        const data = fragmentData[i];
        const mesh = data.mesh;
        const t = basePositions[i].t;
        
        mesh.position.copy(basePositions[i].pos).add(repulsion);
        
        // Rotation: spin as it explodes
        mesh.rotation.x = data.originalRotation.x + data.rotationSpeed.x * t;
        mesh.rotation.y = data.originalRotation.y + data.rotationSpeed.y * t;
        mesh.rotation.z = data.originalRotation.z + data.rotationSpeed.z * t;
        
        // Scale down slightly as pieces fly apart
        const scale = 1 - t * 0.3;
        mesh.scale.set(scale, scale, scale);
        
        // Fade out at the end of explosion
        const fadeStart = 0.7;
        const opacity = t > fadeStart ? 1 - ((t - fadeStart) / (1 - fadeStart)) : 1;
        mesh.material.opacity = opacity;
        mesh.material.emissiveIntensity = 0.4 + t * 0.4;
        
        // Edge glow
        if (mesh.userData.edges) {
            mesh.userData.edges.material.opacity = opacity * 0.9;
        }
    }
}

// Easing function for smoother explosion
function easeOutCubic(t) {
    return 1 - Math.pow(1 - t, 3);
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function updateParticles(time) {
    if (!particleSystem) return;
    
    const positions = particleSystem.geometry.attributes.position.array;
    const delays = particleSystem.geometry.attributes.delay.array;
    const count = positions.length / 3;
    
    for (let i = 0; i < count; i++) {
        const i3 = i * 3;
        const delay = delays[i];
        
        // Delayed openness for staggered explosion
        const delayedOpenness = Math.max(0, (handOpenness - delay) / (1 - delay));
        const t = easeOutCubic(Math.min(1, delayedOpenness));
        
        // Add some variation with velocity for sparkle
        const vel = particleVelocities[i];
        const wobbleX = Math.sin(time * 3 + vel.phase) * 0.15 * t;
        const wobbleY = Math.cos(time * 2.5 + vel.phase) * 0.15 * t;
        const wobbleZ = Math.sin(time * 2 + vel.phase + 1) * 0.15 * t;
        
        positions[i3] = THREE.MathUtils.lerp(
            particleOriginalPositions[i3],
            particleExplodedPositions[i3],
            t
        ) + wobbleX;
        
        positions[i3 + 1] = THREE.MathUtils.lerp(
            particleOriginalPositions[i3 + 1],
            particleExplodedPositions[i3 + 1],
            t
        ) + wobbleY;
        
        positions[i3 + 2] = THREE.MathUtils.lerp(
            particleOriginalPositions[i3 + 2],
            particleExplodedPositions[i3 + 2],
            t
        ) + wobbleZ;
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

