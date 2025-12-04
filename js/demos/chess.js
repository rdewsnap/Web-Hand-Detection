/**
 * Chess Demo
 * Play chess against an elf opponent using hand gestures
 */

const ChessDemo = (function() {
    // Configuration
    const CONFIG = {
        board: {
            size: 8,
            squareSize: 1,
            height: 0.1
        },
        camera: {
            fov: 50,
            position: { x: 0, y: 8, z: 6 },
            lookAt: { x: 0, y: 0, z: 0 }
        },
        hand: {
            scale: 0.15,
            heightOffset: 2
        }
    };

    // State
    let scene, camera, renderer;
    let animationId = null;
    let container = null;
    
    // Chess state
    let chess = null;
    let difficulty = 3;
    let gameStarted = false;
    let playerColor = 'w';
    let isThinking = false;
    
    // 3D Objects
    let boardGroup = null;
    let piecesGroup = null;
    let pieces = {};
    let handModel = null;
    let elfModel = null;
    
    // Interaction state
    let selectedPiece = null;
    let selectedSquare = null;
    let hoveredSquare = null;
    let grabbedPiece = null;
    let originalPiecePosition = null;
    let lastGrabState = false;
    
    // UI elements
    let difficultyPanel = null;
    let statusText = null;

    // Piece geometries (cached)
    const pieceGeometries = {};

    // Chess.js API compatibility helpers (0.12.x uses snake_case, newer uses camelCase)
    function isGameOver() {
        return chess.game_over ? chess.game_over() : chess.isGameOver();
    }
    function isCheckmate() {
        return chess.in_checkmate ? chess.in_checkmate() : chess.isCheckmate();
    }
    function isDraw() {
        return chess.in_draw ? chess.in_draw() : chess.isDraw();
    }
    function isCheck() {
        return chess.in_check ? chess.in_check() : chess.isCheck();
    }

    /**
     * Initialize the demo
     */
    function init(containerElement) {
        container = containerElement;
        
        // Initialize chess engine
        chess = new Chess();
        
        // Scene
        scene = new THREE.Scene();
        scene.background = new THREE.Color(0x0d0518);
        scene.fog = new THREE.FogExp2(0x0d0518, 0.02);
        
        // Camera
        camera = new THREE.PerspectiveCamera(
            CONFIG.camera.fov,
            window.innerWidth / window.innerHeight,
            0.1,
            1000
        );
        camera.position.set(
            CONFIG.camera.position.x,
            CONFIG.camera.position.y,
            CONFIG.camera.position.z
        );
        camera.lookAt(CONFIG.camera.lookAt.x, CONFIG.camera.lookAt.y, CONFIG.camera.lookAt.z);
        
        // Renderer
        renderer = new THREE.WebGLRenderer({
            antialias: !HandTracking.isMobile(),
            alpha: true
        });
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.shadowMap.enabled = true;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        container.appendChild(renderer.domElement);
        
        // Create scene elements
        createLighting();
        createEnvironment();
        createChessBoard();
        createAllPieces();
        createHandModel();
        createElfOpponent();
        createUI();
        
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
        
        // Remove UI
        if (difficultyPanel && difficultyPanel.parentNode) {
            difficultyPanel.parentNode.removeChild(difficultyPanel);
        }
        if (statusText && statusText.parentNode) {
            statusText.parentNode.removeChild(statusText);
        }
        
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
        
        // Reset state
        scene = null;
        camera = null;
        renderer = null;
        chess = null;
        gameStarted = false;
        pieces = {};
        selectedPiece = null;
        grabbedPiece = null;
        difficultyPanel = null;
        statusText = null;
    }

    function createLighting() {
        // Ambient light
        const ambient = new THREE.AmbientLight(0x404040, 0.5);
        scene.add(ambient);
        
        // Main light (sun-like)
        const mainLight = new THREE.DirectionalLight(0xffffff, 1);
        mainLight.position.set(5, 10, 5);
        mainLight.castShadow = true;
        mainLight.shadow.mapSize.width = 2048;
        mainLight.shadow.mapSize.height = 2048;
        mainLight.shadow.camera.near = 0.5;
        mainLight.shadow.camera.far = 50;
        mainLight.shadow.camera.left = -10;
        mainLight.shadow.camera.right = 10;
        mainLight.shadow.camera.top = 10;
        mainLight.shadow.camera.bottom = -10;
        scene.add(mainLight);
        
        // Accent lights
        const cyanLight = new THREE.PointLight(0x4ecdc4, 0.5, 20);
        cyanLight.position.set(-5, 5, -5);
        scene.add(cyanLight);
        
        const pinkLight = new THREE.PointLight(0xff6b9d, 0.5, 20);
        pinkLight.position.set(5, 5, -5);
        scene.add(pinkLight);
    }

    function createEnvironment() {
        // Floor/table
        const floorGeometry = new THREE.PlaneGeometry(30, 30);
        const floorMaterial = new THREE.MeshStandardMaterial({
            color: 0x1a0a2e,
            roughness: 0.8,
            metalness: 0.2
        });
        const floor = new THREE.Mesh(floorGeometry, floorMaterial);
        floor.rotation.x = -Math.PI / 2;
        floor.position.y = -0.5;
        floor.receiveShadow = true;
        scene.add(floor);
        
        // Starfield background
        const starCount = 500;
        const starPositions = new Float32Array(starCount * 3);
        for (let i = 0; i < starCount; i++) {
            starPositions[i * 3] = (Math.random() - 0.5) * 100;
            starPositions[i * 3 + 1] = Math.random() * 50 + 5;
            starPositions[i * 3 + 2] = (Math.random() - 0.5) * 100 - 20;
        }
        const starGeometry = new THREE.BufferGeometry();
        starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
        const starMaterial = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 0.1,
            transparent: true,
            opacity: 0.8
        });
        const stars = new THREE.Points(starGeometry, starMaterial);
        scene.add(stars);
    }

    function createChessBoard() {
        boardGroup = new THREE.Group();
        
        const { size, squareSize, height } = CONFIG.board;
        const boardSize = size * squareSize;
        const offset = boardSize / 2 - squareSize / 2;
        
        // Board base
        const baseGeometry = new THREE.BoxGeometry(boardSize + 0.5, height * 2, boardSize + 0.5);
        const baseMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d1f3d,
            roughness: 0.3,
            metalness: 0.5
        });
        const base = new THREE.Mesh(baseGeometry, baseMaterial);
        base.position.y = -height;
        base.receiveShadow = true;
        boardGroup.add(base);
        
        // Create squares
        for (let row = 0; row < size; row++) {
            for (let col = 0; col < size; col++) {
                const isWhite = (row + col) % 2 === 0;
                const squareGeometry = new THREE.BoxGeometry(squareSize * 0.95, height, squareSize * 0.95);
                const squareMaterial = new THREE.MeshStandardMaterial({
                    color: isWhite ? 0xe8e0d5 : 0x4a3b5c,
                    roughness: 0.4,
                    metalness: 0.1,
                    emissive: 0x000000,
                    emissiveIntensity: 0
                });
                
                const square = new THREE.Mesh(squareGeometry, squareMaterial);
                square.position.set(
                    col * squareSize - offset,
                    0,
                    row * squareSize - offset
                );
                square.receiveShadow = true;
                square.userData = {
                    row: row,
                    col: col,
                    algebraic: String.fromCharCode(97 + col) + (8 - row)
                };
                boardGroup.add(square);
            }
        }
        
        // Board edge glow
        const edgeGeometry = new THREE.BoxGeometry(boardSize + 0.6, height * 0.5, boardSize + 0.6);
        const edgeMaterial = new THREE.MeshBasicMaterial({
            color: 0x4ecdc4,
            transparent: true,
            opacity: 0.3
        });
        const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
        edge.position.y = -height * 1.5;
        boardGroup.add(edge);
        
        scene.add(boardGroup);
    }

    function createPieceGeometry(type) {
        if (pieceGeometries[type]) return pieceGeometries[type];
        
        let geometry;
        
        switch (type) {
            case 'p': // Pawn
                geometry = new THREE.Group();
                const pawnBase = new THREE.CylinderGeometry(0.25, 0.3, 0.2, 8);
                const pawnBody = new THREE.CylinderGeometry(0.15, 0.25, 0.4, 8);
                const pawnHead = new THREE.SphereGeometry(0.15, 8, 8);
                geometry = mergeGeometries([
                    { geo: pawnBase, y: 0.1 },
                    { geo: pawnBody, y: 0.4 },
                    { geo: pawnHead, y: 0.7 }
                ]);
                break;
                
            case 'r': // Rook
                geometry = mergeGeometries([
                    { geo: new THREE.CylinderGeometry(0.3, 0.35, 0.2, 8), y: 0.1 },
                    { geo: new THREE.CylinderGeometry(0.25, 0.3, 0.5, 8), y: 0.45 },
                    { geo: new THREE.CylinderGeometry(0.3, 0.25, 0.2, 8), y: 0.8 },
                    { geo: new THREE.BoxGeometry(0.15, 0.15, 0.15), y: 0.95, x: 0.15 },
                    { geo: new THREE.BoxGeometry(0.15, 0.15, 0.15), y: 0.95, x: -0.15 }
                ]);
                break;
                
            case 'n': // Knight
                geometry = mergeGeometries([
                    { geo: new THREE.CylinderGeometry(0.3, 0.35, 0.2, 8), y: 0.1 },
                    { geo: new THREE.CylinderGeometry(0.2, 0.3, 0.3, 8), y: 0.35 },
                    { geo: new THREE.BoxGeometry(0.2, 0.5, 0.35), y: 0.7 },
                    { geo: new THREE.BoxGeometry(0.15, 0.2, 0.25), y: 0.9, z: 0.15 }
                ]);
                break;
                
            case 'b': // Bishop
                geometry = mergeGeometries([
                    { geo: new THREE.CylinderGeometry(0.3, 0.35, 0.2, 8), y: 0.1 },
                    { geo: new THREE.CylinderGeometry(0.15, 0.3, 0.5, 8), y: 0.45 },
                    { geo: new THREE.SphereGeometry(0.18, 8, 8), y: 0.8 },
                    { geo: new THREE.ConeGeometry(0.08, 0.2, 8), y: 1.0 }
                ]);
                break;
                
            case 'q': // Queen
                geometry = mergeGeometries([
                    { geo: new THREE.CylinderGeometry(0.32, 0.38, 0.2, 8), y: 0.1 },
                    { geo: new THREE.CylinderGeometry(0.2, 0.32, 0.6, 8), y: 0.5 },
                    { geo: new THREE.SphereGeometry(0.22, 8, 8), y: 0.9 },
                    { geo: new THREE.SphereGeometry(0.1, 8, 8), y: 1.15 }
                ]);
                break;
                
            case 'k': // King
                geometry = mergeGeometries([
                    { geo: new THREE.CylinderGeometry(0.32, 0.38, 0.2, 8), y: 0.1 },
                    { geo: new THREE.CylinderGeometry(0.22, 0.32, 0.6, 8), y: 0.5 },
                    { geo: new THREE.CylinderGeometry(0.25, 0.22, 0.2, 8), y: 0.9 },
                    { geo: new THREE.BoxGeometry(0.08, 0.3, 0.08), y: 1.15 },
                    { geo: new THREE.BoxGeometry(0.2, 0.08, 0.08), y: 1.2 }
                ]);
                break;
                
            default:
                geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
        }
        
        pieceGeometries[type] = geometry;
        return geometry;
    }

    function mergeGeometries(parts) {
        const group = new THREE.Group();
        parts.forEach(part => {
            const mesh = new THREE.Mesh(part.geo);
            mesh.position.set(part.x || 0, part.y || 0, part.z || 0);
            mesh.updateMatrix();
            group.add(mesh);
        });
        return group;
    }

    function createPieceMesh(type, color) {
        const isWhite = color === 'w';
        const material = new THREE.MeshStandardMaterial({
            color: isWhite ? 0xf0e6d3 : 0x2d1f3d,
            roughness: 0.3,
            metalness: 0.4,
            emissive: isWhite ? 0x4ecdc4 : 0xff6b9d,
            emissiveIntensity: 0.1
        });
        
        const geometryData = createPieceGeometry(type);
        const piece = new THREE.Group();
        
        if (geometryData instanceof THREE.Group) {
            geometryData.children.forEach(child => {
                const mesh = new THREE.Mesh(child.geometry.clone(), material.clone());
                mesh.position.copy(child.position);
                mesh.castShadow = true;
                piece.add(mesh);
            });
        } else {
            const mesh = new THREE.Mesh(geometryData, material);
            mesh.castShadow = true;
            piece.add(mesh);
        }
        
        return piece;
    }

    function createAllPieces() {
        piecesGroup = new THREE.Group();
        pieces = {};
        
        const board = chess.board();
        const { squareSize } = CONFIG.board;
        const offset = (CONFIG.board.size * squareSize) / 2 - squareSize / 2;
        
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = board[row][col];
                if (square) {
                    const piece = createPieceMesh(square.type, square.color);
                    const algebraic = String.fromCharCode(97 + col) + (8 - row);
                    
                    piece.position.set(
                        col * squareSize - offset,
                        CONFIG.board.height,
                        row * squareSize - offset
                    );
                    piece.userData = {
                        type: square.type,
                        color: square.color,
                        square: algebraic
                    };
                    
                    pieces[algebraic] = piece;
                    piecesGroup.add(piece);
                }
            }
        }
        
        scene.add(piecesGroup);
    }

    function createHandModel() {
        handModel = new THREE.Group();
        
        // Simplified hand with glowing material
        const handMaterial = new THREE.MeshStandardMaterial({
            color: 0x4ecdc4,
            emissive: 0x4ecdc4,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8,
            roughness: 0.3,
            metalness: 0.5
        });
        
        // Palm
        const palmGeometry = new THREE.BoxGeometry(0.8, 0.15, 1);
        const palm = new THREE.Mesh(palmGeometry, handMaterial);
        handModel.add(palm);
        
        // Fingers
        const fingerPositions = [
            { x: -0.3, z: 0.6, length: 0.6 },  // Index
            { x: -0.1, z: 0.65, length: 0.7 }, // Middle
            { x: 0.1, z: 0.6, length: 0.65 },  // Ring
            { x: 0.3, z: 0.5, length: 0.5 }    // Pinky
        ];
        
        fingerPositions.forEach(pos => {
            const fingerGeometry = new THREE.CylinderGeometry(0.06, 0.07, pos.length, 8);
            const finger = new THREE.Mesh(fingerGeometry, handMaterial.clone());
            finger.position.set(pos.x, 0, pos.z + pos.length / 2);
            finger.rotation.x = Math.PI / 2;
            handModel.add(finger);
        });
        
        // Thumb
        const thumbGeometry = new THREE.CylinderGeometry(0.07, 0.08, 0.5, 8);
        const thumb = new THREE.Mesh(thumbGeometry, handMaterial.clone());
        thumb.position.set(-0.5, 0, 0.2);
        thumb.rotation.z = Math.PI / 4;
        thumb.rotation.x = Math.PI / 2;
        handModel.add(thumb);
        
        handModel.scale.set(CONFIG.hand.scale * 8, CONFIG.hand.scale * 8, CONFIG.hand.scale * 8);
        handModel.visible = false;
        scene.add(handModel);
    }

    function createElfOpponent() {
        elfModel = new THREE.Group();
        
        // Materials
        const skinMaterial = new THREE.MeshStandardMaterial({
            color: 0xf5d0c5,
            roughness: 0.7,
            metalness: 0.1
        });
        
        const tunicMaterial = new THREE.MeshStandardMaterial({
            color: 0x2d8a4e,
            roughness: 0.6,
            metalness: 0.1
        });
        
        const hairMaterial = new THREE.MeshStandardMaterial({
            color: 0xf4d03f,
            roughness: 0.8,
            metalness: 0.1
        });
        
        // Body (torso)
        const torsoGeometry = new THREE.BoxGeometry(0.8, 1.2, 0.5);
        const torso = new THREE.Mesh(torsoGeometry, tunicMaterial);
        torso.position.y = 0.6;
        elfModel.add(torso);
        
        // Head
        const headGeometry = new THREE.BoxGeometry(0.5, 0.6, 0.5);
        const head = new THREE.Mesh(headGeometry, skinMaterial);
        head.position.y = 1.5;
        elfModel.add(head);
        
        // Pointy ears
        const earGeometry = new THREE.ConeGeometry(0.1, 0.3, 4);
        const leftEar = new THREE.Mesh(earGeometry, skinMaterial);
        leftEar.position.set(-0.35, 1.5, 0);
        leftEar.rotation.z = Math.PI / 2;
        elfModel.add(leftEar);
        
        const rightEar = new THREE.Mesh(earGeometry, skinMaterial);
        rightEar.position.set(0.35, 1.5, 0);
        rightEar.rotation.z = -Math.PI / 2;
        elfModel.add(rightEar);
        
        // Hair
        const hairGeometry = new THREE.BoxGeometry(0.55, 0.3, 0.55);
        const hair = new THREE.Mesh(hairGeometry, hairMaterial);
        hair.position.y = 1.85;
        elfModel.add(hair);
        
        // Hair bangs
        const bangsGeometry = new THREE.BoxGeometry(0.5, 0.15, 0.1);
        const bangs = new THREE.Mesh(bangsGeometry, hairMaterial);
        bangs.position.set(0, 1.7, 0.28);
        elfModel.add(bangs);
        
        // Eyes (simple black dots)
        const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x2d1f3d });
        const eyeGeometry = new THREE.SphereGeometry(0.05, 8, 8);
        
        const leftEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        leftEye.position.set(-0.12, 1.55, 0.26);
        elfModel.add(leftEye);
        
        const rightEye = new THREE.Mesh(eyeGeometry, eyeMaterial);
        rightEye.position.set(0.12, 1.55, 0.26);
        elfModel.add(rightEye);
        
        // Arms
        const armGeometry = new THREE.BoxGeometry(0.2, 0.8, 0.2);
        
        const leftArm = new THREE.Mesh(armGeometry, tunicMaterial);
        leftArm.position.set(-0.5, 0.4, 0);
        elfModel.add(leftArm);
        
        const rightArm = new THREE.Mesh(armGeometry, tunicMaterial);
        rightArm.position.set(0.5, 0.4, 0);
        elfModel.add(rightArm);
        
        // Hands
        const handGeometry = new THREE.BoxGeometry(0.15, 0.2, 0.15);
        
        const leftHand = new THREE.Mesh(handGeometry, skinMaterial);
        leftHand.position.set(-0.5, -0.1, 0);
        elfModel.add(leftHand);
        
        const rightHand = new THREE.Mesh(handGeometry, skinMaterial);
        rightHand.position.set(0.5, -0.1, 0);
        elfModel.add(rightHand);
        
        // Position elf across the board
        elfModel.position.set(0, -0.5, -6);
        elfModel.rotation.y = Math.PI;
        
        // Add shadow casting
        elfModel.traverse(child => {
            if (child.isMesh) {
                child.castShadow = true;
            }
        });
        
        scene.add(elfModel);
    }

    function createUI() {
        // Difficulty selector panel
        difficultyPanel = document.createElement('div');
        difficultyPanel.id = 'chess-difficulty-panel';
        difficultyPanel.innerHTML = `
            <h2>Hand Chess</h2>
            <p>Play against the Elf</p>
            <div class="difficulty-selector">
                <label>Difficulty: <span id="difficulty-value">3</span></label>
                <input type="range" id="difficulty-slider" min="1" max="10" value="3">
            </div>
            <button id="start-chess-btn">Start Game</button>
        `;
        document.body.appendChild(difficultyPanel);
        
        // Event listeners
        const slider = document.getElementById('difficulty-slider');
        const valueDisplay = document.getElementById('difficulty-value');
        slider.addEventListener('input', (e) => {
            difficulty = parseInt(e.target.value);
            valueDisplay.textContent = difficulty;
        });
        
        document.getElementById('start-chess-btn').addEventListener('click', () => {
            startGame();
        });
        
        // Status text
        statusText = document.createElement('div');
        statusText.id = 'chess-status';
        statusText.textContent = 'Your turn (White)';
        statusText.style.display = 'none';
        document.body.appendChild(statusText);
    }

    function startGame() {
        gameStarted = true;
        difficultyPanel.style.display = 'none';
        statusText.style.display = 'block';
        updateStatus();
    }

    function updateStatus() {
        if (!statusText) return;
        
        if (isCheckmate()) {
            const winner = chess.turn() === 'w' ? 'Elf' : 'You';
            statusText.textContent = `Checkmate! ${winner} wins!`;
            statusText.classList.add('game-over');
        } else if (isDraw()) {
            statusText.textContent = 'Draw!';
            statusText.classList.add('game-over');
        } else if (isCheck()) {
            statusText.textContent = chess.turn() === 'w' ? 'Check! Your turn' : 'Elf is thinking...';
        } else if (isThinking) {
            statusText.textContent = 'Elf is thinking...';
        } else {
            statusText.textContent = chess.turn() === 'w' ? 'Your turn (White)' : 'Elf is thinking...';
        }
    }

    function onWindowResize() {
        if (!camera || !renderer) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function squareToPosition(square) {
        const col = square.charCodeAt(0) - 97;
        const row = 8 - parseInt(square[1]);
        const { squareSize } = CONFIG.board;
        const offset = (CONFIG.board.size * squareSize) / 2 - squareSize / 2;
        
        return new THREE.Vector3(
            col * squareSize - offset,
            CONFIG.board.height,
            row * squareSize - offset
        );
    }

    function positionToSquare(position) {
        const { squareSize } = CONFIG.board;
        const offset = (CONFIG.board.size * squareSize) / 2 - squareSize / 2;
        
        const col = Math.round((position.x + offset) / squareSize);
        const row = Math.round((position.z + offset) / squareSize);
        
        if (col >= 0 && col < 8 && row >= 0 && row < 8) {
            return String.fromCharCode(97 + col) + (8 - row);
        }
        return null;
    }

    function highlightSquare(square, color) {
        if (!boardGroup) return;
        
        boardGroup.children.forEach(child => {
            if (child.userData && child.userData.algebraic === square) {
                child.material.emissive.setHex(color);
                child.material.emissiveIntensity = 0.5;
            }
        });
    }

    function clearHighlights() {
        if (!boardGroup) return;
        
        boardGroup.children.forEach(child => {
            if (child.userData && child.userData.algebraic) {
                child.material.emissive.setHex(0x000000);
                child.material.emissiveIntensity = 0;
            }
        });
    }

    function updatePiecePositions() {
        const board = chess.board();
        const { squareSize } = CONFIG.board;
        const offset = (CONFIG.board.size * squareSize) / 2 - squareSize / 2;
        
        // Clear old pieces
        Object.keys(pieces).forEach(square => {
            if (pieces[square] && pieces[square].parent) {
                piecesGroup.remove(pieces[square]);
            }
        });
        pieces = {};
        
        // Create new pieces
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = board[row][col];
                if (square) {
                    const piece = createPieceMesh(square.type, square.color);
                    const algebraic = String.fromCharCode(97 + col) + (8 - row);
                    
                    piece.position.set(
                        col * squareSize - offset,
                        CONFIG.board.height,
                        row * squareSize - offset
                    );
                    piece.userData = {
                        type: square.type,
                        color: square.color,
                        square: algebraic
                    };
                    
                    pieces[algebraic] = piece;
                    piecesGroup.add(piece);
                }
            }
        }
    }

    function makeAIMove() {
        if (isGameOver()) return;
        
        isThinking = true;
        updateStatus();
        
        // Animate elf "thinking"
        if (elfModel) {
            elfModel.userData.thinking = true;
        }
        
        // Use setTimeout to not block UI
        setTimeout(() => {
            const depth = Math.ceil(difficulty / 2); // Depth 1-5 based on difficulty 1-10
            const move = getBestMove(depth);
            
            if (move) {
                chess.move(move);
                updatePiecePositions();
            }
            
            isThinking = false;
            if (elfModel) {
                elfModel.userData.thinking = false;
            }
            updateStatus();
        }, 500 + Math.random() * 500);
    }

    function getBestMove(depth) {
        const moves = chess.moves();
        if (moves.length === 0) return null;
        
        let bestMove = null;
        let bestValue = -Infinity;
        
        for (const move of moves) {
            chess.move(move);
            const value = -negamax(depth - 1, -Infinity, Infinity, -1);
            chess.undo();
            
            if (value > bestValue) {
                bestValue = value;
                bestMove = move;
            }
        }
        
        return bestMove;
    }

    function negamax(depth, alpha, beta, color) {
        if (depth === 0 || isGameOver()) {
            return color * evaluateBoard();
        }
        
        const moves = chess.moves();
        let maxValue = -Infinity;
        
        for (const move of moves) {
            chess.move(move);
            const value = -negamax(depth - 1, -beta, -alpha, -color);
            chess.undo();
            
            maxValue = Math.max(maxValue, value);
            alpha = Math.max(alpha, value);
            
            if (alpha >= beta) break;
        }
        
        return maxValue;
    }

    function evaluateBoard() {
        const pieceValues = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
        let score = 0;
        
        const board = chess.board();
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const piece = board[row][col];
                if (piece) {
                    const value = pieceValues[piece.type];
                    score += piece.color === 'w' ? value : -value;
                }
            }
        }
        
        // Bonus for check
        if (isCheck()) {
            score += chess.turn() === 'w' ? -0.5 : 0.5;
        }
        
        return score;
    }

    function animate() {
        animationId = requestAnimationFrame(animate);
        
        const time = performance.now() * 0.001;
        
        // Update hand tracking
        HandTracking.update();
        
        // Update hand model position
        updateHandModel(time);
        
        // Handle piece interaction
        if (gameStarted && chess.turn() === 'w' && !isThinking) {
            handleInteraction();
        }
        
        // Animate elf
        animateElf(time);
        
        renderer.render(scene, camera);
    }

    function updateHandModel(time) {
        const landmarks = HandTracking.getLandmarks();
        const isDetected = HandTracking.isDetected();
        
        if (isDetected && landmarks && handModel) {
            handModel.visible = true;
            
            // Map hand position to 3D space
            // Use wrist position as base
            const wrist = landmarks[0];
            const middleFinger = landmarks[9];
            
            // Flip X because webcam is mirrored
            const x = -(wrist.x - 0.5) * 10;
            const z = (wrist.y - 0.3) * 8;
            const y = CONFIG.hand.heightOffset + (wrist.z || 0) * -5;
            
            handModel.position.set(x, Math.max(0.5, y), z);
            
            // Calculate hand rotation (flip for mirrored webcam)
            const dx = middleFinger.x - wrist.x;
            const dy = middleFinger.y - wrist.y;
            const angle = Math.atan2(dx, dy);
            handModel.rotation.y = -angle; // Negative for mirrored view
            
            // Mirror hand based on which hand is detected
            // MediaPipe 'Right' in mirrored view = user's right hand
            const handedness = HandTracking.getHandedness();
            const isRightHand = handedness === 'Right';
            
            // Scale based on openness (grabbing animation)
            const openness = HandTracking.getOpenness();
            const grabScale = 1 - openness * 0.3;
            
            // Mirror X scale for left hand (thumb on correct side)
            const xScale = isRightHand ? 1 : -1;
            handModel.scale.set(
                CONFIG.hand.scale * 8 * grabScale * xScale,
                CONFIG.hand.scale * 8,
                CONFIG.hand.scale * 8 * grabScale
            );
        } else if (handModel) {
            handModel.visible = false;
        }
    }

    function handleInteraction() {
        const openness = HandTracking.getOpenness();
        const isGrabbing = openness < 0.45; // Pinch or fist (~25% open with headroom)
        const landmarks = HandTracking.getLandmarks();
        
        if (!landmarks || !handModel.visible) {
            // Don't drop on hand lost - wait for explicit release
            return;
        }
        
        // Get hand position in world space
        const handPos = handModel.position.clone();
        handPos.y = CONFIG.board.height + 0.5;
        
        // Find which square the hand is over
        const currentSquare = positionToSquare(handPos);
        
        // Clear previous highlights
        clearHighlights();
        
        if (currentSquare) {
            // Highlight hovered square
            highlightSquare(currentSquare, 0x4ecdc4);
            
            // Show valid moves if hovering own piece
            if (!grabbedPiece && pieces[currentSquare]) {
                const piece = pieces[currentSquare];
                if (piece.userData.color === 'w') {
                    const moves = chess.moves({ square: currentSquare, verbose: true });
                    moves.forEach(move => {
                        highlightSquare(move.to, 0x2d8a4e);
                    });
                }
            }
        }
        
        // Handle grab/drop
        if (isGrabbing && !lastGrabState) {
            // Just started grabbing
            if (currentSquare && pieces[currentSquare]) {
                const piece = pieces[currentSquare];
                if (piece.userData.color === 'w') {
                    grabPiece(currentSquare);
                }
            }
        } else if (!isGrabbing && lastGrabState) {
            // Just released
            if (grabbedPiece) {
                dropPiece(currentSquare);
            }
        }
        
        // Move grabbed piece with hand
        if (grabbedPiece) {
            grabbedPiece.position.x = handPos.x;
            grabbedPiece.position.z = handPos.z;
            grabbedPiece.position.y = CONFIG.board.height + 1;
        }
        
        lastGrabState = isGrabbing;
    }

    function grabPiece(square) {
        if (pieces[square]) {
            grabbedPiece = pieces[square];
            selectedSquare = square;
            originalPiecePosition = grabbedPiece.position.clone();
            
            // Highlight valid moves
            const moves = chess.moves({ square: square, verbose: true });
            moves.forEach(move => {
                highlightSquare(move.to, 0x2d8a4e);
            });
        }
    }

    function dropPiece(targetSquare) {
        if (!grabbedPiece || !selectedSquare) return;
        
        let moveSuccessful = false;
        
        // Only try to make move if we have a valid target square
        if (targetSquare) {
            const move = chess.move({
                from: selectedSquare,
                to: targetSquare,
                promotion: 'q' // Auto-promote to queen
            });
            
            if (move) {
                moveSuccessful = true;
                updatePiecePositions();
                updateStatus();
                
                // AI's turn
                if (!isGameOver() && chess.turn() === 'b') {
                    setTimeout(makeAIMove, 300);
                }
            }
        }
        
        if (!moveSuccessful) {
            // Invalid move or no target - return piece
            grabbedPiece.position.copy(originalPiecePosition);
        }
        
        grabbedPiece = null;
        selectedSquare = null;
        originalPiecePosition = null;
        clearHighlights();
    }

    function animateElf(time) {
        if (!elfModel) return;
        
        // Idle breathing animation
        const breathe = Math.sin(time * 2) * 0.02;
        elfModel.position.y = -0.5 + breathe;
        
        // Look at the board
        const lookAngle = Math.sin(time * 0.5) * 0.1;
        elfModel.rotation.y = Math.PI + lookAngle;
        
        // Thinking animation
        if (elfModel.userData.thinking) {
            elfModel.children.forEach((child, i) => {
                if (i === 1) { // Head
                    child.rotation.z = Math.sin(time * 3) * 0.1;
                }
            });
        }
    }

    // Public API
    return {
        init: init,
        destroy: destroy,
        name: 'Hand Chess',
        description: 'Play chess against an elf using hand gestures'
    };
})();

window.ChessDemo = ChessDemo;

