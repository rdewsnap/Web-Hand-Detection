/**
 * Main Application
 * Handles menu, demo switching, and hand tracking initialization
 */

(function() {
    // Available demos
    const demos = {
        'cosmic-prism': CosmicPrismDemo,
        'airplane': AirplaneDemo
    };

    // Current state
    let currentDemo = null;
    let handTrackingInitialized = false;

    // DOM elements
    const menuScreen = document.getElementById('menu-screen');
    const demoContainer = document.getElementById('demo-container');
    const canvasContainer = document.getElementById('canvas-container');
    const loadingOverlay = document.getElementById('loading-overlay');
    const loadingText = document.querySelector('.loader p');
    const backButton = document.getElementById('back-button');
    const webcamPreview = document.getElementById('webcam-preview');
    const opennessIndicator = document.getElementById('openness-indicator');
    const instructions = document.getElementById('instructions');
    const instructionsText = document.getElementById('instructions-text');
    const instructionsSub = document.getElementById('instructions-sub');
    const indicatorFill = document.querySelector('.indicator-fill');

    // Demo cards
    const demoCards = document.querySelectorAll('.demo-card');

    /**
     * Initialize the application
     */
    async function init() {
        // Setup demo card click handlers
        demoCards.forEach(card => {
            card.addEventListener('click', () => {
                const demoId = card.dataset.demo;
                launchDemo(demoId);
            });
        });

        // Setup back button
        backButton.addEventListener('click', returnToMenu);

        // Setup keyboard shortcut
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && currentDemo) {
                returnToMenu();
            }
        });
    }

    /**
     * Initialize hand tracking (only once)
     */
    async function initializeHandTracking() {
        if (handTrackingInitialized) return;

        const webcamVideo = document.getElementById('webcam');
        const previewCanvas = document.getElementById('preview-canvas');

        await HandTracking.init(webcamVideo, previewCanvas);
        handTrackingInitialized = true;

        // Setup UI update callback
        HandTracking.setOnHandUpdate((data) => {
            if (indicatorFill) {
                indicatorFill.style.height = `${data.openness * 100}%`;
            }
            if (instructions) {
                instructions.style.opacity = '0.3';
            }
        });

        HandTracking.setOnHandLost(() => {
            if (instructions) {
                instructions.style.opacity = '0.8';
            }
        });
    }

    /**
     * Launch a demo
     */
    async function launchDemo(demoId) {
        const Demo = demos[demoId];
        if (!Demo) {
            console.error('Unknown demo:', demoId);
            return;
        }

        // Show loading
        loadingOverlay.classList.remove('hidden');
        loadingText.textContent = 'Loading demo...';

        try {
            // Initialize hand tracking if needed
            if (!handTrackingInitialized) {
                loadingText.textContent = 'Initializing hand detection...';
                await initializeHandTracking();
            }

            // Hide menu, show demo container
            menuScreen.classList.add('hidden');
            demoContainer.classList.remove('hidden');
            backButton.classList.remove('hidden');
            webcamPreview.classList.remove('hidden');
            opennessIndicator.classList.remove('hidden');
            instructions.classList.remove('hidden');

            // Update instructions based on demo
            updateInstructions(demoId);

            // Initialize the demo
            currentDemo = Demo;
            Demo.init(canvasContainer);

            // Hide loading
            loadingOverlay.classList.add('hidden');

        } catch (error) {
            console.error('Failed to launch demo:', error);
            loadingText.textContent = 'Failed to initialize. Please allow camera access.';
            
            // Show retry option
            setTimeout(() => {
                returnToMenu();
            }, 3000);
        }
    }

    /**
     * Return to the menu
     */
    function returnToMenu() {
        // Destroy current demo
        if (currentDemo) {
            currentDemo.destroy();
            currentDemo = null;
        }

        // Clear canvas container
        canvasContainer.innerHTML = '';

        // Show menu, hide demo elements
        menuScreen.classList.remove('hidden');
        demoContainer.classList.add('hidden');
        backButton.classList.add('hidden');
        webcamPreview.classList.add('hidden');
        opennessIndicator.classList.add('hidden');
        instructions.classList.add('hidden');
        loadingOverlay.classList.add('hidden');
    }

    /**
     * Update instruction text based on demo
     */
    function updateInstructions(demoId) {
        switch (demoId) {
            case 'cosmic-prism':
                instructionsText.textContent = 'Show your hand to the camera';
                instructionsSub.textContent = 'Open/close your hand to control the explosion';
                break;
            case 'airplane':
                instructionsText.textContent = 'Hold palm facing camera';
                instructionsSub.textContent = 'Tilt hand to steer the airplane';
                break;
            default:
                instructionsText.textContent = 'Show your hand to the camera';
                instructionsSub.textContent = '';
        }
    }

    // Start the app
    init();
})();

