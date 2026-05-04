
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Settings, GestureState, Point } from './types';
import { detectGesture } from './utils/handLogic';
import ControlPanel from './components/ControlPanel';

// Load MediaPipe from CDN
declare var Hands: any;
declare var Camera: any;

const App: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null); 
  const drawRef = useRef<HTMLCanvasElement>(null);   
  const [settings, setSettings] = useState<Settings>({
    markerColor: '#2563eb',
    brushSize: 5,
    eraserSize: 60,
    opacity: 1.0,
    whiteboardBackground: false,
  });
  const [gesture, setGesture] = useState<GestureState>(GestureState.IDLE);
  const [fps, setFps] = useState(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Drag and Drop state
  const dragPieces = useRef<{ [key: string]: { data: ImageData, width: number, height: number } | null }>({ Left: null, Right: null });
  const DRAG_SIZE = 150;

  // Undo / Redo History
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef<number>(-1);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  // Per-hand state tracking for smooth, multi-hand drawing
  const prevPoints = useRef<{ [key: string]: Point | null }>({ Left: null, Right: null });
  const lastMidPoints = useRef<{ [key: string]: Point | null }>({ Left: null, Right: null });
  const smoothedPoints = useRef<{ [key: string]: Point | null }>({ Left: null, Right: null });
  const isCurrentlyDrawing = useRef<{ [key: string]: boolean }>({ Left: false, Right: false });
  
  const lastTimeRef = useRef<number>(performance.now());
  const framesRef = useRef<number>(0);
  const lastScreenshotTimeRef = useRef<number>(0);

  // EMA smoothing factor (0 to 1). Higher is more responsive (less lag), lower is smoother.
  const SMOOTHING_FACTOR = 0.8;

  const saveToHistory = useCallback(() => {
    const canvas = drawRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }
    
    historyRef.current.push(imageData);
    if (historyRef.current.length > 30) {
      historyRef.current.shift();
    } else {
      historyIndexRef.current++;
    }

    setHistoryState({
      canUndo: historyIndexRef.current > 0,
      canRedo: false
    });
  }, []);

  const undo = useCallback(() => {
    if (historyIndexRef.current > 0) {
      historyIndexRef.current--;
      const canvas = drawRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
      }
      setHistoryState({
        canUndo: historyIndexRef.current > 0,
        canRedo: historyIndexRef.current < historyRef.current.length - 1
      });
    }
  }, []);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const canvas = drawRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        ctx.putImageData(historyRef.current[historyIndexRef.current], 0, 0);
      }
      setHistoryState({
        canUndo: true,
        canRedo: historyIndexRef.current < historyRef.current.length - 1
      });
    }
  }, []);

  const clearBoard = useCallback(() => {
    const ctx = drawRef.current?.getContext('2d');
    if (ctx && drawRef.current) {
      ctx.clearRect(0, 0, drawRef.current.width, drawRef.current.height);
      saveToHistory();
    }
  }, [saveToHistory]);

  const triggerScreenshot = useCallback(() => {
    const now = Date.now();
    if (now - lastScreenshotTimeRef.current < 2000) return; // 2s cooldown
    lastScreenshotTimeRef.current = now;

    const video = videoRef.current;
    const drawCanvas = drawRef.current;
    if (!video || !drawCanvas) return;

    // AUDIO FEEDBACK: Synthesized camera shutter sound
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.1);
      
      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
      
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.1);
    } catch (e) {
      console.log('Audio feedback failed', e);
    }

    // Flash & Shutter effect
    setIsCapturing(true);
    setTimeout(() => setIsCapturing(false), 500);
    setTimeout(() => {
      setShowSavedToast(true);
      setTimeout(() => setShowSavedToast(false), 3000);
    }, 400);

    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = drawCanvas.width;
    captureCanvas.height = drawCanvas.height;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;

    // The UI handles mirroring via CSS, so we need to replicate that
    ctx.translate(captureCanvas.width, 0);
    ctx.scale(-1, 1);

    // Capture current frame and board
    ctx.drawImage(video, 0, 0, captureCanvas.width, captureCanvas.height);
    ctx.drawImage(drawCanvas, 0, 0);

    // Automatic download logic
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
    const rand = Math.floor(Math.random() * 1000);
    link.download = `whiteboard-capture-${timestamp}-${rand}.png`;
    link.href = captureCanvas.toDataURL('image/png', 1.0);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }, []);

  // Keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // PrintScreen usually isn't capturable in many browsers, so we add Alt+S / Cmd+S as well
      if (e.key === 'PrintScreen' || (e.altKey && e.key === 's')) {
        e.preventDefault();
        triggerScreenshot();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [triggerScreenshot]);

  const [cameraError, setCameraError] = useState<string | null>(null);
  const [initRetry, setInitRetry] = useState(0);

  useEffect(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const drawCanvas = drawRef.current;
    if (!video || !canvas || !drawCanvas) return;

    const ctx = canvas.getContext('2d');
    const dctx = drawCanvas.getContext('2d');
    if (!ctx || !dctx) return;

    // Use a ref to track initialization state to avoid multiple setups
    let handsInstance: any = null;
    let cameraInstance: any = null;
    let isDestroyed = false;

    // Load External Scripts for MediaPipe with verification
    const loadScript = (src: string, globalName: string): Promise<void> => {
      return new Promise((resolve, reject) => {
        if ((window as any)[globalName]) {
          resolve();
          return;
        }

        const script = document.createElement('script');
        script.src = src;
        script.async = true;
        script.crossOrigin = "anonymous";
        
        const timeout = setTimeout(() => {
          reject(new Error(`Timeout loading ${globalName} from ${src}`));
        }, 10000);

        script.onload = () => {
          clearTimeout(timeout);
          // Wait a tiny bit for the global to be attached
          const checkGlobal = setInterval(() => {
            if ((window as any)[globalName]) {
              clearInterval(checkGlobal);
              resolve();
            }
          }, 50);
          
          // Max check 2 seconds
          setTimeout(() => {
            clearInterval(checkGlobal);
            if (!(window as any)[globalName]) {
               reject(new Error(`${globalName} failed to initialize from script`));
            }
          }, 2000);
        };

        script.onerror = () => {
          clearTimeout(timeout);
          reject(new Error(`Failed to load script: ${src}`));
        };

        document.head.appendChild(script);
      });
    };

    const runInit = async () => {
      try {
        await Promise.all([
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js", "Hands"),
          loadScript("https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js", "Camera")
        ]);

        if (isDestroyed) return;

        const onResults = (results: any) => {
          if (isDestroyed) return;
          // FPS Calculation
          framesRef.current++;
          const now = performance.now();
          if (now - lastTimeRef.current > 1000) {
            setFps(Math.round((framesRef.current * 1000) / (now - lastTimeRef.current)));
            framesRef.current = 0;
            lastTimeRef.current = now;
          }

          // Sync canvas dimensions and initial history save
          if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            drawCanvas.width = video.videoWidth;
            drawCanvas.height = video.videoHeight;
            
            if (historyRef.current.length === 0) {
              saveToHistory();
            }
          }

          ctx.clearRect(0, 0, canvas.width, canvas.height);
          const activeHandLabels = new Set<string>();
          const currentHandGestures: {[key: string]: GestureState} = {};

          if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
            results.multiHandLandmarks.forEach((landmarks: any, index: number) => {
              const handedness = results.multiHandedness[index];
              const label = handedness.label;
              activeHandLabels.add(label);

              const state = detectGesture(landmarks);
              currentHandGestures[label] = state;
              
              if (state !== GestureState.IDLE) {
                setGesture(state);
              }
              const wasDrawing = isCurrentlyDrawing.current[label];
              const isDrawing = state === GestureState.MARKER || state === GestureState.ERASER || state === GestureState.PINCH;
              
              if (wasDrawing && !isDrawing) {
                saveToHistory();
              }
              isCurrentlyDrawing.current[label] = isDrawing;
              const indexTip = landmarks[8];
              const middleTip = landmarks[12];
              
              let rawX = indexTip.x * canvas.width;
              let rawY = indexTip.y * canvas.height;

              if (state === GestureState.ERASER) {
                const palm = landmarks[9];
                rawX = palm.x * canvas.width;
                rawY = palm.y * canvas.height;
              }
              let smoothed = smoothedPoints.current[label];
              if (!smoothed) {
                smoothed = { x: rawX, y: rawY };
              } else {
                smoothed.x = smoothed.x + (rawX - smoothed.x) * SMOOTHING_FACTOR;
                smoothed.y = smoothed.y + (rawY - smoothed.y) * SMOOTHING_FACTOR;
              }
              smoothedPoints.current[label] = smoothed;

              const currentPoint = { ...smoothed };
              
              if (state === GestureState.MARKER) {
                const prev = prevPoints.current[label];
                const lastMid = lastMidPoints.current[label];

                if (prev) {
                  const midPoint = {
                    x: (prev.x + currentPoint.x) / 2,
                    y: (prev.y + currentPoint.y) / 2
                  };

                  dctx.beginPath();
                  dctx.lineCap = 'round';
                  dctx.lineJoin = 'round';
                  dctx.globalCompositeOperation = 'source-over';
                  
                  const currentSettings = settingsRef.current;
                  
                  dctx.strokeStyle = currentSettings.markerColor;
                  dctx.lineWidth = currentSettings.brushSize;
                  dctx.globalAlpha = currentSettings.opacity;

                  if (lastMid) {
                    dctx.moveTo(lastMid.x, lastMid.y);
                    dctx.quadraticCurveTo(prev.x, prev.y, midPoint.x, midPoint.y);
                    dctx.stroke();
                  } else {
                    dctx.moveTo(prev.x, prev.y);
                    dctx.lineTo(midPoint.x, midPoint.y);
                    dctx.stroke();
                  }
                  dctx.globalAlpha = 1.0; // Reset for safety
                  lastMidPoints.current[label] = midPoint;
                }
                prevPoints.current[label] = currentPoint;
              } else if (state === GestureState.PINCH) {
                const piece = dragPieces.current[label];
                if (!piece) {
                  // Initial pick up
                  const x = Math.max(0, Math.min(drawCanvas.width - DRAG_SIZE, currentPoint.x - DRAG_SIZE / 2));
                  const y = Math.max(0, Math.min(drawCanvas.height - DRAG_SIZE, currentPoint.y - DRAG_SIZE / 2));
                  
                  const data = dctx.getImageData(x, y, DRAG_SIZE, DRAG_SIZE);
                  dragPieces.current[label] = { data, width: DRAG_SIZE, height: DRAG_SIZE };
                  
                  // Clear the area on main canvas
                  dctx.clearRect(x, y, DRAG_SIZE, DRAG_SIZE);
                  saveToHistory();
                }
                // While pinching, we just let the feedback loop handle drawing it at currentPoint
                prevPoints.current[label] = null;
                lastMidPoints.current[label] = null;
              } else if (state === GestureState.ERASER) {
                const currentSettings = settingsRef.current;
                const eWidth = currentSettings.eraserSize * 0.7;
                const eHeight = currentSettings.eraserSize * 1.2;
                dctx.save();
                dctx.globalCompositeOperation = 'destination-out';
                dctx.fillStyle = 'white';
                dctx.fillRect(currentPoint.x - eWidth / 2, currentPoint.y - eHeight / 2, eWidth, eHeight);
                dctx.restore();
                prevPoints.current[label] = null;
                lastMidPoints.current[label] = null;
              } else {
                prevPoints.current[label] = null;
                lastMidPoints.current[label] = null;
              }
              
              if (state === GestureState.ERASER) {
                const currentSettings = settingsRef.current;
                const eWidth = currentSettings.eraserSize * 0.7;
                const eHeight = currentSettings.eraserSize * 1.2;
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 2;
                ctx.strokeRect(currentPoint.x - eWidth / 2, currentPoint.y - eHeight / 2, eWidth, eHeight);
                ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
                ctx.fillRect(currentPoint.x - eWidth / 2, currentPoint.y - eHeight / 2, eWidth, eHeight);
              } else {
                const currentSettings = settingsRef.current;
                ctx.beginPath();
                ctx.arc(currentPoint.x, currentPoint.y, state === GestureState.IDLE ? 6 : currentSettings.brushSize, 0, Math.PI * 2);
                ctx.strokeStyle = 'white';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                
                ctx.fillStyle = state === GestureState.MARKER ? currentSettings.markerColor : 'rgba(255, 255, 255, 0.3)';
                ctx.globalAlpha = state === GestureState.MARKER ? currentSettings.opacity : 1.0;
                ctx.fill();
                ctx.globalAlpha = 1.0;
                
                ctx.fillStyle = 'white';
                ctx.font = 'bold 10px sans-serif';
                ctx.textAlign = 'center';
                if (state !== GestureState.IDLE) {
                    ctx.fillText(state, currentPoint.x, currentPoint.y - 20);
                }
              }
            });
          }
          ['Left', 'Right'].forEach(side => {
            const activeState = currentHandGestures[side];

            // Handle Drop / Release of drag piece
            if (activeState !== GestureState.PINCH && dragPieces.current[side]) {
              const piece = dragPieces.current[side]!;
              const pos = smoothedPoints.current[side];
              if (pos) {
                // Draw the piece back to the main canvas
                dctx.putImageData(piece.data, pos.x - piece.width / 2, pos.y - piece.height / 2);
                saveToHistory();
              }
              dragPieces.current[side] = null;
            }

            if (!activeHandLabels.has(side)) {
              if (isCurrentlyDrawing.current[side]) {
                saveToHistory();
                isCurrentlyDrawing.current[side] = false;
              }
              prevPoints.current[side] = null;
              lastMidPoints.current[side] = null;
              smoothedPoints.current[side] = null;
            }
          });

          if (activeHandLabels.size === 0) {
            setGesture(GestureState.IDLE);
          }

          // Draw Drag Pieces on feedback layer
          ['Left', 'Right'].forEach(side => {
            const piece = dragPieces.current[side];
            const pos = smoothedPoints.current[side];
            if (piece && pos) {
              ctx.putImageData(piece.data, pos.x - piece.width / 2, pos.y - piece.height / 2);
              
              // Visual selection indicator
              ctx.strokeStyle = '#3b82f6';
              ctx.lineWidth = 3;
              ctx.setLineDash([5, 5]);
              ctx.strokeRect(pos.x - piece.width / 2 - 2, pos.y - piece.height / 2 - 2, piece.width + 4, piece.height + 4);
              ctx.setLineDash([]);
              
              ctx.fillStyle = '#3b82f6';
              ctx.beginPath();
              ctx.arc(pos.x, pos.y, 4, 0, Math.PI * 2);
              ctx.fill();
            }
          });

          // Trigger Multi-Hand Screenshot Action
          if (currentHandGestures['Left'] === GestureState.SCREENSHOT && currentHandGestures['Right'] === GestureState.SCREENSHOT) {
            triggerScreenshot();
          }
        };

        const HandsClass = (window as any).Hands;
        const CameraClass = (window as any).Camera;

        if (!HandsClass || !CameraClass) {
          throw new Error("MediaPipe components (Hands/Camera) not found on window object.");
        }

        handsInstance = new HandsClass({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
        });

        handsInstance.setOptions({
          maxNumHands: 2,
          modelComplexity: 1,
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5
        });

        handsInstance.onResults(onResults);

        cameraInstance = new CameraClass(video, {
          onFrame: async () => {
            if (!isDestroyed && handsInstance) {
              await handsInstance.send({ image: video });
            }
          },
          width: 640,
          height: 480
        });

        await cameraInstance.start();
        setCameraError(null);
      } catch (err: any) {
        console.error("Initialization failed:", err);
        setCameraError(err.message || String(err));
      }
    };

    runInit();

    return () => {
      isDestroyed = true;
      if (cameraInstance) {
        cameraInstance.stop();
      }
      if (handsInstance) {
        handsInstance.close();
      }
    };
  }, [saveToHistory, initRetry]); // Added initRetry as dependency

  // Keep settings in a ref for the effect to access current values without re-triggering
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);


  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black flex items-center justify-center">
      <AnimatePresence>
        {showSavedToast && (
          <motion.div 
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="absolute top-24 left-1/2 -translate-x-1/2 z-[100] px-6 py-3 rounded-2xl glass-morphism border border-blue-500/30 text-white font-bold text-sm shadow-2xl shadow-blue-500/20 flex items-center gap-3"
          >
            <div className="w-6 h-6 bg-blue-500/20 rounded-full flex items-center justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
            </div>
            Screenshot Saved!
          </motion.div>
        )}
      </AnimatePresence>

      {/* Cinematic Flash & Shutter Effect for Screenshot */}
      <AnimatePresence>
        {isCapturing && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 0.8, 0] }}
              transition={{ duration: 0.15, times: [0, 0.4, 1] }}
              className="absolute inset-0 z-[190] bg-black pointer-events-none"
            />
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4, times: [0, 0.2, 1], ease: "easeOut" }}
              className="absolute inset-0 z-[200] bg-white pointer-events-none"
            />
          </>
        )}
      </AnimatePresence>

      {cameraError && (
        <div className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-xl p-6 text-center">
          <div className="max-w-md glass-morphism p-8 rounded-3xl border border-red-500/30 flex flex-col items-center gap-4">
            <div className="w-16 h-16 bg-red-100/10 rounded-full flex items-center justify-center text-red-500 mb-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-white">Camera Access Required</h2>
            <p className="text-gray-400 text-sm leading-relaxed">
              We couldn't access your camera. This app requires camera permissions to track your hand movements and allow drawing.
            </p>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-2 text-[10px] font-mono text-red-400 w-full overflow-auto max-h-24">
              Error: {cameraError}
            </div>
            {cameraError.includes('Permission denied') && (
              <p className="text-amber-400 text-[11px] bg-amber-400/10 px-3 py-2 rounded-lg border border-amber-400/20">
                Tip: If you're using an iframe, try opening the app in a <strong>new tab</strong> using the button in the top right of the preview.
              </p>
            )}
            <button 
              onClick={() => {
                setCameraError(null);
                setInitRetry(prev => prev + 1);
              }}
              className="mt-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
            >
              Try Again
            </button>
            <p className="text-[10px] text-gray-500 mt-2">
              Please ensure you've allowed camera permissions in your browser settings.
            </p>
          </div>
        </div>
      )}

      <video 
        ref={videoRef}
        className={`absolute inset-0 w-full h-full object-cover mirror transition-opacity duration-500 ${settings.whiteboardBackground ? 'opacity-0' : 'opacity-30 grayscale-[40%]'}`}
        playsInline
        muted
      />
      {settings.whiteboardBackground && (
        <div className="absolute inset-0 bg-white" />
      )}
      <canvas ref={drawRef} className="absolute inset-0 w-full h-full object-cover mirror z-10" />
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover mirror z-20 pointer-events-none" />

      <ControlPanel 
        settings={settings}
        setSettings={setSettings}
        onClear={clearBoard}
        onUndo={undo}
        onRedo={redo}
        canUndo={historyState.canUndo}
        canRedo={historyState.canRedo}
        currentGesture={gesture}
        fps={fps}
      />

      <div className="absolute bottom-6 left-6 z-30 flex flex-col gap-1 pointer-events-none">
        <div className={`px-4 py-1.5 rounded-full glass-morphism text-xs font-bold tracking-widest uppercase transition-all duration-300 ${gesture !== GestureState.IDLE ? 'opacity-100' : 'opacity-40'}`}>
          Mode: {gesture}
        </div>
      </div>

      {gesture === GestureState.IDLE && (
        <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 bg-black/40 backdrop-blur-md px-8 py-4 rounded-3xl border border-white/10 text-white animate-pulse text-sm text-center">
          👆 1 Finger: Drawing • 🖐 Palm: Erase <br/>
          🤏 Pinch: Drag & Move • 🖼️ Frames: Screenshot
        </div>
      )}
    </div>
  );
};

export default App;
