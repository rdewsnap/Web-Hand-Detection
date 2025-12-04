# Hand Detection Demos

Interactive WebGL demos controlled by hand gestures using MediaPipe hand tracking.

## Demos

### Cosmic Prism
A gem-like truncated octahedron that shatters into cosmic particles based on hand openness.
- **Control**: Open/close your fist to control the explosion
- **Rotation**: Tilt your hand to rotate the exploded debris field

### Flight Control
Pilot a low-poly airplane through a neon terrain using hand orientation.
- **Control**: Hold palm facing camera for level flight
- **Steering**: Tilt hand left/right to roll, up/down to pitch

### Hand Chess
Play chess against a low-poly elf opponent using grab gestures.
- **Control**: Close fist to grab pieces, open hand to drop
- **Difficulty**: Select 1-10 before starting (affects AI search depth)
- **AI**: Minimax with alpha-beta pruning

## Features

- **Real-time Hand Tracking** - MediaPipe Hands for accurate gesture detection
- **Distance Independent** - Works consistently regardless of hand distance from camera
- **Shared Hand Module** - Reusable hand tracking for all demos
- **Mobile Support** - Responsive design with performance optimizations
- **Cosmic Aesthetic** - Neon colors, particle effects, and ambient animations

## Running Locally

No build step required - just serve the files:

```bash
# Using Python
python3 -m http.server 8080

# Using Node.js
npx serve

# Using PHP
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.

## Project Structure

```
├── index.html              # Main HTML with menu
├── styles.css              # All styling
├── js/
│   ├── main.js             # Menu and demo switching
│   ├── handTracking.js     # Shared hand detection module
│   └── demos/
│       ├── cosmicPrism.js  # Exploding prism demo
│       ├── airplane.js     # Flight control demo
│       └── chess.js        # Hand chess demo
└── README.md
```

## Tech Stack

- **Three.js** (r134) - 3D rendering, shaders, particle systems
- **MediaPipe Hands** - ML-powered hand landmark detection
- **Vanilla JS** - No framework dependencies

## Hand Tracking API

The shared `HandTracking` module exposes:

```javascript
HandTracking.init(videoElement, previewCanvas)  // Initialize tracking
HandTracking.update()                            // Call in animation loop
HandTracking.getOpenness()                       // 0-1 (fist to open)
HandTracking.getRotation()                       // THREE.Quaternion
HandTracking.isDetected()                        // Boolean
HandTracking.isMobile()                          // Boolean
```

## Adding New Demos

1. Create `js/demos/yourDemo.js`
2. Implement `init(container)` and `destroy()` methods
3. Register in `js/main.js` demos object
4. Add a card in `index.html`

## Controls Reference

| Demo | Gesture | Action |
|------|---------|--------|
| Cosmic Prism | Closed fist | Assembled shape |
| Cosmic Prism | Open hand | Full explosion |
| Cosmic Prism | Hand tilt | Rotate debris |
| Flight Control | Palm forward | Level flight |
| Flight Control | Tilt left/right | Bank turn |
| Flight Control | Tilt up/down | Climb/dive |
| Hand Chess | Closed fist over piece | Grab piece |
| Hand Chess | Open hand | Drop piece |
| Hand Chess | Move hand | Move grabbed piece |

## Browser Support

- Chrome 80+ ✓
- Edge 80+ ✓
- Firefox 75+ ✓
- Safari 14+ ✓

## License

MIT
