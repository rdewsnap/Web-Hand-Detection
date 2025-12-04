/**
 * Cosmic Prism Demo
 * A truncated octahedron that explodes into fragments based on hand openness
 */

const CosmicPrismDemo = (function() {
    // Configuration
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
        ambientRotationSpeed: 0.001
    };

    // Adjust for mobile
    if (HandTracking.isMobile()) {
        CONFIG.particles.count = 600;
    }

    // State
    let scene, camera, renderer;
    let prismGroup, prismFragments = [];
    let particleSystem;
    let starField;
    let ambientRotation = 0;
    let animationId = null;
    let container = null;

    // Particle data
    let particleOriginalPositions = [];
    let particleExplodedPositions = [];
    let particleVelocities = [];

    // Fragment data
    let fragmentData = [];

    /**
     * Initialize the demo
     */
    function init(containerElement) {
        container = containerElement;
        
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
            antialias: !HandTracking.isMobile(),
            alpha: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x0d0518, 1);
        container.appendChild(renderer.domElement);
        
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
        
        // Start animation
        animate();
    }

    /**
     * Clean up the demo
     */
    function destroy() {
        if (animationId) {
            cancelAnimationFrame(animationId);
            animationId = null;
        }
        
        window.removeEventListener('resize', onWindowResize);
        
        if (renderer && container) {
            container.removeChild(renderer.domElement);
            renderer.dispose();
        }
        
        // Clean up Three.js objects
        if (scene) {
            scene.traverse((object) => {
                if (object.geometry) object.geometry.dispose();
                if (object.material) {
                    if (Array.isArray(object.material)) {
                        object.material.forEach(m => m.dispose());
                    } else {
                        object.material.dispose();
                    }
                }
            });
        }
        
        scene = null;
        camera = null;
        renderer = null;
        prismGroup = null;
        prismFragments = [];
        particleSystem = null;
        starField = null;
        fragmentData = [];
    }

    function createCosmicBackground() {
        const bgGeometry = new THREE.SphereGeometry(100, 32, 32);
        
        const bgMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: { time: { value: 0 } },
            vertexShader: `
                varying vec3 vPosition;
                void main() {
                    vPosition = position;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform float time;
                varying vec3 vPosition;
                
                vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
                vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
                vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
                
                float snoise(vec3 v) {
                    const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                    vec3 i = floor(v + dot(v, C.yyy));
                    vec3 x0 = v - i + dot(i, C.xxx);
                    vec3 g = step(x0.yzx, x0.xyz);
                    vec3 l = 1.0 - g;
                    vec3 i1 = min(g.xyz, l.zxy);
                    vec3 i2 = max(g.xyz, l.zxy);
                    vec3 x1 = x0 - i1 + C.xxx;
                    vec3 x2 = x0 - i2 + C.yyy;
                    vec3 x3 = x0 - D.yyy;
                    i = mod289(i);
                    vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0)) + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                    float n_ = 0.142857142857;
                    vec3 ns = n_ * D.wyz - D.xzx;
                    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                    vec4 x_ = floor(j * ns.z);
                    vec4 y_ = floor(j - 7.0 * x_);
                    vec4 x = x_ * ns.x + ns.yyyy;
                    vec4 y = y_ * ns.x + ns.yyyy;
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
                    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                    vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                    m = m * m;
                    return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
                }
                
                void main() {
                    vec3 pos = normalize(vPosition) * 0.5;
                    float n1 = snoise(pos * 2.0 + time * 0.02) * 0.5 + 0.5;
                    float n2 = snoise(pos * 4.0 - time * 0.01) * 0.5 + 0.5;
                    float n3 = snoise(pos * 8.0 + time * 0.03) * 0.5 + 0.5;
                    float noise = n1 * 0.6 + n2 * 0.3 + n3 * 0.1;
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
        const starCount = HandTracking.isMobile() ? 1000 : 2000;
        const positions = new Float32Array(starCount * 3);
        const sizes = new Float32Array(starCount);
        const colors = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 30 + Math.random() * 50;
            
            positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
            positions[i * 3 + 2] = r * Math.cos(phi);
            
            sizes[i] = Math.random() * 2 + 0.5;
            
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
            uniforms: { time: { value: 0 } },
            vertexShader: `
                attribute float size;
                attribute vec3 color;
                varying vec3 vColor;
                uniform float time;
                void main() {
                    vColor = color;
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
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
        
        prismGroup = new THREE.Group();
        prismGroup.rotation.x = Math.PI * 0.1;
        scene.add(prismGroup);
        
        const coords = [
            [0, 1, 2], [0, 1, -2], [0, -1, 2], [0, -1, -2],
            [0, 2, 1], [0, 2, -1], [0, -2, 1], [0, -2, -1],
            [1, 0, 2], [1, 0, -2], [-1, 0, 2], [-1, 0, -2],
            [1, 2, 0], [1, -2, 0], [-1, 2, 0], [-1, -2, 0],
            [2, 0, 1], [2, 0, -1], [-2, 0, 1], [-2, 0, -1],
            [2, 1, 0], [2, -1, 0], [-2, 1, 0], [-2, -1, 0]
        ];
        
        const vertices = coords.map(c => new THREE.Vector3(c[0] * scale * 0.5, c[1] * scale * 0.5, c[2] * scale * 0.5));
        
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
        
        const squareFaces = [
            [[2,1,0], [2,0,1], [2,-1,0], [2,0,-1]],
            [[-2,1,0], [-2,0,-1], [-2,-1,0], [-2,0,1]],
            [[1,2,0], [0,2,1], [-1,2,0], [0,2,-1]],
            [[1,-2,0], [0,-2,-1], [-1,-2,0], [0,-2,1]],
            [[1,0,2], [0,1,2], [-1,0,2], [0,-1,2]],
            [[1,0,-2], [0,-1,-2], [-1,0,-2], [0,1,-2]]
        ];
        
        const hexFaces = [
            [[2,1,0], [2,0,1], [1,0,2], [0,1,2], [0,2,1], [1,2,0]],
            [[2,1,0], [1,2,0], [0,2,-1], [0,1,-2], [1,0,-2], [2,0,-1]],
            [[2,-1,0], [1,-2,0], [0,-2,1], [0,-1,2], [1,0,2], [2,0,1]],
            [[2,-1,0], [2,0,-1], [1,0,-2], [0,-1,-2], [0,-2,-1], [1,-2,0]],
            [[-2,1,0], [-1,2,0], [0,2,1], [0,1,2], [-1,0,2], [-2,0,1]],
            [[-2,1,0], [-2,0,-1], [-1,0,-2], [0,1,-2], [0,2,-1], [-1,2,0]],
            [[-2,-1,0], [-2,0,1], [-1,0,2], [0,-1,2], [0,-2,1], [-1,-2,0]],
            [[-2,-1,0], [-1,-2,0], [0,-2,-1], [0,-1,-2], [-1,0,-2], [-2,0,-1]]
        ];
        
        for (const face of squareFaces) {
            const v = face.map(c => findVertex(c[0], c[1], c[2]));
            createFragment([v[0], v[1], v[2]]);
            createFragment([v[0], v[2], v[3]]);
        }
        
        for (const face of hexFaces) {
            const v = face.map(c => findVertex(c[0], c[1], c[2]));
            const center = new THREE.Vector3();
            for (const vert of v) center.add(vert);
            center.divideScalar(v.length);
            
            for (let i = 0; i < v.length; i++) {
                const next = (i + 1) % v.length;
                createFragment([center.clone(), v[i].clone(), v[next].clone()]);
            }
        }
        
        subdivideFragments();
    }

    function createFragment(vertices) {
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
        
        const explosionDir = centroid.clone().normalize();
        explosionDir.x += (Math.random() - 0.5) * 0.5;
        explosionDir.y += (Math.random() - 0.5) * 0.5;
        explosionDir.z += (Math.random() - 0.5) * 0.5;
        explosionDir.normalize();
        
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
            delay: Math.random() * 0.2,
            centroid: centroid
        });
        
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
        const originalFragments = [...prismFragments];
        prismFragments = [];
        fragmentData = [];
        
        for (let i = 0; i < originalFragments.length; i++) {
            const fragment = originalFragments[i];
            const positions = fragment.geometry.attributes.position.array;
            
            const v0 = new THREE.Vector3(positions[0], positions[1], positions[2]);
            const v1 = new THREE.Vector3(positions[3], positions[4], positions[5]);
            const v2 = new THREE.Vector3(positions[6], positions[7], positions[8]);
            
            const m01 = v0.clone().add(v1).multiplyScalar(0.5);
            const m12 = v1.clone().add(v2).multiplyScalar(0.5);
            const m20 = v2.clone().add(v0).multiplyScalar(0.5);
            
            prismGroup.remove(fragment);
            fragment.geometry.dispose();
            fragment.material.dispose();
            
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
        
        const colorPalette = [
            new THREE.Color(0x4ecdc4),
            new THREE.Color(0xff6b9d),
            new THREE.Color(0x7b68ee),
            new THREE.Color(0xf0f0ff),
            new THREE.Color(0xff9f43),
            new THREE.Color(0xa29bfe)
        ];
        
        for (let i = 0; i < count; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = polyScale * (0.9 + Math.random() * 0.2);
            
            const ox = r * Math.sin(phi) * Math.cos(theta);
            const oy = r * Math.sin(phi) * Math.sin(theta);
            const oz = r * Math.cos(phi);
            
            originalPositions[i * 3] = ox;
            originalPositions[i * 3 + 1] = oy;
            originalPositions[i * 3 + 2] = oz;
            
            positions[i * 3] = ox;
            positions[i * 3 + 1] = oy;
            positions[i * 3 + 2] = oz;
            
            const burstDir = new THREE.Vector3(ox, oy, oz).normalize();
            burstDir.x += (Math.random() - 0.5) * 1.5;
            burstDir.y += (Math.random() - 0.5) * 1.5;
            burstDir.z += (Math.random() - 0.5) * 1.5;
            burstDir.normalize();
            
            const explodeR = explosionRadius * (0.6 + Math.random() * 0.8);
            
            explodedPositions[i * 3] = burstDir.x * explodeR;
            explodedPositions[i * 3 + 1] = burstDir.y * explodeR;
            explodedPositions[i * 3 + 2] = burstDir.z * explodeR;
            
            velocities.push({
                x: (Math.random() - 0.5) * 0.05,
                y: (Math.random() - 0.5) * 0.05,
                z: (Math.random() - 0.5) * 0.05,
                phase: Math.random() * Math.PI * 2
            });
            
            delays[i] = Math.random() * 0.4;
            
            const baseColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
            colors[i * 3] = Math.min(1, baseColor.r + (Math.random() - 0.5) * colorVariation);
            colors[i * 3 + 1] = Math.min(1, baseColor.g + (Math.random() - 0.5) * colorVariation);
            colors[i * 3 + 2] = Math.min(1, baseColor.b + (Math.random() - 0.5) * colorVariation);
            
            sizes[i] = baseSize * (0.5 + Math.random() * 1.5);
        }
        
        particleOriginalPositions = originalPositions;
        particleExplodedPositions = explodedPositions;
        particleVelocities = velocities;
        
        const particleGeometry = new THREE.BufferGeometry();
        particleGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        particleGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        particleGeometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
        particleGeometry.setAttribute('delay', new THREE.BufferAttribute(delays, 1));
        
        const particleMaterial = new THREE.ShaderMaterial({
            uniforms: { time: { value: 0 }, openness: { value: 0 } },
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
                    float delayedOpenness = max(0.0, (openness - delay) / (1.0 - delay));
                    delayedOpenness = min(1.0, delayedOpenness);
                    vAlpha = delayedOpenness * (1.0 - delayedOpenness * 0.3);
                    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                    float shimmer = sin(time * 4.0 + position.x * 8.0 + position.y * 8.0) * 0.3 + 0.7;
                    float pulse = sin(time * 2.0 + delay * 10.0) * 0.2 + 1.0;
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
                    float glow = 1.0 - smoothstep(0.0, 0.5, dist);
                    float core = 1.0 - smoothstep(0.0, 0.15, dist);
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
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }

    function animate() {
        animationId = requestAnimationFrame(animate);
        
        const time = performance.now() * 0.001;
        const handOpenness = HandTracking.getOpenness();
        const handRotation = HandTracking.getRotation();
        const isHandDetected = HandTracking.isDetected();
        
        // Update hand tracking smoothing
        HandTracking.update();
        
        // Ambient rotation when no hand detected
        if (!isHandDetected) {
            ambientRotation += CONFIG.ambientRotationSpeed;
        }
        
        // Update prism
        updatePrism(time, handOpenness, handRotation, isHandDetected);
        
        // Update particles
        updateParticles(time, handOpenness, handRotation, isHandDetected);
        
        // Update background
        scene.traverse((child) => {
            if (child.userData.material && child.userData.material.uniforms) {
                child.userData.material.uniforms.time.value = time;
            }
        });
        
        // Update star field
        if (starField) {
            starField.material.uniforms.time.value = time;
            starField.rotation.y = time * 0.01;
        }
        
        renderer.render(scene, camera);
    }

    function updatePrism(time, handOpenness, handRotation, isHandDetected) {
        if (!prismGroup) return;
        
        const baseRotationY = time * 0.2 + ambientRotation;
        const baseRotationX = Math.PI * 0.1 + Math.sin(time * 0.5) * 0.05;
        prismGroup.rotation.set(baseRotationX, baseRotationY, 0);
        
        const basePositions = [];
        for (let i = 0; i < fragmentData.length; i++) {
            const data = fragmentData[i];
            const delayedOpenness = Math.max(0, (handOpenness - data.delay) / (1 - data.delay));
            const t = easeOutCubic(Math.min(1, delayedOpenness));
            const explodedPos = data.explosionDirection.clone().multiplyScalar(data.explosionDistance * t);
            const basePos = data.originalPosition.clone().add(explodedPos);
            basePositions.push({ pos: basePos, t: t });
        }
        
        const minDistance = 0.8;
        const repulsionStrength = 0.5;
        
        for (let i = 0; i < fragmentData.length; i++) {
            const repulsion = new THREE.Vector3(0, 0, 0);
            const posI = basePositions[i].pos;
            const tI = basePositions[i].t;
            
            if (tI > 0.1) {
                for (let j = 0; j < fragmentData.length; j++) {
                    if (i === j) continue;
                    const posJ = basePositions[j].pos;
                    const diff = posI.clone().sub(posJ);
                    const dist = diff.length();
                    if (dist < minDistance && dist > 0.001) {
                        const force = diff.normalize().multiplyScalar(
                            repulsionStrength * (minDistance - dist) / minDistance * tI
                        );
                        repulsion.add(force);
                    }
                }
            }
            
            const data = fragmentData[i];
            const mesh = data.mesh;
            const t = basePositions[i].t;
            
            const finalPos = basePositions[i].pos.clone().add(repulsion);
            
            if (isHandDetected && t > 0.05 && handRotation) {
                finalPos.applyQuaternion(handRotation);
            }
            
            mesh.position.copy(finalPos);
            
            mesh.rotation.x = data.originalRotation.x + data.rotationSpeed.x * t;
            mesh.rotation.y = data.originalRotation.y + data.rotationSpeed.y * t;
            mesh.rotation.z = data.originalRotation.z + data.rotationSpeed.z * t;
            
            const scale = 1 - t * 0.3;
            mesh.scale.set(scale, scale, scale);
            
            const fadeStart = 0.7;
            const opacity = t > fadeStart ? 1 - ((t - fadeStart) / (1 - fadeStart)) : 1;
            mesh.material.opacity = opacity;
            mesh.material.emissiveIntensity = 0.4 + t * 0.4;
            
            if (mesh.userData.edges) {
                mesh.userData.edges.material.opacity = opacity * 0.9;
            }
        }
    }

    function updateParticles(time, handOpenness, handRotation, isHandDetected) {
        if (!particleSystem) return;
        
        const positions = particleSystem.geometry.attributes.position.array;
        const delays = particleSystem.geometry.attributes.delay.array;
        const count = positions.length / 3;
        
        for (let i = 0; i < count; i++) {
            const i3 = i * 3;
            const delay = delays[i];
            
            const delayedOpenness = Math.max(0, (handOpenness - delay) / (1 - delay));
            const t = easeOutCubic(Math.min(1, delayedOpenness));
            
            const vel = particleVelocities[i];
            const wobbleX = Math.sin(time * 3 + vel.phase) * 0.15 * t;
            const wobbleY = Math.cos(time * 2.5 + vel.phase) * 0.15 * t;
            const wobbleZ = Math.sin(time * 2 + vel.phase + 1) * 0.15 * t;
            
            let px = THREE.MathUtils.lerp(particleOriginalPositions[i3], particleExplodedPositions[i3], t) + wobbleX;
            let py = THREE.MathUtils.lerp(particleOriginalPositions[i3 + 1], particleExplodedPositions[i3 + 1], t) + wobbleY;
            let pz = THREE.MathUtils.lerp(particleOriginalPositions[i3 + 2], particleExplodedPositions[i3 + 2], t) + wobbleZ;
            
            if (isHandDetected && t > 0.05 && handRotation) {
                const pos = new THREE.Vector3(px, py, pz);
                pos.applyQuaternion(handRotation);
                px = pos.x;
                py = pos.y;
                pz = pos.z;
            }
            
            positions[i3] = px;
            positions[i3 + 1] = py;
            positions[i3 + 2] = pz;
        }
        
        particleSystem.geometry.attributes.position.needsUpdate = true;
        particleSystem.material.uniforms.time.value = time;
        particleSystem.material.uniforms.openness.value = handOpenness;
        
        particleSystem.rotation.y = time * 0.2 + ambientRotation;
        particleSystem.rotation.x = Math.PI * 0.1 + Math.sin(time * 0.5) * 0.05;
    }

    // Public API
    return {
        init: init,
        destroy: destroy,
        name: 'Cosmic Prism',
        description: 'Control an exploding gem with your hand'
    };
})();

window.CosmicPrismDemo = CosmicPrismDemo;

