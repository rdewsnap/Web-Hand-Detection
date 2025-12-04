/**
 * Airplane Demo
 * Control a low-poly airplane with hand rotation
 * Open palm facing camera = level flight
 */

const AirplaneDemo = (function() {
    // Configuration
    const CONFIG = {
        camera: {
            fov: 60,
            near: 0.1,
            far: 2000,
            followDistance: 15,
            followHeight: 5
        },
        airplane: {
            speed: 0.5,
            rollSensitivity: 2.5,
            pitchSensitivity: 1.5,
            maxRoll: Math.PI / 3,
            maxPitch: Math.PI / 4
        },
        terrain: {
            segments: 100,
            size: 500,
            heightScale: 30
        }
    };

    // State
    let scene, camera, renderer;
    let airplane, propeller;
    let terrain;
    let clouds = [];
    let trailParticles;
    let animationId = null;
    let container = null;
    
    // Flight state
    let planePosition = new THREE.Vector3(0, 50, 0);
    let planeRotation = new THREE.Euler(0, 0, 0);
    let planeQuaternion = new THREE.Quaternion();
    let velocity = new THREE.Vector3(0, 0, CONFIG.airplane.speed);
    let targetRoll = 0;
    let targetPitch = 0;
    let currentRoll = 0;
    let currentPitch = 0;
    
    // Trail
    let trailPositions = [];
    const MAX_TRAIL_LENGTH = 100;

    /**
     * Initialize the demo
     */
    function init(containerElement) {
        container = containerElement;
        
        // Scene
        scene = new THREE.Scene();
        scene.fog = new THREE.FogExp2(0x1a0a2e, 0.008);
        
        // Camera
        camera = new THREE.PerspectiveCamera(
            CONFIG.camera.fov,
            window.innerWidth / window.innerHeight,
            CONFIG.camera.near,
            CONFIG.camera.far
        );
        
        // Renderer
        renderer = new THREE.WebGLRenderer({
            antialias: !HandTracking.isMobile(),
            alpha: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setClearColor(0x1a0a2e, 1);
        container.appendChild(renderer.domElement);
        
        // Create scene elements
        createSkybox();
        createTerrain();
        createAirplane();
        createClouds();
        createTrailSystem();
        
        // Lighting
        const ambientLight = new THREE.AmbientLight(0x4ecdc4, 0.4);
        scene.add(ambientLight);
        
        const sunLight = new THREE.DirectionalLight(0xffffff, 1);
        sunLight.position.set(50, 100, 50);
        scene.add(sunLight);
        
        const rimLight = new THREE.DirectionalLight(0xff6b9d, 0.5);
        rimLight.position.set(-50, 50, -50);
        scene.add(rimLight);
        
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
        airplane = null;
        terrain = null;
        clouds = [];
        trailParticles = null;
        
        // Reset flight state
        planePosition = new THREE.Vector3(0, 50, 0);
        planeRotation = new THREE.Euler(0, 0, 0);
        currentRoll = 0;
        currentPitch = 0;
        trailPositions = [];
    }

    function createSkybox() {
        // Gradient sky sphere
        const skyGeometry = new THREE.SphereGeometry(800, 32, 32);
        const skyMaterial = new THREE.ShaderMaterial({
            side: THREE.BackSide,
            uniforms: {
                topColor: { value: new THREE.Color(0x0d0518) },
                bottomColor: { value: new THREE.Color(0x1a0a2e) },
                offset: { value: 400 },
                exponent: { value: 0.6 }
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPosition.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                uniform float offset;
                uniform float exponent;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition + offset).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
                }
            `
        });
        
        const sky = new THREE.Mesh(skyGeometry, skyMaterial);
        scene.add(sky);
        
        // Stars
        const starCount = 2000;
        const starPositions = new Float32Array(starCount * 3);
        
        for (let i = 0; i < starCount; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const r = 600 + Math.random() * 150;
            
            starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
            starPositions[i * 3 + 1] = Math.abs(r * Math.sin(phi) * Math.sin(theta)); // Only upper hemisphere
            starPositions[i * 3 + 2] = r * Math.cos(phi);
        }
        
        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 1.5,
            transparent: true,
            opacity: 0.8
        });
        
        const stars = new THREE.Points(starGeometry, starMaterial);
        scene.add(stars);
    }

    function createTerrain() {
        const { segments, size, heightScale } = CONFIG.terrain;
        
        const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
        geometry.rotateX(-Math.PI / 2);
        
        const positions = geometry.attributes.position.array;
        
        // Generate height using simplex-like noise
        for (let i = 0; i < positions.length; i += 3) {
            const x = positions[i];
            const z = positions[i + 2];
            
            // Multi-octave noise for terrain
            let height = 0;
            height += Math.sin(x * 0.01) * Math.cos(z * 0.01) * heightScale;
            height += Math.sin(x * 0.03 + 1) * Math.cos(z * 0.02) * heightScale * 0.5;
            height += Math.sin(x * 0.05) * Math.cos(z * 0.05 + 2) * heightScale * 0.25;
            
            positions[i + 1] = height;
        }
        
        geometry.computeVertexNormals();
        
        // Gradient material based on height
        const material = new THREE.ShaderMaterial({
            uniforms: {
                lowColor: { value: new THREE.Color(0x1a0a2e) },
                midColor: { value: new THREE.Color(0x4ecdc4) },
                highColor: { value: new THREE.Color(0xff6b9d) },
                heightScale: { value: heightScale }
            },
            vertexShader: `
                varying float vHeight;
                varying vec3 vNormal;
                void main() {
                    vHeight = position.y;
                    vNormal = normalize(normalMatrix * normal);
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 lowColor;
                uniform vec3 midColor;
                uniform vec3 highColor;
                uniform float heightScale;
                varying float vHeight;
                varying vec3 vNormal;
                void main() {
                    float h = (vHeight + heightScale) / (heightScale * 2.0);
                    vec3 color;
                    if (h < 0.5) {
                        color = mix(lowColor, midColor, h * 2.0);
                    } else {
                        color = mix(midColor, highColor, (h - 0.5) * 2.0);
                    }
                    // Simple lighting
                    float light = dot(vNormal, normalize(vec3(1.0, 1.0, 0.5))) * 0.5 + 0.5;
                    gl_FragColor = vec4(color * light, 1.0);
                }
            `,
            wireframe: false
        });
        
        terrain = new THREE.Mesh(geometry, material);
        scene.add(terrain);
        
        // Add grid lines for style
        const gridMaterial = new THREE.ShaderMaterial({
            uniforms: {
                color: { value: new THREE.Color(0x4ecdc4) }
            },
            vertexShader: `
                void main() {
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 color;
                void main() {
                    gl_FragColor = vec4(color, 0.3);
                }
            `,
            transparent: true
        });
        
        const gridGeometry = new THREE.WireframeGeometry(geometry);
        const grid = new THREE.LineSegments(gridGeometry, gridMaterial);
        grid.position.y = 0.1;
        scene.add(grid);
    }

    function createAirplane() {
        airplane = new THREE.Group();
        
        // Fuselage (elongated octahedron)
        const fuselageGeometry = new THREE.ConeGeometry(0.5, 4, 8);
        fuselageGeometry.rotateX(Math.PI / 2);
        const fuselageMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x7b68ee,
            emissive: 0x4ecdc4,
            emissiveIntensity: 0.2,
            metalness: 0.8,
            roughness: 0.2
        });
        const fuselage = new THREE.Mesh(fuselageGeometry, fuselageMaterial);
        airplane.add(fuselage);
        
        // Cockpit
        const cockpitGeometry = new THREE.SphereGeometry(0.4, 8, 8);
        cockpitGeometry.scale(1, 0.6, 1);
        const cockpitMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x4ecdc4,
            emissive: 0x4ecdc4,
            emissiveIntensity: 0.5,
            metalness: 0.3,
            roughness: 0.1,
            transparent: true,
            opacity: 0.8
        });
        const cockpit = new THREE.Mesh(cockpitGeometry, cockpitMaterial);
        cockpit.position.set(0, 0.3, 0.5);
        airplane.add(cockpit);
        
        // Wings
        const wingGeometry = new THREE.BoxGeometry(6, 0.1, 1);
        const wingMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xff6b9d,
            emissive: 0xff6b9d,
            emissiveIntensity: 0.1,
            metalness: 0.6,
            roughness: 0.3
        });
        const wings = new THREE.Mesh(wingGeometry, wingMaterial);
        wings.position.set(0, 0, 0);
        airplane.add(wings);
        
        // Tail wings
        const tailWingGeometry = new THREE.BoxGeometry(2, 0.1, 0.5);
        const tailWings = new THREE.Mesh(tailWingGeometry, wingMaterial);
        tailWings.position.set(0, 0, -1.8);
        airplane.add(tailWings);
        
        // Vertical stabilizer
        const stabilizerGeometry = new THREE.BoxGeometry(0.1, 1, 0.8);
        const stabilizer = new THREE.Mesh(stabilizerGeometry, wingMaterial);
        stabilizer.position.set(0, 0.5, -1.8);
        airplane.add(stabilizer);
        
        // Propeller
        propeller = new THREE.Group();
        const bladeGeometry = new THREE.BoxGeometry(0.1, 1.5, 0.2);
        const bladeMaterial = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            emissive: 0x4ecdc4,
            emissiveIntensity: 0.3,
            metalness: 0.9,
            roughness: 0.1
        });
        
        const blade1 = new THREE.Mesh(bladeGeometry, bladeMaterial);
        const blade2 = new THREE.Mesh(bladeGeometry, bladeMaterial);
        blade2.rotation.z = Math.PI / 2;
        
        propeller.add(blade1);
        propeller.add(blade2);
        propeller.position.set(0, 0, 2.1);
        airplane.add(propeller);
        
        // Engine glow
        const engineGlowGeometry = new THREE.SphereGeometry(0.3, 16, 16);
        const engineGlowMaterial = new THREE.MeshBasicMaterial({
            color: 0x4ecdc4,
            transparent: true,
            opacity: 0.6
        });
        const engineGlow = new THREE.Mesh(engineGlowGeometry, engineGlowMaterial);
        engineGlow.position.set(0, 0, 2);
        airplane.add(engineGlow);
        
        // Position airplane
        airplane.position.copy(planePosition);
        scene.add(airplane);
    }

    function createClouds() {
        const cloudCount = 30;
        
        for (let i = 0; i < cloudCount; i++) {
            const cloud = new THREE.Group();
            
            // Each cloud is made of several spheres
            const sphereCount = 3 + Math.floor(Math.random() * 4);
            const cloudMaterial = new THREE.MeshBasicMaterial({
                color: 0x4ecdc4,
                transparent: true,
                opacity: 0.15
            });
            
            for (let j = 0; j < sphereCount; j++) {
                const size = 5 + Math.random() * 10;
                const sphereGeometry = new THREE.SphereGeometry(size, 8, 8);
                const sphere = new THREE.Mesh(sphereGeometry, cloudMaterial);
                sphere.position.set(
                    (Math.random() - 0.5) * 15,
                    (Math.random() - 0.5) * 5,
                    (Math.random() - 0.5) * 15
                );
                cloud.add(sphere);
            }
            
            cloud.position.set(
                (Math.random() - 0.5) * 400,
                40 + Math.random() * 60,
                (Math.random() - 0.5) * 400
            );
            
            clouds.push(cloud);
            scene.add(cloud);
        }
    }

    function createTrailSystem() {
        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(MAX_TRAIL_LENGTH * 3);
        const colors = new Float32Array(MAX_TRAIL_LENGTH * 3);
        
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        
        const material = new THREE.LineBasicMaterial({
            vertexColors: true,
            transparent: true,
            opacity: 0.8
        });
        
        trailParticles = new THREE.Line(geometry, material);
        scene.add(trailParticles);
    }

    function updateTrail() {
        // Add current position to trail
        trailPositions.unshift(airplane.position.clone());
        
        // Limit trail length
        if (trailPositions.length > MAX_TRAIL_LENGTH) {
            trailPositions.pop();
        }
        
        // Update geometry
        const positions = trailParticles.geometry.attributes.position.array;
        const colors = trailParticles.geometry.attributes.color.array;
        
        for (let i = 0; i < MAX_TRAIL_LENGTH; i++) {
            if (i < trailPositions.length) {
                positions[i * 3] = trailPositions[i].x;
                positions[i * 3 + 1] = trailPositions[i].y;
                positions[i * 3 + 2] = trailPositions[i].z;
                
                // Fade from cyan to pink
                const t = i / MAX_TRAIL_LENGTH;
                colors[i * 3] = 0.3 + t * 0.7;     // R
                colors[i * 3 + 1] = 0.8 - t * 0.4; // G
                colors[i * 3 + 2] = 0.8 + t * 0.2; // B
            } else {
                positions[i * 3] = 0;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = 0;
            }
        }
        
        trailParticles.geometry.attributes.position.needsUpdate = true;
        trailParticles.geometry.attributes.color.needsUpdate = true;
        trailParticles.geometry.setDrawRange(0, trailPositions.length);
    }

    function onWindowResize() {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function animate() {
        animationId = requestAnimationFrame(animate);
        
        const time = performance.now() * 0.001;
        const handRotation = HandTracking.getRotation();
        const isHandDetected = HandTracking.isDetected();
        
        // Update hand tracking smoothing
        HandTracking.update();
        
        // Update flight controls
        updateFlightControls(handRotation, isHandDetected);
        
        // Update airplane
        updateAirplane(time);
        
        // Update camera to follow airplane
        updateCamera();
        
        // Update trail
        updateTrail();
        
        // Spin propeller
        if (propeller) {
            propeller.rotation.z += 0.5;
        }
        
        // Animate clouds (slowly drift)
        clouds.forEach((cloud, i) => {
            cloud.position.x += Math.sin(time * 0.1 + i) * 0.02;
            cloud.position.z += 0.05;
            
            // Wrap around
            if (cloud.position.z > 250) {
                cloud.position.z = -250;
                cloud.position.x = (Math.random() - 0.5) * 400;
            }
        });
        
        renderer.render(scene, camera);
    }

    function updateFlightControls(handRotation, isHandDetected) {
        if (isHandDetected && handRotation) {
            // Extract euler angles from hand rotation
            const euler = new THREE.Euler().setFromQuaternion(handRotation, 'YXZ');
            
            // Map hand rotation to plane controls
            // Roll (Z rotation of hand) -> Roll of plane
            targetRoll = -euler.z * CONFIG.airplane.rollSensitivity;
            targetRoll = THREE.MathUtils.clamp(targetRoll, -CONFIG.airplane.maxRoll, CONFIG.airplane.maxRoll);
            
            // Pitch (X rotation of hand) -> Pitch of plane
            targetPitch = euler.x * CONFIG.airplane.pitchSensitivity;
            targetPitch = THREE.MathUtils.clamp(targetPitch, -CONFIG.airplane.maxPitch, CONFIG.airplane.maxPitch);
        } else {
            // Gradually return to level flight
            targetRoll *= 0.95;
            targetPitch *= 0.95;
        }
        
        // Smooth the controls
        currentRoll += (targetRoll - currentRoll) * 0.1;
        currentPitch += (targetPitch - currentPitch) * 0.1;
    }

    function updateAirplane(time) {
        if (!airplane) return;
        
        // Apply rotation
        planeRotation.set(currentPitch, planeRotation.y, currentRoll);
        
        // Turn based on roll (banking turn)
        planeRotation.y -= currentRoll * 0.02;
        
        // Create quaternion from euler
        planeQuaternion.setFromEuler(planeRotation);
        airplane.quaternion.copy(planeQuaternion);
        
        // Calculate forward direction
        const forward = new THREE.Vector3(0, 0, 1);
        forward.applyQuaternion(planeQuaternion);
        
        // Move airplane
        const speed = CONFIG.airplane.speed;
        planePosition.add(forward.multiplyScalar(speed));
        
        // Clamp altitude
        planePosition.y = Math.max(10, Math.min(150, planePosition.y));
        
        airplane.position.copy(planePosition);
        
        // Wrap around terrain
        const terrainSize = CONFIG.terrain.size / 2;
        if (planePosition.x > terrainSize) planePosition.x = -terrainSize;
        if (planePosition.x < -terrainSize) planePosition.x = terrainSize;
        if (planePosition.z > terrainSize) planePosition.z = -terrainSize;
        if (planePosition.z < -terrainSize) planePosition.z = terrainSize;
    }

    function updateCamera() {
        if (!airplane || !camera) return;
        
        // Camera follows behind and above the airplane
        const cameraOffset = new THREE.Vector3(0, CONFIG.camera.followHeight, -CONFIG.camera.followDistance);
        cameraOffset.applyQuaternion(planeQuaternion);
        
        const targetCameraPos = planePosition.clone().add(cameraOffset);
        
        // Smooth camera movement
        camera.position.lerp(targetCameraPos, 0.05);
        
        // Look at airplane
        const lookAtPos = planePosition.clone();
        lookAtPos.y += 2;
        camera.lookAt(lookAtPos);
    }

    // Public API
    return {
        init: init,
        destroy: destroy,
        name: 'Flight Control',
        description: 'Pilot an airplane with hand gestures'
    };
})();

window.AirplaneDemo = AirplaneDemo;

