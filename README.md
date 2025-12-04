# Cosmic Prism - Hand-Controlled Explosion

An interactive WebGL visualization where a gem-like truncated octahedron shatters into cosmic particles based on your hand gestures. Control the explosion with your fist and rotate the debris by tilting your hand.

![Demo](https://img.shields.io/badge/demo-live-brightgreen)

## Features

- **Hand Tracking** - Real-time hand detection via MediaPipe Hands
- **Gesture Control** - Open/close your hand to control the explosion intensity
- **3D Rotation** - Tilt your hand to rotate exploded pieces around the center
- **Distance Independent** - Works consistently regardless of hand distance from camera
- **Truncated Octahedron** - Beautiful gem-like polyhedron with 14 faces (8 hexagons + 6 squares)
- **Collision Avoidance** - Fragments repel each other during explosion
- **Cosmic Aesthetic** - Deep space background, nebula effects, twinkling stars
- **Particle System** - 1200 glowing particles accompany the fragment explosion
- **Mobile Support** - Responsive design with reduced particle count for performance

## How to Use

1. Open the app in a browser (Chrome/Edge recommended)
2. Allow camera access when prompted
3. Show your hand to the camera
4. **Close fist** → Polyhedron assembles
5. **Open hand** → Polyhedron explodes into fragments
6. **Tilt/rotate hand** → Exploded pieces orbit around the center
7. **Pause anywhere** → Partially open hand freezes the explosion mid-burst

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

## Tech Stack

- **Three.js** (r134) - 3D rendering, custom shaders, particle systems
- **MediaPipe Hands** - ML-powered hand landmark detection
- **Vanilla JS** - No framework dependencies
- **CSS3** - Animations, gradients, responsive design

## File Structure

```
├── index.html    # Main HTML with CDN imports
├── styles.css    # Cosmic-themed styling
├── app.js        # All application logic
└── README.md
```

## Browser Support

- Chrome 80+ ✓
- Edge 80+ ✓
- Firefox 75+ ✓
- Safari 14+ ✓ (may require camera permission in settings)

## Controls Reference

| Gesture | Action |
|---------|--------|
| Closed fist | Assembled polyhedron |
| Open hand | Full explosion |
| Partial open | Frozen mid-explosion |
| Hand tilt | Rotate debris field |
| No hand | Ambient rotation |

## License

MIT
