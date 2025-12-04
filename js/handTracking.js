/**
 * Shared Hand Tracking Module
 * Provides hand detection, openness calculation, and rotation tracking
 * for all demos in the application.
 */

// Detect mobile for performance adjustments
const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

// Hand tracking state
let _handOpenness = 0;
let _targetHandOpenness = 0;
let _smoothedOpenness = 0;
let _isHandDetected = false;
let _handedness = 'Right'; // 'Left' or 'Right' (from camera's perspective)
let _handRotation = null;
let _targetHandRotation = null;
let _smoothedHandRotation = null;
let _landmarks = null;

// Configuration
const SMOOTHING = 0.12;

// Preview settings
let _showCameraFeed = false; // Default to showing only hand rig

// Callbacks for demos
let _onHandUpdate = null;
let _onHandLost = null;

// DOM elements
let _webcamVideo = null;
let _previewCanvas = null;
let _previewCtx = null;

// Initialize Three.js quaternions (called after THREE is available)
function initQuaternions() {
    if (typeof THREE !== 'undefined') {
        _handRotation = new THREE.Quaternion();
        _targetHandRotation = new THREE.Quaternion();
        _smoothedHandRotation = new THREE.Quaternion();
    }
}

/**
 * Initialize the hand tracking system
 * @param {HTMLVideoElement} videoElement - Video element for webcam
 * @param {HTMLCanvasElement} previewCanvasElement - Canvas for preview
 * @returns {Promise} Resolves when hand tracking is ready
 */
async function initHandTracking(videoElement, previewCanvasElement) {
    _webcamVideo = videoElement;
    _previewCanvas = previewCanvasElement;
    _previewCtx = _previewCanvas.getContext('2d');
    
    initQuaternions();
    
    // Request camera permission
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: 'user',
                width: { ideal: 640 },
                height: { ideal: 480 }
            }
        });
        
        _webcamVideo.srcObject = stream;
        await _webcamVideo.play();
        
        // Setup preview canvas (4:3 to match MediaPipe processing)
        _previewCanvas.width = 160;
        _previewCanvas.height = 120;
        
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
    const camera = new Camera(_webcamVideo, {
        onFrame: async () => {
            await hands.send({ image: _webcamVideo });
        },
        width: 640,
        height: 480
    });
    
    await camera.start();
}

/**
 * Process hand detection results
 */
function onHandResults(results) {
    // Draw preview
    _previewCtx.save();
    _previewCtx.clearRect(0, 0, _previewCanvas.width, _previewCanvas.height);
    
    // Only draw camera feed if enabled
    if (_showCameraFeed) {
        _previewCtx.drawImage(results.image, 0, 0, _previewCanvas.width, _previewCanvas.height);
    } else {
        // Dark background for hand rig only mode
        _previewCtx.fillStyle = 'rgba(13, 5, 24, 0.95)';
        _previewCtx.fillRect(0, 0, _previewCanvas.width, _previewCanvas.height);
    }
    
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        _isHandDetected = true;
        _landmarks = results.multiHandLandmarks[0];
        
        // Get handedness (Left/Right from camera's perspective)
        if (results.multiHandedness && results.multiHandedness.length > 0) {
            _handedness = results.multiHandedness[0].label; // 'Left' or 'Right'
        }
        
        // Draw hand landmarks on preview
        drawHandLandmarks(_landmarks);
        
        // Calculate hand openness
        _targetHandOpenness = calculateHandOpenness(_landmarks);
        
        // Calculate hand rotation (pitch, roll, yaw)
        _targetHandRotation = calculateHandRotation(_landmarks);
        
        // Notify callback
        if (_onHandUpdate) {
            _onHandUpdate({
                openness: _handOpenness,
                rotation: _handRotation,
                landmarks: _landmarks
            });
        }
    } else {
        _isHandDetected = false;
        _landmarks = null;
        _targetHandOpenness = 0;
        
        if (_onHandLost) {
            _onHandLost();
        }
    }
    
    _previewCtx.restore();
}

/**
 * Draw hand landmarks on preview canvas
 */
function drawHandLandmarks(landmarks) {
    _previewCtx.fillStyle = '#4ecdc4';
    _previewCtx.strokeStyle = '#ff6b9d';
    _previewCtx.lineWidth = 1;
    
    // Draw connections
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],       // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8],       // Index
        [0, 9], [9, 10], [10, 11], [11, 12],  // Middle
        [0, 13], [13, 14], [14, 15], [15, 16], // Ring
        [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
        [5, 9], [9, 13], [13, 17]              // Palm
    ];
    
    _previewCtx.beginPath();
    for (const [start, end] of connections) {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        _previewCtx.moveTo(startPoint.x * _previewCanvas.width, startPoint.y * _previewCanvas.height);
        _previewCtx.lineTo(endPoint.x * _previewCanvas.width, endPoint.y * _previewCanvas.height);
    }
    _previewCtx.stroke();
    
    // Draw landmarks
    for (const landmark of landmarks) {
        _previewCtx.beginPath();
        _previewCtx.arc(
            landmark.x * _previewCanvas.width,
            landmark.y * _previewCanvas.height,
            2, 0, Math.PI * 2
        );
        _previewCtx.fill();
    }
}

/**
 * Calculate hand openness (0 = closed fist, 1 = fully open)
 */
function calculateHandOpenness(landmarks) {
    const wrist = landmarks[0];
    const middleMCP = landmarks[9];
    
    // Calculate hand size reference (wrist to middle MCP)
    const refDx = middleMCP.x - wrist.x;
    const refDy = middleMCP.y - wrist.y;
    const refDz = (middleMCP.z || 0) - (wrist.z || 0);
    const handSize = Math.sqrt(refDx * refDx + refDy * refDy + refDz * refDz);
    
    if (handSize < 0.001) return 0;
    
    // Fingertips and their corresponding base joints
    const fingers = [
        { tip: landmarks[4], base: landmarks[2] },   // Thumb
        { tip: landmarks[8], base: landmarks[5] },   // Index
        { tip: landmarks[12], base: landmarks[9] },  // Middle
        { tip: landmarks[16], base: landmarks[13] }, // Ring
        { tip: landmarks[20], base: landmarks[17] }  // Pinky
    ];
    
    let totalRatio = 0;
    for (const finger of fingers) {
        const dx = finger.tip.x - finger.base.x;
        const dy = finger.tip.y - finger.base.y;
        const dz = (finger.tip.z || 0) - (finger.base.z || 0);
        const fingerLength = Math.sqrt(dx * dx + dy * dy + dz * dz);
        totalRatio += fingerLength / handSize;
    }
    
    const avgRatio = totalRatio / fingers.length;
    
    const minRatio = 0.45;
    const maxRatio = 0.85;
    
    const normalized = (avgRatio - minRatio) / (maxRatio - minRatio);
    return Math.max(0, Math.min(1, normalized));
}

/**
 * Calculate hand rotation as a quaternion
 */
function calculateHandRotation(landmarks) {
    if (typeof THREE === 'undefined') return null;
    
    const wrist = new THREE.Vector3(
        landmarks[0].x - 0.5,
        -(landmarks[0].y - 0.5),
        landmarks[0].z || 0
    );
    
    const indexMCP = new THREE.Vector3(
        landmarks[5].x - 0.5,
        -(landmarks[5].y - 0.5),
        landmarks[5].z || 0
    );
    
    const pinkyMCP = new THREE.Vector3(
        landmarks[17].x - 0.5,
        -(landmarks[17].y - 0.5),
        landmarks[17].z || 0
    );
    
    const middleMCP = new THREE.Vector3(
        landmarks[9].x - 0.5,
        -(landmarks[9].y - 0.5),
        landmarks[9].z || 0
    );
    
    // Hand "up" direction (wrist to middle finger)
    const handUp = new THREE.Vector3().subVectors(middleMCP, wrist).normalize();
    
    // Hand "right" direction (pinky to index - reversed for correct visual roll)
    const handRight = new THREE.Vector3().subVectors(indexMCP, pinkyMCP).normalize();
    
    // Hand "forward" direction (palm normal)
    const handForward = new THREE.Vector3().crossVectors(handRight, handUp).normalize();
    
    // Recalculate right to ensure orthogonality
    handRight.crossVectors(handUp, handForward).normalize();
    
    // Create rotation matrix from basis vectors
    const rotMatrix = new THREE.Matrix4();
    rotMatrix.makeBasis(handRight, handUp, handForward);
    
    // Convert to quaternion
    const quaternion = new THREE.Quaternion();
    quaternion.setFromRotationMatrix(rotMatrix);
    
    return quaternion;
}

/**
 * Update smoothed values - call this in animation loop
 */
function updateHandTracking() {
    // Smooth openness
    _smoothedOpenness += (_targetHandOpenness - _smoothedOpenness) * SMOOTHING;
    _handOpenness = _smoothedOpenness;
    
    // Smooth rotation
    if (_isHandDetected && _targetHandRotation && _smoothedHandRotation) {
        _smoothedHandRotation.slerp(_targetHandRotation, SMOOTHING * 1.5);
        _handRotation.copy(_smoothedHandRotation);
    }
}

/**
 * Set callback for hand updates
 */
function setOnHandUpdate(callback) {
    _onHandUpdate = callback;
}

/**
 * Set callback for when hand is lost
 */
function setOnHandLost(callback) {
    _onHandLost = callback;
}

// Getters
function getHandOpenness() { return _handOpenness; }
function getTargetOpenness() { return _targetHandOpenness; }
function getHandRotation() { return _handRotation; }
function isHandDetected() { return _isHandDetected; }
function getLandmarks() { return _landmarks; }
function getHandedness() { return _handedness; }
function getIsMobile() { return isMobile; }
function getShowCameraFeed() { return _showCameraFeed; }
function toggleCameraFeed() { 
    _showCameraFeed = !_showCameraFeed; 
    return _showCameraFeed;
}

// Export as global HandTracking object
window.HandTracking = {
    init: initHandTracking,
    update: updateHandTracking,
    getOpenness: getHandOpenness,
    getTargetOpenness: getTargetOpenness,
    getRotation: getHandRotation,
    isDetected: isHandDetected,
    getLandmarks: getLandmarks,
    getHandedness: getHandedness,
    isMobile: getIsMobile,
    setOnHandUpdate: setOnHandUpdate,
    setOnHandLost: setOnHandLost,
    toggleCameraFeed: toggleCameraFeed,
    getShowCameraFeed: getShowCameraFeed
};

